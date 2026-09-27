/**
 * P1 — Onboarding (/hire-sales <domain>). Fixed order; Gemini only picks the target.
 * Every step is wrapped: a failing step becomes ⚠️ on the checklist, never a crashed onboarding.
 */
import { z } from 'zod';
import type { Checklist, ChecklistItem, RunCtx } from '../../contracts';
import type { JsonObject, SalesBrain, WorkspaceSettings } from '../../../../shared/types';
import { g8 } from '../../lib/g8';
import { llm } from '../../lib/llm';
import { store } from '../../lib/store';
import { slack } from '../../lib/slack';
import { layers } from '../../layers';
import { connectCard } from '../../slack/cards/connect';
import { ONBOARD_ITEMS, PLAN_ITEM, onboardTitle, rehireCard } from '../../slack/cards/onboarding';
import { planCard } from '../../slack/cards/plan';
import { errMsg, fmtNum, normDomain, unwrap, withTimeout } from './util';
import { readSite, type SiteText } from '../../lib/site';
import { docsAreAbout, ensureMeetingType, ensurePipeline, ensureSchedule, orgWebsiteDomain, sameCompanyDomain } from './org';

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

const TARGET_SYSTEM = 'You are Ayesha, Head of Sales. Crisp, numbers first. Pick ONE top-priority target from the company docs, say why in one line, list 1-2 alternatives. Never invent customers or numbers not in the docs. No personal data. You sell ONLY for the company at the given website; never describe or pitch any other company.';

/** Company brain source for the prompt: graph8 docs when they're about this domain, else the website text (W13). */
export function brainText(domain: string, docs: G8Doc[], siteText?: string): string {
  if (docs.length) return `Company docs from graph8:\n${docsForPrompt(docs)}`;
  if (siteText?.trim()) return `Company website text (homepage + about page of ${domain}; the only source, extract offer, ICP, persona and proof from it):\n${siteText}`;
  return `(no company docs yet; only the website domain ${domain} is known)`;
}

export async function pickTarget(ctx: RunCtx, domain: string, docs: G8Doc[], siteText?: string): Promise<TargetPick> {
  const text = brainText(domain, docs, siteText);
  const prompt = `Company website: ${domain}\n\n${text}\n\nReturn ONLY this JSON object:
{"company": string, "offer": string (one sentence), "target_persona": string, "target_icp": string (one line), "why": string (ONE sentence, max 25 words, never empty, citing a concrete fact from the docs), "alternatives": string[] (max 2), "geo": string[], "tone": string, "proof": string[] (max 4), "personas": string[] (max 5)}`;
  const r = await llm.json(prompt, TargetPick, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id, system: TARGET_SYSTEM, temperature: 0.2 });
  return { ...r, why: whyLine(r.why, r.target_persona, r.target_icp), alternatives: r.alternatives ?? [], geo: r.geo ?? [], tone: r.tone ?? '', proof: r.proof ?? [], personas: r.personas ?? [] };
}

