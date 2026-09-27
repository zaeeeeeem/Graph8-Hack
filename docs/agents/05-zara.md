# Agent 5 — Zara, Closer

Status: **spec agreed with founder (2026-09-27 06:13 PKT)**. graph8 facts from docs + read-only checks.
Shared behaviour (ack, live checklist, thread-only progress, tone, defaults, memory) inherited from `01-ayesha.md`.

Agent row: `role='closer'`, demo id `a5000000-0000-4000-8000-000000000005`, reports to Ayesha.
Task kinds: `handle_reply`, `book_meeting`, `create_deal`. Woken by: reply webhooks, inbox polling, voice call outcomes,
`meeting.booked`.

---

## 1. Job (one line)

Turns every reply into the right next step within a minute: stops outreach to the whole account, answers,
books the meeting, and creates the deal in graph8.

## 2. Decisions (founder-approved)

| # | Topic | Decision |
|---|---|---|
| Z1 | Reply types | **Auto for safe, approve for risky.** Interested → auto reply + booking. Out-of-office → auto pause, retry after return date. Unsubscribe → auto stop + do-not-contact, no reply. Not now → auto polite reply, re-contact later. Question / wrong person / referral / objection / not interested → Zara drafts, founder approves in `#sales-hq` `[Send] [Edit] [Skip]`. Allowlist guard gates every send. |
| Z2 | Stop scope | **Whole company.** One reply pauses every contact at that company in all our sequences. |
| Z3 | Deal timing | **When the meeting is booked.** Deal linked to contact + company. Ayesha posts the win in `#sales-hq` with `[Open in graph8]`. |
| Z4 | Pipeline | Use the **existing** graph8 "Sales Pipeline", stage "New Meeting". Ayesha no longer creates an AI-suggested pipeline (D12 changed). |
| Z5 | Booking | Interested → in-thread auto reply with **2 suggested slots + graph8 booking link**. Prospect books via link (or replies with a time → Zara books it). `meeting.booked` → deal. |
| Z6 | Calendar setup | Founder connects Google Calendar in graph8 once (browser login; Ayesha posts `[Connect Google Calendar]`). Ayesha creates the 30-min "Discovery call" type + Google Meet at onboarding (new Ayesha tool `setup_meeting_type`). No calendar → Zara proposes times as plain text. |
| Z7 | Signature | Emails signed as the **founder** (8x.social). Agents stay behind the scenes; Slack shows which agent wrote it. |
| Z8 | Reliability | **Webhook + inbox polling backup.** Webhooks primary; every 20 s Zara also checks the graph8 inbox for new replies on our sequences; duplicates ignored via `inbound_events.dedupe_key`. `scripts/simulate-reply.ts` as last resort. |
| Z9 | Deal amount | Gemini picks the likely plan from graph8's `pricing_matrix` doc for the company size. Shown as "est." in the win message. |
| Z10 | Risky-reply card (assumed) | Approval card shows the prospect's reply (no email address) + Zara's draft. Edit = founder note in thread → revised draft → re-ask. |
| Z11 | Call outcomes (assumed) | Voice disposition mapped like replies: `booked` → deal · `callback` → propose times by email · `not_interested` → stop · `dnc` → do-not-contact · `voicemail` / `not_answered` → sequence continues · `wrong_person` / `referred` → approval draft. |

## 3. graph8 facts

- `engagement.email_replied` payload: `{contact_id, email, reply_subject, sequence_id, campaign_id, replied_at, is_positive}`.
  **No reply body, no thread id** → fetch from inbox. LinkedIn: `engagement.linkedin_reply_received`.
- Inbox: `GET /inbox` (filters channel / sequence_id / status / tag), `GET /inbox/{reply_id}` (`messages[].content`),
  `POST /inbox/{reply_id}/send` (in-thread, same channel, optional `from_address`), `POST /inbox/{id}/tag`,
  `GET /inbox/{id}/draft` (graph8 AI draft, charges credits). No built-in intent classification → Gemini.
  Live: 406 threads, none from prospects yet.
- Appointments: event types CRUD, `POST /appointments/bookings` (**~20 credits**, 409 on slot conflict), Google Meet
  conferencing needs an existing Google Calendar credential. `meeting.booked` payload:
  `{contact_id, email, meeting_id, meeting_title, scheduled_at, duration_minutes, sequence_id, campaign_id, booked_at}`.
  Live: 0 meetings.
- Deals: `POST /deals` (`name`, `company_id`, `amount`, `currency`, `stage_id`, `pipeline_id`, `contact_ids`).
  Live: 1 pipeline "Sales Pipeline" (New Meeting, Discovery Held, Solution Fit, Proposal Sent, Verbal Commit,
  Closed Won, Closed Lost, Long Term Nurture, Weak Responsiveness); 0 deals. Webhooks `deal.created|updated|stage_changed`.
