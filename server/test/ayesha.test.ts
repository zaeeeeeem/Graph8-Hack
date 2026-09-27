import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Fakes for the libs (foundation is stubbed on this branch).
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
const h = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    writes: [] as Array<{ table: string; op: string; values?: any; filters: any[] }>,
    handlers: {} as Record<string, (e: any) => Promise<void> | void>,
    settings: {} as Record<string, any>,
    workspace: {} as Record<string, any>,
    posts: [] as Array<{ role: string; channel: string; msg: any }>,
    checklist: [] as Array<[string, string, string | undefined]>,
  };
  function builder(table: string) {
    const rec = { table, op: 'select', values: undefined as any, filters: [] as any[] };
    const result = () => {
      if (rec.op !== 'select') state.writes.push(rec);
      const rows = state.tables[table] ?? [];
      return { data: rec.op === 'insert' ? [{ id: 'appr-1' }] : rows, error: null };
    };
    const b: any = {
      select: () => b, eq: (...a: any[]) => (rec.filters.push(['eq', ...a]), b), in: (...a: any[]) => (rec.filters.push(['in', ...a]), b),
      gte: () => b, gt: () => b, or: (...a: any[]) => (rec.filters.push(['or', ...a]), b), order: () => b, limit: () => b, neq: () => b,
      update: (v: any) => ((rec.op = 'update'), (rec.values = v), b),
      insert: (v: any) => ((rec.op = 'insert'), (rec.values = v), b),
      single: async () => { const r = result(); return { data: r.data[0] ?? null, error: null }; },
      maybeSingle: async () => { const r = result(); return { data: r.data[0] ?? null, error: null }; },
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    return b;
  }
  return { state, builder };
});
const S = h.state;

vi.mock('../src/lib/bus', () => ({ bus: { on: (ev: string, fn: any) => { h.state.handlers[ev] = fn; }, emit: vi.fn() } }));
vi.mock('../src/lib/env', () => ({ env: { WORKSPACE_ID: 'ws-1', G8_DEMO_SCHEDULE_ID: 'sched-1', allowlist: [], layersDisabled: [] } }));
vi.mock('../src/lib/log', () => {
  const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  l.child = () => l;
  return { log: l };
});
vi.mock('../src/lib/g8', () => ({ g8: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() } }));
vi.mock('../src/lib/llm', () => ({ llm: { json: vi.fn(), text: vi.fn() } }));
vi.mock('../src/layers', () => ({ layers: { all: vi.fn(() => []), register: vi.fn() } }));
vi.mock('../src/lib/site', () => ({ readSite: vi.fn(async (d: string) => ({ domain: d, pages: [{ url: `https://${d}`, title: 'NewCo', description: '', text: 'NewCo sells payroll software to restaurants.' }], text: 'NewCo sells payroll software to restaurants.' })) }));
vi.mock('../src/agents/runtime', () => ({ runtime: { enqueue: vi.fn(async () => ({ id: 'task-9', number: 9 })), register: vi.fn(), start: vi.fn() } }));
vi.mock('../src/lib/store', () => ({
  store: {
    db: { from: (t: string) => h.builder(t) },
    workspace: vi.fn(async () => h.state.workspace),
    settings: vi.fn(async () => ({ daily_find: 10, daily_research: 5, ...h.state.settings })),
    patchSettings: vi.fn(async (_id: string, p: any) => { Object.assign(h.state.settings, p); return { daily_find: 10, daily_research: 5, ...h.state.settings }; }),
    agentByRole: vi.fn(async (_w: string, role: string) => ({ id: role === 'head_of_sales' ? 'ag-ayesha' : `ag-${role}`, name: role, role })),
    spend: vi.fn(),
  },
}));
vi.mock('../src/lib/slack', () => ({
  slack: {
    postAs: vi.fn(async (role: string, channel: string, msg: any) => { h.state.posts.push({ role, channel, msg }); return { ts: `ts-${h.state.posts.length}`, channel: channel === 'hq' ? 'C_HQ' : channel }; }),
    update: vi.fn(async () => undefined),
    checklist: vi.fn(async () => ({
      ts: 'cl-ts', channel: 'C_HQ',
      set: async (k: string, st: string, note?: string) => { h.state.checklist.push([k, st, note]); },
      add: async (i: any) => { h.state.checklist.push([i.key, i.state, i.note]); },
      title: async () => undefined,
    })),
    permalink: vi.fn(), dm: vi.fn(), agentThread: vi.fn(), approvalCard: vi.fn(), start: vi.fn(),
  },
}));

