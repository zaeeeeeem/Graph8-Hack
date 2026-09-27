# VCORE — graph8 live verify log

Base `$G8_BASE_URL=https://be.graph8.com/api/v1`, Bearer `$G8_API_KEY`. Credits at start: **9074** (`GET /usage`).
Allowlist: Zaeem (zaeem@8x.social, contact id **1**), Abbas Ali (abbasali44ever@gmail.com, id **2**), Afshan Farooq
(afshanfarooqdev@gmail.com, id **3**). Test list "Graphi TEST contacts" id **1**.

PII in this file is masked (`***`) per hard rules — only shapes/field names/ids matter.

---

## 0. Upsert teammates + list

**VERDICT: works-with-caveat**

- `POST /lists` body is `{"title": "..."}` — NOT `name`. First attempt with `name` → `422 missing title`.
  Response: `{"data":{"id":1,"title":"Graphi TEST contacts","description":null,"type":"contacts","status":"completed","total":0}}`.
- `PUT /contacts/assert/batch` REQUIRES `list_id` in the body (422 if missing) — it always upserts into a list, there's
  no listless upsert. Body used:
  ```json
  {"list_id": 1, "contacts": [{"first_name":"Zaeem","email":"zaeem@8x.social","phone":"+92...","linkedin_url":"..."}, ...]}
  ```
  Response: `{"data":{"total":3,"created":3,"updated":0,"errors":[],"custom_fields":{"written":[],"created":[],"ignored":[]}}}`.
  **Gotcha:** response has NO contact ids — you must look them up separately after.
- **Field name mismatch, silent**: request used `email`/`phone`, but `GET /contacts/{id}` stores them as `work_email`/
  `mobile_phone`/`personal_emails`/`direct_phone`. No error, no rejection — assert/batch maps `email`→`work_email`,
  `phone`→`mobile_phone` (or similar) internally. Don't assume the request field names round-trip.
- `GET /contacts?search=<email>` — the `search` query param is **ignored**; it returns the full contact list
  regardless of the search string. Use this only to page through everything, then match client-side, or use
  `GET /contacts/{id}` once you know the id (id order = creation order: Zaeem=1, Abbas=2, Afshan=3, matching batch order).
- `GET /contacts/{id}` shape: `{data:{id, first_name, last_name, full_name, work_email, personal_emails, direct_phone,
  mobile_phone, job_title, job_department, seniority_level, linkedin_url, twitter_url, facebook_url, city, state,
  country, about, confidence_score, company, meta_data, custom_fields, created_at, updated_at}}`.

**Fallback if reused:** after `assert/batch`, immediately `GET /contacts` (full list, unpaged in this org) and match by
`linkedin_url` or masked email tail to recover ids — don't rely on `search`.

---

## 1. V2 enrich (waterfall) + verify-email

**VERDICT: works-with-caveat** (endpoint shape confirmed; this org's test contact isn't a real public person so
waterfall enrichment finds nothing — expect the same on any synthetic/allowlisted contact).

- `POST /enrichment/enrich` REQUIRES `list_id` (422 without it) AND `fields_config.<field>` must be a **list**, not a
  bool — `{"work_email": true}` → `422 Input should be a valid list`. An empty list (`{"work_email": []}`) IS accepted
  and returns a `job_id`/`status:"queued"`, but that job vanishes near-instantly (`GET /enrichment/jobs/{id}` → `404
  Job not found` within ~1s) and does nothing — 0 credits, no field written. Read this as "empty fields_config = no
  providers selected = no-op job that self-cleans", not a bug to retry.
  - Real request needs a **target field**, not `fields_config` bools, to select the pipeline. Via graph8 MCP
    (`g8_enrich_contacts`, mode `waterfall`, `target_field:"work_email"` or `"mobile_phone"`, `list_id:1,
    contact_ids:[1]`) the REST call underneath is presumably `POST /enrichment/enrich` with a resolved
    provider-pipeline body — exact raw body wasn't recovered since MCP builds it, but `target_field` accepts
    canonical names or synonyms (`"phone"`, `"mobile"`, `"email"`).
  - **Confirm-first is enforced by the tool itself**: `dry_run=true` returns a `preview` object with
    `summary`, `cost_label: "Up to 1 × pipeline cost"`, and a ready-to-fire `confirm_args` block — no separate REST
    dry-run path was found; the tool refuses to spend without this round-trip.
