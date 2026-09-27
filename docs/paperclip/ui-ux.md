# Paperclip UI/UX Survey

Design philosophy (`doc/spec/ui.md`): "professional-grade control plane, not a toy dashboard." Dense but scannable, keyboard-first (Cmd+K search, `C` new issue), contextual not modal (inline edit > dialogs), dark theme default.

## App shell (`doc/spec/ui.md` §2-3)
Three-zone layout: Sidebar (240px, collapsible to 48px icon rail) + Breadcrumb bar (full width, nav path + entity actions + view controls) + Main content (scrollable) + optional right Properties panel (320px, resizable, slides in only on detail views — issue/project/agent detail — not on lists/dashboard).

## Design system / tokens
- Single token source: `ui/src/index.css` (Tailwind v4, no `tailwind.config`; CSS vars via `@theme`) — `DESIGN.md:13-24`.
- Tiers: semantic (shadcn set: `--background`, `--card`, `--primary`, `--sidebar-*`, `--chart-1..5`), brand (`--agent-1a/1b..10a/10b` gradients, `--status-task-*`/`--status-agent-*`), domain (`--chip-match-*`, annotation highlights, motion/typography) — `DESIGN.md:20-24`.
- Color spec (`doc/spec/ui.md:16-32`): dark charcoal bg `hsl(220,13%,10%)`, status colors per state (Backlog/Todo/In Progress/In Review/Done/Cancelled/Blocked), priority as filled/half/outline/dashed circles.
- Type: Inter variable font, 13px/1.5 body, 11px uppercase labels, `lucide-react` icons everywhere (16px nav / 14px inline).
- Component inventory (`doc/design/COMPONENT-INVENTORY.md`): 24 shared primitives in `ui/src/components/ui/` (shadcn-based: Button, Card, Dialog, Sheet, Command/⌘K, Dropdown, Tabs, Tooltip, etc.), 206 feature components (`ui/src/components/`), 73 pages — 303 total. Largest cluster is Issue/task surfaces (`IssueRow`, `IssuesList`, `issue-properties/IssueProperties.tsx` at 2,301 lines, `IssueChatThread.tsx`).
- Principle: one canonical word per concept — copy always says **"task"**, never "issue"/"ticket" (rename in progress, not yet done in code) — `DESIGN.md:52`.
- Empty states, errors, buttons: "Buttons name the action (‘Approve hire,’ not ‘Submit’). Errors say what happened and what to do. Empty states say what to do first." `DESIGN.md:52`.

## `EmptyState` component (`ui/src/components/EmptyState.tsx`)
Reused everywhere: icon (muted, in soft rounded square), optional bold `title` + `message`, or plain `message` + `description`, optional CTA `Button` (with `+` icon unless `hideActionIcon`). This one component is why every screen's zero-state feels consistent. Example call sites in Dashboard: `<EmptyState icon={LayoutDashboard} message="Create or select an organization to view the dashboard." />` (`ui/src/pages/Dashboard.tsx:307`).

## Dashboard (`ui/src/pages/Dashboard.tsx`, 561 lines)
- Purpose: home/status screen — "what's happening, does it need me."
- First thing shown: paused-agent banners take priority over metrics — e.g. `title="All agents in this organization are paused — nothing will run."` (`Dashboard.tsx:349`) or per-imported-agent banner (`Dashboard.tsx:331`), via `InlineBanner`.
- Below banners: `MetricCard`s (agent/task/cost/approval counts, icons `Bot`, `CircleDot`, `DollarSign`, `ShieldCheck`), then `ChartCard`s — Run Activity (last 14 days), Tasks by Priority, Tasks by Status, Success Rate (`Dashboard.tsx:457-469`), then `ActiveAgentsPanel` and a recent-issues/activity list (`ActivityRow`, `timeAgo` helper).
- Routing logic: `onboardingStepForCompany` / `shouldRouteAgentlessCompanyToOnboarding` (`lib/onboarding-route.ts`) redirect a company with no agents straight into onboarding instead of showing an empty dashboard — progressive disclosure at the routing layer, not just component layer.
- Live data via `useSharedPollingQuery` / `usePublishSharedQueryData` (shared polling hook, not full websocket push for dashboard metrics).

## Org Chart (`ui/src/pages/OrgChart.tsx`, 673 lines; `.production.tsx` variant, 641 lines)
- Custom canvas/SVG tree layout (not a library) — `subtreeWidth()` + `layoutTree()` recursively compute x/y from `OrgNode.reports[]`, constants `CARD_W=200 CARD_H=100 GAP_X=32 GAP_Y=80 PADDING=60`, zoom 0.2–2x, pinch/pan gesture handling for touch (`OrgChart.tsx:19-90`).
- Each node renders via `AgentAvatar`, shows `name`, `role` (mapped through `AGENT_ROLE_LABELS`), `status`.
- Toolbar icons: `Download`, `Upload`, `Maximize2` (fit-to-view), `Plus`/`Minus` (zoom), `Network` — i.e. export/import org chart, zoom controls, fit view.
- Two build-time image generators exist: `scripts/generate-org-chart-images.ts` and `scripts/generate-org-chart-satori-comparison.ts` — Paperclip renders static org-chart images (e.g. for Slack/share cards) via Satori, separate from the live interactive canvas. Worth copying: a serverless/Satori-rendered PNG of the org chart is a cheap way to post a chart image into Slack without a headless browser.

