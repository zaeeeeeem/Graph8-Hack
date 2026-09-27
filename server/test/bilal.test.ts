import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  g8: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  llm: { json: vi.fn(), text: vi.fn() },
  store: { db: null as any, patchSettings: vi.fn(), spend: vi.fn(), workspace: vi.fn() },
  slack: { checklist: vi.fn(), postAs: vi.fn() },
  layers: { all: vi.fn(() => [] as any[]) },
}));
vi.mock('../src/lib/g8', () => ({ g8: m.g8 }));
vi.mock('../src/lib/llm', () => ({ llm: m.llm }));
vi.mock('../src/lib/store', () => ({ store: m.store }));
vi.mock('../src/lib/slack', () => ({ slack: m.slack }));
vi.mock('../src/layers', () => ({ layers: m.layers }));
vi.mock('../src/lib/env', () => ({ env: { allowlist: [] } }));

import bilalDefault, { bilal } from '../src/agents/bilal';
import { fakeDb } from '../src/agents/bilal/fakedb';
import { heuristicPlan, sanitizePlan, toFilters, widen, type SearchPlan } from '../src/agents/bilal/filters';
import { rank, score, toProspect, type Prospect } from '../src/agents/bilal/score';
import { listCard } from '../src/slack/cards/list';

const WS = 'ws-1';
const PII = /@|\+\d{6,}/;

function plan(over: Partial<SearchPlan> = {}): SearchPlan {
  return {
    label: 'UK fintech CFOs', titles: ['CFO'], adjacentTitles: ['VP Finance'], seniority: ['CXO'],
    industries: ['Financial Services'], sizes: ['51-200', '201-500'], countries: ['United Kingdom'],
    nearbyCountries: ['Ireland'], widened: [], loose: { titles: [], sizes: [], countries: [] }, ...over,
  };
}

function row(i: number, over: Record<string, any> = {}) {
  return {
    first_name: `First${i}`, last_name: `Last${i}`, job_title: 'CFO', seniority_level: 'CXO', job_department: 'Finance',
    company_name: `Co${i}`, company_domain: `co${i}.com`, company_industry: 'Financial Services', company_employee_count: '201-500',
    country: 'United Kingdom', state: 'England', linkedin_url: `linkedin.com/in/p${i}`, confidence_score: 60,
    work_email: '***', mobile_phone: '', ...over,
  };
}

function ctx(input: Record<string, any> = {}) {
  return {
    workspaceId: WS, agentId: 'agent-bilal', role: 'scout', runId: 'run-1',
    task: { id: 'task-1', number: 7, input, parent_task_id: null } as any,
    settings: { daily_find: 10, daily_research: 5, target_persona: 'CFOs at UK fintechs', geo: ['United Kingdom'] } as any,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } as any,
    step: vi.fn(async () => {}), report: vi.fn(async () => {}), delegate: vi.fn(async () => ({ id: 'child' })),
    requestApproval: vi.fn(), thread: vi.fn(async () => ({ ts: '111.1', channel: 'C_TEAM' })),
  } as any;
}

describe('B12 score', () => {
  it('is deterministic and follows the fixed weights', () => {
    const p = toProspect(row(1));
    const a = score(p, plan()); const b = score(p, plan());
    expect(a.fit_score).toBe(100);
    expect(a).toEqual(b);
    expect(a.breakdown).toEqual({ title: 40, seniority: 15, industry: 20, size: 15, geo: 10, intent: 0 });
  });
  it('gives partial credit and caps at 100 with intent', () => {
    const p = toProspect(row(2, { job_title: 'VP Finance', seniority_level: 'Vice President', company_employee_count: '501-1000', country: 'Ireland' }));
    const s = score(p, plan());
    expect(s.breakdown).toMatchObject({ title: 25, seniority: 0, industry: 20, size: 8, geo: 0 });
    const withSig = score({ ...toProspect(row(3)), signals: [{ type: 'intent', text: 'a' }, { type: 'intent', text: 'b' }, { type: 'x', text: 'c' }] }, plan());
    expect(withSig.breakdown!.intent).toBe(20);
    expect(withSig.fit_score).toBe(100);
  });
  it('reason uses graph8 facts only, no PII', () => {
    const s = score(toProspect(row(1, { work_email: 'real@x.com' })), plan());
    expect(s.reason).toBe('CFO, 201-500 staff, Financial Services, United Kingdom');
    expect(JSON.stringify(s)).not.toContain('real@x.com');
  });
});

describe('rank', () => {
  it('max 2 per company and prefers confidence ≥ 50', () => {
    const ps: Prospect[] = [
      ...[1, 2, 3].map((i) => score(toProspect(row(i, { company_domain: 'same.com', company_name: 'Same' })), plan())),
      score(toProspect(row(4, { confidence_score: 10 })), plan()),
      score(toProspect(row(5, { confidence_score: 90, job_title: 'Accountant' })), plan()),
    ];
    const top = rank(ps, 3);
    expect(top.filter((p) => p.company_domain === 'same.com')).toHaveLength(2);
    expect(top.map((p) => p.full_name)).not.toContain('First4 Last4');
    expect(rank(ps, 4).map((p) => p.full_name)).toContain('First4 Last4');
  });
});

