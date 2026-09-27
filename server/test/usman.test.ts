import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from './usman-fakedb';

const h = vi.hoisted(() => ({
  db: null as any,
  layers: [] as any[],
  layersThrow: true,
  settings: {} as Record<string, any>,
  approvals: [] as any[],
  reports: [] as any[],
  checklist: { set: vi.fn(async () => {}), add: vi.fn(async () => {}), title: vi.fn(async () => {}), ts: '1.1', channel: 'CTEAM' },
}));

vi.mock('../src/lib/env', () => ({ env: { WORKSPACE_ID: 'ws1', G8_DEMO_SCHEDULE_ID: 'sched-1', allowlist: [] } }));
vi.mock('../src/lib/g8', () => ({
  g8: {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn(),
    enrollGuarded: vi.fn(), sendReplyGuarded: vi.fn(), callGuarded: vi.fn(), bookGuarded: vi.fn(),
    isAllowlisted: vi.fn(async () => true),
  },
}));
vi.mock('../src/lib/llm', () => ({ llm: { text: vi.fn(), json: vi.fn() } }));
vi.mock('../src/lib/slack', () => ({
  slack: {
    postAs: vi.fn(async () => ({ ts: '2.2', channel: 'CTEAM' })), update: vi.fn(),
    checklist: vi.fn(async () => h.checklist), agentThread: vi.fn(), approvalCard: vi.fn(), dm: vi.fn(), permalink: vi.fn(), start: vi.fn(),
  },
}));
vi.mock('../src/lib/store', () => ({
  store: {
    get db() { return h.db; },
    workspace: vi.fn(async () => ({ id: 'ws1', name: '8x.social', founder_name: 'Zaeem', demo_time_scale: '0.000694', sales_brain: { offer: 'Outbound as a service', tone: 'friendly, direct' } })),
    settings: vi.fn(async () => h.settings),
    patchSettings: vi.fn(),
    agentByRole: vi.fn(async () => ({ id: 'agent-sdr', name: 'Usman', role: 'sdr' })),
    spend: vi.fn(),
  },
}));
vi.mock('../src/layers', () => ({
  layers: { register: vi.fn(), all: () => { if (h.layersThrow) throw new Error('layers not implemented yet (stub)'); return h.layers; } },
}));

import { g8 } from '../src/lib/g8';
import { llm } from '../src/lib/llm';
import { NotAllowlisted } from '../src/contracts';
import { usman, setFirstTouchSender } from '../src/agents/usman';
import { secondsPerDay } from '../src/agents/usman/util';
import { sanitizeCopy } from '../src/agents/usman/copy';
import { launchCardBlocks, timelineText } from '../src/slack/cards/launch';
import { doneSteps, pollSendsOnce } from '../src/inbound/send-poll';
import { tickScheduler, _resetScheduler } from '../src/scheduler';

const COPY = {
  tone: 'friendly',
  emails: [
    { subject: 'Quick idea for {{company}}', body: 'Hi {{ first_name }},\nSaw your team is hiring SDRs.\nWorth 15 min?\nZaeem', instructions: 'open with hook' },
    { subject: 'Re: quick idea', body: 'Hi {{first_name}},\nBumping this.\nZaeem', instructions: 'short bump' },
    { subject: 'Closing the loop', body: 'Hi [First Name],\nLast note from me.\nZaeem', instructions: 'breakup' },
  ],
  preview: { subject: 'Quick idea for Acme', body: 'Hi {{first_name}},\nSaw Acme is hiring SDRs.\nZaeem' },
};

function lead(id: string, o: Record<string, any> = {}) {
  return {
    id, workspace_id: 'ws1', full_name: `Lead ${id}`, job_title: 'VP Sales', company_name: `Co ${id}`, stage: 'researched',
    sequence_id: null, sequence_state: 'none', is_test_contact: false, do_not_contact: false, fit_score: 50,
    g8_contact_id: `c-${id}`, g8_list_id: '77', why_now: `hook ${id}`, research: { talking_points: ['tp1', 'tp2'] }, ...o,
  };
}