## Issues (tasks) — `Issues.tsx` (list/board) + `IssueDetail.tsx` (detail + properties panel + chat thread)
- List uses `IssueRow` + `IssuesList` with sort/filter/group (`IssueColumns.tsx`, `IssueFiltersPopover.tsx`), grouping by status/project/assignee (`IssueGroupHeader.tsx`).
- Detail = properties panel (`issue-properties/IssueProperties.tsx`: status, assignee, labels, project, dates) + `IssueChatThread.tsx` (agent+human comment thread) + contextual cards: `IssueRunLedger.tsx` (cost/run ledger table), `IssueBlockedNotice.tsx`, `IssueRecoveryActionCard.tsx`, `IssueScheduledRetryCard.tsx`, `IssueMonitorActivityCard.tsx`, `IssuePlanDecompositionsSection.tsx` (subtasks).
- `IssueThreadInteractionCard.tsx` renders rich cards inline in the chat thread for approvals/tool calls — i.e. approval prompts appear as cards inside the same thread agents talk in, not a separate modal.

## Approvals (`Approvals.tsx`, `ApprovalDetail.tsx`) / Decision Queue (`DecisionQueuePage.tsx`) / WhatNeedsMe (`WhatNeedsMe.tsx`)
Three related but distinct "what needs a human" surfaces — a cross-cutting inbox pattern rather than one screen. `WhatNeedsMe.tsx` appears to be the personal aggregate view across approvals/blocked tasks/mentions.

## Costs (`Costs.tsx` / `Costs.production.tsx`) and Timeline (`Timeline.tsx`)
Costs page: budget/spend reporting (pairs with the budget/ledger data model — see `budgets-approvals-audit.md`). Timeline: chronological activity feed across the company.

## Agents (`Agents.tsx`, `AgentDetail.tsx`, `AgentOverview.test.tsx`, `AgentToolsTab.tsx`)
`AgentDetail` composes: `AgentConfigForm.tsx` (model/instructions config), `AgentProperties.tsx`, `AgentActionButtons.tsx` (start/stop/pause), `LiveRunWidget.tsx` (live run status), `AgentCapsule.tsx` — a 3-state avatar motif (slot / configured / online) used as the visual "is this seat filled" indicator across org chart and agent list.

## Routines (`Routines.tsx`, `RoutineDetail.tsx`) 
Scheduled/recurring agent work — the heartbeat-driven automation surface (see `tasks-and-heartbeats.md`).

## Company Settings / Instance Settings
`CompanySettings.tsx`, `CompanyAccess.tsx`, `CompanyEnvironments.tsx`, `CompanyExport.tsx`/`CompanyImport.tsx` (company backup/restore), `InstanceGeneralSettings.tsx`, `InstanceAccess.tsx`, `InstanceExperimentalSettings.tsx` (feature flags), `Secrets.tsx` (scoped secrets UI).

## Search (`Search.tsx`) 
Cmd+K powered by the shared `Command` primitive (`ui/src/components/ui/command.tsx`) — the "keyboard-first" navigation entry point.

## Team Catalog / Skill Studio (`TeamCatalog.tsx`, `SkillStudio.tsx`)
Pre-built team/agent templates users can install (`TeamCatalog.fixtures.ts`, `useInstallTeamCatalogEntry.test.tsx`) — directly relevant to our own "install the sales team" flow. `SkillStudio.tsx` is the skill-authoring/eval UI (agent training pillar).

## Artifacts (`Artifacts.tsx`)
Generated deliverable files/screenshots/diffs surfaced per task (see `doc/AGENT-ARTIFACTS.md`).

## Status & activity conventions (`DESIGN.md`)
- One semantic status-token set used identically everywhere: badge, row, chart, log (`DESIGN.md:46` "Status is systematic").
- Machine values (IDs, costs, token counts, timestamps) always render in the monospace token with one formatting helper (`formatCents` in `lib/utils.ts`), never ad hoc per screen.
- Notification/toast rule: never toast a run/task state already visible on the current screen (including open subtree); a terminal outcome delivered >5 min after completion is "historical" and refreshes state silently instead of toasting (`DESIGN.md:63-68`). Directly reusable rule for our Slack-vs-portal duplication problem — don't re-notify Slack for something the user is already looking at in the portal.
- Pause takeover pattern: a paused task/subtree replaces the composer with an amber, non-dismissible banner ("Task is paused." / "Resume this task to send a message."), retaining drafts (`DESIGN.md:66-68`).

## Screenshots on disk (not all viewed, filenames indicate content)
`screenshots/PR-8000-home-flag-on/off.png`, `-conference-room-flag-on.png`, `-task-thread-flag-on/off.png`, `-settings-experimental-flag-on/off.png` — these are before/after pairs for a feature-flagged UI redesign (conference room = a multi-agent live chat surface distinct from task threads); `PAP-10535-live-run-menu-after/before.png` — a live-run context menu redesign; `PR-7938-agent-config-forced-kubernetes*.png` — agent runtime/sandbox config screen showing forced env vars when Kubernetes execution is selected.

## Steal-relevant UI takeaways (see `steal-list.md` for effort sizing)
1. `EmptyState` single component pattern for consistent zero-states.
2. 3-state agent avatar ("slot/configured/online") as a status-at-a-glance motif.
3. Approval/interaction cards rendered inline in the same chat thread as agent messages (not a separate modal) — matches our Slack-thread model well.
4. Toast suppression rule for state already visible on screen.
5. Satori-based static org-chart image generation for sharing outside the live app (Slack-postable chart PNG).