- Stopping: sequence-level `POST /sequences/{id}/pause|resume`. Per-contact pause: docs disagree (see §7).
  No account-level endpoint → our logic. Do-not-contact is ours (`leads.do_not_contact`); suppression list type exists.
- Voice: `voice_ai.call_completed` (duration / disposition / sentiment, no example schema),
  transcript via `GET /voice/dialer/calls/{room_name}/transcript`. 21 dispositions live.
- Webhooks: `POST /webhooks` (`url`, `events[]`, returns `secret` once), header `X-Studio-Signature: sha256=…` over
  `{X-Studio-Timestamp}.{raw_body}`, retries 10 s / 60 s / 300 s with the same timestamp, reject > 5 min skew.

## 4. Tools

| # | Tool | Input | Output | graph8 call | Cost | Writes (Supabase) |
|---|---|---|---|---|---|---|
| Z-T1 | `get_reply` | webhook event / poll hit | reply text, channel, thread | `GET /inbox/{id}` (+ `GET /inbox` poll) | free | `inbound_events`, `lead_events` `reply_received`, lead → `replied` |
| Z-T2 | `classify_reply` | reply text, lead context | `{ intent, ooo_until?, referral? }` (`REPLY_INTENT_VALUES`) | none (Gemini) | LLM | `leads.last_reply_intent`, `lead_events` `reply_classified` |
| Z-T3 | `stop_account` | company domain | paused contacts | pause each contact at the company in our sequences | free | `leads.sequence_state='stopped'`, `lead_events` `stopped` |
| Z-T4 | `draft_reply` | intent, thread, research, booking link | reply text (founder signature) | none (Gemini) | LLM | approval payload (risky) |
| Z-T5 | `send_reply` | reply id, text | sent | `POST /inbox/{id}/send` — **allowlist guard** | free | `lead_events` `reply_sent` |
| Z-T6 | `book_meeting` | lead, slot | `{ meeting_id, scheduled_at }` | `POST /appointments/bookings` (or prospect books via link → `meeting.booked`) | ~20 credits | `leads.meeting_at`, `g8_meeting_id`, stage `meeting`, `lead_events` `meeting_booked` |
| Z-T7 | `create_deal` | lead, amount estimate | `{ g8_deal_id }` | `POST /deals` (Sales Pipeline, "New Meeting", contact + company) | free | `leads.g8_deal_id`, `deal_amount`, `deal_stage`, stage `deal`, `lead_events` `deal_created` |
| Z-T8 | `read_call_outcome` | voice event | disposition, summary | `voice_ai.call_completed` + transcript endpoint | free | `lead_events` `call` |
| Z-T9 | `mark_do_not_contact` | lead | ok | suppression list (optional) | free | `leads.do_not_contact=true`, stage `disqualified` |

## 5. Playbook (`handle_reply`)

1. Event in → `inbound_events` dedupe → Z-T1 fetch text → Z-T3 **stop account first** (always).
2. Z-T2 classify → branch (Z1):
   - interested → Z-T4 draft with 2 slots + booking link → Z-T5 auto-send → wait for `meeting.booked` (or time reply → Z-T6).
   - out_of_office → schedule re-contact after `ooo_until`.
   - unsubscribe → Z-T9, no reply.
   - not_now → Z-T4 polite → Z-T5 → re-contact later.
   - others → Z-T4 draft → approval `send_reply` in `#sales-hq` → on Send → Z-T5.
3. `meeting.booked` → Z-T7 deal (Z9 amount) → report `win` → Ayesha posts 🎉 in `#sales-hq`.
4. Thread in `#sales-team` shows the story: reply (no email address) → intent → action → meeting → deal.

## 6. Guardrails

- Every send passes the `g8.ts` allowlist guard and `do_not_contact = false`.
- Stop the account **before** any reply is sent.
- No PII in Slack / reports; reply text shown without addresses or phone numbers.
- Replies from real prospects can't happen (never contacted); if one arrives, Zara stops + drafts only, never auto-sends.

## 7. Open items

1. Per-contact pause endpoint (`POST /sequences/{id}/contacts/{contact_id}/pause` appears in the OpenAPI list but not
   in the docs) — verify live; fallback: remove contact from sequence or pause sequence if it only holds that account.
2. Webhook tunnel (cloudflared) + `POST /webhooks` registration + signature check.
3. Booking link URL shape from the event type; Google Calendar connection by founder.
4. `voice_ai.call_completed` exact payload.
