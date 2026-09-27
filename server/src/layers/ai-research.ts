/**
 * L5 — graph8 AI research (layer name 'ai_research'). See docs/verify/layers.md §V-A1/A2.
 *
 *   onboarding  setup_ai_research: save one web-research config (prompt from sales_brain + persona) and store its
 *               group_id in settings.g8_ai_research_group_id. Configs are per list → `ensureForList(listId)`.
 *   research    for Hira's leads that have a company_domain (max 5, one list): POST /enrichment/ai/enrich within
 *               30 s, read the output columns back off each contact → facts. Any failure → {} (Gemini-only hook).
 *
 * Cost guards (a FAILED run still bills ~20 credits, graph8 gives no reason):
 *   - only leads with company_domain + g8_contact_id + g8_list_id; max 5 records; one call per research run
 *   - the enrich POST is never retried (g8.post retries 5xx → could double-bill), hard 30 s abort
 *   - canary: until one run has ever returned outputs (settings.g8_ai_research_ok), only 1 record per run
 *   - circuit breaker: a run that timed out or where every record failed sets settings.g8_ai_research_tripped;
 *     later runs skip graph8 until someone clears it (scripts/try-ai-research.ts --reset).
 */
import type { JsonObject, LeadRow, UUID, WorkspaceSettings } from '../../../shared/types';
import type { Layer, RunCtx } from '../contracts';
import { layers } from '../layers';
import { env } from '../lib/env';
import { g8, unwrap } from '../lib/g8';
import { log as rootLog } from '../lib/log';
import { store } from '../lib/store';

const log = rootLog.child('ai_research');

export const LAYER_NAME = 'ai_research';
export const RUN_CAP_MS = 30_000;
export const MAX_RECORDS = 5;
/** Observed charge per record on this org (22, 20, 22 on three runs). Used only when the balance can't be read. */
export const EST_CREDITS_PER_RECORD = 22;
/** graph8 field vocabulary (GET /enrichment/ai-formula/available-fields) — upper-case, referenced as {{FIELD}}. */
export const INPUT_FIELDS = ['CONTACT_FIRST_NAME', 'COMPANY_DOMAIN'];
export const OUTPUTS = ['why_now', 'talking_points'] as const;

type Settings = WorkspaceSettings & {
  g8_ai_research_groups?: Record<string, string>;
  /** Set when a run failed/timed out; research skips graph8 while set. */
  g8_ai_research_tripped?: string | null;
  /** Set after the first run that returned outputs; until then runs are a 1-record canary. */
  g8_ai_research_ok?: boolean;
};

const disabled = () => env.layersDisabled.includes(LAYER_NAME);

// ------------------------------------------------------------------ config

export function buildPrompt(brain: Record<string, unknown> | null | undefined, settings: Partial<WorkspaceSettings>): string {
  const b = brain ?? {};
  const offer = typeof b.offer === 'string' && b.offer ? b.offer : 'our product';
  const icp = (typeof b.icp === 'string' && b.icp) || settings.target_icp || '';
  const personas = Array.isArray(b.personas) ? b.personas.filter((p) => typeof p === 'string').join(', ') : '';
  const persona = settings.target_persona || personas;
  const proof = Array.isArray(b.proof) ? b.proof.filter((p) => typeof p === 'string').slice(0, 2).join('; ') : '';
  return [
    `We sell: ${offer}.`,
    icp && `Our ideal customer: ${icp}.`,
    persona && `We talk to: ${persona}.`,
    proof && `Proof points: ${proof}.`,
    'Research the company at {{COMPANY_DOMAIN}} on the public web (news, hiring, funding, launches, product changes in the last 6 months).',
    'why_now: ONE sentence on why this company would care about our offer right now, citing one concrete recent fact. If nothing recent is found, say so plainly.',
    'talking_points: exactly 2 short opener lines an SDR could use with {{CONTACT_FIRST_NAME}}, separated by " | ". No emails, phone numbers or made-up facts.',
  ].filter(Boolean).join('\n');
}

/** Body for POST /enrichment/ai/configs — outer DTO under `config`, execution settings under `config.config` (both required, else 422). */
export function configBody(listId: number | null, prompt: string, name = 'Graphi web research'): JsonObject {
  return {
    config: {
      name: listId ? `${name} (list ${listId})` : name,
      input_mapping: INPUT_FIELDS,
      prompt,
      model: 'gpt-4o-mini',
      usecase: 'web-research',
      outputs: OUTPUTS.map((o) => ({ name: o, type: 'string' })),
      list_id: listId,
      // is_global defaults to TRUE on graph8 (applies to every list) — always scope it.
      is_global: false,
      config: { scope: 'contact', skip_existing_values: false, skip_recently_enriched: false, auto_update: false },
    },
  };
}

