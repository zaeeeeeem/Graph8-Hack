/**
 * Layer L3 — LinkedIn. Lives ONLY in our DB / Slack / portal (docs/verify/layers.md V-L1):
 * graph8 rejects HEYREACH/NETRION step types on POST /sequences, there is no UNIPILE, and the org has 0 senders.
 *
 *  - stepPlan: D1 connection request + D6 message, Gemini-drafted per lead (saved to leads.research.linkedin),
 *    always state 'planned' and never a g8Step.
 *  - onboarding: checks the connection; not connected → { ok:false } + a connect_account approval with a Connect card
 *    (reuses Ayesha's pending one if she already posted it).
 *  - start(): on cron 'linkedin_watch' (60 s) polls /linkedin/connection + senders (LINKEDIN_FAKE_CONNECTED=1 simulates).
 *    On connect: settings.linkedin_connected=true, approval approved, LinkedIn steps in sequences.steps marked live
 *    with an honest note, report + "LinkedIn connected — 2 touches now live" in #sales-hq.
 * Nothing here throws out of a hook; every network call is time-boxed.
 */
import { z } from 'zod';
import type { Layer, PlannedStep, RunCtx } from '../contracts';
import type { JsonObject, LeadRow, UUID } from '../../../shared/types';
import { layers } from '../layers';
import { bus } from '../lib/bus';
import { env } from '../lib/env';
import { g8, unwrap } from '../lib/g8';
import { llm } from '../lib/llm';
import { log as rootLog } from '../lib/log';
import { store } from '../lib/store';
import { LINKEDIN_CONNECT_URL, linkedinConnectCard, linkedinConnectDoneBlocks, linkedinConnectedCard } from '../slack/cards/linkedin';

const log = rootLog.child('layer:linkedin');

export const CONNECT_DAY = 1;
export const MESSAGE_DAY = 6;
export const TOUCHES = 2;
const G8_TIMEOUT_MS = 8_000;
/** Usman's stepPlan timeout is 8 s; drafting must finish well inside it. */
const DRAFT_TIMEOUT_MS = 6_000;
const MAX_DRAFT_LEADS = 25;
export const REASON_WAITING = 'waiting to connect LinkedIn in graph8';
export const REASON_API = "LinkedIn connected, but graph8's API doesn't accept LinkedIn steps yet — send the drafts from graph8";
export const LIVE_NOTE = "live: graph8's API doesn't accept LinkedIn steps, so this is tracked here; drafts are per lead in research.linkedin";

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200);

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms); }),
  ]);
}

// ------------------------------------------------------------------------------------------------ connection probe
export interface LinkedinStatus { connected: boolean; senders: number; fake?: boolean }

export async function probeConnection(): Promise<LinkedinStatus> {
  if (process.env.LINKEDIN_FAKE_CONNECTED === '1') return { connected: true, senders: 1, fake: true };
  const [conn, snd] = await Promise.allSettled([
    withTimeout(g8.get('/linkedin/connection'), G8_TIMEOUT_MS, 'linkedin connection'),
    withTimeout(g8.get('/workflows/integrations/linkedin/senders'), G8_TIMEOUT_MS, 'linkedin senders'),
  ]);
  if (conn.status === 'rejected' && snd.status === 'rejected') throw conn.reason;
  const c = conn.status === 'fulfilled' ? unwrap<any>(conn.value) : null;
  const s = snd.status === 'fulfilled' ? unwrap<any>(snd.value) : null;
  const senders = Number(s?.total_count ?? (Array.isArray(s?.senders) ? s.senders.length : 0)) || 0;
  // A step can only send with a sender; `connected` alone (key present, no seat) is not enough.
  return { connected: Boolean(c?.connected) && senders > 0, senders };
}

// ------------------------------------------------------------------------------------------------ drafts
export interface LinkedinDraft { connect: string; message: string }

const DraftSchema = z.object({
  drafts: z.array(z.object({ lead_id: z.string(), connect: z.string(), message: z.string() })),
});

const firstName = (l: LeadRow) => (l.full_name ?? '').trim().split(/\s+/)[0] || 'there';

