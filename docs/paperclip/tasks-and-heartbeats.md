# Tasks & Heartbeats — work assignment, checkout, delegation, reporting

Core idea (`skills/paperclip/SKILL.md:12`): *"You run in **heartbeats** — short execution windows triggered by Paperclip. Each heartbeat, you wake up, check your work, do something useful, and exit. You do not run continuously."* Agents are NOT long-running processes; every unit of work is a bounded, triggered run.

## Heartbeat trigger sources

`heartbeat_runs` table has `triggerDetail?: "manual" | "ping" | "callback" | "system"` (`server/src/services/heartbeat.ts:3663`). The actual **wake reason** taxonomy (stored in `contextSnapshot.wakeReason`, `server/src/services/heartbeat.ts:3370-3379,5612-5615`) includes (non-exhaustive, from source grep): `issue_assigned`, `issue_commented` / `issue_comment_mentioned`, `issue_blockers_resolved`, `issue_children_completed`, `issue_dependencies_blocked`, `approval_resolved`/`approval_requested`, plus schedule/monitor-driven wakes (`monitorNextCheckAt` on the issue itself, `server/src/services/issue-dependency-wakeups.ts`, `server/src/services/decision-wakeup.ts`).

Per-agent wake toggle: `runtimeConfig.heartbeat.wakeOnDemand` (aliases: `wakeOnAssignment`, `wakeOnOnDemand`, `wakeOnAutomation`), default `true` — `server/src/services/heartbeat-policy.ts:4-16`.

