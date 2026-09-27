import { describe, expect, it, vi } from 'vitest';

// Hermetic: env mocked; graph8 must never be called by the guard.
const h = vi.hoisted(() => ({ send: 'zaeem', connected: 'zaeem' }));
vi.mock('../src/lib/env', () => ({
  env: {
    layersDisabled: [],
    allowlist: [
      { name: 'Zaeem', email: 'z@test.dev', linkedin: 'https://www.linkedin.com/in/zaeem-test' },
      { name: 'Abbas', email: 'a@test.dev', linkedin: 'https://www.linkedin.com/in/abbas-test' },
      { name: 'NoLi', email: 'n@test.dev' },
    ],
  },
  linkedinNames: {
    send: () => h.send.split(',').filter(Boolean),
    connected: () => h.connected.split(',').filter(Boolean),
  },
}));
vi.mock('../src/lib/log', () => { const l: any = { info() {}, warn() {}, error() {}, child: () => l }; return { log: l }; });
vi.mock('../src/lib/g8', () => ({
  unwrap: (r: any) => r,
  g8: { get: vi.fn(async () => { throw new Error('guard must not call graph8'); }), post: vi.fn(async () => { throw new Error('guard must not call graph8'); }) },
}));

import { NotAllowlisted } from '../src/contracts';
import { assertSendable, liveSendsOn, sendLinkedin, sendTargetFor, workflowConfig } from '../src/lib/linkedin-send';
import { linkedinLiveLine } from '../src/slack/cards/launch';

describe('linkedin-send guard', () => {
  it('only send-enabled allowlisted profiles pass; URL comes from the allowlist', () => {
    expect(liveSendsOn()).toBe(true);
    const t = sendTargetFor({ linkedin: 'linkedin.com/in/zaeem-test/' });
    expect(t).toMatchObject({ name: 'Zaeem', url: 'https://www.linkedin.com/in/zaeem-test', connected: true });
    expect(sendTargetFor({ email: 'Z@test.dev' })?.name).toBe('Zaeem');
    // Allowlisted but not in LINKEDIN_SEND_NAMES
    expect(sendTargetFor({ linkedin: 'https://www.linkedin.com/in/abbas-test' })).toBeUndefined();
    expect(() => assertSendable('https://www.linkedin.com/in/abbas-test')).toThrow(NotAllowlisted);
    expect(() => assertSendable('https://www.linkedin.com/in/real-prospect')).toThrow(NotAllowlisted);
    expect(() => assertSendable('')).toThrow(NotAllowlisted);
  });

  it('sendLinkedin refuses a non-allowlisted URL before any network call', async () => {
    await expect(sendLinkedin({ kind: 'message', url: 'https://www.linkedin.com/in/real-prospect', text: 'hi' })).rejects.toBeInstanceOf(NotAllowlisted);
  });

  it('empty LINKEDIN_SEND_NAMES = no live sends', () => {
    h.send = '';
    expect(liveSendsOn()).toBe(false);
    expect(sendTargetFor({ linkedin: 'https://www.linkedin.com/in/zaeem-test' })).toBeUndefined();
    h.send = 'zaeem';
  });

  it('workflow uses tool_call trigger inputs and the verbatim sender id', () => {
    const c: any = workflowConfig('connect', '1');
    expect(c.nodes[0].config.trigger_type).toBe('tool_call');
    expect(c.start_node_id).toBe(c.nodes[0].node_id);
    expect(c.nodes[0].connections).toEqual([c.nodes[1].node_id]);
    expect(c.nodes[1]).toMatchObject({ node_type: 'send_netrion_connection_request', config: { sender_account_id: '1', connection_message: '${trigger.text}', linkedin_url: '${trigger.linkedin_url}' } });
    expect((workflowConfig('message', '1') as any).nodes[1].config.message).toBe('${trigger.text}');
  });
});

describe('launch card LinkedIn banner', () => {
  it('shows a live line only when LinkedIn steps are live', () => {
    const reason = "live via graph8 (Moazam's seat, paced) — test contacts only";
    expect(linkedinLiveLine([
      { n: 2, day: 1, channel: 'linkedin', action: 'connection_request', mode: 'fire', reason },
      { n: 4, day: 6, channel: 'linkedin', action: 'message', mode: 'fire', reason },
    ])).toBe(`💼 LinkedIn D1/D6 ${reason}`);
    expect(linkedinLiveLine([{ n: 2, day: 1, channel: 'linkedin', action: 'connection_request', mode: 'planned' }])).toBeUndefined();
  });
});