function ctx(extra: Record<string, any> = {}) {
  return {
    workspaceId: 'ws1', agentId: 'agent-sdr', role: 'sdr', runId: 'run1', settings: h.settings,
    task: { id: 'task1', number: 12, kind: 'build_sequence', input: {}, status: 'in_progress' },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    step: vi.fn(async () => {}),
    report: vi.fn(async (...a: any[]) => { h.reports.push(a); }),
    delegate: vi.fn(),
    requestApproval: vi.fn(async (kind: string, title: string, payload: any, blocks: any[]) => {
      const a = { id: `appr-${h.approvals.length + 1}`, kind, title, payload, blocks, sequence_id: null, decision_note: null };
      h.approvals.push(a);
      return a;
    }),
    thread: vi.fn(async () => ({ ts: '1.0', channel: 'CTEAM' })),
    ...extra,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetScheduler();
  setFirstTouchSender(undefined);
  h.layers = []; h.layersThrow = true; h.settings = { daily_find: 10, daily_research: 5, g8_mailbox_id: 1, g8_mailbox_email: 'sender@example.com' };
  h.approvals = []; h.reports = [];
  h.db = fakeDb({
    leads: [lead('a', { fit_score: 90 }), lead('b'), lead('t', { is_test_contact: true, full_name: 'Test Mate', g8_list_id: '88' })],
    sequences: [], lead_events: [], tasks: [{ id: 'task1', status: 'blocked', slack_channel: 'CTEAM', slack_thread_ts: '1.0' }],
  });
  (llm.json as any).mockResolvedValue(structuredClone(COPY));
  (g8.post as any).mockImplementation(async (path: string) => (path === '/sequences' ? { data: { id: 'seq-g8-1', status: 'drafted' } } : { data: {} }));
  (g8.patch as any).mockResolvedValue({ data: {} });
  (g8.enrollGuarded as any).mockResolvedValue({ data: { contacts_affected: 1 } });
  (g8.isAllowlisted as any).mockResolvedValue(true);
  (g8.get as any).mockResolvedValue({ data: {} });
});

describe('helpers', () => {
  it('maps demo_time_scale to seconds per day', () => {
    expect(secondsPerDay('1')).toBe(86_400);
    expect(secondsPerDay(0.000694)).toBe(60);
    expect(secondsPerDay(0.00001)).toBe(60);
    expect(secondsPerDay(undefined)).toBe(86_400);
  });
  it('sanitizes merge tokens to {{first_name}} only', () => {
    const c = sanitizeCopy(COPY as any);
    expect(c.emails[0].subject).toBe('Quick idea for');
    expect(c.emails[0].body).toMatch(/^Hi \{\{first_name\}\},/);
    expect(c.emails[2].body).not.toContain('[First Name]');
    expect(c.preview.body).not.toContain('{{');
  });
  it('card shows ⏸ for planned steps and no PII', () => {
    const steps = [
      { n: 1, day: 0, channel: 'email', action: 'send', mode: 'g8' as const, subject: 'Hi' },
      { n: 2, day: 1, channel: 'linkedin', action: 'connection_request', mode: 'planned' as const, reason: 'LinkedIn not connected' },
      { n: 3, day: 5, channel: 'phone', action: 'call', mode: 'fire' as const },
    ];
    expect(timelineText(steps)).toBe('✉️ D0 · in ⏸ D1 · 📞 D5');
    const json = JSON.stringify(launchCardBlocks({ sequenceName: 'S', steps, testNames: ['Test Mate'], prospectCount: 2, secPerDay: 60 }));
    expect(json).toContain('1 test lead enrolled');
    expect(json).toContain('1 day = 1 min');
    expect(json).not.toMatch(/@/);
  });
  it('doneSteps treats current_step_order as next step', () => {
    expect(doneSteps({ contact_id: 1, state: 'active', current_step_order: 1 }, 3)).toEqual([]);
    expect(doneSteps({ contact_id: 1, state: 'active', current_step_order: 3 }, 3)).toEqual([1, 2]);
    expect(doneSteps({ contact_id: 1, state: 'finished', current_step_order: 3 }, 3)).toEqual([1, 2, 3]);
  });
});

