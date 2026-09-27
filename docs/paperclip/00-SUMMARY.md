# Paperclip — Summary for our AI Sales Team build

One page. Read this first; other files in `docs/paperclip/` have full evidence per topic.

## What Paperclip is
Open-source (MIT) Node.js server + React UI that runs "agent companies": an org chart of AI agents (any provider — Claude/Codex/Cursor/Gemini/etc.) with roles, budgets, goals, tasks, and heartbeat-driven execution. Positioned as "the app people use to manage AI agents for work" — a control plane, not a chatbot. Monorepo: `server/` (Express), `ui/` (React+Vite), `packages/db` (Drizzle/Postgres), `packages/adapters/*` (one per agent runtime), `cli/`.

## Top 15 findings most relevant to us

1. **Org chart = one flat `agents` table with a self-referential `reportsTo` FK.** Trivially portable to our Supabase schema for Head of Sales → {Scout, Researcher, SDR, Closer}. — `agents-and-org.md`, `packages/db/src/schema/agents.ts:16-50`
2. **Budget is two-tier: per-company AND per-agent, in cents, monthly, with live `spentMonthlyCents`.** Soft alert at 80% (notify only), hard stop at 100% (auto-pause + mandatory human approval object). Matches our "500 credits/day" idea. — `budgets-approvals-audit.md`, `server/src/services/budgets.ts:168-252`
3. **Agents are stateless heartbeat runs, not daemons** — "you wake up, check your work, do something useful, and exit." Direct model for our Node functions triggered by Slack mention/schedule/webhook instead of always-on loops. — `tasks-and-heartbeats.md`, `skills/paperclip/SKILL.md:12`
4. **Atomic checkout with a hard "never retry a 409" rule** prevents two agents double-working the same task/lead. `POST /issues/{id}/checkout` with `expectedStatuses`. Worth copying verbatim for our lead/task queue. — `tasks-and-heartbeats.md`
5. **Delegation reports up via blockers, not cross-boundary comments**: subtask + `blockedByIssueIds` on the parent → parent auto-wakes on `issue_blockers_resolved`. A delegate posts findings on its *own* issue, never the parent's (403 otherwise for low-trust delegates). Clean pattern for SDR/Closer reporting to Head of Sales without write access to the parent. — `tasks-and-heartbeats.md`
6. **Status `blocked` requires a routable owner** — first-class `blockedByIssueIds`, a named pending approval, or a structured `unblockDescriptor{owner, action}`. Prose-only "blocked by X" is rejected/flagged. Maps to our "waiting on founder approval" state. — `agents-and-org.md`, `doc/execution-semantics.md`
7. **Company with zero agents auto-routes into onboarding instead of showing an empty dashboard** (`shouldRouteAgentlessCompanyToOnboarding`, `ui/src/lib/onboarding-route.ts`). Directly copyable for our "no agents yet" state after `/hire-sales`. — `onboarding.md`
8. **Hiring an agent is a two-step progressive-disclosure flow**: quick modal (name/role) seeds a URL, then a full config page (model/instructions/budget) — not one big form. — `onboarding.md`, `NewAgentDialog.tsx`
9. **Invite claim-secret pattern**: an agent process self-claims its own API key after a human approves the join. Reusable for our Slack-bot-side agent bootstrap. — `onboarding.md`, `doc/spec/invite-flow.md:17-19,60-66`
10. **Paperclip's Slack connector deliberately does NOT do per-agent personas** — single bot identity; which agent is "speaking" lives in message content/threading, not custom icon/name per message. Our planned `postAs(agent, channel, text)` multi-persona pattern goes beyond what Paperclip does — we're not copying them there. — `slack-and-integrations.md`
11. **Slack governed-action allowlist**: creating channels, inviting people, deleting messages/bookmarks all require approval; new bot-created channels stay disabled until a human enables them. Worth a small mirrored allowlist for risky agent actions (e.g. first send to a brand-new contact). — `slack-and-integrations.md`
12. **Scheduled Slack output (standups) rides on generic "routines," not bespoke cron+Slack code.** Direct precedent for our daily 9:00 standup / `/sales-standup`. — `slack-and-integrations.md`
13. **Realtime is hand-rolled WebSocket that patches the TanStack Query cache directly per event** (batched invalidation, 15s poll fallback, suppressed reconnect-storm toasts). Supabase Realtime gives us the same effect natively with far less code — copy the dedup/suppress rules, not the transport. — `architecture.md`, `ui/src/context/LiveUpdatesProvider.tsx`
14. **Static org-chart image generation via Satori** (`scripts/generate-org-chart-images.ts`) produces a shareable PNG separate from their live interactive canvas — the cheap way to post an org chart into Slack without a headless browser or porting their 673-line interactive component. — `ui-ux.md`, `steal-list.md`
15. **DESIGN.md wording/status discipline**: one canonical noun per concept ("task", never "issue"), buttons name the action ("Approve hire," not "Submit"), one semantic status-token set reused identically across badge/row/chart/log, and a "don't toast what's already visible on screen" rule — directly solves our Slack-vs-portal double-notification problem. — `ui-ux.md`, `DESIGN.md`

## File map
- `ui-ux.md` — screen-by-screen UI survey, design tokens, component inventory
- `onboarding.md` — CLI + UI zero-to-running-company flow
- `agents-and-org.md` — schema: companies/agents/goals/projects/issues
- `tasks-and-heartbeats.md` — assignment, checkout, delegation, heartbeat triggers, agent prompts
- `budgets-approvals-audit.md` — cost ledger, budget auto-pause, approvals UX, audit log
- `slack-and-integrations.md` — Slack connector model, permissions, other chat channels
- `architecture.md` — monorepo, server/DB stack, realtime mechanism, adapter pattern
- `steal-list.md` — prioritized copy-list with source paths and S/M/L effort estimates