describe('filters', () => {
  it('drops industries/seniority/sizes that graph8 does not know', () => {
    const p = sanitizePlan({ label: 'x', titles: ['CFO'], adjacent_titles: [], seniority: ['cxo', 'Boss'], industries: ['fintech', 'financial services'], sizes: ['201-500', '200-500'], countries: ['United Kingdom'], nearby_countries: [] });
    expect(p.industries).toEqual(['Financial Services']);
    expect(p.seniority).toEqual(['CXO']);
    expect(p.sizes).toEqual(['201-500']);
  });
  it('widens geo → titles → size, cumulative', () => {
    const p = plan();
    expect(widen(p)).toBe(true); expect(p.widened).toEqual(['geo']);
    expect(widen(p)).toBe(true); expect(p.widened).toEqual(['geo', 'titles']);
    expect(widen(p)).toBe(true); expect(p.loose.sizes).toEqual(['501-1000', '1001-5000']);
    const f = toFilters(p);
    expect(f.find((x) => x.field === 'country')!.value).toEqual(['United Kingdom', 'Ireland']);
    expect(f.find((x) => x.field === 'job_title')!.value).toEqual(['CFO', 'VP Finance']);
  });
  it('heuristic fallback maps fintech to verified industries', () => {
    const p = heuristicPlan('CFOs at UK fintech startups', ['United Kingdom']);
    expect(p.industries).toContain('Financial Services');
    expect(p.titles).toContain('CFO');
  });
});

describe('list card', () => {
  it('marks top 5 → Hira and has no PII', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, title: 'CFO', company: 'Co', fit: 80, reason: 'r', url: 'https://app.graph8.com/contacts/1', toHira: i < 5 }));
    const c = listCard({ listName: 'L', rows, strong: 10 });
    expect(JSON.stringify(c.blocks).match(/→ Hira/g)).toHaveLength(5);
    expect(JSON.stringify(c)).not.toMatch(PII);
  });
});

