# Project Brief (LOCKED 2026-09-27 02:25 PKT) — AI Sales Team that lives in Slack

> Read `docs/VISION-NOTES.md` first (the why). This file is the what + how.
> Previous direction archived: `docs/archive/IDEA-v1-autopilot-dashboard.md`.

## 1. One-liner
**"The $1B solo founder has no sales team. Now they do — it lives in Slack, reports every morning, runs on graph8, and never asks them to learn a tool."**

Working name: **Hire** (`/hire-sales`). Rename freely.

## 2. Who & why
- **User:** solo founder / 2–3 person team with a big vision, no sales hire, no time.
- **They give:** 5 minutes a day. Read a standup, click Approve, ask a question.
- **They never:** learn a dashboard, configure sequences, watch 5 channels.
- **Why now:** one-person companies run on agents; sales is the part they can't hand off yet.
- **Why us vs graph8's own Chief of Staff:** graph8 has powerful agents and tools *inside its app* and sends notifications to Slack. We give the founder a **whole accountable sales department** — an org chart of agents with roles, budgets and standups — **living in Slack**, doing the real multi-channel sales process on graph8.

## 3. The experience (all in Slack)
```
Founder:  /hire-sales acme.com
          │
          ▼
#sales-hq   🧑‍💼 Head of Sales: "Hired. I read acme.com + graph8's company docs.
            Plan: target Series A fintech CFOs in US. Team: Scout, Researcher, SDR, Closer.
            Budget: 500 credits/day. First standup 9:00."           [org chart posted]
          │
#sales-team 🔎 Scout → Head: "Found 12 accounts with buying signals (3 hiring finance roles)."
            🧪 Researcher → Head: "Enriched 12 people, wrote 'why now' for each."
            ✍️ SDR → Head: "Drafted 7-touch sequence: email → LinkedIn connect (refs email)
                           → LinkedIn msg → email 2 → call → LinkedIn msg 2 → breakup."
          │
#sales-hq   Head of Sales → Founder: "Ready to launch to 12 leads. [Approve] [Edit] [Skip]"
            (if mailbox not connected yet: "I need your mailbox to send. [Connect in graph8]")
          │
          ▼  (graph8 runs the sequence; webhooks come back)
#sales-team 🤝 Closer → Head: "Sarah (Acme) replied on LinkedIn: interested.
                              Stopped all channels for Acme. Proposed Tue 3pm."
#sales-hq   Head of Sales → Founder: "🎉 Meeting booked with Sarah, Acme — Tue 3pm (Meet link).
                                     Deal created: $12k, stage Discovery. [Open in graph8]"
          │
Every morning 9:00 (and on /sales-standup):
#sales-hq   📋 Standup: yesterday / today / blockers / pipeline / credits spent per agent
DM          Founder: "how's pipeline?"  → Head of Sales answers from live graph8 data
```

## 4. The org chart (Paperclip pattern, our own code)
| Agent | Reports to | Job | graph8 used | Extra |
|---|---|---|---|---|
| **Head of Sales** | Founder | Reads context, sets goals, assigns tasks, rolls up reports, asks approvals, answers founder | Global Context docs, ICPs/Personas (free), `/usage`, deals, sequence analytics | Gemini API |
| **Scout** | Head | Find accounts + people matching ICP, rank by signals | `find_companies/contacts` (free), intent/signals, visitors | TinyFish signal checks (careers pages, news) |
| **Researcher** | Head | Enrich, write "why this person, why now" | enrichment (credits), company intelligence | TinyFish free Search/Fetch on prospect site/news |
| **SDR** | Head | Build + launch multi-channel sequence (FLOW.md stage 4) | lists, `POST /sequences` (EMAIL + LINKEDIN + PHONE steps, `finish_on_reply`), `sequencer/content/*/generate` or Claude | respects TEST allowlist |
| **Closer** | Head | Handle replies → classify → next action → meeting → deal | webhooks (`email_replied`, `linkedin_reply_received`, `meeting.*`), inbox, appointments (event type "Discovery call"), deals | stop-all-channels per account |

