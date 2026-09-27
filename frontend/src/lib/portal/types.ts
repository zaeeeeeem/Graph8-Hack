/**
 * shared/types.ts — TypeScript contract for supabase/migrations/001_init.sql.
 *
 * Rules:
 *  - One `XxxRow` interface per table/view, column names and nullability exactly as in SQL.
 *  - Every text+CHECK column has a string-literal union type here AND a matching
 *    `XXX_VALUES` const array (use the array for Slack select menus / validation).
 *  - Timestamps are ISO strings (`timestamptz`), uuids are strings, `bigint identity`
 *    columns are numbers, `numeric` columns arrive as strings from PostgREST.
 *  - `Insert<Row>` / `Update<Row>` helpers at the bottom for the store layer.
 *
 * Keep this file and 001_init.sql in sync — change them together.
 */

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------
export type UUID = string;
export type ISODateTime = string; // timestamptz
export type ISODate = string;     // date  (YYYY-MM-DD)
export type SlackTs = string;     // "1790000000.000100"
export type SlackChannelId = string; // "C0C4KMJMKK7"
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// ---------------------------------------------------------------------------
// Enumerations (text + CHECK in SQL)
// ---------------------------------------------------------------------------
export const WORKSPACE_STATUS_VALUES = ['onboarding', 'active', 'paused', 'archived'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUS_VALUES)[number];

export const MEMBER_ROLE_VALUES = ['owner', 'member', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number];

/** Fixed for the hackathon; adding a role = one ALTER on agents_role_chk + a server brain. */
export const AGENT_ROLE_VALUES = ['head_of_sales', 'scout', 'researcher', 'sdr', 'closer'] as const;
export type AgentRole = (typeof AGENT_ROLE_VALUES)[number];

export const AGENT_STATUS_VALUES = ['idle', 'working', 'waiting_on_you', 'paused', 'error'] as const;
export type AgentStatus = (typeof AGENT_STATUS_VALUES)[number];

export const AGENT_PAUSE_REASON_VALUES = ['budget', 'manual', 'error'] as const;
export type AgentPauseReason = (typeof AGENT_PAUSE_REASON_VALUES)[number];

export const TASK_KIND_VALUES = [
  'onboard', 'plan', 'find_prospects', 'research_leads', 'build_sequence', 'launch_sequence',
  'handle_reply', 'book_meeting', 'create_deal', 'standup', 'answer_question', 'custom',
] as const;
export type TaskKind = (typeof TASK_KIND_VALUES)[number];

export const TASK_STATUS_VALUES = ['todo', 'in_progress', 'blocked', 'done', 'failed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

/** Who/what unblocks a blocked task (Paperclip "routable owner" rule). */
export const TASK_BLOCKED_ON_VALUES = ['founder', 'approval', 'task', 'graph8', 'connection', 'budget', 'lead'] as const;
export type TaskBlockedOn = (typeof TASK_BLOCKED_ON_VALUES)[number];

/** Task priority: 0 urgent … 3 low. */
export type TaskPriority = 0 | 1 | 2 | 3;

export const RUN_TRIGGER_VALUES = [
  'slack_message', 'slack_action', 'slash_command', 'cron', 'webhook', 'delegation', 'approval', 'system', 'manual',
] as const;
export type RunTrigger = (typeof RUN_TRIGGER_VALUES)[number];

export const RUN_STATUS_VALUES = ['running', 'succeeded', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUS_VALUES)[number];

export const RUN_STEP_KIND_VALUES = ['tool', 'llm', 'slack', 'note'] as const;
export type RunStepKind = (typeof RUN_STEP_KIND_VALUES)[number];

export const REPORT_KIND_VALUES = ['plan', 'update', 'handoff', 'standup', 'win', 'alert', 'question', 'answer'] as const;
export type ReportKind = (typeof REPORT_KIND_VALUES)[number];

export const APPROVAL_KIND_VALUES = [
  'launch_sequence', 'enroll_leads', 'send_reply', 'book_meeting', 'budget_increase', 'connect_account', 'custom',
] as const;
export type ApprovalKind = (typeof APPROVAL_KIND_VALUES)[number];

export const APPROVAL_STATUS_VALUES = ['pending', 'approved', 'rejected', 'edit_requested', 'expired', 'cancelled'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS_VALUES)[number];

export const SEQUENCE_STATUS_VALUES = ['draft', 'pending_approval', 'live', 'paused', 'completed', 'cancelled'] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUS_VALUES)[number];

