// Mock data for the UI-first build. Mirrors supabase/seed.sql (the "fake day") row-for-row,
// shaped exactly like the portal queries in docs/portal/01-data-access.md §2, so swapping to
// Supabase later replaces this file + store.tsx and nothing else.
import type {
  AgentRunRow,
  ApprovalRow,
  CreditEventRow,
  LeadEventRow,
  LeadRow,
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

/**
 * Running totals for today, one point per 10 minutes. Backend source (not a view yet):
 * lead_events (found / reply_received / meeting_booked / deal_created) + credit_events,
 * bucketed by occurred_at/created_at in the workspace timezone. The last point is always
 * replaced by portal_today's live totals (selectors.activitySeries).
 */
/** Columns selected by `qAgentRuns(agentId)` (+ agent_id: the mock holds every agent's runs in one list). */
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

/** Columns selected by `qCreditEvents(agentId)` (+ agent_id, as above). */
export type CreditLite = Pick<
  CreditEventRow,
  "id" | "agent_id" | "task_id" | "run_id" | "lead_id" | "source" | "action" | "credits" | "note" | "created_at"
>;

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
  activity: ActivityPoint[]; // today's running totals (see ActivityPoint)
}

export const WS = "a0000000-0000-4000-8000-000000000001";
const HQ = "C0C49DG285V";
const TEAM = "C0C4KMJMKK7";

export const AGENT_ID = {
  ayesha: "a1000000-0000-4000-8000-000000000001",
  bilal: "a2000000-0000-4000-8000-000000000002",
  hira: "a3000000-0000-4000-8000-000000000003",
  usman: "a4000000-0000-4000-8000-000000000004",
  zara: "a5000000-0000-4000-8000-000000000005",
} as const;

export const taskUuid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const WORKSPACE: WorkspaceView = {
  id: WS,
  slug: "8x-social",
  name: "8x.social",
  company_domain: "8x.social",
  timezone: "Asia/Karachi",
  status: "active",
  founder_name: "Zaeem",
  slack_channel_team: TEAM,
  slack_channel_hq: HQ,
  budget_daily_credits: 500000,
  is_demo: true,
  standup_hour: 9,
  sales_brain: {
    offer: "8x.social: AI-run social + outbound growth for B2B startups",
    icp: "Series A-B fintech, 20-200 employees, US/UK",
  },
};

