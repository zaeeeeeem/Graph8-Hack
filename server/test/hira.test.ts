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

import hiraDefault, { hira } from '../src/agents/hira';
import { fakeDb } from '../src/agents/bilal/fakedb';
import { classifyVerify, timing } from '../src/agents/hira/enrich';
import { fallbackHook } from '../src/agents/hira/hook';
import { parseOpenJobs, lookupFacts } from '../src/agents/hira/company';
import { researchCard } from '../src/slack/cards/research';

const WS = 'ws-1';
const PII = /@|\+\d{6,}/;

function lead(i: number, over: Record<string, any> = {}) {
  return {
    id: `L${i}`, workspace_id: WS, g8_contact_id: String(1000 + i), g8_company_id: String(500 + i), g8_list_id: '77',
    full_name: `Person ${i}`, job_title: 'CFO', company_name: `Co${i}`, company_domain: `co${i}.com`, stage: 'prospect',
    fit_score: 90 - i, signals: [], research: { reason: 'CFO, 201-500 staff, Financial Services, United Kingdom' },
    is_test_contact: false, do_not_contact: false, why_now: null, ...over,
  };
}

function ctx(input: Record<string, any>) {
  return {
    workspaceId: WS, agentId: 'agent-hira', role: 'researcher', runId: 'run-2',
    task: { id: 'task-2', number: 8, input, parent_task_id: null } as any,
    settings: { daily_find: 10, daily_research: 5 } as any,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } as any,
    step: vi.fn(async () => {}), report: vi.fn(async () => {}), delegate: vi.fn(async () => ({ id: 'child' })),
    requestApproval: vi.fn(), thread: vi.fn(async () => ({ ts: '222.2', channel: 'C_TEAM' })),
  } as any;
}

describe('H6 verification mapping (live verify-email shape)', () => {
  it('maps graph8 statuses', () => {
    expect(classifyVerify({ status: 'ok' })).toBe('valid');
    expect(classifyVerify({ status: 'ok_for_all', is_valid: false })).toBe('catch-all');
    expect(classifyVerify({ status: 'invalid' })).toBe('invalid');
    expect(classifyVerify({ status: 'email_disabled' })).toBe('invalid');
    expect(classifyVerify({ status: 'something_else' })).toBe('unknown');
  });
});

describe('company + hook helpers', () => {
  it('lookupFacts keeps facts, drops company phone', () => {
    const f = lookupFacts({ found: true, data: { name: 'Cooper Parry', industry: 'Financial Services', employee_count: '1001-5000', revenue: '100 Million to 250 Million', phone: '+441332411163', description: 'UK accountancy.' } });
    expect(f.facts.join(' ')).toContain('1001-5000');
    expect(f.facts.join(' ')).not.toMatch(PII);
  });
  it('parseOpenJobs tolerates several shapes', () => {
    expect(parseOpenJobs([{ company_id: 1, open_jobs: 4, jobs: [{ title: 'Controller' }] }]).get('1')).toEqual({ count: 4, titles: ['Controller'] });
    expect(parseOpenJobs({ companies: [{ id: 2, count: 1 }] }).get('2')!.count).toBe(1);
  });
  it('fallback hook uses facts only', () => {
    const h = fallbackHook({ name: 'A', title: 'CFO', company: 'Co', facts: ['fit: CFO, 201-500 staff'], signals: ['3 open roles in 60 days'], channels: ['linkedin'] });
    expect(h.why_now).toBe('3 open roles in 60 days');
    expect(h.best_channel).toBe('linkedin');
    expect(h.via).toBe('fallback');
  });
  it('research card shows icons, replacements, no PII', () => {
    const c = researchCard({ rows: [
      { name: 'A', company: 'Co', hook: 'h', channels: ['email', 'phone', 'linkedin'], emailStatus: 'verified', fit: 80, url: 'u' },
      { name: 'B', company: 'Co', hook: '', channels: [], fit: 70, url: 'u', disqualified: { reason: 'no reachable channel', replacement: 'C' } },
    ] });
    const s = JSON.stringify(c);
    expect(s).toContain('✉️ 📞 in');
    expect(s).toContain('replaced by *C*');
    expect(s).not.toMatch(PII);
  });
});

