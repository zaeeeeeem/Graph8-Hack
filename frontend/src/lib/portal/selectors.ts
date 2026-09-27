// Pure derivations over a PortalSnapshot. Same functions will run on Supabase data later.
import type { ActivityPoint, CreditLite, PortalSnapshot, RunLite, TaskLite } from "./snapshot";
import type { PortalAgentRow, PortalNeedsYouRow } from "./types";
import { PAUSE_REASON } from "./vocab";
import { taskId } from "./format";

/**
 * portal_needs_you unions pending approvals with tasks blocked on the founder. When a blocked task
 * already has a pending decision pointing at it (approvals.task_id), it is the same ask — show once.
 */
export function needsYouItems(s: PortalSnapshot): PortalNeedsYouRow[] {
  const coveredTasks = new Set(
    s.approvals.filter((a) => a.status === "pending" && a.task_id).map((a) => a.task_id as string),
  );
  return s.needsYou.filter((row) => row.item_type === "approval" || !coveredTasks.has(row.id));
}

export function tasksById(s: PortalSnapshot): Map<string, TaskLite> {
  return new Map(s.tasks.map((t) => [t.id, t]));
}

export function agentsById(s: PortalSnapshot): Map<string, PortalAgentRow> {
  return new Map(s.agents.map((a) => [a.id, a]));
}

export function pausedAgent(s: PortalSnapshot): PortalAgentRow | undefined {
  return s.agents.find((a) => a.status === "paused");
}

export function pauseBannerText(a: PortalAgentRow) {
  return {
    name: a.name,
    reason: a.pause_reason ? PAUSE_REASON[a.pause_reason] : "paused in Slack",
    rest: `Nothing runs for ${a.title} until it is resumed in Slack.`,
  };
}

// --- pipeline ------------------------------------------------------------------------

export type FunnelKey = "prospects" | "contacted" | "replied" | "meetings" | "deals" | "closed";

/** Five funnel buckets over portal_pipeline (02-screens.md §3a) + the muted "closed out" tail. */
export const FUNNEL: { key: FunnelKey; label: string; stages: string[] }[] = [
  { key: "prospects", label: "Prospects", stages: ["prospect", "researched", "queued"] },
  { key: "contacted", label: "Contacted", stages: ["contacted"] },
  { key: "replied", label: "Replied", stages: ["replied"] },
  { key: "meetings", label: "Meetings", stages: ["meeting"] },
  { key: "deals", label: "Deals", stages: ["deal", "won"] },
];
export const CLOSED_OUT = { key: "closed" as const, label: "Closed out", stages: ["lost", "disqualified"] };

export function funnelBuckets(s: PortalSnapshot) {
  const sum = (stages: string[]) => {
    const rows = s.pipeline.filter((r) => stages.includes(r.stage));
    return {
      count: rows.reduce((n, r) => n + r.lead_count, 0),
      amount: rows.reduce((n, r) => n + Number(r.deal_amount), 0),
    };
  };
  return {
    buckets: FUNNEL.map((b) => ({ ...b, ...sum(b.stages) })),
    closed: { ...CLOSED_OUT, ...sum(CLOSED_OUT.stages) },
    total: s.pipeline.reduce((n, r) => n + r.lead_count, 0),
  };
}

export function stagesFor(key: FunnelKey | null): string[] | null {
  if (!key) return null;
  if (key === "closed") return CLOSED_OUT.stages;
  return FUNNEL.find((b) => b.key === key)?.stages ?? null;
}

/** qLeads order: most recent activity first, nulls last. */
export function sortedLeads(s: PortalSnapshot) {
  return [...s.leads].sort((a, b) => (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""));
}

/** Newest first; same-time events fall back to insertion order (id desc). */
export function eventsForLead(s: PortalSnapshot, leadId: string) {
  return s.leadEvents
    .filter((e) => e.lead_id === leadId)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id);
}

// --- task drawer --------------------------------------------------------------------

export function taskByNumber(s: PortalSnapshot, n: number): TaskLite | undefined {
  return s.tasks.find((t) => t.number === n);
}

export type TaskTreeNode = { task: TaskLite; children: TaskTreeNode[] };

/** The whole delegation tree the task belongs to (tasks.root_task_id), nested by parent_task_id. */
export function taskTree(s: PortalSnapshot, task: TaskLite): TaskTreeNode | null {
  const rootId = task.root_task_id ?? task.id;
  const members = s.tasks.filter((t) => (t.root_task_id ?? t.id) === rootId);
  const byParent = new Map<string | null, TaskLite[]>();
  for (const t of members) {
    const key = t.id === rootId ? null : t.parent_task_id;
    byParent.set(key, [...(byParent.get(key) ?? []), t]);
  }
  const build = (t: TaskLite): TaskTreeNode => ({
    task: t,
    children: (byParent.get(t.id) ?? []).sort((a, b) => a.number - b.number).map(build),
  });
  const root = members.find((t) => t.id === rootId);
  return root ? build(root) : null;
}