describe('build_sequence (Layer 0, zero layers)', () => {
  it('creates a 3-email MANUAL_TEMPLATE sequence without a list binding and asks for Launch', async () => {
    const summary = await usman.run(ctx());
    const create = (g8.post as any).mock.calls.find((c: any[]) => c[0] === '/sequences')[1];
    expect(create.associated_list_id).toBeUndefined();
    expect(create.finish_on_reply).toBe(true);
    expect(create.channels[0]).toMatchObject({ channel_id: 1, channel_type: 'GMAIL' });
    expect(create.steps.map((s: any) => [s.step_type, s.input_type, s.time_interval])).toEqual([
      ['EMAIL', 'MANUAL_TEMPLATE', 0], ['EMAIL', 'MANUAL_TEMPLATE', 180], ['EMAIL', 'MANUAL_TEMPLATE', 360],
    ]);
    expect(create.steps[0].step_data.instructions).toBeUndefined();
    expect(g8.patch).toHaveBeenCalledWith('/sequences/seq-g8-1', { schedule_id: 'sched-1' });

    expect(h.approvals).toHaveLength(1);
    const a = h.approvals[0];
    expect(a.kind).toBe('launch_sequence');
    expect(a.payload).toMatchObject({ g8_sequence_id: 'seq-g8-1', lead_count: 3, enroll_count: 1, test_lead_ids: ['t'] });
    expect(JSON.stringify(a.blocks)).toContain('Lead a'); // preview uses top real lead
    const seq = h.db.tables.sequences[0];
    expect(seq).toMatchObject({ status: 'pending_approval', g8_sequence_id: 'seq-g8-1', approval_id: 'appr-1', lead_count: 3 });
    expect(h.db.tables.leads.every((l: any) => l.sequence_id === seq.id && l.stage !== 'contacted')).toBe(true);
    expect(g8.enrollGuarded).not.toHaveBeenCalled();
    expect(summary).toMatch(/waiting for Launch/);
  });

  it('merges layer steps: live+g8Step into graph8, fire() scheduled, planned shown ⏸; broken layer is a warning', async () => {
    h.layersThrow = false;
    const fire = vi.fn(async () => {});
    h.layers = [
      { name: 'voice', stepPlan: async () => [{ day: 5, channel: 'phone', action: 'call', state: 'live', fire }] },
      { name: 'linkedin', stepPlan: async () => [{ day: 1, channel: 'linkedin', action: 'connection_request', state: 'planned', reason: 'not connected' }] },
      { name: 'sms', stepPlan: async () => [{ day: 2, channel: 'sms', action: 'sms', state: 'live', g8Step: { step_type: 'SMS', step_data: { message_body: 'x' } } }] },
      { name: 'broken', stepPlan: async () => { throw new Error('boom'); } },
    ];
    await usman.run(ctx());
    const create = (g8.post as any).mock.calls.find((c: any[]) => c[0] === '/sequences')[1];
    expect(create.steps.map((s: any) => [s.step_order, s.step_type, s.time_interval])).toEqual([
      [1, 'EMAIL', 0], [2, 'SMS', 120], [3, 'EMAIL', 60], [4, 'EMAIL', 360],
    ]);
    const steps = h.db.tables.sequences[0].steps;
    expect(steps.map((s: any) => `${s.channel}:${s.day}:${s.mode}`)).toEqual([
      'email:0:g8', 'linkedin:1:planned', 'sms:2:g8', 'email:3:g8', 'phone:5:fire', 'email:9:g8',
    ]);
    expect(JSON.stringify(h.approvals[0].blocks)).toContain('in ⏸ D1');
    expect(JSON.stringify(h.approvals[0].blocks)).toContain('broken: boom');
  });

  it('L8 flag: AI_GENERATED_TEMPLATE with instructions + sales_hook field', async () => {
    h.settings.usman_ai_template = true;
    (g8.get as any).mockImplementation(async (p: string) => (p === '/fields' ? { data: [{ id: 42, title: 'sales_hook' }] } : { data: {} }));
    await usman.run(ctx());
    const create = (g8.post as any).mock.calls.find((c: any[]) => c[0] === '/sequences')[1];
    expect(create.steps.every((s: any) => s.input_type === 'AI_GENERATED_TEMPLATE' && s.step_data.instructions)).toBe(true);
    const fieldPatches = (g8.patch as any).mock.calls.filter((c: any[]) => c[0] === '/fields/42/values');
    expect(fieldPatches).toHaveLength(3);
    expect(fieldPatches[0][1]).toMatchObject({ record_id: expect.any(Number), entity: 'contacts' });
  });

  it('fails cleanly with no leads', async () => {
    h.db = fakeDb({ leads: [], sequences: [], lead_events: [] });
    await expect(usman.run(ctx())).rejects.toThrow(/No researched leads/);
  });
});

