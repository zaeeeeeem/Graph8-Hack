# Autopilot — Real Sales Flow (DRAFT v2, edit me)

> How to use this file: read each stage. Wherever you see `✏️ NOTES:` write your own thoughts,
> corrections, or "cut this". Anything marked `[graph8: ✅]` is confirmed in graph8 docs/API.
> `[graph8: ❓]` = exists in API but must be checked in sandbox / with mentors.

Big change from v1: this is not "write 1 email and wait". It is a **multi-channel, multi-touch
sequence** that **stops the moment a lead responds anywhere** and switches to a real conversation,
then runs through meeting → deal → follow-up, and learns what works.

---

## Overview

```
STAGE 0  Understand the business         (Sales Brain)
STAGE 1  Pick targets                     (ICP → accounts → right people → signals)
STAGE 2  Research each lead               (enrich + personal hooks)
STAGE 3  Plan & approve                   (human approves the whole sequence per lead)
STAGE 4  Multi-channel sequence           (email + LinkedIn + call, spaced over days)
STAGE 5  Event rules                      (reply / accept / bounce / OOO / click → change course)
STAGE 6  Conversation mode                (sequence stopped, AI + human handle the lead)
STAGE 7  Meeting                          (book → remind → show / no-show → notes)
STAGE 8  Deal & close                     (deal stages → quote → won/lost)
STAGE 9  Learn & adapt                    (what worked → change next sequences)
```

---

## STAGE 0 — Understand the business
- Input: company website (+ optional: pricing, case studies, calendar link).
- AI builds the **Sales Brain**: offer, ICP, personas, competitors, tone, proof points (case studies, numbers).
- graph8: Company Intelligence, GTM Global Context, Studio ICPs/Personas `[graph8: ✅]`
- Human can edit any card before continuing.

✏️ NOTES:

---

## STAGE 1 — Pick targets
1. ICP → search companies (industry, size, location, tech) `[graph8: ✅ free]`
2. Rank companies by **signals**: hiring, website visits, intent keywords, funding `[graph8: ✅ intent/signals/visitors]`
3. Per company pick the **buying committee**, not 1 person: decision maker + champion + user
   `[graph8: ❓ desk committee endpoints exist]`
4. Save to a list in graph8 CRM `[graph8: ✅]`

✏️ NOTES:

---

## STAGE 2 — Research each lead
- Enrich: verified email, phone, LinkedIn URL `[graph8: ✅ costs credits]`
- Find **personal hooks**: recent post, job change, company news, the signal that triggered them.
- Output per lead: "Why this person, why now" in 2 lines. Every message later reuses this.

✏️ NOTES:

---

## STAGE 3 — Plan & approve
- For each lead, AI drafts the **whole sequence** (all touches), not one email.
- Deal Feed card shows: lead + why now + all steps in a timeline.
- Human: Approve all / edit a step / remove a step / skip lead.
- Nothing goes out without approval (hackathon rule + trust).

✏️ NOTES:

---

## STAGE 4 — Multi-channel sequence (your version, mapped to graph8)

graph8 sequences support these step types natively: `EMAIL`, `LINKEDIN` (connection request,
message, InMail, like post), `PHONE`, `SMS`, `WHATSAPP`, `MANUAL_DIALER`, plus AI voice agents.
Setting `finish_on_reply: true` stops the sequence on reply. `[graph8: ✅ sequences-lifecycle.md]`

| # | Day | Channel | What | Uses context from | graph8 step |
|---|-----|---------|------|-------------------|-------------|
| 0 | 0 | LinkedIn | Like/react to their recent post (warm-up, optional) | — | `LINKEDIN / LIKE_POST` |
| 1 | 1 | Email | Email 1: hook + problem + soft ask | Stage 2 hooks | `EMAIL` |
| 2 | 2 | LinkedIn | Connection request, note references email 1 | Email 1 | `LINKEDIN / CONNECTION_REQUEST` |
| 3 | 4 | LinkedIn | Message 1 (only if connection accepted) | Email 1 + note | `LINKEDIN / MESSAGE` |
| 4 | 5 | Email | Email 2: value / case study / proof | Email 1 | `EMAIL` |
| 5 | 7 | Call | Call (AI voice agent or human dialer), voicemail if no answer | All above | `PHONE` / voice agent |
| 6 | 8 | LinkedIn | Message 2 | Email 2 | `LINKEDIN / MESSAGE` |
| 7 | 12 | Email | Email 3: breakup / "should I close your file?" | Everything | `EMAIL` |

Rules for this stage:
- Every touch **references the earlier ones** ("following up on my email about…") — one story, not random messages.
- Spacing: never 2 touches same day; business hours in lead's timezone.
- Connection not accepted → skip LinkedIn messages, continue email + call.

