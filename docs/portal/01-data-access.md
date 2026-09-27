# Data access — Supabase from the portal

All reads go through the **anon key**. Row Level Security lets the anon key `SELECT` rows of any
workspace with `is_demo = true` (the seeded one) from these tables/views only:

| Readable | Purpose in the portal |
|---|---|
| `workspaces` | name, domain, founder name, timezone, org budget, `slack_channel_*` for links |
| `agents` | org chart, status, budget, current task |
| `tasks` | task lists, tree, Slack thread link |
| `agent_runs` | "what each run did" (agent detail) |
| `reports` | report stream, standups, wins |
| `approvals` | needs-you, decision history |
| `sequences` | the sequence card (steps, stats) |
| `leads` | pipeline (no PII columns exist here) |
| `lead_events` | lead timeline |
| `credit_events` | ledger (agent detail) |
| view `portal_agents` | agents + current task title + today's spend (already day-corrected) + counts |
| view `portal_pipeline` | zero-filled count + deal value per stage, funnel order |
| view `portal_needs_you` | pending approvals ∪ tasks blocked on the founder |
| view `portal_today` | one row: every number for the today strip |
| view `portal_activity` | **activity feed**: every agent step (tool / llm / slack / note) with agent name/role/emoji/color and task number/title |
| `run_steps` (safe columns only) | same steps, raw; only for the realtime subscription. Columns: `id, run_id, workspace_id, seq, kind, name, summary, ok, credits_used, duration_ms, created_at` |

**Not readable** (you get `permission denied`, by design): `workspace_secrets`, `contact_allowlist`,
`lead_contacts`, `inbound_events`, and the columns `run_steps.args / result / error`. Never query them.
`run_steps?select=*` also fails (it includes private columns) — always name columns, or use `portal_activity`.
Inserts/updates are denied everywhere.

Types: copy `shared/types.ts` into the app (`lib/types.ts`). Row interfaces match column names 1:1.
`numeric` columns (`deal_amount`, `deals_value`, `demo_time_scale`) arrive as **strings** — `Number()` them.

## 1. Client

```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { realtime: { params: { eventsPerSecond: 20 } } },
);
export const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID ?? 'a0000000-0000-4000-8000-000000000001';
```

Always filter by `workspace_id` (`.eq('workspace_id', WORKSPACE_ID)`). RLS would allow other demo
workspaces too; the filter keeps the app single-tenant-correct.

## 2. Queries per screen (exact columns)

