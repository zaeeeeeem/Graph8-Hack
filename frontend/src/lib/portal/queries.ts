// Every portal read, one function per snapshot slice (docs/portal/01-data-access.md §2).
// Always filtered by workspace_id; RLS additionally limits rows to workspaces this user may see.
// Never query workspace_secrets, lead_contacts, contact_allowlist, run_steps (use portal_activity) or inbound_events.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalLite,
  CreditLite,
  LeadEventLite,
  LeadLite,
  PortalSnapshot,
  RunLite,
  SequenceLite,
  TaskLite,
  WorkspaceView,
} from "./snapshot";
import type { PortalActivityRow, PortalAgentRow, PortalNeedsYouRow, PortalPipelineRow, PortalTodayRow, ReportRow } from "./types";

export type SliceKey = Exclude<keyof PortalSnapshot, "activity">;

const WORKSPACE_COLS =
  "id,slug,name,company_domain,timezone,status,founder_name,slack_channel_team,slack_channel_hq,budget_daily_credits,is_demo,sales_brain,standup_hour";
const TASK_COLS =
  "id,number,kind,title,detail,assignee_agent_id,created_by_agent_id,parent_task_id,root_task_id,lead_id,sequence_id,priority,status,blocked_on,blocked_reason,blocked_by_task_id,approval_id,result_summary,credits_used,slack_channel,slack_thread_ts,started_at,finished_at,created_at,updated_at";
const APPROVAL_COLS =
  "id,requested_by_agent_id,task_id,sequence_id,lead_id,kind,title,summary,payload,status,decision_note,decided_at,expires_at,slack_channel,slack_ts,created_at";
const LEAD_COLS =
  "id,g8_contact_id,g8_company_id,g8_deal_id,g8_meeting_id,sequence_id,owner_agent_id,full_name,job_title,company_name,company_domain,location,stage,stage_changed_at,disqualify_reason,fit_score,signals,why_now,sequence_state,last_channel,last_reply_intent,last_activity_at,meeting_at,deal_amount,deal_stage,is_test_contact,do_not_contact,created_at";
const LEAD_EVENT_COLS = "id,lead_id,agent_id,task_id,type,channel,direction,summary,data,occurred_at";
const SEQUENCE_COLS = "id,g8_sequence_id,name,status,channels,steps,lead_count,enrolled_count,stats,created_at";
const RUN_COLS =
  "id,agent_id,task_id,trigger,trigger_ref,status,summary,error,model,input_tokens,output_tokens,tool_call_count,credits_used,started_at,finished_at";
const CREDIT_COLS = "id,agent_id,task_id,run_id,lead_id,source,action,credits,note,created_at";
const ACTIVITY_COLS =
  "id,workspace_id,run_id,agent_id,agent_name,agent_role,agent_emoji,agent_color,task_id,task_number,task_title,seq,kind,name,summary,ok,credits_used,duration_ms,created_at";

/** Throws the PostgREST error so the store can tell "failed" from "empty". */
async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

export interface QueryCtx {
  sb: SupabaseClient;
  ws: string;
  /** Start of "today" in the workspace timezone (ISO), for the credit ledger. */
  dayStart: string;
}

