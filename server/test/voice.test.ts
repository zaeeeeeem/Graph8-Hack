import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: env/g8/store/llm/bus/layers all mocked.
const envMock = { PUBLIC_URL: 'https://graphi.test', layersDisabled: [] as string[], allowlist: [], WORKSPACE_ID: 'ws-1' };
vi.mock('../src/lib/env', () => ({ env: envMock }));

class NotAllowlisted extends Error {}
vi.mock('../src/contracts', () => ({ NotAllowlisted }));

const g8 = { get: vi.fn(), post: vi.fn(), put: vi.fn(), callGuarded: vi.fn() };
vi.mock('../src/lib/g8', () => ({ g8, unwrap: (r: any) => (r && typeof r === 'object' && 'data' in r ? r.data : r) }));

const llm = { json: vi.fn() };
vi.mock('../src/lib/llm', () => ({ llm }));

const emitted: any[] = [];
vi.mock('../src/lib/bus', () => ({ bus: { emit: (k: string, e: any) => emitted.push({ k, e }), on: vi.fn() } }));

const registered: any[] = [];
vi.mock('../src/layers', () => ({ layers: { register: (l: any) => registered.push(l), all: () => registered } }));

// store: settings + a tiny fake supabase query builder
let settings: Record<string, any> = {};
const inserts: any[] = [];
let leadPhone: string | null = '+923001112222';
let leadsByContact: Record<string, string> = {};
function qb(table: string) {
  const filters: Record<string, unknown> = {};
  const q: any = {
    select: () => q,
    eq: (k: string, v: unknown) => { filters[k] = v; return q; },
    limit: async () => {
      if (table === 'leads') { const id = leadsByContact[String(filters.g8_contact_id)]; return { data: id ? [{ id }] : [], error: null }; }
      return { data: [], error: null };
    },
    maybeSingle: async () => ({ data: table === 'lead_contacts' ? { phone: leadPhone } : null, error: null }),
    insert: async (row: any) => { inserts.push({ table, row }); return { error: null }; },
  };
  return q;
}
const store = {
  db: { from: (t: string) => qb(t) },
  settings: vi.fn(async () => settings),
  patchSettings: vi.fn(async (_id: string, p: any) => { settings = { ...settings, ...p }; return settings; }),
  agentByRole: vi.fn(async () => ({ id: 'agent-sdr', name: 'Usman', role: 'sdr' })),
};
vi.mock('../src/lib/store', () => ({ store }));

const inbound = await import('../src/inbound/handlers/voice');
const voice = await import('../src/layers/voice');

const ctx = (over: Record<string, any> = {}) => ({
  workspaceId: 'ws-1', agentId: 'agent-head', role: 'head_of_sales', task: { id: 't1' }, runId: 'r1',
  settings, log: { info() {}, warn() {}, error() {}, child() { return this; } },
  step: vi.fn(async () => {}), report: vi.fn(async () => {}), ...over,
}) as any;
const lead = { id: 'lead-1', full_name: 'Zaeem Test' } as any;
const noNumbers = { data: { available_numbers: [], booked_numbers: [] } };
const oneNumber = { data: { available_numbers: [{ phone_number: '+15550009999' }], booked_numbers: [] } };

beforeEach(() => {
  vi.clearAllMocks();
  settings = { g8_event_type_id: 1 };
  inserts.length = 0; emitted.length = 0; leadPhone = '+923001112222'; leadsByContact = {};
  envMock.layersDisabled = [];
  inbound._resetVoiceInbound();
});
afterEach(() => vi.useRealTimers());

describe('registration', () => {
  it('registers layer "voice" with onboarding, stepPlan and voice_ai inbound handlers', () => {
    const l = registered.find((x) => x.name === 'voice');
    expect(l.onboarding.name).toBe('setup_voice_agent');
    expect(Object.keys(l.inbound)).toEqual(expect.arrayContaining(['voice_ai.call_completed', 'voice_ai.call_started', 'voice_ai.voicemail_left']));
  });
});

describe('normalizeDisposition', () => {
  it('passes the 21 graph8 values through and maps aliases', () => {
    for (const d of inbound.VOICE_DISPOSITIONS) expect(inbound.normalizeDisposition(d)).toBe(d);
    expect(inbound.VOICE_DISPOSITIONS).toHaveLength(21);
    expect(inbound.normalizeDisposition('No Answer')).toBe('not_answered');
    expect(inbound.normalizeDisposition('Meeting-Booked')).toBe('booked');
    expect(inbound.normalizeDisposition({ name: 'Voicemail' })).toBe('voicemail');
    expect(inbound.normalizeDisposition('something odd')).toBe('unknown');
    expect(inbound.normalizeDisposition('')).toBeNull();
  });
});