describe('bilal.run', () => {
  let db: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    db = fakeDb({
      leads: [{ id: 'old', workspace_id: WS, full_name: 'First2 Last2', company_domain: 'co2.com', company_name: 'Co2', is_test_contact: false }],
      lead_contacts: [],
      contact_allowlist: [{ id: 'al1', workspace_id: WS, label: 'Zaeem (team)', email: 'zaeem@example.com', phone: '+923001234567', linkedin_url: null }],
    });
    m.store.db = db;
    m.layers.all.mockReturnValue([]);
    m.slack.checklist.mockResolvedValue({ ts: 't', channel: 'C_TEAM', set: vi.fn(async () => {}), add: vi.fn(async () => {}), title: vi.fn() });
    m.slack.postAs.mockResolvedValue({ ts: 'c', channel: 'C_TEAM' });
    m.llm.json.mockResolvedValue({ label: 'UK fintech CFOs', titles: ['CFO'], adjacent_titles: ['VP Finance'], seniority: ['CXO'], industries: ['Financial Services', 'fintech'], sizes: ['51-200', '201-500'], countries: ['United Kingdom'], nearby_countries: ['Ireland'] });
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row(i + 1)),
      row(20, { company_domain: 'co1.com', company_name: 'Co1' }), row(21, { company_domain: 'co1.com', company_name: 'Co1' }),
    ];
    m.g8.post.mockImplementation(async (path: string) => {
      if (path === '/search/contacts') return { data: rows, pagination: { total: 797 } };
      if (path === '/lists') return { data: { id: 77 } };
      throw new Error(`unexpected POST ${path}`);
    });
    m.g8.put.mockResolvedValue({ data: { total: 10, created: 10, updated: 0, errors: [] } });
    m.g8.get.mockImplementation(async (path: string, q: any) => {
      if (path === '/contacts/suppressions') return { data: [] };
      if (path === '/contacts') return { data: q.name === 'Last3' ? [{ first_name: 'First3', last_name: 'Last3' }] : [] };
      if (path === '/lists/77/contacts') return {
        data: [
          ...Array.from({ length: 21 }, (_, i) => ({ id: 1000 + i + 1, first_name: `First${i + 1}`, last_name: `Last${i + 1}`, linkedin_url: `https://www.linkedin.com/in/p${i + 1}`, company_id: 500 + i })),
          { id: 999, first_name: 'Zaeem', last_name: '(team)', work_email: 'zaeem@example.com' },
        ],
      };
      throw new Error(`unexpected GET ${path}`);
    });
  });

  it('exports brain as named + default with role scout', () => {
    expect(bilalDefault).toBe(bilal);
    expect(bilal.role).toBe('scout');
  });

  it('finds 10, dedupes, saves, adds TEST teammates once, hands top 5 to Hira', async () => {
    const c = ctx();
    const summary = await bilal.run(c);

    const searchCall = m.g8.post.mock.calls.find((x) => x[0] === '/search/contacts')!;
    expect(searchCall[1].capture).toBe(false);
    expect(searchCall[1].filters.find((f: any) => f.field === 'company_industry').value).toEqual(['Financial Services']);

    const leads = db.tables.leads.filter((l) => l.id !== 'old');
    const real = leads.filter((l) => !l.is_test_contact);
    expect(real).toHaveLength(10);
    expect(real.map((l) => l.full_name)).not.toContain('First2 Last2'); // already our lead
    expect(real.map((l) => l.full_name)).not.toContain('First3 Last3'); // already in graph8 CRM
    expect(real.filter((l) => l.company_domain === 'co1.com').length).toBeLessThanOrEqual(2);
    expect(real.every((l) => l.g8_list_id === '77' && l.stage === 'prospect' && typeof l.fit_score === 'number')).toBe(true);
    expect(real[0].g8_contact_id).toBeTruthy();

    const tests = leads.filter((l) => l.is_test_contact);
    expect(tests).toHaveLength(1);
    expect(tests[0].g8_contact_id).toBe('999');
    expect(db.tables.contact_allowlist[0].g8_contact_id).toBe('999');
    const tc = db.tables.lead_contacts.find((x) => x.lead_id === tests[0].id)!;
    expect(tc.email).toBe('zaeem@example.com');

    expect(db.tables.lead_events.filter((e) => e.type === 'found')).toHaveLength(11);
    for (const e of db.tables.lead_events) expect(e.summary).not.toMatch(PII);

    expect(c.delegate).toHaveBeenCalledTimes(1);
    const [to, kind, , input] = c.delegate.mock.calls[0];
    expect([to, kind]).toEqual(['researcher', 'research_leads']);
    expect(input.lead_ids).toHaveLength(5);
    expect(input.backfill_lead_ids).toHaveLength(5);
    expect(input.test_lead_ids).toHaveLength(1);
    expect(input.list_id).toBe('77');

    const [kindR, , body] = c.report.mock.calls[0];
    expect(kindR).toBe('handoff');
    expect(body).not.toMatch(PII);
    expect(summary).toContain('Found 10');

    const card = m.slack.postAs.mock.calls.at(-1)!;
    expect(card[2].threadTs).toBe('111.1');
    expect(JSON.stringify(card[2])).not.toMatch(PII);
    expect(m.store.patchSettings).toHaveBeenCalledWith(WS, { last_run_list_id: 77 });
  });

  it('does not re-add TEST leads on later runs', async () => {
    db.tables.leads.push({ id: 't0', workspace_id: WS, full_name: 'Zaeem', is_test_contact: true });
    await bilal.run(ctx());
    expect(db.tables.leads.filter((l) => l.is_test_contact)).toHaveLength(1);
  });

  it('widens at most 2 steps when too few, and reports what widened', async () => {
    m.g8.post.mockImplementation(async (path: string) => {
      if (path === '/search/contacts') return { data: [row(1), row(4)], pagination: { total: 2 } };
      if (path === '/lists') return { data: { id: 77 } };
      throw new Error(path);
    });
    const c = ctx();
    await bilal.run(c);
    expect(m.g8.post.mock.calls.filter((x) => x[0] === '/search/contacts')).toHaveLength(3);
    expect(c.report.mock.calls[0][2]).toMatch(/widened geo to Ireland; titles to VP Finance/);
  });

  it('works with a layer whose signals hook throws (⚠️, fit-only)', async () => {
    m.layers.all.mockReturnValue([{ name: 'intent', signals: async () => { throw new Error('boom'); } }]);
    const c = ctx();
    await expect(bilal.run(c)).resolves.toContain('Found 10');
  });

  it('merges intent signals from layers into the score (company-first search too)', async () => {
    m.layers.all.mockReturnValue([{ name: 'intent', signals: async () => [{ domain: 'co12.com', signals: [{ type: 'intent', text: 'researching spend tools' }] }] }]);
    const c = ctx();
    await bilal.run(c);
    const domainSearch = m.g8.post.mock.calls.find((x) => x[0] === '/search/contacts' && x[1].filters.some((f: any) => f.field === 'company_domain'));
    expect(domainSearch).toBeTruthy();
    const l = db.tables.leads.find((x) => x.company_domain === 'co12.com')!;
    expect(l.signals[0].text).toBe('researching spend tools');
    expect(l.source).toBe('signal');
  });

  it('falls back to keyword mapping when Gemini fails', async () => {
    m.llm.json.mockRejectedValue(new Error('quota'));
    await expect(bilal.run(ctx())).resolves.toContain('Found');
  });

  it('fails the task after one retry when graph8 search keeps failing (B14)', async () => {
    m.g8.post.mockRejectedValue(new Error('429'));
    await expect(bilal.run(ctx())).rejects.toThrow('429');
    expect(m.g8.post.mock.calls.filter((x) => x[0] === '/search/contacts')).toHaveLength(2);
  }, 10_000);
});