/** One fetcher per slice. `today` falls back to zeros when the view has no row yet. */
export const FETCH: { [K in SliceKey]: (c: QueryCtx) => Promise<PortalSnapshot[K]> } = {
  workspace: ({ sb, ws }) => rows<WorkspaceView>(sb.from("workspaces").select(WORKSPACE_COLS).eq("id", ws).single()),
  agents: async ({ sb, ws }) =>
    (await rows<PortalAgentRow[]>(sb.from("portal_agents").select("*").eq("workspace_id", ws).order("sort_order"))).map(withPortrait),
  today: async ({ sb, ws }) => (await rows<PortalTodayRow | null>(sb.from("portal_today").select("*").eq("workspace_id", ws).maybeSingle())) ?? zeroToday(ws),
  needsYou: ({ sb, ws }) =>
    rows<PortalNeedsYouRow[]>(sb.from("portal_needs_you").select("*").eq("workspace_id", ws).order("created_at", { ascending: false })),
  approvals: ({ sb, ws }) =>
    rows<ApprovalLite[]>(sb.from("approvals").select(APPROVAL_COLS).eq("workspace_id", ws).order("created_at", { ascending: false }).limit(200)),
  tasks: ({ sb, ws }) =>
    rows<TaskLite[]>(sb.from("tasks").select(TASK_COLS).eq("workspace_id", ws).order("created_at", { ascending: false }).limit(500)),
  leads: ({ sb, ws }) =>
    rows<LeadLite[]>(
      sb.from("leads").select(LEAD_COLS).eq("workspace_id", ws).order("last_activity_at", { ascending: false, nullsFirst: false }).limit(1000),
    ),
  leadEvents: ({ sb, ws }) =>
    rows<LeadEventLite[]>(sb.from("lead_events").select(LEAD_EVENT_COLS).eq("workspace_id", ws).order("occurred_at", { ascending: false }).limit(2000)),
  pipeline: ({ sb, ws }) => rows<PortalPipelineRow[]>(sb.from("portal_pipeline").select("*").eq("workspace_id", ws).order("ord")),
  sequences: ({ sb, ws }) =>
    rows<SequenceLite[]>(sb.from("sequences").select(SEQUENCE_COLS).eq("workspace_id", ws).order("created_at", { ascending: false })),
  reports: ({ sb, ws }) => rows<ReportRow[]>(sb.from("reports").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(200)),
  runs: ({ sb, ws }) =>
    rows<RunLite[]>(sb.from("agent_runs").select(RUN_COLS).eq("workspace_id", ws).order("started_at", { ascending: false }).limit(500)),
  creditEvents: ({ sb, ws, dayStart }) =>
    rows<CreditLite[]>(
      sb.from("credit_events").select(CREDIT_COLS).eq("workspace_id", ws).gte("created_at", dayStart).order("created_at", { ascending: false }).limit(2000),
    ),
  steps: ({ sb, ws }) =>
    rows<PortalActivityRow[]>(
      sb.from("portal_activity").select(ACTIVITY_COLS).eq("workspace_id", ws).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(300),
    ),
};

// Portraits shipped with the app (public/avatars) for the standard team, used when the row has none.
const PORTRAITS = new Set(["ayesha", "bilal", "hira", "usman", "zara"]);
function withPortrait(a: PortalAgentRow): PortalAgentRow {
  if (a.avatar_url) return a;
  const key = a.name.trim().toLowerCase();
  return PORTRAITS.has(key) ? { ...a, avatar_url: `/avatars/${key}.png` } : a;
}

export const SLICES = Object.keys(FETCH) as SliceKey[];

/**
 * Realtime table → slices to refetch (01-data-access.md §4, extended to this app's slices).
 * agent_runs and credit_events are not published: they refetch when agents / run_steps change
 * (a run writes steps; spend moves agents.spent_today_credits) and on the 15 s poll.
 */
export const TABLE_TO_SLICES: Record<string, SliceKey[]> = {
  workspaces: ["workspace", "today"],
  agents: ["agents", "today", "runs", "creditEvents"],
  tasks: ["tasks", "agents", "needsYou", "today", "runs"],
  reports: ["reports"],
  approvals: ["approvals", "needsYou", "today"],
  sequences: ["sequences"],
  leads: ["leads", "pipeline", "today"],
  lead_events: ["leadEvents", "leads", "today"],
  run_steps: ["steps", "runs", "creditEvents"],
};

/** Workspaces this signed-in user belongs to (own_membership policy), oldest first. */
export async function myWorkspaceIds(sb: SupabaseClient): Promise<string[]> {
  const data = await rows<{ workspace_id: string }[]>(sb.from("workspace_members").select("workspace_id").order("created_at"));
  return data.map((m) => m.workspace_id);
}

export function zeroToday(ws: string): PortalTodayRow {
  return {
    workspace_id: ws,
    today: new Date().toISOString().slice(0, 10),
    credits_spent_today: 0,
    budget_daily_credits: 0,
    agents_working: 0,
    agents_waiting_on_you: 0,
    agents_paused: 0,
    approvals_pending: 0,
    tasks_open: 0,
    tasks_done_today: 0,
    leads_found_today: 0,
    leads_contacted_today: 0,
    replies_today: 0,
    meetings_booked_today: 0,
    deals_created_today: 0,
    deals_open: 0,
    deals_value: "0",
  };
}
