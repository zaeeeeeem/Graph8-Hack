# Agent 4 — Usman, SDR

Status: **spec agreed with founder (2026-09-27 05:53 PKT)**. graph8 facts from docs + read-only checks.
Shared behaviour (ack, live checklist, thread-only progress, tone, defaults, memory) inherited from `01-ayesha.md`.

Agent row: `role='sdr'`, demo id `a4000000-0000-4000-8000-000000000004`, reports to Ayesha.
Task kinds: `build_sequence`, `launch_sequence`. Input: Hira's research packs. Replies hand off to Zara.

---

## 1. Job (one line)

Turns research into one real multi-channel graph8 sequence per run, gets the founder's Launch, and enrolls
**only our test contacts** — real prospects get the full sequence built and previewed, never contacted.

## 2. Decisions (founder-approved)

| # | Topic | Decision |
|---|---|---|
| U1 | Recipients | **Test leads + real preview.** Teammates are real leads (TEST label) and get the real sequence. Real prospects: sequence built and shown ("would send to 5"), never enrolled. Reply → meeting → deal all on a real graph8 contact. |
| U2 | Copy | **Both**: Gemini writes step instructions + tone from Hira's pack + brand voice doc; graph8 AI writes each lead's message at send time. |
| U3 | Shape | 6 touches, stop on reply anywhere (`finish_on_reply: true`): D0 email → D1 LinkedIn connect → D3 email follow-up → D5 AI voice call → D6 LinkedIn message → D9 breakup email. |
| U4 | Approval card | In `#sales-hq`: step timeline, first email preview for the top lead, who ("3 test leads enrolled · 5 real prospects preview only"). `[Launch] [Edit] [Skip]`. Edit = founder types change in thread → Usman revises → asks again. |
| U5 | Test leads entry | Teammates (from `contact_allowlist`) are added as leads **once, on the first run only**, labeled TEST, researched by Hira like anyone. |
| U6 | One sequence | One graph8 sequence per run, personalized per lead. Only test leads enrolled. |
| U7 | Personalization | graph8 sequences only support standard merge tokens. Steps use `AI_GENERATED_TEMPLATE` with Gemini-written instructions; Hira's hook + talking points saved on the graph8 contact (custom field) so graph8 AI uses them. Approval card shows a Gemini preview. |
| U8 | Phone | **AI voice call.** Ayesha creates a graph8 voice agent at onboarding (new Ayesha tool `setup_voice_agent`, founder confirms first). ~20 credits/min. Verify it works on +19802944116. |
| U9 | LinkedIn | 0 senders (Netrion connect blocked). LinkedIn steps stay in the plan as "⏸ waiting for connection" with `[Connect in graph8]` (Ayesha D10); graph8 sequence is built without them; added once connected. |
| U10 | Timing | Demo workspace: **1 day = 1 minute** (`time_interval` is seconds). Launch → email instantly, follow-up ~3 min, call ~5 min, breakup ~9 min. Real clients: real days. Same code, workspace setting (`demo_time_scale`). |
| U11 | Call goal | **Pitch + book on call**: intro with the hook, ask for 15 min. Yes → book in graph8 on the call, Zara creates the deal. Not now / no answer → short voicemail, sequence continues. Outcome logged on the lead. |
| U12 | After launch | Usman updates his run checklist in his `#sales-team` thread (✉️ sent · 📞 call · bounced). Any reply (email / call / LinkedIn) wakes Zara. `#sales-hq` hears only wins and problems. |
| U13 | Skip (assumed) | `[Skip]` cancels that run's outreach; leads stay `researched`. |
| U14 | Bounce (assumed) | Lead → `bounced`, contact paused in sequence, no more touches. |
| U15 | Sender (assumed) | Email only from mailbox id 1 (founder Gmail, 40/day). Schedule "Demo 24/7" `e5583e4d-6067-42a2-bc27-45ca18e92564`. |

## 3. graph8 facts

- **Use `POST /sequences` directly** (MCP `g8_create_sequence`). GTM campaign launch only reliably sends email;
  multi-channel needs a Sequencer sequence.
- Create fields: `name`, `user_email`, `finish_on_reply` (default true), `send_in_same_thread`, `associated_list_id`,
  `sequence_kind` (`cold_outbound`), `steps[]`, `channels[]` (`channel_type` GMAIL / PHONE …), `schedule_id`,
  `voice_agent_name` (phone/SMS steps), `textual_agent_name` (email/social).