/** Reports posted on a task = the Slack thread mirrored, oldest first. */
export function reportsForTask(s: PortalSnapshot, taskId: string) {
  return s.reports.filter((r) => r.task_id === taskId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Pending decision that points at this task (approvals.task_id or tasks.approval_id). */
export function decisionForTask(s: PortalSnapshot, task: TaskLite) {
  return s.approvals.find((a) => a.id === task.approval_id || a.task_id === task.id);
}

const BUCKET_MS = 10 * 60_000;
const BUCKETS = 12;

/**
 * Today's running totals in 10-minute buckets over the last two hours, derived from real rows:
 * leads created (found), lead_events reply_received / meeting_booked / deal_created, credit_events.
 */
export function buildActivity(s: Omit<PortalSnapshot, "activity">, dayStart: string, now = Date.now()): ActivityPoint[] {
  const start = Date.parse(dayStart);
  const leadAmount = new Map(s.leads.map((l) => [l.id, Number(l.deal_amount ?? 0)]));
  const times = (list: string[]) => list.map((t) => Date.parse(t)).filter((t) => t >= start);
  const found = times(s.leads.map((l) => l.created_at));
  const replies = times(s.leadEvents.filter((e) => e.type === "reply_received").map((e) => e.occurred_at));
  const meetings = times(s.leadEvents.filter((e) => e.type === "meeting_booked").map((e) => e.occurred_at));
  const deals = s.leadEvents
    .filter((e) => e.type === "deal_created" && Date.parse(e.occurred_at) >= start)
    .map((e) => ({ t: Date.parse(e.occurred_at), v: leadAmount.get(e.lead_id) ?? 0 }));
  const credits = s.creditEvents.map((c) => ({ t: Date.parse(c.created_at), v: c.credits })).filter((c) => c.t >= start);
  const upTo = (list: number[], end: number) => list.filter((t) => t <= end).length;
  const sumTo = (list: { t: number; v: number }[], end: number) => list.reduce((n, x) => (x.t <= end ? n + x.v : n), 0);
  return Array.from({ length: BUCKETS }, (_, i) => {
    const end = now - (BUCKETS - 1 - i) * BUCKET_MS;
    return {
      t: new Date(end - BUCKET_MS).toISOString(),
      found: upTo(found, end),
      replies: upTo(replies, end),
      meetings: upTo(meetings, end),
      deals_value: sumTo(deals, end),
      credits: sumTo(credits, end),
    };
  });
}

/** Today's running totals; the last point always equals portal_today's live numbers. */
export function activitySeries(s: PortalSnapshot): ActivityPoint[] {
  if (s.activity.length === 0) return [];
  const last = s.activity[s.activity.length - 1];
  return [
    ...s.activity.slice(0, -1),
    {
      ...last,
      found: s.today.leads_found_today,
      replies: s.today.replies_today,
      meetings: s.today.meetings_booked_today,
      deals_value: Number(s.today.deals_value),
      credits: s.today.credits_spent_today,
    },
  ];
}

/** Change over the last hour (6 buckets of 10 min) for one metric. */
export function lastHourDelta(series: ActivityPoint[], key: Exclude<keyof ActivityPoint, "t">): number {
  if (series.length < 2) return 0;
  const now = series[series.length - 1][key];
  const before = series[Math.max(0, series.length - 7)][key];
  return now - before;
}

/** Share of today's tasks that are done: tasks_done_today / (done today + still open). */
export function tasksDoneShare(s: PortalSnapshot) {
  const done = s.today.tasks_done_today;
  const total = done + s.today.tasks_open;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/** Facts, not labels: "Zara is working on T-6 · Ayesha is waiting on you". */
export function officeHeadline(s: PortalSnapshot): string[] {
  const byId = tasksById(s);
  const facts: string[] = [];
  for (const a of [...s.agents].sort((x, y) => x.sort_order - y.sort_order)) {
    const task = a.current_task_id ? byId.get(a.current_task_id) : undefined;
    if (a.status === "working") facts.push(task ? `${a.name} is working on ${taskId(task.number)}` : `${a.name} is working`);
    else if (a.status === "waiting_on_you") facts.push(`${a.name} is waiting on you`);
    else if (a.status === "paused") facts.push(`${a.name} is paused`);
    else if (a.status === "error") facts.push(`${a.name} hit an error`);
  }
  if (facts.length === 0 && s.agents.length > 0) facts.push("The team is idle, waiting for the next assignment");
  return facts;
}

// --- org chart layout (horizontal, left → right) -------------------------------

/** Collapsed card size used for layout; expanded cards grow downward and float above siblings. */
export const NODE_W = 264;
export const NODE_H = 96;
const COL_GAP = 200; // room for edge labels between columns
const ROW_GAP = 28;

export interface PlacedNode {
  id: string;
  kind: "founder" | "agent";
  x: number;
  y: number;
  parentId: string | null;
  agent?: PortalAgentRow;
}

export const FOUNDER_NODE_ID = "founder";

/**
 * Hand-computed tree layout (brief: no dagre). Column 0 = founder, column n = agents whose chain
 * of `reports_to` has length n-1. Siblings ordered by sort_order and centred on y = 0.
 */
export function layoutOrg(agents: PortalAgentRow[]): PlacedNode[] {
  const ids = new Set(agents.map((a) => a.id));
  const columns: PortalAgentRow[][] = [];
  const depth = new Map<string, number>();

  const depthOf = (a: PortalAgentRow, guard = 0): number => {
    if (depth.has(a.id)) return depth.get(a.id)!;
    const parent = a.reports_to && ids.has(a.reports_to) ? agents.find((p) => p.id === a.reports_to) : undefined;
    const d = parent && guard < 10 ? depthOf(parent, guard + 1) + 1 : 1;
    depth.set(a.id, d);
    return d;
  };

  for (const a of agents) (columns[depthOf(a)] ??= []).push(a);

  const placed: PlacedNode[] = [{ id: FOUNDER_NODE_ID, kind: "founder", x: 0, y: -NODE_H / 2, parentId: null }];

  columns.forEach((col, d) => {
    if (!col) return;
    col.sort((x, y) => x.sort_order - y.sort_order);
    const total = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    col.forEach((a, i) => {
      placed.push({
        id: a.id,
        kind: "agent",
        x: d * (NODE_W + COL_GAP),
        y: -total / 2 + i * (NODE_H + ROW_GAP),
        parentId: a.reports_to && ids.has(a.reports_to) ? a.reports_to : FOUNDER_NODE_ID,
        agent: a,
      });
    });
  });

  return placed;
}

// --- Agent page -------------------------------------------------------------------

/** URL slug for an agent page: the name, lower-case (the route also accepts the uuid). */
export const agentHref = (a: Pick<PortalAgentRow, "name">) => `/office/agents/${a.name.toLowerCase()}`;

export function agentBySlug(s: PortalSnapshot, slug: string): PortalAgentRow | undefined {
  const key = decodeURIComponent(slug).toLowerCase();
  return s.agents.find((a) => a.id === key || a.name.toLowerCase() === key);
}

export const runsForAgent = (s: PortalSnapshot, agentId: string) =>
  s.runs.filter((r) => r.agent_id === agentId).sort((a, b) => b.started_at.localeCompare(a.started_at));

export const creditsForAgent = (s: PortalSnapshot, agentId: string) =>
  s.creditEvents.filter((c) => c.agent_id === agentId).sort((a, b) => b.created_at.localeCompare(a.created_at));

/** Today's spend split by source, from the ledger (the header number comes from portal_agents). */
export function spendBySource(rows: CreditLite[]) {
  const out = { graph8: 0, llm: 0, manual: 0 };
  for (const r of rows) out[r.source] += r.credits;
  return out;
}

/** Tasks assigned to the agent: open first (newest), then done (newest). */
export function tasksForAgent(s: PortalSnapshot, agentId: string) {
  const mine = s.tasks.filter((t) => t.assignee_agent_id === agentId);
  const byRecent = (a: TaskLite, b: TaskLite) => (b.finished_at ?? b.created_at).localeCompare(a.finished_at ?? a.created_at);
  return {
    open: mine.filter((t) => t.status !== "done" && t.status !== "cancelled").sort(byRecent),
    done: mine.filter((t) => t.status === "done" || t.status === "cancelled").sort(byRecent),
  };
}

/** "Assigned by Ayesha" for delegation runs: the manager who created the run's task. */
export function runDelegator(s: PortalSnapshot, run: RunLite): PortalAgentRow | undefined {
  if (run.trigger !== "delegation" || !run.task_id) return undefined;
  const task = s.tasks.find((t) => t.id === run.task_id);
  const byId = agentsById(s);
  if (task?.created_by_agent_id) return byId.get(task.created_by_agent_id);
  const parent = task?.parent_task_id ? s.tasks.find((t) => t.id === task.parent_task_id) : undefined;
  return parent ? byId.get(parent.assignee_agent_id ?? "") : undefined;
}

// --- activity feed (portal_activity) -----------------------------------------------

/** Steps in reading order (oldest first) for one task or one run. */
export const stepsForTask = (s: PortalSnapshot, taskId: string) =>
  s.steps.filter((x) => x.task_id === taskId).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.seq - b.seq);
export const stepsForRun = (s: PortalSnapshot, runId: string) =>
  s.steps.filter((x) => x.run_id === runId).sort((a, b) => a.seq - b.seq);