**Mention wakes:** `@-mentions trigger heartbeats — use sparingly, they cost budget. For machine-authored comments, resolve the target agent and emit a structured mention as `[@Agent Name](agent://<agent-id>)` instead of raw `@AgentName` text.`* (`skills/paperclip/SKILL.md:561`)

**Comment wake dedup logic** — `shouldWakeAssigneeForIssueComment()` (`server/src/services/issue-comment-wakeup.ts:1-27`): does NOT wake the assignee if the comment is self-authored by the same run and no resume was requested; otherwise wakes unless the issue is `done`/`cancelled` and not reopened. This prevents an agent from waking itself in an infinite loop off its own comments.

## Assignment & atomic checkout

Single-assignee invariant: `assigneeAgentId` XOR `assigneeUserId`, never both (`doc/execution-semantics.md:26-30`, `packages/db/src/schema/issues.ts:49-50`).

Checkout is the **atomic execution lock**:
```
POST /api/issues/{issueId}/checkout
Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "agentId": "{your-agent-id}", "expectedStatuses": ["todo","backlog","blocked","in_review"] }
```
- If already checked out by the same agent → succeeds idempotently.
- If owned by another agent → `409 Conflict`. Rule: **"Never retry a 409"** (`skills/paperclip/SKILL.md`, Step 5).
- Backed by `issues.checkoutRunId` / `executionRunId` → `heartbeat_runs.id`, plus `executionLockedAt` and `executionAgentNameKey`.

## The heartbeat procedure (from `skills/paperclip/SKILL.md`, ~9 steps)

1. **Identity** — `GET /api/agents/me` → id, companyId, role, **chainOfCommand**, budget.
2. **Approval follow-up** — if `PAPERCLIP_APPROVAL_ID` set, fetch approval + linked issues, close (`done`) or comment.
3. **Get assignments** — `GET /api/agents/me/inbox-lite` (compact) or full issues query.
4. **Pick work** — priority `in_progress` → `in_review` (if woken by comment) → `todo`; skip `blocked` unless you can unblock. Special-cased by `PAPERCLIP_WAKE_REASON` (`issue_commented`, `issue_comment_mentioned`, etc.). Includes a **"blocked-task dedup"** rule: skip re-touching a blocked task if your last comment was the block and nobody replied since.
5. **Checkout** (see above).
6. **Understand context** — prefer `GET /api/issues/{issueId}/heartbeat-context` (compact issue state + ancestor summaries + goal/project info + comment cursor) over replaying the full thread. Wake payload in the run prompt already carries the new comment batch for comment-wakes — read that first, only fetch more if `fallbackFetchNeeded`.
7. **Do the work** — must produce a concrete disposition before exiting (comment/document/work-product + status update); "comments, documents... are evidence, not a liveness path by themselves." Use child issues for parallel/delegated work, **never busy-poll**.
8. **Generated artifacts** — upload deliverables via `scripts/paperclip-upload-artifact.sh` and create a `work product` (`pull_request`, `preview_url`, `runtime_service`, `commit`, `branch`, or `workspace_file` reference) rather than relying on local file paths.
9. **Delegate if needed** — `POST /api/companies/{companyId}/issues` with `parentId` + `goalId` set. Set `inheritExecutionWorkspaceFromIssueId` for same-workspace follow-ups that aren't true children. Set `billingCode` for cross-team work.

**Scoped-wake fast path:** if the run prompt includes a "Paperclip Resume Delta"/"Paperclip Wake Payload" naming a specific issue, skip steps 1-4 entirely and go straight to checkout — the server has already told you exactly what to do.

## Delegation & reporting up

- **Standard delegation:** create a subtask (`parentId` set) assigned to a subordinate; the parent issue blocks on it (`blockedByIssueIds`) so the `issue_blockers_resolved` wake reason brings the verdict back automatically.
- **Review delegation contract** (`skills/paperclip/SKILL.md:230-237`): run-scoped writes are subtree-scoped — a delegate can write to its own issue/descendants but generally **not** to the parent. So: *"Instruct the reviewer to post findings on their own review issue and mark it done... Never instruct a delegate to 'post findings as a comment on the parent'"* — for low-trust delegates that write would 403. The parent discovers the verdict via the blocker-resolved wake, not a cross-boundary comment.
- **Courier pattern (lateral coordination):** to reach an agent whose issues you can't write to, create a *new* issue assigned to them with full self-contained instructions — issue-CREATE is company-scoped and always available even when commenting into their boundary isn't.
- **Escalation:** *"Escalate via `chainOfCommand` when stuck. Reassign to manager or create a task for them."* And the explicit "Rule #1": **"NEVER ASK A HUMAN TO DO WHAT AN AGENT COULD DO... If you could ask your CEO to do it, then you do that."**
- **Never cancel cross-team tasks** — reassign to your manager with a comment instead.

## Context/information sharing between agents

- `heartbeat-context` endpoint bundles: compact issue state, ancestor summaries, goal/project info, comment cursor — this is the single call that replaces "read the whole thread."
- Wake payload embeds the **compact issue summary + ordered batch of new comments** directly in the run prompt so agents don't need an extra fetch for the common case.
- Blockers are first-class (`blockedByIssueIds`), not prose — this is what lets the system auto-wake the right agent when a dependency clears, rather than relying on someone reading a comment.
- **Issue documents** (a `plan` document type) carry structured, revisioned content (e.g. an approved plan) that survives across issues — chat-mode conversations copy their `plan` into new execution tasks via `initialPlan` at creation time (race-safe; writing to `description` or a later document is not).

## Prompts / instructions given to agents (quoted, `skills/paperclip/SKILL.md`)

- Identity/scope: *"You run in heartbeats... you do not run continuously."*
- Audit trail requirement: *"You MUST include `-H 'X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID'` on ALL API requests that modify issues."*
- Budget behavior: *"Budget: auto-paused at 100%. Above 80%, focus on critical tasks only."*
- Commit convention imposed on every agent: *"if you make a git commit you MUST add EXACTLY `Co-Authored-By: Paperclip <noreply@paperclip.ing>`... Do not put in your agent name."*
- Watcher honesty rule: *"Never tell a user a 'watcher'/monitor will wake you unless you scheduled a real issue monitor (non-null `monitorNextCheckAt`)."*

## Relevance to our Slack sales-team build

1. **Heartbeats-not-daemons** is the right mental model for our agents too: Head of Sales/Scout/SDR/etc. should be Node functions invoked on a trigger (Slack mention, schedule, webhook callback), not always-on loops — cheaper and matches Paperclip's proven pattern.
2. **First-class blockers + auto-wake-on-resolve** (`blockedByIssueIds` → `issue_blockers_resolved`) is directly reusable for our "Head of Sales delegates to Scout, waits, gets pinged when Scout's task is done" flow — avoid polling, store a `blocked_by` edge and re-trigger.
3. **The single-assignee + atomic checkout + `409` no-retry rule** prevents two agents double-working the same lead/task — worth copying verbatim for our task queue.
4. **The "never post to parent, post to your own issue + let blocker-resolution carry the verdict" pattern** is the clean way to have SDR/Closer report up without needing cross-agent write permissions.
5. **Rule #1 ("never ask a human what an agent could do")** and the 80%/100% budget-behavior rule are good literal copy candidates for our Head of Sales persona prompt.
