# Project Brief — "Autopilot": your AI sales team on graph8

> Working name. Rename anytime. This doc is the single source of truth for the team.
> Related: `docs/okara-research.md` (inspiration), `docs/SDK-GUIDE.md` (how to call graph8), `docs/platform-inventory.md` (what's in the app).

---

## 1. One-liner
**Paste your company's website. Four AI agents find your buyers, write to them, handle the replies, and book meetings — all on graph8, with you approving every send.**

Pitch: *"Okara gave founders an AI marketing team. We built the AI sales team — running entirely on graph8."*

Hackathon theme match: "Build the revenue machine that runs itself." Tracks: **Pipelines** (signal → sequence → reply, no human until replies) + **Agents** (SDR working lists end-to-end, operator proposing actions).

---

## 2. The problem (why this matters)
A founder or small sales team wants customers. graph8 already has every piece — 700M contacts, intent signals, AI research, sequences, inbox, booking, CRM. But today:
- Pieces are **disconnected** — a human clicks through Data → Signals → Studio → Engage → Revenue by hand.
- Getting started is **slow**: a 37-question kickoff, and campaigns stay **locked** until 5 research workflows finish.
- The specialist AI agents are **off by default** ("0 operators on watch").
- Nobody tells you **"what to do next"** in one place.

(All observed first-hand — see `docs/platform-inventory.md`.)

## 3. The solution
One app, built on top of graph8, that runs the whole chain automatically and only stops to ask a human **"Approve this?"**

```
Website URL
   │
   ▼
[Sales Brain]  research your company → offer, ideal customer, buyer personas, competitors, tone
   │
   ▼
[Scout]        find matching companies + people, check buying signals, rank them
   │
   ▼
[Researcher]   enrich top prospects, save them to graph8 CRM + a list
   │
   ▼
[Writer]       write a personal first email for each prospect
   │
   ▼
[Deal Feed]    YOU: Approve / Edit / Skip        ← the only human step
   │
   ▼
[Send]         enroll in a graph8 sequence → lands in SANDBOX outbox (no real email)
   │
   ▼
[Closer]       reply comes in → AI classifies it → acts:
                 interested   → book meeting + create deal
                 wrong person → Scout finds the right person, Writer drafts to them
                 not now      → follow-up task in 90 days
                 objection    → draft answer → back to Deal Feed for approval
   │
   ▼
[Pipeline]     deal visible inside the real graph8 app
```

---

## 4. The four agents (named, like Okara's)
| Agent | Job | graph8 parts it uses |
|---|---|---|
| **Scout** | Turns the ideal-customer profile into search filters, finds companies + people, checks intent / hiring signals, ranks by "readiness to buy" | `g8.search`, `g8.enrich.search`, `g8.signals.company`, Intent, Hiring signals |
| **Researcher** | Enriches the top prospects (credits!), saves them to CRM + a list, writes a "why this person" note | `g8.enrich.person/company`, `g8.contacts.create`, `g8.lists`, `g8.fields`, `g8.notes` |
| **Writer** | Writes a short personal email per prospect using the Sales Brain + prospect facts | `g8.skills` (graph8 LLM skill) → fallback Claude API |
| **Closer** | Reads replies, classifies intent, books meetings, creates deals, sets follow-up tasks | Webhooks, AI Inbox, `g8.calendar`/Appointments, `g8.deals`, `g8.tasks` |

Each agent shows a live status in the UI: `idle → working… → done (12 found)`.

---

## 5. Screens (what the user sees)
**Screen 1 — Start**
- Big input: "Paste your website" → [Start Autopilot]
- (Optional) "Or describe who you sell to" text box.

**Screen 2 — Mission Control** (the main screen, the demo lives here)
```
┌──────────────────────────────────────────────────────────────────────┐
│  Autopilot · acme.com          Prospects 24 · Sent 3 · Replies 1 · Meetings 1 · Pipeline $12k │
├───────────────┬──────────────────────────────────┬───────────────────┤
│ SALES BRAIN   │ DEAL FEED                        │ AGENTS            │
│ ▸ Offer       │ ┌──────────────────────────────┐ │ Scout      ✓ 24   │
│ ▸ Ideal cust. │ │ 🔥 Acme hiring 3 SDRs         │ │ Researcher ⟳ 5/8  │
│ ▸ Personas    │ │ Jane Doe · VP Sales           │ │ Writer     ⟳      │
│ ▸ Competitors │ │ "Hi Jane — saw you're scaling │ │ Closer     idle   │
│ ▸ Tone        │ │  the SDR team…"               │ │                   │
│               │ │ [Approve] [Edit] [Skip]       │ │ LIVE LOG          │
│               │ └──────────────────────────────┘ │ 18:02 Scout found │
│               │ ┌──────────────────────────────┐ │ 18:03 Enriched…   │
│               │ │ ✉ Reply from Bob · Interested │ │                   │
│               │ │ Meeting booked Tue 3pm · Deal │ │                   │
│               │ └──────────────────────────────┘ │                   │
├───────────────┴──────────────────────────────────┴───────────────────┤
│ Tabs: Feed | Sandbox Outbox | Pipeline | Talk to your team (stretch)  │
└──────────────────────────────────────────────────────────────────────┘
```

**Demo panel** (hidden, for us): [Simulate reply ▾ interested / wrong person / not now / objection] · [Reset demo] (sandbox snapshot restore).

---

## 6. Tech architecture
- **Next.js (App Router, TypeScript) + Tailwind** — one repo, frontend + backend together.
- **`@graph8/sdk`** on the **server only** (API routes / server actions). API key never in browser.
- **Agents** = plain TypeScript functions in `lib/agents/*` that call the SDK. An orchestrator runs them in order and emits events.
- **Live updates** to the UI = Server-Sent Events (or 1-second polling if SSE is a pain).
- **State** = graph8 itself is the database where possible (contacts, lists, notes, deals, tasks). Small local store (in-memory / JSON / SQLite) only for feed cards + run log.
- **LLM** = graph8 Skills first (counts as platform usage). Fallback: Claude API if skills are slow/blocked.
- **Webhooks** = `POST /api/webhooks/graph8`, verified with `g8.webhooks.constructEvent`. Exposed to the internet with `cloudflared` / `ngrok` during dev.
- **Secrets** = `.env.local` (gitignored): `G8_API_KEY`, `G8_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` (optional).

Suggested folder layout (each teammate owns different folders → no merge fights):
```
app/
  page.tsx                  Start screen                     (B)
  run/[id]/page.tsx         Mission Control                  (B)
  api/run/route.ts          start a run                      (A)
  api/run/[id]/events       SSE stream                       (A)
  api/approve/route.ts      approve / edit / skip a card     (A)
  api/webhooks/graph8       webhook receiver                 (C)
  api/demo/*                simulate reply, reset            (C)
components/                 UI pieces                        (B)
lib/
  types.ts                  SHARED CONTRACT — agree first!   (all)
  g8.ts                     SDK init (server)                (A)
  agents/brain.ts scout.ts researcher.ts writer.ts closer.ts (A)
  orchestrator.ts           runs agents, emits events        (A)
scripts/                    sandbox seed/snapshot, smoke tests (C)
```

**Shared contract first** (`lib/types.ts`) — so B can build the UI with fake data while A builds real agents:
```ts
type AgentName = 'scout' | 'researcher' | 'writer' | 'closer';
type AgentStatus = { agent: AgentName; state: 'idle' | 'working' | 'done' | 'error'; detail?: string; count?: number };
type BrainDoc = { kind: 'offer' | 'icp' | 'personas' | 'competitors' | 'tone'; title: string; body: string; source: 'graph8' | 'ai' };
type Prospect = { contactId?: number; name: string; title: string; company: string; domain: string; signals: string[]; score: number; why: string };
type FeedCard =
  | { id: string; type: 'draft'; prospect: Prospect; subject: string; body: string; status: 'pending' | 'approved' | 'skipped' | 'sent' }
  | { id: string; type: 'reply'; prospect: Prospect; replyText: string; intent: 'interested' | 'not_now' | 'wrong_person' | 'objection'; action: string }
  | { id: string; type: 'meeting' | 'deal'; prospect: Prospect; detail: string };
type RunEvent = { at: string; kind: 'status' | 'card' | 'brain' | 'log' | 'metric'; payload: unknown };
```

---

## 7. Step-by-step: which graph8 calls
| Step | What happens | Calls (see `docs/SDK-GUIDE.md`) | Cost |
|---|---|---|---|
| 0. Setup | Seed sandbox data, take snapshot for reset | `g8.api` → `/sandbox/fixtures/seed`, `/snapshot`, `/restore`, `/status` | free |
| 1. Sales Brain | Analyze website, read ICPs/personas/context | `/intelligence/analyze` + poll `/intelligence/status/{id}`; `g8.studio.icps()`, `personas()`, `globalContext()` | some credits |
| 2. Scout | ICP → filters → people + companies; signals per company | `g8.search.contacts/companies` or `g8.enrich.search`; `g8.signals.company(domain)`; `/hiring-signals/jobs` | search free |
| 3. Researcher | Enrich top N (keep N small, ~5–8), save to CRM + list, score field, note | `g8.enrich.person/company`; `g8.contacts.create(…, idemKey)`; `g8.lists.create/addContacts`; `g8.fields.create/setValue`; `g8.notes.create` | 1 credit / enrich |
| 4. Writer | Draft email per prospect | `g8.skills.createLLM` once, then `g8.skills.execute` per prospect | AI credits |
| 5. Approve | Human clicks Approve/Edit/Skip | our API; stretch: mirror as graph8 `/agent/approvals` | free |
| 6. Send | Create sequence w/ approved copy, enroll contacts, show outbox | `g8.sequences.create/updateStep/add/run`; `/sandbox/outbox` | sandbox |
| 7. Reply | Reply event arrives | webhook `engagement.email_replied` (or our "Simulate reply" button) | — |
| 8. Closer | Classify + act | `g8.skills.execute` (classifier); `g8.calendar.slots/book` or Appointments API; `g8.deals.create`; `g8.tasks.create`; `g8.notes.create` | some |
| 9. Proof | Open graph8 app → deal/contacts/list are really there | — | — |

**Credit budget:** 1,300 credits on main account + sandbox credits from organizers. Search is free → search wide, enrich narrow.

---

## 8. Build plan — layers (each layer is a working demo on its own)
| Layer | Scope | Target time | Demo if we stop here |
|---|---|---|---|
| **L0** | Repo scaffold, keys in `.env.local`, "hello world" call to every surface we need (smoke test script) | Sat 20:00 | — |
| **L1** | Sales Brain + Scout + Researcher → contacts & list appear in graph8 | Sat 22:00 | "AI finds and researches your buyers" |
| **L2** | Writer + Deal Feed approve + Send → sandbox outbox | Sat night / Sun 12:30 | "AI prospects for you, human approves" |
| **L3** | Reply → Closer → meeting + deal in graph8 | Sun 14:00 | "The machine runs itself" ✅ |
| **L4** | UI polish, funnel numbers, reset button, backup video, rehearse ×3 | Sun 17:00 | Winning demo |
| Stretch | "Talk to your team" chat, voice agent call-back, graph8 native approvals, signal-triggered auto-runs | only if ahead | "Most Ambitious" |

**Hard deadlines:** repo **public by Sun 14:00** · code freeze **Sun 17:30** · demo **Sun 18:00**.
Venue closes 22:00 Sat → continue at home overnight.
**Commit + push small and often** (proves work was done this weekend).

---

## 9. Team split
| Person | Owns | First task (right now) |
|---|---|---|
| **A — Agents / backend** | `lib/agents/*`, `lib/orchestrator.ts`, `app/api/run*`, `app/api/approve` | Smoke-test SDK calls: search, signals, contacts, lists, skills, sequences |
| **B — UI / product** | `app/page.tsx`, `app/run/*`, `components/*` | Build Mission Control with **fake data** matching `lib/types.ts` |
| **C — Platform / demo** | sandbox scripts, webhooks, demo panel, pitch, mentor liaison | Get sandbox key, ask mentor questions (below), set up tunnel + webhook receiver |

Rules: agree `lib/types.ts` first (15 min, together). Then work in parallel. Merge to `graph8-hackathon` often. Each person can run their own AI coding agents inside their own folders.

---

## 10. Demo script (5 min, live)
| Time | What we show | What we say |
|---|---|---|
| 0:00–0:30 | Title | "Founders need sales. graph8 has every piece — but it takes 37 questions and six sections to start." |
| 0:30–1:30 | Paste URL → Sales Brain fills | "Autopilot reads your site and builds your sales brain using graph8's own intelligence." |
| 1:30–2:30 | Agents working, Deal Feed fills | "Scout found 24 buyers with live hiring signals. Researcher enriched the top 8. Writer drafted each email." |
| 2:30–3:15 | Approve 3 → Sandbox Outbox | "Nothing goes out without you. Approved — sent through graph8 sequences." |
| 3:15–4:15 | Reply arrives → meeting + deal | "Bob replied 'interested'. Closer booked Tuesday 3pm and created a $12k deal." |
| 4:15–5:00 | Open real graph8 app → deal is there | "Everything lives in graph8 — contacts, list, sequence, deal. The revenue machine runs itself." |

Backup: pre-recorded video + sandbox snapshot restore if live fails.

---

## 11. How this scores (100 pts)
| Criterion | Pts | How we win it |
|---|---|---|
| Works end-to-end on graph8 | 35 | Real calls at every step; finish by showing the deal inside graph8 |
| Useful to a real team | 25 | Solves observed friction: disconnected sections, slow start, agents off |
| Product taste & UX | 20 | One clean Mission Control screen, Okara-style feed, named agents |
| Technical quality + platform use | 20 | 10+ surfaces, webhooks verified, idempotent writes, sandbox snapshot/reset, error handling |

---

## 12. Risks & fallbacks
| Risk | Fallback |
|---|---|
| `/intelligence/analyze` too slow | Pre-run for demo company; or quick LLM summary of the homepage |
| Skills API slow/blocked | Claude API for Writer + Closer |
| Sandbox can't simulate replies | "Simulate reply" button feeds our own pipeline (honest: say it's simulated) |
| Sequence enroll blocked in sandbox | Show generated sequence + preview (`g8.sequences.preview`) + outbox mock |
| Booking API complex | Create meeting as task + deal stage "Meeting booked" |
| Credits run out | Search is free; enrich only top 5; use teammates' accounts |
| Live demo breaks | Snapshot restore + backup video |

## 13. Open questions for mentors (ask ASAP)
1. Is the sandbox key a `g8_test_` key? Do sequence sends automatically go to `/sandbox/outbox`?
2. Can we simulate an inbound reply so `engagement.email_replied` fires?
3. Do Skills (LLM) and Company Intelligence work in sandbox? Credit cost?
4. Can voice agents / booking be used in sandbox?
5. Can we get the `examples/ai-sdr` reference source?
6. Credits per team?

## 14. Words you'll hear
ICP = ideal customer profile · Persona = type of buyer (e.g. VP Sales) · Enrichment = filling in missing data · Intent signal = sign a company may buy · Sequence = automatic multi-step outreach · Sandbox = safe test mode, nothing real is sent · Deal = sales opportunity in CRM · Webhook = graph8 calling our server when something happens.
