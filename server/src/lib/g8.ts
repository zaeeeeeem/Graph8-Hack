/**
 * g8 — graph8 REST wrapper (Bearer key, JSON, 30 s timeout, 1 retry) + the TEST-CONTACT GUARD.
 *
 * Responses are returned RAW (graph8 wraps most bodies as `{ data, pagination }`); use `unwrap()` for `.data`.
 * Errors throw G8Error { status, method, path, body (≤300 chars, PII-redacted), requestId } — never the key.
 * status 0 = network error / timeout.
 *
 * Guard rule: a person may be enrolled / emailed / called / booked only if one of their emails or phones
 * (normalized: lower-case email, E.164 digits) is in env.TEST_ALLOWLIST or the workspace's contact_allowlist
 * table, or the graph8 contact id is recorded there — and no lead for that contact is marked do_not_contact.
 */
import { NotAllowlisted } from '../contracts';
import type { AllowlistEntry, Env, G8 } from '../contracts';
import { env, normEmail, normPhone } from './env';
import { store } from './store';
import { log as rootLog, redact } from './log';

export { NotAllowlisted };

export class G8Error extends Error {
  constructor(
    public status: number,
    public method: string,
    public path: string,
    public body: string,
    public requestId?: string,
  ) {
    super(`graph8 ${method} ${path} -> ${status || 'network error'}: ${body}`);
    this.name = 'G8Error';
  }
}

export const unwrap = <T = any>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;

