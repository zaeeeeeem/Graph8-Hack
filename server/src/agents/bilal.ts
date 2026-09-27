/**
 * Bilal — Scout (docs/agents/02-bilal.md, B1–B14, tools S1–S5). Task kind `find_prospects`.
 * Persona → verified graph8 filters → people-first search (capture off) → dedupe → B12 score → widen ≤ 2 →
 * save top N into one graph8 list → leads/lead_contacts/lead_events → list card → handoff → delegate Hira (top 5).
 */
import type { AgentBrain, RunCtx } from '../contracts';
import type { JsonObject, LeadSignal, UUID } from '../../../shared/types';
import { g8 } from '../lib/g8';
import { store } from '../lib/store';
import { listCard, type ListCardRow } from '../slack/cards/list';
import { describeWidened, personaToPlan, toFilters, widen, type SearchFilter, type SearchPlan } from './bilal/filters';
import { prospectKey, rank, score, toProspect, type Prospect } from './bilal/score';
import {
  asArray, collectHandles, eachLayer, errMsg, g8ContactUrl, normDomain, normLinkedin, openProgress, pool, realEmail, realPhone,
  retryOnce, sleep, todayLabel, unwrap,
} from './bilal/util';

export const SEARCH_LIMIT = 100;
export const MAX_WIDEN = 2;
export const HANDOFF_TOP = 5;
export const STRONG_FIT = 75;
const LAYER_MS = 30_000;

// ---------------------------------------------------------------------------
// S1 read_intent_signals — via layers (L6 intent). Zero layers = empty map.
// ---------------------------------------------------------------------------
export async function readIntentSignals(ctx: RunCtx, persona: string) {
  const res = await eachLayer(LAYER_MS, (l) => l.signals?.(ctx, persona));
  const byDomain = new Map<string, LeadSignal[]>();
  for (const { name, value } of res.ok) {
    for (const c of value ?? []) {
      const d = normDomain(c.domain);
      if (!d) continue;
      const list = byDomain.get(d) ?? [];
      for (const s of c.signals ?? []) {
        const text = String((s as any).text ?? (s as any).keyword ?? (s as any).title ?? (s as any).type ?? 'buying signal');
        list.push({ type: String((s as any).type ?? 'intent'), text: text.slice(0, 80), source: String((s as any).source ?? `graph8 ${name}`) });
      }
      byDomain.set(d, list);
    }
  }
  return { byDomain, failed: res.failed };
}

// ---------------------------------------------------------------------------
// S2 search_people — POST /search/contacts, capture off (B8), retry once (B14).
// ---------------------------------------------------------------------------
export async function searchPeople(filters: SearchFilter[], limit = SEARCH_LIMIT): Promise<{ rows: Prospect[]; total: number }> {
  const r = await retryOnce(() => g8.post('/search/contacts', { filters, page: 1, limit, capture: false }));
  const rows = asArray(r).map(toProspect);
  const total = Number((r as any)?.pagination?.total ?? rows.length);
  return { rows, total };
}

// ---------------------------------------------------------------------------
// S3 check_existing — our leads · graph8 CRM · do-not-contact. (max 2/company is applied in rank())
// ---------------------------------------------------------------------------
export interface Existing { keys: Set<string>; linkedins: Set<string>; suppressed: Set<string> }

export async function loadExisting(workspaceId: UUID): Promise<Existing> {
  const keys = new Set<string>(); const linkedins = new Set<string>(); const suppressed = new Set<string>();
  const { data: leads } = await store.db.from('leads').select('id, full_name, company_domain, company_name').eq('workspace_id', workspaceId);
  for (const l of leads ?? []) keys.add(prospectKey({ linkedin_url: '', full_name: l.full_name ?? '', company_domain: l.company_domain ?? '', company_name: l.company_name ?? '' }));
  const { data: lc } = await store.db.from('lead_contacts').select('linkedin_url').eq('workspace_id', workspaceId);
  for (const c of lc ?? []) if (c.linkedin_url) linkedins.add(normLinkedin(c.linkedin_url));
  try {
    const sup = asArray(await g8.get('/contacts/suppressions', { channel: 'all', limit: 500 }));
    for (const rec of sup) collectHandles(rec, suppressed);
  } catch { /* suppression list unavailable → rely on CRM/lead flags */ }
  return { keys, linkedins, suppressed };
}