/** Deterministic fallback when Gemini is slow/down. */
export function templateDraft(l: LeadRow, offer?: string): LinkedinDraft {
  const at = l.company_name ? ` at ${l.company_name}` : '';
  return {
    connect: `Hi ${firstName(l)}, I work with ${l.job_title ? `${l.job_title}s` : 'teams'} like you${at} on ${offer || 'growth'}. Would be glad to connect.`.slice(0, 280),
    message: `Thanks for connecting, ${firstName(l)}. ${l.why_now ? `Saw ${l.why_now.replace(/\.$/, '')}. ` : ''}Open to a quick 15-minute chat on whether ${offer || 'what we do'} could help${at}?`.slice(0, 600),
  };
}

async function draftAll(ctx: RunCtx, leads: LeadRow[]): Promise<Record<UUID, LinkedinDraft>> {
  const brain = await withTimeout(store.workspace(ctx.workspaceId), 2_000, 'workspace').then((w) => w.sales_brain ?? {}).catch(() => ({} as JsonObject));
  const offer = typeof brain.offer === 'string' ? brain.offer : undefined;
  const out: Record<UUID, LinkedinDraft> = {};
  for (const l of leads) out[l.id] = templateDraft(l, offer);
  const batch = leads.slice(0, MAX_DRAFT_LEADS);
  if (!batch.length) return out;
  const prompt =
    `Write LinkedIn outreach for each lead. Seller offer: ${offer ?? 'n/a'}. ICP: ${String(brain.icp ?? ctx.settings.target_icp ?? 'n/a')}. ` +
    `Tone: ${String(brain.tone ?? 'direct, warm, no fluff')}.\n` +
    `For each lead return "connect" (connection-request note, max 280 chars, no links, no pitch-dump) and ` +
    `"message" (follow-up DM sent 5 days after they accept, max 500 chars, one concrete reason tied to their role/company, one soft ask).\n` +
    `Return JSON {"drafts":[{"lead_id","connect","message"}]} with one entry per lead_id below.\n` +
    JSON.stringify(batch.map((l) => ({ lead_id: l.id, name: l.full_name, title: l.job_title, company: l.company_name, why_now: l.why_now }))) ;
  try {
    const r = await withTimeout(llm.json(prompt, DraftSchema, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task?.id, temperature: 0.6 }), DRAFT_TIMEOUT_MS, 'linkedin drafts');
    for (const d of r.drafts) {
      if (!out[d.lead_id] || !d.connect.trim() || !d.message.trim()) continue;
      out[d.lead_id] = { connect: d.connect.trim().slice(0, 300), message: d.message.trim().slice(0, 600) };
    }
  } catch (e) {
    ctx.log.warn('linkedin drafts fell back to templates', { err: errMsg(e) });
  }
  return out;
}

/** Best-effort, fire-and-forget: persist drafts on leads.research.linkedin (no PII). */
async function saveDrafts(leads: LeadRow[], drafts: Record<UUID, LinkedinDraft>) {
  await Promise.allSettled(leads.map((l) => drafts[l.id] && store.db.from('leads').update({
    research: { ...(l.research ?? {}), linkedin: { ...drafts[l.id], connect_day: CONNECT_DAY, message_day: MESSAGE_DAY, state: 'planned' } },
  }).eq('id', l.id)));
}

export async function stepPlan(ctx: RunCtx, leads: LeadRow[]): Promise<PlannedStep[]> {
  const connected = Boolean(ctx.settings?.linkedin_connected);
  const reason = connected ? REASON_API : REASON_WAITING;
  let drafts: Record<UUID, LinkedinDraft> = {};
  try {
    drafts = await draftAll(ctx, leads ?? []);
    void saveDrafts(leads ?? [], drafts).catch(() => undefined);
    await ctx.step('llm', 'linkedin_drafts', `drafted ${Object.keys(drafts).length} LinkedIn connect + message pair(s)`).catch(() => undefined);
  } catch (e) {
    ctx.log.warn('linkedin stepPlan drafting failed', { err: errMsg(e) });
  }
  const sample = leads?.[0] ? drafts[leads[0].id] : undefined;
  // g8Step is deliberately never set: graph8 rejects HEYREACH/NETRION (V-L1). `preview` is an extra for the card.
  const steps: Array<PlannedStep & { preview?: string }> = [
    { day: CONNECT_DAY, channel: 'linkedin', action: 'connection_request', state: 'planned', reason, preview: sample?.connect },
    { day: MESSAGE_DAY, channel: 'linkedin', action: 'message', state: 'planned', reason, preview: sample?.message },
  ];
  return steps;
}