export function seedSnapshot(now: number): PortalSnapshot {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();

  const A = AGENT_ID;
  const SEQ = "50000000-0000-4000-8000-000000000001";
  const root = taskUuid(1);
  const tasks: TaskLite[] = [
    t(1, "onboard", "Hire sales team for 8x.social", "done", A.ayesha, HQ, {
      detail: "Founder ran /hire-sales 8x.social. Read graph8 context, set plan, staff the team.",
      result_summary:
        "Read 23 context docs from graph8. ICP: Series A-B fintech CFOs (US/UK). Team staffed: Bilal, Hira, Usman, Zara. Budget 100,000 credits/day per agent.",
      created_at: ago(120), started_at: ago(120), finished_at: ago(115),
    }),
    t(2, "find_prospects", "Find 15 fintech CFOs with buying signals", "done", A.bilal, TEAM, {
      detail: "ICP: Series A-B fintech, 20-200 employees, US/UK. Rank by hiring + funding signals. Free search only.",
      result_summary: "12 accounts found, 8 with strong signals (5 hiring finance roles, 3 raised in last 90 days). Saved to graph8 list.",
      created_by_agent_id: A.ayesha, parent_task_id: root, created_at: ago(110), started_at: ago(109), finished_at: ago(95),
    }),
    t(3, "research_leads", "Enrich 7 leads and write why-now", "done", A.hira, TEAM, {
      detail: "Enrich only the 7 leads with a signal or a clear hook (cap 40 credits). Two-line hook each.",
      result_summary: "7 enriched (21 credits). Why-now written for each; 2 hooks reference fresh funding, 5 reference finance hiring.",
      created_by_agent_id: A.ayesha, parent_task_id: root, created_at: ago(94), started_at: ago(93), finished_at: ago(70),
    }),
    t(4, "build_sequence", "Draft 7-touch multi-channel sequence", "done", A.usman, TEAM, {
      detail: "Email → LinkedIn connect (refs email) → LinkedIn msg → email 2 → call → LinkedIn msg 2 → breakup. finish_on_reply. Demo schedule.",
      result_summary: "Sequence drafted in graph8 (seq_demo_fintech_cfo_01) with 7 steps across email, LinkedIn and phone. Copy generated.",
      created_by_agent_id: A.ayesha, parent_task_id: root, sequence_id: SEQ, created_at: ago(69), started_at: ago(68), finished_at: ago(50),
    }),
    t(5, "launch_sequence", "Launch sequence to 8 leads", "done", A.ayesha, HQ, {
      detail: "Ask founder to approve; on approve enroll allowlisted test contacts only.",
      result_summary: "Approved by founder. Sequence live; 1 allowlisted test contact enrolled, 7 real prospects held (safety allowlist).",
      created_by_agent_id: A.ayesha, parent_task_id: root, sequence_id: SEQ, approval_id: "d0000000-0000-4000-8000-000000000001",
      created_at: ago(49), started_at: ago(48), finished_at: ago(35),
    }),
    t(6, "handle_reply", "Sara Malik (Northwind) replied — interested", "in_progress", A.zara, TEAM, {
      detail:
        "Email reply on step 1. Stop all channels for Northwind, classify; if interested, auto-send 3 slots (allowlisted contact) and wait for her pick.",
      result_summary:
        "Classified INTERESTED. Stopped all channels for Northwind. Sent 3 discovery-call slots on email (auto-send: interested + allowlisted). Waiting for her pick.",
      created_by_agent_id: A.ayesha, parent_task_id: root, sequence_id: SEQ, lead_id: "b0000000-0000-4000-8000-000000000001",
      created_at: ago(6), started_at: ago(5),
    }),
    t(7, "custom", "Connect LinkedIn so steps 2, 3 and 6 can send", "blocked", A.ayesha, HQ, {
      detail:
        "LinkedIn sender not connected in graph8. Steps 2, 3, 6 of the sequence are queued. Ask founder to connect; email + call steps continue meanwhile.",
      blocked_on: "approval", blocked_reason: "Connect LinkedIn in graph8", approval_id: "d0000000-0000-4000-8000-000000000002",
      created_by_agent_id: A.ayesha, parent_task_id: root, sequence_id: SEQ, created_at: ago(3),
    }),
    t(8, "standup", "Morning standup", "done", A.ayesha, HQ, {
      detail: "Yesterday / today / blockers / pipeline / credits per agent.",
      result_summary: "Posted standup to #sales-hq.",
      created_at: ago(20), started_at: ago(20), finished_at: ago(19),
    }),
    t(9, "answer_question", "Founder asked: how is pipeline?", "done", A.ayesha, HQ, {
      detail: "DM from founder.",
      result_summary: "Answered with live graph8 numbers: 8 in sequence, 1 replied, 1 meeting, 1 deal ($12k).",
      created_at: ago(12), started_at: ago(12), finished_at: ago(11),
    }),
    t(10, "find_prospects", "Find batch 2: UK fintech CFOs", "todo", A.bilal, null, {
      detail: "Same ICP, UK only, 10 accounts.",
      created_by_agent_id: A.ayesha, created_at: ago(2),
    }),
  ];

  const inMin = (min: number) => new Date(now + min * 60_000).toISOString();
  const leads: LeadLite[] = [
    lead(1, "Sara Malik", "VP Finance", "Northwind Fintech", "northwind.example.com", "New York, US", "replied", 92, A.zara, {
      sequence_id: SEQ,
      signals: [
        { type: "hiring", text: "Hiring 2 finance roles (Senior Accountant, FP&A Lead)", source: "https://northwind.example.com/careers" },
        { type: "funding", text: "Raised $18M Series A (Aug 2026)", source: "https://news.example.com/northwind-series-a" },
      ],
      why_now: "Just raised Series A and hiring two finance roles — month-end close is about to get painful. Reference the FP&A posting.",
      sequence_state: "stopped", last_channel: "email", last_reply_intent: "interested", last_activity_at: ago(6), is_test_contact: true,
    }),
    lead(2, "Ahmed Raza", "CFO", "Contoso Pay", "contosopay.example.com", "London, UK", "contacted", 85, A.usman, {
      sequence_id: SEQ,
      signals: [{ type: "hiring", text: "Hiring Head of Revenue Ops", source: "https://contosopay.example.com/jobs" }],
      why_now: "Hiring a Head of RevOps means outbound is on the roadmap this quarter — offer to be the interim engine.",
      sequence_state: "enrolled", last_channel: "email", last_activity_at: ago(30),
    }),
    lead(3, "Fatima Noor", "Head of Finance", "Fabrikam Capital", "fabrikam.example.com", "Austin, US", "contacted", 78, A.usman, {
      sequence_id: SEQ,
      signals: [{ type: "intent", text: "Visited pricing page twice this week", source: "graph8 visitors" }],
      why_now: "Two pricing-page visits this week — she is already evaluating. Lead with a concrete number, not a pitch.",
      sequence_state: "enrolled", last_channel: "linkedin", last_activity_at: ago(25),
    }),
    lead(4, "Omar Sheikh", "CFO", "Tailspin Ledger", "tailspin.example.com", "San Francisco, US", "meeting", 88, A.zara, {
      sequence_id: SEQ, g8_meeting_id: "mt_demo_004",
      signals: [{ type: "funding", text: "Raised $9M seed extension", source: "https://news.example.com/tailspin" }],
      why_now: "Fresh seed extension; board will ask for pipeline numbers next quarter. Offer a 15-minute plan.",
      sequence_state: "stopped", last_channel: "linkedin", last_reply_intent: "interested", last_activity_at: ago(45), meeting_at: inMin(2 * 24 * 60),
    }),
    lead(5, "Zainab Qureshi", "CFO", "Wingtip Finance", "wingtip.example.com", "Manchester, UK", "deal", 90, A.zara, {
      sequence_id: SEQ, g8_deal_id: "deal_demo_005", g8_meeting_id: "mt_demo_005",
      signals: [{ type: "hiring", text: "Hiring SDR + AE", source: "https://wingtip.example.com/careers" }],
      why_now: "Hiring a first SDR and AE — pitch \"start the pipeline before they join\".",
      sequence_state: "stopped", last_channel: "phone", last_reply_intent: "interested", last_activity_at: ago(60), meeting_at: ago(24 * 60),
      deal_amount: "12000.00", deal_stage: "Discovery",
    }),
    lead(6, "Hamza Iqbal", "VP Finance", "Litware Payments", "litware.example.com", "Chicago, US", "queued", 74, A.hira, {
      sequence_id: SEQ,
      why_now: "Payments company scaling ops; no public signal yet — lead with the Wingtip case study.",
      sequence_state: "queued", last_activity_at: ago(70),
    }),
    lead(7, "Mariam Siddiqui", "Head of Growth", "Proseware Lending", "proseware.example.com", "Boston, US", "prospect", 61, A.bilal, {
      last_activity_at: ago(95),
    }),
    lead(8, "Ali Hassan", "Controller", "Adventure Works Capital", "adventureworks.example.com", "Denver, US", "disqualified", 55, A.zara, {
      sequence_id: SEQ, disqualify_reason: "wrong_person",
      why_now: "Controller, not the buyer — ask for a referral to the CFO.",
      sequence_state: "stopped", last_channel: "email", last_reply_intent: "wrong_person", last_activity_at: ago(28),
    }),
  ];

  // lead_events, oldest → newest per lead, ids ascending like the identity column (seed.sql).
  const L = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const T = taskUuid;
  const ev: [number, string | null, string | null, LeadEventLite["type"], LeadEventLite["channel"], LeadEventLite["direction"], string, number][] = [
    [1, A.bilal, T(2), "found", "system", "internal", "Found by Scout: VP Finance at Northwind Fintech (2 signals)", 98],
    [1, A.hira, T(3), "researched", "system", "internal", "Enriched (3 credits). Why-now: Series A + hiring FP&A", 80],
    [1, A.usman, T(5), "enrolled", "system", "internal", 'Enrolled in "Fintech CFOs — 7-touch" (allowlisted test contact)', 35],
    [1, null, null, "email_sent", "email", "outbound", 'Email 1 sent: "Quick question about finance hiring at Northwind"', 33],
    [1, null, null, "email_opened", "email", "inbound", "Email 1 opened", 20],
    [1, null, null, "reply_received", "email", "inbound", 'Replied: "Interesting — can you do Tuesday afternoon?"', 6],
    [1, A.zara, T(6), "stopped", "system", "internal", "Stopped all channels for Northwind (reply received)", 5],
    [1, A.zara, T(6), "reply_classified", "system", "internal", "Classified as INTERESTED (asked for a time)", 4],
    [1, A.zara, T(6), "reply_sent", "email", "outbound", "Replied with 3 slots for Tuesday (auto-sent: interested, allowlisted contact)", 3],
    [1, A.zara, T(6), "meeting_proposed", "system", "internal", "Waiting for Sara to pick a slot", 3],
    [2, A.bilal, T(2), "found", "system", "internal", "Found by Scout: CFO at Contoso Pay", 98],
    [2, A.hira, T(3), "researched", "system", "internal", "Enriched (3 credits). Why-now: hiring Head of RevOps", 78],
    [2, null, null, "email_sent", "email", "outbound", "Email 1 sent (held: real prospect, not allowlisted — simulated for demo)", 30],
    [3, A.bilal, T(2), "found", "system", "internal", "Found by Scout: Head of Finance at Fabrikam Capital (pricing-page visits)", 98],
    [3, A.hira, T(3), "researched", "system", "internal", "Enriched (3 credits). Why-now: evaluating pricing", 77],
    [3, null, null, "linkedin_connection_sent", "linkedin", "outbound", "LinkedIn connection request sent (refs email 1)", 25],
    [4, A.bilal, T(2), "found", "system", "internal", "Found by Scout: CFO at Tailspin Ledger (seed extension)", 98],
    [4, A.hira, T(3), "researched", "system", "internal", "Enriched (3 credits). Why-now: fresh funding", 76],
    [4, null, null, "linkedin_connection_accepted", "linkedin", "inbound", "Accepted LinkedIn connection", 55],
    [4, null, null, "reply_received", "linkedin", "inbound", 'Replied on LinkedIn: "Sure, send me a time"', 50],
    [4, A.zara, null, "stopped", "system", "internal", "Stopped all channels for Tailspin", 49],
    [4, A.zara, null, "meeting_booked", "system", "internal", "Discovery call booked for Tue 15:00 (Google Meet)", 45],
    [5, A.bilal, T(2), "found", "system", "internal", "Found by Scout: CFO at Wingtip Finance (hiring SDR + AE)", 98],
    [5, A.hira, T(3), "researched", "system", "internal", "Enriched (3 credits). Why-now: building sales team", 75],
    [5, null, null, "call_completed", "phone", "outbound", "Call completed (4 min): wants a proposal", 65],
    [5, A.zara, null, "meeting_booked", "system", "internal", "Discovery call held yesterday", 24 * 60],
    [5, A.zara, null, "deal_created", "system", "internal", "Deal created: $12,000 — stage Discovery", 60],
    [6, A.bilal, T(2), "found", "system", "internal", "Found by Scout: VP Finance at Litware Payments", 98],
    [6, A.hira, T(3), "researched", "system", "internal", "Enriched (3 credits). No public signal; case-study angle", 70],
    [7, A.bilal, T(2), "found", "system", "internal", "Found by Scout: Head of Growth at Proseware Lending (weak fit 61)", 95],
    [8, A.bilal, T(2), "found", "system", "internal", "Found by Scout: Controller at Adventure Works Capital", 98],
    [8, A.hira, T(3), "researched", "system", "internal", "Enriched (3 credits). Likely not the buyer", 72],
    [8, null, null, "reply_received", "email", "inbound", 'Replied: "Not my area — try our CFO"', 29],
    [8, A.zara, null, "disqualified", "system", "internal", "Disqualified: wrong person. Referral to CFO queued for Scout", 28],
  ];
  const leadEvents: LeadEventLite[] = ev.map(([n, agent, task, type, channel, direction, summary, min], i) => ({
    id: i + 1,
    lead_id: L(n),
    agent_id: agent,
    task_id: task,
    type,
    channel,
    direction,
    summary,
    data: {},
    occurred_at: ago(min),
  }));

  const pipeline = pipelineFrom(leads);

  const sequences: SequenceLite[] = [
    {
      id: SEQ,
      g8_sequence_id: "seq_demo_fintech_cfo_01",
      name: "Fintech CFOs — 7-touch multi-channel",
      status: "live",
      channels: ["email", "linkedin", "phone"],
      steps: [
        { n: 1, day: 1, channel: "email", action: "send", subject: "Quick question about finance hiring at {{company}}" },
        { n: 2, day: 2, channel: "linkedin", action: "connection_request" },
        { n: 3, day: 4, channel: "linkedin", action: "message" },
        { n: 4, day: 5, channel: "email", action: "send", subject: "How Wingtip cut close time 40%" },
        { n: 5, day: 7, channel: "phone", action: "call" },
        { n: 6, day: 8, channel: "linkedin", action: "message" },
        { n: 7, day: 12, channel: "email", action: "send", subject: "Should I close your file?" },
      ],
      lead_count: 8,
      enrolled_count: 1,
      stats: { sent: 3, opened: 2, replied: 1, meetings: 1 },
    },
  ];

  const agents: PortalAgentRow[] = [
    agent("ayesha", "head_of_sales", "Ayesha", "Head of Sales", null, "🧑‍💼", "#7C3AED", 0, "waiting_on_you", 38, ago(3), tasks[6], 4, 1,
      "Sets the plan, assigns work, rolls up reports, asks you for approvals"),
    agent("bilal", "scout", "Bilal", "Scout", AGENT_ID.ayesha, "🔎", "#0EA5E9", 1, "idle", 12, ago(52), null, 1, 1,
      "Finds accounts and people that match the ICP and ranks them by buying signals"),
    agent("hira", "researcher", "Hira", "Researcher", AGENT_ID.ayesha, "🧪", "#10B981", 2, "idle", 37, ago(41), null, 1, 0,
      'Enriches each lead and writes the two-line "why this person, why now"'),
    agent("usman", "sdr", "Usman", "SDR", AGENT_ID.ayesha, "✍️", "#F59E0B", 3, "idle", 24, ago(30), null, 1, 0,
      "Builds and runs the multi-channel sequence in graph8 (email, LinkedIn, call)"),
    agent("zara", "closer", "Zara", "Closer", AGENT_ID.ayesha, "🤝", "#EF4444", 4, "working", 5, ago(1), tasks[5], 0, 1,
      "Handles every reply, stops outreach, books the meeting, opens the deal"),
  ];

  const approvals: ApprovalLite[] = [
    {
      id: "d0000000-0000-4000-8000-000000000002",
      task_id: taskUuid(7),
      kind: "connect_account",
      title: "Connect LinkedIn so 3 of 7 touches can send",
      summary: "Steps 2, 3 and 6 (LinkedIn) are queued for all leads. Email and call steps keep running. Connect in graph8, then click Done.",
      payload: { account: "linkedin", connect_url: "https://app.graph8.com/studio/settings", blocked_steps: [2, 3, 6] },
      status: "pending",
      decision_note: null,
      decided_at: null,
      requested_by_agent_id: AGENT_ID.ayesha,
      slack_channel: HQ,
      slack_ts: "1790000000.000710",
      created_at: ago(3),
    },
    {
      id: "d0000000-0000-4000-8000-000000000001",
      task_id: taskUuid(5),
      kind: "launch_sequence",
      title: "Launch 7-touch sequence to 8 leads",
      summary: "Enrolls allowlisted test contacts now; real prospects stay on hold until you lift the safety allowlist.",
      payload: { lead_count: 8, enroll_count: 1, channels: ["email", "linkedin", "phone"], g8_sequence_id: "seq_demo_fintech_cfo_01" },
      status: "approved",
      decision_note: null,
      decided_at: ago(36),
      requested_by_agent_id: AGENT_ID.ayesha,
      slack_channel: HQ,
      slack_ts: "1790000000.000510",
      created_at: ago(48),
    },
  ];

  // portal_needs_you = pending approvals ∪ tasks blocked on founder/connection. T-7 is blocked on
  // 'approval' (seed.sql line 297), so the view returns the decision only.
  const needsYou: PortalNeedsYouRow[] = [
    {
      item_type: "approval",
      id: approvals[0].id,
      workspace_id: WS,
      title: approvals[0].title,
      detail: approvals[0].summary ?? "",
      agent_id: AGENT_ID.ayesha,
      slack_channel: HQ,
      slack_ts: "1790000000.000710",
      created_at: ago(3),
    },
  ];

  const reports: ReportRow[] = [
    report(9, AGENT_ID.ayesha, null, 7, "question", "LinkedIn is not connected — connect it?",
      "3 of 7 touches (LinkedIn) are queued for every lead. Email and call steps run meanwhile. Connect LinkedIn in graph8 and click Done in Slack.",
      HQ, "1790000000.000710", null, ago(3)),
    report(8, AGENT_ID.zara, AGENT_ID.ayesha, 6, "update", "Sara (Northwind) replied — interested",
      "Stopped all channels for Northwind. She asked for Tuesday afternoon. Sent 3 slots on email (auto-send: interested). Waiting for her pick.",
      TEAM, "1790000000.000610", "1790000000.000600", ago(4)),
    report(7, AGENT_ID.ayesha, null, 9, "answer", "Pipeline right now",
      "8 in sequence · 1 replied (Sara, Northwind) · 1 meeting (Omar, Tailspin, Tue 15:00) · 1 deal (Wingtip, $12k, Discovery).",
      HQ, "1790000000.000900", null, ago(11)),
    report(6, AGENT_ID.ayesha, null, 8, "standup", "Standup — Sun 27 Sep",
      "Yesterday: team hired, 12 prospects found, 8 researched, sequence built and launched. Today: handle replies, batch 2 (UK). Blockers: none.",
      HQ, "1790000000.000800", null, ago(19)),
    report(5, AGENT_ID.ayesha, null, 5, "update", "Sequence live",
      "You approved. 1 allowlisted test contact enrolled; 7 real prospects held by the safety allowlist. First email goes out now.",
      HQ, "1790000000.000520", null, ago(35)),
    report(4, AGENT_ID.usman, AGENT_ID.ayesha, 4, "handoff", "Sequence drafted: 7 touches over 12 days",
      "Email → LinkedIn connect (refs email) → LinkedIn msg → email 2 → call → LinkedIn msg 2 → breakup. Stops on any reply.",
      TEAM, "1790000000.000410", "1790000000.000400", ago(50)),
    report(10, AGENT_ID.ayesha, null, null, "win", "Deal created: Wingtip Finance — $12k",
      "Zainab (CFO) took the discovery call. Deal opened in graph8 at stage Discovery.",
      HQ, "1790000000.000950", null, ago(60)),
    report(3, AGENT_ID.hira, AGENT_ID.ayesha, 3, "handoff", "Enriched 7, why-now written",
      "21 credits spent (3 per lead). Best hooks: Northwind (Series A + FP&A hire), Wingtip (hiring SDR + AE).",
      TEAM, "1790000000.000310", "1790000000.000300", ago(70)),
    report(2, AGENT_ID.bilal, AGENT_ID.ayesha, 2, "handoff", "Found 12 accounts, 8 with strong signals",
      '5 hiring finance roles, 3 raised in the last 90 days. Saved to graph8 list "Fintech CFOs — batch 1".',
      TEAM, "1790000000.000210", "1790000000.000200", ago(95)),
    report(1, AGENT_ID.ayesha, null, 1, "plan", "Hired. Here is the plan.",
      "I read 8x.social and the 23 graph8 context docs. Target: Series A-B fintech CFOs (US/UK). First standup 9:00.",
      HQ, "1790000000.000100", null, ago(115)),
  ];

  // reports.data for the standup (StandupData in types.ts), as seeded.
  const standup = reports.find((r) => r.kind === "standup");
  if (standup) {
    standup.data = {
      pipeline: { prospects: 8, contacted: 2, replied: 1, meetings: 1, deals: 1, deal_value: 12000 },
      credits: { Ayesha: 38, Bilal: 12, Hira: 37, Usman: 24, Zara: 0 },
    };
    standup.body =
      "Yesterday: team hired, 12 prospects found, 8 researched, sequence built and launched. Today: handle replies, batch 2 (UK). Blockers: none. Pipeline: 8 in sequence, 1 replied, 1 meeting, 1 deal ($12k). Credits (graph8 + LLM): Ayesha 38, Bilal 12, Hira 37, Usman 24, Zara 0.";
  }

  // agent_runs + credit_events, as seeded: one LLM ledger row per run (ceil(tokens / 1000) credits),
  // graph8 rows for Hira's 7 enrichments and two ai_generate calls. Totals match spent_today_credits.
  const R = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const run = (
    n: number, agentKey: keyof typeof AGENT_ID, task: number, trigger: RunLite["trigger"], trigger_ref: string | null,
    summary: string | null, input: number, output: number, tools: number, started: number, finished: number | null,
  ): RunLite => ({
    id: R(n), agent_id: AGENT_ID[agentKey], task_id: taskUuid(task), trigger, trigger_ref,
    status: finished == null ? "running" : "succeeded", summary, error: null, model: "gemini-3.8-flash",
    input_tokens: input, output_tokens: output, tool_call_count: tools,
    credits_used: Math.ceil((input + output) / 1000), started_at: ago(started), finished_at: finished == null ? null : ago(finished),
  });
  const runs: RunLite[] = [
    run(7, "zara", 6, "webhook", "90000000-0000-4000-8000-000000000001", null, 4200, 300, 3, 5, null),
    run(6, "ayesha", 8, "cron", "standup:2026-09-27", "Posted standup", 6400, 900, 5, 20, 19),
    run(5, "ayesha", 5, "slack_action", "approve:d0000000-0000-4000-8000-000000000001", "Approval received; sequence launched; 1 test contact enrolled", 3100, 600, 4, 36, 35),
    run(4, "usman", 4, "delegation", root, "Created list + 7-step sequence in graph8 (drafted, not launched)", 8800, 5200, 7, 68, 50),
    run(3, "hira", 3, "delegation", root, "Enriched 7 contacts (21 credits), wrote why-now for each", 12100, 3900, 11, 93, 70),
    run(2, "bilal", 2, "delegation", root, "Searched 4 ICP filters (free), ranked by signals, saved 12 to graph8 list", 9400, 2100, 9, 109, 95),
    run(1, "ayesha", 1, "slash_command", "/hire-sales 8x.social", "Read graph8 context (23 docs), wrote plan, created 3 tasks for Bilal/Hira/Usman", 18200, 1400, 6, 120, 115),
  ];
  let ce = 0;
  const credit = (r: Omit<CreditLite, "id">): CreditLite => ({ id: ++ce, ...r });
  const creditEvents: CreditLite[] = [
    ...runs.map((r) =>
      credit({ agent_id: r.agent_id, task_id: r.task_id, run_id: r.id, lead_id: null, source: "llm", action: "llm_run",
        credits: r.credits_used, note: r.model, created_at: r.finished_at ?? ago(1) }),
    ),
    ...[1, 2, 3, 4, 5, 6, 8].map((n) =>
      credit({ agent_id: A.hira, task_id: taskUuid(3), run_id: R(3), lead_id: L(n), source: "graph8", action: "enrich_person",
        credits: 3, note: "waterfall enrichment", created_at: ago(80) }),
    ),
    credit({ agent_id: A.usman, task_id: taskUuid(4), run_id: R(4), lead_id: null, source: "graph8", action: "ai_generate", credits: 10, note: "sequence copy (7 steps)", created_at: ago(55) }),
    credit({ agent_id: A.ayesha, task_id: taskUuid(1), run_id: R(1), lead_id: null, source: "graph8", action: "ai_generate", credits: 6, note: "plan summary", created_at: ago(116) }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const today: PortalTodayRow = {
    workspace_id: WS,
    today: new Date(now).toISOString().slice(0, 10),
    credits_spent_today: 116,
    budget_daily_credits: 500000,
    agents_working: 1,
    agents_waiting_on_you: 1,
    agents_paused: 0,
    approvals_pending: 1,
    tasks_open: 3,
    tasks_done_today: 7,
    leads_found_today: 8,
    leads_contacted_today: 4,
    replies_today: 3,
    meetings_booked_today: 1,
    deals_created_today: 1,
    deals_open: 1,
    deals_value: "12000.00",
  };

  const found = [0, 1, 3, 6, 8, 8, 8, 8, 8, 8, 8, 8];
  const replies = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3];
  const meetings = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
  const deals = [0, 0, 0, 0, 0, 0, 12000, 12000, 12000, 12000, 12000, 12000];
  const credits = [0, 0, 0, 5, 15, 40, 60, 80, 95, 105, 112, 116];
  const activity: ActivityPoint[] = found.map((_, i) => ({
    t: ago((11 - i) * 10),
    found: found[i],
    replies: replies[i],
    meetings: meetings[i],
    deals_value: deals[i],
    credits: credits[i],
  }));

  return { workspace: WORKSPACE, agents, today, needsYou, approvals, tasks, leads, leadEvents, pipeline, sequences, reports, runs, creditEvents, activity };
}

/** Agents hired but no work yet: cards show "No task right now", strip zeros. */
export function emptySnapshot(now: number): PortalSnapshot {
  const s = seedSnapshot(now);
  return {
    ...s,
    agents: s.agents.map((a) => ({
      ...a,
      status: "idle",
      spent_today_credits: 0,
      current_task_id: null,
      current_task_title: null,
      current_task_status: null,
      current_task_thread_ts: null,
      tasks_done: 0,
      tasks_open: 0,
      last_active_at: null,
    })),
    today: {
      ...s.today,
      credits_spent_today: 0,
      agents_working: 0,
      agents_waiting_on_you: 0,
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
    },
    needsYou: [],
    approvals: [],
    tasks: [],
    leads: [],
    leadEvents: [],
    pipeline: pipelineFrom([]),
    sequences: [],
    reports: [],
    runs: [],
    creditEvents: [],
    activity: s.activity.map((p) => ({ ...p, found: 0, replies: 0, meetings: 0, deals_value: 0, credits: 0 })),
  };
}

/** Workspace exists, team not hired yet (`status = 'onboarding'`, zero agents). */
export function onboardingSnapshot(now: number): PortalSnapshot {
  const s = emptySnapshot(now);
  return { ...s, workspace: { ...s.workspace, status: "onboarding" }, agents: [] };
}

// --- row builders ------------------------------------------------------------

function t(
  n: number,
  kind: TaskLite["kind"],
  title: string,
  status: TaskLite["status"],
  assignee: string,
  channel: string | null,
  extra: Partial<TaskLite>,
): TaskLite {
  return {
    id: taskUuid(n),
    number: n,
    kind,
    title,
    detail: null,
    status,
    blocked_on: null,
    blocked_reason: null,
    assignee_agent_id: assignee,
    created_by_agent_id: null,
    parent_task_id: null,
    root_task_id: extra.parent_task_id ?? taskUuid(n), // trigger: root = self for roots
    lead_id: null,
    sequence_id: null,
    approval_id: null,
    result_summary: null,
    credits_used: 0,
    slack_channel: channel,
    slack_thread_ts: channel ? `1790000000.000${n}00`.slice(0, 17) : null,
    created_at: new Date(0).toISOString(),
    started_at: null,
    finished_at: null,
    ...extra,
  };
}

function lead(
  n: number,
  name: string,
  title: string,
  company: string,
  domain: string,
  location: string,
  stage: LeadLite["stage"],
  fit: number,
  owner: string,
  extra: Partial<LeadLite>,
): LeadLite {
  const id3 = String(n).padStart(3, "0");
  return {
    id: `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    g8_contact_id: `ct_demo_${id3}`,
    g8_company_id: `co_demo_${id3}`,
    g8_deal_id: null,
    g8_meeting_id: null,
    sequence_id: null,
    owner_agent_id: owner,
    full_name: name,
    job_title: title,
    company_name: company,
    company_domain: domain,
    location,
    stage,
    stage_changed_at: new Date(0).toISOString(),
    disqualify_reason: null,
    fit_score: fit,
    signals: [],
    why_now: null,
    sequence_state: "none",
    last_channel: null,
    last_reply_intent: null,
    last_activity_at: null,
    meeting_at: null,
    deal_amount: null,
    deal_stage: null,
    is_test_contact: false,
    do_not_contact: false,
    created_at: new Date(0).toISOString(),
    ...extra,
  };
}

const STAGE_ORDER: LeadLite["stage"][] = [
  "prospect", "researched", "queued", "contacted", "replied", "meeting", "deal", "won", "lost", "disqualified",
];

/** Same shape as the portal_pipeline view: one zero-filled row per stage, funnel order. */
export function pipelineFrom(leads: LeadLite[]): PortalPipelineRow[] {
  return STAGE_ORDER.map((stage, i) => {
    const inStage = leads.filter((l) => l.stage === stage);
    return {
      workspace_id: WS,
      stage,
      ord: i + 1,
      lead_count: inStage.length,
      deal_amount: inStage.reduce((sum, l) => sum + Number(l.deal_amount ?? 0), 0).toFixed(2),
    };
  });
}

function agent(
  key: keyof typeof AGENT_ID,
  role: PortalAgentRow["role"],
  name: string,
  title: string,
  reportsTo: string | null,
  emoji: string,
  color: string,
  sort: number,
  status: PortalAgentRow["status"],
  spent: number,
  lastActive: string,
  task: TaskLite | null,
  done: number,
  open: number,
  job: string,
): PortalAgentRow {
  return {
    id: AGENT_ID[key],
    workspace_id: WS,
    role,
    name,
    title,
    job,
    reports_to: reportsTo,
    emoji,
    color,
    avatar_url: `/avatars/${key}.png`,
    sort_order: sort,
    status,
    pause_reason: null,
    budget_daily_credits: 100000,
    spent_today_credits: spent,
    budget_warn_pct: 80,
    last_active_at: lastActive,
    current_task_id: task?.id ?? null,
    current_task_title: task?.title ?? null,
    current_task_status: task?.status ?? null,
    current_task_thread_ts: task?.slack_thread_ts ?? null,
    tasks_done: done,
    tasks_open: open,
  };
}

function report(
  n: number,
  from: string,
  to: string | null,
  task: number | null,
  kind: ReportRow["kind"],
  title: string,
  body: string,
  channel: string,
  ts: string,
  threadTs: string | null,
  createdAt: string,
): ReportRow {
  return {
    id: `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    workspace_id: WS,
    from_agent_id: from,
    to_agent_id: to,
    task_id: task ? taskUuid(task) : null,
    run_id: null,
    kind,
    title,
    body,
    data: {},
    slack_channel: channel,
    slack_ts: ts,
    slack_thread_ts: threadTs,
    created_at: createdAt,
  };
}

export function makeReport(
  id: string,
  from: string,
  to: string | null,
  task: number | null,
  kind: ReportRow["kind"],
  title: string,
  body: string,
  now: number,
): ReportRow {
  return {
    ...report(0, from, to, task, kind, title, body, to ? TEAM : HQ, `${Math.floor(now / 1000)}.000100`, null, new Date(now).toISOString()),
    id,
  };
}