describe('onboarding setup_voice_agent', () => {
  it('reuses the stored agent and reports the missing AI-calling number', async () => {
    settings.g8_voice_agent_id = 'agent-uuid';
    g8.get.mockImplementation(async (p: string) => p === '/voice/agent-phone-numbers' ? noNumbers : { data: { agent_id: 'agent-uuid' } });
    const r = await voice.onboarding.run(ctx());
    expect(r).toEqual({ ok: false, note: 'voice waiting for an AI-calling number' });
    expect(g8.post).not.toHaveBeenCalled();
  });

  it('creates Usman (bare-int calendar) when none stored, saves the id, ok with a number', async () => {
    g8.get.mockImplementation(async (p: string) => p === '/voice/agent-phone-numbers' ? oneNumber
      : { data: [{ file_type: 'brand_voice', content: 'We are direct.' }, { file_type: 'elevator_pitch', content: '8x helps.' }] });
    llm.json.mockResolvedValue({ persona: 'direct', description: 'SDR', pitch: 'pitch', voicemail: 'vm' });
    g8.post.mockResolvedValue({ data: { agent: { agent_id: 'new-agent' } } });
    const r = await voice.onboarding.run(ctx());
    const body = g8.post.mock.calls[0][1];
    expect(g8.post.mock.calls[0][0]).toBe('/voice/agents');
    expect(body.persona.agent_name).toBe('Usman');
    expect(body.identity.calendar).toBe(1);
    expect(body.persona.outbound_instructions).toBe('pitch');
    expect(settings.g8_voice_agent_id).toBe('new-agent');
    expect(r.ok).toBe(true);
    expect(r.note).not.toContain('5550009999');
  });

  it('never throws — graph8 failure becomes ok:false', async () => {
    g8.get.mockRejectedValue(new Error('boom'));
    g8.post.mockRejectedValue(new Error('down'));
    const r = await voice.onboarding.run(ctx());
    expect(r.ok).toBe(false);
  });
});

describe('stepPlan', () => {
  it('planned with reason when no AI-calling number', async () => {
    settings.g8_voice_agent_id = 'a1';
    g8.get.mockResolvedValue(noNumbers);
    const [s] = await voice.stepPlan(ctx(), [lead]);
    expect(s).toMatchObject({ day: 5, channel: 'phone', state: 'planned', reason: 'voice waiting for an AI-calling number' });
    expect(s.g8Step).toBeUndefined();
    expect(typeof s.fire).toBe('function');
  });
  it('live when agent + number exist', async () => {
    settings.g8_voice_agent_id = 'a1';
    g8.get.mockResolvedValue(oneNumber);
    const [s] = await voice.stepPlan(ctx(), [lead]);
    expect(s.state).toBe('live');
  });
  it('planned when no agent', async () => {
    const [s] = await voice.stepPlan(ctx(), [lead]);
    expect(s).toMatchObject({ state: 'planned', reason: 'no voice agent yet' });
  });
});

describe('fire', () => {
  it('places a guarded call with the lead phone and records call_placed', async () => {
    settings.g8_voice_agent_id = 'a1';
    g8.get.mockResolvedValue(oneNumber);
    g8.callGuarded.mockResolvedValue({ data: { status: 'dispatched', message: 'ok', room_name: 'room-1' } });
    await voice.fireCall({ workspaceId: 'ws-1', lead, g8ContactId: 4, sequenceId: 9 });
    expect(g8.callGuarded).toHaveBeenCalledWith(expect.objectContaining({
      to_phone: '+923001112222', from_phone: '+15550009999', agent_id: 'a1', event_id: 1, contact_id: '4',
      callback_url: 'https://graphi.test/webhooks/graph8',
    }));
    const ev = inserts.find((i) => i.table === 'lead_events')!.row;
    expect(ev).toMatchObject({ type: 'call_placed', channel: 'phone', lead_id: 'lead-1' });
    expect(ev.data.room_name).toBe('room-1');
    expect(ev.summary).not.toMatch(/\d{6,}/);
    expect(inbound._pending().has('room-1')).toBe(true);
  });

  it('allowlist block → call_placed blocked row, no throw', async () => {
    settings.g8_voice_agent_id = 'a1';
    g8.get.mockResolvedValue(oneNumber);
    g8.callGuarded.mockRejectedValue(new NotAllowlisted('nope'));
    await expect(voice.fireCall({ workspaceId: 'ws-1', lead, g8ContactId: 99, sequenceId: 9 })).resolves.toBeUndefined();
    expect(inserts[0].row.data.status).toBe('blocked');
  });

  it('no AI number → skipped row, no call', async () => {
    settings.g8_voice_agent_id = 'a1';
    g8.get.mockResolvedValue(noNumbers);
    await voice.fireCall({ workspaceId: 'ws-1', lead, g8ContactId: 4, sequenceId: 9 });
    expect(g8.callGuarded).not.toHaveBeenCalled();
    expect(inserts[0].row.data.reason).toBe('no_ai_number');
  });

  it('kill switch LAYERS_DISABLED=voice → nothing', async () => {
    envMock.layersDisabled = ['voice'];
    await voice.fireCall({ workspaceId: 'ws-1', lead, g8ContactId: 4, sequenceId: 9 });
    expect(g8.callGuarded).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });
});