```ts
// lib/queries.ts  — every function returns typed rows from shared/types.ts
const ws = WORKSPACE_ID;

export const qWorkspace = () => supabase.from('workspaces')
  .select('id,slug,name,company_domain,timezone,status,founder_name,slack_channel_team,slack_channel_hq,budget_daily_credits,is_demo,sales_brain')
  .eq('id', ws).single();

export const qAgents = () => supabase.from('portal_agents').select('*').eq('workspace_id', ws).order('sort_order');

export const qToday = () => supabase.from('portal_today').select('*').eq('workspace_id', ws).single();

export const qNeedsYou = () => supabase.from('portal_needs_you').select('*').eq('workspace_id', ws).order('created_at', { ascending: false });

export const qTasks = (status?: TaskStatus[]) => {
  let q = supabase.from('tasks')
    .select('id,number,kind,title,detail,assignee_agent_id,created_by_agent_id,parent_task_id,root_task_id,lead_id,sequence_id,priority,status,blocked_on,blocked_reason,blocked_by_task_id,approval_id,result_summary,credits_used,slack_channel,slack_thread_ts,started_at,finished_at,created_at,updated_at')
    .eq('workspace_id', ws).order('created_at', { ascending: false }).limit(200);
  return status ? q.in('status', status) : q;
};

export const qTaskTree = (rootId: string) => supabase.from('tasks').select('*').eq('workspace_id', ws).eq('root_task_id', rootId).order('created_at');

export const qReportsForTask = (taskId: string) => supabase.from('reports')
  .select('id,from_agent_id,to_agent_id,kind,title,body,data,slack_channel,slack_ts,slack_thread_ts,created_at')
  .eq('task_id', taskId).order('created_at');

export const qReports = (kinds?: ReportKind[]) => {
  let q = supabase.from('reports').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(100);
  return kinds ? q.in('kind', kinds) : q;
};

export const qApprovals = () => supabase.from('approvals')
  .select('id,requested_by_agent_id,task_id,sequence_id,lead_id,kind,title,summary,payload,status,decision_note,decided_at,expires_at,slack_channel,slack_ts,created_at')
  .eq('workspace_id', ws).order('created_at', { ascending: false });

export const qPipeline = () => supabase.from('portal_pipeline').select('*').eq('workspace_id', ws).order('ord');

export const qLeads = () => supabase.from('leads')
  .select('id,g8_contact_id,g8_company_id,g8_deal_id,g8_meeting_id,sequence_id,owner_agent_id,full_name,job_title,company_name,company_domain,location,stage,stage_changed_at,disqualify_reason,fit_score,signals,why_now,sequence_state,last_channel,last_reply_intent,last_activity_at,meeting_at,deal_amount,deal_stage,is_test_contact,do_not_contact,created_at')
  .eq('workspace_id', ws).order('last_activity_at', { ascending: false, nullsFirst: false });

export const qLeadEvents = (leadId: string) => supabase.from('lead_events')
  .select('id,agent_id,task_id,type,channel,direction,summary,data,occurred_at')
  .eq('lead_id', leadId).order('occurred_at', { ascending: false });

export const qSequences = () => supabase.from('sequences').select('*').eq('workspace_id', ws).order('created_at', { ascending: false });

export const qAgentRuns = (agentId: string) => supabase.from('agent_runs')
  .select('id,task_id,trigger,trigger_ref,status,summary,error,model,input_tokens,output_tokens,tool_call_count,credits_used,started_at,finished_at')
  .eq('agent_id', agentId).order('started_at', { ascending: false }).limit(50);

// Activity feed (Office side panel / agent detail / task drawer). Newest first.
export const qActivity = (opts: { agentId?: string; taskId?: string; runId?: string; limit?: number } = {}) => {
  let q = supabase.from('portal_activity')
    .select('id,run_id,agent_id,agent_name,agent_role,agent_emoji,agent_color,task_id,task_number,task_title,seq,kind,name,summary,ok,credits_used,duration_ms,created_at')
    .eq('workspace_id', ws).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(opts.limit ?? 50);
  if (opts.agentId) q = q.eq('agent_id', opts.agentId);
  if (opts.taskId) q = q.eq('task_id', opts.taskId);
  if (opts.runId) q = q.eq('run_id', opts.runId);
  return q;
};

export const qCreditEvents = (agentId: string) => supabase.from('credit_events')
  .select('id,task_id,run_id,lead_id,source,action,credits,note,created_at')
  .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(100);
```

Joins: PostgREST embedding works on FKs, e.g. `tasks.select('*, assignee:agents!tasks_assignee_agent_id_fkey(name,emoji,color)')`.
Simpler and enough here: load `qAgents()` once, keep an `agentsById` map in context, and join client-side.

## 3. Relationships you will walk

- Org chart: `agents.reports_to` (null = reports to the founder). Founder node is virtual: `workspaces.founder_name`.
- Current task on a card: `portal_agents.current_task_id/current_task_title/current_task_status/current_task_thread_ts`.
- Task tree: `tasks.root_task_id` (all rows of a tree) + `parent_task_id` (nesting). Root row has `root_task_id = id`.
- Task ↔ approval: `tasks.approval_id` (when `blocked_on = 'approval'`), `approvals.task_id`.
- Task ↔ lead: `tasks.lead_id`. Task ↔ sequence: `tasks.sequence_id`.
- Reports in a task thread: `reports.task_id`. Report direction: `from_agent_id` → `to_agent_id` (null = to the founder).
- Lead timeline: `lead_events.lead_id`. Lead ↔ sequence: `leads.sequence_id`.
- Runs: `agent_runs.agent_id`, `agent_runs.task_id`.
- Steps: `run_steps.run_id` → `agent_runs` → agent/task. `portal_activity` already carries `agent_*` and `task_*`, so no join needed.
  Within a run, order by `seq`. `kind` chip: `tool` "graph8/tool", `llm` "thinking", `slack` "Slack", `note` "note". `ok=false` → error colour.
  `summary` is PII-free, one line, may be null (show `name` then).

## 4. Realtime

Tables published: `workspaces, agents, tasks, reports, approvals, sequences, leads, lead_events, run_steps`.
(`run_steps` streams INSERTs only; payload carries only the safe columns above.)
Views are not streamed; when an underlying table changes, **refetch the view**.

One channel per workspace, one subscription per table, filter by `workspace_id`:

