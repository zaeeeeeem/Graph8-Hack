/** Small helpers shared by Usman's modules. No PII ever leaves through these. */
import type { JsonObject, LeadRow, WorkspaceSettings } from '../../../../shared/types';

export const SEC_PER_REAL_DAY = 86_400;
/** Floor for demo mode: graph8 steps closer than a minute apart are pointless on stage. */
export const MIN_SEC_PER_DAY = 60;

/**
 * `demo_time_scale` (workspace column, or settings override) is a multiplier on a real day: 1 = real days,
 * 0.000694 ≈ 60 s. Demo spec: 1 day = 60 s, so anything < 1 is clamped to at least 60 s/day.
 */
export function secondsPerDay(scale: unknown): number {
  const n = Number(scale);
  if (!Number.isFinite(n) || n <= 0 || n >= 1) return SEC_PER_REAL_DAY * (Number.isFinite(n) && n > 1 ? n : 1);
  return Math.max(MIN_SEC_PER_DAY, Math.round(SEC_PER_REAL_DAY * n));
}

/** L8 switch: AI_GENERATED_TEMPLATE + `sales_hook` custom field. Off until verify-core V-T2 is green. */
export function aiTemplateEnabled(settings: WorkspaceSettings): boolean {
  return settings.usman_ai_template === true;
}

export async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms); }),
    ]);
  } finally { if (t) clearTimeout(t); }
}

/** Run a side effect that must never break the playbook (Slack, checklist, reports). */
export async function safe<T>(fn: () => Promise<T> | T, onErr?: (e: unknown) => void): Promise<T | undefined> {
  try { return await fn(); } catch (e) { onErr?.(e); return undefined; }
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
/** Last line of defence for text going to Slack / reports / lead_events summaries. */
export function scrub(s: string): string {
  return s.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]');
}

export function firstName(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || 'there';
}

export function errMsg(e: unknown): string {
  return scrub(e instanceof Error ? e.message : String(e)).slice(0, 200);
}

/** graph8 wraps payloads as `{ data: … }`; tolerate both. */
export function unwrap<T = any>(r: any): T {
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
}

/** Research pack fields Hira writes (leads.why_now + leads.research). */
export function packOf(lead: LeadRow): { hook: string; talking_points: string[]; best_channel: string } {
  const r = (lead.research ?? {}) as JsonObject;
  const tp = Array.isArray(r.talking_points) ? (r.talking_points as unknown[]).map(String) : [];
  return {
    hook: String(lead.why_now ?? r.why_now ?? r.hook ?? '').trim(),
    talking_points: tp.slice(0, 3),
    best_channel: String(r.best_channel ?? 'email'),
  };
}
