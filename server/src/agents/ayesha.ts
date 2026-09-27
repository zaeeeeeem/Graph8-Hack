/**
 * Ayesha — Head of Sales (docs/agents/01-ayesha.md). Fixed playbooks, Gemini inside steps (D3).
 *   P1 onboard      /hire-sales <domain>         → agents/ayesha/onboarding.ts
 *   P2 daily run    [Start] on plan card, 09:00  → delegate Bilal find_prospects (handoffs carry it on)
 *   P3 chat         DM / @mention / thread reply → agents/ayesha/chat.ts
 *   P4 standup      /sales-standup, 09:00 cron   → agents/ayesha/standup.ts
 * Bus wiring (Slack commands, buttons, messages, cron, graph8 intelligence events) lives in `wireAyesha()`.
 */
import type { AgentBrain, BusEvents, RunCtx } from '../contracts';
import type { AgentRole, ApprovalRow, JsonObject, ReportKind, UUID } from '../../../shared/types';
import { bus } from '../lib/bus';
import { env } from '../lib/env';
import { log as rootLog } from '../lib/log';
import { slack } from '../lib/slack';
import { store } from '../lib/store';
import { runtime } from './runtime';
import { G8_LINKS } from './ayesha/kit';
import { runChat } from './ayesha/chat';
import { analysisStatus, runOnboarding } from './ayesha/onboarding';
import { runStandup } from './ayesha/standup';
import { errMsg, normDomain, scrubPii } from './ayesha/util';
import { PLAN_START_ACTIONS, planCard } from '../slack/cards/plan';
import { alertCard, winCard } from '../slack/cards/standup';

const ROLE = 'head_of_sales' as const;

// ---------------------------------------------------------------------------
// P2 — daily run: Ayesha only kicks off Bilal; Bilal→Hira→Usman handoffs and Usman's launch approval follow.
// ---------------------------------------------------------------------------
export async function runDailyRun(ctx: RunCtx): Promise<string> {
  const s = ctx.settings;
  const { data: scout } = await store.db.from('agents').select('status').eq('workspace_id', ctx.workspaceId).eq('role', 'scout').maybeSingle();
  const input = ctx.task.input as { planTs?: string; planChannel?: string; trigger?: string };
  const threadTs = input.planTs;
  const channel = input.planChannel ?? 'hq';
  if (scout?.status === 'paused') {
    await slack.postAs(ROLE, channel, { text: 'Team is paused, skipping today\'s run. Say "resume" to restart.', threadTs });
    return 'Skipped: team paused';
  }
  const n = s.daily_find ?? 10;
  const t = await ctx.delegate('scout', 'find_prospects', `Find ${n} prospects: ${s.target_persona ?? 'target persona'}`, {
    count: n, research_count: s.daily_research ?? 5, target_persona: s.target_persona ?? null, target_icp: s.target_icp ?? null,
    geo: s.geo ?? [], trigger: input.trigger ?? 'plan_start',
  }, { parentTaskId: ctx.task.id, priority: 1 });
  await ctx.step('tool', 'delegate_task', `Bilal: find ${n} prospects`, { taskId: t.id });
  await slack.postAs(ROLE, channel, { text: `Shabash team 💪 Bilal is finding ${n} prospects (T-${t.number}). Follow along in #sales-team.`, threadTs }).catch(() => undefined);
  await ctx.report('update', 'Daily run started', `Bilal is finding ${n} prospects; research, sequence and your launch call follow.`, { find: n, child_task_id: t.id });
  return `Daily run started: T-${t.number}`;
}

async function runStandupTask(ctx: RunCtx): Promise<string> {
  const summary = await runStandup(ctx);
  // D11: after the 09:00 standup, start the daily run.
  if ((ctx.task.input as { daily_run?: boolean }).daily_run) {
    const ws = await store.workspace(ctx.workspaceId);
    if (ws.status === 'active') await runDailyRun(ctx).catch((e) => ctx.log.warn('daily run failed', { err: errMsg(e) }));
  }
  return summary;
}

interface ChildResult { id: UUID; number: number; kind: string; status: string; result_summary: string | null }

