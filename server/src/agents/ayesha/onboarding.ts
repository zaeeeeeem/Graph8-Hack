/**
 * P1 — Onboarding (/hire-sales <domain>). Fixed order; Gemini only picks the target.
 * Every step is wrapped: a failing step becomes ⚠️ on the checklist, never a crashed onboarding.
 */
import { z } from 'zod';
import type { Checklist, ChecklistItem, RunCtx } from '../../contracts';
import type { JsonObject, SalesBrain, WorkspaceSettings } from '../../../../shared/types';
import { env } from '../../lib/env';
import { g8 } from '../../lib/g8';
import { llm } from '../../lib/llm';
import { store } from '../../lib/store';
import { slack } from '../../lib/slack';
import { layers } from '../../layers';
import { connectCard } from '../../slack/cards/connect';
import { ONBOARD_ITEMS, PLAN_ITEM, onboardTitle, rehireCard, studyingText } from '../../slack/cards/onboarding';
import { planCard } from '../../slack/cards/plan';
import { errMsg, fmtNum, normDomain, unwrap, withTimeout } from './util';

const ROLE = 'head_of_sales' as const;
const EXTRA_TIMEOUT_MS = 45_000;
const G8_TIMEOUT_MS = 20_000;
export const LOW_CREDITS = 1_000;

// ---------------------------------------------------------------------------
// T1 read_company_brain
// ---------------------------------------------------------------------------
export interface G8Doc { id: string; display_name: string; file_type: string; status: string; content?: string | null }

/** Doc types that matter most for targeting, read first when trimming to the prompt budget. */
const DOC_PRIORITY = ['icp_research', 'persona_research', 'value_props', 'company_overview', 'pains_and_gains', 'pricing_matrix', 'competitors', 'brand_voice', 'elevator_pitch'];

export async function readCompanyDocs(): Promise<G8Doc[]> {
  const r = await withTimeout(g8.get('/global-context/documents', { include_content: true }), G8_TIMEOUT_MS, 'global-context');
  const docs = unwrap<G8Doc[]>(r) ?? [];
  return (Array.isArray(docs) ? docs : []).filter((d) => d.status === 'completed' && (d.content ?? '').trim().length > 0);
}

export function docsForPrompt(docs: G8Doc[], budget = 24_000): string {
  const rank = (d: G8Doc) => { const i = DOC_PRIORITY.indexOf(d.file_type); return i < 0 ? 99 : i; };
  const out: string[] = [];
  let used = 0;
  for (const d of [...docs].sort((a, b) => rank(a) - rank(b))) {
    const room = budget - used;
    if (room < 400) break;
    const body = (d.content ?? '').slice(0, Math.min(room, 5_000));
    out.push(`### ${d.display_name} (${d.file_type})\n${body}`);
    used += body.length;
  }
  return out.join('\n\n');
}

export const TargetPick = z.object({
  company: z.string().describe('Company name'),
  offer: z.string().describe('What they sell, one sentence'),
  target_persona: z.string().describe('Top-priority buyer persona, e.g. "Heads of Growth at Series A-B SaaS"'),
  target_icp: z.string().describe('Company profile to target, one line'),
  why: z.string().describe('One line: why this persona first'),
  alternatives: z.array(z.string()).max(2).optional(),
  geo: z.array(z.string()).max(5).optional(),
  tone: z.string().optional(),
  proof: z.array(z.string()).max(4).optional(),
  personas: z.array(z.string()).max(5).optional(),
});
export type TargetPickRaw = z.infer<typeof TargetPick>;
export type TargetPick = Required<TargetPickRaw>;

const TARGET_SYSTEM = 'You are Ayesha, Head of Sales. Crisp, numbers first. Pick ONE top-priority target from the company docs, say why in one line, list 1-2 alternatives. Never invent customers or numbers not in the docs. No personal data.';

export async function pickTarget(ctx: RunCtx, domain: string, docs: G8Doc[]): Promise<TargetPick> {
  const text = docs.length ? docsForPrompt(docs) : `(no company docs yet; only the website domain ${domain} is known)`;
  const prompt = `Company website: ${domain}\n\nCompany docs from graph8:\n${text}\n\nReturn ONLY this JSON object:
{"company": string, "offer": string (one sentence), "target_persona": string, "target_icp": string (one line), "why": string (one line), "alternatives": string[] (max 2), "geo": string[], "tone": string, "proof": string[] (max 4), "personas": string[] (max 5)}`;
  const r = await llm.json(prompt, TargetPick, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id, system: TARGET_SYSTEM, temperature: 0.2 });
  return { ...r, alternatives: r.alternatives ?? [], geo: r.geo ?? [], tone: r.tone ?? '', proof: r.proof ?? [], personas: r.personas ?? [] };
}