import { g8 } from '../src/lib/g8';
import { llm } from '../src/lib/llm';
import { layers } from '../src/layers';
import { runtime } from '../src/agents/runtime';
import { slack } from '../src/lib/slack';
import { store } from '../src/lib/store';
import ayesha, { mirrorReport, pollReports } from '../src/agents/ayesha';
import { CANT_YET, OFF_TOPIC, settingsPatch } from '../src/agents/ayesha/chat';
import { companyName, whyLine } from '../src/agents/ayesha/onboarding';
import { normDomain, scrubPii } from '../src/agents/ayesha/util';
import { runCrewChat } from '../src/agents/ayesha/crew';
import { addressedRole } from '../src/slack/events';
import { bus } from '../src/lib/bus';

const G8_OK: Record<string, any> = {
  '/global-context/documents': { data: [
    { id: 'd1', display_name: 'ICP Research', file_type: 'icp_research', status: 'completed', content: 'Series A SaaS founders' },
    { id: 'd2', display_name: 'Brand Voice', file_type: 'brand_voice', status: 'completed', content: 'Crisp' },
    { id: 'd3', display_name: 'Draft', file_type: 'x', status: 'processing', content: 'x' },
  ] },
  '/deals/pipelines': { data: [{ id: 'pipe-1', name: 'Sales Pipeline', is_default: true, stages: [{ id: 'st-0', name: 'Lead' }, { id: 'st-nm', name: 'New Meeting' }] }] },
  '/event-types': { data: [{ id: 1, title: 'Discovery call', slug: 'discovery-call' }] },
  '/company-profile': { data: { profile: { fields: { company_name: { value: '8x Social, Inc.' } } } } },
  '/org/settings': { data: { org_id: 'org_x', org_name: 'Hackathon zaeemulhassanyt', metadata: { org_slug: 'hackathon-zaeemulhassanyt' } } },
  '/mailboxes': { data: [{ id: '1', email: 'owner@example.com', connection_status: 'active', is_archived: false, daily_limit: 40 }] },
  '/workflows/integrations/linkedin/senders': { senders: [], total_count: 0 },
  '/linkedin/connection': { data: { connected: false } },
  '/teams/available/phone-numbers': { data: { items: [{ id: 1 }] } },
  '/usage': { data: { available_credits: 9074, held_credits: 0, total_used: 926 } },
  '/intelligence/primary-website': { data: { primary_website_url: 'https://8x.social' } },
  '/schedules': { data: [{ id: 'sched-1', name: 'Demo 24/7', windows: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => ({ day, start: '00:00', end: '23:59' })) }] },
  '/appointments/calendars': [{ credential_id: 1, provider: 'google_calendar', is_valid: true }],
};

function ctx(kind: string, input: any = {}): any {
  return {
    workspaceId: 'ws-1', agentId: 'ag-ayesha', role: 'head_of_sales', runId: 'run-1',
    task: { id: 'task-1', number: 1, kind, input, slack_channel: null, slack_thread_ts: null },
    settings: { daily_find: 10, daily_research: 5, ...S.settings },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    step: vi.fn(async () => undefined), report: vi.fn(async () => undefined),
    delegate: vi.fn(async (to: string, k: string, title: string) => ({ id: 'child-1', number: 7, kind: k, title, to })),
    requestApproval: vi.fn(), thread: vi.fn(),
  };
}

const PICK = { company: '8x.social', offer: 'AI SDR', target_persona: 'Heads of Growth at Series A SaaS', target_icp: 'B2B SaaS 20-200', why: 'Most pain in docs', alternatives: ['Founders'], geo: ['UK'] };

beforeEach(() => {
  vi.clearAllMocks();
  S.tables = {}; S.writes = []; S.settings = {}; S.posts = []; S.checklist = [];
  S.workspace = { id: 'ws-1', name: '8x.social', status: 'onboarding', company_domain: null, standup_hour: 9, sales_brain: {} };
  vi.mocked(g8.get).mockImplementation(async (p: string) => { if (p in G8_OK) return G8_OK[p]; throw new Error(`unexpected ${p}`); });
  vi.mocked(llm.json).mockResolvedValue(PICK as any);
  vi.mocked(layers.all).mockReturnValue([]);
});

describe('util', () => {
  it('normalises Slack-linked domains', () => {
    expect(normDomain('<http://8x.social|8x.social>')).toBe('8x.social');
    expect(normDomain('https://www.Acme.io/about')).toBe('acme.io');
  });
  it('scrubs PII', () => {
    expect(scrubPii('mail a.b@x.com or +1 980 294 4116')).toBe('mail <email> or <phone>');
  });
});

