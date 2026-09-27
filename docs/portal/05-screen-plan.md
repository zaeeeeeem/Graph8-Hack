# Agent Office — screen plan (UI/UX breakdown before build)

Derived from `00-README` → `04-acceptance`. Visual language = the landing page in `frontend/`
(black canvas, General Sans display + Inter body, orange↔blue brand gradient, glass surfaces, soft glows,
spring motion from `motion/react`). Nothing here adds scope beyond the brief; it decides *layout, hierarchy
and interaction* for what the brief already requires.

---

## 0. UX principles (how every screen behaves)

1. **Three questions, top to bottom.** Every screen reads in the order *Is my team working? → What needs me? →
   What did it achieve?* Eye path: banner (needs you) → numbers → main content.
2. **Calm by default, loud only when you are needed.** No "all good" banners, no toasts. The only saturated
   orange glow on the page is "needs you". Change feedback = a short pulse on the thing that changed.
3. **One click to context, zero clicks to act.** Every row opens a drawer *on top of* the current screen (you
   never lose your place). The only "actions" are link-outs: **Open in Slack · Decide in Slack · Open in graph8**.
4. **URL is state.** Drawers and filters live in the query string (`?task=T-6`, `?lead=<id>`, `?stage=replied`,
   `?kind=standup`). Back button closes a drawer; links are shareable; reload keeps the view.
5. **Same object, same look, everywhere.** An agent looks the same on the canvas, in a table row, in a report
   line. A status has one word and one colour (`03-vocabulary.md`) in pill, card, row and banner.
6. **Projector-first.** Office fits 1920×1080 with no scroll; body text ≥ 14px, numbers ≥ 28px, cards readable
   at fitted zoom from the back of a room.
7. **Never blank.** Skeletons in the final layout while loading; inline "Could not load X. Retrying…" on error;
   an empty state that says *who* will fill it and *when*.
8. **Keyboard-friendly (nice-to-have).** `G O / G P / G R / G N` to switch screens, `Esc` closes drawer,
   `F` fits the canvas, `J/K` moves through table rows.

---

## 1. Visual system (mapped from the landing page)

