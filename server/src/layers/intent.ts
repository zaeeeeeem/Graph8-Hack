/**
 * L6 intent — buying-signal tracking (docs/BUILD-PLAN.md §4 L6, live shapes in docs/verify/layers.md V-N1).
 *
 * onboarding `setup_intent_tracking`: Gemini picks 5 short keyword phrases (+2 fallbacks each) from the graph8
 *   `icp_research` / `pains_and_gains` docs → `POST /intent/keywords/create-from-search` (free; acceptance is flaky,
 *   so failed phrases are retried with their fallbacks) → accepted phrases also tracked as `signal_type:'jobs'`
 *   via `POST /intent/keywords/add` → ids stored in settings.g8_intent_keyword_ids.
 * signals(): `POST /intent/keywords/{id}/companies` (unwrapped `{rows}`) + `GET /intent/abm/companies`
 *   (`{data:{items}}`) → per-domain intent signals for Bilal. 20 s cap, [] on any failure ("no buying signals yet").
 *
 * Never throws out of a hook. Kill switch: LAYERS_DISABLED=intent.
 */
import { z } from 'zod';
import type { JsonObject, WorkspaceSettings } from '../../../shared/types';
import type { G8, Layer, Llm, Logger, RunCtx, Store } from '../contracts';
import { g8 as liveG8 } from '../lib/g8';
import { layers } from '../layers';
import { llm as liveLlm } from '../lib/llm';
import { log as rootLog } from '../lib/log';
import { store as liveStore } from '../lib/store';

export const LAYER_NAME = 'intent';
const ONBOARD_BUDGET_MS = 38_000; // Ayesha wraps extras in 45 s; finish (and persist) before that.
const SIGNALS_BUDGET_MS = 20_000;
const CONTACT_LIMIT = 50;
const PAGE_LIMIT = 10;
const MAX_KEYWORDS = 5;
const MAX_SIGNALS_PER_DOMAIN = 3;
const DOC_TYPES = ['icp_research', 'pains_and_gains'];

export interface Deps { g8: Pick<G8, 'get' | 'post'>; llm: Llm; store: Pick<Store, 'patchSettings'>; log: Logger }
const live = (): Deps => ({ g8: liveG8, llm: liveLlm, store: liveStore, log: rootLog.child('intent') });

const unwrap = (r: any): any => (r && typeof r === 'object' && 'data' in r ? r.data : r);
const errMsg = (e: unknown) => String((e as any)?.message ?? e).slice(0, 160);