async function saveConfig(workspaceId: UUID, listId: number | null): Promise<string> {
  const [ws, settings] = await Promise.all([store.workspace(workspaceId), store.settings(workspaceId)]);
  const res = unwrap<{ group_id?: string }>(await g8.post('/enrichment/ai/configs', configBody(listId, buildPrompt(ws.sales_brain as any, settings))));
  if (!res?.group_id) throw new Error('graph8 did not return a group_id');
  return res.group_id;
}

/** group_id of the research config for this graph8 list; creates + remembers it on first use. */
export async function ensureForList(workspaceId: UUID, listId: number | string): Promise<string> {
  const key = String(listId);
  const settings = (await store.settings(workspaceId)) as Settings;
  const known = settings.g8_ai_research_groups?.[key];
  if (known) return known;
  const groupId = await saveConfig(workspaceId, Number(listId));
  const fresh = (await store.settings(workspaceId)) as Settings;
  await store.patchSettings(workspaceId, {
    g8_ai_research_groups: { ...(fresh.g8_ai_research_groups ?? {}), [key]: groupId },
    ...(fresh.g8_ai_research_group_id ? {} : { g8_ai_research_group_id: groupId }),
  } as Partial<WorkspaceSettings>);
  log.info('saved graph8 AI research config', { listId: key, groupId });
  return groupId;
}

async function setupAiResearch(ctx: RunCtx): Promise<{ ok: boolean; note?: string }> {
  try {
    if (disabled()) return { ok: true, note: 'disabled' };
    const s = (await store.settings(ctx.workspaceId)) as Settings;
    if (s.g8_ai_research_group_id) return { ok: true, note: 'already set up' };
    let groupId: string;
    if (s.last_run_list_id) groupId = await ensureForList(ctx.workspaceId, s.last_run_list_id);
    else {
      groupId = await saveConfig(ctx.workspaceId, null);
      await store.patchSettings(ctx.workspaceId, { g8_ai_research_group_id: groupId });
    }
    await ctx.step('tool', 'graph8.ai_config', 'Saved graph8 web-research config (why_now + talking_points)', { group_id: groupId });
    return { ok: true, note: 'graph8 AI research ready' };
  } catch (err) {
    log.warn('setup_ai_research failed', { err: String((err as Error)?.message ?? err) });
    return { ok: false, note: 'graph8 AI research not set up — Hira uses Gemini-only research' };
  }
}

// ------------------------------------------------------------------ run

export interface EnrichResult { processed: number; succeeded: number; failed: number; jobId?: string }

/** POST /enrichment/ai/enrich — single attempt, hard timeout, NO retry (a retry could bill twice). */
export async function runEnrich(groupId: string, listId: number, recordIds: number[], timeoutMs: number): Promise<EnrichResult> {
  const res = await fetch(`${env.G8_BASE_URL}/enrichment/ai/enrich`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.G8_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ group_id: groupId, list_id: listId, record_ids: recordIds, max_records: recordIds.length }),
    signal: AbortSignal.timeout(Math.max(1000, timeoutMs)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`graph8 ai/enrich -> ${res.status}`);
  const d = unwrap<any>(JSON.parse(text || '{}')) ?? {};
  const rows: any[] = Array.isArray(d.results) ? d.results : [];
  const sum = (k: string) => rows.reduce((n, r) => n + (Number(r?.[k]) || 0), 0);
  return {
    processed: sum('processed_records') || Number(d.completed) || 0,
    succeeded: Number(d.successful_enrichments ?? sum('successful_enrichments')) || 0,
    failed: Number(d.failed_enrichments ?? sum('failed_enrichments')) || 0,
    jobId: d.job_id,
  };
}

/** Output columns off the contact: custom_fields keyed by column_id `${groupId}_${output}` (or bare output name). */
export function extractOutputs(contact: any, groupId: string): Partial<Record<(typeof OUTPUTS)[number], string>> {
  const pools = [contact?.custom_fields, contact?.meta_data, contact].filter((p) => p && typeof p === 'object');
  const out: Partial<Record<(typeof OUTPUTS)[number], string>> = {};
  for (const o of OUTPUTS) {
    for (const p of pools) {
      const v = p[`${groupId}_${o}`] ?? p[o];
      const s = typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.value === 'string' ? v.value : '';
      if (s.trim()) { out[o] = s.trim(); break; }
    }
  }
  return out;
}

/** Strip anything that looks like an email/phone before it can reach research/Slack. */
const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]').slice(0, 400);