```ts
// hooks/useWorkspaceRealtime.ts
'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, WORKSPACE_ID } from '@/lib/supabase';

const TABLE_TO_QUERIES: Record<string, string[]> = {
  workspaces:  ['workspace', 'today'],
  agents:      ['agents', 'today'],
  tasks:       ['tasks', 'task-tree', 'agents', 'needs-you', 'today'],
  reports:     ['reports', 'task-reports'],
  approvals:   ['approvals', 'needs-you', 'today'],
  sequences:   ['sequences'],
  leads:       ['leads', 'pipeline', 'today'],
  lead_events: ['lead-events', 'leads', 'today'],
  run_steps:   ['activity'],
};

export function useWorkspaceRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const flush = () => { pending.forEach(k => qc.invalidateQueries({ queryKey: [k] })); pending.clear(); };
    const channel = supabase.channel(`ws:${WORKSPACE_ID}`);
    for (const table of Object.keys(TABLE_TO_QUERIES)) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `workspace_id=eq.${WORKSPACE_ID}` },
        () => { TABLE_TO_QUERIES[table].forEach(k => pending.add(k)); clearTimeout(timer); timer = setTimeout(flush, 250); });
    }
    channel.subscribe();
    const poll = setInterval(() => Object.values(TABLE_TO_QUERIES).flat().forEach(k => qc.invalidateQueries({ queryKey: [k] })), 15_000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); clearTimeout(timer); };
  }, [qc]);
}
```

Rules:
- **Invalidate, don't patch.** 250 ms debounce collapses bursts (a run writes 5 rows at once).
- **15 s poll fallback** so a dropped socket never leaves the projector stale.
- `workspaces` filter is `id=eq.<ws>` not `workspace_id` — special-case it (or skip subscribing; it rarely changes).
- Realtime honours RLS: the anon key only receives rows of `is_demo` workspaces. Private tables never stream.
- Show a tiny "live" dot bound to `channel.state === 'joined'`; grey when reconnecting. No toasts for
  changes already visible on screen (Paperclip rule). A small highlight/pulse on the changed card is enough.
- Activity feed can append without refetch if you want it snappier (the payload is safe, agent name is not in it):
  ```ts
  channel.on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'run_steps', filter: `workspace_id=eq.${WORKSPACE_ID}` },
    ({ new: s }) => {            // s: { id, run_id, workspace_id, seq, kind, name, summary, ok, credits_used, duration_ms, created_at }
      pending.add('activity'); clearTimeout(timer); timer = setTimeout(flush, 250); // simplest: refetch portal_activity
    });
  ```
  Refetching `qActivity()` is the recommended path (it brings agent/task labels). A run writes several steps in a burst; the debounce handles it.
- Add per-row animation: key rows by `id`, animate on `updated_at` change (agents/tasks) or on new `id` (events/reports).

## 5. Link-out rules (the only "actions" in the portal)

```ts
// lib/links.ts
export const slackThread = (channel: string | null, ts: string | null) =>
  channel && ts ? `https://slack.com/archives/${channel}/p${ts.replace('.', '')}` : null;
export const slackChannel = (channel: string | null) => channel ? `https://slack.com/archives/${channel}` : null;

const G8 = process.env.NEXT_PUBLIC_G8_APP_URL ?? 'https://app.graph8.com';
// Verified on real records (27 Sep, live org). Meetings have no per-record page: use the bookings list.
export const g8Contact  = (id: string | number | null) => id ? `${G8}/contacts/${id}` : null;
export const g8Deal     = (id: string | number | null) => id ? `${G8}/deals/${id}` : null;
export const g8Sequence = (id: string | null) => id ? `${G8}/sequencer/sequence/${id}` : null;   // NOT /sequences, NOT /sequencer/{id}
export const g8Meeting  = (id: string | null) => id ? `${G8}/appointments?tab=bookings` : null;
export const g8Deals    = () => `${G8}/deals/pipeline`;
export const g8Settings = () => `${G8}/studio/settings`;
```
Record patterns are verified; no placeholders left.

| Object | Link label | Source columns | Hide when |
|---|---|---|---|
| task | **Open in Slack** | `tasks.slack_channel`, `tasks.slack_thread_ts` | either null |
| approval | **Open in Slack** (button says "Decide in Slack") | `approvals.slack_channel`, `approvals.slack_ts` | either null |
| report | **Open in Slack** | `reports.slack_channel`, `reports.slack_thread_ts ?? reports.slack_ts` | null |
| lead | **Open in graph8** | `leads.g8_contact_id` | null |
| lead with deal | **Open deal in graph8** | `leads.g8_deal_id` | null |
| sequence | **Open in graph8** | `sequences.g8_sequence_id` | null |
| org chart header | **Open #sales-hq** | `workspaces.slack_channel_hq` | null |

All links open in a new tab. Never render a disabled link; hide it.

## 6. SQL snippets (OBSOLETE since 12:00 — do not run)

> The demo workspace now holds **live data** from the real server (fake seed wiped). Do **not** run these snippets
> or `supabase/seed.sql` against it: that would overwrite the live run. To see things move, watch Slack: every
> agent action writes to Supabase within ~1 s. Kept below only as a reference for the row shapes.

### Original snippets (reference only)

```sql
-- Bilal starts working on T-10 (card should pulse green, current task appears)
update tasks set status = 'in_progress' where number = 10 and workspace_id = 'a0000000-0000-4000-8000-000000000001';
update agents set status = 'working', current_task_id = (select id from tasks where number = 10 and workspace_id = 'a0000000-0000-4000-8000-000000000001')
 where name = 'Bilal' and workspace_id = 'a0000000-0000-4000-8000-000000000001';