/** Wake-up after a delegated chain finished: close the loop where the founder asked (plan card thread / chat thread). */
export async function onChildDone(ctx: RunCtx, c: ChildResult): Promise<string> {
  const input = ctx.task.input as { channel?: string; threadTs?: string | null; planChannel?: string; planTs?: string | null };
  const channel = input.channel ?? input.planChannel ?? 'hq';
  const threadTs = input.threadTs ?? input.planTs ?? undefined;
  const summary = scrubPii(c.result_summary ?? '').slice(0, 300);
  const ok = c.status === 'done';
  const text = ok ? `✅ T-${c.number} done${summary ? `: ${summary}` : ''}` : `⚠️ T-${c.number} ${c.status}${summary ? `: ${summary}` : ''}`;
  await slack.postAs(ROLE, channel, { text, threadTs }).catch((e) => ctx.log.warn('wake post failed', { err: errMsg(e) }));
  await ctx.step('note', 'child_done', `T-${c.number} ${c.status}`);
  return text;
}

export const ayesha: AgentBrain = {
  role: ROLE,
  async run(ctx) {
    // ctx.delegate() blocks this task on the child; the runtime re-runs us when the child chain finishes.
    const last = (ctx.task.output as { last_child?: ChildResult } | null)?.last_child;
    if (last && ctx.task.kind !== 'onboard') return onChildDone(ctx, last);
    switch (ctx.task.kind) {
      case 'onboard': {
        const out = await runOnboarding(ctx);
        const pending = (await store.settings(ctx.workspaceId).catch(() => ctx.settings)).pending_analysis as { g8_task_id?: string } | null | undefined;
        if (pending?.g8_task_id) watchAnalysis(ctx.workspaceId, pending.g8_task_id);
        return out;
      }
      case 'plan': return runDailyRun(ctx);
      case 'standup': return runStandupTask(ctx);
      case 'answer_question':
      case 'custom': return runChat(ctx);
      default: throw new Error(`Ayesha has no playbook for task kind ${ctx.task.kind}`);
    }
  },
  async onApproval(ctx: RunCtx, approval: ApprovalRow, decision) {
    // Ayesha's only approvals are connect_account cards (link buttons); nothing to resume on decision.
    await ctx.step('note', 'approval', `${approval.kind} ${decision}`);
  },
  async onEvent(_ctx, type, payload) {
    if (isIntelligenceDone(type)) await resumeAfterAnalysis(_ctx.workspaceId, payload);
  },
};
export default ayesha;

// ---------------------------------------------------------------------------
// Wins / alerts from other agents' reports → #sales-hq (D9). Runtime's ctx.report should call this for win|alert.
// ---------------------------------------------------------------------------
export async function mirrorReport(r: { workspaceId: UUID; fromRole: AgentRole; fromName?: string; kind: ReportKind; title: string; body?: string | null; data?: JsonObject }): Promise<void> {
  if (r.fromRole === ROLE) return;
  const d = (r.data ?? {}) as Record<string, any>;
  try {
    if (r.kind === 'win') {
      const amount = Number(d.amount ?? d.deal_amount ?? d.est_amount ?? 0) || undefined;
      const url = (d.g8_url ?? d.url ?? d.deal_url) as string | undefined;
      await slack.postAs(ROLE, 'hq', winCard({ title: r.title, body: r.body ?? undefined, amount, url: url ?? G8_LINKS.deals }));
    } else if (r.kind === 'alert') {
      await slack.postAs(ROLE, 'hq', alertCard({ from: r.fromName ?? r.fromRole, title: r.title, body: r.body ?? undefined }));
    }
  } catch (e) { rootLog.warn('ayesha mirror failed', { err: errMsg(e) }); }
}

// ---------------------------------------------------------------------------
// L4 resume (D16): graph8 finished analysing the site → re-run onboarding.
// ---------------------------------------------------------------------------
const isIntelligenceDone = (t: string) => t === 'intelligence.completed' || t === 'company_intelligence.completed';
const resuming = new Set<string>();

