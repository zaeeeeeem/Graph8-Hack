/**
 * Step scheduler (W4) — fires side steps graph8 does not send itself (e.g. 📞 AI voice call from the voice layer).
 *
 * Persistence (no new tables): the plan lives in `sequences.steps` (mode='fire', day, layer); due time per lead is
 * `sequences.launched_at + day * secPerDay` (`secPerDay` stored in `sequences.stats.sec_per_day`). A fired step is a
 * `lead_events` row (type 'note', data.fired_step_key) — that row is the idempotency record across restarts.
 *
 * `fire()` functions are held in memory (registered at build time). After a restart they are rebuilt by asking the
 * layer's `stepPlan` again with a minimal context; if the layer is gone the step is logged ⚠️ once and skipped.
 */
import { bus } from './lib/bus';
import { env } from './lib/env';
import { store } from './lib/store';
import type { PlannedStep, RunCtx } from './contracts';
import type { LeadRow, SequenceRow, UUID } from '../../shared/types';
import { safeLayers } from './agents/usman/plan';
import { errMsg, safe, withTimeout } from './agents/usman/util';

type FireFn = NonNullable<PlannedStep['fire']>;
const fires = new Map<string, FireFn>();
const keyOf = (sequenceRowId: UUID, n: number) => `${sequenceRowId}:${n}`;

export function registerFire(sequenceRowId: UUID, n: number, fn: FireFn): void { fires.set(keyOf(sequenceRowId, n), fn); }
export function _resetScheduler(): void { fires.clear(); lastTick = 0; }

/** Leads that must not get further touches (finish_on_reply is ours to honour for side steps). */
const STOP_STAGES = new Set(['replied', 'meeting', 'deal', 'won', 'lost', 'disqualified']);

async function rebuildFire(seq: SequenceRow, step: any, leads: LeadRow[]): Promise<FireFn | undefined> {
  const layer = safeLayers().find((l) => l.name === step.layer && l.stepPlan);
  if (!layer?.stepPlan) return undefined;
  const settings = await store.settings(seq.workspace_id);
  const agent = await store.agentByRole(seq.workspace_id, 'sdr');
  const noop = async () => {};
  const ctx = {
    workspaceId: seq.workspace_id, agentId: agent.id, role: 'sdr', settings, runId: 'scheduler', task: { id: seq.task_id } as any,
    log: { info: noop, warn: noop, error: noop, child: () => ctx.log } as any,
    step: noop, report: noop, delegate: async () => { throw new Error('not available in scheduler'); },
    requestApproval: async () => { throw new Error('not available in scheduler'); }, thread: async () => { throw new Error('n/a'); },
  } as unknown as RunCtx;
  const steps = await withTimeout(layer.stepPlan(ctx, leads), 8_000, `${layer.name} stepPlan`);
  const match = (steps ?? []).find((s) => s.day === step.day && s.channel === step.channel && s.action === step.action && s.fire);
  if (match?.fire) registerFire(seq.id, step.n, match.fire);
  return match?.fire;
}

async function firedAlready(leadId: UUID, stepKey: string): Promise<boolean> {
  const { data } = await store.db.from('lead_events').select('id').eq('lead_id', leadId).eq('type', 'note')
    .contains('data', { fired_step_key: stepKey }).limit(1);
  return !!data?.length;
}

/** One pass: fire every due side step for enrolled TEST leads of live sequences. Returns how many fired. */
export async function tickScheduler(now = new Date(), workspaceId: UUID = env.WORKSPACE_ID): Promise<number> {
  lastTick = Date.now();
  const { data: seqs } = await store.db.from('sequences').select('*')
    .eq('workspace_id', workspaceId).eq('status', 'live').not('launched_at', 'is', null);
  let fired = 0;
  for (const seq of (seqs ?? []) as SequenceRow[]) {
    const sideSteps = (seq.steps ?? []).filter((s: any) => s.mode === 'fire');
    if (!sideSteps.length || !seq.g8_sequence_id) continue;
    const secPerDay = Number((seq.stats as any)?.sec_per_day ?? 86_400);
    const launched = new Date(seq.launched_at as string).getTime();

    const { data: leadRows } = await store.db.from('leads').select('*')
      .eq('workspace_id', workspaceId).eq('sequence_id', seq.id).eq('is_test_contact', true).eq('sequence_state', 'enrolled');
    const leads = ((leadRows ?? []) as LeadRow[]).filter((l) => !l.do_not_contact && !STOP_STAGES.has(l.stage) && l.g8_contact_id);
    if (!leads.length) continue;

    for (const step of sideSteps as any[]) {
      if (now.getTime() < launched + step.day * secPerDay * 1000) continue;
      const stepKey = `${seq.id}:${step.n}`;
      let fn = fires.get(keyOf(seq.id, step.n));
      for (const lead of leads) {
        if (await firedAlready(lead.id, stepKey)) continue;
        if (!fn) fn = await safe(() => rebuildFire(seq, step, leads));
        const ok = fn
          ? await safe(async () => { await fn!({ workspaceId, lead, g8ContactId: lead.g8_contact_id!, sequenceId: seq.g8_sequence_id! }); return true; },
            (e) => void noteFire(seq, lead, stepKey, step, `⚠️ ${step.layer} D${step.day} failed: ${errMsg(e)}`, false))
          : undefined;
        if (ok) { fired++; await noteFire(seq, lead, stepKey, step, `${step.layer ?? 'layer'} step D${step.day} fired for ${lead.full_name}`, true); }
        else if (!fn) await noteFire(seq, lead, stepKey, step, `⚠️ ${step.layer ?? 'layer'} step D${step.day} skipped (layer unavailable)`, false);
      }
    }
  }
  return fired;
}

async function noteFire(seq: SequenceRow, lead: LeadRow, stepKey: string, step: any, summary: string, ok: boolean) {
  const agent = await safe(() => store.agentByRole(seq.workspace_id, 'sdr'));
  await safe(() => store.db.from('lead_events').insert({
    workspace_id: seq.workspace_id, lead_id: lead.id, agent_id: agent?.id ?? null, task_id: seq.task_id,
    type: 'note', channel: step.channel ?? 'system', direction: 'internal', summary,
    data: { fired_step_key: stepKey, ok, layer: step.layer ?? null, day: step.day },
  }));
}

let registered = false;
let lastTick = 0;
let running = false;
async function guardedTick() {
  if (running) return;
  running = true;
  try { await tickScheduler(); } catch (e) { console.warn('[scheduler] tick failed:', errMsg(e)); } finally { running = false; }
}

/** Subscribe to `cron.tick step_scheduler`; fallback 20 s self-tick if nobody emits it. Idempotent. */
export function registerScheduler(opts: { fallbackMs?: number } = {}): void {
  if (registered) return;
  registered = true;
  bus.on('cron.tick', async (e) => { if (e.name === 'step_scheduler') await guardedTick(); });
  const ms = opts.fallbackMs ?? 20_000;
  const t = setInterval(() => { if (Date.now() - lastTick > ms * 1.5) void guardedTick(); }, ms);
  t.unref?.();
}
