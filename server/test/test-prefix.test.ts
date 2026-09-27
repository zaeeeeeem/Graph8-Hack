import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/env', () => ({ env: { WORKSPACE_ID: 'ws', GEMINI_MODEL: 'm', layersDisabled: [] } }));
vi.mock('../src/lib/store', () => ({ store: { db: {} }, must: (r: any) => r.data, runScope: { run: (_s: any, f: any) => f() }, BudgetExceeded: class {} }));

const { withTestPrefix } = await import('../src/agents/runtime');

function fakePort() {
  const posts: any[] = [];
  const port: any = {
    postAs: async (_r: string, _c: string, msg: any) => { posts.push(msg); return { ts: '1', channel: 'C' }; },
    update: async (_c: string, _t: string, msg: any) => { posts.push(msg); },
    dm: async (_u: string, msg: any) => { posts.push(msg); },
    agentThread: async (_r: string, title: string) => { posts.push({ text: title }); return { ts: '1', channel: 'C' }; },
    approvalCard: async (_r: string, a: any) => { posts.push({ text: a.title }); return { ts: '1', channel: 'C' }; },
    checklist: async (_r: string, _c: string, title: string) => { posts.push({ text: title }); return { ts: '1', channel: 'C', title: async (t: string) => { posts.push({ text: t }); }, set: async () => {}, add: async () => {} }; },
    permalink: async () => '', start: async () => {},
  };
  return { port, posts };
}

describe('[test] prefix wrapper', () => {
  it('prefixes text/titles and adds a marker block on the test workspace, once', async () => {
    const { port, posts } = fakePort();
    withTestPrefix(port, async () => true);
    withTestPrefix(port, async () => true); // idempotent
    await port.postAs('scout', 'team', { text: 'Found 10', blocks: [{ type: 'section' }] });
    await port.agentThread('scout', 'T-1 · Find');
    await port.approvalCard('sdr', { approvalId: 'a', title: 'Launch', blocks: [] });
    const c = await port.checklist('head_of_sales', 'hq', 'Hiring', []);
    await c.title('Hired');
    await port.postAs('scout', 'team', { text: '[test] already' });
    expect(posts.map((p) => p.text)).toEqual(['[test] Found 10', '[test] T-1 · Find', '[test] Launch', '[test] Hiring', '[test] Hired', '[test] already']);
    expect(posts[0].blocks[0].block_id).toBe('graphi_test_marker');
    expect(posts[0].blocks).toHaveLength(2);
  });

  it('leaves demo workspace posts untouched', async () => {
    const { port, posts } = fakePort();
    withTestPrefix(port, async () => false);
    await port.postAs('scout', 'team', { text: 'Found 10', blocks: [{ type: 'section' }] });
    expect(posts[0].text).toBe('Found 10');
    expect(posts[0].blocks).toHaveLength(1);
  });
});
