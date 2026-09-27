# Agent Office portal — brief for the front-end engineer

Read order: this file → `01-data-access.md` → `02-screens.md` → `03-vocabulary.md` → `04-acceptance.md`.
Data contract: `docs/SCHEMA.md`, `shared/types.ts`, `supabase/seed.sql` (copy `types.ts` into the app; it is the truth).

## 1. What this is

A **read-only** web page where a solo founder sees their AI sales team at work. The team lives in Slack
(that is where the founder talks and clicks Approve). All real sales actions happen in **graph8**
(CRM, sequences, meetings, deals). The portal only answers three questions, in this order:

1. **Is my team working?** (org chart with live status)
2. **What needs me?** (pending approvals, tasks blocked on the founder)
3. **What did it achieve?** (today's numbers, pipeline, reports)

The founder gives it five minutes a day. Judges see it on a projector for ~90 seconds during a 5-minute
demo while things visibly change (Realtime). It is not a dashboard to configure anything, not a graph8
clone, not a chat.

Product rules (non-negotiable):
- **Read-only.** No buttons that mutate. Every task/approval/report links "Open in Slack". Every lead /
  sequence / deal links "Open in graph8". The portal never shows an Approve button.
- **Live.** Every screen updates without reload via Supabase Realtime (see `01-data-access.md`).
- **One vocabulary.** Words and status colours come from `03-vocabulary.md`. Never invent a synonym.
- **No PII.** The database already hides emails/phones/LinkedIn from the anon key. Do not try to fetch them.
- **One workspace.** The demo workspace id is fixed (`DEMO_WORKSPACE_ID` in `types.ts`). Route `/` = that
  workspace. Keep `workspaceId` a parameter everywhere so `/w/[slug]` is a 10-minute change later.

## 2. The team (persona names are what the user sees)

| Persona | Role (`agents.role`) | Reports to | Job |
|---|---|---|---|
| **Ayesha** | `head_of_sales` | Founder | plan, delegate, roll up reports, ask for approvals |
| **Bilal** | `scout` | Ayesha | find accounts + people that match the ICP |
| **Hira** | `researcher` | Ayesha | enrich, write the "why now" |
| **Usman** | `sdr` | Ayesha | build + run the multi-channel sequence in graph8 |
| **Zara** | `closer` | Ayesha | handle replies, book the meeting, open the deal |

Show **name** big and **title** small (`agents.title`, e.g. "Head of Sales"). Emoji/colour per agent come
from the row (`emoji`, `color`); the designer may restyle, but keep colour consistent with Slack.

## 3. Scope for ~10 hours, one engineer

Build in this order. Each step is demoable on its own.

| # | Deliverable | Time | Cut? |
|---|---|---|---|
| 0 | Shell: Next.js app, Supabase client, `useWorkspaceRealtime` hook, status vocabulary components (Badge, EmptyState, TimeAgo, Credits) | 1.5 h | never |
| 1 | **Office** screen: zoomable/pannable org-chart canvas (pan, zoom, fit-to-screen, SVG edges) with live agent cards + "Needs you" banner + today strip | 3.5 h | never |
| 2 | **Task drawer** (click a card's task or a task in a list): tree of subtasks, reports in thread, Open in Slack | 1.5 h | never |
| 3 | **Pipeline** screen: funnel strip + lead table + lead timeline drawer | 2 h | timeline drawer is cuttable |
| 4 | **Empty/onboarding** state (workspace has no agents or no tasks) | 0.5 h | never (30-second job) |
| 5 | **Needs you** page (full list of `portal_needs_you`) | 0.5 h | cut first (banner on Office covers it) |
| 6 | **Reports** page (standups, wins, handoffs stream) | 1 h | cut second |
| 7 | **Agent detail** page (budget, runs, task history) | 1 h | cut third |
| — | Keyboard shortcuts, dark mode toggle, charts, minimap | — | nice-to-have only |

Cut order if late: 7 → 6 → 5 → pipeline timeline drawer.
Never cut: live org-chart canvas with pan/zoom/fit, needs-you banner, today strip, task drawer, pipeline strip, Open-in links.

## 4. Tech (recommended, not mandated)

- Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui. Client components for anything live.
- `@supabase/supabase-js` v2 with the **anon key** only. No auth for the demo (workspace is `is_demo = true`).
- Data fetching: plain `supabase.from(...)` in a small `queries.ts` + TanStack Query (or SWR). Realtime
  events just **invalidate** the relevant query (see `01-data-access.md` §4). Do not hand-patch caches.
- Org chart: **`@xyflow/react` (React Flow)** — pan, zoom, fit-to-view, SVG edges and custom nodes come free.
  Layout is computed by hand (3 levels, 6 nodes: `y = level * 220`, siblings spaced evenly); no dagre.
  Custom node = the Agent card component. Founder decision: pan/zoom/fit are **not optional**.
- Code lives in **`office/`** in this repo (pnpm workspace member). Deploy: Vercel, root directory `office`.
  Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_WORKSPACE_ID` (default `a0000000-0000-4000-8000-000000000001`),
  `NEXT_PUBLIC_G8_APP_URL` (default `https://app.graph8.com`). Never the service-role key.

## 5. Setup

> **Update 15:40:** the server is live and the demo workspace holds real data (see HANDOFF-NOTE). The text below
> about the fake seed is historical — never re-run `seed.sql`. Between rehearsals the workspace is reset to empty.

### Original notes (before the server existed)

You never need our server. The database is fully seeded with a realistic fake day (`supabase/seed.sql`):
5 agents, 10 tasks (one blocked on an approval), 8 leads across every stage, 32 timeline events, 10
reports, 2 approvals (1 pending), credit ledger. Everything the screens need is there.

You work against **our** Supabase project: we send you `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(same project the server will use; seed already applied). You do not get the service-role key and do not need it.

To **see things move** before our server exists, ask us to run snippets from `01-data-access.md` §6 in the SQL
editor (you cannot write with the anon key). We run them on request, and re-run `supabase/seed.sql` to reset.
The portal must react within ~1 s with no reload. If you want a private sandbox for solo experiments, a free
Supabase project + the two SQL files works too (paste `001_init.sql`, then `seed.sql`, in the SQL editor).

## 6. What judges score (so you know what matters)

End-to-end on graph8 (35) — portal's part: "Open in graph8" on every lead/sequence/deal, deal value visible.
Useful (25) — the three questions answered in one glance. UX (20) — live, calm, zero learning curve.
Tech (20) — realtime, org chart with budgets/heartbeats visible (runs, credits per agent).
