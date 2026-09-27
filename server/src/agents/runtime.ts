/**
 * runtime — task lifecycle + dispatch to AgentBrains (docs/SCHEMA.md §4).
 *
 *  - One run at a time per agent (promise chain per agent id); different agents run in parallel.
 *  - Each run = agent_runs row; task checkout lock; agents.status working → idle | waiting_on_you | error.
 *  - ctx.delegate() creates a child task AND blocks the current task on it (blocked_on='task'). When the child
 *    finishes (done/failed/cancelled) the parent is woken (trigger 'delegation') with
 *    `task.output.last_child = { id, number, kind, status, result_summary, output }`.
 *    For fire-and-forget work with no parent, call runtime.enqueue() directly.
 *  - ctx.requestApproval() blocks the task on the approval and sets the agent to waiting_on_you.
 *    Slack buttons (bus 'slack.action' approval.approve|edit|skip, value = approval id) route to brain.onApproval.
 *    'edit' waits for the founder's next reply in the approval card's thread; that text is the note.
 *    A brain without onApproval: approved → run() again; rejected → task cancelled.
 *  - graph8 events → Zara (replies/meetings/calls) or Usman (sends/bounces/sequence) onEvent, then layer inbound handlers.
 *  - Slack is attached at boot (attachSlack) — runtime never imports Slack statically.
 */
import type {
  AgentBrain, Block, BusEvents, Runtime, RunCtx, SlackCtx, SlackPort,
} from '../contracts';
import { NotAllowlisted } from '../contracts';
import type {
  AgentRole, ApprovalRow, JsonObject, ReportKind, RunTrigger, TaskRow, UUID,
} from '../../../shared/types';
import { bus } from '../lib/bus';
import { env } from '../lib/env';
import { log as rootLog, redact } from '../lib/log';
import { BudgetExceeded, must, runScope, store, type RunScope } from '../lib/store';
import { layers } from '../layers';

const log = rootLog.child('runtime');
const db = store.db;

const brains = new Map<AgentRole, AgentBrain>();
const queues = new Map<UUID, Promise<unknown>>();
let slack: SlackPort | null = null;

/**
 * BUILD-PLAN §9: when the served workspace is not the demo (is_demo=false) every Slack post is marked "[test] ".
 * The port object is patched IN PLACE, so brains that import `slack` directly get the marker too. Idempotent.
 */
export const TEST_PREFIX = '[test] ';
export function withTestPrefix(port: SlackPort, isTest: () => Promise<boolean>): SlackPort {
  const p = port as SlackPort & { __testPrefixed?: boolean };
  if (p.__testPrefixed) return port;
  p.__testPrefixed = true;
  const pre = (t: string) => (t.startsWith(TEST_PREFIX) ? t : TEST_PREFIX + t);
  const marker: Block = { type: 'context', elements: [{ type: 'mrkdwn', text: '🧪 *[test]* test workspace, not the live demo' }] };
  const mark = (blocks?: Block[]) =>
    blocks && !blocks.some((b) => b === marker || (b as any).block_id === 'graphi_test_marker') ? [{ ...marker, block_id: 'graphi_test_marker' }, ...blocks] : blocks;
  const { postAs, update, checklist, agentThread, approvalCard, dm } = port;
  p.postAs = async (role, channel, msg) => (await isTest()) ? postAs(role, channel, { ...msg, text: pre(msg.text), blocks: mark(msg.blocks) }) : postAs(role, channel, msg);
  p.update = async (channel, ts, msg) => (await isTest()) ? update(channel, ts, { ...msg, text: pre(msg.text), blocks: mark(msg.blocks) }) : update(channel, ts, msg);
  p.dm = async (userId, msg) => (await isTest()) ? dm(userId, { ...msg, text: pre(msg.text), blocks: mark(msg.blocks) }) : dm(userId, msg);
  p.agentThread = async (role, title) => agentThread(role, (await isTest()) ? pre(title) : title);
  p.approvalCard = async (role, a) => approvalCard(role, (await isTest()) ? { ...a, title: pre(a.title) } : a);
  p.checklist = async (role, channel, title, items, threadTs) => {
    const test = await isTest();
    const c = await checklist(role, channel, test ? pre(title) : title, items, threadTs);
    if (test) { const t = c.title.bind(c); c.title = (x) => t(pre(x)); }
    return c;
  };
  return port;
}

