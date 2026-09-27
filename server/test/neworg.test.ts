import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/g8', () => ({ g8: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() } }));

import { g8 } from '../src/lib/g8';
import { htmlToText, isPublicHost, readSite } from '../src/lib/site';
import { docsAreAbout, ensureMeetingType, ensurePipeline, ensureSchedule, isAlwaysOn, orgWebsiteDomain, rootDomain, sameCompanyDomain } from '../src/agents/ayesha/org';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function routes(map: Record<string, any>) {
  vi.mocked(g8.get).mockImplementation(async (p: string) => { if (p in map) return map[p]; throw new Error(`unexpected GET ${p}`); });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('site', () => {
  it('strips scripts/styles/tags, keeps title + description, dedupes lines', () => {
    const html = `<html><head><title>Linear &amp; you</title><meta name="description" content="Plan &amp; build products"><style>.x{}</style></head>
      <body><script>var a=1</script><nav>Home</nav><h1>Linear is a purpose-built tool</h1><p>For modern product teams</p><footer>Home</footer></body></html>`;
    const t = htmlToText(html);
    expect(t.title).toBe('Linear & you');
    expect(t.description).toBe('Plan & build products');
    expect(t.text).toContain('Linear is a purpose-built tool');
    expect(t.text).not.toContain('var a');
    expect(t.text.match(/Home/g)?.length).toBe(1);
  });

  it('refuses non-public hosts', () => {
    expect(isPublicHost('linear.app')).toBe(true);
    expect(isPublicHost('localhost')).toBe(false);
    expect(isPublicHost('127.0.0.1')).toBe(false);
    expect(isPublicHost('db.internal')).toBe(false);
  });

  it('reads homepage + first distinct about page, caps length', async () => {
    const f = vi.fn(async (url: any) => {
      const u = String(url);
      const body = u.endsWith('/about') ? '<p>About us: founded 2019</p>' : u.endsWith('/about-us') || u.endsWith('/company') ? '' : `<title>Acme</title><p>${'Acme sells rockets. '.repeat(2000)}</p>`;
      return new Response(body, { status: body ? 200 : 404, headers: { 'content-type': 'text/html' } });
    });
    const s = await readSite('https://www.acme.io/pricing'.replace('https://www.', ''), { fetch: f as any, maxChars: 3000 });
    expect(s.pages.map((p) => p.url)).toEqual(['https://acme.io', 'https://acme.io/about']);
    expect(s.text.length).toBeLessThanOrEqual(3000);
    expect(s.text).toContain('About us: founded 2019');
  });

  it('never throws: network errors → empty text', async () => {
    const s = await readSite('acme.io', { fetch: (async () => { throw new Error('ENOTFOUND'); }) as any });
    expect(s.text).toBe('');
  });
});

describe('domain identity', () => {
  it('compares registrable domains', () => {
    expect(rootDomain('app.linear.app')).toBe('linear.app');
    expect(rootDomain('shop.example.co.uk')).toBe('example.co.uk');
    expect(sameCompanyDomain('www.8x.social', 'https://8x.social/about')).toBe(true);
    expect(sameCompanyDomain('linear.app', '8x.social')).toBe(false);
  });
  it('docsAreAbout: org domain wins; else docs must mention the company', () => {
    expect(docsAreAbout('linear.app', '8x.social', 'Linear is great')).toBe(false);
    expect(docsAreAbout('8x.social', '8x.social', '')).toBe(true);
    expect(docsAreAbout('linear.app', null, '8x Social helps brands with UGC')).toBe(false);
    expect(docsAreAbout('linear.app', null, 'Linear helps product teams ship')).toBe(true);
  });
  it('orgWebsiteDomain: primary website, else org-domain, else null', async () => {
    routes({ '/intelligence/primary-website': { data: { primary_website_url: 'https://8x.social' } } });
    expect(await orgWebsiteDomain()).toBe('8x.social');
    routes({ '/intelligence/primary-website': { data: { primary_website_url: null } }, '/intelligence/org-domain': { data: { company_domain: null } } });
    expect(await orgWebsiteDomain()).toBeNull();
  });
});

describe('ensure* on a fresh org', () => {
  it('schedule: reuses an always-on schedule (list shape), else creates Graphi 24/7', async () => {
    const always = { id: 's1', name: 'Demo 24/7', windows: DAYS.map((day) => ({ day, start: '00:00', end: '23:59' })) };
    const office = { id: 'default-business-hours', name: 'Business Hours', windows: DAYS.slice(0, 5).map((day) => ({ day, start: '09:00', end: '17:00' })) };
    expect(isAlwaysOn(always)).toBe(true);
    expect(isAlwaysOn(office)).toBe(false);
    routes({ '/schedules': { data: [office, always] } });
    expect(await ensureSchedule()).toEqual({ id: 's1', name: 'Demo 24/7', created: false });
    routes({ '/schedules': { data: [office] } });
    vi.mocked(g8.post).mockResolvedValue({ data: { id: 'new-s', name: 'Graphi 24/7' } });
    expect(await ensureSchedule('Asia/Karachi')).toEqual({ id: 'new-s', name: 'Graphi 24/7', created: true });
    const [path, body] = vi.mocked(g8.post).mock.calls[0] as [string, any];
    expect(path).toBe('/schedules');
    expect(body.timezone).toBe('Asia/Karachi');
    expect(Object.keys(body.config)).toEqual(DAYS);
    expect(body.config.sunday).toEqual({ start: '00:00', end: '23:59' });
  });

  it('pipeline: none → POST /pipelines (graph8 seeds New Meeting)', async () => {
    routes({ '/deals/pipelines': { data: [] } });
    vi.mocked(g8.post).mockResolvedValue({ data: { id: 'p1', name: 'Sales Pipeline', stages: [{ id: 'nm', name: 'New Meeting', stage_type: 'open' }] } });
    expect(await ensurePipeline()).toEqual({ pipelineId: 'p1', name: 'Sales Pipeline', stageId: 'nm', created: ['pipeline'] });
    expect(g8.post).toHaveBeenCalledWith('/pipelines', { name: 'Sales Pipeline' });
  });

  it('pipeline: existing without New Meeting → adds the stage; stage create fails → first open stage', async () => {
    routes({ '/deals/pipelines': { data: [{ id: 'p9', name: 'Revenue', is_default: true, stages: [{ id: 'a', name: 'Lead', stage_type: 'open' }] }] } });
    vi.mocked(g8.post).mockResolvedValueOnce({ data: { id: 'nm2', name: 'New Meeting' } });
    expect(await ensurePipeline()).toMatchObject({ pipelineId: 'p9', stageId: 'nm2', created: ['stage'] });
    expect(g8.post).toHaveBeenCalledWith('/pipelines/p9/stages', { name: 'New Meeting', probability: 10, stage_type: 'open' });
    vi.mocked(g8.post).mockRejectedValueOnce(new Error('403'));
    expect(await ensurePipeline()).toMatchObject({ stageId: 'a', created: [] });
  });

  it('meeting type: reuse Discovery; none + calendar → create 30-min; none + no calendar → null (connect card)', async () => {
    routes({ '/event-types': { data: [{ id: 7, title: 'Discovery call', slug: 'discovery-call', length: 30 }] }, '/appointments/calendars': [] });
    expect(await ensureMeetingType()).toMatchObject({ id: 7, created: false, calendar: false });

    routes({ '/event-types': { data: [] }, '/appointments/calendars': [{ credential_id: 1, is_valid: true }] });
    vi.mocked(g8.post).mockResolvedValue({ data: { id: 12, title: 'Discovery call', slug: 'discovery-call' } });
    expect(await ensureMeetingType()).toMatchObject({ id: 12, created: true, calendar: true });
    expect(vi.mocked(g8.post).mock.calls[0][1]).toMatchObject({ title: 'Discovery call', slug: 'discovery-call', length: 30 });

    vi.mocked(g8.post).mockClear();
    routes({ '/event-types': { data: [] }, '/appointments/calendars': [] });
    expect(await ensureMeetingType()).toMatchObject({ id: null, calendar: false });
    expect(g8.post).not.toHaveBeenCalled();
  });
});

describe('switch-org env edit', () => {
  it('swaps G8_API_KEY, disables old-org ids, keeps everything else', async () => {
    const { editEnvText } = await import('../../scripts/lib/envfile');
    const before = ['# graph8', 'G8_API_KEY=old', 'G8_DEMO_SCHEDULE_ID=e5583e4d', 'export G8_WEBHOOK_SECRET=whsec', 'GEMINI_MODEL=x', 'NEW_G8_API_KEY=new'].join('\n');
    const after = editEnvText(before, { G8_API_KEY: 'new' }, ['G8_DEMO_SCHEDULE_ID', 'G8_WEBHOOK_SECRET']).split('\n');
    expect(after).toContain('G8_API_KEY=new');
    expect(after).not.toContain('G8_API_KEY=old');
    expect(after.find((l) => l.includes('G8_DEMO_SCHEDULE_ID'))).toMatch(/^# /);
    expect(after.find((l) => l.includes('G8_WEBHOOK_SECRET'))).toMatch(/^# /);
    expect(after).toContain('GEMINI_MODEL=x');
    expect(editEnvText('A=1', { G8_API_KEY: 'k' }, [])).toBe('A=1\nG8_API_KEY=k');
  });
});