describe('onApproval', () => {
  async function built() { const c = ctx(); await usman.run(c); return { c, a: h.approvals[0] }; }

  it('approved: enrolls ONLY test contacts, prospects become queued, sequence live', async () => {
    const { c, a } = await built();
    await usman.onApproval!(c, a, 'approved');
    expect(g8.enrollGuarded).toHaveBeenCalledTimes(1);
    expect(g8.enrollGuarded).toHaveBeenCalledWith('seq-g8-1', ['c-t'], '88');
    expect(g8.post).toHaveBeenCalledWith('/sequences/seq-g8-1/run', {});
    const byId = Object.fromEntries(h.db.tables.leads.map((l: any) => [l.id, l]));
    expect(byId.t).toMatchObject({ stage: 'contacted', sequence_state: 'enrolled' });
    expect(byId.a).toMatchObject({ stage: 'queued', sequence_state: 'queued' });
    expect(h.db.tables.sequences[0]).toMatchObject({ status: 'live', enrolled_count: 1 });
    expect(h.db.tables.lead_events.filter((e: any) => e.type === 'enrolled').map((e: any) => e.lead_id)).toEqual(['t']);
    expect(h.db.tables.lead_events.every((e: any) => !/@/.test(e.summary))).toBe(true);
  });

  it('approved: a TEST lead failing the allowlist check is skipped; guard error becomes an alert', async () => {
    const { c, a } = await built();
    (g8.enrollGuarded as any).mockRejectedValue(new NotAllowlisted('contact c-t'));
    await usman.onApproval!(c, a, 'approved');
    expect(h.reports.some((r) => r[0] === 'alert' && /Launch failed/.test(r[1]))).toBe(true);
    expect(h.db.tables.sequences[0].status).toBe('draft');

    (g8.isAllowlisted as any).mockResolvedValue(false);
    (g8.enrollGuarded as any).mockClear();
    await usman.onApproval!(c, a, 'approved');
    expect(g8.enrollGuarded).not.toHaveBeenCalled();
  });

  it('edit: revises copy, PATCHes each email step, asks again (rev 1)', async () => {
    const { c, a } = await built();
    (g8.get as any).mockImplementation(async (p: string) => p.endsWith('/steps')
      ? { data: { sequence_id: 'seq-g8-1', steps: [3, 1, 2].map((n) => ({ id: `st${n}`, step_order: n, step_type: 'EMAIL', input_type: 'MANUAL_TEMPLATE' })) } }
      : { data: {} });
    (llm.json as any).mockResolvedValue({ ...structuredClone(COPY), emails: COPY.emails.map((e) => ({ ...e, subject: `${e.subject} (shorter)` })) });
    await usman.onApproval!(c, a, 'edit', 'make it shorter');
    const stepPatches = (g8.patch as any).mock.calls.filter((x: any[]) => /\/steps\//.test(x[0]));
    expect(stepPatches.map((x: any[]) => x[0])).toEqual(['/sequences/seq-g8-1/steps/st1', '/sequences/seq-g8-1/steps/st2', '/sequences/seq-g8-1/steps/st3']);
    expect(stepPatches[0][1].step_data).toMatchObject({ email_type: 'plain' });
    expect(h.approvals).toHaveLength(2);
    expect(h.approvals[1].payload.revision).toBe(1);
    expect(h.db.tables.sequences[0].approval_id).toBe('appr-2');
  });

  it('rejected: cancels, leads stay researched and detached, graph8 sequence archived', async () => {
    const { c, a } = await built();
    await usman.onApproval!(c, a, 'rejected');
    expect(h.db.tables.sequences[0].status).toBe('cancelled');
    expect(h.db.tables.leads.every((l: any) => l.sequence_id === null && l.stage === 'researched')).toBe(true);
    expect(g8.post).toHaveBeenCalledWith('/sequences/seq-g8-1/archive', {});
    expect(g8.enrollGuarded).not.toHaveBeenCalled();
    expect(h.db.tables.tasks[0].status).toBe('cancelled');
  });
});

describe('tracking', () => {
  async function launched() {
    const c = ctx(); await usman.run(c); await usman.onApproval!(c, h.approvals[0], 'approved'); return c;
  }

  it('webhook email_sent → lead_event once; poll of the same step dedupes', async () => {
    const c = await launched();
    await usman.onEvent!(c, 'engagement.email_sent', { data: { contact_id: 'c-t', sequence_id: 'seq-g8-1' } });
    await usman.onEvent!(c, 'engagement.email_sent', { data: { contact_id: 'c-t', sequence_id: 'seq-g8-1' } });
    let sent = h.db.tables.lead_events.filter((e: any) => e.type === 'email_sent');
    expect(sent.map((e: any) => e.data.step)).toEqual([1, 2]); // inferred: 2nd webhook = next email step

    (g8.get as any).mockResolvedValue({ data: [{ contact_id: 'c-t', state: 'active', current_step_order: 2 }] });
    expect(await pollSendsOnce('ws1')).toBe(0);
    sent = h.db.tables.lead_events.filter((e: any) => e.type === 'email_sent');
    expect(sent).toHaveLength(2);
    expect(h.db.tables.sequences[0].stats.sent).toBe(2);
    expect(h.checklist.set).toHaveBeenCalledWith('track', 'doing', expect.stringContaining('✉️ 2 sent'));
  });

  it('poll: bounce → lead disqualified(bounced), contact paused', async () => {
    await launched();
    (g8.get as any).mockResolvedValue({ data: [{ contact_id: 'c-t', state: 'bounced', current_step_order: 1 }] });
    expect(await pollSendsOnce('ws1')).toBe(1);
    const t = h.db.tables.leads.find((l: any) => l.id === 't');
    expect(t).toMatchObject({ stage: 'disqualified', disqualify_reason: 'bounced', sequence_state: 'stopped' });
    expect(g8.post).toHaveBeenCalledWith('/sequences/seq-g8-1/contacts/c-t/pause', {});
  });

  it('ignores events Usman does not own (replies go to Zara)', async () => {
    const c = await launched();
    const before = h.db.tables.lead_events.length;
    await usman.onEvent!(c, 'engagement.email_replied', { data: { contact_id: 'c-t' } });
    expect(h.db.tables.lead_events.length).toBe(before);
  });
});

describe('scheduler', () => {
  it('fires a due side step once per enrolled test lead, never for prospects or replied leads', async () => {
    h.layersThrow = false;
    const fire = vi.fn(async () => {});
    h.layers = [{ name: 'voice', stepPlan: async () => [{ day: 5, channel: 'phone', action: 'call', state: 'live', fire }] }];
    const c = ctx(); await usman.run(c); await usman.onApproval!(c, h.approvals[0], 'approved');
    const launchedAt = new Date(h.db.tables.sequences[0].launched_at).getTime();

    expect(await tickScheduler(new Date(launchedAt + 4 * 60_000), 'ws1')).toBe(0);
    expect(await tickScheduler(new Date(launchedAt + 5 * 60_000 + 1), 'ws1')).toBe(1);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({ g8ContactId: 'c-t', sequenceId: 'seq-g8-1' }));
    expect(await tickScheduler(new Date(launchedAt + 6 * 60_000), 'ws1')).toBe(0);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('rebuilds fire() from the layer after a restart; skips replied leads', async () => {
    h.layersThrow = false;
    const fire = vi.fn(async () => {});
    h.layers = [{ name: 'voice', stepPlan: async () => [{ day: 5, channel: 'phone', action: 'call', state: 'live', fire }] }];
    const c = ctx(); await usman.run(c); await usman.onApproval!(c, h.approvals[0], 'approved');
    _resetScheduler(); // simulate restart: in-memory fire map gone
    const launchedAt = new Date(h.db.tables.sequences[0].launched_at).getTime();
    expect(await tickScheduler(new Date(launchedAt + 10 * 60_000), 'ws1')).toBe(1);

    h.db.tables.lead_events = [];
    h.db.tables.leads.find((l: any) => l.id === 't').stage = 'replied';
    expect(await tickScheduler(new Date(launchedAt + 10 * 60_000), 'ws1')).toBe(0);
  });
});

describe('live-verified fixes', () => {
  it('falls back to POST /status live when /run 400s (no list bound); name has no redactable digit run', async () => {
    (g8.post as any).mockImplementation(async (path: string) => {
      if (path === '/sequences') return { data: { id: 'seq-g8-1', status: 'drafted' } };
      if (path.endsWith('/run')) throw new Error('graph8 POST /run -> 400: Sequence has no associated contact list');
      return { data: {} };
    });
    const c = ctx(); await usman.run(c);
    expect(h.db.tables.sequences[0].name).not.toMatch(/\d{4}-\d{2}/);
    await usman.onApproval!(c, h.approvals[0], 'approved');
    expect(g8.post).toHaveBeenCalledWith('/sequences/seq-g8-1/status', { status: 'live' });
    expect(h.reports.some((r) => r[0] === 'update' && /launched/i.test(r[1]))).toBe(true);
  });

  it('direct first-touch seam: sends email 1 to TEST leads only, rendered, recorded as step 1 (poll dedupes)', async () => {
    const sender = vi.fn(async () => ({ ok: true, ref: 'msg-1' }));
    setFirstTouchSender(sender);
    const c = ctx(); await usman.run(c); await usman.onApproval!(c, h.approvals[0], 'approved');
    expect(sender).toHaveBeenCalledTimes(1);
    const arg = (sender.mock.calls[0] as any)[0];
    expect(arg).toMatchObject({ g8ContactId: 'c-t', g8SequenceId: 'seq-g8-1' });
    expect(arg.body).toMatch(/^Hi Test,/);
    expect(arg.body).not.toContain('{{');
    (g8.get as any).mockResolvedValue({ data: [{ contact_id: 'c-t', state: 'active', current_step_order: 2 }] });
    expect(await pollSendsOnce('ws1')).toBe(0);
    expect(h.db.tables.lead_events.filter((e: any) => e.type === 'email_sent')).toHaveLength(1);
  });

  it('first-touch seam is skipped when settings.usman_direct_first_touch === false', async () => {
    const sender = vi.fn(async () => ({ ok: true }));
    setFirstTouchSender(sender);
    h.settings.usman_direct_first_touch = false;
    const c = ctx(); await usman.run(c); await usman.onApproval!(c, h.approvals[0], 'approved');
    expect(sender).not.toHaveBeenCalled();
  });

  it('never sends a LinkedIn g8Step to graph8 (V-L1)', async () => {
    h.layersThrow = false;
    h.layers = [{ name: 'linkedin', stepPlan: async () => [{ day: 1, channel: 'linkedin', action: 'message', state: 'live', g8Step: { step_type: 'HEYREACH' } }] }];
    await usman.run(ctx());
    const create = (g8.post as any).mock.calls.find((x: any[]) => x[0] === '/sequences')[1];
    expect(create.steps.some((st: any) => st.step_type === 'HEYREACH')).toBe(false);
    expect(h.db.tables.sequences[0].steps.find((st: any) => st.channel === 'linkedin').mode).toBe('planned');
  });
});