export const CHANNEL_VALUES = ['email', 'linkedin', 'phone', 'sms', 'whatsapp'] as const;
export type Channel = (typeof CHANNEL_VALUES)[number];
/** lead_events.channel also allows 'system'. */
export type EventChannel = Channel | 'system';

export const LEAD_SOURCE_VALUES = ['scout', 'signal', 'inbound', 'manual', 'referral'] as const;
export type LeadSource = (typeof LEAD_SOURCE_VALUES)[number];

/** Pipeline order matters: portal_pipeline uses this order. */
export const LEAD_STAGE_VALUES = [
  'prospect', 'researched', 'queued', 'contacted', 'replied', 'meeting', 'deal', 'won', 'lost', 'disqualified',
] as const;
export type LeadStage = (typeof LEAD_STAGE_VALUES)[number];

export const DISQUALIFY_REASON_VALUES = [
  'not_interested', 'unsubscribed', 'bounced', 'wrong_person', 'no_fit', 'do_not_contact',
] as const;
export type DisqualifyReason = (typeof DISQUALIFY_REASON_VALUES)[number];

export const LEAD_SEQUENCE_STATE_VALUES = ['none', 'queued', 'enrolled', 'stopped', 'completed'] as const;
export type LeadSequenceState = (typeof LEAD_SEQUENCE_STATE_VALUES)[number];

export const REPLY_INTENT_VALUES = [
  'interested', 'question', 'objection', 'not_now', 'wrong_person', 'referral', 'not_interested',
  'unsubscribe', 'out_of_office', 'unknown',
] as const;
export type ReplyIntent = (typeof REPLY_INTENT_VALUES)[number];

export const LEAD_EVENT_TYPE_VALUES = [
  'found', 'researched', 'enrolled', 'stopped',
  'email_sent', 'email_opened', 'email_clicked', 'email_bounced',
  'linkedin_connection_sent', 'linkedin_connection_accepted', 'linkedin_message_sent',
  'call_placed', 'call_completed', 'voicemail_left', 'sms_sent',
  'reply_received', 'reply_classified', 'reply_sent',
  'meeting_proposed', 'meeting_booked', 'meeting_rescheduled', 'meeting_cancelled', 'meeting_no_show',
  'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost',
  'disqualified', 'note',
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPE_VALUES)[number];

export const EVENT_DIRECTION_VALUES = ['outbound', 'inbound', 'internal'] as const;
export type EventDirection = (typeof EVENT_DIRECTION_VALUES)[number];

export const INBOUND_SOURCE_VALUES = ['graph8', 'slack', 'cron', 'simulated', 'manual'] as const;
export type InboundSource = (typeof INBOUND_SOURCE_VALUES)[number];

export const INBOUND_STATUS_VALUES = ['received', 'processing', 'processed', 'ignored', 'failed'] as const;
export type InboundStatus = (typeof INBOUND_STATUS_VALUES)[number];

export const CREDIT_SOURCE_VALUES = ['graph8', 'llm', 'manual'] as const;
export type CreditSource = (typeof CREDIT_SOURCE_VALUES)[number];

/** Free text in SQL; these are the values the server uses. LLM cost rows use 'llm_run'. */
export type CreditAction =
  | 'enrich_person' | 'enrich_company' | 'verify_email' | 'ai_generate' | 'sequence_send'
  | 'voice_minutes' | 'intelligence_analyze' | 'llm_run' | 'adjustment' | (string & {});
/** Server constant: tokens per budget credit for source='llm' rows (env LLM_TOKENS_PER_CREDIT). */
export const DEFAULT_LLM_TOKENS_PER_CREDIT = 1000;

// ---------------------------------------------------------------------------
// JSON payload shapes (jsonb columns)
// ---------------------------------------------------------------------------
export interface SalesBrain {
  offer?: string;
  icp?: string;
  personas?: string[];
  tone?: string;
  proof?: string[];
  [k: string]: Json | undefined;
}

