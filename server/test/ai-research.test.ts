import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: no .env.local, no Supabase, no network.
const envMock = { G8_API_KEY: 'k', G8_BASE_URL: 'https://g8.test/api/v1', layersDisabled: [] as string[], allowlist: [] };
vi.mock('../src/lib/env', () => ({ env: envMock }));

let settings: Record<string, any> = {};
const spend = vi.fn(async () => {});
vi.mock('../src/lib/store', () => ({
  store: {
    db: {},
    workspace: async () => ({ sales_brain: { offer: 'managed UGC creator network', icp: 'DTC growth teams', personas: ['Head of Growth'] } }),
    settings: async () => ({ ...settings }),
    patchSettings: async (_: string, p: Record<string, any>) => { settings = { ...settings, ...p }; return settings; },
    spend,
  },
}));

const g8Post = vi.fn(async (_path: string, _body?: any): Promise<any> => ({ data: { group_id: 'ai_enrich_abc12345' } }));
const g8Get = vi.fn(async (path: string): Promise<any> => {
  if (path === '/contacts/11') return { data: { id: 11, custom_fields: { ai_enrich_abc12345_why_now: 'Raised Series A last month', ai_enrich_abc12345_talking_points: 'Congrats on the raise | Scaling UGC after launch' } } };
  return { data: { id: 12, custom_fields: null } };
});
let credits = [1000, 978];
vi.mock('../src/lib/g8', () => ({
  g8: { post: g8Post, get: g8Get, credits: async () => credits.shift() ?? NaN },
  unwrap: (r: any) => (r && typeof r === 'object' && 'data' in r ? r.data : r),
}));
const registered: any[] = [];
vi.mock('../src/layers', () => ({ layers: { register: (l: any) => registered.push(l) } }));
vi.mock('../src/lib/log', () => {
  const l: any = { info() {}, warn() {}, error() {}, child: () => l };
  return { log: l };
});

const mod = await import('../src/layers/ai-research');

const lead = (id: string, over: Record<string, any> = {}) => ({
  id, g8_contact_id: id === 'L1' ? '11' : '12', g8_list_id: '3', company_domain: 'acme.com', full_name: 'X', ...over,
}) as any;
const ctx = () => ({ workspaceId: 'ws', agentId: 'hira', runId: 'run', task: { id: 't' }, step: vi.fn(async () => {}) }) as any;

function enrichResponse(succeeded: number, failed: number) {
  return new Response(JSON.stringify({ data: { job_id: 'j1', status: 'completed', results: [{ processed_records: succeeded + failed, successful_enrichments: succeeded, failed_enrichments: failed }], successful_enrichments: null, failed_enrichments: null } }), { status: 200 });
}

beforeEach(() => {
  settings = {};
  credits = [1000, 978];
  spend.mockClear(); g8Post.mockClear(); g8Get.mockClear();
  envMock.layersDisabled = [];
  vi.unstubAllGlobals();
});