export async function resumeAfterAnalysis(workspaceId: UUID, _payload: JsonObject): Promise<boolean> {
  if (resuming.has(workspaceId)) return false;
  resuming.add(workspaceId);
  try {
    const s = await store.settings(workspaceId);
    const pending = s.pending_analysis as { domain?: string; task_id?: string } | null | undefined;
    if (!pending?.domain) return false;
    await store.patchSettings(workspaceId, { pending_analysis: null });
    await runtime.enqueue(workspaceId, ROLE, 'onboard', `Hire sales team for ${pending.domain} (analysis done)`, { domain: pending.domain, resumed: true }, { parentTaskId: pending.task_id, priority: 0 });
    return true;
  } finally { resuming.delete(workspaceId); }
}

/** Webhook may never arrive (tunnel down): poll graph8 every minute for up to 45 min, then resume either way. */
export function watchAnalysis(workspaceId: UUID, g8TaskId: string, everyMs = 60_000, maxTries = 45): void {
  let tries = 0;
  const timer = setInterval(async () => {
    tries++;
    try {
      const st = await analysisStatus(g8TaskId);
      const done = ['completed', 'failed', 'error'].includes(st.status);
      if (!done && tries < maxTries) return;
      clearInterval(timer);
      await resumeAfterAnalysis(workspaceId, { g8_task_id: g8TaskId, status: st.status });
    } catch (e) {
      if (tries >= maxTries) { clearInterval(timer); await resumeAfterAnalysis(workspaceId, {}).catch(() => undefined); }
      rootLog.warn('analysis poll failed', { err: errMsg(e) });
    }
  }, everyMs);
  timer.unref?.();
}

// ---------------------------------------------------------------------------
// Bus wiring
// ---------------------------------------------------------------------------
const startedPlans = new Set<string>();