- `step_type`: `EMAIL | PHONE | SMS | WHATSAPP | HEYREACH | UNIPILE | MANUAL_DIALER`.
  `input_type`: `MANUAL_TEMPLATE | AI_GENERATED_TEMPLATE | ON_DEMAND`. `time_interval` = seconds after previous step.
  EMAIL `step_data`: `{subject, body, instructions, email_type}`.
- Update: `PATCH /sequences/{id}`, `PATCH /sequences/{id}/steps/{step_id}` (step_data replaced wholesale). `409` while
  status is transitional.
- Enroll: `POST /sequences/{id}/contacts` with `contact_ids[]` + `list_id` (both required). No API `dry_run`.
- Per-contact pause/resume: `POST /sequences/{id}/contacts/{contact_id}/pause|resume`. Sequence pause/resume exists.
  Account-level stop is **our logic** (pause every contact at that company) — Zara.
- Voice: 0 voice agents today. Real AI calls via voice agent on the sequence or `POST /voice/dialer/sessions` →
  `/resume`. 20 credits/min; booked meeting 20 credits.
- Webhooks: `engagement.email_sent|email_replied|email_bounced|call_dispatched|linkedin_*`, `voice_ai.call_started|call_completed|voicemail_left`,
  `sequence.started|paused|completed`. **No email-open tracking** (clicks only).
- Content generation endpoints exist (`/sequencer/content/email/generate`, `/linkedin/generate`, `/voice/test-call`).
- Org: 0 sequences today; mailbox id 1 active (40/day, no warmup); 0 LinkedIn senders.

## 4. Tools

| # | Tool | Input | Output | graph8 call | Cost | Writes (Supabase) |
|---|---|---|---|---|---|---|
| U-T1 | `set_lead_context` | lead, research pack | ok | custom field on contact (`g8_create_fields` once, `g8_set_field_values`) | free | none |
| U-T2 | `write_step_briefs` | research packs, brand voice | per-step instructions + tone | none (Gemini) | LLM | `sequences.steps` summary |
| U-T3 | `build_sequence` | briefs, list id, schedule, mailbox, voice agent, time scale | `{ g8_sequence_id }` | `POST /sequences` (EMAIL + PHONE, `AI_GENERATED_TEMPLATE`, `finish_on_reply: true`) | free | `sequences` row (`lead_count`, `steps`, g8 ids) |
| U-T4 | `preview_copy` | top lead + step 1 brief | sample email | none (Gemini) | LLM | approval payload |
| U-T5 | `request_launch` | sequence, preview, recipients | approval | none (via Ayesha T7) | free | `approvals` `launch_sequence` |
| U-T6 | `launch_sequence` | sequence id, **test** contact ids, list id | `{ contacts_affected }` | `POST /sequences/{id}/contacts` — **allowlist guard in `g8.ts` rejects any non-test contact** | ~1 credit/step sent | `sequences.enrolled_count`, `leads.stage='contacted'` (test), `lead_events` `enrolled` |
| U-T7 | `track_sends` | webhook event | lead event | webhooks listed in §3 | free | `lead_events` (`email_sent`, `call`, `bounced`, …), `leads.last_channel` |

Real prospects: stage `queued` (built, not enrolled). Test leads: `contacted` after enroll.

## 5. Playbook

**`build_sequence`**
1. Checklist in thread: ⏳ Writing step briefs for 5 leads (+ test leads on first run).
2. U-T1 hook on each graph8 contact → U-T2 briefs → U-T3 create sequence (LinkedIn steps omitted, shown as ⏸).
3. U-T4 preview → U-T5 approval card in `#sales-hq` → task `blocked_on='approval'`.

**On decision**
- Launch → U-T6 enroll test contacts only → checklist ✅ → U-T7 updates as events arrive.
- Edit → revise briefs from founder note → PATCH steps → new approval.
- Skip → task `cancelled`, leads stay `researched`.

## 6. Guardrails

- Only allowlisted / `is_test_contact` leads are ever enrolled. Guard in `g8.ts` + DB check, not just prompt.
- Voice calls only to allowlisted numbers.
- No PII in Slack / reports. Approval preview uses the top **real** lead's name + company only (no email).

## 7. Open items

1. Verify `AI_GENERATED_TEMPLATE` actually reads contact custom fields; fallback: `MANUAL_TEMPLATE` per step with
   Gemini copy (one sequence per lead only if forced).
2. Verify voice agent creation API + that PHONE step with `voice_agent_name` places an AI call (else
   `/voice/dialer/sessions`).
3. Minimum `time_interval` and how fast step 1 sends after enroll on the 24/7 schedule.
4. Test allowlist (teammates' email / phone) still to be provided by the founder.
