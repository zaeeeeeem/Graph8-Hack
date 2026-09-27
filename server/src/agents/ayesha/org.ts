/**
 * W13 — make onboarding work on ANY graph8 org (a fresh/empty account, or one whose docs are about another company).
 * Every org-specific id is discovered here, or created when missing, and stored in workspaces.settings by onboarding.
 * Shapes verified live on the hackathon org 27 Sep (create + cleanup):
 *   GET  /schedules → [{id, name, timezone, windows:[{day,start,end}]}]           (POST returns `config` instead)
 *   POST /schedules {name, timezone, config:{monday:{start,end},…}}              → {id,…}; archive = PATCH /schedules/{id}/archive {is_archived:true}
 *   GET  /deals/pipelines → [{id, name, is_default, stages:[{id,name,stage_type}]}]
 *   POST /pipelines {name} → new pipeline auto-seeded with "New Meeting", "Discovery Held", …; DELETE /pipelines/{id}
 *   POST /pipelines/{id}/stages {name, probability, stage_type:'open'} → {id,…}
 *   GET  /event-types → [{id, title, slug, length}]; POST /appointments/event-types {title, slug, length} → {id,…}
 *   GET  /appointments/calendars → [{credential_id, provider, is_valid, …}] (bare array)
 *   GET  /intelligence/primary-website → {primary_website_url}; GET /intelligence/org-domain → {company_domain|null}
 *   GET  /org/settings → {org_id, org_name, metadata.org_slug}
 */
import { g8 } from '../../lib/g8';
import { normDomain, unwrap, withTimeout } from './util';

const T = 20_000;
const get = <R = any>(path: string, what = path) => withTimeout(g8.get(path), T, what).then((r) => unwrap<R>(r));
const post = <R = any>(path: string, body: unknown, what = path) => withTimeout(g8.post(path, body), T, what).then((r) => unwrap<R>(r));

// ---------------------------------------------------------------------------
// Domain identity — is graph8's company brain about the domain we were asked to sell for?
// ---------------------------------------------------------------------------
const SECOND_LEVEL = /^(co|com|net|org|gov|ac|edu)\.[a-z]{2}$/;

/** "app.linear.app" → "linear.app", "shop.example.co.uk" → "example.co.uk". */
export function rootDomain(d: string): string {
  const parts = normDomain(d).split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return SECOND_LEVEL.test(last2) ? parts.slice(-3).join('.') : last2;
}

export const sameCompanyDomain = (a?: string | null, b?: string | null): boolean => !!a && !!b && rootDomain(a) === rootDomain(b);

/** The org's own website per graph8 (primary website, else org-domain). null when graph8 doesn't know it. */
export async function orgWebsiteDomain(): Promise<string | null> {
  try {
    const p = await get<{ primary_website_url?: string | null }>('/intelligence/primary-website');
    if (p?.primary_website_url) return rootDomain(p.primary_website_url);
  } catch { /* try org-domain */ }
  try {
    const o = await get<{ company_domain?: string | null }>('/intelligence/org-domain');
    if (o?.company_domain) return rootDomain(o.company_domain);
  } catch { /* unknown */ }
  return null;
}

/**
 * Do graph8's global-context docs describe `domain`? With a known org domain it's a domain compare; without one the
 * docs must at least mention the domain (or its name stem) — otherwise they're treated as another company's docs.
 */
export function docsAreAbout(domain: string, orgDomain: string | null, docsText: string): boolean {
  if (orgDomain) return sameCompanyDomain(domain, orgDomain);
  const root = rootDomain(domain);
  const stem = root.split('.')[0] ?? '';
  const t = docsText.toLowerCase();
  if (t.includes(root)) return true;
  return stem.length >= 4 && new RegExp(`\\b${stem.replace(/[^a-z0-9]/g, '')}\\b`, 'i').test(t);
}

// ---------------------------------------------------------------------------
// Sending schedule — 24/7 so demo_time_scale steps (1 day = 1 min) are never held for business hours.
// ---------------------------------------------------------------------------
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export const SCHEDULE_NAME = 'Graphi 24/7';

type Window = { day?: string; start?: string; end?: string };
/** All 7 days open 00:00 → ≥ 23:59. Accepts the list shape (`windows[]`) and the create shape (`config{}`). */
export function isAlwaysOn(s: { windows?: Window[]; config?: Record<string, Window | null> }): boolean {
  const byDay = new Map<string, Window>();
  for (const w of s.windows ?? []) if (w?.day) byDay.set(w.day, w);
  for (const [d, w] of Object.entries(s.config ?? {})) if (w) byDay.set(d, w);
  return DAYS.every((d) => { const w = byDay.get(d); return !!w && w.start === '00:00' && (w.end ?? '') >= '23:59'; });
}