describe('P1 onboarding', () => {
  it('reads brain, checks channels, stores graph8 ids, runs layer extras and posts the plan card', async () => {
    vi.mocked(layers.all).mockReturnValue([
      { name: 'voice', onboarding: { name: 'setup_voice_agent', label: 'Voice agent', run: async () => ({ ok: true, note: 'Zara-Voice ready' }) } },
      { name: 'intent', onboarding: { name: 'setup_intent', label: 'Intent tracking', run: async () => { throw new Error('boom'); } } },
      { name: 'linkedin' },
    ] as any);
    const c = ctx('onboard', { domain: '8x.social' });
    const out = await ayesha.run(c);
    expect(out).toContain('Onboarded 8x.social');

    const patch = Object.assign({}, ...vi.mocked(store.patchSettings).mock.calls.map((x) => x[1]));
    expect(patch).toMatchObject({
      g8_pipeline_id: 'pipe-1', g8_stage_new_meeting_id: 'st-nm', g8_event_type_id: 1, g8_mailbox_id: 1,
      g8_booking_url: 'https://app.graph8.com/appointments/team/hackathon-zaeemulhassanyt/discovery-call/1',
      g8_schedule_id: 'sched-1', target_persona: PICK.target_persona, channels: { email: true, phone: true, linkedin: false },
    });
    expect(patch.onboarded_at).toBeTruthy();

    // checklist: docs done (2 completed), LinkedIn warn, voice ok, intent warn, plan done
    expect(S.checklist).toContainEqual(['brain', 'done', '2 docs']);
    expect(S.checklist.find(([k, s]) => k === 'channels' && s === 'warn')?.[2]).toMatch(/LinkedIn/);
    expect(S.checklist).toContainEqual(['extra.setup_voice_agent', 'done', 'Zara-Voice ready']);
    expect(S.checklist.find(([k, s]) => k === 'extra.setup_intent' && s === 'warn')).toBeTruthy();
    expect(S.checklist).toContainEqual(['plan', 'done', 'press Start']);

    // Connect card for LinkedIn + approvals row; plan card with [Start] value = task id
    const texts = S.posts.map((p) => p.msg.text);
    expect(texts.some((t) => /LinkedIn isn't connected/.test(t))).toBe(true);
    expect(S.writes.some((w) => w.table === 'approvals' && w.values.kind === 'connect_account')).toBe(true);
    const plan = S.posts.find((p) => /Sales plan/.test(p.msg.text))!;
    const start = plan.msg.blocks.flatMap((b: any) => b.elements ?? []).find((e: any) => e.action_id === 'act.plan_start');
    expect(start.value).toBe('task-1');
    expect(plan.msg.text).toContain('Sales plan for 8x Social:');
    expect(JSON.stringify(plan.msg.blocks)).toContain('*Why:* Most pain in docs');
    expect(S.settings).toMatchObject({ plan_company: '8x Social', plan_why: 'Most pain in docs' });
    expect(S.writes.some((w) => w.table === 'workspaces' && w.values.status === 'active')).toBe(true);
    expect(c.report).toHaveBeenCalledWith('plan', expect.any(String), expect.any(String), expect.any(Object));

    // No PII in any Slack text
    expect(JSON.stringify(S.posts)).not.toContain('owner@example.com');
  });

  it('works with zero layers registered', async () => {
    const out = await ayesha.run(ctx('onboard', { domain: '8x.social' }));
    expect(out).toContain('Onboarded');
    expect(S.checklist.some(([k]) => k.startsWith('extra.'))).toBe(false);
  });

  it('W13: no docs → reads the website now, starts graph8 study in background, keeps going (L4)', async () => {
    vi.mocked(g8.get).mockImplementation(async (p: string) => (p === '/global-context/documents' ? { data: [] } : G8_OK[p]));
    vi.mocked(g8.post).mockResolvedValue({ data: { task_id: 'g8-task-1', message: 'Intelligence analysis started successfully' } });
    const out = await ayesha.run(ctx('onboard', { domain: 'newco.io' }));
    expect(out).toContain('Onboarded newco.io');
    // org website is 8x.social ≠ newco.io → force a fresh study
    expect(g8.post).toHaveBeenCalledWith('/intelligence/analyze', { website_url: 'https://newco.io', force: true });
    expect(S.settings.pending_analysis).toMatchObject({ domain: 'newco.io', g8_task_id: 'g8-task-1' });
    expect(S.settings).toMatchObject({ brain_source: 'website', g8_docs_match: false });
    expect(vi.mocked(llm.json).mock.calls[0][0]).toContain('NewCo sells payroll software');
    expect(S.checklist.find(([k, s]) => k === 'brain' && s === 'done')?.[2]).toMatch(/read newco\.io/);
  });

  it('W13: graph8 docs about another company are ignored (never pitch 8x.social for another domain)', async () => {
    vi.mocked(g8.post).mockResolvedValue({ data: { task_id: 'g8-task-2' } });
    await ayesha.run(ctx('onboard', { domain: 'linear.app' }));
    const prompt = String(vi.mocked(llm.json).mock.calls[0][0]);
    expect(prompt).not.toContain('Series A SaaS founders');
    expect(prompt).toContain('Company website text');
    expect(g8.get).not.toHaveBeenCalledWith('/company-profile'); // "8x Social" name must not leak
    expect(S.settings.g8_docs_match).toBe(false);
  });

  it('resumed run with still no docs does not start another analysis', async () => {
    vi.mocked(g8.get).mockImplementation(async (p: string) => (p === '/global-context/documents' ? { data: [] } : G8_OK[p]));
    const out = await ayesha.run(ctx('onboard', { domain: 'newco.io', resumed: true }));
    expect(g8.post).not.toHaveBeenCalled();
    expect(out).toContain('Onboarded');
  });

  it('resumed on an active workspace merges graph8 docs instead of re-hiring', async () => {
    S.workspace.status = 'active';
    S.settings.target_persona = 'Heads of Growth at Series A SaaS';
    const out = await ayesha.run(ctx('onboard', { domain: '8x.social', resumed: true }));
    expect(out).toBe('Merged graph8 study of 8x.social');
    expect(slack.checklist).not.toHaveBeenCalled();
    expect(S.settings).toMatchObject({ pending_analysis: null, brain_source: 'graph8_docs' });
    expect(S.posts.some((p) => /graph8 finished studying 8x\.social/.test(p.msg.text))).toBe(true);
  });

  it('continues with defaults when analyze fails', async () => {
    vi.mocked(g8.get).mockImplementation(async (p: string) => (p === '/global-context/documents' ? { data: [] } : G8_OK[p]));
    vi.mocked(g8.post).mockRejectedValue(new Error('500'));
    const out = await ayesha.run(ctx('onboard', { domain: 'newco.io' }));
    expect(out).toContain('Onboarded');
    expect(S.settings.pending_analysis ?? null).toBeNull();
  });

  it('D19: re-hire when the team exists posts status and stops', async () => {
    S.workspace.status = 'active';
    S.tables.agents = [{ name: 'Bilal', status: 'idle' }];
    const out = await ayesha.run(ctx('onboard', { domain: '8x.social' }));
    expect(out).toBe('Team already hired');
    expect(slack.checklist).not.toHaveBeenCalled();
    expect(S.posts[0].msg.text).toMatch(/Team's already here/);
  });
});

describe('P3 chat', () => {
  const chat = (text: string) => ctx('answer_question', { text, channel: 'D1', threadTs: 'th-1' });
  const lastReply = () => S.posts[S.posts.length - 1].msg.text;

  it('off-topic → polite decline, not built → cant do yet', async () => {
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'off_topic' } as any);
    await ayesha.run(chat('what is the weather'));
    expect(lastReply()).toBe(OFF_TOPIC);
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'not_built' } as any);
    await ayesha.run(chat('run google ads for us'));
    expect(lastReply()).toBe(CANT_YET);
  });

  it('settings change is saved (T11)', async () => {
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'settings', daily_find: 20, geo: ['UK'] } as any);
    await ayesha.run(chat('from now on find 20 a day, UK only'));
    expect(store.patchSettings).toHaveBeenCalledWith('ws-1', { daily_find: 20, geo: ['UK'] });
    expect(lastReply()).toMatch(/Saved/);
    expect(S.posts[S.posts.length - 1].msg.threadTs).toBe('th-1');
  });

  it('settingsPatch clamps and appends notes', () => {
    const { patch } = settingsPatch({ intent: 'settings', daily_find: 500, note: 'skip agencies' } as any, { daily_find: 10, daily_research: 5, notes: ['a'] });
    expect(patch).toEqual({ daily_find: 50, notes: ['a', 'skip agencies'] });
  });

  it('pause / resume update agent rows (T12)', async () => {
    S.tables.agents = [{ name: 'Bilal' }, { name: 'Hira' }];
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'pause' } as any);
    await ayesha.run(chat('pause the team'));
    const w = S.writes.find((x) => x.table === 'agents')!;
    expect(w.values).toEqual({ status: 'paused', pause_reason: 'manual' });
    expect(w.filters).toContainEqual(['in', 'role', ['scout', 'researcher', 'sdr', 'closer']]);
    expect(lastReply()).toMatch(/Paused Bilal, Hira/);
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'resume', agents: ['scout'] } as any);
    await ayesha.run(chat('resume bilal'));
    expect(S.writes.filter((x) => x.table === 'agents')[1].values).toEqual({ status: 'idle', pause_reason: null });
  });

  it('delegate find more → Bilal find_prospects', async () => {
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'delegate', work: 'find_prospects', count: 15 } as any);
    const c = chat('find 15 more leads');
    await ayesha.run(c);
    expect(c.delegate).toHaveBeenCalledWith('scout', 'find_prospects', 'Find 15 prospects', expect.objectContaining({ count: 15 }), expect.any(Object));
    expect(lastReply()).toMatch(/Bilal has it/);
  });

  it('question → answer from facts via Gemini', async () => {
    S.tables.portal_pipeline = [{ stage: 'prospect', lead_count: 10, deal_amount: '0' }, { stage: 'meeting', lead_count: 1, deal_amount: '0' }];
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'question' } as any);
    vi.mocked(llm.text).mockResolvedValueOnce('11 prospects, 1 meeting booked.');
    await ayesha.run(chat("how's pipeline?"));
    expect(vi.mocked(llm.text).mock.calls[0][0]).toContain('"prospects":11');
    expect(lastReply()).toBe('11 prospects, 1 meeting booked.');
  });
});