// ---------------------------------------------------------------------------
// T2 start_company_analysis (L4)
// ---------------------------------------------------------------------------
export async function startAnalysis(domain: string): Promise<JsonObject> {
  const r = await withTimeout(g8.post('/intelligence/analyze', { website_url: `https://${domain}`, force: false }), 30_000, 'intelligence/analyze');
  return (unwrap<JsonObject>(r) ?? {}) as JsonObject;
}

/** Poll fallback for the completion webhook. Verified: GET /intelligence/status/{task_id} → { status: 'pending'|…|'completed', progress }. */
export async function analysisStatus(g8TaskId: string): Promise<{ status: string; progress: number }> {
  const r = unwrap<any>(await withTimeout(g8.get(`/intelligence/status/${g8TaskId}`), G8_TIMEOUT_MS, 'intelligence/status')) ?? {};
  return { status: String(r.status ?? 'unknown'), progress: Number(r.progress ?? 0) };
}

// ---------------------------------------------------------------------------
// T3 find_pipeline · T16 meeting type · T4 channels · T5 credits
// ---------------------------------------------------------------------------
export async function findPipeline(): Promise<{ pipelineId: string; name: string; stageId?: string }> {
  const pipes = unwrap<any[]>(await withTimeout(g8.get('/deals/pipelines'), G8_TIMEOUT_MS, 'deals/pipelines')) ?? [];
  const pick = pipes.find((p) => p.name === 'Sales Pipeline') ?? pipes.find((p) => p.is_default) ?? pipes[0];
  if (!pick) throw new Error('no deal pipeline in graph8');
  const stage = (pick.stages ?? []).find((s: any) => String(s.name).toLowerCase() === 'new meeting');
  return { pipelineId: String(pick.id), name: String(pick.name), stageId: stage ? String(stage.id) : undefined };
}

