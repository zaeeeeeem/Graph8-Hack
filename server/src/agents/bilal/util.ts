/**
 * Small helpers shared by Bilal and Hira (both owned by W3).
 */
import type { ChecklistItem, Checklist, Layer, RunCtx } from '../../contracts';
import { slack } from '../../lib/slack';
import { layers } from '../../layers';

/** graph8 wraps payloads as `{ data, pagination }`; the g8 lib may or may not unwrap. Accept both. */
export function unwrap<T = any>(r: any): T {
  if (r && typeof r === 'object' && !Array.isArray(r) && 'data' in r) return r.data as T;
  return r as T;
}

export function asArray<T = any>(r: any): T[] {
  const u = unwrap(r);
  if (Array.isArray(u)) return u as T[];
  if (u && typeof u === 'object') {
    for (const k of ['items', 'results', 'contacts', 'records', 'rows']) if (Array.isArray((u as any)[k])) return (u as any)[k];
  }
  return [];
}

export class Timeout extends Error {
  constructor(what: string, ms: number) { super(`${what} timed out after ${ms} ms`); this.name = 'Timeout'; }
}

export function withTimeout<T>(p: Promise<T>, ms: number, what = 'call'): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => t && clearTimeout(t)),
    new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Timeout(what, ms)), ms); }),
  ]);
}

/** B14: graph8 error / rate limit → retry once. */
export async function retryOnce<T>(fn: () => Promise<T>, delayMs = 1500): Promise<T> {
  try { return await fn(); } catch (e) {
    await sleep(delayMs);
    return fn();
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run `fn` over items with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return out;
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return scrubPii(m).slice(0, 200);
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
/** Strip emails/phones from any string that may end up in Slack, reports, run_steps or lead_events. */
export function scrubPii(s: string): string {
  return s.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]');
}

export function normLinkedin(u?: string | null): string {
  if (!u) return '';
  return u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').trim();
}

export function normDomain(d?: string | null): string {
  if (!d) return '';
  return d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
}

/** A real, unmasked email (search results come back blank or `***`). */
export function realEmail(e?: string | null): string | null {
  if (!e) return null;
  const s = String(e).split(/[,;\s]/)[0].trim();
  return /^[^\s*@]+@[^\s*@]+\.[^\s*@]+$/.test(s) ? s.toLowerCase() : null;
}

export function realPhone(p?: string | null): string | null {
  if (!p) return null;
  const s = String(p).trim();
  return /\*/.test(s) || s.replace(/\D/g, '').length < 7 ? null : s;
}

/** Record-level URL is unverified (docs/graph8-app-links.md); list page is the safe fallback. */
export function g8ContactUrl(id?: string | number | null): string {
  return id ? `https://app.graph8.com/contacts/${id}` : 'https://app.graph8.com/contacts';
}

export function todayLabel(d = new Date()): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });
}

/**
 * Live checklist in the agent's #sales-team thread. Slack failures never fail the task: they degrade to log lines.
 */
export interface Progress {
  threadTs?: string;
  channel?: string;
  set(key: string, state: ChecklistItem['state'], note?: string): Promise<void>;
  add(item: ChecklistItem): Promise<void>;
  post(text: string, blocks?: Record<string, unknown>[]): Promise<void>;
}

export async function openProgress(ctx: RunCtx, title: string, items: ChecklistItem[]): Promise<Progress> {
  let thread: { ts: string; channel: string } | undefined;
  let list: Checklist | undefined;
  try {
    thread = await ctx.thread();
    list = await slack.checklist(ctx.role, thread.channel, title, items, thread.ts);
  } catch (e) {
    ctx.log.warn('checklist unavailable', { err: errMsg(e) });
  }
  const safe = async (what: string, f: () => Promise<unknown>) => {
    try { await f(); } catch (e) { ctx.log.warn(`slack ${what} failed`, { err: errMsg(e) }); }
  };
  return {
    threadTs: thread?.ts,
    channel: thread?.channel,
    set: (key, state, note) => safe('checklist.set', async () => {
      ctx.log.info(`[${key}] ${state}${note ? ` — ${scrubPii(note)}` : ''}`);
      if (list) await list.set(key, state, note ? scrubPii(note) : undefined);
    }),
    add: (item) => safe('checklist.add', async () => { if (list) await list.add(item); }),
    post: (text, blocks) => safe('postAs', async () => {
      if (!thread) return;
      await slack.postAs(ctx.role, thread.channel, { text: scrubPii(text), blocks, threadTs: thread.ts });
    }),
  };
}

/**
 * Wrap every `layers.all()` hook: try/catch + timeout per layer; failures become ⚠️ lines, never break Layer 0.
 * `run` returns undefined when the layer does not implement the hook.
 */
export async function eachLayer<R>(
  ms: number,
  run: (l: Layer) => Promise<R> | undefined,
): Promise<{ ok: Array<{ name: string; value: R }>; failed: Array<{ name: string; err: string }> }> {
  const ok: Array<{ name: string; value: R }> = [];
  const failed: Array<{ name: string; err: string }> = [];
  let list: Layer[] = [];
  try { list = layers.all() ?? []; } catch (e) { return { ok, failed: [{ name: 'layers', err: errMsg(e) }] }; }
  await Promise.all(list.map(async (l) => {
    const name = String(l?.name ?? 'layer');
    try {
      const p = run(l);
      if (!p) return;
      ok.push({ name, value: await withTimeout(p, ms, `layer ${name}`) });
    } catch (e) { failed.push({ name, err: errMsg(e) }); }
  }));
  return { ok, failed };
}

/** Pull linkedin/email-ish strings out of an unknown record shape. */
export function collectHandles(rec: unknown, into: Set<string>) {
  if (!rec || typeof rec !== 'object') return;
  for (const v of Object.values(rec as Record<string, unknown>)) {
    if (typeof v === 'string') {
      if (v.includes('linkedin.com/')) into.add(normLinkedin(v));
      else if (realEmail(v)) into.add(realEmail(v)!);
    } else if (v && typeof v === 'object') collectHandles(v, into);
  }
}