Each agent has: `role`, `reports_to`, `budget_credits`, `spent_credits`, `status`, current task.
Tasks: `parent_id`, `assignee`, `status (todo/doing/done/blocked)`, `result`, comments. Delegation = Head creates task for sub-agent; reporting = sub-agent posts result on the task → Head rolls up.
**Heartbeat:** Head runs a cycle on schedule (standup) and on events (webhook, approval, founder message).

### 4.1 How agents appear in Slack (one bot, five personas)
- **One Slack app** posts as different agents using per-message `username` + `icon_url` (scope `chat:write.customize`). No need for 5 separate bot apps.
- **`#sales-team` — the agents' office** (founder may watch):
  ```
  🧑‍💼 Head of Sales:  @Scout find 15 fintech CFOs with buying signals
     └ thread:
       🔎 Scout:       On it…
       🔎 Scout:       Done — 12 found, 3 hiring finance. @Head of Sales
       🧑‍💼 Head:        Good. @Researcher enrich these 12
       🧪 Researcher:  Done — "why now" written for each.
  ```
  - **1 task = 1 thread**: the boss assigns in the parent message; the agent replies in the thread. The thread `ts` is stored on the task row → Slack thread **is** the task (Paperclip ticket pattern). Same record feeds the Agent Office.
  - `@Agent` tags are visual (agents aren't real Slack users) — bold names.
- **`#sales-hq` — only Head of Sales ↔ founder**: standups, approvals, wins, answers. Clean; this is the 5-minute channel.
- **Talking to agents:** founder talks to Head of Sales (it delegates). Optional: "@Closer …" routes directly to that agent.
- **Effort:** personas ~30 min · threads-as-tasks ~1 h · direct @routing ~1 h (optional).

## 5. Web "Agent Office" (secondary, read-only)
One page. No settings. For the projector + to make the hierarchy visible.
- Live **org chart** (Founder → Head → 4 agents), each node pulsing with status + current task.
- **Report stream**: messages flowing up the chain (same as #sales-team).
- **Pipeline strip**: prospects → contacted → replied → meetings → deals, + credits spent per agent.
- Link: "Open in graph8" on every object.

## 6. Architecture
```
Slack (Socket Mode, no public URL)          graph8 (be.graph8.com)
        │  commands, buttons, DMs                 ▲  SDK / REST (server only)
        ▼                                         │
┌──────────────── agents server (Node/TS) ───────────────────┐
│ Slack Bolt │ Orchestrator (heartbeat, tasks) │ Agent brains  │
│            │ Store (Supabase Postgres)       │ (Gemini API + │
│ Webhook route /webhooks/graph8 ◄── tunnel ── graph8 events  │
│ writes to Supabase ── Realtime ──► Agent Office (Next.js)   │
│ TinyFish client (search/fetch/monitors)                     │
└─────────────────────────────────────────────────────────────┘
```
- **LLM:** **Gemini API** (team has keys; cheaper than Claude) with function calling; tools = thin wrappers over graph8 SDK calls. Model: **Gemini 3.8 Flash** for all agents (team decision); **paid tier 1** key. Verify the exact model ID string via the key's `models.list` before coding. LLM behind one small interface (`llm.ts`) so the provider can be swapped. (graph8's own AI costs ~20 credits/run → avoid.)
- **Store:** **Supabase** (Postgres + Realtime + Auth). Tables: `workspaces`, `agents`, `tasks`, `reports`, `approvals`, `leads`, `events` — **every table has `workspace_id`** (1 workspace = 1 client).
- **Safety:** `TEST_ALLOWLIST` (team emails/phones/LinkedIns) enforced in code — any enroll/send/call to anyone else is refused. Real graph8 data is searched, never contacted.
- **Secrets:** server `.env.local` (gitignored): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`, `TINYFISH_API_KEY`, `TEST_ALLOWLIST`, `DEMO_TIME_SCALE`. **Per-client** keys (graph8 API key, Slack bot token, webhook secret) live in the `workspaces` row, not in env.

### Folder layout (ownership avoids merge conflicts)
```
server/
  index.ts                 (A)  boot: Bolt + HTTP + scheduler
  slack/commands.ts        (B)  /hire-sales, /sales-standup, /sales-status
  slack/blocks.ts          (B)  standup, approval, report, org-chart messages
  slack/actions.ts         (B)  Approve/Edit/Skip handlers → orchestrator
  orchestrator.ts          (A)  heartbeat, task delegation, roll-up
  agents/head.ts scout.ts researcher.ts sdr.ts closer.ts   (A)
  tools/g8.ts              (A)  graph8 SDK wrappers (+ allowlist guard)
  tools/tinyfish.ts        (C)
  webhooks/graph8.ts       (C)  verify signature → events → Closer
  store.ts                 (A)  Supabase client + queries (always scoped by workspace_id)
  llm.ts                   (A)  Gemini wrapper (function calling), swappable
  types.ts                 (all) shared contract — agree FIRST
office/                    (B)  Next.js Agent Office (reads /api/state + SSE)
scripts/                   (C)  smoke-test, seed test contacts, reset demo, simulate reply
```

### 6.1 Multi-client (design now, build only what the demo needs)
- **Built now:** `workspace_id` on every table; per-workspace graph8 key + Slack token stored in `workspaces`; every Slack event resolves its workspace first, then uses that client's graph8 key.
- **Pitch slide only (not built):** public "Add to Slack" install for any company, billing/plans, self-serve "Sign in with graph8" (graph8 supports OAuth — our MCP used it).
- **Onboarding answer for judges:** "Founder clicks Add to Slack → `/hire-sales theirsite.com` → connects graph8 once → Head of Sales takes over. Each client = own workspace row, own graph8 org, own keys and credit budgets."
- **Deploy:** agents server (Bolt + orchestrator + webhooks, long-running) → **Railway/Fly.io**; Agent Office (Next.js) → **Vercel**; data/realtime/auth → **Supabase**; actions → client's **graph8** org; reasoning → **Gemini**. Demo may run the server on a laptop + tunnel; deploy if time allows.
- **Known caveat:** Slack Socket Mode is fine for the demo; a public Slack Marketplace app needs HTTP events mode — a config switch in Bolt, same code.

### 6.2 Demo-ready but real ("real path, pre-warmed state")
Goal: the 5-minute demo never waits on slow work, **and** the same code works for a real client.

1. **One code path.** No fake/mock branch. Demo speed comes from **pre-computed state**, not from faking results.
2. **Reuse before redo (production behavior too).** Every agent step first checks the store / graph8 for a fresh result and reuses it:
   - Company docs: graph8's Studio already generated the Global Context (ICP, personas, etc.) for our demo company → Head of Sales **reads** them in ~1s instead of starting a 30-min analysis. Real new client with no docs → Head kicks off `POST /intelligence/analyze` in the background and posts "analysing, back in ~30 min".
   - Prospects, enrichment, "why now": cached per workspace; re-used unless stale.
3. **Pre-warm script** (`scripts/prewarm.ts`, run before the demo): runs onboarding for the demo company end-to-end once (context read, Scout + Researcher results stored, sequence content drafted), so on stage the agents post in seconds. Same functions the live flow calls.
4. **Long jobs never block.** Slow work runs async; the agent posts "working…" and reports when done. The demo only shows steps that are already warm or fast.
5. **Time compression, not fake time.** `DEMO_TIME_SCALE` config: real clients get day-based delays; demo workspace uses minute/second delays (graph8 sequence `time_interval` is in seconds). Same code, different config.
6. **graph8 sending window:** org default schedule is **Mon–Fri 09:00–17:00 UTC only** → demo is **Sunday** → create a **24/7 "Demo" schedule** and attach it to the demo sequence, or nothing sends.
7. **Live trigger + backup.** A teammate replies from their phone live; backup `scripts/simulate-reply.ts` posts a signed webhook event if the tunnel/email is slow.
8. **Reset script** (`scripts/reset-demo.ts`): returns the demo workspace to a known state (clear tasks/threads, remove test enrollments) so we can rehearse repeatedly.
9. **Safety stays on:** demo sends only to `TEST_ALLOWLIST` (team contacts).
10. **Rehearse 3× + record a backup video** of the full run.

## 7. Build layers (each layer = working demo)
| Layer | Done when | Target |
|---|---|---|
| **L0** | Repo scaffold, `types.ts`, Slack app created, bot answers `/hire-sales` with "hi" | 11:00 |
| **L1** | `/hire-sales url` → Head reads graph8 context → Scout posts 10 real prospects + org chart in Slack | 13:00 |
| **L2** | Researcher "why now" → SDR multi-channel sequence created in graph8 → Slack Approve → test contact enrolled → **real email arrives** | 14:30 |
| — | **Repo public** | **14:00** |
| **L3** | Reply → webhook → Closer classifies → stops channels → books meeting → deal in graph8 → Slack | 16:00 |
| **L4** | Standup roll-up + per-agent credit budgets + Agent Office page + TinyFish signals | 17:15 |
| — | **Code freeze** | **17:30** |

## 8. Team split
- **A — Agents & graph8 (backend brain):** store, orchestrator, 5 agents, `tools/g8.ts`, allowlist guard.
- **B — Slack & Office (the face):** Slack app + Bolt, commands, Block Kit messages, approval buttons, Agent Office page. Start with fake data from `types.ts`.
- **C — Plumbing, demo & pitch:** Slack app creation, tunnel + graph8 webhook registration, TinyFish, test contacts + allowlist, scripts (reset/simulate), demo rehearsal, pitch, make repo public at 14:00.

## 9. Demo (5 min)
| Time | Beat |
|---|---|
| 0:00–0:30 | "One-person $1B companies are coming. They have no sales team. Watch me hire one in Slack." |
| 0:30–1:30 | `/hire-sales acme.com` → Head posts plan + org chart; Agent Office shows agents lighting up |
| 1:30–2:30 | Scout / Researcher / SDR report up; real prospects + why-now + 7-touch multi-channel sequence |
| 2:30–3:15 | Founder clicks **Approve** in Slack → sequence live in graph8 → teammate's phone gets the email |
| 3:15–4:15 | Teammate replies → Closer: "interested, stopped all channels, meeting Tue 3pm" → deal in graph8 |
| 4:15–5:00 | `/sales-standup` → morning report with pipeline + credits per agent. Close: "5 minutes a day." |

## 10. Scoring map
| Criterion | How |
|---|---|
| End-to-end on graph8 (35) | Real search → enrichment → sequence → webhook → meeting → deal, opened live in graph8 |
| Useful (25) | Solo founder gets a sales dept with zero learning curve; real multi-channel process |
| UX (20) | Zero new UI to learn: Slack + one glanceable Agent Office |
| Tech + platform breadth (20) | Agent hierarchy with budgets/heartbeats, webhooks, sequences (email+LinkedIn+call), inbox, appointments, deals, context docs, TinyFish |

## 11. Risks & fallbacks
| Risk | Fallback |
|---|---|
| LinkedIn (Netrion) not connected | Sequence still includes LinkedIn steps; demo email + call channels; show LinkedIn step as "queued" |
| Webhook tunnel flaky | `scripts/simulate-reply` posts a signed test event locally |
| graph8 search slow/timeouts (seen: broad filters time out) | Narrow filters; cache a prospect set before demo |
| Claude/graph8 latency on stage | Pre-run L1 before demo; demo uses "fast-forward" for day gaps |
| Credits burn | Per-agent budget caps enforced in orchestrator |
| Sending to real people | `TEST_ALLOWLIST` hard guard in `tools/g8.ts` |
| graph8 only sends Mon–Fri 09–17 UTC; demo is Sunday | Create 24/7 "Demo" sending schedule, attach to demo sequence (§6.2) |
| Website → docs takes ~30 min | Demo company docs already exist in graph8 (23 docs for **8x.social**, generated 2026-09-26) → Head reads them; pre-warm script (§6.2) |
| Gemini function calling quirks / latency | Keep prompts small, `llm.ts` swappable; pre-warm heavy steps |

## 12. Judge Q&A
- **"graph8's Chief of Staff already does this."** → "It's an assistant inside graph8. We give a solo founder a whole accountable sales department — org chart, budgets, standups — in Slack, running the real multi-channel process on graph8. Every action is a graph8 object."
- **"Why Slack?"** → "Our user won't learn a new tool. The best UI for a 5-minute founder is the one they already have open."
- **"Why not full autonomy?"** → "Sends go through one approval click — the same trust pattern Okara users praise."