// ------------------------------------------------------------------------------------------------ onboarding
async function pendingConnectApproval(workspaceId: UUID): Promise<{ id: UUID; slack_channel: string | null; slack_ts: string | null } | null> {
  const r = await store.db.from('approvals').select('id,slack_channel,slack_ts')
    .eq('workspace_id', workspaceId).eq('kind', 'connect_account').eq('status', 'pending')
    .eq('payload->>account', 'linkedin').order('created_at', { ascending: false }).limit(1);
  return r.data?.[0] ?? null;
}

async function slackPort() {
  if (env.SLACK_DISABLED) return null;
  try { return (await import('../lib/slack')).slack; } catch (e) { log.warn('slack unavailable', { err: errMsg(e) }); return null; }
}

export async function onboardingRun(ctx: RunCtx): Promise<{ ok: boolean; note?: string }> {
  let st: LinkedinStatus;
  try { st = await probeConnection(); } catch (e) { return { ok: false, note: `couldn't check LinkedIn (${errMsg(e)}); touches stay ⏸` }; }
  if (st.connected) {
    await store.patchSettings(ctx.workspaceId, { linkedin_connected: true }).catch(() => undefined);
    return { ok: true, note: `${st.senders} sender(s) connected${st.fake ? ' (simulated)' : ''}` };
  }
  try {
    const existing = await pendingConnectApproval(ctx.workspaceId);
    if (existing) {
      await ctx.step('note', 'linkedin_connect', 'LinkedIn not connected; Connect card already pending', { approvalId: existing.id });
      return { ok: false, note: 'not connected; Connect card is in #sales-hq, 2 LinkedIn touches wait ⏸' };
    }
    // Not ctx.requestApproval: that blocks the calling (onboarding) task on a card that has no decision buttons.
    const payload = { account: 'linkedin', connect_url: LINKEDIN_CONNECT_URL, blocked_steps: [CONNECT_DAY, MESSAGE_DAY] };
    const ins = await store.db.from('approvals').insert({
      workspace_id: ctx.workspaceId, requested_by_agent_id: ctx.agentId, task_id: ctx.task?.id ?? null, kind: 'connect_account',
      title: 'Connect LinkedIn in graph8', payload, status: 'pending',
    }).select('id').single();
    if (ins.error) throw new Error(ins.error.message);
    const slack = await slackPort();
    if (slack) {
      const card = linkedinConnectCard({ touches: TOUCHES });
      const m = await slack.postAs(ctx.role, 'hq', card);
      await store.db.from('approvals').update({ slack_channel: m.channel, slack_ts: m.ts }).eq('id', ins.data.id);
    }
    await ctx.step('slack', 'linkedin_connect', 'Asked founder to connect LinkedIn', { approvalId: ins.data.id });
  } catch (e) {
    ctx.log.warn('linkedin connect approval failed', { err: errMsg(e) });
  }
  return { ok: false, note: 'not connected; Connect card posted in #sales-hq, 2 LinkedIn touches wait ⏸' };
}

// ------------------------------------------------------------------------------------------------ watcher
let checking = false;

/** One watcher pass. Returns true if it flipped the workspace to connected. Never throws. */
export async function checkOnce(workspaceId: UUID = env.WORKSPACE_ID): Promise<boolean> {
  if (checking) return false;
  checking = true;
  try {
    const settings = await store.settings(workspaceId);
    if (settings.linkedin_connected) return false;
    const st = await probeConnection();
    if (!st.connected) return false;
    await onConnected(workspaceId, st);
    return true;
  } catch (e) {
    log.warn('linkedin watch failed', { err: errMsg(e) });
    return false;
  } finally {
    checking = false;
  }
}