| Element | Landing source | Dashboard use |
|---|---|---|
| Background | `#000` + `fu-streaks` / blurred glows | Pure black; one very faint blue/orange glow behind the canvas only (no animated streaks behind data) |
| Surfaces | `rounded-[16px]/[20px]`, `border-white/10`, `bg-white/[0.02]`, `#191919` borders | Cards, drawer, table container: `rounded-2xl border-white/[0.08] bg-white/[0.02]` + `backdrop-blur` |
| Top bar | `FusionNav` glass pill (`rounded-[12px] border-white/10 bg-black/15 backdrop-blur-[10px]`) | Same shell, same Brand orb + "Autopilot" wordmark |
| Display type | General Sans 500 | Screen titles, agent names, big numbers |
| Body type | Inter + `fu-type` features | Everything else; **mono** (e.g. JetBrains Mono / Geist Mono) for T-n, credits, tokens, times |
| Primary CTA | `GlowButton` (orange→rust→black→blue gradient ring) | **Decide in Slack** only (it's the one thing the founder must do) |
| Secondary link | `OutlineButton` / white/20 border | Open in Slack, Open in graph8 |
| Badges | `GradientBadge` | Section eyebrows ("TODAY", "PIPELINE"), "LIVE" chip |
| Motion | spring (stiffness 240, damping 40), reveal ease | Drawer slide-in, count-up numbers, card pulse, row enter |

**Semantic tokens (exactly the six in the vocabulary):**

| Token | Colour | Used for |
|---|---|---|
| `neutral` | white/60 text on white/[0.06] | Idle, To do, Prospect/Researched/Queued |
| `active` | brand blue `#0098f3` (+ glow `#1f77f6`) | Working (pulse), In progress, Contacted, running |
| `attention` | brand orange `#da4e24` / `#ff8918` | Waiting on you, Blocked, Needs your decision, Replied, Question, Alert |
| `success` | emerald `#34d399` (new; landing has no green) | Done, Approved, Meeting, Deal, Won |
| `danger` | red `#f04438` | Paused, Error, Failed, over-budget |
| `muted` | white/35 | Cancelled, Skipped, Expired, Lost, Disqualified |

Agent `color` from the DB is used only for the avatar ring / left edge of the card (identity), never for status.

---

## 2. Screen inventory and navigation

| # | Screen | Route | Priority (brief) | Answers |
|---|---|---|---|---|
| S0 | App shell (top bar, global banner, drawer host) | all | MUST | — |
| S1 | **Office** | `/` | MUST | Is my team working? What needs me? |
| S2 | **Task drawer** (overlay) | `?task=<n>` on any route | MUST | What exactly is this agent doing? |
| S3 | **Pipeline** | `/pipeline` | MUST | What did it achieve (leads)? |
| S3b | Lead timeline drawer (overlay) | `/pipeline?lead=<id>` | SHOULD | What happened with this lead? |
| S4 | **Onboarding / empty** | replaces `/` content | MUST | Why is nothing here? |
| S5 | **Needs you** | `/needs-you` | SHOULD (cut 3rd) | What decisions are waiting? |
| S6 | **Reports** | `/reports` | SHOULD (cut 2nd) | What is the team telling me? |
| S7 | **Agent detail** | `/agents/[id]` | SHOULD (cut 1st) | How is this agent spending / waking? |

```
                         ┌──────────── Top bar: Office · Pipeline · Reports · Needs you (n) ─────────────┐
                         │                                                                                │
   Global banner ───────►│  S1 Office ──card──► S7 Agent detail ──task row──► S2 Task drawer            │
   (paused / needs you)  │     │  └─current task──────────────────────────────► S2 Task drawer ◄──┐      │
        │                │     └─"Latest from team" row ──► Slack                                  │      │
        └──► S5 Needs you│  S3 Pipeline ──row──► S3b Lead drawer ──task link─────────────────────┘      │
                         │  S5 Needs you ──row──► S2 (blocked task)  · Decide in Slack ──► Slack         │
                         │  S6 Reports ──row──► S2 (report's task)   · Open in Slack ──► Slack           │
                         └────────────────────────────────────────────────────────────────────────────────┘
   Drawers stack max 1 deep: opening a task from inside a lead drawer replaces it (Back returns).
```

---

## S0 — App shell (every screen)

**Layout (1920×1080):**
```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ (orb) Autopilot · 8x.social  for Zaeem │  Office  Pipeline  Reports  Needs you ①  │ ● LIVE  Open #sales-hq ↗ │  64px glass bar
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ ▌1 thing needs you — Connect LinkedIn so 3 of 7 touches can send     [ Decide in Slack ] See all → │  48px, only when needed
├───────────────────────────────────────────────────────────────────────────────────────────┤
│                                   screen content                                          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Components**
- **Brand**: reuse landing `Brand` orb + wordmark, then workspace `name` and "for {founder_name}" (muted).
- **Nav**: 4 items; active item = white text + 2px brand-gradient underline; **Needs you** carries a count
  bubble (attention token) = row count of `portal_needs_you` (pending approvals + tasks blocked on
  founder/connection; `portal_today.approvals_pending` alone misses the blocked tasks).
- **Live dot**: blue pulsing dot + "Live" when `channel.state === 'joined'`; grey + "Reconnecting…" otherwise.
  Tooltip: "Updates arrive automatically. Last update 3 s ago."
- **Open #sales-hq ↗**: outline link (hidden if `slack_channel_hq` null).
- **Global banner** (priority, only one shows):
  1. any agent paused → danger strip: "**Hira is paused** (over budget). Nothing runs for Researcher until it is resumed in Slack."
  2. needs-you non-empty → attention strip with soft orange glow: "**{n} things need you** — {first title}"
     + **Decide in Slack** (GlowButton small) + "See all →" (to `/needs-you`).
  3. nothing.
  Enters/leaves with a height+fade spring so the layout shift is smooth, not a jump.
- **Drawer host**: right-side sheet, 560px wide, dims content to 40%, `Esc` / click-outside / Back closes.

**States**: shell renders instantly (static); live dot grey until joined; banner hidden while loading (never flashes).

---

## S1 — Office (`/`) — the hero screen

**Goal:** a judge understands "5 AI agents, working live, one decision waiting, here's today's score" in 5 seconds.

**Layout (1920×1080, no scroll):**
```
┌ top bar ─────────────────────────────────────────────────────────────────────────────────┐
├ banner (conditional) ────────────────────────────────────────────────────────────────────┤
│ TODAY                                                                                     │
│ ┌────────┬───────────┬─────────┬──────────┬──────────────┬─────────────────────┬────────┐ │
│ │   8    │    4      │   3     │    1     │   1  $12k    │  116 / 500,000      │   1    │ │ ~104px
│ │ found  │ contacted │ replies │ meetings │ deals open   │ credits today ▔▔▔   │need you│ │
│ └────────┴───────────┴─────────┴──────────┴──────────────┴─────────────────────┴────────┘ │
│ ┌──────────────────────────── ORG CHART CANVAS ───────────────────────┐ ┌─ LATEST ──────┐ │
│ │                        ┌───────────────┐                            │ │ FROM THE TEAM │ │
│ │                        │  👤 Zaeem · You│                            │ │ 🎉 Zara → you │ │
│ │                        │ 1 decision    │                            │ │ Deal opened…  │ │
│ │                        └───────┬───────┘                            │ │ 2 min ago  ↗  │ │
│ │                        ┌───────┴───────┐                            │ │───────────────│ │
│ │                        │ 👩 Ayesha      │  ◄ Waiting on you          │ │ Bilal → Ayesha│ │
│ │                        │ Head of Sales │                            │ │ Handoff …     │ │
│ │                        └───────┬───────┘                            │ │ …(5 rows)     │ │
│ │         ┌──────────┬───────────┴┬────────────┐                      │ │               │ │
│ │     ┌───┴───┐  ┌───┴───┐   ┌────┴──┐   ┌─────┴─┐                     │ │ See all       │ │
│ │     │ Bilal │  │ Hira  │   │ Usman │   │ Zara ●│  (pulsing)          │ │ reports →     │ │
│ │     └───────┘  └───────┘   └───────┘   └───────┘                     │ │               │ │
│ │                                                  [ − ] [ Fit ] [ + ] │ │               │ │
│ └──────────────────────────────────────────────────────────────────────┘ └───────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────┘
   canvas ≈ 1500 × 800                                                        rail 360px
```
Below 1440px wide the right rail collapses under the canvas (below-the-fold is fine off-projector).

### 1a. Today strip
- 7 stat tiles in one glass bar, divided by hairlines. Big number (General Sans, 32px, count-up on change),
  label below (Inter 13px, white/55).
- **deals** tile shows count + "$12k open" in success colour.
- **credits today** tile: mono `116 / 500,000` + a hairline progress bar (warning tint at `budget_warn_pct`,
  danger at 100 %).
- **need you** tile: attention token; when > 0 gets the orange glow ring (landing GlowButton style) and links
  to `/needs-you`. When 0 it is muted "0" (calm).
- On change: number counts up + a 600 ms soft glow behind that tile only.

### 1b. Org-chart canvas (React Flow)
- Levels: Founder (y=0) → Ayesha (y=220) → Bilal · Hira · Usman · Zara (y=440, by `sort_order`).
- Edges: smoothstep SVG, white/15; **working** agent's incoming edge animated in brand blue (flowing dash);
  **paused** agent's edge dashed + muted.
- Pan (drag), zoom 0.3–2× (wheel/pinch), fit on load + resize, toolbar bottom-right `− · Fit · +`
  (glass buttons). Nodes not draggable. Subtle dot-grid background (white/4) so panning feels physical.
- Hover a card: lifts 2px + border brightens; cursor pointer.

**Founder node** (smaller, distinct): gradient ring avatar (brand orb style), "{founder_name}" + "You",
line "1 decision waiting · Decide in Slack" (attention) or "Nothing waiting" (muted).

**Agent card** (≈ 280×188, reused compact elsewhere):
```
┌▌─────────────────────────────────┐   ▌ = 3px left edge in agents.color
│ (😀) Zara            ● Working    │   avatar ring = agents.color; pill = status token
│      Closer                      │
│ ─────────────────────────────── │
│ T-6  Sara Malik (Northwind)      │   current task, 1 line, click → task drawer
│      replied — interested        │   none → "No task right now" (muted)
│ ─────────────────────────────── │
│ credits  5 / 100,000  ▁▁▁▁▁▁▁▁   │   mono, hairline bar
│ 4 done · 1 open      2 min ago   │   counters left, last_active right
└──────────────────────────────────┘
  [ Waiting on you ]  ← orange badge hanging off top-right when status = waiting_on_you
```
- `working` → pill pulses + card has a faint blue inner glow.
- `paused` → pill "Paused · over budget" (danger), card desaturated 30 %, bar full red.
- `error` → danger pill, same layout.
- Click current-task line → **Task drawer**; click anywhere else → **Agent detail** (if built, else task drawer).
- Realtime change → card border flashes its status colour for 800 ms.

### 1c. "Latest from the team" rail
- Last 5 `reports`: kind chip · "**Bilal** → **Ayesha**" · title (1 line) · time ago · ↗ Open in Slack.
- `win` rows get a subtle success tint; `question`/`alert` get attention tint.
- New report slides in at the top. Footer link "See all reports →".
- Click row → task drawer of `reports.task_id` (if present).

**States:** loading = strip with shimmer tiles + canvas with 6 ghost cards in final positions; agents but no
tasks = cards "No task right now" + line under the chart "Waiting for the first assignment."; error = inline
strip inside the canvas area; no agents / onboarding → S4.

---

## S2 — Task drawer (overlay, from anywhere)

**Goal:** "what is this agent doing, who asked, what came back" without leaving the screen.

```
┌──────────────────────────────── 560px ─┐
│ T-6 · Handle reply            [×]       │
│ Sara Malik (Northwind) replied —        │  title, General Sans 22px
│ interested                              │
│ ● In progress   😀 Zara   by Ayesha     │  status pill · assignee · created by
│ 4 credits                [Open in Slack↗]│
├─────────────────────────────────────────┤
│ INSTRUCTION                             │
│ ┌ muted block: detail ─────────────────┐│
│ RESULT                                  │
│ "Classified INTERESTED … Waiting for    │  done=success tone, blocked=attention, failed=danger
│  her pick"                              │
├─────────────────────────────────────────┤
│ DELEGATION TREE                         │
│ T-1  Hire team            👩 ✓ Done      │
│  ├ T-2 Find prospects     🔎 ✓ Done      │
│  ├ …                                    │
│  ├▶T-6 Handle reply       😀 ● In prog.  │  ◄ current highlighted; click switches drawer
│  └ T-7 Launch sequence    👩 ◐ Blocked   │
├─────────────────────────────────────────┤
│ REPORTS ON THIS TASK (Slack thread)     │
│ Zara → Ayesha · Update · 3 min ago   ↗  │
│ **Sara (Northwind) replied — interested**│
│ body…                                   │
├─────────────────────────────────────────┤
│ LINKED                                  │
│ 👤 Sara Malik · Northwind Fintech        │  → Pipeline lead drawer · Open in graph8 ↗
│ 📨 Sequence "UK fintech CFOs" · Live     │  → Open in graph8 ↗
│ ⚖ Decision "Connect LinkedIn…" · Needs  │  → Decide in Slack (GlowButton)
│   your decision                         │
└─────────────────────────────────────────┘
```
- Blocked header reads "Blocked · waiting on your decision: Connect LinkedIn in graph8" in attention colour,
  and the linked decision is pinned to the **top** of the body (it is the thing that unblocks it).
- Tree switching animates the body cross-fade; header stays put.
- New reports append live with a slide-in.
- Deleted task (full reseed) → drawer closes quietly.
- Empty reports: "No reports yet — Zara will post here when done."

---

## S3 — Pipeline (`/pipeline`)

**Goal:** leads moving through the funnel, each one a click away from graph8.

```
┌ top bar / banner ─────────────────────────────────────────────────────────────────────────┐
│ PIPELINE                                                     8 leads · updated live       │
│ ┌───────────┐›┌───────────┐›┌───────────┐›┌───────────┐›┌──────────────────┐   1 closed out│
│ │ 2         │ │ 2         │ │ 1         │ │ 1         │ │ 1     $12,000    │              │
│ │ Prospects │ │ Contacted │ │ Replied   │ │ Meetings  │ │ Deals            │              │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘ └──────────────────┘              │
│  (chevron-connected buckets, width grows toward Deals; selected bucket = gradient ring)    │
│                                                                                           │
│ [All] [Prospects] [Contacted] [Replied] [Meetings] [Deals] [Closed out]    🔍 filter name   │
│ ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│ │ LEAD              COMPANY          STAGE      FIT   LAST TOUCH     WHY NOW      OWNER │   │
│ │ Sara Malik        Northwind        ● Replied  ▇▇▇82 ✉ 3 min ago    Hiring 2 …   😀   │   │
│ │ CFO   [test contact]  northwind.io                              Open in graph8 ↗  │   │
│ │ Zainab …          …                ● Deal     …     $12,000 · Discovery  Open deal ↗│   │
│ │ Ali … (muted)     …                Disqualified · wrong person                      │   │
│ └─────────────────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Funnel strip**: 5 buckets as connected glass tiles; count (General Sans 32px) + label; Deals shows $ sum.
  Click bucket = filter table (`?stage=`); click again = clear. Count-up + glow on change; when a lead
  moves, the destination bucket pulses.
- **Filter chips** mirror the buckets (for discoverability) + a local name/company search (client-side).
- **Lead table**: 2-line rows (name + title / company + domain), stage pill, fit bar (0-100), channel icon +
  relative time, why-now (1 line, full on hover tooltip), owner agent emoji avatar, badges
  (`test contact` blue outline — "the only person real messages go to", `do not contact` danger outline),
  meeting time when ≥ meeting, `$amount · deal_stage` when ≥ deal, right-aligned **Open in graph8 ↗** /
  **Open deal in graph8 ↗** (appear on row hover, always visible on the focused row).
- Disqualified/lost rows: 45 % opacity + reason label. Row reorder on live update animates (layout animation).
- Click row → S3b.

**States:** skeleton = 5 ghost tiles + 6 ghost rows; empty = "No leads yet — Bilal (Scout) adds prospects as
soon as the team starts." (never an empty table header alone); error inline above table.

## S3b — Lead timeline drawer

```
┌──────────────────────────────── 560px ─┐
│ Sara Malik                      [×]     │
│ CFO · Northwind Fintech · London        │
│ ● Replied   Fit 82   😀 Zara  [test contact]│
│ [Open in graph8 ↗] [Open deal in graph8 ↗]│
├─────────────────────────────────────────┤
│ WHY NOW  full paragraph                 │
│ SIGNALS  [hiring] Hiring 2 finance roles ↗│
│          [funding] Raised Series A        │
├─────────────────────────────────────────┤
│ TIMELINE                                │
│ ● ·  Note         Waiting for Sara…  1m │  vertical line; icon by type/channel,
│ ● →  Reply sent   Replied with 3 slots… │  direction arrow, agent emoji, time
│ ● ·  Reply read   Classified INTERESTED │
│ ● ←  Replied      …                     │
│ …                                       │
├─────────────────────────────────────────┤
│ SEQUENCE  UK fintech CFOs · ● Live   ↗  │
│ D0 ✉ · D2 in · D4 ✉ · D6 ☎ …            │  compact step chips
│ sent 12 · opened 7 · replied 3 · mtg 1  │
└─────────────────────────────────────────┘
```
New events slide in at the top of the timeline with a pulse. Tasks referenced by `task_id` on an event are
clickable → S2.

---

## S4 — Onboarding / empty state (replaces Office content)

Trigger: `workspaces.status = 'onboarding'` or zero agents.
```
                        (large brand orb, slow liquid-gradient glow — landing PromptCard vibe)
                        Your sales team is not hired yet.
          In Slack, run  ┌──────────────────────────────┐  — Ayesha will read your company,
                         │ /hire-sales 8x.social    ⧉   │     staff the team and post the plan
                         └──────────────────────────────┘     here within a minute.
                                  [ Open #sales-hq ↗ ]
                 5 ghost org-chart cards faintly outlined below (preview of what will appear)
```
- The command chip has a copy button (copying is not a write action).
- When agents appear via realtime, the ghost cards "light up" one by one into the real Office (this is the
  0:30 demo moment — worth the polish).

---

## S5 — Needs you (`/needs-you`)

```
│ NEEDS YOU                                                                 1 waiting       │
│ DECISIONS                                                                                 │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚖ Connect account                                       👩 Ayesha · 12 min ago         │ │
│ │ **Connect LinkedIn so 3 of 7 touches can send**                                       │ │
│ │ linkedin · steps 2, 3, 6                                    [ Decide in Slack ]       │ │
│ │ Blocks T-7 Launch sequence →                                                          │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ BLOCKED ON YOU (tasks)  — none                                                            │
│ ─────────────────────────────────────────────────────────────────────────────────────── │
│ RECENT DECISIONS                                                                          │
│ ✓ Approved   Launch "UK fintech CFOs" (7 leads)      2 h ago   note…                      │
```
- Card per item, attention left edge + orange glow; payload rendered by kind
  (launch_sequence: "{lead_count} leads · {channels} · enrolls {enroll_count}"; connect_account:
  "{account} · steps {blocked_steps}"; send_reply: draft as a quote block).
- "Blocks T-n" link → task drawer.
- When a decision is made in Slack, the card animates out (collapse) and reappears in Recent decisions.
- Empty: large calm check + "Nothing needs you. Ayesha will ask here (and in Slack) when a decision is needed."

---

## S6 — Reports (`/reports`)

```
│ REPORTS        [All] [Standups] [Wins] [Handoffs] [Updates] [Questions]                  │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ [Standup] 👩 Ayesha → you · 09:00                                               ↗    │ │
│ │ **Daily standup — Sat**                                                               │ │
│ │ body…                                                                                 │ │
│ │ ┌ Pipeline ─────────────┐ ┌ Credits today ────┐                                        │ │
│ │ │ prospects 8 … deals 1 │ │ Ayesha 38 · Bilal…│                                        │ │
│ ├──────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ [Win 🎉] 😀 Zara → Ayesha · 2 min ago     (success-tinted row, gentle shimmer once)   │ │
│ │ [Handoff] 🔎 Bilal → Ayesha …                                                          │ │
```
- Single centered column (max 880px) — it's a reading feed; time-grouped headers ("Today", "Yesterday").
- Body collapsed to 2 lines, click row expands inline (not a drawer); "View task" → S2; Open in Slack ↗.
- Standup `data` rendered as two mini tables. Question/Alert rows attention-tinted.
- New reports slide in at top; if the user has scrolled down, show a small "1 new report ↑" pill instead
  of jumping (not a toast — an in-place affordance).
- Empty: "No reports yet. The first standup posts at 9:00."

---

## S7 — Agent detail (`/agents/[id]`)

```
│ ← Office                                                                                  │
│ ┌ big agent card (same component, wide variant) ───────────────────────────────────────┐ │
│ │ (🔬) Hira · Researcher        ● Idle        last active 5 min ago                      │ │
│ │ reports to Ayesha · 1 done · 0 open                                                   │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ [Budget] [Tasks] [Runs]        ← section tabs (anchor-scroll on wide screens)            │
│ ┌ BUDGET TODAY ────────────────────┐ ┌ RUNS (heartbeats) ──────────────────────────────┐ │
│ │ 37 / 100,000 credits             │ │ 10:42  woke by Ayesha  ✓ Done  16 cr  16,000 tok │ │
│ │ ▁▁▁▁▁▁▁▁▁▁▁▁│80%▁▁▁▁▁▁▁▁         │ │ "Enriched 7 contacts…"                           │ │
│ │ LEDGER                           │ └──────────────────────────────────────────────────┘ │
│ │ enrich_person [graph8 credits] 3 T-3 10:40 │ ┌ TASKS ──────────────────────────────────┐ │
│ │ llm_run [LLM] 16  16,000 tok     │ │ OPEN — none   DONE  T-3 Research leads ✓ …     │ │
│ └──────────────────────────────────┘ └──────────────────────────────────────────────────┘ │
```
- Two-column on desktop (budget + ledger left, runs + tasks right), stacked on narrow.
- Budget bar shows the `budget_warn_pct` tick; paused state shows the danger banner inline.
- Runs are the "heartbeat" evidence: vertical timeline with a small pulse dot for `running`.
- Agent switcher: the 5 agent avatars in a row at the top — hop between agents without going back.

---

## 3. Shared component inventory (build once in step 0)

| Component | Where | Notes |
|---|---|---|
| `TopBar`, `NavLink`, `LiveDot`, `GlobalBanner` | shell | reuse landing Brand + glass nav styles |
| `StatusPill` | everywhere | accepts only vocab values; `working`/`running` pulse |
| `AgentAvatar` | everywhere | emoji in `color` ring; sizes xs/sm/md/lg |
| `AgentCard` | Office, Agent detail | variants: `node` (canvas), `wide` (detail) |
| `AgentRef` | rows, reports | avatar + name; `null` → "you"; missing → "Team" |
| `BudgetBar` | card, strip, detail | hairline; warn/over tints; optional warn tick |
| `StatTile` + `CountUp` | today strip, funnel | number spring-animates on change |
| `TaskId`, `Credits`, `Tokens`, `TimeAgo`, `Money` | everywhere | from `lib/format.ts`, mono |
| `KindChip`, `ChannelIcon`, `DirectionMark` | reports, timeline, table | vocab-driven |
| `LinkOut` (`slack` / `g8` / `decide`) | everywhere | hides when URL null; `decide` = GlowButton |
| `Drawer` | S2, S3b | URL-driven, Esc/back/outside close |
| `Skeleton`, `EmptyState`, `InlineError` | every screen | same geometry as real content |
| `PulseOnChange` | cards, rows, tiles | wraps children; flashes on `updated_at`/new id |

---

## 4. Build order (unchanged from brief) and what gets polish

1. Shell + tokens + shared components + realtime hook
2. **Office** (strip → canvas → cards → rail) — *most polish here; it's the projector screen*
3. Task drawer
4. Pipeline (strip → table) → lead drawer
5. Onboarding state (with the "cards light up" transition)
6. Needs you → 7. Reports → 8. Agent detail  (cut from the bottom if late)

---

## 5. Open decisions for us

1. **Where the code lives.** Brief says a separate `office/` app with Office at `/`. The landing page
   already owns `/` in `frontend/`. Recommendation: build inside `frontend/` as a route group so fonts, tokens
   and `Buttons` are shared — dashboard at `/office`, `/office/pipeline`, … — or keep `office/` separate and
   copy the theme files. Needs a call before step 1.
2. **Paused banner colour.** Brief text says "amber" but the vocabulary maps `paused` to `danger`. Plan uses
   `danger` (red) so it's distinct from the orange "needs you".
3. **Success green** is new to the palette (landing has only orange/blue); proposed `#34d399`.