export function toFacts(o: ReturnType<typeof extractOutputs>): string[] {
  const facts: string[] = [];
  if (o.why_now) facts.push(`graph8 research — why now: ${scrub(o.why_now)}`);
  for (const tp of (o.talking_points ?? '').split(/\s*\|\s*|\n+/).map((x) => x.replace(/^[-•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 2))
    facts.push(`graph8 research — talking point: ${scrub(tp)}`);
  return facts;
}

async function balance(): Promise<number | null> {
  try { const n = await g8.credits(); return Number.isFinite(n) ? n : null; } catch { return null; }
}

export interface CollectOpts { force?: boolean; capMs?: number }

export async function collect(ctx: RunCtx, leads: LeadRow[], opts: CollectOpts = {}): Promise<Record<UUID, { facts: string[]; signals?: JsonObject[] }>> {
  const started = Date.now();
  const capMs = opts.capMs ?? RUN_CAP_MS;
  try {
    if (disabled()) return {};
    const settings = (await store.settings(ctx.workspaceId)) as Settings;
    if (settings.g8_ai_research_tripped && !opts.force) {
      await ctx.step('note', 'graph8.ai_enrich', 'graph8 AI research paused after a failed run — using Gemini-only research');
      return {};
    }
    const eligible = leads.filter((l) => l.company_domain && l.g8_contact_id && l.g8_list_id && Number.isInteger(Number(l.g8_contact_id)));
    if (!eligible.length) return {};
    const listId = Number(eligible[0].g8_list_id);
    const batch = eligible.filter((l) => Number(l.g8_list_id) === listId).slice(0, settings.g8_ai_research_ok ? MAX_RECORDS : 1);
    const ids = batch.map((l) => Number(l.g8_contact_id));

    const groupId = await ensureForList(ctx.workspaceId, listId);
    const before = await balance();
    const remaining = capMs - (Date.now() - started);
    if (remaining < 5_000) return {};

    let r: EnrichResult | null = null;
    let timedOut = false;
    try {
      r = await runEnrich(groupId, listId, ids, remaining);
    } catch (err: any) {
      timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      log.warn('ai/enrich failed', { err: String(err?.message ?? err), timedOut });
    }

    // graph8 charges up-front, even for failed runs → always record spend.
    const after = r ? await balance() : null;
    const measured = before != null && after != null ? Math.max(0, before - after) : null;
    const credits = measured ?? (r || timedOut ? EST_CREDITS_PER_RECORD * ids.length : 0);
    if (credits > 0) {
      try {
        await store.spend({
          workspaceId: ctx.workspaceId, agentId: ctx.agentId, source: 'graph8', action: 'ai_enrich', credits,
          taskId: ctx.task?.id, runId: ctx.runId,
          meta: { group_id: groupId, records: ids.length, measured: measured != null, timed_out: timedOut, job_id: r?.jobId ?? null },
        });
      } catch (err) { log.warn('spend record failed', { err: String((err as Error)?.message ?? err) }); }
    }

    const trip = (why: string) => store.patchSettings(ctx.workspaceId, { g8_ai_research_tripped: `${new Date().toISOString()} ${why}` } as Partial<WorkspaceSettings>);
    if (!r) {
      if (timedOut) await trip(`timed out after ${Math.round(capMs / 1000)} s`);
      await ctx.step('tool', 'graph8.ai_enrich', `graph8 research ${timedOut ? 'timed out' : 'errored'} for ${ids.length} leads — Gemini-only`, { credits });
      return {};
    }
    if (r.succeeded === 0) {
      await trip(`all ${r.failed || ids.length} failed (job ${r.jobId ?? '?'})`);
      await ctx.step('tool', 'graph8.ai_enrich', `graph8 research returned nothing for ${ids.length} leads — paused, Gemini-only`, { credits, job_id: r.jobId ?? null });
      return {};
    }

    const out: Record<UUID, { facts: string[]; signals?: JsonObject[] }> = {};
    await Promise.all(batch.map(async (l) => {
      try {
        const c = unwrap<any>(await g8.get(`/contacts/${l.g8_contact_id}`));
        const facts = toFacts(extractOutputs(c, groupId));
        if (facts.length) out[l.id] = { facts };
      } catch { /* one lead's read-back failing never drops the others */ }
    }));
    if (Object.keys(out).length && !settings.g8_ai_research_ok) await store.patchSettings(ctx.workspaceId, { g8_ai_research_ok: true } as Partial<WorkspaceSettings>);
    await ctx.step('tool', 'graph8.ai_enrich', `graph8 research: ${Object.keys(out).length}/${ids.length} leads got why-now + talking points`, { credits, job_id: r.jobId ?? null });
    return out;
  } catch (err) {
    log.warn('ai_research collect failed; Gemini-only', { err: String((err as Error)?.message ?? err) });
    return {};
  }
}

export const aiResearchLayer: Layer = {
  name: LAYER_NAME,
  onboarding: { name: 'setup_ai_research', label: 'graph8 AI research', run: setupAiResearch },
  research: { name: 'graph8_ai_research', collect: (ctx, leads) => collect(ctx, leads) },
};

layers.register(aiResearchLayer);
