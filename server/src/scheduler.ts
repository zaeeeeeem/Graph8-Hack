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
import { errMsg, firstName, safe, withTimeout } from './agents/usman/util';
import { directSendOn, firstTouchSender, renderFirstName } from './agents/usman/first-touch';
import { SequenceCopy } from './agents/usman/copy';
import { resolveMailbox } from './agents/usman/g8ops';
import { recordTouch } from './agents/usman/track';

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
    const hasFollowUps = (seq.steps ?? []).some((s: any) => s.channel === 'email' && Number(s.email_idx) > 0);
    if ((!sideSteps.length && !hasFollowUps) || !seq.g8_sequence_id) continue;
    const secPerDay = Number((seq.stats as any)?.sec_per_day ?? 86_400);
    const launched = new Date(seq.launched_at as string).getTime();

    const { data: leadRows } = await store.db.from('leads').select('*')
      .eq('workspace_id', workspaceId).eq('sequence_id', seq.id).eq('is_test_contact', true).eq('sequence_state', 'enrolled');
    const leads = ((leadRows ?? []) as LeadRow[]).filter((l) => !l.do_not_contact && !STOP_STAGES.has(l.stage) && l.g8_contact_id);
    if (!leads.length) continue;

    fired += await safe(() => emailFollowUps(seq, leads, now, secPerDay, launched), (e) => console.warn('[scheduler] follow-ups failed:', errMsg(e))) ?? 0;

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

/**
 * sendfix: graph8 does not dispatch, so D3/D9 emails go out from here via the guarded direct sender, threaded as
 * replies to email 1 (compose `reply_to_email_id` = email 1's Gmail id). Stops the moment the lead replied / was
 * stopped / is do_not_contact (lead re-read right before each send). Recorded as graph8 step N for dedupe.
 */
async function emailFollowUps(seq: SequenceRow, leads: LeadRow[], now: Date, secPerDay: number, launched: number): Promise<number> {
  const settings = await store.settings(seq.workspace_id);
  const send = firstTouchSender();
  if (!send || !directSendOn(settings)) return 0;
  const g8Steps = (seq.steps ?? []).filter((s: any) => s.mode === 'g8') as any[];
  const due = g8Steps.map((s, i) => ({ s, order: i + 1 }))
    .filter(({ s }) => s.channel === 'email' && Number(s.email_idx) > 0 && now.getTime() >= launched + s.day * secPerDay * 1000);
  if (!due.length) return 0;

  const copy = await approvedCopy(seq);
  if (!copy) return 0;
  const mailbox = await safe(() => resolveMailbox(settings));
  let sent = 0;
  for (const lead0 of leads) {
    const first = await firstEmailRef(lead0.id, seq.g8_sequence_id!);
    if (!first) continue; // email 1 never went out → no thread to follow up
    for (const { s, order } of due) {
      const stepKey = `${seq.g8_sequence_id}:${order}`;
      const failKey = `${seq.id}:email:${order}`;
      if (await hasEvent(lead0.id, 'email_sent', { step_key: stepKey }) || await firedAlready(lead0.id, failKey)) continue;
      const lead = await freshLead(lead0.id);
      if (!lead || !lead.is_test_contact || lead.do_not_contact || STOP_STAGES.has(lead.stage) || lead.sequence_state !== 'enrolled') break;
      const email = copy.emails[Number(s.email_idx)];
      if (!email) continue;
      const fn = firstName(lead.full_name);
      const subject = `Re: ${renderFirstName(copy.emails[0].subject, fn)}`;
      const r = await safe(() => send({
        workspaceId: seq.workspace_id, lead, g8ContactId: lead.g8_contact_id!, g8SequenceId: seq.g8_sequence_id!,
        subject, body: renderFirstName(email.body, fn), mailbox, replyToEmailId: first,
      }), (e) => void noteFire(seq, lead, failKey, s, `⚠️ Email ${order} to ${lead.full_name} failed: ${errMsg(e)}`, false));
      if (!r) continue;
      if (!r.ok) { await noteFire(seq, lead, failKey, s, `⚠️ Email ${order} to ${lead.full_name} not sent: ${r.note ?? 'refused'}`, false); continue; }
      await recordTouch({ workspaceId: seq.workspace_id, kind: 'email_sent', lead, seq, stepOrder: order, source: 'direct', extra: { ref: r.ref ?? null, direct_ref: r.ref ?? null } });
      sent++;
    }
  }
  return sent;
}

async function approvedCopy(seq: SequenceRow): Promise<SequenceCopy | undefined> {
  if (!seq.approval_id) return undefined;
  const { data } = await store.db.from('approvals').select('payload').eq('id', seq.approval_id).limit(1);
  const parsed = SequenceCopy.safeParse((data?.[0]?.payload as any)?.copy);
  return parsed.success ? parsed.data : undefined;
}

async function hasEvent(leadId: UUID, type: string, contains: Record<string, unknown>): Promise<boolean> {
  const { data } = await store.db.from('lead_events').select('id').eq('lead_id', leadId).eq('type', type).contains('data', contains).limit(1);
  return !!data?.length;
}

async function firstEmailRef(leadId: UUID, g8SequenceId: string): Promise<string | undefined> {
  const { data } = await store.db.from('lead_events').select('data').eq('lead_id', leadId).eq('type', 'email_sent')
    .contains('data', { step_key: `${g8SequenceId}:1` }).limit(1);
  const ref = (data?.[0]?.data as any)?.ref ?? (data?.[0]?.data as any)?.direct_ref;
  return ref ? String(ref) : undefined;
}

async function freshLead(id: UUID): Promise<LeadRow | undefined> {
  const { data } = await store.db.from('leads').select('*').eq('id', id).limit(1);
  return data?.[0] as LeadRow | undefined;
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
