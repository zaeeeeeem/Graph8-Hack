# Screens

Global shell: top bar with workspace name (`workspaces.name`), founder ("for Zaeem"), a **live dot**
(realtime connected), and nav: **Office · Pipeline · Reports · Needs you**. Office is `/`.
Every screen has four states: **loading** (skeleton in the same layout, never a spinner page),
**empty** (EmptyState: icon + one line saying what will appear + when), **error** (inline banner
"Could not load X. Retrying…" + auto retry; never a blank page), **live** (data + subtle pulse on change).

Global banner (all screens, above content), priority order:
1. any agent `status = 'paused'` → amber: "**{name} is paused** ({reason}). Nothing runs for {title} until it is resumed in Slack."
2. `portal_needs_you` non-empty → highlighted: "**{n} things need you** — {first title} · Decide in Slack" (link to the first item's Slack message; link to Needs-you page).
3. otherwise nothing (no "all good" banner; calm by default).

---

## 1. Office (`/`) — MUST

Answers "is my team working?" and "what needs me?" in one glance. Two zones.

### 1a. Today strip (top)
One row of numbers from `portal_today` (single row). Show, left to right:
`leads_found_today` **found** · `leads_contacted_today` **contacted** · `replies_today` **replies** ·
`meetings_booked_today` **meetings** · `deals_created_today` **deals** (with `deals_value` as "$12k open") ·
`credits_spent_today / budget_daily_credits` **credits today** (bar) · `approvals_pending` **need you** (highlight if > 0).
Numbers animate when they change (count-up). This strip is the demo's scoreboard.

### 1b. Org chart canvas (main) — pan, zoom, fit are MUST
Tree: virtual **Founder** node (`workspaces.founder_name`, "You") → agents with `reports_to = null` →
their reports (`reports_to = <id>`). Order siblings by `sort_order`. Data: `portal_agents`.
Canvas (React Flow): drag to pan, wheel/pinch to zoom (0.3–2×), **Fit** button + fit on load and on resize,
SVG edges parent → child (smoothstep), edges of a `working` agent animated, `paused` agent edge dashed/muted.
Nodes are not draggable (read-only). Layout computed by hand: level 0 founder, level 1 Ayesha, level 2 the four,
siblings spaced by `sort_order`. Toolbar bottom-right: zoom −, fit, zoom +. Card content stays crisp at every zoom
(HTML nodes, not SVG text). Must fit 1920×1080 at the fitted zoom with all six cards readable.

**Agent card** (the core component; also reused in lists):
- `emoji` + **`name`** + `title` (small). Left border/avatar ring in `color`.
- Status pill from `status` (vocabulary §1 in `03-vocabulary.md`); `working` pulses.
- `paused` → pill reads "Paused · {pause_reason}".
- **Current task**: `current_task_title` as one line + `T-n`; click → Task drawer. If none: "No task right now" (muted).
- **Budget bar**: `spent_today_credits / budget_daily_credits`, warning tint at `budget_warn_pct`, over-budget tint at 100 %.
- **Last active**: `last_active_at` relative ("2 min ago").
- Small counters: `tasks_done` done · `tasks_open` open.
- **Waiting on you** badge when `status = 'waiting_on_you'` (Ayesha usually) — link to Needs-you.
- Click card → Agent detail (if built) else Task drawer of current task.

Founder node: name + "You" + a line: "{approvals_pending} decisions waiting · Decide in Slack" (link `slackChannel(workspaces.slack_channel_hq)`).

### 1c. Below the chart (optional, if space): "Latest from the team" — last 5 `reports` (title, from → to, time ago). Each links to Slack.

Reads: `portal_today`, `portal_agents`, `workspaces`, `portal_needs_you` (banner), `reports` (last 5).
Realtime: agents, tasks, approvals, lead_events, leads, reports, credit spend (via `agents` updates).
Empty: no agents → onboarding state (§6). Agents but no tasks → cards show "No task right now", strip zeros, banner none.

---

## 2. Task drawer (right-side sheet, opened from anywhere) — MUST

Purpose: "what exactly is this agent doing, who asked, what came back". One task = one Slack thread.

Header: `T-{number}` · **title** · status pill (blocked → "Blocked · waiting on {blocked_on label}: {blocked_reason}") ·
assignee (emoji+name) · kind label · created "by {created_by name | you}" · `credits_used` if > 0 · **Open in Slack**.

Body, in order:
1. `detail` (the instruction) — muted block.
2. **Result**: `result_summary` when `done`; `blocked_reason` when blocked; error tone when `failed`.
3. **Delegation tree**: fetch `qTaskTree(root_task_id)`, render nested list from the root, highlight the open task.
   Each node: `T-n`, title, assignee emoji, status pill. Click switches the drawer.
4. **Reports on this task** (`reports.task_id = id`, chronological): from → to, kind chip, title, body. This is the
   Slack thread mirrored. Each has Open in Slack.
5. Linked objects: lead (`lead_id` → name/company → Pipeline + Open in graph8), sequence (`sequence_id` → name, status),
   approval (`approval_id` → title, status, "Decide in Slack").

Reads: `tasks` (one + tree), `reports`, `leads` (one), `sequences` (one), `approvals` (one).
Realtime: tasks, reports, approvals. Empty reports: "No reports yet — {assignee} will post here when done."

---

## 3. Pipeline (`/pipeline`) — MUST (timeline drawer SHOULD)

Answers "what did it achieve?" for leads. Data is a mirror of graph8; graph8 is the truth → every row links out.

### 3a. Funnel strip
Five buckets from `portal_pipeline` (sum `lead_count` by bucket):
**Prospects** = prospect + researched + queued · **Contacted** = contacted · **Replied** = replied ·
**Meetings** = meeting · **Deals** = deal + won (show `deal_amount` sum). Show `lost + disqualified` as a small
muted "{n} closed out" at the end. Clicking a bucket filters the table.

### 3b. Lead table (`leads`, ordered by `last_activity_at` desc)
Columns: **name** + `job_title` (small) · `company_name` (+ `company_domain` small) · stage pill · `fit_score` (0-100, as small bar or number) ·
`last_channel` icon + `last_activity_at` relative · `why_now` (truncate 1 line, full on hover) · owner agent emoji ·
badges: `is_test_contact` → "test contact" (this is the only person real messages go to); `do_not_contact` → "do not contact" ·
`meeting_at` when stage ≥ meeting · `deal_amount` + `deal_stage` when stage ≥ deal · **Open in graph8** (`g8_contact_id`) and "Open deal" (`g8_deal_id`).
`disqualified` rows: muted + `disqualify_reason` label.

### 3c. Lead timeline drawer (click a row) — SHOULD
Header: name, title, company, stage, why_now full, signals list (`signals[]`: type chip + text + link if `source` is a URL).
Timeline: `lead_events` desc: icon by `type`/`channel`, `summary`, `occurred_at`, agent emoji if `agent_id`, direction arrow
(outbound →, inbound ←, internal ·). Bottom: sequence card if `sequence_id` (`sequences.name`, status, steps as a compact
day/channel list, stats). Links: Open in graph8 (contact, deal, sequence).

Reads: `portal_pipeline`, `leads`, `lead_events`, `sequences`, `portal_agents` (emoji map).
Realtime: leads, lead_events, sequences. Empty: "No leads yet — Bilal (Scout) adds prospects as soon as the team starts."

---

## 4. Empty / onboarding state — MUST (small)

Trigger: `workspaces.status = 'onboarding'` or zero rows in `agents`.
Full-page EmptyState: "**Your sales team is not hired yet.** In Slack, run `/hire-sales {company_domain}` — Ayesha
will read your company, staff the team and post the plan here within a minute." Link: Open #sales-hq.
Also cover: agents exist but zero tasks → org chart shows cards with "No task right now" and a line under the chart:
"Waiting for the first assignment." Do not show an empty pipeline table without the sentence above.

---

## 5. Needs you (`/needs-you`) — SHOULD

List from `portal_needs_you` (newest first). Two groups by `item_type`: **Decisions** (approvals) and **Blocked on you** (tasks).
Row: title · detail (`summary` / `blocked_reason`) · requested by (agent emoji + name) · time ago · **Decide in Slack** (link).
Approvals: also show `kind` label and the typed `payload` compactly (launch_sequence: "{lead_count} leads · {channels} · enrolls {enroll_count}";
connect_account: "{account} · steps {blocked_steps}"; send_reply: the `draft` quoted — note: replies to *interested* leads are
auto-sent by the Closer and never appear here; only question/objection drafts do). Below the list: **Recent decisions** — `approvals` with status ≠ pending (title, status pill, `decided_at`, `decision_note`).
Empty: "Nothing needs you. Ayesha will ask here (and in Slack) when a decision is needed."
Reads: `portal_needs_you`, `approvals`. Realtime: approvals, tasks.

---

## 6. Reports (`/reports`) — SHOULD

Stream of `reports` (newest first), filter chips by `kind`: All · Standups · Wins · Handoffs · Updates · Questions.
Row: kind chip · from → to (emoji + name; `to_agent_id = null` → "you") · **title** · body (expand) · time · Open in Slack.
`standup`: render `data.pipeline` and `data.credits` as two small tables under the body (see `StandupData` in types.ts).
`win`: celebratory tint. This page is the "org chart talking" the judges should see.
Empty: "No reports yet. The first standup posts at {workspaces.standup_hour}:00."
Reads: `reports`, `portal_agents`. Realtime: reports.

---

## 7. Agent detail (`/agents/[id]`) — SHOULD (cut first)

Header: big card (same component as Office). Sections:
1. **Budget today**: `spent_today_credits / budget_daily_credits`, `budget_warn_pct` marker, pause state; ledger from `credit_events` (action, credits, time, task T-n).
2. **Tasks**: `tasks` where `assignee_agent_id = id`, grouped open / done; click → drawer.
3. **Runs** (`agent_runs`): time, `trigger` label ("woke by webhook / Slack / cron / Ayesha"), `summary`, `status`, `credits_used`, tokens (mono, small). This is the "heartbeat" evidence for the tech score.
Reads: `portal_agents` (one), `tasks`, `agent_runs`, `credit_events`. Realtime: agents, tasks (runs/credits refetch on agents change or poll).
Empty runs: "No runs yet."

---

## Not in scope (do not build)
Settings, connections, login, any write action, charts/graphs beyond the funnel strip and budget bars, activity log,
Slack message composer, dark/light toggle (pick one theme with the designer).
