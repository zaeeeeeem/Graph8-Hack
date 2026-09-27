# Agents & Org Data Model

Source repo: `extra/paperclip` (Drizzle ORM schema, `packages/db/src/schema/*.ts`).

## Hierarchy

```
Company (1) ──< Agent (org chart: agents.reportsTo → agents.id, self-referential)
Company (1) ──< Goal (tree: goals.parentId → goals.id)
Company (1) ──< Project (Project.goalId → Goal, optional)
Company (1) ──< Issue/Task (Issue.projectId → Project, Issue.goalId → Goal, Issue.parentId → Issue, self-referential)
```

Goals → Projects → Issues is a loose hierarchy (each level's `companyId` is authoritative; `goalId`/`projectId` are optional links, not strict containment). Issues form their own parent/child tree independently via `parentId` (sub-issues), separate from the goal/project link.

## `agents` table — `packages/db/src/schema/agents.ts:16-50`

| Field | Type | Notes |
|---|---|---|
| `companyId` | uuid, FK→companies | scoping root |
| `name` | text | |
| `role` | text, default `"general"` | free-text role (e.g. CEO, Coder, QA) |
| `title` | text (nullable) | display title |
| `icon`, `appearance` (jsonb `AgentAppearance`) | | avatar/branding |
| `status` | text, default `"idle"` | lifecycle status |
| `reportsTo` | uuid, self-FK → `agents.id` | **the org chart edge** |
| `capabilities` | text | |
| `adapterType` | text, default `"process"` | which runtime adapter runs this agent (Claude/Codex/Cursor/bash/HTTP/etc.) |
| `adapterConfig` | jsonb, default `{}` | adapter-specific config |
| `runtimeConfig` | jsonb, default `{}` | includes `heartbeat.wakeOnDemand` etc. (see tasks-and-heartbeats.md) |
| `defaultEnvironmentId` | uuid → environments | sandbox/exec environment |
| `budgetMonthlyCents` / `spentMonthlyCents` | integer | **budget + spend, in cents, monthly** |
| `pauseReason`, `pausedAt` | | auto-pause bookkeeping |
| `errorReason` | | |
| `permissions` | jsonb `{}` | |
| `lastHeartbeatAt` | timestamp | |
| `metadata` | jsonb | |

Indexes: `(companyId, id)` unique, `(companyId, status)`, `(companyId, reportsTo)`, `(companyId, defaultEnvironmentId)` — the `reportsTo` index confirms org-chart lookups (subordinates-by-manager) are a first-class query.

`GET /api/agents/me` returns identity, `companyId`, `role`, **`chainOfCommand`**, and budget (referenced in `skills/paperclip/SKILL.md:81`) — i.e. the chain-of-command is derived/served, not just a raw FK walk client-side.

## `companies` table — `packages/db/src/schema/companies.ts:4-37`

| Field | Notes |
|---|---|
| `issuePrefix` (default `"PAP"`) + `issueCounter` | human-readable identifiers like `PAP-1234` |
| `budgetMonthlyCents` / `spentMonthlyCents` | company-level budget mirrors agent-level |
| `requireBoardApprovalForNewAgents` (bool) | governance gate on hiring |
| `defaultResponsibleUserId` | fallback human owner |
| `interactionResolverGovernance` (jsonb) | who may resolve pending interactions |
| `feedbackDataSharingEnabled` + consent fields | opt-in telemetry sharing |
| `status`, `pauseReason`, `pausedAt` | company-wide pause |

## `goals` table — `packages/db/src/schema/goals.ts:12-29`

- `level` (text, default `"task"`) — goals are leveled (implies a hierarchy of granularity, e.g. company mission → quarterly → task-level goal)
- `parentId` self-FK → tree structure
- `ownerAgentId` → agents — an agent owns a goal
- `status`, default `"planned"`

## `projects` table — `packages/db/src/schema/projects.ts:7-31`

- `goalId` → goals (optional link up)
- `leadAgentId` → agents (project has a lead)
- `status`, default `"backlog"`
- `targetDate` (date), `color`, `icon` — used for card/board display
- `env` (jsonb `AgentEnvConfig`) — per-project execution environment config
- `executionWorkspacePolicy` (jsonb) — how workspaces are provisioned for issues in this project
- `pauseReason`/`pausedAt`, `archivedAt`

## `issues` table (= "tasks" in UI copy) — `packages/db/src/schema/issues.ts:25-90`

Single-assignee, heavily state-tracked. Key fields:

- **Identity/hierarchy:** `companyId`, `projectId`, `goalId`, `parentId` (self-FK, sub-issues), `issueNumber`, `identifier` (e.g. `PAP-1234`)
- **Assignment (mutually exclusive, hard invariant):** `assigneeAgentId` OR `assigneeUserId` — "Paperclip is single-assignee by design" (`doc/execution-semantics.md:29`)
- **Execution lock:** `checkoutRunId`, `executionRunId` (both → `heartbeat_runs.id`), `executionAgentNameKey`, `executionLockedAt` — this is the atomic-checkout mechanism
- **Status:** `status` (default `"backlog"`) + `statusVersion` (bigint, optimistic-concurrency counter) + `lastStatusDecisionId`
- **Work mode:** `workMode` (default `"standard"`), `harnessKind`
- **Review:** `reviewPolicy` (jsonb, typed `IssueReviewPolicy`)
- **Conversation/chat-mode fields:** `conversationAgentId`, `conversationUserId`, `conversationState` (`"active"|"waiting"`), `conversationSessionGeneration`, `conversationBoundaryCommentId` — issues can *be* a chat thread, not just a task
- **Origin tracking:** `originKind` (default `"manual"`), `originId`, `originRunId`, `originFingerprint` — where the issue came from (manual, automation, chat, github, etc.)
- **Blocking/monitoring:** `unblockDescriptor` (jsonb `IssueUnblockDescriptor`), `monitorNextCheckAt`, `monitorWakeRequestedAt`, `monitorAttemptCount`, `monitorNotes` — first-class scheduled re-checks, not just prose "blocked by X"
- **Trust:** `sourceTrust` (jsonb `SourceTrustMetadata`) — used for low-trust/review-contained delegate gating
- **Timestamps:** `startedAt`, `completedAt`, `cancelledAt`, `hiddenAt`, `blockedTransitionAt`, `blockedOwnerNotifiedAt`

## Status semantics (`doc/execution-semantics.md`)

| Status | Meaning |
|---|---|
| `backlog` | not ready, no pickup/execution expectation |
| `todo` | actionable, unclaimed or assigned, no checkout lock required yet |
| `in_progress` | actively owned; for agent-owned issues this is execution-backed (must not go silently dead) |
| `blocked` | needs a **routable waiting path**: first-class `blockedByIssueIds`, a named pending interaction/approval, or a structured `unblockDescriptor {owner, action}`. Prose-only "blocked by X" in a comment is rejected/auto-flagged `needs_attention` — it routes to nobody. |
| `in_review` | next move belongs to a reviewer/approver, not the executor |

## Relevance to our Slack sales-team build

1. **`reportsTo` self-FK on a single `agents` table** is the entire org chart — trivial to replicate in our Supabase schema for Head of Sales → {Scout, Researcher, SDR, Closer}.
2. **Budget is per-agent AND per-company, in cents, monthly**, with `spentMonthlyCents` tracked alongside the cap — directly matches our "500 credits/day" budget idea; consider mirroring the two-tier (org + per-agent) cap.
3. **Single-assignee + status-with-routable-waiting-path** is the core invariant worth stealing: never let an agent/task sit in a silent "blocked" state — every block must name who unblocks it and how (maps to our Head of Sales "waiting on founder approval" state).
4. **Goal → Project → Issue is a loose three-tier hierarchy, not strict containment** — useful pattern: our "campaign" (~Project) can link to a "sales goal" (~Goal) while tasks (~Issue) reference both independently.
5. **Conversation-as-issue** (`conversationAgentId`/`conversationState`) — Slack threads-as-tasks is a proven pattern here; an issue can literally represent an ongoing chat instead of a discrete unit of work.
