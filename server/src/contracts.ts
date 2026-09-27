/**
 * server/src/contracts.ts — the seams between workers. Written by the coordinator before any worker starts.
 *
 * Every module below is owned by ONE worker (see docs/BUILD-PLAN.md §5). Others import only these types and the
 * named exports listed here. Change this file only via the coordinator.
 *
 *   src/lib/env.ts        W1a  export const env: Env
 *   src/lib/log.ts        W1a  export const log: Logger
 *   src/lib/bus.ts        coordinator  export const bus: Bus (typed EventEmitter, done)
 *   src/lib/store.ts      W1a  export const store: Store
 *   src/lib/g8.ts         W1a  export const g8: G8
 *   src/lib/llm.ts        W1a  export const llm: Llm
 *   src/lib/slack.ts      W1b  export const slack: SlackPort
 *   src/agents/runtime.ts W1a  export const runtime: Runtime
 *   src/layers.ts         W1a  export const layers: LayerRegistry
 *   src/agents/<name>.ts  W2–W5 export const <name>: AgentBrain
 */
import type {
  AgentRole, ApprovalKind, ApprovalPayload, ApprovalRow, Channel, JsonObject, LeadRow, ReportKind, TaskKind,
  TaskRow, UUID, WorkspaceRow, WorkspaceSettings,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------
export interface AllowlistEntry { name: string; email?: string; phone?: string; linkedin?: string }
export interface Env {
  G8_API_KEY: string; G8_BASE_URL: string; G8_WEBHOOK_SECRET?: string; G8_DEMO_SCHEDULE_ID?: string;
  GEMINI_API_KEY: string; GEMINI_MODEL: string;
  SLACK_BOT_TOKEN: string; SLACK_APP_TOKEN: string; SLACK_SIGNING_SECRET: string;
  SLACK_CHANNEL_TEAM: string; SLACK_CHANNEL_HQ: string;
  SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string;
  /** Workspace row the running server serves (test workspace before 12:00, demo after). */
  WORKSPACE_ID: string;
  PUBLIC_URL?: string; PORT: number;
  /** Parsed TEST_ALLOWLIST "Name|email|phone|linkedin;..." */
  allowlist: AllowlistEntry[];
  /** LAYERS_DISABLED comma list, e.g. ['voice','ai_research']. */
  layersDisabled: string[];
  SLACK_DISABLED: boolean;
}

// ---------------------------------------------------------------------------
// log
// ---------------------------------------------------------------------------
export interface Logger {
  info(msg: string, data?: object): void;
  warn(msg: string, data?: object): void;
  error(msg: string, data?: object): void;
  child(scope: string): Logger;
}

// ---------------------------------------------------------------------------
// bus — Slack/inbound/cron emit, runtime + agents subscribe. Nobody imports Slack from runtime or vice versa.
// ---------------------------------------------------------------------------
export interface SlackCtx {
  workspaceId: UUID;
  userId: string;       // Slack user id of the founder
  channel: string;
  threadTs?: string;    // thread the message/button lives in
  messageTs?: string;
}
export interface BusEvents {
  /** /hire-sales <url>, /sales-standup, … `text` = args after the command. */
  'slack.command': { command: string; text: string; ctx: SlackCtx };
  /** Button/select. actionId e.g. 'approval.approve' | 'approval.edit' | 'approval.skip' | 'plan.start' … value = our id. */
  'slack.action': { actionId: string; value: string; ctx: SlackCtx };
  /**
   * Founder message: DM, @mention, reply in one of our threads, or a top-level #sales-team/#sales-hq message that
   * addresses an agent by name ("Bilal, find 5 fintech CFOs"). `addressed` = the agent the founder is talking to.
   */
  'slack.message': { text: string; ctx: SlackCtx; kind: 'dm' | 'mention' | 'thread_reply'; addressed?: AgentRole };
  /** Normalised graph8 event (webhook or poll), already deduped via inbound_events. */
  'graph8.event': { type: string; payload: JsonObject; inboundEventId: number | string; workspaceId: UUID };
  /** Cron ticks. */
  'cron.tick': { name: 'standup_0900' | 'inbox_poll' | 'linkedin_watch' | 'step_scheduler' | 'budget_reset' | (string & {}) };
}
export interface Bus {
  on<K extends keyof BusEvents>(event: K, fn: (e: BusEvents[K]) => void | Promise<void>): void;
  emit<K extends keyof BusEvents>(event: K, e: BusEvents[K]): void;
}

// ---------------------------------------------------------------------------
// store — thin Supabase (service role) wrapper. Returns rows from shared/types.ts.
// W1a implements; agents may also use `store.db` (raw SupabaseClient) for anything not wrapped.
// ---------------------------------------------------------------------------
export interface Store {
  db: any; // SupabaseClient (service role). Typed loosely on purpose.
  workspace(id: UUID): Promise<WorkspaceRow>;
  settings(id: UUID): Promise<WorkspaceSettings>;              // merged over DEFAULT_WORKSPACE_SETTINGS
  patchSettings(id: UUID, patch: Partial<WorkspaceSettings>): Promise<WorkspaceSettings>;
  agentByRole(workspaceId: UUID, role: AgentRole): Promise<{ id: UUID; name: string; role: AgentRole }>;
  /** Credit ledger + budget check. Throws BudgetExceeded when the agent is over its daily budget. */
  spend(e: { workspaceId: UUID; agentId: UUID; source: 'graph8' | 'llm' | 'manual'; action: string; credits: number; taskId?: UUID; runId?: UUID; meta?: JsonObject }): Promise<void>;
}

// ---------------------------------------------------------------------------
// g8 — graph8 REST wrapper with the TEST-CONTACT GUARD.
// ---------------------------------------------------------------------------
export class NotAllowlisted extends Error {
  constructor(what: string) { super(`Blocked by allowlist guard: ${what}`); this.name = 'NotAllowlisted'; }
}
export interface G8 {
  get<T = any>(path: string, query?: Record<string, unknown>): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  patch<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body?: unknown): Promise<T>;
  del<T = any>(path: string): Promise<T>;
  /**
   * Every call that SENDS to a person (enroll in sequence, inbox send, voice call, booking) MUST go through these.
   * They resolve the graph8 contact / address and throw NotAllowlisted unless it matches env.allowlist.
   */
  enrollGuarded(sequenceId: string | number, contactIds: Array<string | number>, listId: string | number): Promise<any>;
  sendReplyGuarded(replyId: string | number, body: { body: string; channel: string; subject?: string; from_address?: string }): Promise<any>;
  callGuarded(body: { to_phone: string; from_phone: string; agent_id: string; [k: string]: unknown }): Promise<any>;
  bookGuarded(body: { event_type_id: number; start_time: string; attendees: Array<{ name: string; email: string; time_zone?: string }>; [k: string]: unknown }): Promise<any>;
  isAllowlisted(x: { email?: string | null; phone?: string | null; g8ContactId?: string | number | null }): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// llm — Gemini. Every call records source='llm' spend for the agent.
// ---------------------------------------------------------------------------
export interface LlmCallOpts { agentId: UUID; workspaceId: UUID; taskId?: UUID; system?: string; temperature?: number }
export interface Llm {
  text(prompt: string, opts: LlmCallOpts): Promise<string>;
  /** JSON mode; `schema` is a zod schema; result validated. */
  json<T>(prompt: string, schema: import('zod').ZodType<T>, opts: LlmCallOpts): Promise<T>;
}

// ---------------------------------------------------------------------------
// slack — W1b. Agents never call Bolt directly.
// ---------------------------------------------------------------------------
export type Block = Record<string, unknown>; // Slack Block Kit block
export interface ChecklistItem { key: string; label: string; state: 'todo' | 'doing' | 'done' | 'warn' | 'fail' | 'paused'; note?: string }
export interface Checklist {
  ts: string; channel: string;
  set(key: string, state: ChecklistItem['state'], note?: string): Promise<void>;
  add(item: ChecklistItem): Promise<void>;
  title(t: string): Promise<void>;
}
export interface SlackPort {
  /** Post as one of the 5 personas (chat:write.customize username + icon). Returns message ts. */
  postAs(role: AgentRole, channel: 'team' | 'hq' | string, msg: { text: string; blocks?: Block[]; threadTs?: string }): Promise<{ ts: string; channel: string }>;
  update(channel: string, ts: string, msg: { text: string; blocks?: Block[] }): Promise<void>;
  /** Quick ack (< 1 s feel) then a live checklist message that edits in place (D: ack + checklist in thread). */
  checklist(role: AgentRole, channel: 'team' | 'hq' | string, title: string, items: ChecklistItem[], threadTs?: string): Promise<Checklist>;
  /** Per-agent run thread in #sales-team; returns the parent ts so all progress goes in-thread. */
  agentThread(role: AgentRole, title: string): Promise<{ ts: string; channel: string }>;
  /** Approval card in #sales-hq with [Approve/Launch] [Edit] [Skip]; buttons carry value = approvalId. */
  approvalCard(role: AgentRole, a: { approvalId: UUID; title: string; blocks: Block[]; approveLabel?: string }): Promise<{ ts: string; channel: string }>;
  dm(userId: string, msg: { text: string; blocks?: Block[] }): Promise<void>;
  /** Link to a message (for "details in thread →"). */
  permalink(channel: string, ts: string): Promise<string>;
  start(): Promise<void>;
}

// ---------------------------------------------------------------------------
// runtime — W1a. Owns tasks/runs/reports/approvals lifecycle; dispatches tasks to AgentBrains.
// ---------------------------------------------------------------------------
export interface RunCtx {
  workspaceId: UUID;
  agentId: UUID;
  role: AgentRole;
  task: TaskRow;
  runId: UUID;
  settings: WorkspaceSettings;
  log: Logger;
  /** Record a run_steps row (tool/llm/slack/note) — powers the portal activity feed. No PII in summary. */
  step(kind: 'tool' | 'llm' | 'slack' | 'note', name: string, summary: string, data?: JsonObject): Promise<void>;
  /** Write a reports row (and let Ayesha mirror wins/alerts to #sales-hq). No PII. */
  report(kind: ReportKind, title: string, body: string, data?: JsonObject): Promise<void>;
  /** Create a child task for another agent (Ayesha's delegate_task, or handoffs). */
  delegate(to: AgentRole, kind: TaskKind, title: string, input: JsonObject, opts?: { parentTaskId?: UUID; priority?: 0 | 1 | 2 | 3 }): Promise<TaskRow>;
  /** Create approvals row + card; task becomes blocked_on='approval'. Decision arrives via AgentBrain.onApproval. */
  requestApproval(kind: ApprovalKind, title: string, payload: ApprovalPayload, blocks: Block[], approveLabel?: string): Promise<ApprovalRow>;
  /** Per-run thread + checklist helpers already bound to this agent's persona. */
  thread(): Promise<{ ts: string; channel: string }>;
}
export interface AgentBrain {
  role: AgentRole;
  /** Handle one task (the playbook). Throw to fail the task; return summary for tasks.result_summary. */
  run(ctx: RunCtx): Promise<string | void>;
  /** Approval decided by founder. decision='edit' comes with the founder's note from the thread. */
  onApproval?(ctx: RunCtx, approval: ApprovalRow, decision: 'approved' | 'rejected' | 'edit', note?: string): Promise<void>;
  /** graph8 events routed to this agent (Zara: replies/meetings/calls; Usman: sends/bounces). */
  onEvent?(ctx: Omit<RunCtx, 'task' | 'runId'> & { task?: TaskRow }, type: string, payload: JsonObject): Promise<void>;
}
export interface Runtime {
  register(brain: AgentBrain): void;
  /** Create a task and run it (async). */
  enqueue(workspaceId: UUID, to: AgentRole, kind: TaskKind, title: string, input: JsonObject, opts?: { parentTaskId?: UUID; priority?: 0 | 1 | 2 | 3; slack?: SlackCtx }): Promise<TaskRow>;
  start(): Promise<void>;
}

// ---------------------------------------------------------------------------
// layers — W1a registry; layer workers (W9–W12) register into it. Layer 0 never imports a layer.
// ---------------------------------------------------------------------------
export interface OnboardingExtra { name: string; label: string; run(ctx: RunCtx): Promise<{ ok: boolean; note?: string }> }
export interface PlannedStep {
  day: number; channel: Channel; action: string;
  state: 'live' | 'planned'; reason?: string;
  /** graph8 step object to include in POST /sequences when state='live' and sent by graph8; omit if we fire it ourselves. */
  g8Step?: JsonObject;
  /** For steps we fire ourselves (voice): scheduler calls this at step time per enrolled lead. */
  fire?(ctx: { workspaceId: UUID; lead: LeadRow; g8ContactId: string | number; sequenceId: string | number }): Promise<void>;
}
export interface ResearchSource { name: string; collect(ctx: RunCtx, leads: LeadRow[]): Promise<Record<UUID, { facts: string[]; signals?: JsonObject[] }>> }
export interface Layer {
  name: 'voice' | 'linkedin' | 'intent' | 'ai_research' | 'intelligence' | (string & {});
  onboarding?: OnboardingExtra;
  stepPlan?(ctx: RunCtx, leads: LeadRow[]): Promise<PlannedStep[]>;
  research?: ResearchSource;
  /** Bilal: extra signals per company domain. */
  signals?(ctx: RunCtx, persona: string): Promise<Array<{ domain: string; signals: JsonObject[] }>>;
  inbound?: Record<string, (e: BusEvents['graph8.event']) => Promise<void>>;
  /** Background loops (watchers). */
  start?(): Promise<void>;
}
export interface LayerRegistry {
  register(layer: Layer): void;
  /** Enabled layers only (env.layersDisabled filtered). Every call site wraps each layer in try/catch — a layer never breaks L0. */
  all(): Layer[];
}
