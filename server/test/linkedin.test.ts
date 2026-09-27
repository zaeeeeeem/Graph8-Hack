import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: no .env.local, no Supabase, no graph8, no Gemini, no Slack.
const h = vi.hoisted(() => {
  type Op = { table: string; op: string; payload?: any; filters: Array<[string, ...any[]]> };
  const state = {
    ops: [] as Op[],
    settings: {} as Record<string, any>,
    /** Rows returned per `${table}.${op}`. */
    rows: {} as Record<string, any[]>,
    g8: { connection: { connected: false, accounts_count: 0 } as any, senders: { senders: [], total_count: 0 } as any },
    llmImpl: null as null | ((prompt: string) => Promise<any>),
    registered: [] as any[],
    busHandlers: [] as Array<(e: any) => any>,
    slack: { postAs: vi.fn(async () => ({ ts: '111.1', channel: 'CHQ' })), update: vi.fn(async () => undefined) },
  };
  function q(table: string) {
    const o: Op = { table, op: 'select', filters: [] };
    state.ops.push(o);
    const b: any = {
      select() { return b; },
      insert(p: any) { o.op = 'insert'; o.payload = p; return b; },
      update(p: any) { o.op = 'update'; o.payload = p; return b; },
      single() { return b; }, order() { return b; }, limit() { return b; },
      then(res: any, rej: any) {
        const data = state.rows[`${table}.${o.op}`] ?? (o.op === 'insert' ? { id: 'appr-new' } : o.op === 'select' ? [] : null);
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    for (const f of ['eq', 'not', 'is', 'in']) b[f] = (...a: any[]) => { o.filters.push([f, ...a]); return b; };
    return b;
  }
  return { state, q };
});

vi.mock('../src/lib/env', () => ({
  env: { WORKSPACE_ID: 'ws-1', SLACK_DISABLED: false, layersDisabled: [], allowlist: [] },
  linkedinNames: { send: () => [], connected: () => [] },
}));
vi.mock('../src/lib/log', () => {
  const l: any = { info() {}, warn() {}, error() {}, child: () => l };
  return { log: l, redact: (s: string) => s };
});
vi.mock('../src/lib/bus', () => ({ bus: { on: (_: string, fn: any) => h.state.busHandlers.push(fn), emit() {} } }));
vi.mock('../src/layers', () => ({ layers: { register: (l: any) => h.state.registered.push(l), all: () => h.state.registered } }));
vi.mock('../src/lib/store', () => ({
  store: {
    db: { from: (t: string) => h.q(t) },
    settings: async () => ({ daily_find: 10, daily_research: 5, ...h.state.settings }),
    patchSettings: async (_: string, p: any) => { Object.assign(h.state.settings, p); return h.state.settings; },
    workspace: async () => ({ sales_brain: { offer: 'creator content at scale', icp: 'DTC growth teams' } }),
    agentByRole: async () => ({ id: 'agent-usman', name: 'Usman', role: 'sdr' }),
  },
}));
vi.mock('../src/lib/g8', () => ({
  unwrap: (r: any) => (r && typeof r === 'object' && 'data' in r ? r.data : r),
  g8: {
    get: vi.fn(async (p: string) => (p === '/linkedin/connection' ? { data: h.state.g8.connection } : h.state.g8.senders)),
    post: vi.fn(async () => { throw new Error('layer must never POST to graph8'); }),
  },
}));
vi.mock('../src/lib/llm', () => ({ llm: { json: vi.fn((p: string) => (h.state.llmImpl ? h.state.llmImpl(p) : Promise.reject(new Error('no llm')))) } }));
vi.mock('../src/lib/slack', () => ({ slack: h.state.slack }));

const L = await import('../src/layers/linkedin');
const { g8 } = await import('../src/lib/g8');

const lead = (id: string, name: string): any => ({ id, full_name: name, job_title: 'Head of Growth', company_name: 'Acme', why_now: 'hiring 3 growth marketers', research: { hook: 'x' } });
const ctx = (over: any = {}): any => ({
  workspaceId: 'ws-1', agentId: 'agent-x', role: 'head_of_sales', task: { id: 'task-1' }, runId: 'run-1',
  settings: { daily_find: 10, daily_research: 5 }, log: { info() {}, warn() {}, error() {}, child() { return this; } },
  step: vi.fn(async () => undefined), report: vi.fn(async () => undefined), requestApproval: vi.fn(), ...over,
});

beforeEach(() => {
  h.state.ops = []; h.state.settings = {}; h.state.rows = {}; h.state.llmImpl = null;
  h.state.g8.connection = { connected: false, accounts_count: 0 }; h.state.g8.senders = { senders: [], total_count: 0 };
  h.state.slack.postAs.mockClear(); h.state.slack.update.mockClear();
  delete process.env.LINKEDIN_FAKE_CONNECTED;
});

describe('linkedin layer registration', () => {
  it('registers as "linkedin" with onboarding, stepPlan and start', () => {
    const l = h.state.registered.find((x) => x.name === 'linkedin');
    expect(l).toBeTruthy();
    expect(l.onboarding.name).toBe('linkedin_connect');
    expect(typeof l.stepPlan).toBe('function');
    expect(typeof l.start).toBe('function');
  });
});

describe('stepPlan', () => {
  it('returns D1 connect + D6 message, planned, never a g8Step, with Gemini drafts saved per lead', async () => {
    h.state.llmImpl = async () => ({ drafts: [
      { lead_id: 'l1', connect: 'Hi Sara, loved the growth hiring push at Acme.', message: 'Sara, quick idea on UGC for Acme?' },
    ] });
    const steps = await L.linkedinLayer.stepPlan!(ctx(), [lead('l1', 'Sara Khan'), lead('l2', 'Ali Raza')]);
    expect(steps.map((s) => [s.day, s.channel, s.action, s.state])).toEqual([[1, 'linkedin', 'connection_request', 'planned'], [6, 'linkedin', 'message', 'planned']]);
    for (const s of steps) { expect(s.g8Step).toBeUndefined(); expect(s.fire).toBeUndefined(); expect(s.reason).toBe(L.REASON_WAITING); }
    expect((steps[0] as any).preview).toContain('Sara');
    await new Promise((r) => setTimeout(r, 0));
    const ups = h.state.ops.filter((o) => o.table === 'leads' && o.op === 'update');
    expect(ups).toHaveLength(2);
    expect(ups[0].payload.research.hook).toBe('x'); // merged, not clobbered
    expect(ups[0].payload.research.linkedin.connect).toContain('Sara');
    expect(ups[1].payload.research.linkedin.connect).toContain('Ali'); // template fallback for lead Gemini skipped
    expect(g8.post).not.toHaveBeenCalled();
  });

  it('falls back to templates when Gemini fails and still returns planned steps', async () => {
    const steps = await L.linkedinLayer.stepPlan!(ctx(), [lead('l1', 'Sara Khan')]);
    expect(steps).toHaveLength(2);
    expect((steps[1] as any).preview).toMatch(/Sara/);
  });

  it('stays planned (honest reason) even when already connected', async () => {
    const steps = await L.linkedinLayer.stepPlan!(ctx({ settings: { linkedin_connected: true } }), []);
    expect(steps.every((s) => s.state === 'planned' && !s.g8Step && s.reason === L.REASON_API)).toBe(true);
  });
});

describe('onboarding extra', () => {
  it('not connected → ok:false, creates connect_account approval + posts Connect card', async () => {
    const r = await L.linkedinLayer.onboarding!.run(ctx());
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/not connected/);
    const ins = h.state.ops.find((o) => o.table === 'approvals' && o.op === 'insert')!;
    expect(ins.payload.kind).toBe('connect_account');
    expect(ins.payload.payload).toMatchObject({ account: 'linkedin', connect_url: 'https://app.graph8.com/profile?tab=connectors' });
    expect(h.state.slack.postAs).toHaveBeenCalledWith('head_of_sales', 'hq', expect.objectContaining({ text: expect.stringMatching(/LinkedIn/) }));
    expect(h.state.ops.some((o) => o.table === 'approvals' && o.op === 'update' && o.payload.slack_ts === '111.1')).toBe(true);
  });

  it('reuses a pending LinkedIn connect approval (Ayesha already posted one)', async () => {
    h.state.rows['approvals.select'] = [{ id: 'appr-ayesha', slack_channel: 'CHQ', slack_ts: '9.9' }];
    const r = await L.linkedinLayer.onboarding!.run(ctx());
    expect(r.ok).toBe(false);
    expect(h.state.ops.some((o) => o.table === 'approvals' && o.op === 'insert')).toBe(false);
    expect(h.state.slack.postAs).not.toHaveBeenCalled();
  });

  it('connected (sender present) → ok:true and settings flag', async () => {
    h.state.g8.connection = { connected: true }; h.state.g8.senders = { senders: [{ id: 's1' }], total_count: 1 };
    const r = await L.linkedinLayer.onboarding!.run(ctx());
    expect(r).toMatchObject({ ok: true });
    expect(h.state.settings.linkedin_connected).toBe(true);
  });

  it('connected:true with 0 senders is still not connected', async () => {
    h.state.g8.connection = { connected: true };
    expect((await L.probeConnection()).connected).toBe(false);
  });
});

describe('watcher', () => {
  it('does nothing while not connected', async () => {
    expect(await L.checkOnce('ws-1')).toBe(false);
    expect(h.state.settings.linkedin_connected).toBeUndefined();
    expect(h.state.slack.postAs).not.toHaveBeenCalled();
  });

  it('LINKEDIN_FAKE_CONNECTED=1 → flips settings, approval, sequence steps, report + Slack post', async () => {
    process.env.LINKEDIN_FAKE_CONNECTED = '1';
    h.state.rows['approvals.update'] = [{ id: 'appr-1', slack_channel: 'CHQ', slack_ts: '5.5' }];
    h.state.rows['sequences.select'] = [{ id: 'seq-1', status: 'live', steps: [
      { n: 1, day: 0, channel: 'email', action: 'send', mode: 'g8' },
      { n: 2, day: 1, channel: 'linkedin', action: 'connection_request', mode: 'planned', layer: 'linkedin' },
      { n: 3, day: 6, channel: 'linkedin', action: 'message', mode: 'planned', layer: 'linkedin' },
    ] }];
    expect(await L.checkOnce('ws-1')).toBe(true);
    expect(h.state.settings.linkedin_connected).toBe(true);
    expect(h.state.settings.channels.linkedin).toBe(true);
    const ap = h.state.ops.find((o) => o.table === 'approvals' && o.op === 'update')!;
    expect(ap.payload.status).toBe('approved');
    expect(ap.filters).toContainEqual(['eq', 'payload->>account', 'linkedin']);
    expect(h.state.slack.update).toHaveBeenCalledWith('CHQ', '5.5', expect.anything());
    const seq = h.state.ops.find((o) => o.table === 'sequences' && o.op === 'update')!;
    expect(seq.payload.steps[0].mode).toBe('g8');
    expect(seq.payload.steps.slice(1).every((s: any) => s.mode === 'live' && s.reason === L.LIVE_NOTE)).toBe(true);
    const rep = h.state.ops.find((o) => o.table === 'reports' && o.op === 'insert')!;
    expect(rep.payload.title).toBe('LinkedIn connected — 2 touches now live');
    expect(h.state.slack.postAs).toHaveBeenCalledWith('sdr', 'hq', expect.objectContaining({ text: 'LinkedIn connected — 2 touches now live' }));
    expect(g8.post).not.toHaveBeenCalled();
  });

  it('is a no-op once already connected', async () => {
    process.env.LINKEDIN_FAKE_CONNECTED = '1';
    h.state.settings.linkedin_connected = true;
    expect(await L.checkOnce('ws-1')).toBe(false);
    expect(h.state.slack.postAs).not.toHaveBeenCalled();
  });

  it('start() subscribes to cron linkedin_watch and ignores other ticks', async () => {
    await L.linkedinLayer.start!();
    expect(h.state.busHandlers.length).toBe(1);
    process.env.LINKEDIN_FAKE_CONNECTED = '1';
    await h.state.busHandlers[0]({ name: 'inbox_poll' });
    expect(h.state.settings.linkedin_connected).toBeUndefined();
    await h.state.busHandlers[0]({ name: 'linkedin_watch' });
    expect(h.state.settings.linkedin_connected).toBe(true);
  });

  it('never throws when graph8 is down', async () => {
    (g8.get as any).mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('boom'));
    await expect(L.checkOnce('ws-1')).resolves.toBe(false);
  });
});