describe('inbound', () => {
  const ev = (type: string, payload: any) => ({ type, payload, inboundEventId: 7, workspaceId: 'ws-1' });

  it('call_completed → artifacts, normalized disposition, lead_event + voice.outcome (no PII)', async () => {
    inbound.trackCall({ workspaceId: 'ws-1', leadId: 'lead-1', g8ContactId: '4', roomName: 'room-1' });
    g8.get.mockResolvedValue({ data: { summary: 'Prospect agreed to Tuesday; call +923001112222 back', duration: 64 } });
    await inbound.voiceInbound['voice_ai.call_completed'](ev('voice_ai.call_completed', { event: 'voice_ai.call_completed', data: { room_name: 'room-1', disposition: 'Meeting Booked' } }));
    expect(g8.get).toHaveBeenCalledWith('/voice/calls/room-1/artifacts');
    const out = emitted.find((x) => x.e.type === 'voice.outcome')!.e;
    expect(out.payload).toMatchObject({ lead_id: 'lead-1', disposition: 'booked' });
    expect(out.payload.summary).not.toContain('923001112222');
    const row = inserts.find((i) => i.table === 'lead_events')!.row;
    expect(row).toMatchObject({ type: 'call_completed', channel: 'phone' });
    expect(row.data.duration_s).toBe(64);
    expect(inbound._pending().size).toBe(0);
  });

  it('resolves untracked calls by contact_id and emits once', async () => {
    leadsByContact['4'] = 'lead-9';
    g8.get.mockRejectedValue(new Error('404'));
    const h = inbound.voiceInbound['voice_ai.call_completed'];
    const p = { data: { room_name: 'r9', contact_id: 4, disposition: 'not_answered' } };
    await h(ev('voice_ai.call_completed', p));
    await h(ev('voice_ai.call_completed', p));
    const outs = emitted.filter((x) => x.e.type === 'voice.outcome');
    expect(outs).toHaveLength(1);
    expect(outs[0].e.payload).toMatchObject({ lead_id: 'lead-9', disposition: 'not_answered' });
  });

  it('no outcome within 3 min → "call ended, no outcome"', async () => {
    vi.useFakeTimers();
    g8.get.mockRejectedValue(new Error('not ready'));
    inbound.trackCall({ workspaceId: 'ws-1', leadId: 'lead-1', g8ContactId: '4', roomName: 'room-t' });
    await vi.advanceTimersByTimeAsync(inbound.OUTCOME_TIMEOUT_MS + 50);
    const out = emitted.find((x) => x.e.type === 'voice.outcome')!.e;
    expect(out.payload).toEqual({ lead_id: 'lead-1', disposition: 'no_outcome', summary: 'call ended, no outcome' });
  });

  it('voicemail_left on tracked call hints the timeout outcome', async () => {
    vi.useFakeTimers();
    g8.get.mockRejectedValue(new Error('not ready'));
    inbound.trackCall({ workspaceId: 'ws-1', leadId: 'lead-1', g8ContactId: '4', roomName: 'room-v' });
    await inbound.voiceInbound['voice_ai.voicemail_left'](ev('voice_ai.voicemail_left', { data: { room_name: 'room-v' } }));
    expect(inserts.find((i) => i.row.type === 'voicemail_left')).toBeTruthy();
    expect(emitted).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(inbound.OUTCOME_TIMEOUT_MS + 50);
    expect(emitted[0].e.payload.disposition).toBe('voicemail');
  });

  it('unknown-typed callback body without voice fields is ignored', async () => {
    await inbound.voiceInbound.unknown(ev('unknown', { foo: 1 }));
    expect(emitted).toHaveLength(0);
  });
});