type Fetch = typeof fetch;
export interface G8Deps {
  env: Pick<Env, 'G8_API_KEY' | 'G8_BASE_URL' | 'allowlist'>;
  fetch?: Fetch;
  /** Extra allowlist rows from Supabase contact_allowlist (for the served workspace). */
  dbAllowlist?: () => Promise<Array<{ email: string | null; phone: string | null; g8_contact_id: string | null }>>;
  /** true when a lead for this graph8 contact is marked do_not_contact. */
  doNotContact?: (g8ContactId: string) => Promise<boolean>;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export type G8Client = G8 & {
  credits(): Promise<number>;
  ping(): Promise<boolean>;
};

const TIMEOUT_MS = 30_000;

export function createG8(deps: G8Deps): G8Client {
  const log = rootLog.child('g8');
  const f: Fetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const retryDelayMs = deps.retryDelayMs ?? 1000;

  async function request<T>(method: string, path: string, opts: { query?: Record<string, unknown>; body?: unknown; retry5xx?: boolean } = {}): Promise<T> {
    const url = new URL(deps.env.G8_BASE_URL + (path.startsWith('/') ? path : '/' + path));
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
      else url.searchParams.set(k, String(v));
    }
    const retry5xx = opts.retry5xx ?? true;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await f(url, {
          method,
          headers: {
            Authorization: `Bearer ${deps.env.G8_API_KEY}`,
            Accept: 'application/json',
            ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err: any) {
        // Network/timeout: retry once only for reads (a write may have landed).
        if (attempt === 0 && method === 'GET') { await sleep(retryDelayMs); continue; }
        throw new G8Error(0, method, path, redact(String(err?.name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : err?.message ?? err)));
      }
      const text = await res.text();
      if (res.ok) {
        if (!text) return undefined as T;
        try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
      }
      const retryable = res.status === 429 || (res.status >= 500 && retry5xx);
      if (attempt === 0 && retryable) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 5000) : retryDelayMs);
        continue;
      }
      let requestId: string | undefined;
      let excerpt = text;
      try {
        const j = JSON.parse(text);
        requestId = j.request_id;
        excerpt = typeof j.message === 'string' ? j.message : typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail ?? j);
      } catch { /* not json */ }
      const err = new G8Error(res.status, method, path, redact(excerpt).slice(0, 300), requestId ?? res.headers.get('x-request-id') ?? undefined);
      log.warn('request failed', { method, path, status: res.status, requestId: err.requestId });
      throw err;
    }
  }

  // ---------------------------------------------------------------- guard
  let dbCache: { at: number; rows: Awaited<ReturnType<NonNullable<G8Deps['dbAllowlist']>>> } | null = null;
  async function dbRows() {
    if (!deps.dbAllowlist) return [];
    if (dbCache && Date.now() - dbCache.at < 30_000) return dbCache.rows;
    try {
      dbCache = { at: Date.now(), rows: await deps.dbAllowlist() };
    } catch (err) {
      log.warn('contact_allowlist lookup failed; using env allowlist only', { err });
      dbCache = { at: Date.now(), rows: [] };
    }
    return dbCache.rows;
  }
  async function handles() {
    const env: AllowlistEntry[] = deps.env.allowlist;
    const rows = await dbRows();
    const emails = new Set<string>([...env.map((e) => normEmail(e.email)), ...rows.map((r) => normEmail(r.email))].filter(Boolean));
    const phones = new Set<string>([...env.map((e) => normPhone(e.phone)), ...rows.map((r) => normPhone(r.phone))].filter(Boolean));
    const ids = new Set<string>(rows.map((r) => r.g8_contact_id).filter((x): x is string => !!x));
    return { emails, phones, ids };
  }
  const emailOk = (h: Awaited<ReturnType<typeof handles>>, e?: string | null) => !!normEmail(e) && h.emails.has(normEmail(e));
  const phoneOk = (h: Awaited<ReturnType<typeof handles>>, p?: string | null) => !!normPhone(p) && h.phones.has(normPhone(p));

  /** All emails / phones on a graph8 contact record (GET /contacts/{id}). */
  async function contactHandles(id: string | number): Promise<{ emails: string[]; phones: string[] } | null> {
    try {
      const c = unwrap<Record<string, any>>(await request('GET', `/contacts/${encodeURIComponent(String(id))}`));
      if (!c) return null;
      const split = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,;\s]+/) : []).filter(Boolean);
      return {
        emails: [...split(c.work_email), ...split(c.personal_emails), ...split(c.email)],
        phones: [c.mobile_phone, c.direct_phone, c.phone].filter((x): x is string => typeof x === 'string' && !!x),
      };
    } catch (err) {
      if (err instanceof G8Error && err.status === 404) return null;
      throw err;
    }
  }

  async function isAllowlisted(x: { email?: string | null; phone?: string | null; g8ContactId?: string | number | null }): Promise<boolean> {
    const h = await handles();
    if (x.g8ContactId != null && deps.doNotContact && (await deps.doNotContact(String(x.g8ContactId)))) return false;
    if (emailOk(h, x.email) || phoneOk(h, x.phone)) return true;
    if (x.g8ContactId == null || x.g8ContactId === '') return false;
    if (h.ids.has(String(x.g8ContactId))) return true;
    const c = await contactHandles(x.g8ContactId);
    if (!c) return false;
    return c.emails.some((e) => emailOk(h, e)) || c.phones.some((p) => phoneOk(h, p));
  }

  const g8: G8Client = {
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    del: (path) => request('DELETE', path),
    isAllowlisted,

    async enrollGuarded(sequenceId, contactIds, listId) {
      if (!contactIds.length) throw new NotAllowlisted('enroll: empty contact list');
      const blocked: string[] = [];
      for (const id of contactIds) if (!(await isAllowlisted({ g8ContactId: id }))) blocked.push(String(id));
      if (blocked.length) {
        log.warn('enroll blocked', { sequenceId, blocked });
        throw new NotAllowlisted(`enroll: ${blocked.length} of ${contactIds.length} contacts are not test contacts (graph8 ids ${blocked.join(', ')})`);
      }
      return request('POST', `/sequences/${sequenceId}/contacts`, {
        body: { contact_ids: contactIds.map(Number), list_id: Number(listId) },
        retry5xx: false,
      });
    },

    async sendReplyGuarded(replyId, body) {
      const to = (body as { to?: string }).to;
      if (to) {
        if (!(await isAllowlisted({ email: to.includes('@') ? to : null, phone: to.includes('@') ? null : to }))) {
          throw new NotAllowlisted(`reply ${replyId}: override recipient is not a test contact`);
        }
      } else {
        const t = unwrap<Record<string, any>>(await request('GET', `/inbox/${encodeURIComponent(String(replyId))}`, { query: { channel: body.channel } }));
        const c = (t?.contact ?? {}) as Record<string, any>;
        const ok = await isAllowlisted({
          email: c.email ?? c.work_email ?? null,
          phone: c.phone ?? c.mobile_phone ?? null,
          g8ContactId: c.id ?? c.contact_id ?? null,
        });
        if (!ok) throw new NotAllowlisted(`reply ${replyId}: thread contact is not a test contact`);
      }
      return request('POST', `/inbox/${encodeURIComponent(String(replyId))}/send`, { body, retry5xx: false });
    },

    async callGuarded(body) {
      const ok = await isAllowlisted({ phone: body.to_phone });
      if (!ok) throw new NotAllowlisted('voice call: to_phone is not a test contact');
      if (body.contact_id != null && !(await isAllowlisted({ g8ContactId: body.contact_id as string }))) {
        throw new NotAllowlisted('voice call: contact_id is not a test contact');
      }
      return request('POST', '/voice/calls', { body, retry5xx: false });
    },

    async bookGuarded(body) {
      const emails = [...(body.attendees ?? []).map((a) => a.email), ...(((body.guests as string[] | undefined) ?? []))];
      if (!emails.length) throw new NotAllowlisted('booking: no attendees');
      for (const e of emails) if (!(await isAllowlisted({ email: e }))) throw new NotAllowlisted('booking: attendee/guest is not a test contact');
      return request('POST', '/appointments/bookings', { body, retry5xx: false });
    },

    async credits() {
      const u = unwrap<{ credits?: number; available_credits?: number }>(await request('GET', '/usage'));
      return Number(u?.available_credits ?? u?.credits ?? NaN);
    },

    async ping() {
      try { await request('GET', '/usage'); return true; } catch { return false; }
    },
  };
  return g8;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ------------------------------------------------------------------ singleton (server)

export const g8: G8Client = createG8({
  env,
  async dbAllowlist() {
    const r = await store.db.from('contact_allowlist').select('email,phone,g8_contact_id').eq('workspace_id', env.WORKSPACE_ID);
    if (r.error) throw new Error(r.error.message);
    return r.data ?? [];
  },
  async doNotContact(id) {
    const r = await store.db.from('leads').select('id').eq('workspace_id', env.WORKSPACE_ID).eq('g8_contact_id', id).eq('do_not_contact', true).limit(1);
    return !r.error && (r.data?.length ?? 0) > 0;
  },
});