describe('ai_research layer', () => {
  it('registers with onboarding + research hooks', () => {
    expect(registered[0].name).toBe('ai_research');
    expect(registered[0].onboarding.name).toBe('setup_ai_research');
    expect(typeof registered[0].research.collect).toBe('function');
  });

  it('config body has outer DTO + inner execution config, scoped (not global), upper-case fields', () => {
    const b: any = mod.configBody(3, 'p');
    expect(b.config.config).toMatchObject({ scope: 'contact', auto_update: false });
    expect(b.config.is_global).toBe(false);
    expect(b.config.list_id).toBe(3);
    expect(b.config.input_mapping).toEqual(['CONTACT_FIRST_NAME', 'COMPANY_DOMAIN']);
    expect(b.config.outputs.map((o: any) => o.name)).toEqual(['why_now', 'talking_points']);
  });

  it('prompt uses brand + persona and graph8 placeholders', () => {
    const p = mod.buildPrompt({ offer: 'UGC network', personas: ['Head of Growth'] }, { target_persona: 'VP Marketing' } as any);
    expect(p).toContain('UGC network');
    expect(p).toContain('VP Marketing');
    expect(p).toContain('{{COMPANY_DOMAIN}}');
  });

  it('ensureForList creates once per list and remembers group_id', async () => {
    expect(await mod.ensureForList('ws', 3)).toBe('ai_enrich_abc12345');
    expect(await mod.ensureForList('ws', 3)).toBe('ai_enrich_abc12345');
    expect(g8Post).toHaveBeenCalledTimes(1);
    expect(settings.g8_ai_research_groups).toEqual({ '3': 'ai_enrich_abc12345' });
    expect(settings.g8_ai_research_group_id).toBe('ai_enrich_abc12345');
  });

  it('onboarding stores settings.g8_ai_research_group_id; failure returns ok:false, never throws', async () => {
    expect(await registered[0].onboarding.run(ctx())).toMatchObject({ ok: true });
    expect(settings.g8_ai_research_group_id).toBe('ai_enrich_abc12345');
    settings = {};
    g8Post.mockRejectedValueOnce(new Error('422'));
    expect(await registered[0].onboarding.run(ctx())).toMatchObject({ ok: false });
  });

  it('collect: canary sends 1 record until a run has succeeded, then marks ok', async () => {
    const fetchMock = vi.fn(async () => enrichResponse(1, 0));
    vi.stubGlobal('fetch', fetchMock);
    const out = await mod.collect(ctx(), [lead('L1'), lead('L2')]);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).record_ids).toEqual([11]);
    expect(out.L1.facts.length).toBeGreaterThan(0);
    expect(settings.g8_ai_research_ok).toBe(true);
  });

  it('collect: only leads with company_domain, max 5, facts from output columns, spend recorded', async () => {
    settings = { g8_ai_research_ok: true };
    const fetchMock = vi.fn(async () => enrichResponse(1, 1));
    vi.stubGlobal('fetch', fetchMock);
    const leads = [lead('L1'), lead('L2'), lead('L3', { company_domain: null, g8_contact_id: '13' }),
      ...['14', '15', '16', '17', '18'].map((c) => lead('X' + c, { g8_contact_id: c }))];
    const out = await mod.collect(ctx(), leads);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.record_ids).toEqual([11, 12, 14, 15, 16]);
    expect(body.list_id).toBe(3);
    expect(out.L1.facts[0]).toContain('Raised Series A');
    expect(out.L1.facts).toHaveLength(3);
    expect(out.L2).toBeUndefined();
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ source: 'graph8', action: 'ai_enrich', credits: 22, agentId: 'hira' }));
  });

  it('all records failed → {} , spend still recorded, breaker trips and next run skips graph8', async () => {
    const fetchMock = vi.fn(async () => enrichResponse(0, 1));
    vi.stubGlobal('fetch', fetchMock);
    expect(await mod.collect(ctx(), [lead('L1')])).toEqual({});
    expect(spend).toHaveBeenCalledTimes(1);
    expect(settings.g8_ai_research_tripped).toBeTruthy();
    expect(await mod.collect(ctx(), [lead('L1')])).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('timeout / network error → {} and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }));
    expect(await mod.collect(ctx(), [lead('L1')])).toEqual({});
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ credits: 22, meta: expect.objectContaining({ timed_out: true }) }));
    expect(settings.g8_ai_research_tripped).toContain('timed out');
  });

  it('no eligible leads → no graph8 call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await mod.collect(ctx(), [lead('L1', { company_domain: null })])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(g8Post).not.toHaveBeenCalled();
  });

  it('kill switch: LAYERS_DISABLED=ai_research → {}', async () => {
    envMock.layersDisabled = ['ai_research'];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await mod.collect(ctx(), [lead('L1')])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('facts scrub emails/phones', () => {
    const f = mod.toFacts({ why_now: 'Email ceo@acme.com or call +1 415 555 0199 now' });
    expect(f[0]).not.toMatch(/@|415/);
  });
});
