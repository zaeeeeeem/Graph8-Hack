/**
 * Hira — Researcher (docs/agents/03-hira.md, H1–H9, tools R1–R6). Task kind `research_leads`.
 * Start enrichment (async) → in parallel: company lookup + open jobs + layer research sources → hooks (Gemini, facts only)
 * → poll ≤ 3 min → H6 verification → disqualify + backfill from Bilal's #6–10 → research card → handoff → delegate Usman.
 */
import type { AgentBrain, RunCtx } from '../contracts';
import type { Channel, DisqualifyReason, JsonObject, LeadContactRow, LeadRow, LeadSignal, UUID } from '../../../shared/types';
import { g8 } from '../lib/g8';
import { store } from '../lib/store';
import { voiceLine } from '../lib/voice';
import { researchCard, type ResearchCardRow } from '../slack/cards/research';
import { wokenByChild } from './bilal';
import { asArray, collectHandles, eachLayer, errMsg, g8ContactUrl, normLinkedin, openProgress, pool, scrubPii, type Progress } from './bilal/util';
import { hiringSignal, lookupCompany, openJobs, type CompanyFacts } from './hira/company';
import { emailUsable, pollJob, readContact, startEnrichment, timing, unlockContacts, verifyEmail, type JobState, type Verdict } from './hira/enrich';
import { writeHook, type Hook } from './hira/hook';

const LAYER_MS = 30_000;
const MAX_BACKFILL_ROUNDS = 2;

export interface HiraInput { lead_ids?: UUID[]; backfill_lead_ids?: UUID[]; test_lead_ids?: UUID[]; list_id?: string | number; test_list_id?: string | number | null; persona_label?: string }

export interface Work {
  lead: LeadRow;
  contact: Partial<LeadContactRow> | null;
  facts: string[];
  signals: LeadSignal[];
  sources: string[];
  email: string | null;
  verdict: Verdict | null;
  phone: string | null;
  linkedin: string | null;
  channels: Channel[];
  pending: boolean;
  hook?: Hook;
  dq?: { reason: DisqualifyReason; note: string };
  replacedBy?: string;
  jobId?: string;
}

