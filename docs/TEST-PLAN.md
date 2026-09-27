# Phase 0 — Verify graph8 works before building agents

Environment (confirmed 2026-09-26 20:50 PKT via graph8 MCP):
- Org: **Hackathon zaeemulhassanyt** (`org_f3f1e5df96e5`) on `be.graph8.com` — this IS our dev env. No separate sandbox (`/sandbox/*` returns 404 on prod).
- Credits: **9,750 available** (10,000 given, 250 used — the phone number).
- Phone: **+19802944116** (Twilio, dialer, 40 calls/day, assigned to zaeemulhassanyt@gmail.com).
- Mailboxes: **0** · LinkedIn senders: **0** · Voice AI agents: **0**.

## Safety rule (non-negotiable)
graph8 data is **real people**. We search it freely, but **every send / call / enroll goes only to our own
test contacts** (the 3 teammates' emails, phones, LinkedIns). Test list name: `AUTOPILOT TEST - OWN CONTACTS`.

## Setup the team does in the portal (app.graph8.com)
| # | Task | Where | Who | Done |
|---|------|-------|-----|------|
| S0 | **Be logged in to the Hackathon org** (zaeemulhassanyt@gmail.com, ~9,750 credits), NOT the `zaeem@8x.social` / org `zaeem` account | Avatar menu shows email + credits | | ☐ |
| S1 | Create API key, put in `.env.local` as `G8_API_KEY` (never paste in chat/commit) | Settings → MCP & API → API tab | | ☐ |
| S2 | Connect a sending mailbox (Google / Microsoft / SMTP) | Avatar → Profile → **Mailboxes** tab → Connect mailbox | | ☐ |
| S3 | Connect LinkedIn via **Netrion** | Avatar → Profile → **Connectors** → LinkedIn → Sending account → Connect LinkedIn in Netrion → Refresh status | | ☐ |
| S4 | Connect calendar + video app ("Discovery call" 30m event already exists) | Engage → **Appointments** → Connect a calendar / Set default conferencing (or Profile → Connectors → Google → Calendar & Drive) | | ☐ |
| S5 | Voice: make the number usable by AI (dialer vs voice-AI) — ask mentor if needed | Voice / Phone numbers | | ☐ |
| S6 | Each teammate shares: email, phone (E.164), LinkedIn URL for the test list | team chat | all | ☐ |

## Tests (run in order; each proves one piece of the flow)
| # | Test | graph8 call | Cost | Proves | Result |
|---|------|-------------|------|--------|--------|
| T1 | API key works | `scripts/smoke-test.sh` | free | auth, scopes | ✅ 21:50 all 200, org_f3f1e5df96e5 |
| T2 | Search real ICP companies + people | `search.companies/contacts` | free | Stage 1 targeting | ☐ |
| T3 | Buying signals for a domain | `signals.company(domain)` / intent | free? | Stage 1 ranking | ☐ |
| T4 | Website → intelligence | `POST /intelligence/analyze` on our demo company | credits | Stage 0 Sales Brain | ☐ |
| T5 | Read generated context/ICPs/personas | `global-context/documents`, `icps`, `personas` | free | Stage 0 | ☐ |
| T6 | Create test list with OWN contacts | `contacts.create` + `lists.create/addContacts` | free | CRM writes | ☐ |
| T7 | Enrich 1 own contact | `enrich.person` | 1+ credit | Stage 2 | ☐ |
| T8 | AI writes copy | Skills `createLLM` + `execute` (or `/sequencer/content/linkedin/generate`) | credits | Writer agent | ☐ |
| T9 | Create multi-channel sequence (email + LinkedIn + call steps, `finish_on_reply`) — **drafted, not launched** | `POST /sequences` | free | Stage 4 shape | ☐ |
| T10 | Launch sequence on OWN test list only → email arrives in our inbox | `sequences.add/run` | credits | real send works | ☐ |
| T11 | Webhook receiver gets events (tunnel) | `POST /webhooks` + cloudflared | free | Stage 5 events | ☐ |
| T12 | Reply to test email → `engagement.email_replied` fires → sequence stops | inbox + webhook | free | stop-on-reply | ☐ |
| T13 | LinkedIn connect request to a teammate → accept → `linkedin_connection_accepted` | Netrion step | ? | LinkedIn channel | ☐ |
| T14 | AI/dialer call to a teammate's phone | voice one-off call (`dry_run` first) | credits | call channel | ☐ |
| T15 | Book meeting + create deal → visible in graph8 app | appointments + `deals.create` | free | Stage 7–8 | ☐ |

## Findings log
- T2 (MCP, 20:55): company search works (free) but **quirky**:
  - `employee_count` with the `between` operator returns 422.
  - A broad industry + country search timed out.
  - A domain lookup worked, but rows have messy data: blank names, and wrong-company matches on the domain.
  - So agents must use narrow filters and clean/dedupe results.

After T1–T15 pass we know every stage of `docs/FLOW.md` is real, and start building the agents.