export async function findMeetingType(): Promise<{ id: number; title: string; slug: string } | null> {
  const list = unwrap<any[]>(await withTimeout(g8.get('/event-types'), G8_TIMEOUT_MS, 'event-types')) ?? [];
  const pick = list.find((e) => /discovery/i.test(String(e.title ?? ''))) ?? list[0];
  return pick ? { id: Number(pick.id), title: String(pick.title), slug: String(pick.slug ?? slugify(String(pick.title))) } : null;
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Public booking link (docs/verify/core.md V-B1): `/embed` has no URL; the page is
 * https://app.graph8.com/appointments/team/{org-slug}/{event-slug}/{event_type_id}.
 * Org slug: GET /org/settings → data.metadata.org_slug, else slugified data.org_name.
 */
export async function bookingUrl(ev: { id: number; slug: string }): Promise<string | null> {
  const org = unwrap<any>(await withTimeout(g8.get('/org/settings'), G8_TIMEOUT_MS, 'org/settings')) ?? {};
  const orgSlug = String(org.metadata?.org_slug ?? org.org_slug ?? '') || slugify(String(org.org_name ?? ''));
  return orgSlug && ev.slug ? `https://app.graph8.com/appointments/team/${orgSlug}/${ev.slug}/${ev.id}` : null;
}

export interface Channels {
  email: { ok: boolean; mailboxId?: number; mailboxEmail?: string; dailyLimit?: number };
  phone: { ok: boolean; numbers: number };
  linkedin: { ok: boolean; senders: number };
}

export async function checkChannels(): Promise<Channels> {
  const [mb, li, liConn, ph] = await Promise.allSettled([
    withTimeout(g8.get('/mailboxes'), G8_TIMEOUT_MS, 'mailboxes'),
    withTimeout(g8.get('/workflows/integrations/linkedin/senders'), G8_TIMEOUT_MS, 'linkedin senders'),
    withTimeout(g8.get('/linkedin/connection'), G8_TIMEOUT_MS, 'linkedin connection'),
    withTimeout(g8.get('/teams/available/phone-numbers'), G8_TIMEOUT_MS, 'phone numbers'),
  ]);
  const boxes: any[] = mb.status === 'fulfilled' ? (unwrap<any[]>(mb.value) ?? []) : [];
  const active = boxes.find((b) => b.connection_status === 'active' && !b.is_archived);
  const senders = li.status === 'fulfilled' ? Number(li.value?.total_count ?? li.value?.senders?.length ?? 0) : 0;
  const connected = liConn.status === 'fulfilled' ? Boolean(unwrap<any>(liConn.value)?.connected) : false;
  const phData = ph.status === 'fulfilled' ? unwrap<any>(ph.value) : null;
  const numbers = Array.isArray(phData?.items) ? phData.items.length : Array.isArray(phData?.numbers) ? phData.numbers.length : 0;
  return {
    email: active ? { ok: true, mailboxId: Number(active.id), mailboxEmail: String(active.email), dailyLimit: Number(active.daily_limit ?? 0) } : { ok: false },
    phone: { ok: numbers > 0, numbers },
    linkedin: { ok: connected && senders > 0, senders },
  };
}

export async function checkCredits(): Promise<{ available: number; held: number; used: number }> {
  const u = unwrap<any>(await withTimeout(g8.get('/usage'), G8_TIMEOUT_MS, 'usage')) ?? {};
  return { available: Number(u.available_credits ?? u.credits ?? 0), held: Number(u.held_credits ?? 0), used: Number(u.total_used ?? 0) };
}

// ---------------------------------------------------------------------------
// Connect card (D10) — ask + continue; approvals row so the portal shows "needs you".
// ---------------------------------------------------------------------------
async function postConnect(ctx: RunCtx, account: 'linkedin' | 'mailbox' | 'phone'): Promise<void> {
  let approvalId: string | undefined;
  const card = connectCard(account);
  const msg = await slack.postAs(ROLE, 'hq', card);
  try {
    const { data } = await store.db.from('approvals').insert({
      workspace_id: ctx.workspaceId, requested_by_agent_id: ctx.agentId, task_id: ctx.task.id, kind: 'connect_account',
      title: `Connect ${account} in graph8`, summary: 'Outreach starts without it; its steps are added once connected.',
      payload: { account, connect_url: (card.blocks[1] as any).elements[0].url }, status: 'pending',
      slack_channel: msg.channel, slack_ts: msg.ts,
    }).select('id').single();
    approvalId = data?.id;
  } catch (e) { ctx.log.warn('connect approval row failed', { err: errMsg(e) }); }
  await ctx.step('slack', 'connect_card', `Asked founder to connect ${account}`, { approvalId: approvalId ?? null });
}

// ---------------------------------------------------------------------------
// P1
// ---------------------------------------------------------------------------
export async function runOnboarding(ctx: RunCtx): Promise<string> {
  const input = ctx.task.input as { domain?: string; force?: boolean; resumed?: boolean; channel?: string; threadTs?: string };
  const ws = await store.workspace(ctx.workspaceId);
  const domain = normDomain(input.domain || ws.company_domain || '');
  if (!domain) {
    await slack.postAs(ROLE, 'hq', { text: 'Tell me your company website, e.g. `/hire-sales 8x.social`.' });
    return 'No domain given';
  }

  // D19 — never a second team.
  if (ws.status === 'active' && !input.force) {
    const { data: agents } = await store.db.from('agents').select('name,status,sort_order').eq('workspace_id', ctx.workspaceId).order('sort_order');
    await slack.postAs(ROLE, 'hq', rehireCard({ company: ws.name || domain, agents: agents ?? [] }));
    return 'Team already hired';
  }

  const cl = await slack.checklist(ROLE, 'hq', onboardTitle(domain), ONBOARD_ITEMS.map((i) => ({ ...i })));
  const say = (text: string) => slack.postAs(ROLE, cl.channel, { text, threadTs: cl.ts }).catch(() => undefined);

  // 1. Company brain (T1) → fallback L4 analyze (T2)
  await cl.set('brain', 'doing');
  let docs: G8Doc[] = [];
  try { docs = await readCompanyDocs(); } catch (e) { ctx.log.warn('read docs failed', { err: errMsg(e) }); }
  await ctx.step('tool', 'read_company_brain', `${docs.length} company docs`);
  if (!docs.length && !input.resumed) {
    try {
      const a = await startAnalysis(domain);
      await ctx.step('tool', 'start_company_analysis', 'graph8 analysis started', { status: (a.status as any) ?? null });
      await store.patchSettings(ctx.workspaceId, { pending_analysis: { domain, task_id: ctx.task.id, g8_task_id: (a.task_id as string) ?? null, started_at: new Date().toISOString() } } as Partial<WorkspaceSettings>);
      await cl.set('brain', 'paused', 'studying the site, ~30 min');
      await say(studyingText(domain));
      return `Waiting for graph8 analysis of ${domain}`;
    } catch (e) {
      await cl.set('brain', 'warn', "couldn't study the site, using what graph8 knows");
      await ctx.step('tool', 'start_company_analysis', `failed: ${errMsg(e)}`);
    }
  } else if (!docs.length) {
    await cl.set('brain', 'warn', 'no company docs yet, using what graph8 knows');
  } else {
    await cl.set('brain', 'done', `${docs.length} docs`);
  }

  // 2. Target (D14)
  await cl.set('target', 'doing');
  let pick: TargetPick;
  try {
    pick = await pickTarget(ctx, domain, docs);
    await cl.set('target', 'done', pick.target_persona);
  } catch (e) {
    pick = { company: ws.name || domain, offer: '', target_persona: 'Founders and Heads of Sales at B2B SaaS companies', target_icp: 'B2B SaaS, 11-200 employees', why: 'Safe default while I read more about you', alternatives: [], geo: [], tone: '', proof: [], personas: [] };
    await cl.set('target', 'warn', 'default target (AI unavailable)');
    await ctx.step('llm', 'pick_target', `failed: ${errMsg(e)}`);
  }
  const brain: SalesBrain = { company: pick.company, offer: pick.offer, icp: pick.target_icp, personas: pick.personas, tone: pick.tone, proof: pick.proof, sources: docs.map((d) => d.file_type) };
  try { await store.db.from('workspaces').update({ sales_brain: brain, company_domain: domain }).eq('id', ctx.workspaceId); } catch (e) { ctx.log.warn('save brain failed', { err: errMsg(e) }); }

  // 3. Channels (T4) + Connect card (D10)
  await cl.set('channels', 'doing');
  let ch: Channels = { email: { ok: false }, phone: { ok: false, numbers: 0 }, linkedin: { ok: false, senders: 0 } };
  try {
    ch = await checkChannels();
    const miss = [!ch.email.ok && 'email', !ch.phone.ok && 'phone', !ch.linkedin.ok && 'LinkedIn'].filter(Boolean);
    await cl.set('channels', miss.length ? 'warn' : 'done', miss.length ? `${miss.join(', ')} not connected, starting with what works` : 'email · phone · LinkedIn');
    await ctx.step('tool', 'check_channels', `email ${ch.email.ok}, phone ${ch.phone.ok}, linkedin ${ch.linkedin.ok}`);
    if (!ch.linkedin.ok) await postConnect(ctx, 'linkedin').catch((e) => ctx.log.warn('connect card failed', { err: errMsg(e) }));
    if (!ch.email.ok) await postConnect(ctx, 'mailbox').catch((e) => ctx.log.warn('connect card failed', { err: errMsg(e) }));
  } catch (e) { await cl.set('channels', 'warn', errMsg(e)); }

  // 4. Pipeline (T3) + meeting type (T16)
  const patch: Partial<WorkspaceSettings> = {
    target_persona: pick.target_persona, target_icp: pick.target_icp,
    ...(pick.geo.length ? { geo: pick.geo } : {}),
    channels: { email: ch.email.ok, phone: ch.phone.ok, linkedin: ch.linkedin.ok },
    linkedin_connected: ch.linkedin.ok,
    ...(ch.email.mailboxId ? { g8_mailbox_id: ch.email.mailboxId, g8_mailbox_email: ch.email.mailboxEmail } : {}),
    ...(env.G8_DEMO_SCHEDULE_ID ? { g8_schedule_id: env.G8_DEMO_SCHEDULE_ID } : {}),
  };
  await cl.set('pipeline', 'doing');
  try {
    const p = await findPipeline();
    patch.g8_pipeline_id = p.pipelineId;
    if (p.stageId) patch.g8_stage_new_meeting_id = p.stageId;
    await cl.set('pipeline', p.stageId ? 'done' : 'warn', p.stageId ? p.name : `${p.name} (no "New Meeting" stage)`);
    await ctx.step('tool', 'find_pipeline', `${p.name}`, { pipelineId: p.pipelineId, stageId: p.stageId ?? null });
  } catch (e) { await cl.set('pipeline', 'warn', errMsg(e)); }
  await cl.set('meeting', 'doing');
  try {
    const m = await findMeetingType();
    if (m) {
      patch.g8_event_type_id = m.id;
      const url = await bookingUrl(m).catch((e) => { ctx.log.warn('booking url failed', { err: errMsg(e) }); return null; });
      if (url) patch.g8_booking_url = url;
      await cl.set('meeting', 'done', url ? `${m.title} · booking link ready` : m.title);
    }
    else await cl.set('meeting', 'warn', 'no meeting type, connect Google Calendar in graph8');
    await ctx.step('tool', 'setup_meeting_type', m ? m.title : 'none', { eventTypeId: m?.id ?? null });
  } catch (e) { await cl.set('meeting', 'warn', errMsg(e)); }

  // 5. Credits (T5, D13)
  await cl.set('credits', 'doing');
  let credits: number | undefined;
  try {
    credits = (await checkCredits()).available;
    await cl.set('credits', credits < LOW_CREDITS ? 'warn' : 'done', `${fmtNum(credits)} available`);
    if (credits < LOW_CREDITS) {
      await slack.postAs(ROLE, 'hq', { text: `⚠️ graph8 credits low: ${fmtNum(credits)} left. Top up in graph8 to keep the team running.` });
      await ctx.report('alert', 'graph8 credits low', `${fmtNum(credits)} credits left in graph8.`, { credits });
    }
  } catch (e) { await cl.set('credits', 'warn', errMsg(e)); }

  // Save settings before layer extras so they can read ids (pipeline, mailbox, event type).
  try { ctx.settings = await store.patchSettings(ctx.workspaceId, patch); } catch (e) { ctx.log.warn('patch settings failed', { err: errMsg(e) }); }

  // 6. Layer extras (voice agent, intent, AI research …) — each isolated.
  const extras = await runExtras(ctx, cl);

  // 7. Plan card (P2 starts on [Start])
  await cl.add({ ...PLAN_ITEM, state: 'doing' });
  const settings = await store.settings(ctx.workspaceId).catch(() => ({ ...ctx.settings, ...patch }) as WorkspaceSettings);
  const card = planCard({
    company: pick.company || domain, target: pick.target_persona, why: pick.why, alternatives: pick.alternatives,
    dailyFind: settings.daily_find ?? 10, dailyResearch: settings.daily_research ?? 5,
    channels: { email: ch.email.ok, phone: ch.phone.ok, linkedin: ch.linkedin.ok }, extras, credits,
    standupHour: ws.standup_hour ?? 9, taskId: ctx.task.id,
  });
  const planMsg = await slack.postAs(ROLE, 'hq', card);
  await ctx.report('plan', `Plan: ${pick.target_persona}`, `${pick.why}`, {
    target_persona: pick.target_persona, target_icp: pick.target_icp, alternatives: pick.alternatives,
    daily_find: settings.daily_find, daily_research: settings.daily_research, slack_ts: planMsg.ts, slack_channel: planMsg.channel,
  });
  try {
    await store.patchSettings(ctx.workspaceId, { onboarded_at: new Date().toISOString(), plan_slack_ts: planMsg.ts, plan_slack_channel: planMsg.channel, pending_analysis: null } as Partial<WorkspaceSettings>);
    await store.db.from('workspaces').update({ status: 'active' }).eq('id', ctx.workspaceId);
  } catch (e) { ctx.log.warn('activate workspace failed', { err: errMsg(e) }); }
  await cl.set('plan', 'done', 'press Start when ready');
  await cl.title(`Sales team hired for ${domain} ✅`);
  return `Onboarded ${domain}: target ${pick.target_persona}`;
}

async function runExtras(ctx: RunCtx, cl: Checklist): Promise<string[]> {
  const lines: string[] = [];
  let list: ReturnType<typeof layers.all> = [];
  try { list = layers.all(); } catch (e) { ctx.log.warn('layers.all failed', { err: errMsg(e) }); return lines; }
  for (const layer of list) {
    const extra = layer.onboarding;
    if (!extra) continue;
    const key = `extra.${extra.name}`;
    const item: ChecklistItem = { key, label: extra.label, state: 'doing' };
    try { await cl.add(item); } catch { /* checklist edit is cosmetic */ }
    try {
      const r = await withTimeout(extra.run(ctx), EXTRA_TIMEOUT_MS, extra.label);
      await cl.set(key, r.ok ? 'done' : 'warn', r.note);
      if (r.ok) lines.push(r.note ? `${extra.label}: ${r.note}` : extra.label);
      await ctx.step('tool', extra.name, r.ok ? `ok${r.note ? `: ${r.note}` : ''}` : `not ready: ${r.note ?? ''}`);
    } catch (e) {
      await cl.set(key, 'warn', `${errMsg(e)}, continuing without it`).catch(() => undefined);
      await ctx.step('tool', extra.name, `failed: ${errMsg(e)}`);
      await ctx.report('alert', `${extra.label} unavailable`, `Skipped during onboarding: ${errMsg(e)}`, { layer: layer.name }).catch(() => undefined);
    }
  }
  return lines;
}
