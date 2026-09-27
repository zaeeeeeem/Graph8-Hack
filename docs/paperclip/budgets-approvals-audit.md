# Budgets, Approvals, Audit

## Cost tracking (ledger)

- `cost_events` is the canonical usage/inference ledger: provider, model, tokens, `costCents`. `heartbeat_runs.usage_json` is operational only — reporting must not reconstruct billing from it. — `doc/plans/2026-03-14-billing-ledger-and-reporting.md`
- Planned split: `cost_events` (per-request inference) vs. future `finance_events` (top-ups, platform fees, refunds, provisioned throughput, training/storage). Not yet built as of this doc. — same file
- Usage classes distinguished for honest reporting: `subscription_included` (visible, doesn't count against budget), `subscription_overage` (counts), `metered_api` (counts). — `doc/plans/2026-03-14-budget-policies-and-enforcement.md`
- `server/src/services/costs.ts` and `server/src/services/agents.ts:408` compute `spentMonthlyCents` as `SUM(cost_events.costCents)` per agent, joined live (not a cached counter read alone).
- UI: `ui/src/pages/Costs.tsx` / `Costs.production.tsx` — dashboard for spend.

## Budget model (current code, `server/src/services/budgets.ts`)

- Scopes: **company**, **agent**, **project** (`policy.scopeType`).
- A `PolicyRow` has `metric` (`billed_cents` is the only enforced metric — token budgets are advisory/future), `windowKind` (`calendar_month_utc` for company/agent, `lifetime` for project), `amount`, `warnPercent`.
- Two threshold classes (`doc/plans/2026-03-14-budget-policies-and-enforcement.md`):
  - **soft alert** (default 80%): visible notification only, no pause, no approval.
  - **hard stop** (100%): pauses the scope automatically AND creates an approval requiring human resolution.
- `budget_incidents` (planned/added): durable record of threshold crossings, deduped one-open-incident-per-policy/threshold/window so alerts don't spam.

## Auto-pause mechanics

- `server/src/services/budgets.ts:214` `pauseScopeForBudget(policy)`: sets `agents`/`companies`/`projects` row to `status: "paused"`, `pauseReason: "budget"`, `pausedAt: now`. Agent pause only applies from states `["active","idle","running","error"]`.
- `server/src/services/budgets.ts:252` `pauseAndCancelScopeForBudget` — pauses then also resets to `idle`/clears `pauseReason` path for resume (used when a human raises budget and resumes).
- Resume clears `pauseReason: null, pausedAt: null` and only where `pauseReason === "budget"` (so a manually-paused agent isn't silently resumed by a budget action).
- Approval payload created on hard-stop (`buildApprovalPayload`, `budgets.ts:168`): includes `scopeType/scopeId/scopeName`, `metric`, `windowKind`, `thresholdType`, `budgetAmount`, `observedAmount`, `warnPercent`, `windowStart/End`, `policyId`, and fixed guidance copy: **"Raise the budget and resume the scope, or keep the scope paused."**

## Approvals UX

- List page `ui/src/pages/Approvals.tsx`: two tabs — **Pending** (with a yellow count badge) and **All**. Filter includes `status === "pending" || status === "revision_requested"`. Empty state: **"No pending approvals."** / **"No approvals yet."** (ShieldCheck icon, muted).
- Cards sorted newest first; `ApprovalCard` component renders each row.
- Detail page `ui/src/pages/ApprovalDetail.tsx`: shows `AgentIdentity`, `StatusBadge`, a typed payload renderer (`ApprovalPayloadRenderer`, `approvalLabel`, `typeIcon`) that renders the approval's structured payload (e.g. the budget payload above) instead of raw JSON by default, with a raw-payload toggle (`showRawPayload`). Supports comments (`ApprovalComment` type from `@paperclipai/shared`) and linked issues (`listIssues`).
- Actions: `approvalsApi.approve(id)` / `.reject(id)` mutations; on approve, navigates to `/approvals/{id}?resolved=approved`.
- "Approval gates for governed actions" is a stated invariant in `AGENTS.md` §5 — not just budgets: any governed mutation can route through this same approval object/UI.

## Audit log

- Dedicated `ui/src/pages/audit/` directory: `AuditFeed.tsx`/`.production.tsx` (live activity feed), `AuditHub.tsx` (landing/nav), `AuditRuns.tsx` (heartbeat run history), `CompanyActivity.tsx`/`.production.tsx` (per-company activity log).
- `AGENTS.md` §5 invariant: "Activity logging for mutating actions" — every mutation should write an activity-log row; §8 requires the same for new API endpoints ("write activity log entries for mutations").
- Separate from audit: the **run log** (`heartbeat_run_events` table) is an operational execution trace, not a governance audit trail — see `doc/run-log-events.md`, `server/src/services/heartbeat.ts` (`appendRunEvent`). Don't conflate the two when copying the pattern.

## Relevance to our Slack sales-team build

| Paperclip pattern | Steal for us |
|---|---|
| Scope-based budget (`company > agent > project`) with `billed_cents` metric only, monthly for agents / lifetime for projects | Mirror: per-agent (Scout/Researcher/SDR/Closer) daily/monthly credit budget vs. Head of Sales company-level budget; skip token budgets entirely, only track graph8 credits/$ |
| Soft alert (80%) vs hard stop (100%) with auto-pause + mandatory human approval object | Map directly to our founder-approval Slack pattern: "Ready to launch to 12 leads. [Approve] [Edit] [Skip]" — reuse the two-tier threshold idea for budget, not just launch actions |
| Approval payload is a structured, typed object (not raw JSON) rendered with a dedicated component per approval type | Keep our Slack approval messages structured (Block Kit) with type-specific rendering, same idea |
| Fixed, reusable guidance string on the approval ("Raise the budget and resume...") | Write similarly concrete action copy for our Slack approval buttons |
