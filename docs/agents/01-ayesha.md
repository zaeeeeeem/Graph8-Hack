# Agent 1 — Ayesha, Head of Sales

Status: **spec agreed with founder (2026-09-27 05:03 PKT)**. graph8 calls below come from our docs
(`docs/graph8-docs/`, `docs/graph8-openapi.json`, `docs/SDK-GUIDE.md`) and a read-only MCP check;
exact request/response shapes still to be verified live before build.

Schema: `supabase/migrations/001_init.sql`, types: `shared/types.ts`. Agent row: `role='head_of_sales'`,
demo id `a1000000-0000-4000-8000-000000000001`. Reports to: the founder (`reports_to = null`).

---

## 1. Job (one line)

Knows the founder's company, sets the plan, runs the team every day, asks the founder only when it matters,
and answers any sales question about the team in plain words.

## 2. Decisions (founder-approved)

| # | Topic | Decision |
|---|---|---|
| D1 | Entry points | `/hire-sales <domain>` once. After that `@Ayesha` mention or DM in plain language. `/sales-standup` also works. |
| D2 | Company knowledge | graph8 first: Global Context docs + ICPs + personas. No docs → graph8 `intelligence/analyze`. |
| D3 | Brain | **Fixed playbook + AI.** Code runs steps in order; Gemini does judgment and writing inside each step. |
| D4 | Founder approvals | Only (a) before launching outreach — `[Launch] [Edit] [Skip]`, (b) when a channel is missing — `[Connect in graph8]`. |
| D5 | Chat understanding | Gemini understands intent, not fixed phrases. Three outcomes: **in scope** → do it; **sales-related but not built** → "I can't do that yet" (+ what she can do); **off-topic** → polite decline. |
| D6 | Defaults | 10 leads found + 5 researched per daily run. Founder can change any default by chat; saved as workspace settings. Never ask the founder for things that have a default. |
| D7 | Acknowledge | Within ~1 s: 👀 reaction + one short "On it…" message. |
| D8 | Progress | That one message is a **live checklist** edited in place (✅ / ⏳ / ⚠️). Any further detail goes in its **thread**, never new top-level messages. Not spammy. |
| D9 | Channels | `#sales-hq` = founder ↔ Ayesha only (plan, decisions, wins, standup). `#sales-team` = one thread per task where Bilal/Hira/Usman/Zara work. |
| D10 | Missing channel | Ask + continue: post `[Connect in graph8]`, launch with what works (email), add the missing channel's steps once connected. |
| D11 | Daily run | Every day 09:00 PKT: standup, then the daily run (find 10 → research 5 → build sequence → ask to launch). |
| D12 | Pipeline | graph8 org has 0 pipelines. During onboarding Ayesha creates one from graph8's suggestion (small credit cost). Closer's deals land there. |
| D13 | Real credits | Standup shows real graph8 balance (from `/usage`) next to our budgets. Alert in `#sales-hq` if under 1,000. Internal budgets are 100,000/day (never block demo). |
| D14 | Target pick | Ayesha picks the top-priority persona/ICP, says why in one line, lists 1–2 alternatives. Founder redirects by chat. |
| D15 | Memory | Last ~20 messages of the thread/DM + fresh data every time + saved founder preferences. No long-term memory store. |
| D16 | New client (no docs) | Start graph8 analysis (~30 min, billable), post "Studying your company, back in ~30 min", resume automatically on completion webhook. Built, not demoed live. |
| D17 | Voice | Crisp, professional, numbers first. Occasional light Pakistani touch (e.g. "Assalam o Alaikum", "Shabash team"), never overdone. |
| D18 | Standup | Short card in `#sales-hq`: yesterday, today, needs you, pipeline numbers, credits (ours + real graph8). Per-agent detail (Bilal/Hira/Usman/Zara) in the thread. |
| D19 | Re-hire | `/hire-sales` when team exists → "Team's already here 👋" + status + `[Open Agent Office]`. Never a second team. Reset only via `scripts/reset-demo`. |

## 3. Live graph8 state (read-only check, 2026-09-27 ~05:00)