/** One non-empty sentence (max ~160 chars); falls back to a sentence built from target + ICP. */
export function whyLine(why: string | undefined | null, persona: string, icp: string): string {
  const first = (why ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  if (first.length >= 12) return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
  const who = persona || 'This buyer';
  return icp ? `${who} at ${icp.replace(/[.\s]+$/, '')} feel the pain in your docs most and can say yes fastest.` : `${who} feel the pain in your docs most and can say yes fastest.`;
}

/** Keep checklist notes to one short line. */
export const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Display name: graph8 company profile ("8x Social, Inc." → "8x Social"), else the model's name when it isn't a
 * truncated token of the domain, else the domain. Never "8x" for 8x.social.
 */
export async function companyName(domain: string, modelName?: string, useProfile = true): Promise<string> {
  // The graph8 company profile describes the org's own company — only trust it when selling for that company (W13).
  if (useProfile) try {
    const p = unwrap<any>(await withTimeout(g8.get('/company-profile'), G8_TIMEOUT_MS, 'company-profile'));
    const raw = String(p?.profile?.fields?.company_name?.value ?? '').trim();
    const clean = raw.replace(/,?\s+(inc|llc|ltd|limited|gmbh|corp|corporation|co|pvt)\.?$/i, '').trim();
    if (clean.length >= 3) return clean;
  } catch { /* fall through */ }
  const m = (modelName ?? '').trim();
  const stem = domain.split('.')[0] ?? '';
  if (m.length > stem.length + 1 && !domain.startsWith(m.toLowerCase())) return m;
  // Whole-word brand == domain stem ("Linear" for linear.app); short stems stay ambiguous ("8x" for 8x.social).
  if (stem.length >= 4 && m.toLowerCase() === stem.toLowerCase()) return m[0].toUpperCase() + m.slice(1);
  return domain;
}

// ---------------------------------------------------------------------------
// T2 start_company_analysis (L4)
// ---------------------------------------------------------------------------
/** `force` only when the domain differs from the org's own website (else graph8 reuses/finishes the org's study). */
export async function startAnalysis(domain: string, force = false): Promise<JsonObject> {
  const r = await withTimeout(g8.post('/intelligence/analyze', { website_url: `https://${domain}`, force }), 30_000, 'intelligence/analyze');
  return (unwrap<JsonObject>(r) ?? {}) as JsonObject;
}

/** Poll fallback for the completion webhook. Verified: GET /intelligence/status/{task_id} → { status: 'pending'|…|'completed', progress }. */
export async function analysisStatus(g8TaskId: string): Promise<{ status: string; progress: number }> {
  const r = unwrap<any>(await withTimeout(g8.get(`/intelligence/status/${g8TaskId}`), G8_TIMEOUT_MS, 'intelligence/status')) ?? {};
  return { status: String(r.status ?? 'unknown'), progress: Number(r.progress ?? 0) };
}

// ---------------------------------------------------------------------------
// W13 company brain for ANY domain: graph8 docs if they're about it, else website text now + graph8 study in background.
// ---------------------------------------------------------------------------
export interface CompanyBrain {
  docs: G8Doc[];               // only docs about `domain` ([] when graph8's docs are another company's)
  docsMatch: boolean;
  orgDomain: string | null;    // the graph8 org's own website
  site: SiteText | null;       // website text when docs don't match
  study: string | null;        // graph8 intelligence task id started in the background
}

export async function companyBrain(ctx: RunCtx, domain: string, opts: { startStudy: boolean; site?: typeof readSite }): Promise<CompanyBrain> {
  let all: G8Doc[] = [];
  try { all = await readCompanyDocs(); } catch (e) { ctx.log.warn('read docs failed', { err: errMsg(e) }); }
  const orgDomain = await orgWebsiteDomain().catch(() => null);
  const docsText = all.map((d) => `${d.display_name}\n${(d.content ?? '').slice(0, 20_000)}`).join('\n');
  const docsMatch = all.length > 0 && docsAreAbout(domain, orgDomain, docsText);
  await ctx.step('tool', 'read_company_brain', docsMatch
    ? `${all.length} company docs`
    : all.length ? `${all.length} graph8 docs are about ${orgDomain ?? 'another company'}, not ${domain}; ignored` : 'no company docs in graph8');
  if (docsMatch) return { docs: all, docsMatch, orgDomain, site: null, study: null };

  const [site, study] = await Promise.all([
    (opts.site ?? readSite)(domain).catch(() => null),
    opts.startStudy ? startStudy(ctx, domain, !!orgDomain && !sameCompanyDomain(domain, orgDomain)) : Promise.resolve(null),
  ]);
  await ctx.step('tool', 'read_website', site?.text ? `${site.pages.length} pages, ${site.text.length} chars` : `could not read ${domain}`);
  return { docs: [], docsMatch, orgDomain, site, study };
}

/** Background graph8 intelligence study; the id goes in settings.pending_analysis for the webhook / status poll. */
async function startStudy(ctx: RunCtx, domain: string, force: boolean): Promise<string | null> {
  try {
    const a = await startAnalysis(domain, force);
    const g8TaskId = (a.task_id as string) ?? null;
    await store.patchSettings(ctx.workspaceId, { pending_analysis: { domain, task_id: ctx.task.id, g8_task_id: g8TaskId, started_at: new Date().toISOString(), mode: 'merge' } } as Partial<WorkspaceSettings>);
    await ctx.step('tool', 'start_company_analysis', `graph8 study started${force ? ' (force, new domain)' : ''}`, { status: (a.status as any) ?? null });
    return g8TaskId ?? 'started';
  } catch (e) {
    await ctx.step('tool', 'start_company_analysis', `failed: ${errMsg(e)}`);
    return null;
  }
}

/**
 * graph8 finished studying the site (intelligence.completed / status poll → resumed onboard task on an active workspace).
 * Fold the new docs into sales_brain; keep the running target (the team is already working it) and mention a new one.
 */
export async function mergeAnalysis(ctx: RunCtx, domain: string): Promise<string> {
  let docs: G8Doc[] = [];
  try { docs = await readCompanyDocs(); } catch (e) { ctx.log.warn('read docs failed', { err: errMsg(e) }); }
  const text = docs.map((d) => `${d.display_name}\n${(d.content ?? '').slice(0, 20_000)}`).join('\n');
  const orgDomain = await orgWebsiteDomain().catch(() => null);
  const about = docs.length > 0 && (sameCompanyDomain(domain, orgDomain) || docsAreAbout(domain, null, text));
  if (!about) {
    await ctx.step('tool', 'merge_company_analysis', docs.length ? `graph8 docs still not about ${domain}; kept website brain` : 'graph8 study returned no docs; kept website brain');
    await store.patchSettings(ctx.workspaceId, { pending_analysis: null } as Partial<WorkspaceSettings>).catch(() => undefined);
    return `graph8 study of ${domain} had nothing new`;
  }
  const s = await store.settings(ctx.workspaceId).catch(() => ctx.settings);
  const pick = await pickTarget(ctx, domain, docs);
  const ws = await store.workspace(ctx.workspaceId);
  const prev = (ws.sales_brain ?? {}) as SalesBrain;
  const brain: SalesBrain = { ...prev, offer: pick.offer || prev.offer, icp: prev.icp || pick.target_icp, personas: pick.personas.length ? pick.personas : prev.personas, tone: pick.tone || prev.tone, proof: pick.proof.length ? pick.proof : prev.proof, sources: docs.map((d) => d.file_type) };
  await store.db.from('workspaces').update({ sales_brain: brain }).eq('id', ctx.workspaceId);
  await store.patchSettings(ctx.workspaceId, { pending_analysis: null, brain_source: 'graph8_docs', g8_docs_match: true } as Partial<WorkspaceSettings>);
  const current = String(s.target_persona ?? '');
  const alt = pick.target_persona && pick.target_persona !== current ? ` graph8's study also points at ${short(pick.target_persona, 80)}; say the word and I'll switch.` : '';
  await slack.postAs(ROLE, 'hq', { text: `📚 graph8 finished studying ${domain}: ${docs.length} company docs now back the team's research and emails.${alt}` }).catch(() => undefined);
  await ctx.step('tool', 'merge_company_analysis', `${docs.length} docs merged into company brain`);
  return `Merged graph8 study of ${domain}`;
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
async function postConnect(ctx: RunCtx, account: 'linkedin' | 'mailbox' | 'phone' | 'calendar'): Promise<void> {
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

  // graph8 finished its deep study of a site we started from website text → merge, never a second team/checklist.
  if (input.resumed && ws.status === 'active') return mergeAnalysis(ctx, domain);

  // D19 — never a second team.
  if (ws.status === 'active' && !input.force) {
    const { data: agents } = await store.db.from('agents').select('name,status,sort_order').eq('workspace_id', ctx.workspaceId).order('sort_order');
    await slack.postAs(ROLE, 'hq', rehireCard({ company: ws.name || domain, agents: agents ?? [] }));
    return 'Team already hired';
  }

  const cl = await slack.checklist(ROLE, 'hq', onboardTitle(domain), ONBOARD_ITEMS.map((i) => ({ ...i })));
  const say = (text: string) => slack.postAs(ROLE, cl.channel, { text, threadTs: cl.ts }).catch(() => undefined);

  // 1. Company brain (T1). graph8 docs only when they're about THIS domain; else the website now (W13) + graph8's
  //    deep study in the background (T2/L4), merged by mergeAnalysis() when it completes.
  await cl.set('brain', 'doing');
  const brain0 = await companyBrain(ctx, domain, { startStudy: !input.resumed });
  const { docs, site, docsMatch, orgDomain, study } = brain0;
  if (docsMatch) await cl.set('brain', 'done', `${docs.length} docs`);
  else if (site?.text) await cl.set('brain', 'done', short(`read ${domain}${study ? ', graph8 deep study running' : ''}`));
  else await cl.set('brain', 'warn', study ? `couldn't read ${domain}, graph8 studying it` : `couldn't read ${domain}`);
  if (study && !docsMatch) await say(`Started from ${domain}'s website so the team can begin now. graph8 is studying it in depth too; I'll fold that in when it lands.`);

  // 2. Target (D14)
  await cl.set('target', 'doing');
  let pick: TargetPick;
  try {
    pick = await pickTarget(ctx, domain, docs, site?.text);
    await cl.set('target', 'done', short(pick.target_persona));
  } catch (e) {
    pick = { company: ws.name || domain, offer: '', target_persona: 'Founders and Heads of Sales at B2B SaaS companies', target_icp: 'B2B SaaS, 11-200 employees', why: 'Safe default while I learn more about you.', alternatives: [], geo: [], tone: '', proof: [], personas: [] };
    await cl.set('target', 'warn', 'default target (AI unavailable)');
    await ctx.step('llm', 'pick_target', `failed: ${errMsg(e)}`);
  }
  pick.company = await companyName(domain, pick.company, docsMatch);
  const brain: SalesBrain = { company: pick.company, offer: pick.offer, icp: pick.target_icp, personas: pick.personas, tone: pick.tone, proof: pick.proof, sources: docsMatch ? docs.map((d) => d.file_type) : site?.pages.map((p) => p.url) ?? [] };
  try { await store.db.from('workspaces').update({ sales_brain: brain, company_domain: domain }).eq('id', ctx.workspaceId); } catch (e) { ctx.log.warn('save brain failed', { err: errMsg(e) }); }

  // 3. Channels (T4) + Connect card (D10)
  await cl.set('channels', 'doing');
  let ch: Channels = { email: { ok: false }, phone: { ok: false, numbers: 0 }, linkedin: { ok: false, senders: 0 } };
  try {
    ch = await checkChannels();
    const miss = [!ch.email.ok && 'email', !ch.phone.ok && 'phone', !ch.linkedin.ok && 'LinkedIn'].filter(Boolean);
    await cl.set('channels', miss.length ? 'warn' : 'done', miss.length ? `${miss.join(', ')} not connected` : 'all connected');
    await ctx.step('tool', 'check_channels', `email ${ch.email.ok}, phone ${ch.phone.ok}, linkedin ${ch.linkedin.ok}`);
    if (!ch.linkedin.ok) await postConnect(ctx, 'linkedin').catch((e) => ctx.log.warn('connect card failed', { err: errMsg(e) }));
    if (!ch.email.ok) {
      await postConnect(ctx, 'mailbox').catch((e) => ctx.log.warn('connect card failed', { err: errMsg(e) }));
      await say('No mailbox is connected in graph8, so emails cannot send yet. Research and the sequence still get built; sending starts once you connect one.');
    }
  } catch (e) { await cl.set('channels', 'warn', errMsg(e)); }
  // Sending schedule: reuse an always-on one or create "Graphi 24/7" (steps run on demo time, never held for office hours).
  let scheduleId: string | undefined;
  try {
    const sch = await ensureSchedule(ws.timezone || 'UTC');
    scheduleId = sch.id;
    await ctx.step('tool', 'ensure_schedule', `${sch.created ? 'created' : 'using'} ${sch.name}`, { scheduleId: sch.id });
  } catch (e) { ctx.log.warn('schedule setup failed', { err: errMsg(e) }); await ctx.step('tool', 'ensure_schedule', `failed: ${errMsg(e)}`); }

  // 4. Pipeline (T3) + meeting type (T16)
  const patch: Partial<WorkspaceSettings> = {
    target_persona: pick.target_persona, target_icp: pick.target_icp,
    ...(pick.geo.length ? { geo: pick.geo } : {}),
    channels: { email: ch.email.ok, phone: ch.phone.ok, linkedin: ch.linkedin.ok },
    linkedin_connected: ch.linkedin.ok,
    ...(ch.email.mailboxId ? { g8_mailbox_id: ch.email.mailboxId, g8_mailbox_email: ch.email.mailboxEmail } : {}),
    ...(scheduleId ? { g8_schedule_id: scheduleId } : {}),
    plan_company: pick.company, // layer extras (voice persona) need the name before the plan card
    brain_source: docsMatch ? 'graph8_docs' : site?.text ? 'website' : 'none',
    g8_docs_match: docsMatch,
    ...(orgDomain ? { g8_org_domain: orgDomain } : {}),
  };
  await cl.set('pipeline', 'doing');
  try {
    const p = await ensurePipeline();
    patch.g8_pipeline_id = p.pipelineId;
    patch.g8_stage_new_meeting_id = p.stageId;
    await cl.set('pipeline', 'done', p.created.length ? `${p.name} (created)` : p.name);
    await ctx.step('tool', 'find_pipeline', `${p.name}${p.created.length ? ` (created ${p.created.join(' + ')})` : ''}`, { pipelineId: p.pipelineId, stageId: p.stageId });
  } catch (e) { await cl.set('pipeline', 'warn', errMsg(e)); }
  await cl.set('meeting', 'doing');
  try {
    const m = await ensureMeetingType();
    if (m.id != null) {
      patch.g8_event_type_id = m.id;
      const url = await bookingUrl({ id: m.id, slug: m.slug }).catch((e) => { ctx.log.warn('booking url failed', { err: errMsg(e) }); return null; });
      if (url) patch.g8_booking_url = url;
      await cl.set('meeting', m.calendar ? 'done' : 'warn', short(`${m.title}${m.created ? ' (created)' : ''}${url ? ' + booking link' : ''}${m.calendar ? '' : ', no calendar'}`));
    } else {
      await cl.set('meeting', 'warn', 'no calendar, will offer times by email');
      await postConnect(ctx, 'calendar').catch((e) => ctx.log.warn('connect card failed', { err: errMsg(e) }));
    }
    await ctx.step('tool', 'setup_meeting_type', m.id != null ? `${m.title}${m.created ? ' (created)' : ''}` : 'none (no calendar connected)', { eventTypeId: m.id, calendar: m.calendar });
  } catch (e) { await cl.set('meeting', 'warn', errMsg(e)); }

  // 5. Credits (T5, D13)
  await cl.set('credits', 'doing');
  let credits: number | undefined;
  try {
    credits = (await checkCredits()).available;
    await cl.set('credits', credits < LOW_CREDITS ? 'warn' : 'done', fmtNum(credits));
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
    company: pick.company, target: pick.target_persona, why: pick.why, alternatives: pick.alternatives,
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
    await store.patchSettings(ctx.workspaceId, {
      onboarded_at: new Date().toISOString(), plan_slack_ts: planMsg.ts, plan_slack_channel: planMsg.channel,
      // Keep the background study (W13) pending so mergeAnalysis() runs when graph8 finishes.
      ...(study ? {} : { pending_analysis: null }),
      // [Start] re-renders the card from these (it must never lose the company name or the why).
      plan_company: pick.company, plan_why: pick.why, plan_alternatives: pick.alternatives, plan_extras: extras, plan_credits: credits ?? null,
    } as Partial<WorkspaceSettings>);
    await store.db.from('workspaces').update({ status: 'active' }).eq('id', ctx.workspaceId);
  } catch (e) { ctx.log.warn('activate workspace failed', { err: errMsg(e) }); }
  await cl.set('plan', 'done', 'press Start');
  await cl.title(`Sales team hired for ${pick.company} ✅`);
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
      await cl.set(key, r.ok ? 'done' : 'warn', r.note ? short(r.note) : undefined);
      if (r.ok) lines.push(r.note ? `${extra.label}: ${r.note}` : extra.label);
      await ctx.step('tool', extra.name, r.ok ? `ok${r.note ? `: ${r.note}` : ''}` : `not ready: ${r.note ?? ''}`);
    } catch (e) {
      await cl.set(key, 'warn', `skipped: ${short(errMsg(e), 50)}`).catch(() => undefined);
      await ctx.step('tool', extra.name, `failed: ${errMsg(e)}`);
      await ctx.report('alert', `${extra.label} unavailable`, `Skipped during onboarding: ${errMsg(e)}`, { layer: layer.name }).catch(() => undefined);
    }
  }
  return lines;
}