export async function onConnected(workspaceId: UUID, st: LinkedinStatus): Promise<{ sequences: number; steps: number }> {
  const settings = await store.settings(workspaceId);
  await store.patchSettings(workspaceId, {
    linkedin_connected: true,
    channels: { email: settings.channels?.email ?? true, phone: settings.channels?.phone ?? false, linkedin: true },
  });
  log.info(`LinkedIn connected (${st.senders} sender(s)${st.fake ? ', simulated' : ''})`);
  const now = new Date().toISOString();
  const slack = await slackPort();

  // 1. Connect approvals → approved; replace the card.
  const ap = await store.db.from('approvals').update({ status: 'approved', decided_by_slack_user: 'linkedin_watch', decided_at: now })
    .eq('workspace_id', workspaceId).eq('kind', 'connect_account').eq('status', 'pending').eq('payload->>account', 'linkedin')
    .select('id,slack_channel,slack_ts');
  if (ap.error) log.warn('approval flip failed', { err: ap.error.message });
  for (const a of ap.data ?? []) {
    if (slack && a.slack_channel && a.slack_ts) await slack.update(a.slack_channel, a.slack_ts, linkedinConnectDoneBlocks()).catch((e) => log.warn('card update failed', { err: errMsg(e) }));
  }

  // 2. sequences.steps: LinkedIn rows planned → live, with an honest note (graph8 can't carry them via API).
  let seqs = 0; let flipped = 0;
  const r = await store.db.from('sequences').select('id,steps,status').eq('workspace_id', workspaceId).not('status', 'in', '(cancelled,completed)');
  if (r.error) log.warn('sequences read failed', { err: r.error.message });
  for (const seq of r.data ?? []) {
    let n = 0;
    const steps = (seq.steps ?? []).map((s: any) => {
      const isLi = s?.layer === 'linkedin' || s?.channel === 'linkedin';
      if (!isLi || s.mode === 'live') return s;
      n += 1;
      return { ...s, mode: 'live', state: 'live', reason: LIVE_NOTE, live_at: now };
    });
    if (!n) continue;
    const u = await store.db.from('sequences').update({ steps }).eq('id', seq.id);
    if (u.error) { log.warn('sequence steps update failed', { err: u.error.message }); continue; }
    seqs += 1; flipped += n;
  }

  // 3. Report (portal) + #sales-hq post, as Usman (he owns the steps).
  const card = linkedinConnectedCard({ touches: TOUCHES, sequences: seqs });
  try {
    const usman = await store.agentByRole(workspaceId, 'sdr');
    await store.db.from('reports').insert({
      workspace_id: workspaceId, from_agent_id: usman.id, kind: 'update', title: card.text,
      body: `${flipped} LinkedIn step(s) on ${seqs} sequence(s) marked live. ${LIVE_NOTE}.`,
      data: { layer: 'linkedin', senders: st.senders, sequences: seqs, steps: flipped, simulated: Boolean(st.fake) },
    });
  } catch (e) { log.warn('linkedin report failed', { err: errMsg(e) }); }
  if (slack) await slack.postAs('sdr', 'hq', card).catch((e) => log.warn('connected post failed', { err: errMsg(e) }));
  return { sequences: seqs, steps: flipped };
}

// ------------------------------------------------------------------------------------------------ register
let started = false;
export const linkedinLayer: Layer = {
  name: 'linkedin',
  onboarding: { name: 'linkedin_connect', label: 'LinkedIn sender', run: onboardingRun },
  async stepPlan(ctx, leads) {
    try { return await stepPlan(ctx, leads); } catch (e) {
      ctx.log.warn('linkedin stepPlan failed', { err: errMsg(e) });
      return [
        { day: CONNECT_DAY, channel: 'linkedin', action: 'connection_request', state: 'planned', reason: REASON_WAITING },
        { day: MESSAGE_DAY, channel: 'linkedin', action: 'message', state: 'planned', reason: REASON_WAITING },
      ];
    }
  },
  async start() {
    if (started) return;
    started = true;
    bus.on('cron.tick', async ({ name }) => {
      if (name !== 'linkedin_watch' || env.layersDisabled.includes('linkedin')) return;
      await checkOnce();
    });
    log.info(`watcher on (cron linkedin_watch${process.env.LINKEDIN_FAKE_CONNECTED === '1' ? ', LINKEDIN_FAKE_CONNECTED=1' : ''})`);
  },
};

layers.register(linkedinLayer);