| Thing | State | Effect on Ayesha |
|---|---|---|
| Global Context | 23 docs, all completed (icp_research, persona_research, brand_voice, value_props, competitors, …) | Onboarding reads these in ~1 s (D2) |
| Pipelines | 0 | Create during onboarding (D12) |
| Mailboxes | 1 active Gmail, daily limit 40, no warmup | Email channel works |
| LinkedIn senders | 0 | Missing channel flow (D10) |
| Voice numbers | 1 (Twilio), daily limit 40 | Phone step possible |
| Credits | 9,074 available | Show + warn (D13) |

## 4. Tools

Every graph8 call goes through `g8.<action>(workspaceId, …)` (guard inside). Every Slack post through
`postAs(agentId, channel, text, { threadTs, blocks })`. Every LLM call through `llm.run(agentId, prompt, tools)`.
Every tool call is logged as a `run_steps` row under the current `agent_runs` row.

| # | Tool | Input | Output | graph8 call | Cost | Writes (Supabase) |
|---|---|---|---|---|---|---|
| T1 | `read_company_brain` | `workspaceId` | `SalesBrain { company, offer, icps[], personas[], voice, competitors, sources[] }` | `GET /global-context/documents` (`include_content=true`), `GET /icps`, `GET /personas` | free | `workspaces.sales_brain` |
| T2 | `start_company_analysis` | `workspaceId, domain` | `{ g8_task_id }` | `POST /intelligence/analyze`; completion via webhook `intelligence.completed` / `company_intelligence.completed` | billable (LLM tokens) | task `onboard` → `blocked_on='graph8'` |
| T3 | `setup_pipeline` | `workspaceId` | `{ g8_pipeline_id, stages[] }` | `POST /pipelines/suggest` (sync, not persisted) → `POST /pipelines/from-suggestion` | credits (g8_t2 tier, 1 call) | `workspaces` pipeline id (column TBD, see §8) |
| T4 | `check_channels` | `workspaceId` | `{ email: {ok, mailbox, daily_limit}, linkedin: {ok, senders}, phone: {ok, numbers} }` | `GET /mailboxes`, `GET /workflows/integrations/linkedin/senders`, `GET /voice/dialer/numbers` | free | missing → `approvals` `connect_account` |
| T5 | `check_credits` | `workspaceId` | `{ available, held, used }` | `GET /usage` | free | alert `reports` kind `alert` if < 1,000 |
| T6 | `delegate_task` | `agentRole, kind, title, input, parentTaskId` | `{ taskId, threadTs }` | none | free | `tasks` (child) + parent `blocked_on='task'`; posts thread in `#sales-team` |
| T7 | `request_approval` | `kind, title, payload, taskId` | `{ approvalId, slackTs }` | none | free | `approvals` (pending) + task `blocked_on='approval'`; agent status `waiting_on_you` |
| T8 | `post_update` | `channel, text, threadTs?, blocks?` | `{ slackTs }` | none | free | `reports` (kind `plan`/`update`/`win`/`alert`/`answer`) |
| T9 | `post_standup` | `workspaceId` | `{ slackTs }` | `GET /usage` (+ T10 data) | free | `reports` kind `standup` with numbers in `data` |
| T10 | `get_status` | `workspaceId, question` | facts for the answer (pipeline counts, tasks, agents, deals, sequence stats) | our DB views (`portal_pipeline`, `portal_agents`, `portal_today`) + graph8 deals / sequence metrics | free | none |
| T11 | `update_settings` | `patch` (e.g. `{ daily_find: 20, target_persona: '…', geo: ['UK'] }`) | new settings | none | free | workspace settings (column TBD, see §8) |
| T12 | `pause_team` / `resume_team` | `workspaceId, reason?` | `{ agents[] }` | none | free | `agents.status` `paused` / `idle` |
| T13 | `setup_intent_tracking` | `workspaceId, persona` | `{ keyword groups }` | `g8_intent_add_keywords` (keywords + `jobs` / `job_changes` from the ICP) | free to create; ~1 credit per 10 events processed | workspace settings (see §8). Added from Bilal session (B10). |
| T14 | `setup_ai_research` | `workspaceId, salesBrain` | `{ group_id }` | graph8 AI enrichment config (`web-research`, see `GET /enrichment/ai/configs`) | free to create; LLM credits when run | workspace settings (see §8). Added from Hira session (H7). |
| T15 | `setup_voice_agent` | `workspaceId, salesBrain` | `{ voice_agent_name }` | graph8 voice agent creation (API to verify) on number +19802944116 | free to create; ~20 credits/min when calling | workspace settings (see §8). Added from Usman session (U8). Founder confirms first. |

