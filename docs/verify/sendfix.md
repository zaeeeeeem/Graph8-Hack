# SENDFIX — making the first email actually send

Live-verified 2026-09-27, 10:17–10:40 PKT, org `org_f3f1e5df96e5`, base `https://be.graph8.com/api/v1`.
Recipient in every send: Zaeem (TEST_ALLOWLIST) only. PII masked below.

## TL;DR

| Path | Result | Latency |
|---|---|---|
| **Fallback: `POST /inbox/emails/compose`** (direct send from the connected Gmail) | **WORKS.** `status:"sent"`, visible in Gmail SENT | **1.5 s** API round-trip |
| graph8 sequencer (`POST /sequences` → PATCH schedule → `/run`) | **Still never sends**, even with every fixable cause fixed. Contact stays `queued`, no events | ∞ (> 10 min observed on fresh seqs) |

**Demo recipe: Usman launches the graph8 sequence as planned (for the Sequencer UI / tracking story), and sends
email 1 directly via `/inbox/emails/compose` through `setFirstTouchSender` right after launch.** Phone gets the
email within seconds. Implementation: `scripts/verify/sendfix-first-touch.ts` (fits the Usman seam, allowlist-guarded,
self-check passes).

## Root cause of VCORE §V3 (contact 1 never sent in 2+ h)

1. **Contact 1 ("Zaeem", used by every VCORE test sequence) has NO email at all.** `GET /contacts/1` shows
   `work_email:"***"` which looks like a withheld value, but `GET /lists/2/contacts` shows `work_email:null`, and
   after `POST /contacts/unlock-info {"contact_ids":[1]}` (1 credit) `GET /contacts/1` returns `work_email:null,
   personal_emails:null`. The sequencer has no address, so the contact sits `queued` forever with no error, no skip
   reason, no event. `routing-summary` shows `unknown_count:1` for it.
   - Zaeem's real email is on **contact 4** (`last_name:"(team)"`, company 1). `POST /contacts` with that email →
     `409 conflict {"status":"duplicate","contact_id":4,"matched_by":"CONTACT_WORK_EMAIL"}` (writes nothing and
     skips the `list_id` link). **Use contact 4 for every Zaeem email test.**
   - Gotcha for Hira/Bilal: `"***"` in `GET /contacts/{id}` means "withheld OR empty"; do not treat it as "has email".
     `GET /lists/{id}/contacts` shows the real `null`.
2. **Even with contact 4 (real email), the sequencer still does not dispatch.** This part is on graph8's side and
   can't be fixed from our end. Things checked on the fresh sequences (all fine or fixed):
   - mailbox 1: `connection_status:"active"`, `POST /inbox/emails/validate-mailbox` → `valid:true,
     credentials_valid:true`; owner matches the key principal (`/roles/me/permissions` user_id `715169c1…` =
     `/inbox/users` propelauth id whose `cb_team_members_id` is `28bf7540…`).
   - schedule `Demo 24/7` attached via PATCH (confirmed on GET), Asia/Karachi 00:00–23:59 all 7 days.
   - channel `{channel_id:1, GMAIL, mailbox email}` present; step `EMAIL`/`MANUAL_TEMPLATE`, `time_interval:0`,
     preview `will_send_as_shown:true, content_issues:[]`.
   - `/deliverability/safe-to-send` → `safe:true`.
   - inbox sync was `STOPPED`; started it (`POST /inbox/mailboxes/{email}/sync?provider=google_mailbox` → 202, now
     `RUNNING`). Needed anyway for reply detection (Zara). Didn't unblock the send.
   - `daily_limit` 40 → 50 (`PATCH /mailboxes/1`). Didn't change anything.
   - enrollment both ways: seq A = `POST /contacts` then `/run`; seq B = list-only, `/run` enrolls from
     `associated_list_id` (`contacts_affected:1`). Both stay `queued`.
   - `POST /sequences/{id}/sync` → `workflows_started:0, "No changes detected"`.
   
   Remaining red flags, all graph8-internal: `GET /mailboxes/fleet-health` → `effective_daily_capacity:0` for
   mailbox 1 (personal `manual_google` Gmail, no warmup, `warmup_status:null`);
   `GET /sequencer/channels/mailboxes?email=<mailbox>` → `mailboxes:[]` (the in-app picker offers **no** sending
   mailbox); `routing-summary.scanned_count:null` (the recipient ESP scan never ran); `GET /sequencer/stats` →
   `sequences:[]`; the Sequencer UI Contacts tab crashes (`TypeError: et.find is not a function`); Events tab:
   "No events found". **Most likely cause:** the V2 sequencer gives a personal, un-warmed Gmail zero cold-outbound
   capacity, so it never schedules the send. Fixing that means enabling warmup (sends to a warmup network) or buying
   a sending mailbox. Both are out of scope for today. Needs graph8 support.

## Working recipe — fallback first touch (use this in the demo)