class Deadline {
  private end: number;
  constructor(ms: number) { this.end = Date.now() + ms; }
  left() { return this.end - Date.now(); }
  race<T>(p: Promise<T>, what: string): Promise<T> {
    const ms = this.left();
    if (ms <= 0) return Promise.reject(new Error(`${what}: out of time`));
    let t: NodeJS.Timeout;
    return Promise.race([
      p,
      new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: timeout`)), ms); }),
    ]).finally(() => clearTimeout(t));
  }
}

// ---------------------------------------------------------------------------
// onboarding: setup_intent_tracking
// ---------------------------------------------------------------------------
const Kw = z.object({
  phrase: z.string().min(2),
  fallbacks: z.array(z.string()).default([]).transform((a) => a.slice(0, 2)),
});
/** Lenient: Gemini sometimes returns a bare array or {keyword} instead of {phrase}. */
export const KeywordPlan = z.preprocess((v: any) => {
  const arr = Array.isArray(v) ? v : v?.keywords;
  if (!Array.isArray(arr)) return v;
  return { keywords: arr.map((k: any) => (typeof k === 'string' ? { phrase: k } : { phrase: k?.phrase ?? k?.keyword, fallbacks: k?.fallbacks ?? k?.alternatives })) };
}, z.object({ keywords: z.array(Kw).min(1).transform((a) => a.slice(0, MAX_KEYWORDS)) }));
export type KeywordPlan = z.infer<typeof KeywordPlan>;

async function readDocs(d: Deps, dl: Deadline): Promise<string> {
  const r = await dl.race(d.g8.get('/global-context/documents', { include_content: true }), 'global-context');
  const docs: any[] = Array.isArray(unwrap(r)) ? unwrap(r) : [];
  return docs
    .filter((x) => DOC_TYPES.includes(x?.file_type) && String(x?.content ?? '').trim())
    .map((x) => `### ${x.display_name ?? x.file_type}\n${String(x.content).slice(0, 6_000)}`)
    .join('\n\n');
}

function keywordPrompt(docs: string, target?: string): string {
  return [
    'You pick buying-intent keywords for a B2B sales team. graph8 matches each keyword against a web-page index of',
    'articles that target buyers read, so phrases must be SHORT (2-5 words), plain topic language that appears in real',
    'articles (e.g. "UGC video creators for brands"), not jargon, not our brand name, not questions.',
    `Return exactly ${MAX_KEYWORDS} keywords, each with 2 fallback phrasings (broader / more common wording).`,
    'Respond with JSON only, exactly this shape:',
    '{"keywords":[{"phrase":"ugc video creators for brands","fallbacks":["creator content for ecommerce","influencer video marketing"]}]}',
    target ? `Target buyer: ${target}` : '',
    'Company docs:',
    docs || '(none — infer from the target buyer)',
  ].filter(Boolean).join('\n');
}

interface CfsResult { keyword: string; keyword_id?: string | null; status: string; companies_seeded?: number; error?: string | null }
interface Slot { tries: string[]; id?: string; phrase?: string; companies: number }
const RESERVE_MS = 4_000; // kept for list-reconcile + settings write

async function createOne(d: Deps, dl: Deadline, phrase: string): Promise<CfsResult | undefined> {
  const r = await dl.race(d.g8.post('/intent/keywords/create-from-search', {
    keywords: [phrase], contact_limit: CONTACT_LIMIT, page_limit: PAGE_LIMIT,
  }), 'create-from-search');
  const res: CfsResult[] = unwrap(r)?.results ?? [];
  return Array.isArray(res) ? res.find((x) => String(x.keyword ?? '').trim().toLowerCase() === phrase.toLowerCase()) ?? res[0] : undefined;
}

/** One slot = primary then its fallbacks, tried in order until graph8 accepts one. Slots run in parallel. */
async function resolveSlot(d: Deps, create: Deadline, s: Slot): Promise<void> {
  for (const phrase of s.tries) {
    if (create.left() < 3_000) return;
    try {
      const hit = await createOne(d, create, phrase);
      // 'skipped' = already tracked; still usable when graph8 returns its id.
      if (hit?.keyword_id && (hit.status === 'created' || hit.status === 'skipped')) {
        s.id = hit.keyword_id; s.phrase = phrase; s.companies = Number(hit.companies_seeded ?? 0);
        return;
      }
    } catch (e) {
      // Timeouts are common (graph8 seeds pages synchronously); it may still save the keyword — reconcile later.
      d.log.warn('intent: create-from-search failed', { err: errMsg(e) });
      return;
    }
  }
}

/** Recover keywords graph8 saved after our client gave up: match tried phrases in POST /intent/keywords/list. */
async function reconcile(d: Deps, dl: Deadline, slots: Slot[]): Promise<void> {
  const r = await dl.race(d.g8.post('/intent/keywords/list', { limit: 200 }), 'keywords/list');
  const rows: any[] = unwrap(r)?.rows ?? [];
  const byText = new Map<string, any>();
  for (const k of Array.isArray(rows) ? rows : []) if (k?.signal_type === 'intent' && k?.id) byText.set(String(k.keyword).trim().toLowerCase(), k);
  for (const s of slots) {
    if (s.id) continue;
    for (const phrase of s.tries) {
      const k = byText.get(phrase.toLowerCase());
      if (k) { s.id = String(k.id); s.phrase = phrase; s.companies = Number(k.total_resolved_companies ?? 0); break; }
    }
  }
}

/** POST /intent/keywords/add signal_type 'jobs' and append created ids to settings. Never rejects. */
async function trackJobs(d: Deps, workspaceId: string, phrases: string[], intentIds: string[]): Promise<void> {
  try {
    const r = unwrap(await new Deadline(60_000).race(d.g8.post('/intent/keywords/add', { keywords: phrases, signal_type: 'jobs' }), 'keywords/add'));
    const jobIds: string[] = (Array.isArray(r?.created) ? r.created : []).map((c: any) => c?.id).filter(Boolean).map(String);
    if (jobIds.length) await d.store.patchSettings(workspaceId, { g8_intent_keyword_ids: [...new Set([...intentIds, ...jobIds])] } as Partial<WorkspaceSettings>);
  } catch (e) { d.log.warn('intent: jobs keywords failed', { err: errMsg(e) }); }
}

export async function setupIntentTracking(ctx: RunCtx, d: Deps = live(), opts: { awaitJobs?: boolean } = {}): Promise<{ ok: boolean; note?: string }> {
  const dl = new Deadline(ONBOARD_BUDGET_MS);
  try {
    let docs = '';
    // W13: graph8 docs about another company → keywords from the target buyer only.
    if (ctx.settings?.g8_docs_match !== false) try { docs = await readDocs(d, dl); } catch (e) { d.log.warn('intent: docs read failed', { err: errMsg(e) }); }
    const target = typeof ctx.settings?.target_persona === 'string' ? ctx.settings.target_persona : undefined;
    const plan: KeywordPlan = KeywordPlan.parse(await dl.race(d.llm.json<KeywordPlan>(keywordPrompt(docs, target), KeywordPlan as unknown as z.ZodType<KeywordPlan>, {
      agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task?.id, temperature: 0.3,
    }), 'keyword plan'));

    const slots: Slot[] = plan.keywords.map((k) => ({
      tries: [k.phrase, ...k.fallbacks].map((x) => x.trim()).filter(Boolean).slice(0, 3), companies: 0,
    }));
    const create = new Deadline(Math.max(0, dl.left() - RESERVE_MS));
    await Promise.allSettled(slots.map((s) => resolveSlot(d, create, s)));
    if (slots.some((s) => !s.id)) {
      try { await reconcile(d, dl, slots); } catch (e) { d.log.warn('intent: reconcile failed', { err: errMsg(e) }); }
    }
    await ctx.step('tool', 'intent.create_from_search', `${slots.filter((s) => s.id).length}/${slots.length} keywords accepted`).catch(() => undefined);

    const accepted = slots.filter((s) => s.id);
    const ids: string[] = accepted.map((s) => s.id!);
    if (!ids.length) return { ok: false, note: `0/${slots.length} keywords accepted by graph8, no buying signals yet` };
    const prev = Array.isArray(ctx.settings?.g8_intent_keyword_ids) ? ctx.settings.g8_intent_keyword_ids : [];
    const merged = [...new Set([...prev, ...ids])];
    await d.store.patchSettings(ctx.workspaceId, { g8_intent_keyword_ids: merged } as Partial<WorkspaceSettings>);
    // Hiring signals on the same topics. graph8 is slow here, so it runs after we return and appends its ids.
    const jobs = trackJobs(d, ctx.workspaceId, accepted.map((s) => s.phrase!), merged);
    if (opts.awaitJobs) await jobs;
    const companies = accepted.reduce((n, s) => n + s.companies, 0);
    return { ok: true, note: `tracking ${accepted.length}/${slots.length} buying-intent keywords${companies ? `, ${companies} companies matched` : ''}` };
  } catch (e) {
    d.log.warn('intent: setup failed', { err: errMsg(e) });
    return { ok: false, note: `intent setup skipped (${errMsg(e)})` };
  }
}

// ---------------------------------------------------------------------------
// signals: per-domain intent signals for Bilal
// ---------------------------------------------------------------------------
export type DomainSignals = Array<{ domain: string; signals: JsonObject[] }>;

const normDomain = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export async function readSignals(ctx: Pick<RunCtx, 'settings'>, _persona: string, d: Deps = live()): Promise<DomainSignals> {
  const dl = new Deadline(SIGNALS_BUDGET_MS);
  const ids = (Array.isArray(ctx.settings?.g8_intent_keyword_ids) ? ctx.settings.g8_intent_keyword_ids : []).filter(Boolean).slice(0, 12) as string[];
  const byDomain = new Map<string, Set<string>>();
  const add = (domain: unknown, text: string) => {
    const dm = normDomain(domain);
    if (!dm || !text) return;
    const set = byDomain.get(dm) ?? new Set<string>();
    set.add(text);
    byDomain.set(dm, set);
  };

  const perKeyword = ids.map(async (id) => {
    const r = await dl.race(d.g8.post(`/intent/keywords/${id}/companies`, { limit: 100 }), 'keyword companies');
    const rows: any[] = unwrap(r)?.rows ?? [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const page = row.page_title || row.page_url;
      add(row.COMPANY_DOMAIN ?? row.company_domain, page ? `researching: ${String(page).slice(0, 120)}` : 'intent match on tracked keyword');
    }
  });
  const abm = (async () => {
    const r = await dl.race(d.g8.get('/intent/abm/companies', { days: 30, limit: 100, ...(ids.length ? { keyword_ids: ids.join(',') } : {}) }), 'abm companies');
    const items: any[] = unwrap(r)?.items ?? [];
    for (const it of Array.isArray(items) ? items : []) {
      const kws = (Array.isArray(it.top_keywords) ? it.top_keywords : []).map((k: any) => k?.keyword).filter(Boolean).slice(0, 3);
      const n = Number(it.total_signal_count ?? 0);
      const strength = it.is_high_intent ? 'high intent' : `${it.account_strength ?? 'weak'} account`;
      add(it.company_domain, `${strength}: ${n} signal${n === 1 ? '' : 's'}${kws.length ? ` on "${kws.join('", "')}"` : ''}`);
    }
  })();

  const settled = await Promise.allSettled([...perKeyword, abm]);
  const failed = settled.filter((s) => s.status === 'rejected').length;
  if (failed) d.log.warn('intent: some signal reads failed', { failed, total: settled.length });

  return [...byDomain.entries()].map(([domain, texts]) => ({
    domain,
    signals: [...texts].slice(0, MAX_SIGNALS_PER_DOMAIN).map((text) => ({ type: 'intent', text, source: 'graph8 intent' })),
  }));
}

export const intentLayer: Layer = {
  name: LAYER_NAME,
  onboarding: { name: 'setup_intent_tracking', label: 'Buying-intent tracking', run: (ctx) => setupIntentTracking(ctx) },
  async signals(ctx, persona) {
    try { return await readSignals(ctx, persona); } catch { return []; }
  },
};

layers.register(intentLayer);