## 5. Playbooks (fixed order, Gemini inside steps)

### P1 — Onboarding (`/hire-sales <domain>`)

1. Ack (D7). Create task `onboard` (T-n) for Ayesha; live checklist message in `#sales-hq`.
2. Team exists? → D19 and stop.
3. **T1 read_company_brain.** No docs → T2 + "back in ~30 min" (D16) and stop; resume on webhook.
4. Gemini: pick target persona/ICP + 1–2 alternatives + one-line why (D14).
5. **T4 check_channels.** Missing channel → T7 `connect_account` (does not block, D10).
6. **T3 setup_pipeline** (D12) + **T13 setup_intent_tracking** (Bilal B10) + **T14 setup_ai_research** (Hira H7) + **T15 setup_voice_agent** (Usman U8).
7. **T5 check_credits.**
8. Post plan card (report kind `plan`): target, why, daily numbers, channels, team (org chart), budget, first standup time.
   Checklist message ends ✅.
9. Start **P2 daily run** immediately (first run).

### P2 — Daily run (09:00 PKT after standup, or when founder asks for more)

1. T6 → Bilal `find_prospects` (10 by default).
2. On done → T6 → Hira `research_leads` (top 5).
3. On done → T6 → Usman `build_sequence`.
4. On done → T7 `launch_sequence` in `#sales-hq` `[Launch] [Edit] [Skip]`.
5. Launch → Usman `launch_sequence` (enrolls **only** allowlisted test contacts).
6. Checklist message updates at each step; detail in its thread.

### P3 — Chat (mention or DM)

1. Ack (D7).
2. Gemini classifies intent with the tool list: in scope / sales-not-built / off-topic (D5).
3. In scope → call tools (T10 for questions, T11 for preference changes, T12 pause/resume, P2 for "find more",
   P4 for "standup").
4. Reply in thread; save preference changes (D15).

### P4 — Standup (09:00 PKT cron, `/sales-standup`, or "standup" in chat)

1. T5 + T10 → T9 short card in `#sales-hq`; per-agent detail in its thread (D18).
2. After the 09:00 standup → P2 (D11).

### P5 — Approvals

- Founder clicks → server updates `approvals`, clears Ayesha `waiting_on_you`, unblocks task, wakes the right agent.
- `Edit` → `edit_requested` + founder note → Usman revises → new approval.

## 6. Slack messages (examples, final copy at build time)

- Ack: `On it, hiring your sales team for 8x.social 👀`
- Checklist (edited in place):
  `✅ Read 23 company docs · ✅ Target: Series A–B fintech CFOs (UK/US) · ✅ Pipeline ready in graph8 · ⚠️ LinkedIn not connected, starting with email · ⏳ Bilal finding 10 leads…`
- Plan card: target + why, daily numbers, channels, team, budget, `[Open Agent Office]`.
- Launch ask: `Ready to launch to 5 leads (email → phone). One decision for you 👇 [Launch] [Edit] [Skip]`
- Out of scope, sales: `I can't do that yet. Right now I can find leads, research them, run outreach, and report on the pipeline.`
- Off-topic: `That's outside my job. I'm here for your sales 🙂`

## 7. Guardrails

- Never sends to anyone. Outreach only through Usman/Zara, and the `g8.ts` guard allows only `contact_allowlist` /
  `is_test_contact`.
- Credit-spending graph8 calls (T2, T3) are logged in `credit_events` (source graph8). LLM usage logged as source llm.
- No PII in `reports.body`, `tasks.result_summary`, or Slack summaries in `#sales-hq`.

## 8. Open items (to settle at build time)

1. Verify exact shapes of T1, T3, T4, T5 endpoints live (free GETs; T3 costs credits, test once).
2. Schema: where to store `g8_pipeline_id` and workspace settings (defaults, target persona, geo). Likely
   `workspaces.settings jsonb` + `workspaces.g8_pipeline_id` in migration `002`.
3. Slack "live checklist" needs `chat.update` on the ack message; store its `ts` on the task.