-- Bilal reports up and finishes (report stream + task tree + today strip change)
insert into reports (workspace_id, from_agent_id, to_agent_id, task_id, kind, title, body)
values ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
        (select id from tasks where number = 10 and workspace_id = 'a0000000-0000-4000-8000-000000000001'),
        'handoff', 'Found 10 UK fintech CFOs', '4 hiring finance roles, 2 raised recently.');
update tasks set status = 'done', result_summary = '10 found, 6 strong.' where number = 10 and workspace_id = 'a0000000-0000-4000-8000-000000000001';
update agents set status = 'idle', current_task_id = null where name = 'Bilal' and workspace_id = 'a0000000-0000-4000-8000-000000000001';

-- Founder approves in Slack (needs-you banner clears, T-7 unblocks, Ayesha's badge clears)
update approvals set status = 'approved', decided_at = now(), decided_by_slack_user = 'U0DEMO0001' where id = 'd0000000-0000-4000-8000-000000000002';
update tasks set status = 'in_progress' where id = '70000000-0000-4000-8000-000000000007';
update agents set status = 'working' where id = 'a1000000-0000-4000-8000-000000000001';

-- A lead moves: meeting booked for Sara (pipeline strip + timeline)
insert into lead_events (workspace_id, lead_id, agent_id, type, channel, direction, summary, data)
values ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005',
        'meeting_booked', 'system', 'internal', 'Discovery call booked for Tue 15:00', '{"g8_meeting_id":"mt_demo_001"}');
update leads set stage = 'meeting', meeting_at = now() + interval '2 days', g8_meeting_id = 'mt_demo_001' where id = 'b0000000-0000-4000-8000-000000000001';

-- Spend credits (budget bar moves; limits are huge on purpose, so use a big number to see auto-pause)
insert into credit_events (workspace_id, agent_id, action, credits)
values ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'enrich_person', 40000);
-- LLM cost row (also counts toward budget; source distinguishes it)
insert into credit_events (workspace_id, agent_id, source, action, credits, input_tokens, output_tokens)
values ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'llm', 'llm_run', 9, 8200, 700);
-- Auto-pause: push Hira past 100,000 (agent turns Paused · over budget, global banner appears)
insert into credit_events (workspace_id, agent_id, action, credits)
values ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'adjustment', 100000);

-- Reset everything: re-run supabase/seed.sql
```

## 7. Formatting helpers (one place, `lib/format.ts`)

- Task id: `T-${number}`; monospace.
- Credits: integer with thousands separator; `spent / budget` and a percent; ≥ `budget_warn_pct` → warning colour; ≥ 100 % → over-budget colour.
  Budgets are huge for the demo (100,000/agent), so show the bar as a thin line and the numbers as text; the bar matters when paused.
- Ledger rows: `source` chip — `graph8` "graph8 credits", `llm` "LLM" (show `input_tokens + output_tokens` small, mono), `manual` "adjustment".
- Money: `deal_amount` string → `Number` → `$12,000` (no decimals unless < 1000).
- Times: relative ("3 min ago") for anything < 24 h, else `Sat 14:05`; render in the browser's local time (demo and founder are both in Asia/Karachi).
- Percent of budget: `Math.min(100, round(spent / budget * 100))`.
- Names: agent by `agentsById[id]?.name ?? 'Team'`; `to_agent_id === null` → "you" (the founder).
