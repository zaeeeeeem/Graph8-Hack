import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------------------------- fakes
const h = vi.hoisted(() => {
  const state = { tables: {} as Record<string, any[]>, writes: [] as any[], gen: [] as any[], genCalls: [] as any[], settings: {} as Record<string, any> };
  function builder(table: string) {
    const rec = { table, op: 'select', values: undefined as any, filters: [] as any[] };
    const result = () => { if (rec.op !== 'select') state.writes.push(rec); return { data: state.tables[table] ?? [], error: null }; };
    const b: any = {};
    for (const k of ['select', 'eq', 'in', 'gte', 'gt', 'or', 'order', 'limit', 'neq', 'ilike', 'not']) b[k] = (...a: any[]) => (rec.filters.push([k, ...a]), b);
    b.update = (v: any) => ((rec.op = 'update'), (rec.values = v), b);
    b.insert = (v: any) => ((rec.op = 'insert'), (rec.values = v), b);
    b.maybeSingle = async () => ({ data: result().data[0] ?? null, error: null });
    b.single = b.maybeSingle;
    b.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
    return b;
  }
  return { state, builder };
});
const S = h.state;

vi.mock('../src/lib/bus', () => ({ bus: { on: vi.fn(), emit: vi.fn() } }));
vi.mock('../src/lib/env', () => ({ env: { WORKSPACE_ID: 'ws-1', GEMINI_API_KEY: 'x', GEMINI_MODEL: 'gemini-test', SLACK_DISABLED: true, allowlist: [], layersDisabled: [] } }));
vi.mock('../src/lib/log', () => { const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }; l.child = () => l; return { log: l }; });
vi.mock('../src/lib/g8', () => ({ g8: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/lib/llm', () => ({ llm: { json: vi.fn(), text: vi.fn() } }));
vi.mock('../src/layers', () => ({ layers: { all: vi.fn(() => []), register: vi.fn() } }));
vi.mock('../src/lib/slack', () => ({ slack: { postAs: vi.fn(async () => ({ ts: '1.1', channel: 'C' })) }, slackClient: vi.fn() }));
vi.mock('../src/agents/runtime', () => ({ runtime: { enqueue: vi.fn(async () => ({ id: 't', number: 42 })), register: vi.fn(), start: vi.fn() } }));
vi.mock('../src/agents/ayesha/onboarding', () => ({ checkCredits: vi.fn(async () => ({ available: 1000 })), LOW_CREDITS: 10, runOnboarding: vi.fn(), analysisStatus: vi.fn() }));
vi.mock('../src/lib/store', () => ({
  LLM_TOKENS_PER_CREDIT: 1000,
  store: {
    db: { from: (t: string) => h.builder(t) },
    workspace: vi.fn(async () => ({ name: '8x.social', standup_hour: 9 })),
    settings: vi.fn(async () => ({ daily_find: 10, daily_research: 5, target_persona: 'Head of Growth at consumer mobile apps', last_run_list_id: 15, ...h.state.settings })),
    patchSettings: vi.fn(async () => ({})),
    agentByRole: vi.fn(async (_w: string, role: string) => ({ id: `ag-${role}`, name: role, role })),
    spend: vi.fn(async () => undefined),
  },
}));
vi.mock('@google/genai', () => ({
  FunctionCallingConfigMode: { AUTO: 'AUTO', NONE: 'NONE' },
  GoogleGenAI: class { models = { generateContent: async (req: any) => { h.state.genCalls.push(req); return h.state.gen.shift(); } }; },
}));

import { runtime } from '../src/agents/runtime';
import { routeMessage, _resetRouting } from '../src/slack/events';
import { applyExplicit, heuristicPlan, matchIndustries, toFilters } from '../src/agents/bilal/filters';
import { leadFacts, runTool, scoutInput, toolsFor, type ToolCtx } from '../src/chat/tools';
import { agentChat, MAX_TOOL_CALLS } from '../src/chat/agent-chat';

const THAD = {
  id: 'L1', g8_contact_id: '70', full_name: 'Thad Warren', job_title: 'Head Of Growth', company_name: 'EnergyBot', location: 'United States',
  stage: 'researched', fit_score: 100, why_now: 'Scaling acquisition', signals: [],
  research: { reason: 'Head Of Growth, 11-50 staff, Software Development', breakdown: { title: 40, industry: 20 }, industry: 'Software Development', has_email: true, has_phone: true, email: 'thad@energybot.com' },
  email: 'thad@energybot.com', phone: '+1 415 555 0101',
};
const PII = /@[\w-]+\.\w|\+?\d[\d\s-]{8,}\d/;
const tctx = (role: any = 'head_of_sales', extra: Partial<ToolCtx> = {}): ToolCtx => ({ workspaceId: 'ws-1', role, agentId: `ag-${role}`, depth: 0, blocks: [], ...extra });

beforeEach(() => { S.tables = {}; S.writes = []; S.gen = []; S.genCalls = []; S.settings = {}; vi.clearAllMocks(); _resetRouting(); });

// ---------------------------------------------------------------------------------------------- routing
describe('routing (CHAT-BANK: Ayesha is the manager)', () => {
  const base = { hqChannel: 'HQ', teamChannel: 'TEAM', isDm: false };
  it('plain top-level #sales-hq message with no name → Ayesha', () => {
    expect(routeMessage({ ...base, text: 'why you think thad warren is good here for us?', channel: 'HQ', ts: '1' })).toEqual({ kind: 'mention', addressed: undefined, threadTs: '1' });
  });
  it('#sales-team only answers named messages', () => {
    expect(routeMessage({ ...base, text: 'lunch?', channel: 'TEAM', ts: '2' })).toBeNull();
    expect(routeMessage({ ...base, text: 'Bilal, find 5 CFOs', channel: 'TEAM', ts: '3' })?.addressed).toBe('scout');
  });
  it('double space after the name still addresses that agent; un-named follow-ups stay with the last one named', () => {
    routeMessage({ ...base, text: 'ayesha why is thad warren good', channel: 'HQ', ts: '10' });
    expect(routeMessage({ ...base, text: 'can you ask on my behalf to hira?', channel: 'HQ', ts: '11', threadTs: '10' })).toMatchObject({ kind: 'thread_reply', addressed: 'head_of_sales' });
    expect(routeMessage({ ...base, text: 'hira  can you share all those emails', channel: 'HQ', ts: '12', threadTs: '10' })).toMatchObject({ addressed: 'researcher' });
    expect(routeMessage({ ...base, text: 'what do you mean?', channel: 'HQ', ts: '13', threadTs: '10' })).toMatchObject({ addressed: 'researcher' });
  });
  it('named reply in a thread we did not start is still answered; DMs go to Ayesha', () => {
    expect(routeMessage({ ...base, text: 'Zara any replies?', channel: 'TEAM', ts: '21', threadTs: '20' })).toMatchObject({ kind: 'thread_reply', addressed: 'closer' });
    expect(routeMessage({ ...base, text: 'random chatter', channel: 'TEAM', ts: '22', threadTs: '20' })).toMatchObject({ addressed: 'closer' });
    expect(routeMessage({ ...base, text: 'other chatter', channel: 'TEAM', ts: '31', threadTs: '30' })).toBeNull();
    expect(routeMessage({ ...base, isDm: true, text: 'pipeline?', channel: 'D1', ts: '40' })).toEqual({ kind: 'dm', addressed: undefined, threadTs: undefined });
  });
});

// ---------------------------------------------------------------------------------------------- Bilal filters
describe('explicit founder filters (no drift to the default persona)', () => {
  it('"software" maps to graph8 industries and overrides the mapped plan', () => {
    expect(matchIndustries('software')).toContain('Software Development');
    expect(matchIndustries('fintech')).toContain('Financial Services');
    const plan = heuristicPlan('Head of Growth at consumer mobile apps');
    const notes = applyExplicit(plan, { industries: ['software'], countries: ['United Kingdom'], sizes: ['51-200'], domains: ['https://www.stripe.com/'] });
    expect(plan.industries).toContain('Software Development');
    expect(plan.industries.join()).not.toMatch(/Gaming|Games/);
    expect(notes.length).toBe(4);
    const f = toFilters(plan);
    expect(f).toContainEqual({ field: 'company_industry', operator: 'any_of', value: plan.industries });
    expect(f).toContainEqual({ field: 'country', operator: 'any_of', value: ['United Kingdom'] });
    expect(f).toContainEqual({ field: 'company_domain', operator: 'any_of', value: ['stripe.com'] });
  });
  it('scoutInput keeps every constraint and does not leak the saved persona\'s industry', () => {
    const { input, title } = scoutInput({ count: 7, industries: ['software'] }, { target_persona: 'Head of Growth at consumer mobile apps', target_icp: 'consumer apps', daily_research: 5 });
    expect(input.count).toBe(7);
    expect(input.filters).toEqual({ industries: ['software'] });
    expect(input.persona).toBe('Head of Growth in software');
    expect(input.target_icp).toBeNull();
    expect(title).not.toMatch(/consumer/i);
  });
});

// ---------------------------------------------------------------------------------------------- tools
describe('tool registry', () => {
  it('scopes tools by role', () => {
    const names = (r: any) => toolsFor(r).map((t) => t.name);
    expect(names('head_of_sales')).toEqual(expect.arrayContaining(['ask_agent', 'assign_task', 'plan_goal', 'update_settings', 'find_lead', 'get_pipeline']));
    expect(names('head_of_sales')).not.toContain('search_prospects');
    expect(names('scout')).toEqual(expect.arrayContaining(['search_prospects', 'find_lookalikes', 'hand_off', 'find_lead']));
    expect(names('scout')).not.toContain('assign_task');
    expect(names('researcher')).toContain('research_leads');
    expect(names('sdr')).toContain('revise_copy');
    expect(names('closer')).toContain('draft_reply');
  });
  it('rejects a tool outside the role and bad args', async () => {
    expect(await runTool('assign_task', {}, tctx('scout'))).toMatchObject({ error: expect.stringMatching(/not available/) });
    expect(await runTool('find_lead', {}, tctx())).toMatchObject({ error: expect.stringMatching(/bad arguments/) });
  });
  it('find_lead returns the fit breakdown + graph8 link + a lead card, never an email/phone', async () => {
    S.tables.leads = [THAD];
    const c = tctx();
    const out: any = await runTool('find_lead', { query: 'thad warren' }, c);
    expect(out.lead).toMatchObject({ name: 'Thad Warren', fit_score: 100, fit_breakdown: { title: 40 }, has_email: true, graph8_url: 'https://app.graph8.com/contacts/70' });
    expect(JSON.stringify(out)).not.toMatch(PII);
    expect(JSON.stringify(c.blocks)).toContain('Open in graph8');
    expect(JSON.stringify(leadFacts(THAD))).not.toMatch(PII);
  });
  it('contact_details_link explains privacy and links graph8', async () => {
    S.tables.leads = [THAD];
    const out: any = await runTool('contact_details_link', { query: 'Thad' }, tctx('researcher'));
    expect(out.policy).toMatch(/never go into Slack/);
    expect(out.graph8_url).toBe('https://app.graph8.com/contacts/70');
    expect(JSON.stringify(out)).not.toMatch(PII);
  });
  it('assign_task enqueues Bilal with the explicit industry; read-only mode starts nothing', async () => {
    const out: any = await runTool('assign_task', { agent: 'Bilal', work: 'find_prospects', count: 7, industries: ['software'] }, tctx('head_of_sales', { slack: { workspaceId: 'ws-1', userId: 'U', channel: 'HQ', threadTs: '1' } }));
    expect(out).toMatchObject({ started: true, task: 'T-42', owner: 'Bilal' });
    const [, role, kind, , input] = vi.mocked(runtime.enqueue).mock.calls[0];
    expect([role, kind]).toEqual(['scout', 'find_prospects']);
    expect(input).toMatchObject({ count: 7, filters: { industries: ['software'] } });
    vi.mocked(runtime.enqueue).mockClear();
    const dry: any = await runTool('assign_task', { agent: 'Bilal', work: 'find_prospects', count: 3 }, tctx('head_of_sales', { readOnly: true }));
    expect(dry.dry_run).toBe(true);
    expect(runtime.enqueue).not.toHaveBeenCalled();
  });
  it('ask_agent relays the teammate answer and refuses nesting', async () => {
    const askAgent = vi.fn(async () => 'Thad is a 100 fit.');
    expect(await runTool('ask_agent', { agent: 'Hira', question: 'why Thad?' }, tctx('head_of_sales', { askAgent }))).toEqual({ agent: 'Hira', answer: 'Thad is a 100 fit.' });
    expect(askAgent).toHaveBeenCalledWith('researcher', 'why Thad?');
    expect(await runTool('ask_agent', { agent: 'Hira', question: 'x' }, tctx('head_of_sales', { askAgent, depth: 1 }))).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------------------------- loop
describe('agentChat (Gemini function calling)', () => {
  const call = (name: string, args: any) => ({ functionCalls: [{ id: name, name, args }], candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }], usageMetadata: { totalTokenCount: 100 } });
  const final = (text: string) => ({ functionCalls: undefined, text, usageMetadata: { totalTokenCount: 50 } });

  it('calls tools, feeds results back, answers without PII; thread history goes in the prompt', async () => {
    S.tables.leads = [THAD];
    S.gen = [call('find_lead', { query: 'Thad Warren' }), final('Thad is a **100** fit, reach him at thad@energybot.com.')];
    const r = await agentChat({ role: 'head_of_sales', text: 'why is he good', workspaceId: 'ws-1', history: [{ who: 'Founder', text: 'tell me about Thad Warren' }] });
    expect(r.calls.map((c) => c.name)).toEqual(['find_lead']);
    expect(r.text).not.toMatch(PII);
    expect(r.text).toContain('*100*');
    expect(r.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(S.genCalls[0].contents)).toContain('tell me about Thad Warren');
    expect(JSON.stringify(S.genCalls[1].contents)).toContain('functionResponse');
  });
  it('caps tool calls at 5, then forces a text answer', async () => {
    S.tables.leads = [THAD];
    S.gen = Array.from({ length: 6 }, () => call('get_pipeline', {}));
    S.gen.push(final('Done.'));
    // the forced turn (mode NONE) returns text
    S.gen[MAX_TOOL_CALLS] = final('Here is what I have.');
    const r = await agentChat({ role: 'head_of_sales', text: 'loop', workspaceId: 'ws-1' });
    expect(r.calls).toHaveLength(MAX_TOOL_CALLS);
    expect(S.genCalls.at(-1).config.toolConfig.functionCallingConfig.mode).toBe('NONE');
    expect(r.text).toBe('Here is what I have.');
  });
  it('worker hand_off runs the teammate and returns their answer to post in their voice', async () => {
    S.gen = [call('hand_off', { agent: 'Zara', request: 'any replies?' }), final('0 replies so far.'), final("That's Zara's call, over to her.")];
    const r = await agentChat({ role: 'scout', text: 'any replies?', workspaceId: 'ws-1' });
    expect(r.handoff).toMatchObject({ role: 'closer', text: '0 replies so far.' });
    expect(r.text).toMatch(/Zara/);
    expect(S.genCalls[1].config.systemInstruction).toMatch(/You are Zara/);
  });
});
