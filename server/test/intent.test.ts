import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: no env, no Supabase, no network, no Gemini.
vi.mock('../src/lib/env', () => ({ env: { layersDisabled: [] } }));
vi.mock('../src/lib/store', () => ({ store: { patchSettings: vi.fn() } }));
vi.mock('../src/lib/g8', () => ({ g8: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/lib/llm', () => ({ llm: { json: vi.fn(), text: vi.fn() } }));

const { layers } = await import('../src/layers');
const { setupIntentTracking, readSignals, LAYER_NAME } = await import('../src/layers/intent');

const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => quiet } as any;

function deps(over: { get?: any; post?: any; json?: any } = {}) {
  return {
    g8: { get: vi.fn(over.get ?? (async () => ({ data: [] }))), post: vi.fn(over.post ?? (async () => ({}))) },
    llm: { json: vi.fn(over.json ?? (async () => ({ keywords: [] }))), text: vi.fn() },
    store: { patchSettings: vi.fn(async () => ({})) },
    log: quiet,
  };
}

function ctx(settings: Record<string, unknown> = {}) {
  return {
    workspaceId: 'ws1', agentId: 'a1', role: 'head_of_sales', runId: 'r1', task: { id: 't1' },
    settings, log: quiet, step: vi.fn(async () => {}), report: vi.fn(async () => {}),
  } as any;
}

const PLAN = {
  keywords: [
    { phrase: 'ugc creator agency', fallbacks: ['ugc video creators for brands', 'creator content'] },
    { phrase: 'paid social scaling', fallbacks: ['tiktok ads creative', 'meta ads creative'] },
  ],
};

describe('intent layer', () => {
  it('registers as "intent" with onboarding + signals', () => {
    const l = layers.all().find((x) => x.name === LAYER_NAME)!;
    expect(l.onboarding?.name).toBe('setup_intent_tracking');
    expect(typeof l.signals).toBe('function');
  });

  describe('setup_intent_tracking', () => {
    it('retries failed phrases with fallbacks, adds jobs keywords, stores ids', async () => {
      const cfsCalls: string[][] = [];
      const d = deps({
        get: async () => ({ data: [
          { file_type: 'icp_research', display_name: 'ICP', status: 'completed', content: 'DTC brands' },
          { file_type: 'brand_voice', display_name: 'Voice', status: 'completed', content: 'ignored' },
        ] }),
        json: async () => PLAN,
        post: async (path: string, body: any) => {
          if (path === '/intent/keywords/create-from-search') {
            cfsCalls.push(body.keywords);
            expect(body.contact_limit).toBe(50);
            return { data: { results: body.keywords.map((k: string) =>
              k === 'ugc video creators for brands' ? { keyword: k, keyword_id: 'kw-ugc', status: 'created', companies_seeded: 1 }
                : k === 'paid social scaling' ? { keyword: k, keyword_id: 'kw-paid', status: 'created', companies_seeded: 0 }
                  : { keyword: k, keyword_id: null, status: 'error', error: 'This search has no matching pages' }) } };
          }
          if (path === '/intent/keywords/add') {
            expect(body.signal_type).toBe('jobs');
            return { data: { created: body.keywords.map((k: string, i: number) => ({ id: `job-${i}`, keyword: k, signal_type: 'jobs' })) } };
          }
          throw new Error('unexpected ' + path);
        },
      });
      const c = ctx({ g8_intent_keyword_ids: ['old'] });
      const r = await setupIntentTracking(c, d as any, { awaitJobs: true });
      expect(r.ok).toBe(true);
      expect(r.note).toContain('2/2');
      // One phrase per call; failed primary retried with its first fallback.
      expect(cfsCalls.sort()).toEqual([['paid social scaling'], ['ugc creator agency'], ['ugc video creators for brands']]);
      expect(d.store.patchSettings).toHaveBeenCalledWith('ws1', { g8_intent_keyword_ids: ['old', 'kw-ugc', 'kw-paid'] });
      expect(d.store.patchSettings).toHaveBeenLastCalledWith('ws1', { g8_intent_keyword_ids: ['old', 'kw-ugc', 'kw-paid', 'job-0', 'job-1'] });
      // Only ICP/pains docs go to Gemini.
      const prompt = d.llm.json.mock.calls[0][0] as string;
      expect(prompt).toContain('DTC brands');
      expect(prompt).not.toContain('ignored');
    });

    it('reports not-ok (never throws) when graph8 accepts nothing', async () => {
      const d = deps({
        json: async () => PLAN,
        post: async (p: string, body: any) => p === '/intent/keywords/list' ? { rows: [] }
          : ({ data: { results: body.keywords.map((k: string) => ({ keyword: k, status: 'error', error: 'keyword processing failed' })) } }),
      });
      const r = await setupIntentTracking(ctx(), d as any);
      expect(r.ok).toBe(false);
      expect(r.note).toContain('no buying signals yet');
      expect(d.store.patchSettings).not.toHaveBeenCalled();
    });

    it('recovers keywords graph8 saved after a client timeout via keywords/list', async () => {
      const d = deps({
        json: async () => [{ keyword: 'UGC for paid ads', fallbacks: [] }], // bare array + {keyword}: lenient schema
        post: async (p: string) => {
          if (p === '/intent/keywords/create-from-search') throw new Error('graph8 -> network error: timeout after 30000 ms');
          if (p === '/intent/keywords/list') return { rows: [{ id: 'kw-late', keyword: 'ugc for paid ads', signal_type: 'intent', total_resolved_companies: 3 }] };
          if (p === '/intent/keywords/add') return { data: { created: [] } };
          throw new Error('unexpected ' + p);
        },
      });
      const r = await setupIntentTracking(ctx(), d as any);
      expect(r).toEqual({ ok: true, note: 'tracking 1/1 buying-intent keywords, 3 companies matched' });
      expect(d.store.patchSettings).toHaveBeenCalledWith('ws1', { g8_intent_keyword_ids: ['kw-late'] });
    });

    it('returns not-ok when Gemini fails', async () => {
      const d = deps({ json: async () => { throw new Error('gemini down'); } });
      const r = await setupIntentTracking(ctx(), d as any);
      expect(r).toEqual({ ok: false, note: expect.stringContaining('gemini down') });
    });
  });

  describe('signals', () => {
    it('merges keyword companies + ABM rows per domain', async () => {
      const d = deps({
        post: async (path: string) => {
          expect(path).toBe('/intent/keywords/kw1/companies');
          return { rows: [
            { COMPANY_DOMAIN: 'www.Acme.com', page_title: null, page_url: 'forbes.com/ugc-article' },
            { COMPANY_DOMAIN: 'acme.com', page_title: null, page_url: 'forbes.com/ugc-article' },
          ], total: 2 };
        },
        get: async (path: string, q: any) => {
          expect(path).toBe('/intent/abm/companies');
          expect(q.keyword_ids).toBe('kw1');
          return { data: { items: [
            { company_domain: 'acme.com', account_strength: 'weak', total_signal_count: 2, top_keywords: [{ keyword: 'ugc video' }] },
            { company_domain: 'beta.io', is_high_intent: true, total_signal_count: 5, top_keywords: [] },
          ] } };
        },
      });
      const out = await readSignals({ settings: { g8_intent_keyword_ids: ['kw1'] } } as any, 'Head of Growth', d as any);
      const acme = out.find((x) => x.domain === 'acme.com')!;
      expect(acme.signals).toEqual([
        { type: 'intent', text: 'researching: forbes.com/ugc-article', source: 'graph8 intent' },
        { type: 'intent', text: 'weak account: 2 signals on "ugc video"', source: 'graph8 intent' },
      ]);
      expect(out.find((x) => x.domain === 'beta.io')!.signals[0].text).toBe('high intent: 5 signals');
    });

    it('returns [] when graph8 fails', async () => {
      const d = deps({ get: async () => { throw new Error('500'); }, post: async () => { throw new Error('500'); } });
      expect(await readSignals({ settings: { g8_intent_keyword_ids: ['kw1'] } } as any, 'x', d as any)).toEqual([]);
    });

    it('layer hook never throws', async () => {
      const l = layers.all().find((x) => x.name === LAYER_NAME)!;
      await expect(l.signals!({ settings: null } as any, 'x')).resolves.toBeInstanceOf(Array);
    });
  });
});