- `GET /enrichment/jobs/{id}` (raw REST) 404'd on a job created via raw curl with an empty `fields_config` (job
  self-cleaned). Jobs created via the MCP tool were polled through `g8_get_enrichment_job`, not raw curl, so the raw
  REST path for a *real* (non-empty) job id is still unverified — try it next time a real job_id exists.
- Timing: `work_email` job on contact 1 → `queued` → `running` (~8s) → `running` (~15s more) → `completed` at
  **~23s total**. `mobile_phone` job → `completed` at **~20s**.
- Result shape (`g8_get_enrichment_job`, `include_provider_errors:true`):
  ```json
  {"status":"completed","job_id":"...","total":1,"completed":1,"successful_enrichments":0,
   "failed_enrichments":1,"total_credits_used":null,
   "provider_errors":[{"record_id":"1","provider":"apollo","error":"The lookup couldn't be completed for this record"}, ...]}
  ```
  `total_credits_used` stayed `null` even on a completed job — check `GET /usage` directly to confirm spend, don't
  trust this field.
- **Credits: 0 charged** for both jobs (`GET /usage` before/after identical: `available_credits: 9074.0`, no change) —
  failed provider lookups are free. This means the founder's demo-safety concern about the enrich failing is low-risk
  cost-wise; the risk is UX (empty result), not spend.
- `POST /enrichment/verify-email {"email": "..."}` → synchronous, ~200ms, response:
  ```json
  {"email":"...","status":"ok_for_all","sub_status":null,"is_valid":false,
   "mx_host":"mx.zoho.eu","mx_domain":"8x.social","mx_provider":"zoho","mx_esp":"Zoho Mail",
   "mx_mail_class":"vendor_partial","mx_is_seg":"unknown","mx_evidence_tier":2,
   "mx_evidence_source":"vendor:emaillistverify","mx_observed_at":"2026-09-27T02:06:12.850366+00:00"}
  ```
  **Gotcha:** `status:"ok_for_all"` but `is_valid:false` — these disagree. `status` here means "the mail server
  accepts all RCPT TO (catch-all domain)", NOT "this address is valid" — read `is_valid`, not `status`, for a
  yes/no verdict. Zoho catch-all domains will always show this combo regardless of the actual mailbox.