describe('hira.run', () => {
  let db: ReturnType<typeof fakeDb>;
  const emails: Record<string, { work_email?: string; mobile_phone?: string; linkedin_url?: string }> = {
    1001: { work_email: 'p1@co1.com', mobile_phone: '+447700900001' },
    1002: { work_email: 'p2@co2.com' },
    1003: { work_email: 'bad@co3.com' },
    1004: {},                                     // nothing, and lead has no linkedin → disqualified → backfill
    1005: { work_email: 'p5@co5.com' },
    1006: { work_email: 'p6@co6.com' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    timing.pollMs = 1; timing.maxWaitMs = 200; timing.lateWaitMs = 50;
    db = fakeDb({
      leads: [lead(1), lead(2), lead(3), lead(4), lead(5), lead(6), lead(7),
        { ...lead(9), id: 'T1', g8_contact_id: '999', full_name: 'Zaeem', company_name: 'TEST (team)', company_domain: null, is_test_contact: true, fit_score: null }],
      lead_contacts: [
        ...[1, 2, 3, 5, 6, 7].map((i) => ({ lead_id: `L${i}`, workspace_id: WS, linkedin_url: `https://www.linkedin.com/in/p${i}`, enrichment: {} })),
        { lead_id: 'T1', workspace_id: WS, email: 'zaeem@example.com', phone: '+923001234567', linkedin_url: null, enrichment: {} },
      ],
    });
    m.store.db = db;
    m.store.workspace.mockResolvedValue({ sales_brain: { offer: 'AI SDR team in Slack', icp: 'B2B SaaS' } });
    m.layers.all.mockReturnValue([]);
    m.slack.checklist.mockResolvedValue({ ts: 't', channel: 'C_TEAM', set: vi.fn(async () => {}), add: vi.fn(async () => {}), title: vi.fn() });
    m.slack.postAs.mockResolvedValue({ ts: 'c', channel: 'C_TEAM' });
    m.llm.json.mockImplementation(async (prompt: string) => {
      if (prompt.includes('Person 2')) throw new Error('gemini down');
      return { why_now: 'Hiring a finance controller while scaling', talking_points: ['a', 'b'], best_channel: 'email' };
    });
    m.g8.post.mockImplementation(async (path: string, body: any) => {
      if (path === '/contacts/unlock-info') return { data: { credits_charged: body.contact_ids.length } };
      if (path === '/enrichment/enrich') return { data: { job_id: `job-${body.contact_ids.join('-')}`, status: 'queued' } };
      if (path === '/enrichment/verify-email') return { data: { status: body.email.startsWith('bad') ? 'invalid' : body.email.startsWith('p2') ? 'ok_for_all' : 'ok' } };
      if (path === '/enrichment/lookup/company') return { data: { found: true, data: { name: 'Co', industry: 'Financial Services', employee_count: '201-500' } } };
      if (path === '/companies/open-jobs') return { data: [{ company_id: 501, open_jobs: 3, jobs: [{ title: 'Financial Controller' }] }] };
      throw new Error(`unexpected POST ${path}`);
    });
    m.g8.get.mockImplementation(async (path: string) => {
      if (path === '/contacts/suppressions') return { data: [] };
      if (path.startsWith('/enrichment/jobs/')) return { data: { status: 'completed', total_credits_used: 12, successful_enrichments: 4 } };
      const id = path.split('/')[2];
      if (path.startsWith('/contacts/')) return { data: { id, ...(emails[id] ?? {}) } };
      throw new Error(`unexpected GET ${path}`);
    });
  });

  it('exports brain as named + default with role researcher', () => {
    expect(hiraDefault).toBe(hira);
    expect(hira.role).toBe('researcher');
  });

  it('enriches, verifies (H6), disqualifies + backfills (R6), spends credits, hands to Usman', async () => {
    const c = ctx({ lead_ids: ['L1', 'L2', 'L3', 'L4', 'L5'], backfill_lead_ids: ['L6', 'L7'], test_lead_ids: ['T1'], list_id: '77' });
    const summary = await hira.run(c);

    const unlockCalls = m.g8.post.mock.calls.filter((x) => x[0] === '/contacts/unlock-info');
    expect(unlockCalls[0][1].contact_ids).toEqual([1001, 1002, 1003, 1004, 1005]);
    // only the one still without an email after unlock goes to waterfall enrichment
    const enrichCalls = m.g8.post.mock.calls.filter((x) => x[0] === '/enrichment/enrich');
    expect(enrichCalls[0][1]).toMatchObject({ contact_ids: [1004], list_id: 77 });
    expect(enrichCalls).toHaveLength(1); // backfill L6 got its email from unlock

    const byId = Object.fromEntries(db.tables.leads.map((l) => [l.id, l]));
    expect(byId.L4.stage).toBe('disqualified');
    expect(byId.L4.research.replaced_by).toBe('Person 6');
    expect(byId.L6.stage).toBe('researched');
    expect(byId.L7.stage).toBe('prospect'); // not needed
    expect(byId.L1.why_now).toBe('Hiring a finance controller while scaling');
    expect(byId.L1.research.channels).toEqual(['email', 'phone', 'linkedin']);
    expect(byId.L1.signals.some((s: any) => s.type === 'hiring')).toBe(true);
    expect(byId.L2.research.hook_via).toBe('fallback'); // Gemini failed → H5 fallback
    expect(byId.L2.research.email_status).toBe('catch-all');
    expect(byId.L3.research.channels).toEqual(['linkedin']); // invalid email → no email channel
    expect(byId.T1.stage).toBe('researched');

    const lc = Object.fromEntries(db.tables.lead_contacts.map((x) => [x.lead_id, x]));
    expect(lc.L1.email).toBe('p1@co1.com');
    expect(lc.L1.email_verified).toBe(true);
    expect(lc.L3.email_verified).toBe(false);

    expect(m.store.spend).toHaveBeenCalledWith(expect.objectContaining({ source: 'graph8', credits: 12, action: 'enrichment', workspaceId: WS }));
    expect(m.store.spend).toHaveBeenCalledWith(expect.objectContaining({ source: 'graph8', credits: 5, action: 'unlock_contacts' }));

    for (const e of db.tables.lead_events) expect(e.summary).not.toMatch(PII);
    for (const l of db.tables.leads) expect(JSON.stringify({ why: l.why_now, r: l.research })).not.toMatch(PII);

    const [to, kind, , input] = c.delegate.mock.calls[0];
    expect([to, kind]).toEqual(['sdr', 'build_sequence']);
    expect(input.lead_ids).toEqual(['L1', 'L2', 'L3', 'L5', 'L6']);
    expect(input.test_lead_ids).toEqual(['T1']);
    expect(c.report.mock.calls[0][0]).toBe('handoff');
    expect(c.report.mock.calls[0][2]).not.toMatch(PII);
    expect(summary).toMatch(/5 researched \(\+1 TEST\), \d emails usable, 1 replaced/);

    const card = m.slack.postAs.mock.calls.find((c: any[]) => c[2].blocks)!;
    expect(card[2].threadTs).toBe('222.2');
    expect(JSON.stringify(card[2])).not.toMatch(PII);
    // one message per step: the wrap-up voice line (template here, Gemini mocked) leads the card
    const line = m.slack.postAs.mock.calls.at(-1)![2];
    expect(line.blocks[0].text.text).toBe(line.text);
    expect(m.slack.postAs.mock.calls.filter((c: any[]) => /^(Found|Researched) \d+/.test(c[2].text)).length).toBe(1);
    expect(line.text).toMatch(/Researched \d+ leads/);
  });

  it('hands over after the wait cap with pending leads (H8), never disqualifying them', async () => {
    m.g8.get.mockImplementation(async (path: string) => {
      if (path === '/contacts/suppressions') return { data: [] };
      if (path.startsWith('/enrichment/jobs/')) return { data: { status: 'running' } };
      if (path.startsWith('/contacts/')) return { data: {} };
      throw new Error(path);
    });
    const c = ctx({ lead_ids: ['L4'], backfill_lead_ids: ['L6'], list_id: '77' });
    await hira.run(c);
    const l4 = db.tables.leads.find((l) => l.id === 'L4')!;
    expect(l4.stage).toBe('researched');
    expect(l4.research.email_status).toBe('pending');
    expect(c.delegate.mock.calls[0][3].pending_lead_ids).toEqual(['L4']);
  });

  it('treats job 404 "Job not found" (live graph8 behaviour) as not-ready → pending, not a failure', async () => {
    m.g8.get.mockImplementation(async (path: string) => {
      if (path === '/contacts/suppressions') return { data: [] };
      if (path.startsWith('/enrichment/jobs/')) throw new Error('graph8 404: Job not found');
      if (path.startsWith('/contacts/')) return { data: {} };
      throw new Error(path);
    });
    const c = ctx({ lead_ids: ['L4'], list_id: '77' });
    await hira.run(c);
    expect(db.tables.leads.find((l) => l.id === 'L4')!.research.email_status).toBe('pending');
  });

  it('merges layer research sources and survives a failing one', async () => {
    m.layers.all.mockReturnValue([
      { name: 'ai_research', research: { name: 'ai_research', collect: async () => ({ L1: { facts: ['Announced EU expansion in graph8 AI research'] } }) } },
      { name: 'broken', research: { name: 'broken', collect: async () => { throw new Error('nope'); } } },
    ]);
    const c = ctx({ lead_ids: ['L1'], list_id: '77' });
    await hira.run(c);
    const l1 = db.tables.leads.find((l) => l.id === 'L1')!;
    expect(l1.research.sources).toContain('ai_research');
    expect(l1.research.facts.join(' ')).toContain('EU expansion');
  });

  it('continues without enrichment if graph8 refuses to start the job', async () => {
    const base = m.g8.post.getMockImplementation()!;
    m.g8.post.mockImplementation(async (path: string, body: any) => {
      if (path === '/enrichment/enrich' || path === '/contacts/unlock-info') throw new Error('402 insufficient credits');
      return base(path, body);
    });
    const c = ctx({ lead_ids: ['L1', 'L2'], list_id: '77' });
    await expect(hira.run(c)).resolves.toMatch(/researched/);
    expect(db.tables.leads.find((l) => l.id === 'L1')!.research.channels).toEqual(['linkedin']);
  }, 10_000);

  it('picks from the latest list when delegated without ids', async () => {
    const c = ctx({});
    c.settings.last_run_list_id = 77;
    await hira.run(c);
    expect(c.delegate).toHaveBeenCalled();
    expect(m.g8.post.mock.calls.find((x) => x[0] === '/contacts/unlock-info')![1].contact_ids).toHaveLength(5);
  });
});
