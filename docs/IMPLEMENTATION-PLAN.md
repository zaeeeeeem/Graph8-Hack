> **Superseded 2026-09-27 06:40 PKT by `docs/BUILD-PLAN.md`** (written after the agent specs and live checks). Kept for history; do not build from this file.

# Implementation Plan — AI Sales Team in Slack (start → demo)

Brief: `docs/IDEA.md`. Owners: **A** = agents + graph8, **B** = Slack + Agent Office, **C** = plumbing + demo + pitch.
Rule: every phase ends with something that works end-to-end. Never break `main` of the demo path.

---

## Phase 0 — Accounts & keys (now → before sleep / first thing, ~45 min)
| # | Task | Who | Output |
|---|---|---|---|
| 0.1 | Create Supabase project (free) | C | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, anon key |
| 0.2 | Create demo Slack workspace + Slack app from our manifest (Socket Mode, bot scopes incl. `chat:write.customize`, `commands`, `app_mentions:read`, `im:history`) | C | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET` |
| 0.3 | Put `GEMINI_API_KEY` in `.env.local`; list models → confirm Gemini 3.8 Flash ID | A | model ID string |
| 0.4 | graph8: create **24/7 "Demo" sending schedule**; set org company domain = 8x.social | C | schedule id |
| 0.5 | Collect team test contacts (email, phone, LinkedIn) → `TEST_ALLOWLIST` | all | allowlist |
| 0.6 | Cloudflared tunnel + register graph8 webhook → our URL; save `G8_WEBHOOK_SECRET` | C | webhook id |

## Phase 1 — Scaffold (L0, target 11:00)
| # | Task | Who |
|---|---|---|
| 1.1 | Repo layout: `server/` (Node + TS), `office/` (Next.js), `shared/types.ts`; pnpm workspace; lint/tsc | A |
| 1.2 | `shared/types.ts` contract: Workspace, Agent, Task, Report, Approval, Lead, Event — **agree before anything else** | all |
| 1.3 | Supabase SQL migration: tables with `workspace_id`, indexes, Realtime on `tasks`/`reports`/`agents` | A |
| 1.4 | `store.ts` (Supabase client, workspace-scoped queries) + seed demo workspace + 5 agents (org chart) | A |
| 1.5 | `llm.ts` (Gemini, function calling) — "hello" call works | A |
| 1.6 | `tools/g8.ts` — SDK init per workspace key + **allowlist guard** on every send/enroll/call | A |
| 1.7 | Slack Bolt (Socket Mode) boots; `/hire-sales` replies; `postAs(agent, channel, text, thread?)` with persona name/icon | B |
| 1.8 | Office: Next.js page reads agents from Supabase, renders org chart (static) | B |
| 1.9 | `scripts/smoke-test.sh` green; webhook receiver logs a test event | C |

**Done when:** `/hire-sales 8x.social` → Head of Sales (persona) replies in Slack; Office shows the org chart.

## Phase 2 — Head + Scout (L1, target 13:00)
| # | Task | Who |
|---|---|---|
| 2.1 | Orchestrator: create task → post parent msg in `#sales-team` (thread ts saved on task) → run agent → agent posts in thread → mark done → Head rolls up | A |
| 2.2 | Head of Sales: reads graph8 Global Context/ICPs/personas (reuse if present, else start `/intelligence/analyze` async) → writes plan → posts plan + org chart in `#sales-hq` | A |
| 2.3 | Scout: ICP → `search.companies/contacts` (narrow filters, free) + signals → saves leads → posts summary | A |
| 2.4 | Slack Block Kit: plan card, org chart card, lead list card | B |
| 2.5 | Office: Realtime subscription → agent status pulses, report stream | B |
| 2.6 | Pre-warm script v1 (context + Scout cached for 8x.social) | C |

**Done when:** one command → plan + real prospects in Slack in < 30 s (warm).

## Phase 3 — Researcher + SDR + Approval + first real send (L2, target 14:30)
| # | Task | Who |
|---|---|---|
| 3.1 | Researcher: enrich (credits, capped) + "why now" (Gemini; TinyFish fetch optional) | A |
| 3.2 | SDR: create contacts + list in graph8; build multi-channel sequence (EMAIL → LINKEDIN connect → LINKEDIN msg → EMAIL → PHONE → …, `finish_on_reply: true`, Demo schedule, `DEMO_TIME_SCALE` delays); **real prospects shown, only allowlisted test contacts enrolled** | A |
| 3.3 | Approval flow: Head posts [Launch][Edit][Skip] in `#sales-hq` → action handler → orchestrator → SDR enrolls | B |
| 3.4 | "Connect when needed": if no active mailbox → Head posts "[Connect in graph8]" link instead of launching | B |
| 3.5 | **Make repo public at 14:00** (after secret scan) | C |
| 3.6 | Verify email lands in teammate inbox; fix schedule/limits | C |

**Done when:** click Launch in Slack → teammate's phone gets the email.

## Phase 4 — Closer: reply → meeting → deal (L3, target 16:00)
| # | Task | Who |
|---|---|---|
| 4.1 | Webhook route: verify signature (`g8.webhooks.constructEvent`) → map to workspace → event row → wake Closer | C |
| 4.2 | Closer: classify reply (Gemini: interested / question / not now / wrong person / unsubscribe) → stop account outreach (pause sequence for that contact/company) → action | A |
| 4.3 | Interested → appointments (Discovery call, Meet) → book / propose times → `deals.create` → posts; Head posts win in `#sales-hq` with "Open in graph8" | A |
| 4.4 | `scripts/simulate-reply.ts` (signed fake event) as stage backup | C |
| 4.5 | Office: pipeline strip (prospects → contacted → replied → meetings → deals) | B |

**Done when:** teammate replies → within ~1 min Slack shows meeting + deal, and deal exists in graph8.

## Phase 5 — Polish & wow (L4, target 17:15)
| # | Task | Who |
|---|---|---|
| 5.1 | `/sales-standup` + 9:00 cron: roll-up (yesterday/today/blockers/pipeline/credits per agent) | A |
| 5.2 | Per-agent credit budgets enforced in orchestrator; shown in standup + Office | A |
| 5.3 | DM Q&A: "how's pipeline?" → Head answers from live graph8 data | A/B |
| 5.4 | TinyFish buying-signal check for Scout (optional) | C |
| 5.5 | `scripts/reset-demo.ts`; deploy server (Railway) + Office (Vercel) if stable | C |
| 5.6 | Pitch slides (problem, demo, architecture/multi-client, judge Q&A) | C |

## Phase 6 — Freeze & rehearse (17:15 → 18:00)
- 17:30 code freeze. Reset → pre-warm → full run ×3. Record backup video. Assign roles on stage (driver, replier, speaker).

---

## Critical path (if we fall behind, protect these)
Slack app + Supabase (Phase 0) → `g8.ts` + allowlist → Head/Scout → SDR + Approval → real email → Closer + deal.
Cut first if late: TinyFish → DM Q&A → deploy → budgets UI → Office extras. **Never cut:** real email + reply → deal in graph8.

## Agreed contracts (write first, change only together)
- `shared/types.ts` (entities above)
- `postAs(agentId, channel, text, { threadTs, blocks })` — only way agents speak in Slack
- `g8.<action>(workspaceId, …)` — only way agents touch graph8 (guard inside)
- `llm.run(agentId, prompt, tools)` — only way agents think