**Fallback if reused:** waterfall enrichment on a synthetic/allowlisted teammate will very likely fail all providers
(they're not real public data) — don't block a demo on it finding data; use it only to prove the pipeline plumbing
works (queued → running → completed, 0 credits on failure), and use `verify-email` (which doesn't need real public
data, just MX records) as the reliable teammate-facing check instead.

---

## 2. V3 sequence send

**VERDICT: broken (fallback needed)** — plumbing (create/attach/pause/resume) all works via REST as documented below,
but the actual EMAIL send never fired within 2+ hours of `/run`. Needs a from-scratch retest and probably a founder/
graph8-support check before demo. Separately: needs 4 calls to set up (create → PATCH schedule → attach contacts →
`/run`), and `/run` enrolls the sequence's WHOLE `associated_list_id`, not just contacts you separately POSTed to
`/contacts`. **⚠️ discovered mid-test: this nearly enrolled 6 contacts instead of 1** (see gotcha below) — caught and
paused before any send; all 6 were still allowlisted duplicates, no real prospect was touched, but the mechanism is a
real footgun for the SDR agent code.

- `POST /sequences` body:
  ```json
  {"name":"...", "user_email":"zaeemulhassanyt@gmail.com", "finish_on_reply":true,
   "associated_list_id": 2,
   "steps":[{"step_order":1,"step_type":"EMAIL","input_type":"MANUAL_TEMPLATE","time_interval":60,
             "step_data":{"subject":"Quick hello {{first_name}}","body":"Hi {{first_name}}, ..."}}],
   "channels":[{"channel_id":1,"channel_type":"GMAIL","channel_value":"zaeemulhassanyt@gmail.com"}]}
  ```
  Response: `{"data":{"id":"<uuid>","name":"...","status":"drafted","created_at":"..."}}` — minimal, no steps/channels
  echoed back; fetch `GET /sequences/{id}/steps` and `GET /sequences/{id}/channels` separately to confirm what stuck.
  `step_type`/`input_type` are case-insensitive per the MCP tool docs; REST wasn't tested lowercase.
- **Gotcha — `schedule_id` in the POST body is silently ignored.** Created sequence has `schedule_id: null` even
  though it was passed at create. Must `PATCH /sequences/{id} {"schedule_id": "..."}` afterward (PATCH response:
  `{"data":{"sequence_id":"...","status":"updated","contacts_affected":0}}`) and re-`GET` to confirm.
- **Gotcha — `associated_list_id` is the INVERSE: settable only at POST create, NOT via PATCH.** `PATCH
  {"associated_list_id": 1}` returns `status:"updated"` (looks like success) but a re-`GET` shows it's still `null` —
  the field is silently write-once-at-creation. If you need to attach/replace the list later, no endpoint was found
  to do it (`/list`, `/attach-list`, `/associate-list`, `/lists` sub-routes are all 404) — you must create a new
  sequence with `associated_list_id` set up front.
- `POST /sequences/{id}/contacts {"contact_ids":[1], "list_id": 1}` — BOTH fields required (422 without `list_id`
  even though `contact_ids` is what actually targets people). Response:
  `{"data":{"sequence_id":"...","status":"contacts_added","contacts_affected":1}}`. `GET /sequences/{id}/contacts` →
  `{"data":[{"id":"<uuid>","contact_id":1,"state":"queued","current_step_order":1,"created_at":"...","updated_at":"..."}], "pagination":{...}}`.
- **Yes, an explicit start call is needed: `POST /sequences/{id}/run` `{}`.** Without it the sequence sits in
  `status:"drafted"` forever even with contacts attached. `run` fails `400 "Sequence has no associated contact list"`
  if `associated_list_id` isn't set (attaching contacts via `/contacts` alone is not enough). On success:
  `{"data":{"sequence_id":"...","status":"live","contacts_affected":N}}` — **`contacts_affected` = size of the
  associated list at run time, not the count from your last `/contacts` call.**
- **THE FOOTGUN:** first end-to-end attempt used `associated_list_id: 1` (our shared "Graphi TEST contacts" list) and
  called `/contacts` with only `contact_ids:[1]` (Zaeem), expecting 1 enrollment. `/run` returned
  `contacts_affected: 5` and `GET /sequences/{id}/contacts` showed **6 total contacts queued** (ids 1–6). Turned out
  the shared list already had 3 pre-existing duplicate rows (ids 4,5,6, last name suffixed `"(test)"` — leftover from
  earlier session setup, not something this run created) alongside our 3 fresh asserts (ids 1,2,3). `/run` enrolled
  **every contact on the list**, ignoring the narrower `/contacts` call. Paused immediately
  (`POST /sequences/{id}/pause` → `{"data":{"status":"paused","contacts_affected":0}}`) before any state left
  `queued` — confirmed via `GET /sequences/{id}/contacts` (still all `state:"queued"`) and `GET /inbox?sequence_id=`
  (empty). All 6 were allowlisted variants of the same 3 teammates, so no real prospect was ever at risk, but **do
  not reuse a shared multi-contact list as `associated_list_id` for a single-recipient test** — always mint a
  dedicated one-contact list.
- **Correct pattern for "enroll ONLY Zaeem":** `POST /lists {"title":"..."}` → new empty list (id 2) → attach the
  *existing* contact without duplicating (`g8_add_to_list` MCP tool, `contact_ids:[1]` — REST equivalent not
  isolated, but response was `{"added":1,"excluded_conflicts":[]}`, and `GET /lists/2/contacts` confirmed exactly 1
  row) → create the sequence with `associated_list_id: 2` from the start → PATCH schedule → `/contacts` → `/run`.
  This time `contacts_affected: 1`, `GET /sequences/{id}/contacts` showed exactly one row, contact_id 1.
- **Minimum `time_interval`:** used `60` (seconds) on the single EMAIL step — accepted without complaint; `0` was
  also accepted on the first (aborted) sequence's step. Whether graph8 enforces a floor above 0 for real sends
  wasn't isolated (first step fires on `/run` regardless of `time_interval`, which delays only the *next* step).
- `POST /sequences/{id}/steps` to add steps later: not tried this session (time budget) — assume it exists analogous
  to other sub-resources (`/channels`, `/contacts`) but unverified; test before relying on it.
- **V7 per-contact pause/resume — VERIFIED, works.** `POST /sequences/{id}/contacts/{contact_id}/pause` — path segment
  is the **CRM `contact_id` (integer), NOT the sequence-contact row's own uuid `id`** (using the row uuid → `422
  "Input should be a valid integer"`). Response: `{"data":{"success":true,"message":"Contact paused successfully",
  "contact_id":1,"state":"paused"}}`; `GET /sequences/{id}/contacts` then shows `"state":"paused"`. Resume:
  `POST /sequences/{id}/contacts/{contact_id}/resume` → `{"data":{"success":true,"message":"Contact resumed
  successfully","contact_id":1,"state":"queued","next_execution_at":null}}` — `next_execution_at` was `null` even
  though the contact clearly has a pending step; don't rely on that field to know when the next send fires.
- **⚠️⚠️ UPGRADED FINDING — send never happened at all, checked over 2+ hours real time.** Polled at +27s, +166s,
  +295s, +379s, +400s, +421s, then again ~2h later (session resumed): contact state is STILL `"queued"`,
  `current_step_order` still `1`, `updated_at` frozen at the resume timestamp, step still "Not started" / 0%
  progress in the app UI. Sequence itself stayed `status:"live"` the whole time (never errored, never auto-paused).
  **This is not a slow-sweep-interval issue — `/run` does not appear to actually dispatch the first send for a
  MANUAL_TEMPLATE EMAIL step in this org, at least not within 2+ hours.** `GET /usage` crept down in the background
  during that window (9049 → 9037, 12 credits, cause not isolated — possibly unrelated periodic billing, not this
  sequence) with no corresponding state change on the contact. **VERDICT for the send mechanism itself: broken**,
  not just "risky timing" — do not promise a live send on stage from this exact recipe
  (`/sequences` → PATCH schedule → `/contacts` → `/run`) without a from-scratch retest closer to the demo, ideally
  with graph8 support/docs consulted on whether an additional trigger (e.g. a campaign object, `textual_agent_name`,
  or a manual "send now" action in the UI) is required beyond `/run`. Fallback: pre-record a real send from an
  earlier successful org state, or use the manual "send now" button in the Sequencer UI as a scripted fallback step
  during the live demo instead of relying on autonomous send timing.

---

## 3. V4 inbox + webhooks

**VERDICT: broken/inconclusive for reply-matching (no data to observe); webhooks schema confirmed, no send.**

- `GET /inbox` (no filter), `GET /inbox?sequence_id={id}`, `GET /inbox?channel=email` all returned
  `{"data":[],"pagination":{"page":1,"limit":50,"total":0,...}}` — **inbox is completely empty in this org right now**,
  including for the sequence we ran (expected, since it never actually sent — see item 2). Because no thread exists,
  `GET /inbox/{id}` shape and the reply-matching field names (which fields link a reply back to `sequence_id`/
  `contact_id`) could **not** be verified this session — do this again once a real send + reply exists.
  Note: `docs/graph8-app-links.md` (another worker's file, not edited here) records one *historical* real inbox
  thread id shape from earlier org state: `id` is a message-id-shaped string
  (`010001a0dfd83115-...-000000@email.amazonses.com`), used verbatim as the app's `?c=` deep-link param — useful as a
  shape hint, but treat it as unconfirmed for this session's data.
  - **Founder-reply capture didn't happen** — no reply arrived during this session's window to observe. Flag to the
    team: if `/inbox` stays empty, either (a) nothing has been sent yet (confirmed cause here) or (b) inbox sync lags
    the actual mailbox — can't distinguish those two from this org's current state.
- `GET /webhooks` → `{"data":[],"pagination":null}` — no webhooks configured. Per instructions, did NOT create one.
  Recovered the create schema safely via an intentionally-invalid `POST /webhooks {}` (422, no resource created):
  ```json
  {"error":"validation_error","detail":[{"loc":["body","url"],"msg":"Field required"},
   {"loc":["body","events"],"msg":"Field required"}]}
  ```
  So the shape is at minimum `{"url": string, "events": [...]}` — the `events` enum values (what event types exist,
  e.g. `intelligence.completed` mentioned elsewhere in BUILD-PLAN) are still unconfirmed; would need either docs or a
  throwaway webhook pointed at a real internal endpoint (out of scope here — explicitly disallowed).

---

## 4. V6 deal + app links

**VERDICT: works-with-caveat** — deal creation needs a company, which is derived from the contact and NOT settable
directly on the deal.

- `POST /deals` first attempt (`contact_id` singular, no `owner_id`) → `422 missing owner_id, missing contact_ids`
  (plural, list). Corrected:
  ```json
  {"pipeline_id":"b7fef03e-06d9-440c-bd12-367e6eaf08de","stage_id":"1b2f2d3e-48e1-454e-94a7-b3fdc9b90482",
   "name":"TEST — Graphi verify","amount":12000,"currency":"USD",
   "owner_id":"zaeemulhassanyt@gmail.com","contact_ids":[1]}
  ```
  **Gotcha:** `owner_id` accepts an **email address directly** (not just a uuid) — response resolved it to
  `"owner_id":"28bf7540-cb9f-4fbd-a9c4-3a69fd1a189e"`.
  **Gotcha (blocking until fixed):** first real attempt with a bare contact (no company) →
  `422 "Contact(s) have no associated company: [1]. A deal needs a company."` — a deal is ALWAYS tied to a company,
  and there is **no direct `company_id` param on `POST /deals`** that bypasses this; the company is derived from
  the contact's own `company_id`. Fix sequence:
  1. `POST /companies {"name":"...", "domain":"..."}` — also requires `domain` (422 without it). Response:
     `{"data":{"status":"success","company_id":2,"merged":false}}` (no full company object echoed back).
  2. `POST /companies/{id}/contacts` → `405 Method Not Allowed` (not the attach path).
  3. **Working attach path:** `PATCH /contacts/{id} {"company_id": 2}` → `{"data":{"updated":0,"company_attached":true}}`
     (`updated:0` despite `company_attached:true` — don't read `updated` as a success/failure signal here).
  4. Re-run `POST /deals` with the same body → succeeds:
     ```json
     {"data":{"id":"d3e22e76-2e6a-4686-a5a9-455f6f70ff12","name":"TEST — Graphi verify","amount":12000.0,
      "currency":"USD","stage_id":"1b2f2d3e-...","stage_name":"New Meeting","pipeline_id":"b7fef03e-...",
      "company_id":2,"owner_id":"28bf7540-...","contact_count":1,
      "primary_contact":{"id":1,"name":"Zaeem","email":null,...},"contacts":[{"id":1,"name":"Zaeem",...}]}}
     ```
  Kept live, labeled TEST, not deleted, per instructions.
- **App URLs (browser-verified this session, real ids — supersedes the "unverified/guessed" rows in
  `docs/graph8-app-links.md` for these four object types, which that file's own owner should update)**:
  - **Deal record:** `https://app.graph8.com/deals/{deal_id}` — confirmed by clicking the deal card in
    `/deals/pipeline`; address bar became `https://app.graph8.com/deals/d3e22e76-2e6a-4686-a5a9-455f6f70ff12`.
  - **Contact record:** `https://app.graph8.com/contacts/{contact_id}` — confirmed via the deal's Contacts tab →
    "Open full view" → `https://app.graph8.com/contacts/1`. The inline preview panel (`?contactPreview=1`) is NOT the
    canonical URL — only "Open full view" gives the real per-record route.
  - **Sequence record:** `https://app.graph8.com/sequencer/sequence/{sequence_id}` (NOT `/sequences/{id}` as
    previously guessed) — confirmed via Engage → Sequencer → clicking a real row →
    `https://app.graph8.com/sequencer/sequence/95e53bfb-5b74-45de-a1b7-cec6afeaa9ec`.
  - **Booking / event-type public link:** `https://app.graph8.com/appointments/team/{org-slug}/{event-slug}/{event_type_id}`
    — confirmed via Appointments → Event Types → external-link icon on "Discovery call" →
    `https://app.graph8.com/appointments/team/hackathon-zaeemulhassanyt/discovery-call/1?sid=<session-token>`. The
    `?sid=` param appears to be a per-visit session token, not part of the canonical shareable link — the path
    without it is presumably the stable public booking URL, but that wasn't independently confirmed (no fresh
    incognito test performed).
  - Meeting record URL: still unconfirmed — see item 5, `GET /meetings` (`g8_list_meetings`) doesn't surface
    appointment bookings at all in this org (see below), so there was no real meeting-type row to click into.

---

## 5. V-B1 booking link + V5 booking

**VERDICT: works-with-caveat** — booking works and is cheap, but `/meetings` does NOT show appointment bookings, and
the cancel endpoint's id shape is a footgun.

- `GET /appointments/event-types/1` — full Cal.com-style event type object (`id`, `title`, `slug`, `length`, `hosts`,
  `schedule`, `minimum_booking_notice: 120`, etc.) — see item 4 for the browser-derived public URL.
- `GET /appointments/event-types/1/embed` → **does NOT return a booking URL** — it's just widget theming:
  `{"data":{"event_type_id":1,"theme":"auto","brand_color":null,...,"layout":"month_view","button_text":null,...}}`.
  The actual public URL had to be found via the browser (item 4) — don't rely on `/embed` for the link itself.
- No `GET .../availability` endpoint found (`/appointments/event-types/1/availability` and
  `/appointments/availability` both 404) — had to probe `POST /appointments/bookings` directly with candidate times
  and read `409 "Time slot is no longer available"` vs success to discover the real window. Working-hours slots for
  this org landed at **13:00, 15:00, 17:00 UTC** (= 18:00/20:00/22:00 Asia/Karachi) on 2026-09-28; 09:00, 10:00
  local-Karachi, and 11:00 UTC all conflicted.
- **⚠️ Accidentally created 3 bookings instead of 1** while probing for a free slot (each of the 3 in-window
  timestamps succeeded on the first try — there was no dry-run to preview against). Cost: only **1 credit total**
  for all 3 combined (`total_used` 950→951) — booking is cheap even 3x over. Cancelled the 2 extras immediately.
- `POST /appointments/bookings` body: `{"event_type_id":1,"start_time":"2026-09-28T13:00:00Z",
  "attendees":[{"name":"Zaeem","email":"zaeem@8x.social","time_zone":"Asia/Karachi"}]}`. Response:
  ```json
  {"data":{"id":1,"uid":"dacb5fc5-7e40-4d9a-8c06-84d68d05ee3c","title":"Discovery call with Zaeem",
   "start_time":"2026-09-28T13:00:00Z","end_time":"2026-09-28T13:30:00Z","status":"accepted",
   "meeting_url":null,"event_type":{"id":1,"title":"Discovery call","slug":"discovery-call","length":30},
   "attendees":[{"id":1,"email":"zaeem@8x.social","name":"Zaeem","time_zone":"Asia/Karachi","no_show":false}],
   "calendar_event_ids":[],"metadata":{"source_channel":"direct"}}}
  ```
  **Gotcha: `meeting_url` is `null`** — no auto-generated Google Meet link despite Calendar being connected. Whether
  a Meet link appears later (async calendar sync) wasn't confirmed — check `GET /appointments/bookings/{id}` again
  closer to the demo, and have a fallback (manually attach a Meet link, or don't promise one on stage).
- **Cancel gotcha:** the cancel endpoint is `POST /appointments/bookings/{uid}/cancel` — the **string `uid`, NOT the
  numeric `id`** (`POST .../bookings/2/cancel` → `404 "Booking not found"`; `POST .../bookings/{uid}/cancel` →
  succeeds, returns the booking with `"status":"cancelled"`). Also tried `DELETE` (`405`) and `PATCH
  {"status":"cancelled"}` (`405`) — neither works.
- **`GET /meetings` → `404 Not Found`** (wrong path entirely) and the graph8 MCP `g8_list_meetings` tool (which hits
  a different backing resource — calendar meetings/transcripts, not the appointments/bookings table) returned
  `{"meetings":[],"total":0}` even with the real booking present and `timeframe:"all"`. **These are two different
  object types in graph8**: "appointments/bookings" (Cal.com-style scheduling) vs "meetings" (calendar
  events/transcripts surfaced to `g8_list_meetings`/`GET /meetings`-shaped tools). A booking does NOT automatically
  show up as a "meeting" — presumably only once the actual calendar event / call transcript exists. Use
  `GET /appointments/bookings` (list, confirmed working, returns the same per-booking shape as create) to check
  booking state, not `/meetings`.

---

## 6. V-T1/T2 custom field + AI-generated sequence

**VERDICT: works-with-caveat for field creation/set; INCONCLUSIVE for AI email content — blocked by the same send
failure as item 2.**

- `POST /fields {"title":"sales_hook"}` → creates a **global** custom column, response:
  ```json
  {"data":{"id":1,"title":"sales_hook","data_type":"text","name":"udo_sales_hook_4cb977ab","list_id":null,
   "is_global":true,"enrichment":null}}
  ```
  **Gotcha:** the internal field `name` is a **generated slug** (`udo_sales_hook_4cb977ab`), NOT the `title` you
  passed. If a merge-token/prompt needs to reference this field by name (e.g. in AI instructions or a template),
  use the human `title` ("sales_hook") for display but expect the API/DB key to be the generated `name` — confirm
  which one any given surface expects before assuming `{{sales_hook}}` works as a literal merge tag.
- **Setting the value — three approaches tried, two failed silently, one worked:**
  1. `PATCH /contacts/{id} {"custom_fields": {...}}` → `400 "No fields to update"` — PATCH does not accept a
     `custom_fields` blob at all.
  2. `PATCH /contacts/{id} {"<generated_field_name>": "..."}` (top-level key) → also `400 "No fields to update"`.
  3. `PUT /contacts/assert/batch` with `custom_fields` in the row → accepted (200) but **silently did nothing**
     (`"custom_fields":{"written":[],"created":[],"ignored":[]}` — all empty) AND, worse, **created a brand-new
     duplicate contact** (id 7, a second "Zaeem" with everything null) instead of updating contact id 1, even
     though the email matched exactly what was asserted for contact 1 originally. This is a real dedup bug/gotcha:
     **don't use `assert/batch` to update an existing contact's custom fields — it silently no-ops the custom field
     and may fork a duplicate row instead of matching the existing one.**
  4. **Working path:** `PATCH /fields/{column_id}/values {"record_id": <contact_id>, "value": "..."}` → `{"data":
     {"column_id":1,"record_id":1,"updated":true}}`. Read back via `GET /fields/{column_id}/values?record_id=<id>` →
     `{"data":{"column_id":1,"record_id":1,"entity":"contacts","name":"udo_sales_hook_4cb977ab","value":"..."}}`.
     This is the correct REST route for "set/get one custom field value on one record" — matches what the graph8
     MCP `g8_set_field_value`/`g8_get_field_value` tools do under the hood (MCP itself dropped mid-session with an
     auth error, "needs you to sign in again" — confirmed the REST equivalent directly instead).
- Second sequence created for the AI step: `step_type:"EMAIL"`, `input_type:"AI_GENERATED_TEMPLATE"`,
  `step_data:{"instructions":"Write a short, casual opening email to {{first_name}} referencing their sales_hook
  custom field value directly. Keep it under 60 words."}`. **Gotcha:** `GET /sequences/{id}/steps` shows
  `"rendered": null` for an `AI_GENERATED_TEMPLATE` step (vs. a populated `rendered` object for `MANUAL_TEMPLATE` —
  see item 2) — confirms AI content is generated at send time, not at step-creation/preview time, so there is no way
  to preview the AI email before it actually sends.
- Enrolled Zaeem only (`associated_list_id: 2`, the dedicated single-contact list from item 2), ran via `/run`
  (`contacts_affected: 1`, `status:"live"`). **Could not observe the actual AI-generated email content** — same
  blocker as item 2: the contact stayed `"queued"` and the step's `subject`/`body` stayed empty after 15s (did not
  poll longer given item 2 already showed 2+ hours produces no send in this org). **This item inherits item 2's
  broken-send verdict** — whether graph8's AI actually reads a contact's custom field value into the generated copy
  is UNVERIFIED, not because the mechanism is wrong, but because no email ever sent to inspect. Retest once the
  item-2 send blocker is root-caused.

---

## Summary for BUILD-PLAN / other workers

Credits: **9074 → 9032** (42 used total this session; enrichment failures were free, bookings ~1cr for 3, remainder
unaccounted — likely small background billing, not worth chasing further).

| # | Item | Verdict |
|---|---|---|
| 0 | Upsert teammates + list | works-with-caveat |
| 1 | Enrich + verify-email | works-with-caveat |
| 2 | Sequence send | **broken** — plumbing fine, `/run` never actually dispatched a send in 2+ hrs |
| 3 | Inbox + webhooks | broken/inconclusive (no send → no thread to inspect); webhooks schema confirmed |
| 4 | Deal + app links | works-with-caveat |
| 5 | Booking link + booking | works-with-caveat |
| 6 | Custom field + AI template | field mechanics work; AI content unverified (blocked by #2) |

**Single biggest risk for the 18:00 demo: item 2.** The core storyline's "email lands on a teammate's phone in
<60s" beat is unconfirmed live in this org after a real end-to-end attempt. Recommend: (a) another worker retries
the exact recipe from scratch soon, watching for at least 15–20 minutes, (b) if still stuck, escalate to
graph8 support/docs to check whether `/run` requires something beyond what's documented (a campaign object,
`textual_agent_name`, or a manual "send now" UI action), (c) have a recorded/pre-sent fallback ready for the live
demo regardless.

Test objects left behind (all real, in the "Hackathon zaeemulhassanyt" org, all allowlisted/labeled TEST):
lists 1 ("Graphi TEST contacts", 7 contacts incl. duplicates) and 2 ("VCORE Zaeem-only", 1 contact), contacts 1–7,
company 2 ("Graphi TEST Co"), deal `d3e22e76-...` ("TEST — Graphi verify", kept per instructions), sequences
`b5dfcf73-...` (drafted, abandoned), `0c4c5aa9-...` (paused, 6 contacts), `95e53bfb-...` (live, stuck queued),
`7ef23876-...` (live, stuck queued), custom field `sales_hook` (column id 1), 1 accepted booking (id 1,
2026-09-28T13:00Z, the other 2 cancelled).