export function attachSlack(port: SlackPort) {
  let cached: Promise<boolean> | null = null;
  const isTest = () => (cached ??= store.workspace(env.WORKSPACE_ID).then((w) => !w.is_demo).catch(() => false));
  slack = withTestPrefix(port, isTest);
}

/** Chain work onto the agent's queue so runs of one agent never overlap. */
function serial<T>(agentId: UUID, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(agentId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(agentId, next.catch(() => undefined));
  return next;
}

const clip = (s: string, n = 500) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const errText = (err: unknown) => clip(redact(String((err as Error)?.message ?? err)), 400);

async function getTask(id: UUID): Promise<TaskRow> {
  return must(await db.from('tasks').select('*').eq('id', id).single(), `task ${id}`) as TaskRow;
}
async function patchTask(id: UUID, patch: Partial<TaskRow>) {
  must(await db.from('tasks').update(patch).eq('id', id), `task update ${id}`);
}
async function roleOf(agentId: UUID): Promise<AgentRole> {
  return (await store.agent(agentId)).role;
}

/** idle | waiting_on_you depending on pending approvals; never overrides a budget/manual pause. */
async function settleAgent(agentId: UUID, status?: 'error') {
  const a = await store.agent(agentId);
  if (a.status === 'paused') return;
  let next: 'idle' | 'waiting_on_you' | 'error' = status ?? 'idle';
  let currentTask: UUID | null = null;
  if (!status) {
    const r = await db.from('approvals').select('id,task_id').eq('requested_by_agent_id', agentId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
    if (r.data?.length) { next = 'waiting_on_you'; currentTask = r.data[0].task_id; }
  }
  await db.from('agents').update({ status: next, current_task_id: currentTask, last_active_at: new Date().toISOString() }).eq('id', agentId);
}

// ---------------------------------------------------------------------------------------------- run context
interface RunState { runId: UUID; seq: number; tools: number; threadP?: Promise<{ ts: string; channel: string }> }

async function makeCtx(workspaceId: UUID, agentId: UUID, role: AgentRole, task: TaskRow | undefined, st: RunState): Promise<RunCtx> {
  const settings = await store.settings(workspaceId);
  const clog = log.child(`${role}${task ? `:T-${task.number}` : ''}`);

  const ctx: RunCtx = {
    workspaceId, agentId, role, settings, log: clog,
    task: task as TaskRow,
    runId: st.runId,

    async step(kind, name, summary, data) {
      st.seq += 1;
      if (kind === 'tool') st.tools += 1;
      const r = await db.from('run_steps').insert({
        run_id: st.runId, workspace_id: workspaceId, seq: st.seq, kind, name: clip(name, 120),
        args: data ?? null, result: { summary: clip(redact(summary)) }, ok: true,
      });
      if (r.error) clog.warn('run_steps insert failed', { err: r.error.message });
    },

    async report(kind: ReportKind, title, body, data) {
      let to: UUID | null = null;
      if (kind === 'handoff' && task?.parent_task_id) {
        const p = await db.from('tasks').select('assignee_agent_id').eq('id', task.parent_task_id).single();
        to = p.data?.assignee_agent_id ?? null;
      }
      const cur = task ? await getTask(task.id) : undefined;
      must(await db.from('reports').insert({
        workspace_id: workspaceId, from_agent_id: agentId, to_agent_id: to, task_id: task?.id ?? null, run_id: st.runId,
        kind, title: clip(redact(title), 200), body: redact(body), data: data ?? {},
        slack_channel: cur?.slack_channel ?? null, slack_thread_ts: cur?.slack_thread_ts ?? null,
      }), 'reports insert');
    },

    async delegate(to, kind, title, input, opts) {
      const parentId = opts?.parentTaskId ?? task?.id;
      const child = await createTask(workspaceId, to, kind, title, input, { parentTaskId: parentId, priority: opts?.priority, createdBy: agentId });
      if (task && parentId === task.id) {
        await patchTask(task.id, { status: 'blocked', blocked_on: 'task', blocked_by_task_id: child.id, blocked_reason: clip(`Waiting on T-${child.number}: ${title}`, 200) });
      }
      schedule(child, 'delegation', task ? `T-${task.number}` : null);
      return child;
    },

    async requestApproval(kind, title, payload, blocks: Block[], approveLabel) {
      const a = must(await db.from('approvals').insert({
        workspace_id: workspaceId, requested_by_agent_id: agentId, task_id: task?.id ?? null,
        sequence_id: task?.sequence_id ?? null, lead_id: task?.lead_id ?? null,
        kind, title: clip(redact(title), 200), payload, status: 'pending',
      }).select('*').single(), 'approvals insert') as ApprovalRow;
      if (slack) {
        try {
          const m = await slack.approvalCard(role, { approvalId: a.id, title, blocks, approveLabel });
          await db.from('approvals').update({ slack_channel: m.channel, slack_ts: m.ts }).eq('id', a.id);
          a.slack_channel = m.channel; a.slack_ts = m.ts;
        } catch (err) { clog.error('approval card failed', { err: errText(err) }); }
      } else clog.warn('slack not attached; approval card not posted', { approvalId: a.id });
      if (task) await patchTask(task.id, { status: 'blocked', blocked_on: 'approval', approval_id: a.id, blocked_reason: clip(`Waiting for your decision: ${redact(title)}`, 200) });
      await db.from('agents').update({ status: 'waiting_on_you', current_task_id: task?.id ?? null }).eq('id', agentId);
      return a;
    },

    thread() {
      st.threadP ??= (async () => {
        if (task) {
          const cur = await getTask(task.id);
          if (cur.slack_thread_ts && cur.slack_channel) return { ts: cur.slack_thread_ts, channel: cur.slack_channel };
        }
        if (!slack) return { ts: '', channel: '' };
        const t = await slack.agentThread(role, task ? `T-${task.number} · ${task.title}` : 'Update');
        if (task) await patchTask(task.id, { slack_channel: t.channel, slack_thread_ts: t.ts });
        return t;
      })();
      return st.threadP;
    },
  };
  return ctx;
}

// ---------------------------------------------------------------------------------------------- tasks
async function createTask(
  workspaceId: UUID, to: AgentRole, kind: TaskRow['kind'], title: string, input: JsonObject,
  opts: { parentTaskId?: UUID; priority?: 0 | 1 | 2 | 3; createdBy?: UUID; slack?: SlackCtx } = {},
): Promise<TaskRow> {
  const agent = await store.agentByRole(workspaceId, to);
  const t = must(await db.from('tasks').insert({
    workspace_id: workspaceId, kind, title: clip(redact(title), 200), assignee_agent_id: agent.id,
    created_by_agent_id: opts.createdBy ?? null, parent_task_id: opts.parentTaskId ?? null,
    priority: opts.priority ?? 2, status: 'todo',
    input: opts.slack ? { ...input, _slack: opts.slack as unknown as JsonObject } : input,
  }).select('*').single(), 'tasks insert') as TaskRow;
  log.info(`T-${t.number} ${kind} → ${agent.name}`);
  return t;
}

function schedule(task: TaskRow, trigger: RunTrigger, triggerRef: string | null) {
  void serial(task.assignee_agent_id!, () => runTask(task.id, trigger, triggerRef)).catch((err) =>
    log.error(`T-${task.number} crashed outside run handling`, { err: errText(err) }));
}

/** Shared run wrapper: agent_runs row, ALS scope, status bookkeeping. `body` does the brain call. */
async function withRun(
  workspaceId: UUID, agentId: UUID, taskId: UUID | null, trigger: RunTrigger, triggerRef: string | null,
  body: (st: RunState) => Promise<string | void>,
): Promise<{ ok: boolean; summary?: string; err?: unknown }> {
  const run = must(await db.from('agent_runs').insert({
    workspace_id: workspaceId, agent_id: agentId, task_id: taskId, trigger, trigger_ref: triggerRef,
    status: 'running', model: env.GEMINI_MODEL,
  }).select('id').single(), 'agent_runs insert') as { id: UUID };
  const st: RunState = { runId: run.id, seq: 0, tools: 0 };
  const scope: RunScope = { runId: run.id, taskId: taskId ?? undefined, inputTokens: 0, outputTokens: 0 };
  await db.from('agents').update({ status: 'working', current_task_id: taskId, last_active_at: new Date().toISOString() }).eq('id', agentId);
  let res: { ok: boolean; summary?: string; err?: unknown };
  try {
    const summary = await runScope.run(scope, () => body(st));
    res = { ok: true, summary: summary ? clip(redact(summary)) : undefined };
  } catch (err) {
    res = { ok: false, err };
  }
  await db.from('agent_runs').update({
    status: res.ok ? 'succeeded' : 'failed', summary: res.summary ?? null, error: res.ok ? null : errText(res.err),
    input_tokens: scope.inputTokens, output_tokens: scope.outputTokens, tool_call_count: st.tools,
    finished_at: new Date().toISOString(),
  }).eq('id', run.id);
  return res;
}

async function runTask(taskId: UUID, trigger: RunTrigger, triggerRef: string | null, invoke?: (ctx: RunCtx, brain: AgentBrain) => Promise<string | void>) {
  let task = await getTask(taskId);
  if (['done', 'failed', 'cancelled'].includes(task.status)) return;
  const agentId = task.assignee_agent_id!;
  const agent = await store.agent(agentId);
  const brain = brains.get(agent.role);
  if (!brain) { log.warn(`T-${task.number}: no brain registered for ${agent.role}; leaving todo`); return; }
  if (agent.status === 'paused') {
    if (agent.pause_reason === 'budget') {
      await patchTask(taskId, { status: 'blocked', blocked_on: 'budget', blocked_reason: `${agent.name} reached today's budget` });
    } else log.warn(`T-${task.number}: ${agent.name} is paused (${agent.pause_reason}); leaving task`);
    return;
  }

  const res = await withRun(task.workspace_id, agentId, taskId, trigger, triggerRef, async (st) => {
    const staleIso = new Date(Date.now() - 10 * 60_000).toISOString();
    const locked = await db.from('tasks').update({
      status: 'in_progress', locked_by_run_id: st.runId, locked_at: new Date().toISOString(), attempt_count: task.attempt_count + 1,
    }).eq('id', taskId).or(`locked_by_run_id.is.null,locked_at.lt.${staleIso}`).select('*');
    if (locked.error) throw new Error(`task lock: ${locked.error.message}`);
    if (!locked.data?.length) throw new Error(`T-${task.number} is locked by another run`);
    task = locked.data[0] as TaskRow;
    const ctx = await makeCtx(task.workspace_id, agentId, agent.role, task, st);
    return invoke ? invoke(ctx, brain) : brain.run(ctx);
  });

  const after = await getTask(taskId);
  if (res.ok) {
    if (after.status === 'in_progress') {
      await patchTask(taskId, { status: 'done', result_summary: res.summary ?? after.result_summary, locked_by_run_id: null, locked_at: null });
    } else {
      await patchTask(taskId, { locked_by_run_id: null, locked_at: null });
    }
    await settleAgent(agentId);
  } else if (res.err instanceof BudgetExceeded) {
    await patchTask(taskId, { status: 'blocked', blocked_on: 'budget', blocked_reason: `${agent.name} reached today's budget`, locked_by_run_id: null, locked_at: null });
    log.warn(`T-${task.number} blocked on budget`);
  } else {
    const msg = res.err instanceof NotAllowlisted ? `Stopped by the test-contact guard: ${errText(res.err)}` : errText(res.err);
    await patchTask(taskId, { status: 'failed', result_summary: msg, locked_by_run_id: null, locked_at: null });
    log.error(`T-${task.number} failed`, { err: msg });
    await settleAgent(agentId, 'error');
    await db.from('reports').insert({
      workspace_id: task.workspace_id, from_agent_id: agentId, task_id: taskId, kind: 'alert',
      title: clip(`T-${task.number} failed: ${task.title}`, 200), body: msg, data: {},
      slack_channel: after.slack_channel, slack_thread_ts: after.slack_thread_ts,
    });
    if (slack && after.slack_thread_ts && after.slack_channel) {
      slack.postAs(agent.role, after.slack_channel, { text: `⚠️ I hit a problem and stopped: ${msg}`, threadTs: after.slack_thread_ts })
        .catch((err) => log.warn('failure post failed', { err: errText(err) }));
    }
  }
  await wakeParent(taskId);
}

/** Child finished → wake the parent that is blocked on it. */
async function wakeParent(childId: UUID) {
  const child = await getTask(childId);
  if (!['done', 'failed', 'cancelled'].includes(child.status) || !child.parent_task_id) return;
  const parent = await getTask(child.parent_task_id);
  if (parent.status !== 'blocked' || parent.blocked_on !== 'task' || parent.blocked_by_task_id !== child.id) return;
  const output = {
    ...(parent.output ?? {}),
    last_child: { id: child.id, number: child.number, kind: child.kind, status: child.status, result_summary: child.result_summary, output: child.output },
  };
  await patchTask(parent.id, { status: 'todo', output });
  schedule(parent, 'delegation', `T-${child.number}`);
}

// ---------------------------------------------------------------------------------------------- approvals
async function decide(approvalId: UUID, decision: 'approved' | 'rejected' | 'edit', sctx: SlackCtx, note?: string) {
  // edit is two-phase: button click → edit_requested; founder's thread reply → note recorded, brain called.
  const isNote = decision === 'edit' && note !== undefined;
  let q = db.from('approvals').update({
    status: decision === 'edit' ? 'edit_requested' : decision,
    decided_by_slack_user: sctx.userId, decided_at: new Date().toISOString(),
    ...(isNote ? { decision_note: clip(note!, 2000) } : {}),
  }).eq('id', approvalId);
  q = isNote ? q.eq('status', 'edit_requested').is('decision_note', null) : q.eq('status', 'pending');
  const upd = await q.select('*');
  if (upd.error) throw new Error(`approval update: ${upd.error.message}`);
  const a = upd.data?.[0] as ApprovalRow | undefined;
  if (!a) { log.info(`approval ${approvalId} already decided; ignoring ${decision}`); return; }
  if (decision === 'edit' && note === undefined) {
    log.info(`approval ${approvalId}: edit requested, waiting for the founder's note in the thread`);
    return; // wait for the thread reply
  }
  const role = await roleOf(a.requested_by_agent_id);
  const brain = brains.get(role);
  if (!brain) { log.warn(`approval ${approvalId}: no brain for ${role}`); return; }

  if (!a.task_id) {
    await serial(a.requested_by_agent_id, async () => {
      const res = await withRun(a.workspace_id, a.requested_by_agent_id, null, 'approval', a.id, async (st) => {
        const ctx = await makeCtx(a.workspace_id, a.requested_by_agent_id, role, undefined, st);
        await brain.onApproval?.(ctx, a, decision, note);
      });
      if (!res.ok) log.error(`approval ${a.id} handler failed`, { err: errText(res.err) });
      await settleAgent(a.requested_by_agent_id, res.ok ? undefined : 'error');
    });
    return;
  }

  const task = await getTask(a.task_id);
  if (!brain.onApproval && decision === 'rejected') {
    await patchTask(task.id, { status: 'cancelled', result_summary: 'Skipped by the founder' });
    await settleAgent(a.requested_by_agent_id);
    await wakeParent(task.id);
    return;
  }
  if (task.status === 'blocked') await patchTask(task.id, { status: 'todo' });
  await serial(a.requested_by_agent_id, () =>
    runTask(task.id, 'approval', a.id, brain.onApproval
      ? async (ctx, b) => {
          await b.onApproval!(ctx, a, decision, note);
          const cur = await getTask(task.id);
          if (cur.status === 'in_progress' && decision === 'rejected') {
            await patchTask(task.id, { status: 'cancelled', result_summary: 'Skipped by the founder' });
          }
        }
      : undefined));
}

async function onSlackAction(e: BusEvents['slack.action']) {
  const m = /^approval\.(approve|edit|skip)$/.exec(e.actionId);
  if (!m || !e.value) return;
  const decision = m[1] === 'approve' ? 'approved' : m[1] === 'skip' ? 'rejected' : 'edit';
  await decide(e.value, decision, e.ctx);
}

async function onSlackMessage(e: BusEvents['slack.message']) {
  if (e.kind !== 'thread_reply' || !e.ctx.threadTs) return;
  const r = await db.from('approvals').select('id').eq('status', 'edit_requested').is('decision_note', null).eq('slack_ts', e.ctx.threadTs).eq('slack_channel', e.ctx.channel).limit(1);
  const id = r.data?.[0]?.id;
  if (id) await decide(id, 'edit', e.ctx, e.text);
}

// ---------------------------------------------------------------------------------------------- graph8 events
const ZARA_EVENTS = /repl(y|ied)|meeting\.|voice_ai\.|voice\.|call_|booking|inbox|unsubscri|opt_?out|opted_out/i;
const USMAN_EVENTS = /_sent$|bounced|opened|clicked|skipped|sequence\./i;

async function onGraph8Event(e: BusEvents['graph8.event']) {
  const role: AgentRole | null = ZARA_EVENTS.test(e.type) ? 'closer' : USMAN_EVENTS.test(e.type) ? 'sdr' : null;
  let handled = false;
  const errors: string[] = [];
  const brain = role ? brains.get(role) : undefined;
  if (role && brain?.onEvent) {
    const agent = await store.agentByRole(e.workspaceId, role);
    handled = true;
    await serial(agent.id, async () => {
      const res = await withRun(e.workspaceId, agent.id, null, 'webhook', String(e.inboundEventId), async (st) => {
        const ctx = await makeCtx(e.workspaceId, agent.id, role, undefined, st);
        const { task: _t, runId: _r, ...rest } = ctx;
        await brain.onEvent!(rest, e.type, e.payload);
      });
      if (!res.ok) errors.push(`${role}: ${errText(res.err)}`);
      await settleAgent(agent.id, res.ok ? undefined : 'error');
    });
  }
  for (const l of layers.all()) {
    const h = l.inbound?.[e.type];
    if (!h) continue;
    handled = true;
    try { await h(e); } catch (err) { errors.push(`layer ${l.name}: ${errText(err)}`); log.error(`layer ${l.name} inbound ${e.type} failed`, { err: errText(err) }); }
  }
  await db.from('inbound_events').update({
    status: errors.length ? 'failed' : handled ? 'processed' : 'ignored',
    error: errors.length ? clip(errors.join(' | '), 1000) : null, processed_at: new Date().toISOString(),
  }).eq('id', e.inboundEventId);
}

// ---------------------------------------------------------------------------------------------- public
export const runtime: Runtime = {
  register(brain) {
    brains.set(brain.role, brain);
    log.info(`brain registered: ${brain.role}`);
  },

  async enqueue(workspaceId, to, kind, title, input, opts) {
    const t = await createTask(workspaceId, to, kind, title, input, { parentTaskId: opts?.parentTaskId, priority: opts?.priority, slack: opts?.slack });
    schedule(t, opts?.slack ? 'slack_message' : 'system', opts?.slack?.messageTs ?? null);
    return t;
  },

  async start() {
    bus.on('slack.action', onSlackAction);
    bus.on('slack.message', onSlackMessage);
    bus.on('graph8.event', onGraph8Event);
    bus.on('cron.tick', async ({ name }) => {
      if (name !== 'budget_reset') return;
      const r = await db.rpc('reset_daily_spend', { ws: env.WORKSPACE_ID });
      if (r.error) log.error('reset_daily_spend failed', { err: r.error.message });
      else log.info('daily budgets reset');
    });

    // Recover: runs cut by a restart are failed (never auto-retried: they may have sent), fresh todos resume.
    // Only STALE work is reclaimed (lock/run older than LOCK_TTL): another live instance on the same workspace
    // (laptop spare, a teammate's worker) holds fresh locks and must not have its tasks failed under it.
    const ws = env.WORKSPACE_ID;
    const LOCK_TTL_MS = 10 * 60_000;
    const staleIso = new Date(Date.now() - LOCK_TTL_MS).toISOString();
    const stuck = await db.from('tasks').select('id,number').eq('workspace_id', ws).eq('status', 'in_progress')
      .or(`locked_at.is.null,locked_at.lt.${staleIso}`);
    for (const t of stuck.data ?? []) {
      await patchTask(t.id, { status: 'failed', result_summary: 'Interrupted by a server restart', locked_by_run_id: null, locked_at: null });
      await wakeParent(t.id);
    }
    await db.from('agent_runs').update({ status: 'failed', error: 'server restart', finished_at: new Date().toISOString() })
      .eq('workspace_id', ws).eq('status', 'running').lt('started_at', staleIso);
    // Resume only todos no live instance picked up (older than 2 min, younger than 1 h).
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const until = new Date(Date.now() - 2 * 60_000).toISOString();
    const todo = await db.from('tasks').select('*').eq('workspace_id', ws).eq('status', 'todo').gte('created_at', since).lt('created_at', until).order('priority').order('created_at');
    for (const t of (todo.data ?? []) as TaskRow[]) if (t.assignee_agent_id) schedule(t, 'system', 'restart');
    log.info(`runtime started: ${brains.size} brains, ${stuck.data?.length ?? 0} interrupted, ${todo.data?.length ?? 0} resumed`);
  },
};