describe('P4 standup', () => {
  it('posts card in hq and one detail line per worker in the thread', async () => {
    S.tables.portal_agents = [
      { role: 'head_of_sales', name: 'Ayesha', title: 'Head of Sales', status: 'idle', tasks_done: 1, tasks_open: 0, spent_today_credits: 2 },
      { role: 'scout', name: 'Bilal', title: 'Scout', status: 'working', tasks_done: 2, tasks_open: 1, spent_today_credits: 30, current_task_title: 'Find 10' },
    ];
    S.tables.portal_needs_you = [{ title: 'Launch sequence' }];
    const c = ctx('standup', {});
    await ayesha.run(c);
    expect(S.posts[0]).toMatchObject({ role: 'head_of_sales', channel: 'hq' });
    const card = JSON.stringify(S.posts[0].msg.blocks);
    expect(card).toContain('Bilal 30');
    expect(card).toContain('9,074');
    expect(card).toContain('Launch sequence');
    expect(S.posts[1]).toMatchObject({ role: 'scout', msg: { threadTs: 'ts-1' } });
    expect(S.posts).toHaveLength(2);
    expect(c.report).toHaveBeenCalledWith('standup', 'Daily standup', expect.any(String), expect.objectContaining({ graph8_credits: 9074 }));
  });
});

