/**
 * R1 enrich_contacts + R2 verify_email (docs/agents/03-hira.md H4, H6, H8).
 * Enrichment is async: POST /enrichment/enrich → poll GET /enrichment/jobs/{id} every 5 s, max 3 min.
 * Job `results` may be null even when completed (docs), so contact data is read back from GET /contacts/{id}.
 */
import { g8 } from '../../lib/g8';
import { realEmail, realPhone, retryOnce, sleep, unwrap } from '../bilal/util';

export const timing = { pollMs: 5_000, maxWaitMs: 180_000, lateWaitMs: 600_000 };

/** H4: work email + mobile. Provider names from graph8 docs; verify on this org in V2. */
export const FIELDS_CONFIG = {
  work_email: ['prospeo', 'dropcontact'],
  mobile_phone: ['prospeo', 'cognism', 'lusha'],
};

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
export interface JobState { jobId: string; status: JobStatus; credits: number; successful: number; failed: number; results: any[] }

export async function startEnrichment(contactIds: Array<string | number>, listId: string | number, fieldsConfig: object | null = FIELDS_CONFIG): Promise<string> {
  const body: Record<string, unknown> = { contact_ids: contactIds.map(Number), list_id: Number(listId) };
  if (fieldsConfig) body.fields_config = fieldsConfig;
  const r = unwrap<any>(await retryOnce(() => g8.post('/enrichment/enrich', body)));
  const id = r?.job_id ?? r?.id;
  if (!id) throw new Error('graph8 /enrichment/enrich returned no job_id');
  return String(id);
}

export function toJobState(jobId: string, r: any): JobState {
  return {
    jobId,
    status: (String(r?.status ?? 'running').toLowerCase() as JobStatus),
    credits: Number(r?.total_credits_used ?? 0) || 0,
    successful: Number(r?.successful_enrichments ?? 0) || 0,
    failed: Number(r?.failed_enrichments ?? 0) || 0,
    results: Array.isArray(r?.results) ? r.results : [],
  };
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/** Poll until terminal or `maxWaitMs`; returns status 'timeout' when the cap is hit. */
export async function pollJob(jobId: string, maxWaitMs = timing.maxWaitMs, onTick?: (s: JobState) => void): Promise<JobState> {
  const deadline = Date.now() + maxWaitMs;
  let last: JobState = { jobId, status: 'queued', credits: 0, successful: 0, failed: 0, results: [] };
  let errors = 0;
  while (true) {
    try {
      last = toJobState(jobId, unwrap(await g8.get(`/enrichment/jobs/${jobId}`)));
      errors = 0;
      onTick?.(last);
      if (TERMINAL.has(last.status)) return last;
    } catch (e) {
      // Live (07:35 PKT): GET /enrichment/jobs/{id} answered 404 "Job not found" for a fresh job for 3+ min.
      // Treat 404 as "not visible yet" and keep polling until the cap; other errors fail after 3 in a row.
      if (!/404|not found/i.test(String((e as Error)?.message ?? e)) && ++errors >= 3) throw e;
    }
    if (Date.now() + timing.pollMs > deadline) return { ...last, status: 'timeout' };
    await sleep(timing.pollMs);
  }
}

export interface ContactData { email: string | null; phone: string | null; linkedin: string | null; raw: Record<string, unknown> }

/** Read back what graph8 now holds for the contact (after enrichment). Never logged. */
export async function readContact(g8ContactId: string | number): Promise<ContactData> {
  const c = unwrap<any>(await g8.get(`/contacts/${g8ContactId}`)) ?? {};
  return {
    email: realEmail(c.work_email),
    phone: realPhone(c.mobile_phone) ?? realPhone(c.direct_phone),
    linkedin: typeof c.linkedin_url === 'string' && c.linkedin_url ? c.linkedin_url : null,
    raw: { job_title: c.job_title ?? null, company: c.company ?? null, confidence_score: c.confidence_score ?? null },
  };
}

export type Verdict = 'valid' | 'catch-all' | 'invalid' | 'unknown';

/** Live shape (07:20 PKT): `{ email, status: 'ok' | 'ok_for_all' | 'invalid' | …, is_valid, mx_* }`. */
export function classifyVerify(r: any): Verdict {
  const s = String(r?.status ?? r?.result ?? r?.verdict ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (['ok', 'valid', 'deliverable', 'safe'].includes(s)) return 'valid';
  if (['ok_for_all', 'catch_all', 'catchall', 'accept_all', 'accept_all_unverifiable'].includes(s)) return 'catch-all';
  if (['invalid', 'undeliverable', 'email_disabled', 'dead_server', 'invalid_mx', 'invalid_syntax', 'disposable', 'spamtrap'].includes(s)) return 'invalid';
  if (r?.is_valid === true) return 'valid';
  return 'unknown';
}

/** R2. H6: valid + catch-all accepted; invalid / unknown → no email channel. */
export async function verifyEmail(email: string): Promise<Verdict> {
  try { return classifyVerify(unwrap(await g8.post('/enrichment/verify-email', { email }))); } catch { return 'unknown'; }
}

export const emailUsable = (v: Verdict | null | undefined) => v === 'valid' || v === 'catch-all';

/**
 * CRM contacts come back with `work_email: "***"` / `mobile_phone: "***"` when graph8 holds data that is not yet
 * revealed (verified live 07:30 PKT). `POST /contacts/unlock-info {contact_ids}` reveals it; CHARGES CREDITS
 * (`credits_charged`), already-unlocked ids are free. Real prospects: data only, never contacted.
 */
export async function unlockContacts(contactIds: Array<string | number>): Promise<{ credits: number }> {
  if (!contactIds.length) return { credits: 0 };
  const r = unwrap<any>(await retryOnce(() => g8.post('/contacts/unlock-info', { contact_ids: contactIds.map(Number) })));
  return { credits: Number(r?.credits_charged ?? r?.credits_used ?? 0) || 0 };
}