export async function ensureSchedule(timezone = 'UTC'): Promise<{ id: string; name: string; created: boolean }> {
  const list = (await get<any[]>('/schedules')) ?? [];
  const live = (Array.isArray(list) ? list : []).filter((s) => !s.is_archived);
  const hit = live.find(isAlwaysOn);
  if (hit) return { id: String(hit.id), name: String(hit.name), created: false };
  const config = Object.fromEntries(DAYS.map((d) => [d, { start: '00:00', end: '23:59' }]));
  const s = await post<{ id: string; name: string }>('/schedules', { name: SCHEDULE_NAME, description: 'Always-on sending window for Graphi', timezone, config });
  if (!s?.id) throw new Error('graph8 did not return a schedule id');
  return { id: String(s.id), name: String(s.name ?? SCHEDULE_NAME), created: true };
}

// ---------------------------------------------------------------------------
// Deal pipeline + "New Meeting" stage
// ---------------------------------------------------------------------------
export const PIPELINE_NAME = 'Sales Pipeline';
export const MEETING_STAGE = 'New Meeting';

const isMeetingStage = (s: any) => String(s?.name ?? '').trim().toLowerCase() === MEETING_STAGE.toLowerCase();

export async function ensurePipeline(): Promise<{ pipelineId: string; name: string; stageId: string; created: string[] }> {
  const created: string[] = [];
  const pipes = ((await get<any[]>('/deals/pipelines')) ?? []) as any[];
  let pick = pipes.find((p) => p.name === PIPELINE_NAME) ?? pipes.find((p) => p.is_default) ?? pipes[0];
  if (!pick) {
    pick = await post<any>('/pipelines', { name: PIPELINE_NAME }); // graph8 seeds default stages incl. "New Meeting"
    if (!pick?.id) throw new Error('graph8 did not return a pipeline id');
    created.push('pipeline');
  }
  let stage = (pick.stages ?? []).find(isMeetingStage);
  if (!stage) {
    try {
      stage = await post<any>(`/pipelines/${pick.id}/stages`, { name: MEETING_STAGE, probability: 10, stage_type: 'open' });
      if (stage?.id) created.push('stage');
    } catch { /* fall back to the first open stage */ }
  }
  if (!stage?.id) stage = (pick.stages ?? []).find((s: any) => (s.stage_type ?? 'open') === 'open') ?? (pick.stages ?? [])[0];
  if (!stage?.id) throw new Error(`pipeline "${pick.name}" has no stages`);
  return { pipelineId: String(pick.id), name: String(pick.name ?? PIPELINE_NAME), stageId: String(stage.id), created };
}

// ---------------------------------------------------------------------------
// Meeting type — 30-min "Discovery call"; creating one only makes sense with a connected calendar.
// ---------------------------------------------------------------------------
export const MEETING_TITLE = 'Discovery call';

export async function calendarConnected(): Promise<boolean> {
  const cals = (await get<any[]>('/appointments/calendars')) ?? [];
  return (Array.isArray(cals) ? cals : []).some((c) => c && c.is_valid !== false && !c.invalid);
}

export interface MeetingTypeResult { id: number | null; title: string; slug: string; created: boolean; calendar: boolean }

export async function ensureMeetingType(): Promise<MeetingTypeResult> {
  const [types, calendar] = await Promise.all([get<any[]>('/event-types').catch(() => [] as any[]), calendarConnected().catch(() => false)]);
  const list = Array.isArray(types) ? types : [];
  const hit = list.find((e) => /discovery/i.test(String(e.title ?? ''))) ?? list.find((e) => Number(e.length) === 30) ?? list[0];
  if (hit) return { id: Number(hit.id), title: String(hit.title), slug: String(hit.slug ?? slugify(String(hit.title))), created: false, calendar };
  if (!calendar) return { id: null, title: MEETING_TITLE, slug: 'discovery-call', created: false, calendar };
  const ev = await post<any>('/appointments/event-types', { title: MEETING_TITLE, slug: 'discovery-call', length: 30, description: 'Intro call booked by Graphi.' });
  if (!ev?.id) throw new Error('graph8 did not return an event type id');
  return { id: Number(ev.id), title: String(ev.title ?? MEETING_TITLE), slug: String(ev.slug ?? 'discovery-call'), created: true, calendar };
}

export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------------------
// Org identity (switch-org + readiness report)
// ---------------------------------------------------------------------------
export async function orgInfo(): Promise<{ orgId: string | null; name: string | null; slug: string | null }> {
  const o = (await get<any>('/org/settings')) ?? {};
  const name = o.org_name ? String(o.org_name) : null;
  const slug = String(o.metadata?.org_slug ?? o.org_slug ?? '') || (name ? slugify(name) : '');
  return { orgId: o.org_id ? String(o.org_id) : null, name, slug: slug || null };
}