describe('bus wiring', () => {
  const slackCtx = { workspaceId: 'ws-1', userId: 'U1', channel: 'C_HQ' };
  it('/hire-sales enqueues onboarding with a clean domain', async () => {
    await S.handlers['slack.command']({ command: '/hire-sales', text: '<http://8x.social|8x.social>', ctx: slackCtx });
    expect(runtime.enqueue).toHaveBeenCalledWith('ws-1', 'head_of_sales', 'onboard', expect.any(String), { domain: '8x.social' }, expect.objectContaining({ slack: slackCtx }));
  });
  it('/sales-standup enqueues a standup', async () => {
    await S.handlers['slack.command']({ command: '/sales-standup', text: '', ctx: slackCtx });
    expect(vi.mocked(runtime.enqueue).mock.calls[0][2]).toBe('standup');
  });
  it('[Start] starts the daily run once', async () => {
    const e = { actionId: 'act.plan_start', value: 'task-1', ctx: { ...slackCtx, messageTs: 'plan-ts' } };
    await S.handlers['slack.action'](e);
    await S.handlers['slack.action'](e);
    expect(runtime.enqueue).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.enqueue).mock.calls[0][2]).toBe('plan');
    expect(slack.update).toHaveBeenCalled();
  });
  it('thread replies on another agent approval are left to the runtime', async () => {
    S.tables.approvals = [{ id: 'a1', requested_by_agent_id: 'ag-sdr' }];
    await S.handlers['slack.message']({ text: 'make it shorter', kind: 'thread_reply', ctx: { ...slackCtx, threadTs: 'appr-ts' } });
    expect(runtime.enqueue).not.toHaveBeenCalled();
    S.tables.approvals = [];
    await S.handlers['slack.message']({ text: '<@U0BOT> how is pipeline?', kind: 'mention', ctx: { ...slackCtx, messageTs: 'm1' } });
    expect(runtime.enqueue).toHaveBeenCalledWith('ws-1', 'head_of_sales', 'answer_question', expect.any(String), expect.objectContaining({ text: 'how is pipeline?', threadTs: 'm1' }), expect.any(Object));
  });
  it('09:00 cron → standup with daily run for an active workspace', async () => {
    S.workspace.status = 'active';
    await S.handlers['cron.tick']({ name: 'standup_0900' });
    expect(runtime.enqueue).toHaveBeenCalledWith('ws-1', 'head_of_sales', 'standup', 'Daily standup', { trigger: 'cron', daily_run: true }, expect.any(Object));
  });
  it('intelligence.completed resumes a pending onboarding once', async () => {
    S.settings.pending_analysis = { domain: 'newco.io', task_id: 'task-1' };
    await S.handlers['graph8.event']({ type: 'intelligence.completed', payload: {}, inboundEventId: 1, workspaceId: 'ws-1' });
    await S.handlers['graph8.event']({ type: 'intelligence.completed', payload: {}, inboundEventId: 2, workspaceId: 'ws-1' });
    expect(runtime.enqueue).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.enqueue).mock.calls[0][4]).toMatchObject({ domain: 'newco.io', resumed: true });
  });
});