export function isKnown(p: Prospect, ex: Existing): boolean {
  return ex.keys.has(prospectKey({ ...p, linkedin_url: '' })) || (!!p.linkedin_url && (ex.linkedins.has(p.linkedin_url) || ex.suppressed.has(p.linkedin_url)));
}

/** "Already in graph8 CRM" (open item 3): GET /contacts name + company partial match, exact first+last compare. */
export async function inCrm(p: Prospect): Promise<boolean> {
  if (!p.last_name) return false;
  try {
    const q: Record<string, unknown> = { name: p.last_name, limit: 10 };
    if (p.company_name) q.company_name = p.company_name;
    const rows = asArray(await g8.get('/contacts', q));
    return rows.some((r: any) => {
      if (p.linkedin_url && normLinkedin(r.linkedin_url) === p.linkedin_url) return true;
      return String(r.first_name ?? '').toLowerCase() === p.first_name.toLowerCase()
        && String(r.last_name ?? '').toLowerCase() === p.last_name.toLowerCase();
    });
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// S5 save_leads — POST /lists + PUT /contacts/assert/batch (free), read back ids from the list.
// ---------------------------------------------------------------------------
export interface SavedContact { g8ContactId: string | null; g8CompanyId: string | null }

export function assertBody(p: Prospect): JsonObject {
  const o: JsonObject = {
    first_name: p.first_name, last_name: p.last_name, job_title: p.job_title, seniority_level: p.seniority_level,
    job_department: p.job_department, linkedin_url: p.linkedin_url ? `https://www.${p.linkedin_url}` : null,
    company_name: p.company_name, company_domain: p.company_domain, country: p.country, state: p.state,
  };
  for (const k of Object.keys(o)) if (o[k] === '' || o[k] == null) delete o[k];
  return o;
}

export async function createList(title: string, description: string): Promise<string> {
  const r = unwrap<any>(await retryOnce(() => g8.post('/lists', { title, type: 'contacts', description })));
  const id = r?.id ?? r?.list_id ?? r?.audience_id;
  if (id == null) throw new Error('graph8 POST /lists returned no id');
  return String(id);
}

export async function assertIntoList(listId: string, contacts: JsonObject[]): Promise<{ created: number; updated: number; errors: number }> {
  if (!contacts.length) return { created: 0, updated: 0, errors: 0 };
  const r = unwrap<any>(await retryOnce(() => g8.put('/contacts/assert/batch', { list_id: Number(listId), contacts, create_missing_fields: false })));
  return { created: Number(r?.created ?? 0), updated: Number(r?.updated ?? 0), errors: Array.isArray(r?.errors) ? r.errors.length : 0 };
}

export async function listMembers(listId: string): Promise<any[]> {
  return asArray(await retryOnce(() => g8.get(`/lists/${listId}/contacts`, { limit: 200 })));
}

export function matchMember(members: any[], m: { linkedin?: string; email?: string | null; first?: string; last?: string }): SavedContact {
  const hit = members.find((r) => (m.linkedin && normLinkedin(r.linkedin_url) === m.linkedin)
    || (m.email && realEmail(r.work_email) === m.email))
    ?? members.find((r) => m.last && String(r.last_name ?? '').toLowerCase() === m.last.toLowerCase()
      && String(r.first_name ?? '').toLowerCase() === (m.first ?? '').toLowerCase());
  return { g8ContactId: hit?.id != null ? String(hit.id) : null, g8CompanyId: hit?.company_id != null ? String(hit.company_id) : null };
}

/**
 * Preferred save (live 10:35 PKT): `POST /search/contacts/save` with `linkedin_url any_of <top N>` creates a list whose
 * contacts carry graph8's protected data (real work email, 0 unlock credits), unlike assert/batch (empty records).
 * 202 + `{list_id, status:'processing'}` → poll the list until the members land (≈3 s). Returns null on failure.
 */
export const saveTiming = { pollMs: 2_000, maxWaitMs: 30_000 };
export async function saveViaSearch(listTitle: string, ps: Prospect[]): Promise<{ listId: string; members: any[] } | null> {
  const lis = [...new Set(ps.map((p) => p.linkedin_raw).filter(Boolean))];
  if (!lis.length) return null;
  try {
    const r = unwrap<any>(await retryOnce(() => g8.post('/search/contacts/save', {
      filters: [{ field: 'linkedin_url', operator: 'any_of', value: lis }], page: 1, limit: 100, max_results: lis.length, list_title: listTitle,
    })));
    const id = r?.list_id ?? r?.id;
    if (id == null) return null;
    const listId = String(id);
    const deadline = Date.now() + saveTiming.maxWaitMs;
    let members: any[] = [];
    while (Date.now() < deadline) {
      members = await listMembers(listId).catch(() => []);
      if (members.length >= lis.length) break;
      await sleep(saveTiming.pollMs);
    }
    return { listId, members };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// U5 — on the first run of a workspace, add the allowlisted teammates as TEST leads (the only contactable ones).
// ---------------------------------------------------------------------------
interface TestContact { allowlistId?: UUID; label: string; email: string | null; phone: string | null; linkedin: string | null }

export async function loadTestContacts(workspaceId: UUID): Promise<TestContact[]> {
  const { count } = await store.db.from('leads').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('is_test_contact', true);
  if ((count ?? 0) > 0) return [];
  const { data } = await store.db.from('contact_allowlist').select('id, label, email, phone, linkedin_url').eq('workspace_id', workspaceId);
  let rows: TestContact[] = (data ?? []).map((r: any) => ({ allowlistId: r.id, label: r.label, email: realEmail(r.email), phone: r.phone ?? null, linkedin: r.linkedin_url ?? null }));
  if (!rows.length) {
    try {
      const { env } = await import('../lib/env');
      rows = (env.allowlist ?? []).map((a) => ({ label: a.name, email: realEmail(a.email), phone: a.phone ?? null, linkedin: a.linkedin ?? null }));
    } catch { rows = []; }
  }
  return rows.filter((r) => r.email || r.phone || r.linkedin);
}

function splitName(label: string): { first: string; last: string } {
  const clean = label.replace(/\(.*?\)/g, '').trim();
  const [first, ...rest] = clean.split(/\s+/);
  return { first: first || clean || 'Test', last: rest.join(' ') || '(team)' };
}

// ---------------------------------------------------------------------------
// Playbook
// ---------------------------------------------------------------------------
export interface BilalInput { persona?: string; target_persona?: string | null; count?: number; research_count?: number; geo?: string[]; icp?: string; target_icp?: string | null }

/**
 * runtime: ctx.delegate() blocks this task on Hira's and re-runs us with task.output.last_child when she finishes.
 * That wake must not redo the search — just close the task with the chain's outcome.
 */
export function wokenByChild(ctx: RunCtx): string | null {
  const lc = (ctx.task.output as any)?.last_child;
  if (!lc) return null;
  const done = (ctx.task.output as any)?.handoff_summary as string | undefined;
  return `${done ?? 'Prospects handed over'} · T-${lc.number} ${lc.status}${lc.result_summary ? `: ${String(lc.result_summary).slice(0, 160)}` : ''}`;
}

async function run(ctx: RunCtx): Promise<string> {
  const woke = wokenByChild(ctx);
  if (woke) return woke;
  const input = (ctx.task.input ?? {}) as BilalInput & JsonObject;
  const persona = String(input.persona ?? input.target_persona ?? ctx.settings.target_persona ?? input.target_icp ?? ctx.settings.target_icp ?? '').trim();
  if (!persona) throw new Error('No target persona set (settings.target_persona empty and no task input).');
  const want = Math.max(1, Math.min(50, Number(input.count ?? ctx.settings.daily_find ?? 10)));
  const geo = (input.geo as string[] | undefined)?.length ? (input.geo as string[]) : ctx.settings.geo ?? [];
  const handoffN = Math.max(1, Math.min(want, Number(input.research_count ?? ctx.settings.daily_research ?? HANDOFF_TOP)));

  const pr = await openProgress(ctx, `Finding ${want} prospects`, [
    { key: 'target', label: 'Reading target', state: 'doing' },
    { key: 'signals', label: 'Checking buying signals', state: 'todo' },
    { key: 'search', label: 'Searching graph8', state: 'todo' },
    { key: 'dedupe', label: 'Skipping known / do-not-contact', state: 'todo' },
    { key: 'save', label: 'Saving list in graph8', state: 'todo' },
    { key: 'handoff', label: 'Handing top 5 to Hira', state: 'todo' },
  ]);

  // 1. persona → filters
  const { plan, via, note } = await personaToPlan(ctx, persona, { icp: input.icp ?? input.target_icp ?? ctx.settings.target_icp, geo });
  await ctx.step('llm', 'persona_to_filters', `Mapped persona via ${via}: ${plan.label}`, { plan: planJson(plan) });
  await pr.set('target', via === 'gemini' ? 'done' : 'warn', via === 'gemini' ? plan.label : `keyword fallback (${note ?? 'no LLM'})`);

  // 2. S1 intent (layers) — company-first for those domains
  await pr.set('signals', 'doing');
  const intent = await readIntentSignals(ctx, persona);
  for (const f of intent.failed) await pr.add({ key: `layer_${f.name}`, label: `Signals from ${f.name}`, state: 'warn', note: 'unavailable, fit-only' });
  await pr.set('signals', 'done', intent.byDomain.size ? `${intent.byDomain.size} companies showing intent` : 'none yet — fit-only ranking');

  // 3. S2 search (+ widen ≤ 2) · S3 dedupe · S4 score
  await pr.set('search', 'doing');
  const existing = await loadExisting(ctx.workspaceId);
  const seen = new Map<string, Prospect>();
  let searched = 0; let total = 0; let crmSkipped = 0; let knownSkipped = 0;
  const crmChecked = new Map<string, boolean>();

  const collect = async (filters: SearchFilter[]) => {
    const r = await searchPeople(filters);
    searched += r.rows.length; total += r.total;
    for (const p of r.rows) {
      const k = prospectKey(p);
      if (seen.has(k)) continue;
      if (isKnown(p, existing)) { knownSkipped++; continue; }
      p.signals = intent.byDomain.get(p.company_domain) ?? [];
      seen.set(k, p);
    }
  };

  const pick = async (): Promise<Prospect[]> => {
    const scored = [...seen.values()].map((p) => score(p, plan));
    // CRM check only on the ranked head (cheap, bounded).
    let top = rank(scored, want);
    for (let guard = 0; guard < 3; guard++) {
      const unchecked = top.filter((p) => !crmChecked.has(prospectKey(p)));
      if (!unchecked.length) break;
      await pool(unchecked, 5, async (p) => { crmChecked.set(prospectKey(p), await inCrm(p)); });
      const drop = top.filter((p) => crmChecked.get(prospectKey(p)));
      if (!drop.length) break;
      for (const p of drop) { seen.delete(prospectKey(p)); crmSkipped++; }
      top = rank([...seen.values()].map((p) => score(p, plan)), want);
    }
    return top;
  };

  await collect(toFilters(plan));
  if (intent.byDomain.size) {
    const titleF = toFilters(plan).filter((f) => f.field === 'job_title' || f.field === 'seniority_level');
    try { await collect([...titleF, { field: 'company_domain', operator: 'any_of', value: [...intent.byDomain.keys()].slice(0, 50) }]); } catch (e) {
      ctx.log.warn('company-first search failed', { err: errMsg(e) });
    }
  }
  let top = await pick();
  let steps = 0;
  while (top.length < want && steps < MAX_WIDEN && widen(plan)) {
    steps++;
    await pr.set('search', 'doing', `only ${top.length} — widening ${plan.widened.at(-1)}`);
    await collect(toFilters(plan));
    top = await pick();
  }
  await ctx.step('tool', 'search_people', `Searched graph8: ${searched} rows (${total} total matches), ${steps} widen step(s)`, { searched, total, widened: plan.widened });
  await pr.set('search', top.length ? 'done' : 'fail', `${total} matches in graph8`);
  await pr.set('dedupe', 'done', `skipped ${knownSkipped} known, ${crmSkipped} already in CRM`);
  if (!top.length) throw new Error(`No prospects found for "${plan.label}" even after widening.`);

  // 4. S5 save — one list per run + TEST contacts on first run (U5)
  await pr.set('save', 'doing');
  const listName = `Sales Team · ${todayLabel()} · ${plan.label}`.slice(0, 120);
  const tests = await loadTestContacts(ctx.workspaceId);
  const viaSearch = await saveViaSearch(listName, top);
  const listId = viaSearch?.listId ?? await createList(listName, `Bilal (Scout) run T-${ctx.task.number}: ${persona}`.slice(0, 250));
  // Anyone the search-save missed (or everyone, if it failed) is upserted by assert/batch into the same list.
  const missed = top.filter((p) => !viaSearch || !matchMember(viaSearch.members, { linkedin: p.linkedin_url }).g8ContactId);
  const saved = await assertIntoList(listId, missed.map(assertBody));
  const savedVia = viaSearch ? `search-save ${top.length - missed.length}, assert ${missed.length}` : 'assert (search-save unavailable)';
  let testSaved = { created: 0, updated: 0, errors: 0 };
  // TEST teammates get their OWN list: graph8 `/run` enrolls a sequence's whole associated list (verify core.md),
  // so real prospects and contactable teammates must never share one.
  let testListId: string | null = null;
  let testMembers: any[] = [];
  if (tests.length) {
    testListId = await createList(`Sales Team · TEST contacts · ${todayLabel()}`, 'Allowlisted teammates only — the only contacts sequences may enroll.');
    testSaved = await assertIntoList(testListId, tests.map((t) => {
      const n = splitName(t.label);
      const o: JsonObject = { first_name: n.first, last_name: n.last, job_title: 'TEST contact', company_name: 'TEST (team)' };
      if (t.email) o.work_email = t.email;
      if (t.phone) o.mobile_phone = t.phone;
      if (t.linkedin) o.linkedin_url = t.linkedin;
      return o;
    }));
  }
  const members = await listMembers(listId);
  if (testListId) testMembers = await listMembers(testListId);
  await ctx.step('tool', 'save_leads', `Saved ${top.length} prospects to graph8 list ${listId} via ${savedVia} (assert created ${saved.created}, updated ${saved.updated}, errors ${saved.errors})${tests.length ? ` + ${tests.length} TEST` : ''}`, { list_id: listId, test_list_id: testListId, ...saved, tests: testSaved });

  // 5. Supabase mirror
  const rows = top.map((p, i) => {
    const m = matchMember(members, { linkedin: p.linkedin_url, first: p.first_name, last: p.last_name });
    return {
      workspace_id: ctx.workspaceId, owner_agent_id: ctx.agentId, g8_contact_id: m.g8ContactId, g8_company_id: m.g8CompanyId,
      g8_list_id: listId, full_name: p.full_name, job_title: p.job_title || null, company_name: p.company_name || null,
      company_domain: p.company_domain || null, location: [p.state, p.country].filter(Boolean).join(', ') || null,
      source: p.signals.length ? 'signal' : 'scout', stage: 'prospect', fit_score: p.fit_score ?? null, signals: p.signals,
      is_test_contact: false,
      research: {
        rank: i + 1, reason: p.reason ?? '', confidence: p.confidence_score, breakdown: p.breakdown ?? {}, has_email: p.has_email, has_phone: p.has_phone,
        seniority: p.seniority_level, industry: p.company_industry, size: p.company_employee_count,
        find_task_id: ctx.task.id, handoff: i < handoffN ? 'hira' : 'backfill',
      } as JsonObject,
    };
  });
  const testRows = tests.map((t) => {
    const n = splitName(t.label);
    const m = matchMember(testMembers, { email: t.email, linkedin: normLinkedin(t.linkedin), first: n.first, last: n.last });
    return {
      workspace_id: ctx.workspaceId, owner_agent_id: ctx.agentId, g8_contact_id: m.g8ContactId, g8_company_id: m.g8CompanyId,
      g8_list_id: testListId, full_name: t.label, job_title: 'TEST contact', company_name: 'TEST (team)', company_domain: null,
      location: null, source: 'manual', stage: 'prospect', fit_score: null, signals: [], is_test_contact: true,
      research: { label: 'TEST', find_task_id: ctx.task.id, handoff: 'hira' } as JsonObject,
    };
  });
  const { data: inserted, error } = await store.db.from('leads').insert([...rows, ...testRows]).select('id, g8_contact_id, full_name, is_test_contact');
  if (error) throw new Error(`leads insert failed: ${error.message}`);
  const ids: Array<{ id: UUID; is_test_contact: boolean }> = inserted ?? [];
  const leadIds = ids.slice(0, rows.length).map((r) => r.id);
  const testLeadIds = ids.slice(rows.length).map((r) => r.id);

  const contacts = [
    ...top.map((p, i) => {
      const mem = members.find((r) => p.linkedin_url && normLinkedin(r.linkedin_url) === p.linkedin_url);
      return {
        lead_id: leadIds[i], workspace_id: ctx.workspaceId, linkedin_url: p.linkedin_url ? `https://www.${p.linkedin_url}` : null,
        email: realEmail(mem?.work_email), phone: realPhone(mem?.mobile_phone) ?? realPhone(mem?.direct_phone),
      };
    }),
    ...tests.map((t, i) => ({ lead_id: testLeadIds[i], workspace_id: ctx.workspaceId, email: t.email, phone: realPhone(t.phone), linkedin_url: t.linkedin, email_verified: null })),
  ].filter((c) => c.lead_id);
  if (contacts.length) {
    const { error: e2 } = await store.db.from('lead_contacts').upsert(contacts, { onConflict: 'lead_id' });
    if (e2) ctx.log.warn('lead_contacts upsert failed', { err: e2.message });
  }
  const events = [
    ...top.map((p, i) => ({ workspace_id: ctx.workspaceId, lead_id: leadIds[i], agent_id: ctx.agentId, task_id: ctx.task.id, type: 'found', channel: 'system', direction: 'internal',
      summary: `Found by Bilal · fit ${p.fit_score} · ${p.job_title || 'role n/a'} at ${p.company_name || 'n/a'}`.slice(0, 200),
      data: { fit_score: p.fit_score ?? null, rank: i + 1, list_id: listId } })),
    ...tests.map((t, i) => ({ workspace_id: ctx.workspaceId, lead_id: testLeadIds[i], agent_id: ctx.agentId, task_id: ctx.task.id, type: 'found', channel: 'system', direction: 'internal',
      summary: 'Added as TEST lead (team, allowlisted)', data: { test: true, list_id: testListId } })),
  ].filter((e) => e.lead_id);
  if (events.length) {
    const { error: e3 } = await store.db.from('lead_events').insert(events);
    if (e3) ctx.log.warn('lead_events insert failed', { err: e3.message });
  }
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const g8Id = testRows[i]?.g8_contact_id;
    if (t.allowlistId && g8Id) await store.db.from('contact_allowlist').update({ g8_contact_id: g8Id }).eq('id', t.allowlistId);
  }
  try { await store.patchSettings(ctx.workspaceId, { last_run_list_id: Number(listId) }); } catch (e) { ctx.log.warn('patchSettings failed', { err: errMsg(e) }); }
  await pr.set('save', 'done', `list "${listName}"${tests.length ? ` + ${tests.length} TEST` : ''}`);

  // 6. card + handoff + delegate Hira
  const strong = top.filter((p) => (p.fit_score ?? 0) >= STRONG_FIT).length;
  const widenedTxt = describeWidened(plan);
  const cardRows: ListCardRow[] = [
    ...top.map((p, i) => ({ name: p.full_name, title: p.job_title, company: p.company_name, fit: p.fit_score ?? null, reason: p.reason ?? '', url: g8ContactUrl(rows[i].g8_contact_id), toHira: i < handoffN })),
    ...tests.map((t) => ({ name: t.label, title: 'TEST', company: 'team', fit: null, reason: 'allowlisted teammate', url: g8ContactUrl(null), toHira: true, test: true })),
  ];
  const card = listCard({
    listName, rows: cardRows, strong, widened: widenedTxt || undefined,
    signalsNote: intent.byDomain.size ? `${top.filter((p) => p.signals.length).length} with buying signals` : undefined,
  });
  await pr.post(card.text, card.blocks);

  const handoffTop = leadIds.slice(0, handoffN);
  const backfill = leadIds.slice(handoffN);
  const body = `Found ${top.length}, ${strong} strong${widenedTxt ? `; widened ${widenedTxt}` : ''}. Top ${handoffTop.length} → Hira${tests.length ? ` (+${tests.length} TEST teammates)` : ''}.`;
  await ctx.report('handoff', `Bilal → Hira: ${top.length} prospects`, body, {
    found: top.length, strong, widened: plan.widened, list_id: listId, persona_label: plan.label, test_leads: tests.length,
  });
  await pr.set('handoff', 'doing');
  await store.db.from('tasks').update({ output: { ...(ctx.task.output ?? {}), handoff_summary: body, list_id: listId, test_list_id: testListId, lead_ids: leadIds, test_lead_ids: testLeadIds } }).eq('id', ctx.task.id);
  await ctx.delegate('researcher', 'research_leads', `Research top ${handoffTop.length} leads · ${plan.label}`.slice(0, 120), {
    lead_ids: handoffTop, backfill_lead_ids: backfill, test_lead_ids: testLeadIds, list_id: listId, test_list_id: testListId,
    persona, persona_label: plan.label,
  });
  await pr.set('handoff', 'done');
  return body;
}

function planJson(p: SearchPlan): JsonObject {
  return { label: p.label, titles: p.titles, adjacent_titles: p.adjacentTitles, seniority: p.seniority, industries: p.industries, sizes: p.sizes, countries: p.countries, nearby_countries: p.nearbyCountries };
}

export const bilal: AgentBrain = { role: 'scout', run };
export default bilal;