✏️ NOTES (change order / days / add SMS or WhatsApp? add call earlier?):

---

## STAGE 5 — Event rules (what happens when something happens mid-sequence)

graph8 fires webhooks for all of these `[graph8: ✅ webhooks.md]`

| Event (graph8 webhook) | Action |
|---|---|
| Reply on ANY channel (`email_replied`, `linkedin_reply_received`, `sms_replied`) | **STOP whole sequence on all channels** → go to STAGE 6 |
| `linkedin_connection_accepted` | Unlock LinkedIn message steps |
| Connection not accepted after X days | Withdraw request, continue email + call only |
| `email_bounced` | Pause email, find alternate email (enrich) or continue on LinkedIn + call |
| `email_clicked` / `link_clicked` (e.g. pricing page) | Hot signal → move call step earlier, alert human |
| `visitor.identified` / `intent.signal` for their company | Hot signal → bump priority, personalise next touch with it |
| Out-of-office reply | Pause, resume after their return date |
| "Unsubscribe / not interested" | Stop, mark do-not-contact, never re-enroll |
| `voice_ai.call_completed` | Read transcript + grade → decide next step |
| `voice_ai.voicemail_left` | Next touch mentions the voicemail |
| Another person at same company replies | Pause the whole account (don't spam colleagues) |
| `sequence.completed` with no reply | Move to nurture list, retry in 60–90 days with new angle |

✏️ NOTES:

---

## STAGE 6 — Conversation mode (the sequence has stopped)
AI (Closer) reads the reply and classifies it:

| Reply type | What happens |
|---|---|
| Interested | Send times / booking link → STAGE 7 |
| Question | AI drafts answer from Sales Brain → human approves → send |
| Objection (price, timing, competitor) | AI drafts objection handling → human approves |
| Not now | Create follow-up task at the date they gave |
| Wrong person / referral | Find the referred person, start a new sequence mentioning the referral |
| Negative / unsubscribe | Stop, do-not-contact |

- Replies go out on **the same channel** they replied on.
- graph8: Inbox (threads, AI draft, send reply, tag, assign) `[graph8: ✅]`
- Human always approves outgoing replies (or toggles auto-send for simple ones).

✏️ NOTES:

---

## STAGE 7 — Meeting
1. Book: check real availability, book slot `[graph8: ✅ appointments/calendar]` → `meeting.booked`
2. Before meeting: reminder email/SMS + prep brief for the human (who, company, signals, what they said)
3. Meeting happens → transcript + AI analysis `[graph8: ✅ meetings]`
4. `meeting.no_show` → auto reschedule message (email + call)
5. `meeting.rescheduled` / `meeting.cancelled` → update plan

✏️ NOTES:

---

## STAGE 8 — Deal & close
- Meeting booked → create deal in pipeline `[graph8: ✅ deals]`
- After meeting: AI writes follow-up recap + next steps, creates tasks `[graph8: ✅ tasks/notes]`
- Move deal stages (`deal.stage_changed`)
- Send quote with signing + payment link `[graph8: ✅ quotes]` → `quote.viewed` / `quote.accepted` / `quote.payment_received`
- Won → celebrate. Lost → record reason.

✏️ NOTES:

---

## STAGE 9 — Learn & adapt
- Track per step: sent / opened / clicked / replied / meetings `[graph8: ✅ sequence + campaign analytics]`
- AI notices: "LinkedIn message 1 gets 3× more replies than email 2" → suggests reordering.
- Which persona / signal / subject line converts best → updates Sales Brain.
- Next batch of sequences uses the learnings.

✏️ NOTES:

---

## Reality check for the hackathon (Sunday 18:00 demo)

| Piece | Can we show it for real? |
|---|---|
| Stages 0–3 | Yes, real graph8 data + AI |
| Multi-channel sequence created in graph8 with email + LinkedIn + call steps | Yes (create sequence via API) `[❓ confirm LinkedIn/voice need connected accounts]` |
| Actual sends | Sandbox only — show them in sandbox outbox |
| Days of waiting | Demo uses a **time-skip button** ("fast-forward to day 5") |
| Replies / accepts / bounces | Simulated via sandbox or our demo panel → real webhook-style handling |
| Meeting, deal, tasks, quote | Real records in graph8 |
| AI voice call | `[❓ ask mentors if voice works in sandbox]` — big wow factor if yes |

**Mentor questions to add:**
1. Can sandbox simulate LinkedIn steps (connection accepted, LinkedIn reply)?
2. Can a sandbox AI voice call run (even to a teammate's number)?
3. Does `finish_on_reply` stop across all channels, or only the channel that got the reply?

✏️ YOUR OVERALL NOTES / WHAT WE'RE MISSING:

