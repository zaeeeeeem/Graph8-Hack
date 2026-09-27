/** Small helpers shared by Ayesha's playbooks. */

export class Timeout extends Error {
  constructor(what: string, ms: number) { super(`${what} timed out after ${Math.round(ms / 1000)}s`); this.name = 'Timeout'; }
}

/** Race a promise against a timer. The loser is ignored (never rejects unhandled). */
export function withTimeout<T>(p: Promise<T>, ms: number, what = 'step'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Timeout(what, ms)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/** graph8 wraps most payloads as `{ data }`; some routes return bare objects. */
export function unwrap<T = any>(r: any): T {
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return scrubPii(m).slice(0, 160);
}

/** Strip emails / long digit runs so nothing PII-shaped reaches Slack, reports or logs. */
export function scrubPii(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>').replace(/\+?\d[\d\s().-]{8,}\d/g, '<phone>');
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function normDomain(raw: string): string {
  const s = (raw || '').trim().replace(/^<|>$/g, '');
  // Slack auto-links: <http://8x.social|8x.social>
  const piped = s.includes('|') ? s.split('|')[1] : s;
  return piped.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
}