```
POST /inbox/emails/validate-mailbox?mailbox=<sender email>        (optional preflight, sends nothing)
  → {"data":{"valid":true,"provider":"google_mailbox","is_active":true,"has_cronjob":true,"credentials_valid":true}}

POST /inbox/emails/compose
  {"to":["<allowlisted email>"], "from_mailbox":"<sender email>",
   "subject":"...", "content":"<p>HTML body</p>", "save_as_draft":false}
  → 200 {"data":{"success":true,"email_id":"1a0e14daad082b5e","draft_id":null,"status":"sent",
          "message":"Email sent successfully","from_mailbox":"…","to":["…"],"subject":"…","created_at":"…Z"}}
```

- `save_as_draft` **defaults to false = SEND**. Always pass it explicitly.
- `content` is HTML; `include_signature` defaults true.
- `email_id` is the Gmail message id (verified: the same id shows up as the thread id in the sender's Gmail SENT).
  Store it as `ref`.
- Unauthorised `from_mailbox` → 403 (the send is refused, never silently sent from a different mailbox).
- Replies: pass `reply_to_email_id` to thread a follow-up. `POST /inbox/emails/{email_id}/send` can only reply into
  an existing thread.
- Measured: **1.49 s** request→`sent` (`scripts/verify/sendfix-compose.sh`), landed in Gmail SENT at 05:19:18Z.

### Usman seam wiring (build branch)

`scripts/verify/sendfix-first-touch.ts` exports `makeFirstTouchSender(g8)` →
`(i: FirstTouchInput) => Promise<{ok, ref?, note?}>`:
1. refuses unless `lead.is_test_contact`;
2. reads the address from **graph8** (`GET /contacts/{g8ContactId}` → `work_email`/`personal_emails`), never from
   model output; refuses if missing (the contact-1 trap);
3. refuses unless `g8.isAllowlisted({email, g8ContactId})` (same guard as `enrollGuarded`);
4. `POST /inbox/emails/compose` from `i.mailbox.email`, plain text turned into `<p>` HTML; `ok` only if `status==="sent"`.

Coordinator: `setFirstTouchSender(makeFirstTouchSender(g8))` at server boot. Copy it into `server/src/lib/`, since I
don't own server files. Self-check: `server/node_modules/.bin/tsx scripts/verify/sendfix-first-touch.ts` → OK
(4 cases: guard block, no email, non-test lead, happy path).

**Double-send risk:** if graph8 ever does dispatch step 1 later, Zaeem gets email 1 twice. Usman already records the
direct send as step 1 for dedupe in *our* tracking, but graph8 won't know about it. Options: accept (test contact
only), or make graph8's step 1 a short "bump" with a delay. Recommended: accept for the demo.

## Sequencer recipe (for when graph8 fixes capacity), with fixed gotchas

1. `POST /lists {"title":"SENDFIX …"}` → `{id}` (201). Use a **dedicated** list, because `/run` enrolls the whole list.
2. `POST /lists/{id}/contacts {"contact_ids":[4],"conflict_resolution":"add_all"}` → `{"added":1}` (201).
   Contact must have a real `work_email` (check `GET /lists/{id}/contacts`, not `/contacts/{id}`).
3. `POST /sequences {name, user_email, finish_on_reply:true, associated_list_id, steps:[{step_order:1,
   step_type:"EMAIL", input_type:"MANUAL_TEMPLATE", time_interval:0, step_data:{subject, body}}],
   channels:[{channel_id:1, channel_type:"GMAIL", channel_value:<mailbox>}]}` → `{id, status:"drafted"}`.
4. `PATCH /sequences/{id} {"schedule_id": G8_DEMO_SCHEDULE_ID}` (ignored if you pass it at create).
5. `POST /sequences/{id}/run {}` → `{status:"live", contacts_affected:N}`. **Skip** `POST /sequences/{id}/contacts`;
   `/run` enrolls from the list anyway.
6. Poll `GET /sequences/{id}/contacts` (`state`), `GET /sequences/{id}/stats` (`counts`), and
   `GET /inbox/emails/by-sequence/{id}` for the sent email.

Scripts: `scripts/verify/sendfix-seq.sh <list> <contact> "<name>"` (create→schedule→contacts→run→poll).

## Objects created this run (all TEST, Zaeem only)

- list 5 `SENDFIX Zaeem only` (contact 4)
- seq A `98d09457-a436-46d6-a702-6934117222c1`: **paused** (contact 4 queued)
- seq B `de73c8b0-d803-48f1-a334-c306b3682b20`: **left live** to catch a late dispatch (contact 4 only; a late send
  can only reach Zaeem)
- mailbox 1: `daily_limit` 40→50; inbox sync STOPPED→RUNNING
- contact 1 unlocked (1 credit; confirmed it has no email)
- 1 real email sent via compose to Zaeem (`email_id 1a0e14daad082b5e`)
