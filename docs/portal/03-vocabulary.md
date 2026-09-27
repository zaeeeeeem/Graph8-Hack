# Vocabulary and status system

One word per concept, one colour per state, used identically in badge, row, card, banner. Slack uses the
same words. Implement as a single `lib/vocab.ts` (label + semantic token + icon) and a `<StatusPill>`
that only accepts these values. Never hard-code a label in a component.

Canonical nouns: **team**, **agent** (by persona name; role/title as subtitle), **task** (never job/ticket/issue),
**report**, **decision** (UI word for an approval), **lead** (never contact/prospect in UI copy except the
`prospect` stage label), **sequence**, **meeting**, **deal**, **credits** (never tokens/cost/$ for credits).
The founder is **you**. graph8 is written `graph8` (lowercase g). Slack is `Slack`.

Semantic tokens (designer maps colours; keep exactly these 6): `neutral`, `active`, `attention`, `success`, `danger`, `muted`.

## 1. Agent status (`agents.status`)

| value | label | token | behaviour |
|---|---|---|---|
| `idle` | Idle | neutral | — |
| `working` | Working | active | pulse animation |
| `waiting_on_you` | Waiting on you | attention | badge on card + counts in banner |
| `paused` | Paused · {pause_reason} | danger | global banner; `budget` → "over budget", `manual` → "paused in Slack", `error` → "error" |
| `error` | Error | danger | — |

## 2. Task status (`tasks.status`) and blocked owner (`tasks.blocked_on`)

| value | label | token |
|---|---|---|
| `todo` | To do | neutral |
| `in_progress` | In progress | active |
| `blocked` | Blocked · waiting on {owner} | attention |
| `done` | Done | success |
| `failed` | Failed | danger |
| `cancelled` | Cancelled | muted |

`blocked_on` → owner text: `founder` → "you" · `approval` → "your decision" · `task` → "another task (T-n)" ·
`graph8` → "graph8" · `connection` → "an account connection" · `budget` → "budget" · `lead` → "the lead to reply".

Task kind (`tasks.kind`) labels: `onboard` Hire team · `plan` Plan · `find_prospects` Find prospects ·
`research_leads` Research leads · `build_sequence` Build sequence · `launch_sequence` Launch sequence ·
`handle_reply` Handle reply · `book_meeting` Book meeting · `create_deal` Create deal · `standup` Standup ·
`answer_question` Answer question · `custom` Task.

Priority (`tasks.priority`): 0 Urgent · 1 High · 2 Normal (do not render) · 3 Low.

## 3. Decision status (`approvals.status`)

| value | label | token |
|---|---|---|
| `pending` | Needs your decision | attention |
| `approved` | Approved | success |
| `rejected` | Skipped | muted |
| `edit_requested` | Edit requested | attention |
| `expired` | Expired | muted |
| `cancelled` | Cancelled | muted |

Kind labels (`approvals.kind`): `launch_sequence` Launch sequence · `enroll_leads` Enroll leads · `send_reply` Send reply ·
`book_meeting` Book meeting · `budget_increase` Raise budget · `connect_account` Connect account · `custom` Decision.
Button/link text is always **Decide in Slack**.

## 4. Lead stage (`leads.stage`) — funnel order

| value | label | token | funnel bucket |
|---|---|---|---|
| `prospect` | Prospect | neutral | Prospects |
| `researched` | Researched | neutral | Prospects |
| `queued` | Queued | neutral | Prospects |
| `contacted` | Contacted | active | Contacted |
| `replied` | Replied | attention | Replied |
| `meeting` | Meeting | success | Meetings |
| `deal` | Deal | success | Deals |
| `won` | Won | success | Deals |
| `lost` | Lost | muted | closed out |
| `disqualified` | Disqualified · {reason} | muted | closed out |

`disqualify_reason`: `not_interested` not interested · `unsubscribed` unsubscribed · `bounced` bounced ·
`wrong_person` wrong person · `no_fit` no fit · `do_not_contact` do not contact.

`sequence_state`: `none` — · `queued` Queued · `enrolled` In sequence · `stopped` Stopped (replied) · `completed` Sequence finished.
`last_reply_intent`: `interested` Interested · `question` Has a question · `objection` Objection · `not_now` Not now ·
`wrong_person` Wrong person · `referral` Referred someone · `not_interested` Not interested · `unsubscribe` Unsubscribed ·
`out_of_office` Out of office · `unknown` Unclear.

Channels (`channel`, `last_channel`): `email` Email ✉ · `linkedin` LinkedIn in · `phone` Call ☎ · `sms` SMS · `whatsapp` WhatsApp · `system` (no icon, muted dot).

## 5. Lead event types (`lead_events.type`) → verb shown in timeline

found "Found" · researched "Researched" · enrolled "Enrolled in sequence" · stopped "Outreach stopped" ·
email_sent "Email sent" · email_opened "Email opened" · email_clicked "Link clicked" · email_bounced "Email bounced" ·
linkedin_connection_sent "LinkedIn request sent" · linkedin_connection_accepted "Connected on LinkedIn" · linkedin_message_sent "LinkedIn message sent" ·
call_placed "Call placed" · call_completed "Call completed" · voicemail_left "Voicemail left" · sms_sent "SMS sent" ·
reply_received "Replied" · reply_classified "Reply read" · reply_sent "Reply sent" ·
meeting_proposed "Times proposed" · meeting_booked "Meeting booked" · meeting_rescheduled "Meeting moved" · meeting_cancelled "Meeting cancelled" · meeting_no_show "No-show" ·
deal_created "Deal opened" · deal_stage_changed "Deal moved" · deal_won "Deal won" · deal_lost "Deal lost" ·
disqualified "Closed out" · note "Note".
Use `summary` as the main text; the verb is the label/icon. `direction`: outbound → , inbound ← , internal · (dot).

## 6. Report kinds (`reports.kind`)

`plan` Plan · `update` Update · `handoff` Handoff (sub-agent → Ayesha) · `standup` Standup · `win` Win 🎉 ·
`alert` Alert (attention token) · `question` Question for you (attention) · `answer` Answer.
Direction text: "**Bilal** → **Ayesha**" ; `to_agent_id = null` → "**Ayesha** → **you**".

## 7. Run triggers (`agent_runs.trigger`) → "woke by …"

`slack_message` a Slack message · `slack_action` a Slack button · `slash_command` a slash command · `cron` schedule ·
`webhook` a graph8 event · `delegation` Ayesha · `approval` your decision · `system` system · `manual` manual.
Run status: `running` Running (active) · `succeeded` Done (success) · `failed` Failed (danger) · `cancelled` Cancelled (muted).

## 7b. Credit ledger source (`credit_events.source`)

`graph8` graph8 credits · `llm` LLM (tokens shown small) · `manual` adjustment. Budget totals include all three; the word
for the total is always **credits**.

## 8. Copy rules

- Headlines state facts: "Zara is working on T-6", not "Agent status: working".
- Empty states say what will happen and who does it: "No leads yet — Bilal adds prospects as soon as the team starts."
- Errors say what happened and what we do: "Could not load tasks. Retrying…". Never a stack trace.
- Buttons/links are verb + object: **Open in Slack**, **Decide in Slack**, **Open in graph8**, **Open deal in graph8**.
- Machine values (T-n, credits, tokens, ids, times) in monospace via `lib/format.ts`. Never format ad hoc.
- Never toast a change already visible on screen. A pulse on the changed row is the feedback.
- Never show emails, phone numbers or LinkedIn URLs (they are not in the data; do not add them from anywhere).