export interface LeadSignal {
  type: 'hiring' | 'funding' | 'intent' | 'visitor' | 'news' | 'tech' | (string & {});
  text: string;
  source?: string; // url or 'graph8 visitors'
}

export interface SequenceStep {
  n: number;           // 1-based step number
  day: number;         // day offset from launch
  channel: Channel;
  action: 'send' | 'connection_request' | 'message' | 'inmail' | 'like_post' | 'call' | 'sms' | (string & {});
  subject?: string;    // email only
  preview?: string;    // first line / note
}

export interface SequenceStats {
  sent?: number; opened?: number; clicked?: number; replied?: number; meetings?: number; bounced?: number;
}

/** approvals.payload, discriminated by approvals.kind. */
export interface LaunchSequencePayload {
  g8_sequence_id: string;
  lead_count: number;
  enroll_count: number; // allowlisted subset that will actually be enrolled
  channels: Channel[];
  first_send?: string;
}
export interface EnrollLeadsPayload { g8_sequence_id: string; lead_ids: UUID[]; }
export interface SendReplyPayload { channel: Channel; draft: string; slots?: string[]; g8_thread_id?: string; }
export interface BookMeetingPayload { slot: string; event_type: string; g8_contact_id: string; }
export interface BudgetIncreasePayload { agent_id: UUID; current: number; requested: number; reason: string; }
export interface ConnectAccountPayload { account: 'mailbox' | 'linkedin' | 'calendar' | 'phone'; connect_url: string; blocked_steps?: number[]; }
export type ApprovalPayload =
  | LaunchSequencePayload | EnrollLeadsPayload | SendReplyPayload | BookMeetingPayload
  | BudgetIncreasePayload | ConnectAccountPayload | JsonObject;

/** reports.data for kind='standup'. */
export interface StandupData {
  pipeline: { prospects: number; contacted: number; replied: number; meetings: number; deals: number; deal_value: number };
  credits: Record<string, number>; // agent name -> credits today
  blockers?: string[];
}