async function onCommand(e: BusEvents['slack.command']): Promise<void> {
  const cmd = e.command.replace(/^\//, '');
  const slackCtx = e.ctx;
  if (cmd === 'hire-sales') {
    const domain = normDomain(e.text);
    await runtime.enqueue(slackCtx.workspaceId, ROLE, 'onboard', `Hire sales team for ${domain || 'company'}`, { domain }, { priority: 0, slack: slackCtx });
  } else if (cmd === 'sales-standup') {
    await runtime.enqueue(slackCtx.workspaceId, ROLE, 'standup', 'Standup', { trigger: 'command' }, { priority: 1, slack: slackCtx });
  }
}

async function onAction(e: BusEvents['slack.action']): Promise<void> {
  if (!(PLAN_START_ACTIONS as readonly string[]).includes(e.actionId)) return;
  const key = `${e.ctx.workspaceId}:${e.value}`;
  if (startedPlans.has(key)) return;
  startedPlans.add(key);
  const ws = e.ctx.workspaceId;
  const s = await store.settings(ws);
  if (s.plan_started_task === e.value) return;
  await store.patchSettings(ws, { plan_started_task: e.value });
  if (e.ctx.messageTs) {
    // Flip the plan card to "started" (removes [Start]); best-effort from saved settings.
    const row = await store.workspace(ws).catch(() => null);
    const card = planCard({
      company: String(s.plan_company ?? row?.sales_brain?.company ?? row?.company_domain ?? 'your company'),
      target: s.target_persona ?? '', why: String(s.plan_why ?? ''),
      alternatives: Array.isArray(s.plan_alternatives) ? (s.plan_alternatives as string[]) : [],
      dailyFind: s.daily_find, dailyResearch: s.daily_research,
      channels: { email: s.channels?.email ?? true, phone: s.channels?.phone ?? false, linkedin: s.channels?.linkedin ?? false },
      extras: Array.isArray(s.plan_extras) ? (s.plan_extras as string[]) : [],
      credits: typeof s.plan_credits === 'number' ? s.plan_credits : undefined,
      standupHour: row?.standup_hour ?? 9, taskId: e.value, started: true,
    });
    await slack.update(e.ctx.channel, e.ctx.messageTs, card).catch(() => undefined);
  }
  await runtime.enqueue(ws, ROLE, 'plan', 'Daily run', { trigger: 'plan_start', planTs: e.ctx.messageTs ?? null, planChannel: e.ctx.channel }, { parentTaskId: e.value, priority: 1, slack: e.ctx });
}

/** Thread replies on another agent's approval card are routed by the runtime (Edit notes), not by Ayesha. */
async function isOthersApprovalThread(workspaceId: UUID, threadTs?: string): Promise<boolean> {
  if (!threadTs) return false;
  const { data } = await store.db.from('approvals').select('id,kind,requested_by_agent_id').eq('workspace_id', workspaceId).eq('slack_ts', threadTs).maybeSingle();
  if (!data) return false;
  const me = await store.agentByRole(workspaceId, ROLE);
  return data.requested_by_agent_id !== me.id;
}

async function onMessage(e: BusEvents['slack.message']): Promise<void> {
  const c = e.ctx;
  if (e.kind === 'thread_reply' && await isOthersApprovalThread(c.workspaceId, c.threadTs)) return;
  const text = e.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  await runtime.enqueue(c.workspaceId, ROLE, 'answer_question', `Chat: ${text.slice(0, 60)}`, {
    text, kind: e.kind, channel: c.channel, threadTs: c.threadTs ?? c.messageTs ?? null,
  }, { priority: 1, slack: c });
}

async function onCron(e: BusEvents['cron.tick']): Promise<void> {
  if (e.name === 'inbox_poll') { await pollReports(env.WORKSPACE_ID); return; }
  if (e.name !== 'standup_0900') return;
  const ws = env.WORKSPACE_ID;
  const row = await store.workspace(ws);
  if (row.status !== 'active') return;
  await runtime.enqueue(ws, ROLE, 'standup', 'Daily standup', { trigger: 'cron', daily_run: true }, { priority: 1 });
}

/**
 * Wins / alerts written by other agents (reports table) → #sales-hq. Polled on the 15 s inbox_poll tick so the
 * runtime needs no hook; only reports created after boot are mirrored.
 */
let mirrorSince = new Date().toISOString();
const mirrored = new Set<string>();
let polling = false;
export async function pollReports(workspaceId: UUID): Promise<number> {
  if (polling) return 0;
  polling = true;
  try {
    const me = await store.agentByRole(workspaceId, ROLE);
    const { data, error } = await store.db.from('reports').select('id,kind,title,body,data,from_agent_id,created_at')
      .eq('workspace_id', workspaceId).in('kind', ['win', 'alert']).gt('created_at', mirrorSince).neq('from_agent_id', me.id)
      .order('created_at').limit(20);
    if (error || !data?.length) return 0;
    const { data: agents } = await store.db.from('agents').select('id,role,name').eq('workspace_id', workspaceId);
    const byId = new Map<string, { role: AgentRole; name: string }>((agents ?? []).map((a: any) => [a.id, { role: a.role, name: a.name }]));
    let n = 0;
    for (const r of data) {
      mirrorSince = r.created_at > mirrorSince ? r.created_at : mirrorSince;
      if (mirrored.has(r.id)) continue;
      mirrored.add(r.id);
      const from = byId.get(r.from_agent_id);
      await mirrorReport({ workspaceId, fromRole: from?.role ?? 'scout', fromName: from?.name, kind: r.kind, title: r.title, body: r.body, data: r.data });
      n++;
    }
    return n;
  } finally { polling = false; }
}

async function onGraph8(e: BusEvents['graph8.event']): Promise<void> {
  if (isIntelligenceDone(e.type)) await resumeAfterAnalysis(e.workspaceId, e.payload);
}

let wired = false;
/** Subscribe Ayesha to the bus. Idempotent; called on module load. */
export function wireAyesha(): void {
  if (wired) return;
  wired = true;
  const guard = <T>(name: string, fn: (e: T) => Promise<void>) => async (e: T) => {
    try { await fn(e); } catch (err) { rootLog.error(`ayesha ${name} failed`, { err: errMsg(err) }); }
  };
  bus.on('slack.command', guard('command', onCommand));
  bus.on('slack.action', guard('action', onAction));
  bus.on('slack.message', guard('message', onMessage));
  bus.on('cron.tick', guard('cron', onCron));
  bus.on('graph8.event', guard('graph8', onGraph8));
}
wireAyesha();