// ---------------------------------------------------------------------------
// data access
// ---------------------------------------------------------------------------
export async function loadLeads(workspaceId: UUID, ids: UUID[]): Promise<Work[]> {
  if (!ids.length) return [];
  const { data: leads, error } = await store.db.from('leads').select('*').eq('workspace_id', workspaceId).in('id', ids);
  if (error) throw new Error(`leads read failed: ${error.message}`);
  const { data: contacts } = await store.db.from('lead_contacts').select('*').in('lead_id', ids);
  const byId = new Map<string, any>((contacts ?? []).map((c: any) => [c.lead_id, c]));
  const order = new Map(ids.map((id, i) => [id, i]));
  return (leads ?? [])
    .sort((a: LeadRow, b: LeadRow) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((lead: LeadRow) => {
      const c = byId.get(lead.id) ?? null;
      return {
        lead, contact: c, facts: [], signals: [...(lead.signals ?? [])], sources: [],
        email: c?.email ?? null, verdict: null, phone: c?.phone ?? null, linkedin: c?.linkedin_url ?? null,
        channels: [], pending: false,
      } as Work;
    });
}

/** Fallback when delegated without explicit ids: latest Bilal list, ranked by fit. */
export async function pickFromLatestList(ctx: RunCtx, listId: string | number | undefined, n: number) {
  let q = store.db.from('leads').select('id, is_test_contact, fit_score, g8_list_id').eq('workspace_id', ctx.workspaceId).eq('stage', 'prospect');
  if (listId != null) q = q.eq('g8_list_id', String(listId));
  const { data } = await q.order('fit_score', { ascending: false, nullsFirst: false }).limit(50);
  const rows: any[] = data ?? [];
  const real = rows.filter((r) => !r.is_test_contact).map((r) => r.id as UUID);
  return { lead_ids: real.slice(0, n), backfill_lead_ids: real.slice(n, n + 5), test_lead_ids: rows.filter((r) => r.is_test_contact).map((r) => r.id as UUID), list_id: listId ?? rows[0]?.g8_list_id };
}

async function loadSuppressed(): Promise<Set<string>> {
  const s = new Set<string>();
  try { for (const rec of asArray(await g8.get('/contacts/suppressions', { channel: 'all', limit: 500 }))) collectHandles(rec, s); } catch { /* ignore */ }
  return s;
}

async function offerText(workspaceId: UUID): Promise<string | undefined> {
  try {
    const ws = await store.workspace(workspaceId);
    const b = ws?.sales_brain ?? {};
    return [b.offer, b.icp && `for ${b.icp}`].filter(Boolean).join(' ').slice(0, 400) || undefined;
  } catch { return undefined; }
}

async function spendAction(ctx: RunCtx, action: string, credits: number, meta: JsonObject) {
  if (!credits) return;
  try {
    await store.spend({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, source: 'graph8', action, credits, taskId: ctx.task.id, runId: ctx.runId, meta });
  } catch (e) { ctx.log.warn('spend record failed', { err: errMsg(e) }); }
}

const spendCredits = (ctx: RunCtx, job: JobState, n: number) =>
  spendAction(ctx, 'enrichment', job.credits, { job_id: job.jobId, contacts: n, successful: job.successful });

/** New enrichment hits may be masked again → unlock (already-unlocked ids are free), then read back. */
async function unlockAfterEnrich(ctx: RunCtx, ws: Work[]) {
  try {
    const u = await unlockContacts(ws.map((w) => w.lead.g8_contact_id!).filter(Boolean));
    await spendAction(ctx, 'unlock_contacts', u.credits, { contacts: ws.length, after: 'enrichment' });
  } catch { /* read what is visible */ }
  await pool(ws, 5, applyContact);
}

// ---------------------------------------------------------------------------
// one research round over a set of leads
// ---------------------------------------------------------------------------
export function channelsOf(w: Pick<Work, 'email' | 'verdict' | 'phone' | 'linkedin'>): Channel[] {
  const ch: Channel[] = [];
  if (w.email && emailUsable(w.verdict)) ch.push('email');
  if (w.phone) ch.push('phone');
  if (w.linkedin) ch.push('linkedin');
  return ch;
}

async function applyContact(w: Work) {
  if (!w.lead.g8_contact_id) return;
  try {
    const c = await readContact(w.lead.g8_contact_id);
    w.email = c.email ?? w.email;
    w.phone = c.phone ?? w.phone;
    w.linkedin = w.linkedin ?? c.linkedin;
  } catch { /* keep what we had */ }
}

export async function researchRound(ctx: RunCtx, works: Work[], listId: string | number | undefined, pr: Progress, env: { offer?: string; suppressed: Set<string>; warnings: string[] }): Promise<void> {
  // R1a unlock what graph8 already holds (CRM contacts come back masked `***`; ~1 credit each, reveals email + mobile).
  const inCrm = works.filter((w) => !w.lead.is_test_contact && w.lead.g8_contact_id && !w.email);
  // Unlock is billed even when graph8 holds nothing (live: 5 credits → 0 emails), so only unlock people whose search
  // row showed a masked email/phone (Bilal stores has_email/has_phone; unknown = try).
  const r = (w: Work) => (w.lead.research ?? {}) as { has_email?: boolean; has_phone?: boolean };
  const unlockable = inCrm.filter((w) => r(w).has_email !== false || r(w).has_phone !== false);
  if (unlockable.length) {
    try {
      const u = await unlockContacts(unlockable.map((w) => w.lead.g8_contact_id!));
      await spendAction(ctx, 'unlock_contacts', u.credits, { contacts: unlockable.length });
      await pool(unlockable, 5, applyContact);
      await ctx.step('tool', 'unlock_contacts', `Unlocked ${unlockable.length} contacts (${u.credits} credits), ${unlockable.filter((w) => w.email).length} emails revealed`, { n: unlockable.length, credits: u.credits });
    } catch (e) {
      env.warnings.push(`unlock failed: ${errMsg(e)}`);
    }
  }

  // R1b waterfall enrichment only for those still missing an email (async; polled below while research runs).
  const enrichable = inCrm.filter((w) => !w.email);
  let jobP: Promise<JobState | null> = Promise.resolve(null);
  if (enrichable.length && listId != null) {
    try {
      const jobId = await startEnrichment(enrichable.map((w) => w.lead.g8_contact_id!), listId);
      enrichable.forEach((w) => { w.jobId = jobId; });
      await ctx.step('tool', 'enrich_contacts', `Started enrichment for ${enrichable.length} contacts`, { job_id: jobId, n: enrichable.length });
      jobP = pollJob(jobId).catch((e) => { env.warnings.push(`enrichment polling failed: ${errMsg(e)}`); return null; });
    } catch (e) {
      env.warnings.push(`enrichment not started: ${errMsg(e)}`);
      await pr.set('unlock', 'warn', 'waterfall enrichment unavailable — using unlocked data');
    }
  } else {
    await pr.set('unlock', 'done', `${inCrm.filter((w) => w.email).length}/${inCrm.length} emails unlocked`);
  }

  // R3 company research + layer sources, in parallel with enrichment.
  const companyP = (async () => {
    const domains = [...new Set(works.filter((w) => !w.lead.is_test_contact).map((w) => w.lead.company_domain || w.lead.company_name || ''))].filter(Boolean);
    const facts = new Map<string, CompanyFacts>();
    await pool(domains, 4, async (d) => {
      try { facts.set(d, await lookupCompany(d.includes('.') ? d : null, d.includes('.') ? null : d)); } catch { /* fewer facts */ }
    });
    let jobs = new Map<string, { count: number; titles: string[] }>();
    try { jobs = await openJobs(works.map((w) => w.lead.g8_company_id).filter((x): x is string => !!x)); } catch { /* no hiring signal */ }
    for (const w of works) {
      const f = facts.get(w.lead.company_domain || w.lead.company_name || '');
      if (f) { w.facts.push(...f.facts); w.signals.push(...f.signals); if (f.facts.length) w.sources.push('graph8 company lookup'); }
      const h = hiringSignal(w.lead.g8_company_id ? jobs.get(w.lead.g8_company_id) : undefined);
      if (h) { w.signals.push(h); w.sources.push('graph8 open jobs'); }
      if (w.lead.research && typeof (w.lead.research as any).reason === 'string') w.facts.unshift(`fit: ${(w.lead.research as any).reason}`);
    }
  })();

  const layerP = eachLayer(LAYER_MS, (l) => l.research?.collect(ctx, works.map((w) => w.lead))).then(async (res) => {
    for (const { name, value } of res.ok) {
      for (const w of works) {
        const got = value?.[w.lead.id];
        if (!got) continue;
        w.facts.push(...(got.facts ?? []).map((f) => scrubPii(String(f)).slice(0, 300)));
        for (const s of got.signals ?? []) w.signals.push({ type: String((s as any).type ?? 'intent'), text: String((s as any).text ?? '').slice(0, 160), source: String((s as any).source ?? name) });
        w.sources.push(name);
      }
    }
    for (const f of res.failed) { env.warnings.push(`${f.name} research unavailable`); await pr.add({ key: `layer_${f.name}`, label: `Research from ${f.name}`, state: 'warn', note: 'skipped' }); }
  });

  await Promise.all([companyP, layerP]);
  await pr.set('company', 'done', `${works.filter((w) => w.facts.length).length}/${works.length} with company facts`);

  // H8: wait for enrichment ≤ 3 min.
  const job = await jobP;
  if (job) {
    if (job.status === 'timeout') {
      enrichable.forEach((w) => { w.pending = true; });
      await pr.set('unlock', 'warn', `still running after ${Math.round(timing.maxWaitMs / 60000)} min — handing over what is ready`);
      continueLate(ctx, job.jobId, enrichable.map((w) => w.lead.id), enrichable.length);
    } else {
      await spendCredits(ctx, job, enrichable.length);
      await unlockAfterEnrich(ctx, enrichable);
      await pr.set('unlock', job.status === 'completed' ? 'done' : 'warn', `${job.status}: ${job.successful} found, ${job.credits} credits`);
    }
  }

  // R2 verification (H6) for every email we hold (incl. TEST contacts).
  await pool(works.filter((w) => w.email), 4, async (w) => { w.verdict = await verifyEmail(w.email!); });
  for (const w of works) {
    w.channels = channelsOf(w);
    const dnc = w.lead.do_not_contact || (!!w.email && env.suppressed.has(w.email)) || (!!w.linkedin && env.suppressed.has(normLinkedin(w.linkedin)));
    if (dnc && !w.lead.is_test_contact) w.dq = { reason: 'do_not_contact', note: 'on do-not-contact list' };
    else if (!w.channels.length && !w.pending && !w.lead.is_test_contact) w.dq = { reason: 'no_fit', note: 'no reachable channel' };
  }
  await pr.set('verify', 'done', `${works.filter((w) => w.channels.includes('email')).length} email ready`);

  // R5 hooks for everyone still in.
  await pool(works.filter((w) => !w.dq), 3, async (w) => {
    w.hook = await writeHook(ctx, {
      name: w.lead.full_name, title: w.lead.job_title, company: w.lead.company_name,
      facts: w.facts, signals: w.signals.map((s) => s.text), channels: w.channels, offer: env.offer,
    });
  });
}

// ---------------------------------------------------------------------------
// persistence (PII only in lead_contacts)
// ---------------------------------------------------------------------------
export async function persist(ctx: RunCtx, w: Work) {
  const now = new Date().toISOString();
  const contact: Record<string, unknown> = {
    lead_id: w.lead.id, workspace_id: ctx.workspaceId, email: w.email, email_verified: w.email ? emailUsable(w.verdict) : null,
    phone: w.phone, linkedin_url: w.linkedin, updated_at: now,
    enrichment: { ...(w.contact?.enrichment ?? {}), job_id: w.jobId ?? null, verify: w.verdict, pending: w.pending },
  };
  if (w.jobId && !w.pending) contact.enriched_at = now;
  const { error: e1 } = await store.db.from('lead_contacts').upsert(contact, { onConflict: 'lead_id' });
  if (e1) ctx.log.warn('lead_contacts upsert failed', { err: e1.message });

  const signals = dedupeSignals(w.signals);
  const research = {
    ...(w.lead.research ?? {}),
    hook: w.hook?.why_now ?? null, talking_points: w.hook?.talking_points ?? [], best_channel: w.hook?.best_channel ?? null,
    hook_via: w.hook?.via ?? null, channels: w.channels, email_status: emailStatus(w), facts: w.facts.slice(0, 12),
    sources: [...new Set(w.sources)], research_task_id: ctx.task.id, researched_at: now,
    ...(w.dq ? { disqualify_note: w.dq.note, replaced_by: w.replacedBy ?? null } : {}),
  } as JsonObject;
  const patch: Record<string, unknown> = w.dq
    ? { stage: 'disqualified', disqualify_reason: w.dq.reason, research, signals, stage_changed_at: now }
    : { stage: 'researched', why_now: w.hook?.why_now ?? null, research, signals, stage_changed_at: now };
  const { error: e2 } = await store.db.from('leads').update(patch).eq('id', w.lead.id);
  if (e2) ctx.log.warn('leads update failed', { err: e2.message });

  const summary = w.dq
    ? `Disqualified by Hira: ${w.dq.note}${w.replacedBy ? ` · replaced by ${w.replacedBy}` : ''}`
    : `Researched by Hira · ${w.channels.length ? `reachable via ${w.channels.join(', ')}` : 'contact data pending'} · hook ready`;
  const { error: e3 } = await store.db.from('lead_events').insert({
    workspace_id: ctx.workspaceId, lead_id: w.lead.id, agent_id: ctx.agentId, task_id: ctx.task.id,
    type: w.dq ? 'disqualified' : 'researched', channel: 'system', direction: 'internal', summary: scrubPii(summary).slice(0, 200),
    data: { channels: w.channels, email_status: emailStatus(w), hook_via: w.hook?.via ?? null, pending: w.pending },
  });
  if (e3) ctx.log.warn('lead_events insert failed', { err: e3.message });
}

export function emailStatus(w: Pick<Work, 'email' | 'verdict' | 'pending'>): 'verified' | 'catch-all' | 'pending' | 'none' {
  if (w.pending && !w.email) return 'pending';
  if (w.email && w.verdict === 'valid') return 'verified';
  if (w.email && w.verdict === 'catch-all') return 'catch-all';
  return 'none';
}

function dedupeSignals(s: LeadSignal[]): LeadSignal[] {
  const seen = new Set<string>();
  return s.filter((x) => { const k = `${x.type}|${x.text}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

/** H8: late enrichment results update leads automatically (fire-and-forget, never throws). */
export function continueLate(ctx: RunCtx, jobId: string, leadIds: UUID[], n: number) {
  void (async () => {
    try {
      // Job polling 404s on this org, so a 'timeout' still re-reads the contacts: the waterfall may have landed anyway.
      const job = await pollJob(jobId, timing.lateWaitMs);
      await spendCredits(ctx, job, n);
      const works = await loadLeads(ctx.workspaceId, leadIds);
      await unlockAfterEnrich(ctx, works);
      await pool(works, 4, async (w) => {
        if (w.email) w.verdict = await verifyEmail(w.email);
        w.channels = channelsOf(w);
        w.jobId = jobId;
        await store.db.from('lead_contacts').upsert({
          lead_id: w.lead.id, workspace_id: ctx.workspaceId, email: w.email, email_verified: w.email ? emailUsable(w.verdict) : null,
          phone: w.phone, linkedin_url: w.linkedin, enriched_at: new Date().toISOString(),
          enrichment: { ...(w.contact?.enrichment ?? {}), job_id: jobId, verify: w.verdict, pending: false },
        }, { onConflict: 'lead_id' });
        await store.db.from('leads').update({ research: { ...(w.lead.research ?? {}), channels: w.channels, email_status: emailStatus({ ...w, pending: false }) } }).eq('id', w.lead.id);
        await store.db.from('lead_events').insert({
          workspace_id: ctx.workspaceId, lead_id: w.lead.id, agent_id: ctx.agentId, task_id: ctx.task.id, type: 'note', channel: 'system', direction: 'internal',
          summary: `Contact data arrived late · reachable via ${w.channels.join(', ') || 'none'}`, data: { job_id: jobId },
        });
      });
    } catch (e) { ctx.log.warn('late enrichment update failed', { err: errMsg(e) }); }
  })();
}

// ---------------------------------------------------------------------------
// Playbook
// ---------------------------------------------------------------------------
async function run(ctx: RunCtx): Promise<string> {
  const woke = wokenByChild(ctx); // woken after Usman's build_sequence finished — do not redo research
  if (woke) return woke;
  let input = (ctx.task.input ?? {}) as HiraInput & JsonObject;
  const n = Number(ctx.settings.daily_research ?? 5);
  if (!input.lead_ids?.length) input = { ...input, ...(await pickFromLatestList(ctx, input.list_id ?? ctx.settings.last_run_list_id, n)) };
  const listId = input.list_id ?? ctx.settings.last_run_list_id;
  const primaryIds = [...(input.lead_ids ?? []), ...(input.test_lead_ids ?? [])];
  if (!primaryIds.length) throw new Error('No leads to research (Bilal handed over none).');

  const pr = await openProgress(ctx, `Researching ${input.lead_ids?.length ?? 0} leads`, [
    { key: 'unlock', label: `Unlocking contacts for ${input.lead_ids?.length ?? 0} leads`, state: 'doing' },
    { key: 'company', label: 'Company research (graph8)', state: 'doing' },
    { key: 'verify', label: 'Verifying emails', state: 'todo' },
    { key: 'hooks', label: 'Writing why-now hooks', state: 'todo' },
    { key: 'handoff', label: 'Handing to Usman', state: 'todo' },
  ]);

  const env = { offer: await offerText(ctx.workspaceId), suppressed: await loadSuppressed(), warnings: [] as string[] };
  const all: Work[] = [];
  let round = await loadLeads(ctx.workspaceId, primaryIds);
  const pool6to10 = [...(input.backfill_lead_ids ?? [])];

  for (let r = 0; r <= MAX_BACKFILL_ROUNDS && round.length; r++) {
    await researchRound(ctx, round, listId, pr, env);
    all.push(...round);
    const dq = round.filter((w) => w.dq && !w.lead.is_test_contact);
    if (!dq.length || !pool6to10.length || r === MAX_BACKFILL_ROUNDS) {
      // mark no-replacement rows as-is
      break;
    }
    // R6 backfill from Bilal's #6–10
    const nextIds = pool6to10.splice(0, dq.length);
    const next = await loadLeads(ctx.workspaceId, nextIds);
    dq.forEach((w, i) => { if (next[i]) w.replacedBy = next[i].lead.full_name; });
    await pr.add({ key: `backfill_${r}`, label: `Replacing ${dq.length} lead(s) from Bilal's backup list`, state: 'done' });
    round = next;
  }
  await pr.set('hooks', 'done', `${all.filter((w) => w.hook?.via === 'gemini').length} Gemini · ${all.filter((w) => w.hook?.via === 'fallback').length} fact-template`);

  const ok = all.filter((w) => !w.dq);
  const okReal = ok.filter((w) => !w.lead.is_test_contact);
  const dqd = all.filter((w) => w.dq);
  const emails = ok.filter((w) => w.channels.includes('email')).length;
  const pending = ok.filter((w) => w.pending).length;
  // Wrap-up line in Hira's voice: Gemini writes it while we persist (3 s cap, template fallback) — no added latency.
  const doneLine = voiceLine('researcher', `Researched ${ok.length} leads, ${emails} with a usable email${pending ? ` and ${pending} still pending` : ''}. Handing them to Usman for the sequence.`, { workspaceId: ctx.workspaceId, agentId: ctx.agentId, taskId: ctx.task.id });

  for (const w of all) await persist(ctx, w);

  const cardRows: ResearchCardRow[] = all.map((w) => ({
    name: w.lead.full_name, company: w.lead.company_name ?? '', hook: w.hook?.why_now ?? (w.dq ? '' : 'research pending'),
    channels: w.channels, emailStatus: emailStatus(w), fit: w.lead.fit_score, url: g8ContactUrl(w.lead.g8_contact_id),
    test: w.lead.is_test_contact, disqualified: w.dq ? { reason: w.dq.note, replacement: w.replacedBy } : undefined,
  }));
  const card = researchCard({ rows: cardRows, pendingNote: pending ? `${pending} contact lookups still running — leads update automatically` : undefined, warnings: env.warnings });
  // One message per step: the voice line leads the card (template text only when the voice line failed).
  const line = await doneLine;
  await pr.post(line, [{ type: 'section', text: { type: 'mrkdwn', text: line } }, ...card.blocks]);

  const body = `${okReal.length} researched${ok.length > okReal.length ? ` (+${ok.length - okReal.length} TEST)` : ''}, ${emails} emails usable${dqd.length ? `, ${dqd.length} replaced` : ''}${pending ? `, ${pending} pending` : ''}.`;
  await ctx.report('handoff', `Hira → Usman: ${ok.length} leads researched`, body, {
    researched: okReal.length, test: ok.length - okReal.length, emails, replaced: dqd.length, pending, list_id: listId != null ? String(listId) : null,
  });
  await pr.set('handoff', 'doing');
  await store.db.from('tasks').update({ output: { ...(ctx.task.output ?? {}), handoff_summary: body, lead_ids: okReal.map((w) => w.lead.id) } }).eq('id', ctx.task.id);
  await ctx.delegate('sdr', 'build_sequence', `Build sequence for ${ok.length} researched leads${input.persona_label ? ` · ${input.persona_label}` : ''}`.slice(0, 120), {
    lead_ids: okReal.map((w) => w.lead.id), test_lead_ids: ok.filter((w) => w.lead.is_test_contact).map((w) => w.lead.id),
    pending_lead_ids: ok.filter((w) => w.pending).map((w) => w.lead.id), list_id: listId != null ? String(listId) : null,
    // Only this list may back a graph8 sequence run (it holds allowlisted teammates only).
    test_list_id: input.test_list_id != null ? String(input.test_list_id) : null,
    persona_label: input.persona_label ?? null,
  });
  await pr.set('handoff', 'done');
  return body;
}

export const hira: AgentBrain = { role: 'researcher', run };
export default hira;
