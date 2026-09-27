/**
 * Live run of Ayesha's playbooks on the TEST workspace: real runtime + Supabase + graph8 (free GETs) + Gemini.
 * Slack is replaced by a capturing fake so nothing is posted. Skipped unless AYESHA_LIVE=1.
 *   AYESHA_LIVE=1 npx vitest run test/ayesha.live.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

const posts: Array<{ role: string; channel: string; text: string; threadTs?: string }> = [];
const checklist: string[] = [];
vi.mock('../src/lib/slack', () => ({
  slack: {
    postAs: async (role: string, channel: string, msg: any) => { posts.push({ role, channel, text: msg.text, threadTs: msg.threadTs }); return { ts: `${Date.now()}.${posts.length}`, channel: channel === 'hq' ? 'C_HQ' : channel }; },
    update: async () => undefined,
    checklist: async (_r: string, _c: string, title: string) => {
      checklist.push(`# ${title}`);
      return { ts: 'cl', channel: 'C_HQ', set: async (k: string, s: string, n?: string) => { checklist.push(`${k} ${s}${n ? ` · ${n}` : ''}`); }, add: async (i: any) => { checklist.push(`${i.key} ${i.state}`); }, title: async (t: string) => { checklist.push(`# ${t}`); } };
    },
    agentThread: async () => ({ ts: 'th', channel: 'C_TEAM' }), approvalCard: async () => ({ ts: 'ap', channel: 'C_HQ' }),
    dm: async () => undefined, permalink: async () => '', start: async () => undefined,
  },
}));

const live = process.env.AYESHA_LIVE === '1';

describe.skipIf(!live)('ayesha live (TEST workspace, Slack faked)', () => {
  it('onboard → chat → standup', async () => {
    const { env } = await import('../src/lib/env');
    const { store } = await import('../src/lib/store');
    const { runtime } = await import('../src/agents/runtime');
    const { ayesha } = await import('../src/agents/ayesha');
    runtime.register(ayesha);
    const ws = env.WORKSPACE_ID;
    expect((await store.workspace(ws)).is_demo).toBe(false);

    const waitDone = async (id: string, ms = 120_000) => {
      const end = Date.now() + ms;
      for (;;) {
        const { data } = await store.db.from('tasks').select('status,result_summary,number').eq('id', id).single();
        if (['done', 'failed', 'cancelled', 'blocked'].includes(data.status)) return data;
        if (Date.now() > end) throw new Error(`timeout T-${data.number} ${data.status}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    const sctx = { workspaceId: ws, userId: 'U_TEST', channel: 'C_HQ' };

    const t0 = Date.now();
    const onboard = await runtime.enqueue(ws, 'head_of_sales', 'onboard', 'Hire sales team for 8x.social', { domain: '8x.social', force: true }, { slack: sctx });
    const r1 = await waitDone(onboard.id);
    console.log(`ONBOARD ${Date.now() - t0}ms`, r1, '\n' + checklist.join('\n'));
    expect(r1.status).toBe('done');
    const s = await store.settings(ws);
    console.log('SETTINGS', JSON.stringify({ ...s, g8_mailbox_email: s.g8_mailbox_email ? '<set>' : null }));
    expect(s.g8_pipeline_id).toBe('b7fef03e-06d9-440c-bd12-367e6eaf08de');
    expect(s.g8_event_type_id).toBe(1);
    expect(s.g8_booking_url).toBe('https://app.graph8.com/appointments/team/hackathon-zaeemulhassanyt/discovery-call/1');

    for (const text of ["how's the pipeline looking?", 'what is the weather in Lahore?', 'can you run facebook ads for us?', 'from now on find 12 leads a day']) {
      const t = await runtime.enqueue(ws, 'head_of_sales', 'answer_question', `Chat: ${text}`, { text, kind: 'dm', channel: 'D_TEST', threadTs: 'm1' }, { slack: sctx });
      const r = await waitDone(t.id);
      console.log(`CHAT "${text}" → ${r.status}: ${posts[posts.length - 1]?.text}`);
      expect(r.status).toBe('done');
    }
    expect((await store.settings(ws)).daily_find).toBe(12);

    const st = await runtime.enqueue(ws, 'head_of_sales', 'standup', 'Standup', { trigger: 'command' }, { slack: sctx });
    const r3 = await waitDone(st.id);
    console.log('STANDUP', r3.status, posts.filter((p) => p.channel !== 'D_TEST').slice(-6).map((p) => `${p.role}: ${p.text}`).join('\n'));
    expect(r3.status).toBe('done');

    // PII check across everything "posted"
    expect(JSON.stringify(posts)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);

    // Leave the shared TEST workspace as found: status back to onboarding, daily_find 10, connect card resolved.
    await store.patchSettings(ws, { daily_find: 10 });
    await store.db.from('workspaces').update({ status: 'onboarding' }).eq('id', ws);
    await store.db.from('approvals').update({ status: 'cancelled' }).eq('workspace_id', ws).eq('kind', 'connect_account').eq('status', 'pending');
  }, 300_000);
});