// ---------------------------------------------------------------------------
// Table rows
// ---------------------------------------------------------------------------
export interface WorkspaceRow {
  id: UUID;
  slug: string;
  name: string;
  company_domain: string | null;
  timezone: string;
  status: WorkspaceStatus;
  founder_name: string | null;
  founder_slack_user_id: string | null;
  g8_org_id: string | null;
  g8_schedule_id: string | null;
  slack_team_id: string | null;
  slack_channel_team: SlackChannelId | null;
  slack_channel_hq: SlackChannelId | null;
  standup_hour: number;
  demo_time_scale: string; // numeric -> string over PostgREST; Number() it
  is_demo: boolean;
  budget_daily_credits: number;
  spent_today_credits: number;
  spend_day: ISODate;
  task_counter: number;
  sales_brain: SalesBrain;
  settings: JsonObject;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** Server-only (service role). Never selectable by the portal. */
export interface WorkspaceSecretsRow {
  workspace_id: UUID;
  g8_api_key: string | null;
  g8_webhook_id: string | null;
  g8_webhook_secret: string | null;
  slack_bot_token: string | null;
  extra: JsonObject;
  updated_at: ISODateTime;
}

export interface WorkspaceMemberRow {
  workspace_id: UUID;
  user_id: UUID;
  role: MemberRole;
  created_at: ISODateTime;
}

/** Server-only. The only humans agents may message/call. */
export interface ContactAllowlistRow {
  id: UUID;
  workspace_id: UUID;
  label: string;
  email: string | null;
  phone: string | null;        // E.164
  linkedin_url: string | null;
  g8_contact_id: string | null;
  created_at: ISODateTime;
}

export interface AgentRow {
  id: UUID;
  workspace_id: UUID;
  role: AgentRole;
  name: string;                // Slack persona name (unique per workspace)
  title: string;
  job: string;
  reports_to: UUID | null;     // null = reports to the founder
  emoji: string;
  color: string;               // hex
  avatar_url: string | null;
  sort_order: number;
  status: AgentStatus;
  pause_reason: AgentPauseReason | null;
  current_task_id: UUID | null;
  budget_daily_credits: number;
  spent_today_credits: number;
  spend_day: ISODate;
  budget_warn_pct: number;
  model: string | null;
  instructions: string | null;
  tools: string[];
  last_active_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface TaskRow {
  id: UUID;
  workspace_id: UUID;
  number: number;              // per-workspace, render as T-12
  kind: TaskKind;
  title: string;
  detail: string | null;
  assignee_agent_id: UUID | null;
  created_by_agent_id: UUID | null; // null = founder/system
  parent_task_id: UUID | null;
  root_task_id: UUID | null;   // set by trigger
  lead_id: UUID | null;
  sequence_id: UUID | null;
  priority: TaskPriority;
  status: TaskStatus;
  blocked_on: TaskBlockedOn | null;
  blocked_reason: string | null;
  blocked_by_task_id: UUID | null;
  approval_id: UUID | null;
  result_summary: string | null;
  input: JsonObject;
  output: JsonObject;
  credits_used: number;
  slack_channel: SlackChannelId | null;
  slack_thread_ts: SlackTs | null;
  locked_by_run_id: UUID | null;
  locked_at: ISODateTime | null;
  attempt_count: number;
  due_at: ISODateTime | null;
  started_at: ISODateTime | null;
  finished_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AgentRunRow {
  id: UUID;
  workspace_id: UUID;
  agent_id: UUID;
  task_id: UUID | null;
  trigger: RunTrigger;
  trigger_ref: string | null;
  status: RunStatus;
  summary: string | null;
  error: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  tool_call_count: number;
  credits_used: number;
  started_at: ISODateTime;
  finished_at: ISODateTime | null;
}

/** Server-only (args may hold PII). */
export interface RunStepRow {
  id: number;
  run_id: UUID;
  workspace_id: UUID;
  seq: number;
  kind: RunStepKind;
  name: string;
  args: Json | null;
  result: Json | null;
  ok: boolean;
  error: string | null;
  credits_used: number;
  duration_ms: number | null;
  created_at: ISODateTime;
}

export interface ReportRow {
  id: UUID;
  workspace_id: UUID;
  from_agent_id: UUID;
  to_agent_id: UUID | null;    // null = to the founder
  task_id: UUID | null;
  run_id: UUID | null;
  kind: ReportKind;
  title: string;
  body: string | null;
  data: JsonObject;
  slack_channel: SlackChannelId | null;
  slack_ts: SlackTs | null;
  slack_thread_ts: SlackTs | null;
  created_at: ISODateTime;
}

export interface ApprovalRow {
  id: UUID;
  workspace_id: UUID;
  requested_by_agent_id: UUID;
  task_id: UUID | null;
  sequence_id: UUID | null;
  lead_id: UUID | null;
  kind: ApprovalKind;
  title: string;
  summary: string | null;
  payload: ApprovalPayload;
  status: ApprovalStatus;
  decision_note: string | null;
  decided_by_slack_user: string | null;
  decided_at: ISODateTime | null;
  expires_at: ISODateTime | null;
  slack_channel: SlackChannelId | null;
  slack_ts: SlackTs | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SequenceRow {
  id: UUID;
  workspace_id: UUID;
  created_by_agent_id: UUID | null;
  task_id: UUID | null;
  approval_id: UUID | null;
  g8_sequence_id: string | null;
  g8_list_id: string | null;
  g8_schedule_id: string | null;
  name: string;
  status: SequenceStatus;
  channels: Channel[];
  steps: SequenceStep[];
  lead_count: number;
  enrolled_count: number;
  stats: SequenceStats;
  launched_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** Portal-safe: NO email/phone/linkedin here (see LeadContactRow). */
export interface LeadRow {
  id: UUID;
  workspace_id: UUID;
  g8_contact_id: string | null;
  g8_company_id: string | null;
  g8_list_id: string | null;
  g8_deal_id: string | null;
  g8_meeting_id: string | null;
  sequence_id: UUID | null;
  owner_agent_id: UUID | null;
  full_name: string;
  job_title: string | null;
  company_name: string | null;
  company_domain: string | null;
  location: string | null;
  source: LeadSource;
  stage: LeadStage;
  stage_changed_at: ISODateTime;
  disqualify_reason: DisqualifyReason | null;
  fit_score: number | null;    // 0-100
  signals: LeadSignal[];
  why_now: string | null;
  research: JsonObject;
  sequence_state: LeadSequenceState;
  last_channel: Channel | null;
  last_reply_intent: ReplyIntent | null;
  last_activity_at: ISODateTime | null;
  meeting_at: ISODateTime | null;
  deal_amount: string | null;  // numeric -> string
  deal_stage: string | null;   // graph8 stage_name
  is_test_contact: boolean;
  do_not_contact: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** Server-only PII. */
export interface LeadContactRow {
  lead_id: UUID;
  workspace_id: UUID;
  email: string | null;
  email_verified: boolean | null;
  phone: string | null;
  linkedin_url: string | null;
  enriched_at: ISODateTime | null;
  enrichment: JsonObject;
  updated_at: ISODateTime;
}

export interface LeadEventRow {
  id: number;
  workspace_id: UUID;
  lead_id: UUID;
  agent_id: UUID | null;
  task_id: UUID | null;
  inbound_event_id: UUID | null;
  type: LeadEventType;
  channel: EventChannel;
  direction: EventDirection;
  summary: string;             // must not contain email/phone
  data: JsonObject;
  occurred_at: ISODateTime;
  created_at: ISODateTime;
}

/** Server-only. Idempotency gate for webhooks / Slack actions / cron. */
export interface InboundEventRow {
  id: UUID;
  workspace_id: UUID | null;
  source: InboundSource;
  event_type: string;          // e.g. 'engagement.email_replied' | 'block_actions'
  dedupe_key: string;          // unique
  delivery_id: string | null;
  signature_valid: boolean | null;
  payload: JsonObject;
  status: InboundStatus;
  error: string | null;
  attempts: number;
  run_id: UUID | null;
  received_at: ISODateTime;
  processed_at: ISODateTime | null;
}

export interface CreditEventRow {
  id: number;
  workspace_id: UUID;
  agent_id: UUID;
  task_id: UUID | null;
  run_id: UUID | null;
  lead_id: UUID | null;
  source: CreditSource;
  action: CreditAction;
  credits: number;             // budget units; negative = refund/adjustment
  input_tokens: number | null; // llm rows only
  output_tokens: number | null;
  g8_request_id: string | null;
  note: string | null;
  created_at: ISODateTime;
}

// ---------------------------------------------------------------------------
// Views (portal reads these; security_invoker so RLS applies)
// ---------------------------------------------------------------------------
export interface PortalAgentRow {
  id: UUID;
  workspace_id: UUID;
  role: AgentRole;
  name: string;
  title: string;
  job: string;
  reports_to: UUID | null;
  emoji: string;
  color: string;
  avatar_url: string | null;
  sort_order: number;
  status: AgentStatus;
  pause_reason: AgentPauseReason | null;
  budget_daily_credits: number;
  spent_today_credits: number; // already zeroed if spend_day is stale
  budget_warn_pct: number;
  last_active_at: ISODateTime | null;
  current_task_id: UUID | null;
  current_task_title: string | null;
  current_task_status: TaskStatus | null;
  current_task_thread_ts: SlackTs | null;
  tasks_done: number;
  tasks_open: number;
}

export interface PortalPipelineRow {
  workspace_id: UUID;
  stage: LeadStage;
  ord: number;
  lead_count: number;
  deal_amount: string; // numeric -> string
}

export interface PortalNeedsYouRow {
  item_type: 'approval' | 'task';
  id: UUID;
  workspace_id: UUID;
  title: string;
  detail: string;
  agent_id: UUID | null;
  slack_channel: SlackChannelId | null;
  slack_ts: SlackTs | null;
  created_at: ISODateTime;
}

export interface PortalTodayRow {
  workspace_id: UUID;
  today: ISODate;
  credits_spent_today: number;
  budget_daily_credits: number;
  agents_working: number;
  agents_waiting_on_you: number;
  agents_paused: number;
  approvals_pending: number;
  tasks_open: number;
  tasks_done_today: number;
  leads_found_today: number;
  leads_contacted_today: number;
  replies_today: number;
  meetings_booked_today: number;
  deals_created_today: number;
  deals_open: number;
  deals_value: string; // numeric -> string
}

// ---------------------------------------------------------------------------
// Graph8 webhook envelope (what lands in inbound_events.payload for source='graph8')
// ---------------------------------------------------------------------------
export interface G8WebhookEnvelope<T = JsonObject> {
  event: string;               // 'engagement.email_replied'
  timestamp: string;           // ISO
  org_id: string;
  data: T;
}
export interface G8EngagementData {
  contact_id: string;
  email?: string;
  sequence_id?: string;
  campaign_id?: string;
  reply_subject?: string;
  replied_at?: string;
  is_positive?: boolean;
  [k: string]: Json | undefined;
}

// ---------------------------------------------------------------------------
// Helpers for the store layer
// ---------------------------------------------------------------------------
type GeneratedKeys = 'id' | 'created_at' | 'updated_at';
/** Columns you must supply on insert (everything else has a DB default or is nullable). */
export type Insert<Row, Required extends keyof Row = never> =
  Partial<Omit<Row, GeneratedKeys>> & Pick<Row, Required>;
export type Update<Row> = Partial<Omit<Row, 'id' | 'workspace_id' | 'created_at'>>;

export type WorkspaceInsert = Insert<WorkspaceRow, 'slug' | 'name'>;
export type AgentInsert = Insert<AgentRow, 'workspace_id' | 'role' | 'name' | 'title' | 'job'>;
export type TaskInsert = Insert<TaskRow, 'workspace_id' | 'title'>;
export type AgentRunInsert = Insert<AgentRunRow, 'workspace_id' | 'agent_id' | 'trigger'>;
export type RunStepInsert = Insert<RunStepRow, 'run_id' | 'workspace_id' | 'seq' | 'name'>;
export type ReportInsert = Insert<ReportRow, 'workspace_id' | 'from_agent_id' | 'title'>;
export type ApprovalInsert = Insert<ApprovalRow, 'workspace_id' | 'requested_by_agent_id' | 'kind' | 'title'>;
export type SequenceInsert = Insert<SequenceRow, 'workspace_id' | 'name'>;
export type LeadInsert = Insert<LeadRow, 'workspace_id' | 'full_name'>;
export type LeadContactInsert = Insert<LeadContactRow, 'lead_id' | 'workspace_id'>;
export type LeadEventInsert = Insert<LeadEventRow, 'workspace_id' | 'lead_id' | 'type' | 'summary'>;
export type InboundEventInsert = Insert<InboundEventRow, 'source' | 'event_type' | 'dedupe_key' | 'payload'>;
export type CreditEventInsert = Insert<CreditEventRow, 'workspace_id' | 'agent_id' | 'action' | 'credits'>;

/** Table name -> row type map (handy for a typed Supabase client). */
export interface Tables {
  workspaces: WorkspaceRow;
  workspace_secrets: WorkspaceSecretsRow;
  workspace_members: WorkspaceMemberRow;
  contact_allowlist: ContactAllowlistRow;
  agents: AgentRow;
  tasks: TaskRow;
  agent_runs: AgentRunRow;
  run_steps: RunStepRow;
  reports: ReportRow;
  approvals: ApprovalRow;
  sequences: SequenceRow;
  leads: LeadRow;
  lead_contacts: LeadContactRow;
  lead_events: LeadEventRow;
  inbound_events: InboundEventRow;
  credit_events: CreditEventRow;
}
export interface Views {
  portal_agents: PortalAgentRow;
  portal_pipeline: PortalPipelineRow;
  portal_needs_you: PortalNeedsYouRow;
  portal_today: PortalTodayRow;
}
export type TableName = keyof Tables;

/** Tables the portal subscribes to via Supabase Realtime (see publication in SQL). */
export const REALTIME_TABLES = [
  'workspaces', 'agents', 'tasks', 'reports', 'approvals', 'sequences', 'leads', 'lead_events',
] as const satisfies readonly TableName[];

/** Fixed demo ids from supabase/seed.sql. */
export const DEMO_WORKSPACE_ID = 'a0000000-0000-4000-8000-000000000001';
export const DEMO_AGENT_IDS = {
  head_of_sales: 'a1000000-0000-4000-8000-000000000001', // Ayesha
  scout: 'a2000000-0000-4000-8000-000000000002',         // Bilal
  researcher: 'a3000000-0000-4000-8000-000000000003',    // Hira
  sdr: 'a4000000-0000-4000-8000-000000000004',           // Usman
  closer: 'a5000000-0000-4000-8000-000000000005',        // Zara
} as const satisfies Record<AgentRole, UUID>;