describe('P2 daily run + mirror', () => {
  it('plan task delegates Bilal with the daily numbers', async () => {
    S.settings = { daily_find: 12, target_persona: 'CFOs' };
    const c = ctx('plan', { planTs: 'plan-ts', planChannel: 'C_HQ' });
    await ayesha.run(c);
    expect(c.delegate).toHaveBeenCalledWith('scout', 'find_prospects', 'Find 12 prospects: CFOs', expect.objectContaining({ count: 12, research_count: 5 }), expect.any(Object));
    expect(S.posts[0].msg.threadTs).toBe('plan-ts');
  });
  it('skips when Bilal is paused', async () => {
    S.tables.agents = [{ status: 'paused' }];
    const c = ctx('plan', {});
    expect(await ayesha.run(c)).toBe('Skipped: team paused');
    expect(c.delegate).not.toHaveBeenCalled();
  });
  it('mirrors a win from Zara to #sales-hq with amount and graph8 link', async () => {
    await mirrorReport({ workspaceId: 'ws-1', fromRole: 'closer', kind: 'win', title: 'Deal created: Acme', data: { amount: 12000, g8_url: 'https://app.graph8.com/deals/pipeline' } });
    expect(S.posts[0]).toMatchObject({ role: 'head_of_sales', channel: 'hq' });
    expect(S.posts[0].msg.text).toContain('est. $12,000');
    expect(JSON.stringify(S.posts[0].msg.blocks)).toContain('Open in graph8');
    await mirrorReport({ workspaceId: 'ws-1', fromRole: 'scout', kind: 'handoff', title: 'x' });
    expect(S.posts).toHaveLength(1);
  });
  it('wake after delegated chain closes the loop instead of delegating again', async () => {
    const c = ctx('answer_question', { text: 'find 15 more', channel: 'D1', threadTs: 'th-1' });
    c.task.output = { last_child: { id: 'c1', number: 7, kind: 'find_prospects', status: 'done', result_summary: 'Found 15 prospects' } };
    const out = await ayesha.run(c);
    expect(out).toBe('✅ T-7 done: Found 15 prospects');
    expect(c.delegate).not.toHaveBeenCalled();
    expect(llm.json).not.toHaveBeenCalled();
    expect(S.posts[0].msg.threadTs).toBe('th-1');
  });
  it('polls other agents\' win/alert reports once', async () => {
    S.tables.reports = [{ id: 'r1', kind: 'win', title: 'Meeting booked', body: null, data: { amount: 5000 }, from_agent_id: 'ag-closer', created_at: '2999-01-01T00:00:00Z' }];
    S.tables.agents = [{ id: 'ag-closer', role: 'closer', name: 'Zara' }];
    expect(await pollReports('ws-1')).toBe(1);
    expect(await pollReports('ws-1')).toBe(0);
    expect(S.posts[0].msg.text).toContain('Meeting booked');
  });
  it('[Start] re-render keeps company name and why', async () => {
    S.settings = { plan_company: '8x Social', plan_why: 'Growth leads own the UGC budget.', target_persona: 'Heads of Growth' };
    await S.handlers['slack.action']({ actionId: 'act.plan_start', value: 'task-42', ctx: { workspaceId: 'ws-1', userId: 'U1', channel: 'C_HQ', messageTs: 'p-ts' } });
    const card = vi.mocked(slack.update).mock.calls[0][2] as any;
    expect(card.text).toContain('Sales plan for 8x Social');
    expect(JSON.stringify(card.blocks)).toContain('Growth leads own the UGC budget.');
  });
});

