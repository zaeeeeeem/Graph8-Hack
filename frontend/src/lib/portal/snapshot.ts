// The portal's in-memory snapshot: one typed slice per query in docs/portal/01-data-access.md §2.
// store.tsx fills it from Supabase and keeps it fresh (realtime + 15 s poll).
import type {
  AgentRunRow,
  ApprovalRow,
  CreditEventRow,
  LeadEventRow,
  LeadRow,
  PortalActivityRow,
  PortalAgentRow,
  PortalPipelineRow,
  PortalNeedsYouRow,
  PortalTodayRow,
  ReportRow,
  SequenceRow,
  TaskRow,
  WorkspaceRow,
} from "./types";

/** Columns selected by `qWorkspace()`. */
export type WorkspaceView = Pick<
  WorkspaceRow,
  | "id"
  | "slug"
  | "name"
  | "company_domain"
  | "timezone"
  | "status"
  | "founder_name"
  | "slack_channel_team"
  | "slack_channel_hq"
  | "budget_daily_credits"
  | "is_demo"
  | "sales_brain"
  | "standup_hour"
>;

/** Columns selected by `qTasks()` (docs/portal/01-data-access.md §2). */
export type TaskLite = Pick<
  TaskRow,
  | "id"
  | "number"
  | "kind"
  | "title"
  | "detail"
  | "status"
  | "blocked_on"
  | "blocked_reason"
  | "assignee_agent_id"
  | "created_by_agent_id"
  | "parent_task_id"
  | "root_task_id"
  | "lead_id"
  | "sequence_id"
  | "approval_id"
  | "result_summary"
  | "credits_used"
  | "slack_channel"
  | "slack_thread_ts"
  | "created_at"
  | "started_at"
  | "finished_at"
>;

/** Columns selected by `qApprovals()`. */
export type ApprovalLite = Pick<
  ApprovalRow,
  | "id"
  | "task_id"
  | "kind"
  | "title"
  | "summary"
  | "payload"
  | "status"
  | "requested_by_agent_id"
  | "decision_note"
  | "decided_at"
  | "slack_channel"
  | "slack_ts"
  | "created_at"
>;

/** Columns selected by `qLeads()` (no PII columns exist on leads). */
export type LeadLite = Pick<
  LeadRow,
  | "id"
  | "g8_contact_id"
  | "g8_company_id"
  | "g8_deal_id"
  | "g8_meeting_id"
  | "sequence_id"
  | "owner_agent_id"
  | "full_name"
  | "job_title"
  | "company_name"
  | "company_domain"
  | "location"
  | "stage"
  | "stage_changed_at"
  | "disqualify_reason"
  | "fit_score"
  | "signals"
  | "why_now"
  | "sequence_state"
  | "last_channel"
  | "last_reply_intent"
  | "last_activity_at"
  | "meeting_at"
  | "deal_amount"
  | "deal_stage"
  | "is_test_contact"
  | "do_not_contact"
  | "created_at"
>;

/** Columns selected by `qLeadEvents()`. */
export type LeadEventLite = Pick<
  LeadEventRow,
  "id" | "lead_id" | "agent_id" | "task_id" | "type" | "channel" | "direction" | "summary" | "data" | "occurred_at"
>;

/** Subset of `qSequences()`. */
export type SequenceLite = Pick<
  SequenceRow,
  "id" | "g8_sequence_id" | "name" | "status" | "channels" | "steps" | "lead_count" | "enrolled_count" | "stats"
>;

/** Columns of agent_runs the portal reads (qAgentRuns + agent_id: the workspace's runs are loaded in one list). */
export type RunLite = Pick<
  AgentRunRow,
  | "id"
  | "agent_id"
  | "task_id"
  | "trigger"
  | "trigger_ref"
  | "status"
  | "summary"
  | "error"
  | "model"
  | "input_tokens"
  | "output_tokens"
  | "tool_call_count"
  | "credits_used"
  | "started_at"
  | "finished_at"
>;

/** Columns of credit_events the portal reads (qCreditEvents + agent_id, as above). */
export type CreditLite = Pick<
  CreditEventRow,
  "id" | "agent_id" | "task_id" | "run_id" | "lead_id" | "source" | "action" | "credits" | "note" | "created_at"
>;

/**
 * Running totals for today, one point per 10 minutes, derived client-side from leads, lead_events
 * and credit_events (selectors.buildActivity). The last point is always replaced by portal_today's
 * live totals (selectors.activitySeries).
 */
export interface ActivityPoint {
  t: string; // ISO bucket start
  found: number;
  replies: number;
  meetings: number;
  deals_value: number;
  credits: number;
}

export interface PortalSnapshot {
  workspace: WorkspaceView;
  agents: PortalAgentRow[]; // portal_agents
  today: PortalTodayRow; // portal_today
  needsYou: PortalNeedsYouRow[]; // portal_needs_you
  approvals: ApprovalLite[]; // approvals
  tasks: TaskLite[]; // tasks
  leads: LeadLite[]; // leads
  leadEvents: LeadEventLite[]; // lead_events (all leads; the drawer filters by lead_id)
  pipeline: PortalPipelineRow[]; // portal_pipeline (zero-filled, funnel order)
  sequences: SequenceLite[]; // sequences
  reports: ReportRow[]; // reports (newest first)
  runs: RunLite[]; // agent_runs (newest first; the agent page filters by agent_id)
  creditEvents: CreditLite[]; // credit_events (newest first)
  steps: PortalActivityRow[]; // portal_activity (run_steps, newest first)
  activity: ActivityPoint[]; // today's running totals, derived client-side (selectors.buildActivity)
}
