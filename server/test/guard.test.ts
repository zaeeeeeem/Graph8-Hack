import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: no .env.local, no Supabase, no network.
vi.mock('../src/lib/env', () => ({
  env: { G8_API_KEY: 'test-key', G8_BASE_URL: 'https://g8.test/api/v1', allowlist: [], WORKSPACE_ID: 'ws-test' },
  normEmail: (e?: string | null) => (e ?? '').trim().toLowerCase(),
  normPhone: (p?: string | null) => (p ?? '').replace(/\D/g, ''),
}));
vi.mock('../src/lib/store', () => ({ store: { db: {} } }));

const { createG8, NotAllowlisted } = await import('../src/lib/g8');

const allowlist = [
  { name: 'Tester A', email: 'tester.a@example.com', phone: '+923001112222' },
  { name: 'Tester B', email: 'tester.b@example.com', phone: '+15550001111' },
];

// graph8 contacts by id
const contacts: Record<string, Record<string, unknown>> = {
  '101': { id: 101, work_email: 'Tester.A@Example.com', mobile_phone: null },
  '102': { id: 102, work_email: null, mobile_phone: '+1 (555) 000-1111' },
  '201': { id: 201, work_email: 'cfo@realprospect.com', mobile_phone: '+14155550199' },
};

function mockFetch() {
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const fn = vi.fn(async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    calls.push({ method, url: u.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const m = /\/contacts\/(\d+)$/.exec(u.pathname);
    if (method === 'GET' && m) {
      const c = contacts[m[1]];
      return c ? new Response(JSON.stringify({ data: c, pagination: null }), { status: 200 })
        : new Response(JSON.stringify({ error: 'not_found', message: 'Contact not found' }), { status: 404 });
    }
    if (method === 'POST' && /\/sequences\/\d+\/contacts$/.test(u.pathname)) return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
    if (method === 'POST' && u.pathname.endsWith('/voice/calls')) return new Response(JSON.stringify({ data: { call_id: 'c1' } }), { status: 200 });
    if (method === 'POST' && u.pathname.endsWith('/appointments/bookings')) return new Response(JSON.stringify({ data: { uid: 'b1' } }), { status: 200 });
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
  });
  return { fn, calls };
}

describe('graph8 test-contact guard', () => {
  let f: ReturnType<typeof mockFetch>;
  let g8: ReturnType<typeof createG8>;
  beforeEach(() => {
    f = mockFetch();
    g8 = createG8({ env: { G8_API_KEY: 'k', G8_BASE_URL: 'https://g8.test/api/v1', allowlist }, fetch: f.fn as any, retryDelayMs: 1 });
  });

  it('allows allowlisted email (case-insensitive) and phone (formatting-insensitive)', async () => {
    expect(await g8.isAllowlisted({ email: ' TESTER.A@example.com ' })).toBe(true);
    expect(await g8.isAllowlisted({ phone: '+92 300 111-2222' })).toBe(true);
    expect(await g8.isAllowlisted({ g8ContactId: 101 })).toBe(true);
    expect(await g8.isAllowlisted({ g8ContactId: '102' })).toBe(true);
  });

  it('rejects everyone else', async () => {
    expect(await g8.isAllowlisted({ email: 'cfo@realprospect.com' })).toBe(false);
    expect(await g8.isAllowlisted({ phone: '+14155550199' })).toBe(false);
    expect(await g8.isAllowlisted({ g8ContactId: 201 })).toBe(false);
    expect(await g8.isAllowlisted({ g8ContactId: 999 })).toBe(false); // unknown contact
    expect(await g8.isAllowlisted({})).toBe(false);
  });

  it('enrollGuarded enrolls an all-test batch', async () => {
    await g8.enrollGuarded(7, [101, 102], 3);
    const post = f.calls.find((c) => c.method === 'POST');
    expect(post?.url).toBe('/api/v1/sequences/7/contacts');
    expect(post?.body).toEqual({ contact_ids: [101, 102], list_id: 3 });
  });

  it('enrollGuarded rejects a mixed batch and sends nothing', async () => {
    await expect(g8.enrollGuarded(7, [101, 201, 102], 3)).rejects.toBeInstanceOf(NotAllowlisted);
    expect(f.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('callGuarded / bookGuarded block non-test targets', async () => {
    await expect(g8.callGuarded({ to_phone: '+14155550199', from_phone: '+19802944116', agent_id: 'a' })).rejects.toBeInstanceOf(NotAllowlisted);
    await expect(g8.callGuarded({ to_phone: '+923001112222', from_phone: '+19802944116', agent_id: 'a' })).resolves.toBeTruthy();
    await expect(g8.bookGuarded({ event_type_id: 1, start_time: 'x', attendees: [{ name: 'A', email: 'tester.a@example.com' }], guests: ['cfo@realprospect.com'] }))
      .rejects.toBeInstanceOf(NotAllowlisted);
    await expect(g8.bookGuarded({ event_type_id: 1, start_time: 'x', attendees: [{ name: 'B', email: 'tester.b@example.com' }] })).resolves.toBeTruthy();
  });

  it('honours contact_allowlist rows and do_not_contact', async () => {
    const g = createG8({
      env: { G8_API_KEY: 'k', G8_BASE_URL: 'https://g8.test/api/v1', allowlist: [] }, fetch: f.fn as any,
      dbAllowlist: async () => [{ email: 'tester.a@example.com', phone: null, g8_contact_id: null }],
      doNotContact: async (id) => id === '101',
    });
    expect(await g.isAllowlisted({ email: 'tester.a@example.com' })).toBe(true);
    expect(await g.isAllowlisted({ g8ContactId: 101 })).toBe(false); // DNC wins
  });

  it('errors carry status + body excerpt, never the key, and retry once on 5xx', async () => {
    const calls: number[] = [];
    const bad = vi.fn(async () => { calls.push(1); return new Response(JSON.stringify({ message: 'boom for owner@corp.com', request_id: 'r1' }), { status: 503 }); });
    const g = createG8({ env: { G8_API_KEY: 'super-secret', G8_BASE_URL: 'https://g8.test/api/v1', allowlist }, fetch: bad as any, retryDelayMs: 1 });
    const err: any = await g.get('/usage').catch((e) => e);
    expect(err.name).toBe('G8Error');
    expect(err.status).toBe(503);
    expect(err.requestId).toBe('r1');
    expect(err.message).not.toContain('super-secret');
    expect(err.body).not.toContain('owner@corp.com');
    expect(calls.length).toBe(2);
  });
});