describe('plan copy helpers', () => {
  it('whyLine: first sentence, never empty', () => {
    expect(whyLine('They own the budget. Also more.', 'CFOs', 'SaaS')).toBe('They own the budget.');
    expect(whyLine('', 'Heads of Growth', 'consumer apps.')).toBe('Heads of Growth at consumer apps feel the pain in your docs most and can say yes fastest.');
    expect(whyLine(undefined, '', '')).toMatch(/^This buyer/);
  });
  it('companyName: graph8 profile, else non-truncated model name, else domain', async () => {
    expect(await companyName('8x.social', '8x')).toBe('8x Social');
    vi.mocked(g8.get).mockRejectedValue(new Error('404'));
    expect(await companyName('8x.social', '8x')).toBe('8x.social');
    expect(await companyName('acme.io', 'Acme Robotics')).toBe('Acme Robotics');
    expect(await companyName('linear.app', 'Linear', false)).toBe('Linear');
  });
});

describe('talk to agents by name', () => {
  const sctx = { workspaceId: 'ws-1', userId: 'U1', channel: 'C_TEAM', threadTs: '100.1', messageTs: '100.1' };

  it('detects the addressed agent at the start of a message', () => {
    expect(addressedRole('Bilal, find 5 fintech CFOs in Dubai')).toBe('scout');
    expect(addressedRole('hey Hira what hooks did you find?')).toBe('researcher');
    expect(addressedRole('Zara any replies?')).toBe('closer');
    expect(addressedRole('@usman make the emails shorter')).toBe('sdr');
    expect(addressedRole('<@U0BOT> Zara any replies?')).toBe('closer');
    expect(addressedRole('Ayesha: standup please')).toBe('head_of_sales');
    expect(addressedRole('I think bilal did well')).toBeUndefined();
    expect(addressedRole('Hiral is my cousin')).toBeUndefined();
    expect(addressedRole('lunch?')).toBeUndefined();
  });

  it('named message → that agent runs the chat, not Ayesha', async () => {
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'question' } as any);
    vi.mocked(llm.text).mockResolvedValueOnce('I found 12 leads, 4 are strong fits.');
    await S.handlers['slack.message']({ kind: 'mention', text: 'Bilal how many leads?', addressed: 'scout', ctx: sctx });
    expect(runtime.enqueue).not.toHaveBeenCalled();
    expect(S.posts.at(-1)).toMatchObject({ role: 'scout', channel: 'C_TEAM', msg: { text: 'I found 12 leads, 4 are strong fits.', threadTs: '100.1' } });
  });

  it('no name / Ayesha → Ayesha as before', async () => {
    await S.handlers['slack.message']({ kind: 'dm', text: 'Ayesha, pipeline?', addressed: 'head_of_sales', ctx: { ...sctx, channel: 'D1', threadTs: undefined } });
    expect(runtime.enqueue).toHaveBeenCalledWith('ws-1', 'head_of_sales', 'answer_question', expect.any(String), expect.objectContaining({ text: 'Ayesha, pipeline?' }), expect.anything());
  });

  it('Bilal work → enqueued straight to scout with persona/geo/count + in-voice ack', async () => {
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'work', count: 5, persona: 'CFOs at fintech companies', geo: ['Dubai'] } as any);
    const out = await runCrewChat({ role: 'scout', text: 'Bilal, find 5 fintech CFOs in Dubai', ctx: sctx, kind: 'mention' });
    expect(out).toBe('enqueued T-9');
    expect(runtime.enqueue).toHaveBeenCalledWith('ws-1', 'scout', 'find_prospects', 'Find 5 prospects: CFOs at fintech companies in Dubai',
      expect.objectContaining({ count: 5, target_persona: 'CFOs at fintech companies', geo: ['Dubai'], requested_by: 'founder_chat' }),
      expect.objectContaining({ slack: sctx }));
    expect(S.posts.at(-1)).toMatchObject({ role: 'scout', msg: { threadTs: '100.1' } });
    expect(S.posts.at(-1)!.msg.text).toContain('T-9');
  });

  it('Hira work without a list → asks for Bilal first, nothing enqueued', async () => {
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'work', count: 3 } as any);
    await runCrewChat({ role: 'researcher', text: 'Hira research 3 leads', ctx: sctx, kind: 'mention' });
    expect(runtime.enqueue).not.toHaveBeenCalled();
    expect(S.posts.at(-1)).toMatchObject({ role: 'researcher' });
    expect(S.posts.at(-1)!.msg.text).toContain('Bilal');
  });

  it('out of scope → hands off in voice and the right agent answers', async () => {
    vi.mocked(llm.json)
      .mockResolvedValueOnce({ intent: 'handoff', handoff_to: 'zara' } as any)
      .mockResolvedValueOnce({ intent: 'question' } as any);
    vi.mocked(llm.text).mockResolvedValueOnce('2 replies this week, 1 meeting booked.');
    await runCrewChat({ role: 'scout', text: 'Bilal any replies?', ctx: sctx, kind: 'mention' });
    expect(S.posts.map((p) => [p.role, p.msg.text])).toEqual([
      ['scout', "That's Zara's call. Zara, over to you."],
      ['closer', '2 replies this week, 1 meeting booked.'],
    ]);
  });

  it('settings / pause → handed to Ayesha on her queue, same thread', async () => {
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'handoff', handoff_to: 'ayesha' } as any);
    await runCrewChat({ role: 'sdr', text: 'Usman pause the team', ctx: sctx, kind: 'mention' });
    expect(S.posts[0]).toMatchObject({ role: 'sdr', msg: { text: "That's Ayesha's call. Ayesha, over to you." } });
    expect(runtime.enqueue).toHaveBeenCalledWith('ws-1', 'head_of_sales', 'answer_question', expect.any(String),
      expect.objectContaining({ text: 'Usman pause the team', threadTs: '100.1' }), expect.anything());
  });

  it('handoff never bounces twice', async () => {
    vi.mocked(llm.json)
      .mockResolvedValueOnce({ intent: 'handoff', handoff_to: 'hira' } as any)
      .mockResolvedValueOnce({ intent: 'handoff', handoff_to: 'bilal' } as any);
    await runCrewChat({ role: 'scout', text: 'x', ctx: sctx, kind: 'mention' });
    expect(S.posts.map((p) => p.role)).toEqual(['scout', 'researcher']);
    expect(S.posts[1].msg.text).toContain('Ayesha');
    expect(runtime.enqueue).toHaveBeenCalledWith('ws-1', 'head_of_sales', 'answer_question', expect.any(String), expect.anything(), expect.anything());
  });

  it('Usman revise with a pending launch card → Edit flow via runtime (edit_requested + note in card thread)', async () => {
    S.tables.approvals = [{ id: 'appr-9', title: 'Launch', slack_ts: '555.1', slack_channel: 'C_HQ', status: 'pending' }];
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'revise', note: 'make email 2 shorter' } as any);
    const out = await runCrewChat({ role: 'sdr', text: 'Usman make email 2 shorter', ctx: sctx, kind: 'mention' });
    expect(out).toBe('edit appr-9');
    const w = S.writes.find((x) => x.table === 'approvals' && x.op === 'update');
    expect(w?.values).toMatchObject({ status: 'edit_requested', decided_by_slack_user: 'U1' });
    expect(bus.emit).toHaveBeenCalledWith('slack.message', expect.objectContaining({ kind: 'thread_reply', text: 'make email 2 shorter', ctx: expect.objectContaining({ channel: 'C_HQ', threadTs: '555.1' }) }));
  });

  it("Zara drafts a reply in thread (not sent) when no reply card is pending", async () => {
    S.tables.leads = [{ id: 'l1', full_name: 'Sara Khan', job_title: 'CFO', company_name: 'PayCo', stage: 'replied', research: {} }];
    S.tables.lead_events = [{ type: 'reply_classified', summary: 'Intent: interested, asks for pricing' }];
    vi.mocked(llm.json).mockResolvedValueOnce({ intent: 'draft_reply', lead_name: 'Sara', note: 'offer a call Tuesday' } as any);
    vi.mocked(llm.text).mockResolvedValueOnce('Hi Sara, happy to walk you through pricing. Mail me at x@y.com');
    // approvals query returns [] via the table default; pendingApproval → null
    S.tables.approvals = [];
    const out = await runCrewChat({ role: 'closer', text: 'Zara draft a reply to Sara', ctx: sctx, kind: 'mention' });
    expect(out).toBe('drafted');
    const post = S.posts.at(-1)!;
    expect(post.role).toBe('closer');
    expect(post.msg.text).toContain('not sent');
    expect(post.msg.text).not.toMatch(/@y\.com/);
  });

  it('named ask in another agent’s approval thread is answered; un-named chatter there is ignored', async () => {
    S.tables.approvals = [{ id: 'a1', kind: 'launch_sequence', status: 'pending', requested_by_agent_id: 'ag-sdr' }];
    await S.handlers['slack.message']({ kind: 'thread_reply', text: 'looks good', ctx: { ...sctx, threadTs: '555.1' } });
    expect(llm.json).not.toHaveBeenCalled();
    expect(runtime.enqueue).not.toHaveBeenCalled();
    S.tables.approvals = [{ id: 'a1', kind: 'launch_sequence', status: 'edit_requested', requested_by_agent_id: 'ag-sdr' }];
    await S.handlers['slack.message']({ kind: 'thread_reply', text: 'Usman shorter', addressed: 'sdr', ctx: { ...sctx, threadTs: '555.1' } });
    expect(llm.json).not.toHaveBeenCalled();
  });
});
