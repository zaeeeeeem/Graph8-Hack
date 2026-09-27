/**
 * Zara unit tests — libs mocked (g8/llm/store/slack/layers/runtime/env/log). No network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;

  function createFakeDb(seed: Record<string, Row[]> = {}) {
    const tables: Record<string, Row[]> = {};
    for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
    let seq = 1;

    function builder(table: string) {
      const rows = () => (tables[table] ??= []);
      const filters: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
      let payload: any = null;
      let upsertOpts: any = null;
      let limitN: number | null = null;
      let returning = false;

      const exec = () => {
        if (op === 'insert') {
          const list = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: r.id ?? `${table}-${seq++}`, ...r }));
          rows().push(...list);
          return { data: returning ? list : null, error: null };
        }
        if (op === 'upsert') {
          const key = upsertOpts?.onConflict ?? 'id';
          const r: Row = payload;
          const hit = rows().find((x) => x[key] === r[key]);
          if (hit) {
            if (upsertOpts?.ignoreDuplicates) return { data: [], error: null };
            Object.assign(hit, r);
            return { data: [hit], error: null };
          }
          const row = { id: r.id ?? `${table}-${seq++}`, ...r };
          rows().push(row);
          return { data: [row], error: null };
        }
        const matched = rows().filter((r) => filters.every((f) => f(r)));
        if (op === 'update') {
          matched.forEach((r) => Object.assign(r, payload));
          return { data: matched, error: null };
        }
        return { data: limitN === null ? matched : matched.slice(0, limitN), error: null };
      };

      const b: any = {
        select: () => { if (op !== 'select') returning = true; return b; },
        insert: (p: any) => { op = 'insert'; payload = p; return b; },
        update: (p: any) => { op = 'update'; payload = p; return b; },
        upsert: (p: any, o?: any) => { op = 'upsert'; payload = p; upsertOpts = o; return b; },
        eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return b; },
        ilike: (k: string, v: string) => { filters.push((r) => String(r[k] ?? '').toLowerCase() === v.toLowerCase()); return b; },
        in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return b; },
        not: (k: string, _op: string, _v: any) => { filters.push((r) => r[k] !== null && r[k] !== undefined); return b; },
        order: () => b,
        limit: (n: number) => { limitN = n; return b; },
        then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
      };
      return b;
    }

    return { tables, db: { from: (t: string) => builder(t) } };
  }

  const state: { fake: ReturnType<typeof createFakeDb> } = { fake: createFakeDb() };
  return { createFakeDb, state, calls: [] as string[] };
});

vi.mock('../src/lib/env', () => ({ env: { WORKSPACE_ID: 'ws1', PORT: 3000, allowlist: [], layersDisabled: [], SLACK_DISABLED: true } }));
vi.mock('../src/lib/log', () => {
  const l: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }; l.child = () => l; return { log: l };
});
vi.mock('../src/lib/store', () => ({
  store: {
    get db() { return h.state.fake.db; },
    workspace: vi.fn(async () => ({ id: 'ws1', name: '8x', company_domain: '8x.social', founder_name: 'Zaeem', timezone: 'Asia/Karachi' })),
    settings: vi.fn(async () => ({ daily_find: 10, daily_research: 5, g8_mailbox_email: 'founder@8x.social' })),
    spend: vi.fn(async () => {}),
  },
}));
vi.mock('../src/lib/g8', () => ({
  g8: {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn(),
    enrollGuarded: vi.fn(), sendReplyGuarded: vi.fn(), callGuarded: vi.fn(), bookGuarded: vi.fn(), isAllowlisted: vi.fn(),
  },
}));
vi.mock('../src/lib/llm', () => ({ llm: { text: vi.fn(), json: vi.fn() } }));
vi.mock('../src/lib/slack', () => ({
  slack: {
    postAs: vi.fn(async () => ({ ts: '1.1', channel: 'CTEAM' })), update: vi.fn(),
    checklist: vi.fn(async () => ({ ts: '1.2', channel: 'CTEAM', set: vi.fn(async () => {}), add: vi.fn(async () => {}), title: vi.fn() })),
    agentThread: vi.fn(), approvalCard: vi.fn(), dm: vi.fn(), permalink: vi.fn(async () => 'https://slack/thread'), start: vi.fn(),
  },
}));
vi.mock('../src/layers', () => ({ layers: { register: vi.fn(), all: vi.fn(() => []) } }));
vi.mock('../src/agents/runtime', () => ({ runtime: { register: vi.fn(), enqueue: vi.fn(async () => ({ id: 't2', number: 2 })), start: vi.fn() } }));

import { g8 } from '../src/lib/g8';
import { llm } from '../src/lib/llm';
import { layers } from '../src/layers';
import { runtime } from '../src/agents/runtime';
import { bus } from '../src/lib/bus';
import { zara } from '../src/agents/zara';
import { normalize, dedupeKey } from '../src/inbound/normalize';
import { pollInboxOnce } from '../src/inbound/inbox-poll';
import { keywordClassify } from '../src/agents/zara/classify';
import { mapDisposition } from '../src/agents/zara/voice';
import { latestInbound } from '../src/agents/zara/inbox';
import { scrub, stripQuoted } from '../src/agents/zara/pii';
import { estimateAmount, FALLBACK_DEAL_AMOUNT } from '../src/agents/zara/deal';
import { routeFor, WEBHOOK_EVENTS } from '../src/inbound/handlers/index';
import { NotAllowlisted } from '../src/contracts';

const mg8 = g8 as any;
const mllm = llm as any;

const SETTINGS = {
  daily_find: 10, daily_research: 5, g8_pipeline_id: 'pipe1', g8_stage_new_meeting_id: 'stage-nm', g8_event_type_id: 1,
  g8_mailbox_email: 'founder@8x.social',
};

function seed() {
  h.state.fake = h.createFakeDb({
    leads: [
      { id: 'L1', workspace_id: 'ws1', g8_contact_id: '101', g8_company_id: '555', full_name: 'Ali Khan', company_name: 'Acme', company_domain: 'acme.com', stage: 'contacted', sequence_state: 'enrolled', sequence_id: 'S1', is_test_contact: true, do_not_contact: false, research: {}, g8_deal_id: null, g8_meeting_id: null, meeting_at: null },
      { id: 'L2', workspace_id: 'ws1', g8_contact_id: '102', full_name: 'Sara Acme', company_name: 'Acme', company_domain: 'acme.com', stage: 'contacted', sequence_state: 'enrolled', sequence_id: 'S1', is_test_contact: false, do_not_contact: false, research: {} },
      { id: 'L3', workspace_id: 'ws1', g8_contact_id: '201', full_name: 'Other Person', company_name: 'Beta', company_domain: 'beta.io', stage: 'contacted', sequence_state: 'enrolled', sequence_id: 'S1', is_test_contact: false, do_not_contact: false, research: {} },
    ],
    lead_contacts: [{ lead_id: 'L1', workspace_id: 'ws1', email: 'ali@acme.com' }],
    sequences: [{ id: 'S1', workspace_id: 'ws1', g8_sequence_id: '9001', status: 'live', launched_at: '2026-09-27T00:00:00Z' }],
    lead_events: [], inbound_events: [],
  });
}

const THREAD = {
  id: 'th-1', channel: 'email', subject: 'quick question', contact: { id: 101, email: 'ali@acme.com', name: 'Ali Khan' },
  updated_at: '2026-09-27T10:00:00Z',
  messages: [
    { message_id: 'm1', from_address: 'founder@8x.social', content: 'Hi Ali, …', date: '2026-09-27T09:00:00Z', is_draft: false },
    { message_id: 'm2', from_address: 'ali@acme.com', content: 'Interested — Tuesday 3pm works for me.\n\nOn Sun, Zaeem wrote:\n> Hi Ali', date: '2026-09-27T10:00:00Z', is_draft: false },
  ],
};

function makeCtx(kind: string, input: Record<string, any>) {
  const calls = h.calls;
  return {
    workspaceId: 'ws1', agentId: 'agent-zara', role: 'closer', runId: 'run1', settings: SETTINGS,
    task: { id: 't1', kind, input, number: 1 } as any,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    step: vi.fn(async () => {}),
    report: vi.fn(async (k: string) => { calls.push(`report:${k}`); }),
    delegate: vi.fn(),
    requestApproval: vi.fn(async () => { calls.push('approval'); return { id: 'ap1' }; }),
    thread: vi.fn(async () => ({ ts: '1.0', channel: 'CTEAM' })),
  } as any;
}

const replyInput = (over: Record<string, any> = {}) => ({
  reply: normalize('engagement.email_replied', { contact_id: '101', email: 'ali@acme.com', sequence_id: '9001', reply_id: 'th-1', _source: 'poll', ...over }),
  lead_id: 'L1',
});

beforeEach(() => {
  vi.clearAllMocks();
  h.calls.length = 0;
  seed();
  mg8.isAllowlisted.mockResolvedValue(true);
  mg8.get.mockImplementation(async (path: string) => {
    if (path === '/inbox/th-1') return { data: THREAD };
    if (path === '/inbox') return { data: [THREAD] };
    if (path === '/appointments/slots') return { data: { slots: {
      '2030-01-07': [{ time: '2030-01-07T06:00:00+00:00' }, { time: '2030-01-07T09:00:00+00:00' }],
      '2030-01-08': [{ time: '2030-01-08T09:00:00+00:00' }],
    } } };
    if (path === '/global-context/documents') return { data: [{ display_name: 'Pricing Matrix', content: 'Growth $1,000/mo' }] };
    if (path === '/team-members') return { data: { items: [{ id: 'tm1', propelauth_user_id: 'pa1', status: 'active' }] } };
    return { data: {} };
  });
  mg8.post.mockImplementation(async (path: string) => {
    h.calls.push(`post:${path}`);
    if (path === '/deals') return { data: { id: 'deal-1', stage_name: 'New Meeting' } };
    return { data: {} };
  });
  mg8.sendReplyGuarded.mockImplementation(async () => { h.calls.push('send'); return { data: { message_id: 'out1' } }; });
  mg8.bookGuarded.mockImplementation(async (b: any) => { h.calls.push('book'); return { data: { uid: 'bk-1', start_time: b.start_time } }; });
  mllm.text.mockResolvedValue('');
});

// ---------------------------------------------------------------------------
describe('normalize + dedupe', () => {
  it('unwraps the webhook envelope and maps reply fields', () => {
    const n = normalize('engagement.email_replied', { event: 'engagement.email_replied', timestamp: 't', org_id: 'o', data: { contact_id: 7, sequence_id: 3, replied_at: 'x', is_positive: true } }) as any;
    expect(n).toMatchObject({ kind: 'reply', channel: 'email', contactId: '7', sequenceId: '3', isPositive: true, source: 'webhook' });
  });
  it('maps meetings, voice and ignores unknown', () => {
    expect(normalize('meeting.booked', { contact_id: 1, meeting_id: 9, scheduled_at: 's' })).toMatchObject({ kind: 'meeting', action: 'booked', meetingId: '9' });
    expect(normalize('voice.outcome', { contact_id: 1, disposition: 'Booked' })).toMatchObject({ kind: 'voice', disposition: 'booked' });
    expect(normalize('campaign.created', {})).toBeNull();
  });
  it('dedupe key: graph8:<type>:<reply_id>[:<message>] / meeting id / contact fallback', () => {
    expect(dedupeKey('engagement.email_replied', { reply_id: 'th', message_id: 'm' })).toBe('graph8:engagement.email_replied:th:m');
    expect(dedupeKey('meeting.booked', { data: { meeting_id: 5 }, event: 'meeting.booked' })).toBe('graph8:meeting.booked:5');
    expect(dedupeKey('engagement.email_replied', { contact_id: 1, replied_at: 'r' })).toBe('graph8:engagement.email_replied:1:r');
  });
  it('routes closer events and subscribes the webhook to them', () => {
    expect(routeFor('engagement.email_replied')).toBe('closer');
    expect(routeFor('meeting.booked')).toBe('closer');
    expect(routeFor('engagement.email_sent')).toBe('sdr');
    expect(WEBHOOK_EVENTS).toContain('meeting.booked');
    expect(WEBHOOK_EVENTS).not.toContain('voice.outcome');
  });
});

describe('pure helpers', () => {
  it('keyword classifier fallback', () => {
    expect(keywordClassify('Please unsubscribe me').intent).toBe('unsubscribe');
    expect(keywordClassify('I am out of office until Monday').intent).toBe('out_of_office');
    expect(keywordClassify('Interested — Tuesday 3pm works').intent).toBe('interested');
    expect(keywordClassify('How much does it cost?').intent).toBe('question');
  });
  it('Z11 disposition mapping', () => {
    expect(mapDisposition('booked')).toBe('deal');
    expect(mapDisposition('callback')).toBe('propose_times');
    expect(mapDisposition('not_interested')).toBe('stop');
    expect(mapDisposition('DNC')).toBe('do_not_contact');
    expect(mapDisposition('voicemail')).toBe('continue');
    expect(mapDisposition('wrong_person')).toBe('approval_draft');
  });
  it('scrubs PII and strips quoted history', () => {
    expect(scrub('mail me at a.b@c.com or +1 980 294 4116')).toBe('mail me at [email] or [phone]');
    expect(stripQuoted('Yes please\n\nOn Sun, X wrote:\n> old')).toBe('Yes please');
  });
  it('latestInbound picks the prospect message, not ours', () => {
    expect(latestInbound(THREAD as any, ['founder@8x.social'], 'ali@acme.com')?.message_id).toBe('m2');
    expect(latestInbound({ id: 'x', channel: 'email', messages: [THREAD.messages[0]] } as any, ['founder@8x.social'], 'ali@acme.com')).toBeNull();
  });
  it('deal amount falls back to $12,000 when Gemini fails', async () => {
    mllm.json.mockRejectedValue(new Error('down'));
    const r = await estimateAmount({ company_name: 'Acme' } as any, { agentId: 'a', workspaceId: 'ws1' });
    expect(r.amount).toBe(FALLBACK_DEAL_AMOUNT);
  });
});

// ---------------------------------------------------------------------------
describe('handle_reply playbook', () => {
  it('interested + time: stops the account FIRST, books, confirms in-thread, creates deal, reports win', async () => {
    mllm.json.mockImplementation(async (_p: string, schema: any) => {
      if (schema.shape?.intent) return { intent: 'interested', proposed_time: '2030-01-08T10:00:00+05:00', summary: 'wants Tuesday' };
      return { amount: 18000, plan: 'Growth' };
    });
    const ctx = makeCtx('handle_reply', replyInput());
    const out = await zara.run(ctx);
    expect(out).toMatch(/deal/);
    // order: pause before any send/book
    const firstPause = h.calls.findIndex((c) => c.includes('/contacts/') && c.endsWith('/pause'));
    expect(firstPause).toBeGreaterThanOrEqual(0);
    expect(firstPause).toBeLessThan(h.calls.indexOf('book'));
    expect(h.calls.indexOf('book')).toBeLessThan(h.calls.indexOf('send'));
    // whole account paused (L1 + L2 at acme.com), other company untouched
    expect(h.calls).toContain('post:/sequences/9001/contacts/101/pause');
    expect(h.calls).toContain('post:/sequences/9001/contacts/102/pause');
    expect(h.calls).not.toContain('post:/sequences/9001/contacts/201/pause');
    // deal
    const dealCall = mg8.post.mock.calls.find((c: any[]) => c[0] === '/deals');
    expect(dealCall[1]).toMatchObject({ pipeline_id: 'pipe1', stage_id: 'stage-nm', contact_ids: [101], company_id: 555, amount: 18000 });
    const lead = h.state.fake.tables.leads.find((l) => l.id === 'L1')!;
    expect(lead).toMatchObject({ stage: 'deal', g8_deal_id: 'deal-1', g8_meeting_id: 'bk-1', last_reply_intent: 'interested', sequence_state: 'stopped' });
    expect(ctx.report).toHaveBeenCalledWith('win', expect.stringContaining('est.'), expect.any(String), expect.objectContaining({ amount: 18000, estimated: true }));
    // no PII in lead_events summaries
    for (const e of h.state.fake.tables.lead_events) expect(e.summary).not.toMatch(/@|\d{7,}/);
  });

  it('interested without time: auto-reply with 2 slots, no approval', async () => {
    mllm.json.mockResolvedValue({ intent: 'interested', proposed_time: null });
    const ctx = makeCtx('handle_reply', replyInput());
    await zara.run(ctx);
    expect(mg8.bookGuarded).not.toHaveBeenCalled();
    const [threadId, body] = mg8.sendReplyGuarded.mock.calls[0];
    expect(threadId).toBe('th-1');
    expect(body).toMatchObject({ channel: 'email', from_address: 'founder@8x.social', subject: 'Re: quick question' });
    expect((body.body.match(/^- /gm) ?? []).length).toBe(2);
    expect(body.body).toContain('Zaeem');
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it('question → approval card [Send], nothing sent', async () => {
    mllm.json.mockResolvedValue({ intent: 'question' });
    mllm.text.mockResolvedValue('Hi Ali,\n\nGood question…\n\nBest,\nZaeem\n8x');
    const ctx = makeCtx('handle_reply', replyInput());
    await zara.run(ctx);
    expect(mg8.sendReplyGuarded).not.toHaveBeenCalled();
    expect(ctx.requestApproval).toHaveBeenCalledWith('send_reply', expect.any(String), expect.objectContaining({ g8_thread_id: 'th-1', lead_id: 'L1', intent: 'question' }), expect.any(Array), 'Send');
    const blocksJson = JSON.stringify(ctx.requestApproval.mock.calls[0][3]);
    expect(blocksJson).not.toContain('ali@acme.com');
  });

  it('non-allowlisted contact never auto-sends (drafts only)', async () => {
    h.state.fake.tables.leads[0].is_test_contact = false;
    mg8.isAllowlisted.mockResolvedValue(false);
    mllm.json.mockResolvedValue({ intent: 'interested', proposed_time: '2030-01-08T10:00:00+05:00' });
    const ctx = makeCtx('handle_reply', replyInput());
    await zara.run(ctx);
    expect(mg8.sendReplyGuarded).not.toHaveBeenCalled();
    expect(mg8.bookGuarded).not.toHaveBeenCalled();
    expect(ctx.requestApproval).toHaveBeenCalled();
    expect(h.calls).toContain('post:/sequences/9001/contacts/101/pause');
  });

  it('unsubscribe → do-not-contact, no reply', async () => {
    mllm.json.mockResolvedValue({ intent: 'unsubscribe' });
    await zara.run(makeCtx('handle_reply', replyInput()));
    expect(mg8.sendReplyGuarded).not.toHaveBeenCalled();
    expect(h.state.fake.tables.leads[0]).toMatchObject({ do_not_contact: true, stage: 'disqualified', disqualify_reason: 'unsubscribed' });
  });

  it('LLM down → keyword fallback still answers an interested reply', async () => {
    mllm.json.mockRejectedValue(new Error('gemini down'));
    mllm.text.mockRejectedValue(new Error('gemini down'));
    await zara.run(makeCtx('handle_reply', replyInput()));
    expect(mg8.sendReplyGuarded).toHaveBeenCalledTimes(1);
  });

  it('same prospect message twice → handled once', async () => {
    mllm.json.mockResolvedValue({ intent: 'interested', proposed_time: null });
    await zara.run(makeCtx('handle_reply', replyInput()));
    const second = await zara.run(makeCtx('handle_reply', replyInput()));
    expect(second).toMatch(/Duplicate/);
    expect(mg8.sendReplyGuarded).toHaveBeenCalledTimes(1);
  });

  it('never pauses a graph8 sequence that is not ours (payload sequence id ignored)', async () => {
    mllm.json.mockResolvedValue({ intent: 'not_now' });
    h.state.fake.tables.leads[0].sequence_id = null;
    h.state.fake.tables.leads[1].sequence_id = null;
    await zara.run(makeCtx('handle_reply', replyInput({ sequence_id: 'foreign-777' })));
    expect(h.calls.some((c) => c.includes('foreign-777'))).toBe(false);
  });
  it('pause endpoint fails → falls back to pausing a single-account sequence', async () => {
    h.state.fake.tables.leads = h.state.fake.tables.leads.filter((l) => l.id !== 'L3');
    mg8.post.mockImplementation(async (path: string) => {
      h.calls.push(`post:${path}`);
      if (path.includes('/contacts/')) throw new Error('404');
      return { data: {} };
    });
    mllm.json.mockResolvedValue({ intent: 'not_now' });
    await zara.run(makeCtx('handle_reply', replyInput()));
    expect(h.calls).toContain('post:/sequences/9001/pause');
  });
});

// ---------------------------------------------------------------------------
describe('events + approvals', () => {
  it('reply event → enqueue handle_reply for the closer', async () => {
    const ctx = makeCtx('x', {});
    await zara.onEvent!(ctx, 'engagement.email_replied', { contact_id: '101', sequence_id: '9001' });
    expect(runtime.enqueue).toHaveBeenCalledWith('ws1', 'closer', 'handle_reply', expect.any(String), expect.objectContaining({ lead_id: 'L1' }), { priority: 0 });
  });
  it('meeting.booked → enqueue create_deal; create_deal is idempotent', async () => {
    await zara.onEvent!(makeCtx('x', {}), 'meeting.booked', { contact_id: '101', meeting_id: 'mt1', scheduled_at: '2030-01-08T05:00:00Z' });
    expect(runtime.enqueue).toHaveBeenCalledWith('ws1', 'closer', 'create_deal', expect.any(String), expect.objectContaining({ lead_id: 'L1', meeting_id: 'mt1' }), { priority: 0 });
    mllm.json.mockResolvedValue({ amount: 9000, plan: 'Pro' });
    const ctx = makeCtx('create_deal', { lead_id: 'L1', meeting_id: 'mt1', scheduled_at: '2030-01-08T05:00:00Z' });
    await zara.run(ctx);
    await zara.run(ctx);
    expect(mg8.post.mock.calls.filter((c: any[]) => c[0] === '/deals')).toHaveLength(1);
    expect(ctx.report).toHaveBeenCalledTimes(1);
  });
  it('deal 422 "no associated company" → attach contact to company, retry', async () => {
    let n = 0;
    mg8.post.mockImplementation(async (path: string) => {
      if (path === '/deals' && n++ === 0) throw new Error('graph8 422: Contact(s) have no associated company: [101]. A deal needs a company.');
      return path === '/deals' ? { data: { id: 'deal-9', stage_name: 'New Meeting' } } : { data: {} };
    });
    mllm.json.mockResolvedValue({ amount: 24000, plan: 'Managed' });
    const ctx = makeCtx('create_deal', { lead_id: 'L1', meeting_id: 'mt2' });
    await zara.run(ctx);
    expect(mg8.patch).toHaveBeenCalledWith('/contacts/101', { company_id: 555 });
    expect(ctx.report).toHaveBeenCalledWith('win', expect.any(String), expect.any(String), expect.objectContaining({ g8_deal_id: 'deal-9', g8_url: 'https://app.graph8.com/deals/deal-9' }));
  });
  it('voice outcome not_interested → stop + disqualify', async () => {
    await zara.onEvent!(makeCtx('x', {}), 'voice.outcome', { contact_id: '101', disposition: 'not_interested' });
    expect(h.state.fake.tables.leads[0]).toMatchObject({ stage: 'disqualified', sequence_state: 'stopped' });
  });
  it('unknown events are left to the runtime (no double layer dispatch)', async () => {
    const h1 = vi.fn(async () => {});
    (layers.all as any).mockReturnValue([{ name: 'x', inbound: { 'voice_ai.call_completed': h1 } }]);
    await zara.onEvent!(makeCtx('x', {}), 'voice_ai.call_completed', { a: 1 });
    expect(h1).not.toHaveBeenCalled();
    expect(runtime.enqueue).not.toHaveBeenCalled();
  });
  it('approval Send → guarded send; guard block → alert', async () => {
    const ctx = makeCtx('handle_reply', {});
    const approval: any = { kind: 'send_reply', payload: { lead_id: 'L1', g8_thread_id: 'th-1', channel: 'email', draft: 'Hi Ali', subject: 'x' } };
    await zara.onApproval!(ctx, approval, 'approved');
    expect(mg8.sendReplyGuarded).toHaveBeenCalledWith('th-1', expect.objectContaining({ body: 'Hi Ali' }));
    mg8.sendReplyGuarded.mockRejectedValueOnce(new NotAllowlisted('x'));
    await zara.onApproval!(ctx, approval, 'approved');
    expect(ctx.report).toHaveBeenCalledWith('alert', expect.any(String), expect.stringContaining('guard'), expect.any(Object));
  });
  it('approval Edit → revised draft re-asked', async () => {
    mllm.text.mockResolvedValue('Hi Ali, shorter.\n\nBest,\nZaeem\n8x');
    const ctx = makeCtx('handle_reply', {});
    await zara.onApproval!(ctx, { kind: 'send_reply', payload: { lead_id: 'L1', g8_thread_id: 'th-1', draft: 'long', intent: 'question', revision: 0 } } as any, 'edit', 'make it shorter');
    expect(ctx.requestApproval).toHaveBeenCalledWith('send_reply', expect.stringContaining('revised'), expect.objectContaining({ draft: 'Hi Ali, shorter.\n\nBest,\nZaeem\n8x', revision: 1 }), expect.any(Array), 'Send');
  });
});

// ---------------------------------------------------------------------------
describe('inbox poll', () => {
  it('emits graph8.event once per new prospect message (dedupe via inbound_events)', async () => {
    const seen: any[] = [];
    bus.on('graph8.event', (e) => { seen.push(e); });
    const r1 = await pollInboxOnce('ws1');
    const r2 = await pollInboxOnce('ws1');
    await new Promise((r) => setTimeout(r, 10));
    expect(r1.emitted).toBe(1);
    expect(r2.emitted).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'engagement.email_replied', workspaceId: 'ws1' });
    expect(h.state.fake.tables.inbound_events[0].dedupe_key).toBe('graph8:engagement.email_replied:th-1:m2');
  });
  it('ignores replies older than the sequence launch', async () => {
    h.state.fake.tables.sequences[0].launched_at = '2026-09-28T00:00:00Z';
    expect((await pollInboxOnce('ws1')).emitted).toBe(0);
  });
});
