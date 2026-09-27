/**
 * Chat tool registry (docs/CHAT-BANK.md "Tools to build"). Every agent's chat loop (chat/agent-chat.ts) gets a subset
 * by role. Tools return SMALL JSON facts — never an email address or phone number (privacy: has_email/has_phone flags
 * and an Open-in-graph8 link instead). Write tools reuse the existing playbooks (runtime.enqueue → the agent's normal
 * checklist; Edit flow for copy/reply changes) and honour ctx.readOnly (replay script: report what would happen).
 */
import { z } from 'zod';
import type { RunCtx, SlackCtx, Block } from '../contracts';
import type { AgentRole, JsonObject, TaskKind, UUID } from '../../../shared/types';
import { runtime } from '../agents/runtime';
import { store } from '../lib/store';
import { gatherStatus } from '../agents/ayesha/standup';
import { setPaused, settingsPatch, type Intent } from '../agents/ayesha/chat';
import { editApproval, pendingApproval } from '../agents/ayesha/crew';
import { scrubPii } from '../agents/ayesha/util';
import { G8_LINKS } from '../agents/ayesha/kit';
import { g8ContactUrl } from '../agents/bilal/util';
import type { ExplicitFilters } from '../agents/bilal/filters';

export const G8_APP = 'https://app.graph8.com';
export const ROLE_NAME: Record<AgentRole, string> = { head_of_sales: 'Ayesha', scout: 'Bilal', researcher: 'Hira', sdr: 'Usman', closer: 'Zara' };
const NAME_ROLE: Record<string, AgentRole> = { ayesha: 'head_of_sales', bilal: 'scout', hira: 'researcher', usman: 'sdr', zara: 'closer' };
export const WORKERS = ['scout', 'researcher', 'sdr', 'closer'] as const;
type Worker = (typeof WORKERS)[number];

export interface ToolCtx {
  workspaceId: UUID;
  /** The agent whose chat loop is calling. */
  role: AgentRole;
  agentId: UUID;
  /** Founder's Slack message (threads new tasks under it). */
  slack?: SlackCtx;
  /** Ayesha's answer_question run (so delegated work wakes her with the result). */
  run?: RunCtx;
  /** Replay/test: write tools describe what they would do and change nothing. */
  readOnly?: boolean;
  /** ask_agent nesting depth (agents can't ask back and forth forever). */
  depth: number;
  /** Injected by agent-chat (avoids an import cycle): run another agent's chat loop and return its answer. */
  askAgent?: (role: AgentRole, question: string) => Promise<string>;
  /** Blocks the final Slack answer should carry (lead cards, lists). */
  blocks: Block[];
}

export interface ChatTool<P extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  params: P;
  /** 'all' = every agent (read tools). */
  roles: AgentRole[] | 'all';
  run(args: z.infer<P>, ctx: ToolCtx): Promise<ToolOut>;
}
/** Small JSON-able facts (undefined keys are dropped when serialised). */
export type ToolOut = Record<string, unknown>;
const tool = <P extends z.ZodTypeAny>(t: ChatTool<P>): ChatTool => t as unknown as ChatTool;

// ------------------------------------------------------------------------------------------------ helpers
const db = () => store.db;
const clip = (s: unknown, n: number) => scrubPii(String(s ?? '')).slice(0, n);
const rowsOf = (r: { data?: any[] | null }) => (r?.data ?? []) as any[];
const since = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
const LEAD_COLS = 'id,g8_contact_id,g8_list_id,full_name,job_title,company_name,company_domain,location,source,stage,fit_score,signals,why_now,research,sequence_state,last_reply_intent,meeting_at,deal_amount,deal_stage,is_test_contact,do_not_contact,disqualify_reason,created_at,last_activity_at';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const roleOf = (who: string): AgentRole | undefined => NAME_ROLE[who.toLowerCase().trim()] ?? (Object.keys(ROLE_NAME).includes(who) ? (who as AgentRole) : undefined);
/** Lists have no verified record URL (docs/graph8-app-links.md); the Contacts page is the verified place to see them. */
export const listUrl = (_id?: string | number | null) => `${G8_APP}/contacts`;

/** Leads by name / company / domain. Tries the whole phrase, then each word (≥3 chars). */
export async function findLeads(ws: UUID, query: string, limit = 3): Promise<any[]> {
  const clean = query.replace(/[%,()*'"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const run = async (q: string) => rowsOf(await db().from('leads').select(LEAD_COLS).eq('workspace_id', ws)
    .or(`full_name.ilike.%${q}%,company_name.ilike.%${q}%,company_domain.ilike.%${q}%`)
    .order('fit_score', { ascending: false, nullsFirst: false }).limit(limit));
  let out = await run(clean);
  if (!out.length) {
    for (const w of clean.split(' ').filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) {
      out = await run(w);
      if (out.length) break;
    }
  }
  return out;
}

const researchOf = (l: any) => (l.research ?? {}) as Record<string, any>;

/** Everything a lead card says — no emails/phones, only whether we have them. */
export function leadFacts(l: any, full = true): JsonObject {
  const r = researchOf(l);
  const base: JsonObject = {
    name: l.full_name, title: l.job_title ?? null, company: l.company_name ?? null, location: l.location ?? null,
    stage: l.stage, fit_score: l.fit_score ?? null, graph8_url: g8ContactUrl(l.g8_contact_id),
  };
  if (!full) return { ...base, fit_reason: clip(r.reason, 120) || null };
  return {
    ...base,
    company_domain: l.company_domain ?? null, industry: r.industry ?? null, company_size: r.size ?? null, seniority: r.seniority ?? null,
    fit_reason: clip(r.reason, 200) || null,
    fit_breakdown: (r.breakdown ?? null) as JsonObject | null,
    fit_scale: 'title 40 + industry 20 + size 15 + seniority 15 + geo 10 + intent bonus',
    why_now: clip(l.why_now, 300) || null,
    hook: clip(r.hook, 300) || null,
    talking_points: (Array.isArray(r.talking_points) ? r.talking_points : []).slice(0, 3).map((t: unknown) => clip(t, 200)),
    company_facts: (Array.isArray(r.facts) ? r.facts : []).slice(0, 5).map((t: unknown) => clip(t, 160)),
    signals: (Array.isArray(l.signals) ? l.signals : []).slice(0, 3).map((s: any) => clip(s?.summary ?? s?.title ?? s, 140)),
    best_channel: r.best_channel ?? null, channels: (r.channels ?? []) as string[],
    has_email: r.has_email ?? null, has_phone: r.has_phone ?? null, email_status: r.email_status ?? null,
    sequence_state: l.sequence_state ?? null, last_reply_intent: l.last_reply_intent ?? null,
    meeting_at: l.meeting_at ?? null, deal_amount: l.deal_amount ?? null, deal_stage: l.deal_stage ?? null,
    test_contact: !!l.is_test_contact, do_not_contact: !!l.do_not_contact, disqualified: l.disqualify_reason ?? null,
  };
}

export function leadCardBlocks(l: any): Block[] {
  const r = researchOf(l);
  const lines = [
    `*${esc(l.full_name)}* — ${esc(l.job_title ?? '—')}, ${esc(l.company_name ?? '—')}${l.fit_score != null ? `  ·  fit *${l.fit_score}*` : ''}  ·  _${l.stage}_`,
    l.why_now || r.hook ? `> ${esc(clip(l.why_now || r.hook, 280))}` : '',
    r.reason ? `_${esc(clip(r.reason, 200))}_` : '',
  ].filter(Boolean).join('\n');
  return [{
    type: 'section', text: { type: 'mrkdwn', text: lines },
    accessory: { type: 'button', text: { type: 'plain_text', text: 'Open in graph8' }, url: g8ContactUrl(l.g8_contact_id), action_id: `open_g8_chat_${String(l.id).slice(0, 8)}` },
  }];
}

export function leadListBlocks(title: string, leads: any[]): Block[] {
  const blocks: Block[] = [{ type: 'context', elements: [{ type: 'mrkdwn', text: `*${esc(title)}*` }] }];
  for (const l of leads.slice(0, 8)) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${esc(l.full_name)}* — ${esc(l.job_title ?? '—')}, ${esc(l.company_name ?? '—')}${l.fit_score != null ? `  ·  fit ${l.fit_score}` : ''}  ·  _${l.stage}_` },
      accessory: { type: 'button', text: { type: 'plain_text', text: 'Open in graph8' }, url: g8ContactUrl(l.g8_contact_id), action_id: `open_g8_chat_${String(l.id).slice(0, 8)}` },
    });
  }
  return blocks;
}

async function oneLead(ctx: ToolCtx, query: string): Promise<{ lead?: any; error?: ToolOut }> {
  const found = await findLeads(ctx.workspaceId, query, 3);
  if (!found.length) return { error: { found: false, note: `No lead matching "${clip(query, 60)}" in our pipeline.` } };
  return { lead: found[0] };
}

async function agentPaused(ws: UUID, role: AgentRole): Promise<boolean> {
  const { data } = await db().from('agents').select('status').eq('workspace_id', ws).eq('role', role).maybeSingle();
  return data?.status === 'paused';
}

// ------------------------------------------------------------------------------------------------ work (reuses playbooks)
export const Constraints = z.object({
  count: z.number().int().min(1).max(50).nullish().describe('How many leads'),
  titles: z.array(z.string()).nullish().describe('Job titles, e.g. ["CFO","VP Finance"]. Omit to keep the default target roles.'),
  industries: z.array(z.string()).nullish().describe('Industries exactly as the founder said them, e.g. ["software"], ["fintech"]'),
  countries: z.array(z.string()).nullish().describe('Full country names, e.g. ["United Kingdom"]'),
  company_sizes: z.array(z.string()).nullish().describe('Employee buckets: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+'),
  companies: z.array(z.string()).nullish().describe('Company domains for company-first search, e.g. ["stripe.com"]'),
  signals: z.array(z.string()).nullish().describe('Buying signals to prefer, e.g. ["hiring"]'),
  note: z.string().nullish().describe('Anything else the founder asked for'),
});
export type Constraints = z.infer<typeof Constraints>;

/** Founder constraints → Bilal find_prospects input. Constraints always win over workspace defaults. */
export function scoutInput(c: Constraints, s: { target_persona?: string | null; target_icp?: string | null; geo?: string[] | null; daily_find?: number | null; daily_research?: number | null }): { input: JsonObject; title: string } {
  const n = Math.max(1, Math.min(50, c.count ?? s.daily_find ?? 10));
  const filters: ExplicitFilters = {};
  if (c.titles?.length) filters.titles = c.titles.slice(0, 6);
  if (c.industries?.length) filters.industries = c.industries.slice(0, 6);
  if (c.countries?.length) filters.countries = c.countries.slice(0, 6);
  if (c.company_sizes?.length) filters.sizes = c.company_sizes.slice(0, 6);
  if (c.companies?.length) filters.domains = c.companies.slice(0, 20);
  // Default roles only: the saved persona's "… at consumer apps" part must not leak into an explicit industry ask.
  const defaultRoles = (s.target_persona || 'decision makers').split(/\s+(?:at|in|for|from|within)\s+/i)[0].trim() || 'decision makers';
  const who = c.titles?.length ? c.titles.join(' / ') : c.industries?.length || c.companies?.length ? defaultRoles : s.target_persona || 'decision makers';
  const where = [c.industries?.length ? `in ${c.industries.join(', ')}` : '', c.companies?.length ? `at ${c.companies.join(', ')}` : '',
    c.company_sizes?.length ? `(${c.company_sizes.join(', ')} staff)` : '', c.countries?.length ? `in ${c.countries.join(', ')}` : ''].filter(Boolean).join(' ');
  const persona = `${who}${where ? ` ${where}` : ''}`.slice(0, 240);
  const label = [c.countries?.length === 1 ? c.countries[0] : '', c.industries?.join('/') ?? '', c.titles?.length ? c.titles[0] : ''].filter(Boolean).join(' ').slice(0, 60) || null;
  const input: JsonObject = {
    requested_by: 'founder_chat', count: n, research_count: Math.min(n, s.daily_research ?? 5), persona,
    target_icp: c.industries?.length || c.companies?.length ? null : s.target_icp ?? null,
    geo: c.countries?.length ? c.countries.slice(0, 6) : s.geo ?? [],
    filters: filters as JsonObject, label,
    signals: (c.signals ?? []).slice(0, 5),
  };
  if (c.note) input.note = clip(c.note, 200);
  return { input, title: `Find ${n} prospects: ${persona}`.slice(0, 120) };
}

async function enqueueWork(ctx: ToolCtx, role: Worker, kind: TaskKind, title: string, input: JsonObject): Promise<ToolOut> {
  if (await agentPaused(ctx.workspaceId, role)) return { started: false, reason: `${ROLE_NAME[role]} is paused. Resume first.` };
  if (ctx.readOnly) return { started: false, dry_run: true, note: 'replay: nothing was started, no task number', would_assign: ROLE_NAME[role], kind, title, input: redactInput(input) };
  const t = ctx.run && ctx.role === 'head_of_sales'
    ? await ctx.run.delegate(role, kind, title, input, { parentTaskId: ctx.run.task.id, priority: 1 })
    : await runtime.enqueue(ctx.workspaceId, role, kind, title, input, { priority: 1, slack: ctx.slack });
  return { started: true, task: `T-${t.number}`, owner: ROLE_NAME[role], title, progress: '#sales-team' };
}
const redactInput = (i: JsonObject): JsonObject => { const { requested_by: _r, ...rest } = i; return rest; };

async function researchInput(ctx: ToolCtx, names: string[] | null | undefined, count: number | null | undefined): Promise<{ input?: JsonObject; title?: string; error?: string }> {
  const s = await store.settings(ctx.workspaceId);
  if (names?.length) {
    const ids: string[] = []; const labels: string[] = [];
    for (const n of names.slice(0, 10)) { const [l] = await findLeads(ctx.workspaceId, n, 1); if (l) { ids.push(l.id); labels.push(l.full_name); } }
    if (!ids.length) return { error: 'None of those leads are in our pipeline.' };
    return { input: { requested_by: 'founder_chat', lead_ids: ids, list_id: s.last_run_list_id ?? null }, title: `Research ${labels.join(', ')}`.slice(0, 120) };
  }
  if (!s.last_run_list_id) return { error: 'Bilal needs to find leads first.' };
  const n = Math.max(1, Math.min(20, count ?? s.daily_research ?? 5));
  return { input: { requested_by: 'founder_chat', list_id: s.last_run_list_id, count: n }, title: `Research top ${n} leads` };
}

// ------------------------------------------------------------------------------------------------ registry
export const TOOLS: ChatTool[] = [
  // ---------------------------------------------------------------- read (all agents)
  tool({
    name: 'get_pipeline', roles: 'all',
    description: 'Pipeline counts by stage (prospects, contacted, replied, meetings, deals, deal value), what finished in the last 24h, graph8 credits left, blockers.',
    params: z.object({}),
    async run(_a, ctx) {
      const f = await gatherStatus(ctx.workspaceId);
      return { pipeline: f.pipeline as unknown as JsonObject, done_last_24h: f.doneRecently, needs_founder: f.blockers, graph8_credits_left: f.graph8Credits ?? null, team_paused: f.paused, deals_url: G8_LINKS.deals };
    },
  }),
  tool({
    name: 'get_agents_status', roles: 'all',
    description: "Each agent's status, current task, tasks done/open and credits spent today. Optionally one agent by name.",
    params: z.object({ name: z.string().nullish().describe('Agent name, e.g. "Bilal"') }),
    async run(a, ctx) {
      const f = await gatherStatus(ctx.workspaceId);
      const want = a.name ? roleOf(a.name) : undefined;
      return { agents: f.agents.filter((x) => !want || x.role === want).map((x) => ({ name: x.name, title: x.title, status: x.status, now: x.current_task_title ?? null, done: x.tasks_done, open: x.tasks_open, credits_today: Number(x.spent_today_credits || 0) })) };
    },
  }),
  tool({
    name: 'get_task', roles: 'all',
    description: 'Status, owner and summary of a task by number (T-12 → 12). Without a number: the 5 most recent tasks.',
    params: z.object({ number: z.number().int().nullish() }),
    async run(a, ctx) {
      let q = db().from('tasks').select('number,title,kind,status,blocked_reason,result_summary,assignee_agent_id,created_at,finished_at').eq('workspace_id', ctx.workspaceId);
      q = a.number ? q.eq('number', a.number) : q.order('created_at', { ascending: false });
      const rows = rowsOf(await q.limit(a.number ? 1 : 5));
      if (!rows.length) return { found: false };
      const agents = rowsOf(await db().from('agents').select('id,name').eq('workspace_id', ctx.workspaceId));
      const nm = new Map(agents.map((x) => [x.id, x.name]));
      return { tasks: rows.map((t) => ({ task: `T-${t.number}`, title: clip(t.title, 120), kind: t.kind, status: t.status, owner: nm.get(t.assignee_agent_id) ?? null, blocked: clip(t.blocked_reason, 160) || null, summary: clip(t.result_summary, 240) || null, finished_at: t.finished_at })) };
    },
  }),
  tool({
    name: 'list_pending_approvals', roles: 'all',
    description: 'Cards waiting on the founder (launch a sequence, send a reply, connect an account).',
    params: z.object({}),
    async run(_a, ctx) {
      const rows = rowsOf(await db().from('approvals').select('title,kind,status,requested_by_agent_id,created_at,slack_channel,slack_ts').eq('workspace_id', ctx.workspaceId).in('status', ['pending', 'edit_requested']).order('created_at', { ascending: false }).limit(8));
      const agents = rowsOf(await db().from('agents').select('id,name').eq('workspace_id', ctx.workspaceId));
      const nm = new Map(agents.map((x) => [x.id, x.name]));
      return { waiting_on_founder: rows.map((r) => ({ title: clip(r.title, 120), kind: r.kind, status: r.status, from: nm.get(r.requested_by_agent_id) ?? null, since: r.created_at, where: r.slack_channel ? 'card in #sales-hq' : null })) };
    },
  }),
  tool({
    name: 'find_lead', roles: 'all',
    description: 'Look up a lead by person name, company or domain (e.g. "Thad Warren", "EnergyBot"). Returns role, company, fit score and breakdown, why-now hook, talking points, signals, stage and an Open-in-graph8 link. ALWAYS call this when the founder names a person or company.',
    params: z.object({ query: z.string() }),
    async run(a, ctx) {
      const found = await findLeads(ctx.workspaceId, a.query, 3);
      if (!found.length) return { found: false, note: `No lead matching "${clip(a.query, 60)}" in our pipeline.` };
      ctx.blocks.push(...leadCardBlocks(found[0]));
      return { found: true, lead: leadFacts(found[0]), other_matches: found.slice(1).map((l) => leadFacts(l, false)) };
    },
  }),
  tool({
    name: 'list_leads', roles: 'all',
    description: 'Filtered list of leads (no private data): by stage, country/location text, industry text, minimum fit, or test contacts. Sorted by fit.',
    params: z.object({
      stage: z.enum(['prospect', 'researched', 'queued', 'contacted', 'replied', 'meeting', 'deal', 'won', 'lost', 'disqualified']).nullish(),
      location: z.string().nullish(), industry: z.string().nullish(), min_fit: z.number().nullish(),
      limit: z.number().int().min(1).max(20).nullish(),
    }),
    async run(a, ctx) {
      let q = db().from('leads').select(LEAD_COLS).eq('workspace_id', ctx.workspaceId);
      if (a.stage) q = q.eq('stage', a.stage);
      if (a.location) q = q.ilike('location', `%${a.location.replace(/[%,()]/g, '')}%`);
      if (a.min_fit != null) q = q.gte('fit_score', a.min_fit);
      let rows = rowsOf(await q.order('fit_score', { ascending: false, nullsFirst: false }).limit(60));
      if (a.industry) { const t = a.industry.toLowerCase(); rows = rows.filter((l) => String(researchOf(l).industry ?? '').toLowerCase().includes(t) || String(researchOf(l).reason ?? '').toLowerCase().includes(t)); }
      const top = rows.slice(0, a.limit ?? 8);
      if (top.length) ctx.blocks.push(...leadListBlocks(`${top.length} of ${rows.length} leads`, top));
      return { total: rows.length, leads: top.map((l) => leadFacts(l, false)), list_url: listUrl(top[0]?.g8_list_id) };
    },
  }),
  tool({
    name: 'get_lead_timeline', roles: 'all',
    description: 'What happened with a lead: found, researched, emailed, replied, meeting, deal (newest first).',
    params: z.object({ query: z.string().describe('Lead name or company') }),
    async run(a, ctx) {
      const { lead, error } = await oneLead(ctx, a.query);
      if (!lead) return error!;
      const ev = rowsOf(await db().from('lead_events').select('type,channel,summary,occurred_at').eq('lead_id', lead.id).order('occurred_at', { ascending: false }).limit(12));
      return { lead: leadFacts(lead, false), timeline: ev.map((e) => ({ type: e.type, channel: e.channel, summary: clip(e.summary, 160), at: e.occurred_at })) };
    },
  }),
  tool({
    name: 'contact_details_link', roles: 'all',
    description: 'Use when the founder asks for emails or phone numbers. We never post them in Slack; returns which leads have them and the graph8 link where the founder can see them.',
    params: z.object({ query: z.string().nullish().describe('Lead name/company; omit for the latest list') }),
    async run(a, ctx) {
      const policy = 'Emails and phone numbers never go into Slack (privacy). They are in graph8.';
      if (a.query) {
        const { lead, error } = await oneLead(ctx, a.query);
        if (!lead) return { policy, ...error! };
        const r = researchOf(lead);
        return { policy, lead: lead.full_name, has_email: r.has_email ?? null, has_phone: r.has_phone ?? null, email_status: r.email_status ?? null, graph8_url: g8ContactUrl(lead.g8_contact_id) };
      }
      const s = await store.settings(ctx.workspaceId);
      const rows = rowsOf(await db().from('leads').select('research,is_test_contact').eq('workspace_id', ctx.workspaceId).eq('is_test_contact', false).in('stage', ['researched', 'queued', 'contacted', 'replied', 'meeting', 'deal']).limit(200));
      return { policy, researched: rows.length, with_email: rows.filter((l) => researchOf(l).has_email).length, with_phone: rows.filter((l) => researchOf(l).has_phone).length, graph8_list_url: listUrl(s.last_run_list_id), contacts_url: `${G8_APP}/contacts` };
    },
  }),
  tool({
    name: 'get_credits', roles: 'all',
    description: 'Credits used by each agent today and in the last 7 days (graph8 + AI), plus daily budgets.',
    params: z.object({}),
    async run(_a, ctx) {
      const [ag, ev] = await Promise.all([
        db().from('agents').select('id,name,budget_daily_credits,spent_today_credits').eq('workspace_id', ctx.workspaceId),
        db().from('credit_events').select('agent_id,source,credits').eq('workspace_id', ctx.workspaceId).gte('created_at', since(7)).limit(5000),
      ]);
      const events = rowsOf(ev);
      return {
        agents: rowsOf(ag).map((x) => {
          const mine = events.filter((e) => e.agent_id === x.id);
          const sum = (src?: string) => Math.round(mine.filter((e) => !src || e.source === src).reduce((s, e) => s + Number(e.credits || 0), 0));
          return { name: x.name, today: Number(x.spent_today_credits || 0), daily_budget: x.budget_daily_credits ?? null, last_7_days: sum(), graph8_7d: sum('graph8'), ai_7d: sum('llm') };
        }),
      };
    },
  }),
  tool({
    name: 'get_settings', roles: 'all',
    description: 'Current targeting and daily settings (target persona, ICP, geo, daily find/research numbers, notes).',
    params: z.object({}),
    async run(_a, ctx) {
      const s = await store.settings(ctx.workspaceId);
      const w = await store.workspace(ctx.workspaceId);
      return { target_persona: s.target_persona ?? null, target_icp: s.target_icp ?? null, geo: s.geo ?? [], daily_find: s.daily_find ?? null, daily_research: s.daily_research ?? null, notes: (s.notes ?? []).slice(-5), standup_hour: (w as any).standup_hour ?? 9 };
    },
  }),
  tool({
    name: 'get_sequences', roles: 'all',
    description: 'Outreach sequences: status, steps (day, channel, subject/preview), leads enrolled, stats; plus sends/opens/bounces in the last 7 days and whether a launch card is waiting.',
    params: z.object({}),
    async run(_a, ctx) {
      const [seq, ev, appr] = await Promise.all([
        db().from('sequences').select('id,g8_sequence_id,name,status,channels,steps,lead_count,enrolled_count,stats,launched_at').eq('workspace_id', ctx.workspaceId).order('created_at', { ascending: false }).limit(3),
        db().from('lead_events').select('type').eq('workspace_id', ctx.workspaceId).in('type', ['email_sent', 'email_opened', 'email_clicked', 'email_bounced', 'enrolled']).gte('occurred_at', since(7)).limit(2000),
        pendingApproval(ctx.workspaceId, 'sdr', 'launch_sequence'),
      ]);
      const count = (t: string) => rowsOf(ev).filter((e) => e.type === t).length;
      return {
        sequences: rowsOf(seq).map((s) => ({
          name: clip(s.name, 80), status: s.status, channels: s.channels, leads: s.lead_count, enrolled: s.enrolled_count, stats: s.stats ?? {}, launched_at: s.launched_at,
          steps: (Array.isArray(s.steps) ? s.steps : []).slice(0, 6).map((x: any) => ({ day: x.day, channel: x.channel, action: x.action, state: x.mode === 'planned' ? `planned (${clip(x.reason, 60)})` : 'live', subject: clip(x.subject, 80) || null, preview: clip(x.preview, 160) || null })),
          url: s.g8_sequence_id ? `${G8_APP}/sequencer/sequence/${s.g8_sequence_id}` : G8_LINKS.sequencer,
        })),
        last_7_days: { enrolled: count('enrolled'), sent: count('email_sent'), opened: count('email_opened'), clicked: count('email_clicked'), bounced: count('email_bounced') },
        waiting_for_launch: appr ? clip(appr.title, 120) : null,
      };
    },
  }),
  tool({
    name: 'get_replies', roles: 'all',
    description: 'Recent replies from prospects with intent (interested, not now, unsubscribe…) and a short summary, no private data.',
    params: z.object({ query: z.string().nullish().describe('Only this lead/company') }),
    async run(a, ctx) {
      let lead: any;
      if (a.query) { const r = await oneLead(ctx, a.query); if (!r.lead) return r.error!; lead = r.lead; }
      let q = db().from('lead_events').select('type,summary,lead_id,occurred_at').eq('workspace_id', ctx.workspaceId).in('type', ['reply_received', 'reply_classified', 'reply_sent']).gte('occurred_at', since(30));
      if (lead) q = q.eq('lead_id', lead.id);
      const ev = rowsOf(await q.order('occurred_at', { ascending: false }).limit(12));
      const ids = [...new Set(ev.map((e) => e.lead_id))];
      const leads = ids.length ? rowsOf(await db().from('leads').select('id,full_name,company_name,last_reply_intent').in('id', ids)) : [];
      const nm = new Map(leads.map((l) => [l.id, l]));
      const approval = await pendingApproval(ctx.workspaceId, 'closer', 'send_reply');
      return { replies: ev.map((e) => ({ type: e.type, lead: nm.get(e.lead_id)?.full_name ?? null, company: nm.get(e.lead_id)?.company_name ?? null, intent: nm.get(e.lead_id)?.last_reply_intent ?? null, summary: clip(e.summary, 200), at: e.occurred_at })), reply_card_waiting: approval ? clip(approval.title, 120) : null, inbox_url: `${G8_APP}/inbox/all` };
    },
  }),
  tool({
    name: 'get_meetings', roles: 'all',
    description: 'Booked meetings (upcoming and recent) with lead, company and time.',
    params: z.object({}),
    async run(_a, ctx) {
      const rows = rowsOf(await db().from('leads').select('full_name,company_name,meeting_at,stage').eq('workspace_id', ctx.workspaceId).not('meeting_at', 'is', null).order('meeting_at', { ascending: true }).limit(10));
      return { meetings: rows.map((l) => ({ lead: l.full_name, company: l.company_name, at: l.meeting_at, stage: l.stage })), appointments_url: G8_LINKS.appointments };
    },
  }),
  tool({
    name: 'get_deals', roles: 'all',
    description: 'Deals: lead, company, amount (estimated), stage, and total pipeline value.',
    params: z.object({}),
    async run(_a, ctx) {
      const rows = rowsOf(await db().from('leads').select('full_name,company_name,deal_amount,deal_stage,stage').eq('workspace_id', ctx.workspaceId).in('stage', ['deal', 'won', 'lost']).limit(20));
      return { deals: rows.map((l) => ({ lead: l.full_name, company: l.company_name, amount: Number(l.deal_amount || 0), deal_stage: l.deal_stage, stage: l.stage })), pipeline_value: rows.filter((l) => l.stage === 'deal').reduce((s, l) => s + Number(l.deal_amount || 0), 0), estimated: true, deals_url: G8_LINKS.deals };
    },
  }),
  tool({
    name: 'graph8_link', roles: 'all',
    description: 'graph8 web-app link for a lead, the latest list, deals, sequences, meetings or settings.',
    params: z.object({ what: z.enum(['lead', 'list', 'contacts', 'deals', 'sequences', 'meetings', 'settings', 'inbox']), query: z.string().nullish() }),
    async run(a, ctx) {
      if (a.what === 'lead') {
        if (!a.query) return { url: `${G8_APP}/contacts` };
        const { lead, error } = await oneLead(ctx, a.query);
        return lead ? { lead: lead.full_name, url: g8ContactUrl(lead.g8_contact_id) } : error!;
      }
      if (a.what === 'list') { const s = await store.settings(ctx.workspaceId); return { url: listUrl(s.last_run_list_id) }; }
      const map: Record<string, string> = { contacts: `${G8_APP}/contacts`, deals: G8_LINKS.deals, sequences: G8_LINKS.sequencer, meetings: G8_LINKS.appointments, settings: G8_LINKS.settings, inbox: `${G8_APP}/inbox/all` };
      return { url: map[a.what] };
    },
  }),

  // ---------------------------------------------------------------- manager (Ayesha)
  tool({
    name: 'ask_agent', roles: ['head_of_sales'],
    description: 'Ask a teammate a question and get their answer to relay ("Hira says: …"). Use when the founder asks you to ask someone, asks about a teammate\'s reasoning or work, or "check on X\'s progress".',
    params: z.object({ agent: z.enum(['Bilal', 'Hira', 'Usman', 'Zara']), question: z.string() }),
    async run(a, ctx) {
      const role = roleOf(a.agent)!;
      if (!ctx.askAgent || ctx.depth >= 1) return { error: 'cannot ask from here' };
      const answer = await ctx.askAgent(role, a.question);
      return { agent: a.agent, answer: scrubPii(answer) };
    },
  }),
  tool({
    name: 'assign_task', roles: ['head_of_sales'],
    description: 'Give a teammate work, keeping EVERY founder constraint (count, titles, industry, country, size, companies, signals). Bilal: find_prospects. Hira: research_leads (optionally named leads). Usman: build_sequence. Omit titles when the founder did not name roles.',
    params: Constraints.extend({
      agent: z.enum(['Bilal', 'Hira', 'Usman']),
      work: z.enum(['find_prospects', 'research_leads', 'build_sequence']),
      lead_names: z.array(z.string()).nullish().describe('Hira: research these specific leads'),
    }),
    async run(a, ctx) {
      const s = await store.settings(ctx.workspaceId);
      if (a.work === 'find_prospects') { const { input, title } = scoutInput(a, s); return enqueueWork(ctx, 'scout', 'find_prospects', title, input); }
      if (a.work === 'research_leads') {
        const r = await researchInput(ctx, a.lead_names, a.count);
        return r.error ? { started: false, reason: r.error } : enqueueWork(ctx, 'researcher', 'research_leads', r.title!, r.input!);
      }
      if (!s.last_run_list_id) return { started: false, reason: 'No researched list yet. Bilal and Hira go first.' };
      return enqueueWork(ctx, 'sdr', 'build_sequence', 'Build outreach sequence', { requested_by: 'founder_chat', list_id: s.last_run_list_id, ...(a.note ? { note: clip(a.note, 200) } : {}) });
    },
  }),
  tool({
    name: 'plan_goal', roles: ['head_of_sales'],
    description: 'Big goal ("get me 3 meetings with UK fintech CFOs this week"): starts the chain Bilal finds → Hira researches → Usman builds the sequence → founder launches, with all constraints. Returns the plan steps to post.',
    params: Constraints.extend({ goal: z.string() }),
    async run(a, ctx) {
      const s = await store.settings(ctx.workspaceId);
      const { input, title } = scoutInput({ ...a, count: a.count ?? Math.max(10, s.daily_find ?? 10) }, s);
      input.goal = clip(a.goal, 200);
      const started = await enqueueWork(ctx, 'scout', 'find_prospects', title, input);
      return {
        plan: [
          `Bilal finds ${input.count} prospects: ${input.persona}`,
          `Hira researches the top ${input.research_count} (hooks, contact channels)`,
          'Usman builds the sequence and sends you a Launch card',
          'Zara handles replies and books meetings (allowlisted test contacts only)',
        ],
        ...started,
      };
    },
  }),
  tool({
    name: 'update_settings', roles: ['head_of_sales'],
    description: 'Save a lasting preference: daily find/research numbers, target persona, target ICP, geo, standup hour, or a note (tone etc).',
    params: z.object({
      daily_find: z.number().int().nullish(), daily_research: z.number().int().nullish(), target_persona: z.string().nullish(),
      target_icp: z.string().nullish(), geo: z.array(z.string()).nullish(), standup_hour: z.number().int().min(0).max(23).nullish(), note: z.string().nullish(),
    }),
    async run(a, ctx) {
      const cur = await store.settings(ctx.workspaceId);
      const { patch, lines } = settingsPatch(a as Intent, cur);
      if (a.standup_hour != null) lines.push(`standup at ${a.standup_hour}:00`);
      if (!lines.length) return { saved: false, reason: 'nothing to change' };
      if (ctx.readOnly) return { saved: false, dry_run: true, would_save: lines };
      if (Object.keys(patch).length) await store.patchSettings(ctx.workspaceId, patch);
      if (a.standup_hour != null) await db().from('workspaces').update({ standup_hour: a.standup_hour }).eq('id', ctx.workspaceId);
      return { saved: true, changes: lines };
    },
  }),
  tool({
    name: 'pause_agents', roles: ['head_of_sales'],
    description: 'Pause or resume teammates (empty list = whole team).',
    params: z.object({ action: z.enum(['pause', 'resume']), agents: z.array(z.enum(['Bilal', 'Hira', 'Usman', 'Zara'])).nullish() }),
    async run(a, ctx) {
      const roles = (a.agents ?? []).map((n) => roleOf(n)!).filter(Boolean);
      if (ctx.readOnly) return { dry_run: true, would: a.action, agents: a.agents?.length ? a.agents : 'whole team' };
      const names = await setPaused(ctx.workspaceId, a.action === 'pause', roles.length ? roles : null);
      return { action: a.action, changed: names };
    },
  }),
  tool({
    name: 'set_budget', roles: ['head_of_sales'],
    description: "Change an agent's daily credit budget.",
    params: z.object({ agent: z.enum(['Ayesha', 'Bilal', 'Hira', 'Usman', 'Zara']), daily_credits: z.number().int().min(0).max(100000) }),
    async run(a, ctx) {
      if (ctx.readOnly) return { dry_run: true, would_set: `${a.agent} budget ${a.daily_credits}/day` };
      await db().from('agents').update({ budget_daily_credits: a.daily_credits }).eq('workspace_id', ctx.workspaceId).eq('role', roleOf(a.agent)!);
      return { saved: true, agent: a.agent, daily_credits: a.daily_credits };
    },
  }),
  tool({
    name: 'run_daily_batch', roles: ['head_of_sales'],
    description: "Start today's run now (Bilal finds the daily number with the saved targeting; the chain follows), or post the standup.",
    params: z.object({ what: z.enum(['daily_run', 'standup']) }),
    async run(a, ctx) {
      if (ctx.readOnly) return { dry_run: true, would_start: a.what };
      const t = await runtime.enqueue(ctx.workspaceId, 'head_of_sales', a.what === 'standup' ? 'standup' : 'plan', a.what === 'standup' ? 'Standup (chat)' : 'Daily run (chat)',
        a.what === 'standup' ? { trigger: 'chat' } : { trigger: 'chat', planChannel: ctx.slack?.channel ?? 'hq', planTs: ctx.slack?.threadTs ?? ctx.slack?.messageTs ?? null }, { priority: 1, slack: ctx.slack });
      return { started: true, task: `T-${t.number}` };
    },
  }),

  tool({
    name: 'hand_off', roles: ['scout', 'researcher', 'sdr', 'closer'],
    description: "The request is a teammate's job: hand it over. The teammate answers the founder in the same thread in their own voice. Ayesha owns settings, pause/resume, budgets, plans and team status.",
    params: z.object({ agent: z.enum(['Ayesha', 'Bilal', 'Hira', 'Usman', 'Zara']), request: z.string().describe("The founder's request, restated with all details") }),
    async run(a, ctx) {
      const role = roleOf(a.agent)!;
      if (role === ctx.role) return { error: 'that is you — answer it yourself' };
      if (!ctx.askAgent || ctx.depth >= 1) return { error: 'cannot hand off from here' };
      await ctx.askAgent(role, a.request);
      return { handed_to: a.agent, their_answer: 'posted by them in the thread' };
    },
  }),

  // ---------------------------------------------------------------- Bilal
  tool({
    name: 'search_prospects', roles: ['scout'],
    description: 'Start a prospect search with the founder\'s exact filters (count, titles, industries, countries, sizes, companies, signals). Never drift to defaults for anything the founder specified.',
    params: Constraints,
    async run(a, ctx) { const s = await store.settings(ctx.workspaceId); const { input, title } = scoutInput(a, s); return enqueueWork(ctx, 'scout', 'find_prospects', title, input); },
  }),
  tool({
    name: 'find_lookalikes', roles: ['scout'],
    description: 'Find more people like an existing lead (same title, industry, size).',
    params: z.object({ lead: z.string(), count: z.number().int().min(1).max(50).nullish() }),
    async run(a, ctx) {
      const { lead, error } = await oneLead(ctx, a.lead);
      if (!lead) return error!;
      const r = researchOf(lead); const s = await store.settings(ctx.workspaceId);
      const { input, title } = scoutInput({ count: a.count ?? 5, titles: lead.job_title ? [lead.job_title] : null, industries: r.industry ? [r.industry] : null, company_sizes: r.size ? [r.size] : null }, s);
      return { like: leadFacts(lead, false), ...(await enqueueWork(ctx, 'scout', 'find_prospects', `${title} (like ${lead.full_name})`.slice(0, 120), input)) };
    },
  }),
  tool({
    name: 'search_company_people', roles: ['scout'],
    description: 'Find people at specific companies (company-first search by domain).',
    params: z.object({ companies: z.array(z.string()).describe('Domains, e.g. ["stripe.com"]'), titles: z.array(z.string()).nullish(), count: z.number().int().nullish() }),
    async run(a, ctx) { const s = await store.settings(ctx.workspaceId); const { input, title } = scoutInput({ companies: a.companies, titles: a.titles, count: a.count ?? 5 }, s); return enqueueWork(ctx, 'scout', 'find_prospects', title, input); },
  }),
  tool({
    name: 'intent_companies', roles: ['scout', 'head_of_sales'],
    description: 'Companies showing buying intent / signals among our leads.',
    params: z.object({}),
    async run(_a, ctx) {
      const rows = rowsOf(await db().from('leads').select('company_name,company_domain,signals,source').eq('workspace_id', ctx.workspaceId).limit(300));
      const withSig = rows.filter((l) => l.source === 'signal' || (Array.isArray(l.signals) && l.signals.length));
      const by = new Map<string, string[]>();
      for (const l of withSig) by.set(l.company_name ?? l.company_domain, (l.signals ?? []).slice(0, 2).map((s: any) => clip(s?.summary ?? s?.title ?? s, 100)));
      return { companies: [...by.entries()].slice(0, 10).map(([company, signals]) => ({ company, signals })), note: by.size ? null : 'No intent signals on our leads yet (graph8 intent needs site visitors).' };
    },
  }),

  // ---------------------------------------------------------------- Hira
  tool({
    name: 'research_leads', roles: ['researcher'],
    description: 'Research leads: named ones, or the top N of the latest list.',
    params: z.object({ lead_names: z.array(z.string()).nullish(), count: z.number().int().nullish() }),
    async run(a, ctx) { const r = await researchInput(ctx, a.lead_names, a.count); return r.error ? { started: false, reason: r.error } : enqueueWork(ctx, 'researcher', 'research_leads', r.title!, r.input!); },
  }),
  tool({
    name: 'company_deep_dive', roles: ['researcher'],
    description: 'What we know about a company: facts, size, industry, signals, and the leads we have there.',
    params: z.object({ company: z.string() }),
    async run(a, ctx) {
      const leads = await findLeads(ctx.workspaceId, a.company, 5);
      if (!leads.length) return { found: false, note: `We have nobody at ${clip(a.company, 60)} yet.` };
      const r = researchOf(leads[0]);
      return { company: leads[0].company_name, domain: leads[0].company_domain, industry: r.industry ?? null, size: r.size ?? null, facts: (r.facts ?? []).slice(0, 6).map((f: unknown) => clip(f, 180)), sources: r.sources ?? [], leads: leads.map((l) => leadFacts(l, false)) };
    },
  }),
  tool({
    name: 'disqualify_lead', roles: ['researcher', 'closer'],
    description: 'Disqualify a lead (wrong person, no fit…). They leave the pipeline; the next research run backfills.',
    params: z.object({ lead: z.string(), reason: z.enum(['no_fit', 'wrong_person', 'not_interested', 'do_not_contact']), note: z.string().nullish() }),
    async run(a, ctx) {
      const { lead, error } = await oneLead(ctx, a.lead);
      if (!lead) return error!;
      if (ctx.readOnly) return { dry_run: true, would_disqualify: lead.full_name, reason: a.reason };
      await db().from('leads').update({ stage: 'disqualified', disqualify_reason: a.reason, ...(a.reason === 'do_not_contact' ? { do_not_contact: true } : {}) }).eq('id', lead.id);
      await db().from('lead_events').insert({ workspace_id: ctx.workspaceId, lead_id: lead.id, agent_id: ctx.agentId, type: 'disqualified', channel: 'system', direction: 'internal', summary: `Disqualified from chat: ${a.reason}${a.note ? ` · ${clip(a.note, 120)}` : ''}` });
      return { done: true, lead: lead.full_name, reason: a.reason, backfill: 'next research run picks a replacement from the list' };
    },
  }),

  // ---------------------------------------------------------------- Usman
  tool({
    name: 'build_sequence', roles: ['sdr'],
    description: 'Build an outreach sequence for the researched leads (a Launch card follows).',
    params: z.object({ note: z.string().nullish() }),
    async run(a, ctx) {
      const s = await store.settings(ctx.workspaceId);
      if (!s.last_run_list_id) return { started: false, reason: 'No researched list yet.' };
      return enqueueWork(ctx, 'sdr', 'build_sequence', 'Build outreach sequence', { requested_by: 'founder_chat', list_id: s.last_run_list_id, ...(a.note ? { note: clip(a.note, 200) } : {}) });
    },
  }),
  tool({
    name: 'revise_copy', roles: ['sdr'],
    description: 'Change the sequence waiting for launch (shorter, more casual, mention a case study…). Uses the Edit flow; a fresh Launch card follows.',
    params: z.object({ note: z.string() }),
    async run(a, ctx) {
      const appr = await pendingApproval(ctx.workspaceId, 'sdr', 'launch_sequence');
      if (!appr) return { revised: false, reason: 'Nothing is waiting for launch.' };
      if (ctx.readOnly) return { dry_run: true, would_revise: clip(appr.title, 100), note: clip(a.note, 200) };
      if (!ctx.slack) return { revised: false, reason: 'needs a Slack context' };
      const ok = await editApproval(appr, clip(a.note, 1000), ctx.slack);
      return ok ? { revised: true, card: clip(appr.title, 100), next: 'new Launch card in #sales-hq' } : { revised: false, reason: 'card was just decided' };
    },
  }),
  tool({
    name: 'preview_email', roles: ['sdr'],
    description: 'Show the email steps (subject + opening) of the latest sequence, and the lead\'s hook if a lead is named.',
    params: z.object({ lead: z.string().nullish() }),
    async run(a, ctx) {
      const seq = rowsOf(await db().from('sequences').select('name,status,steps').eq('workspace_id', ctx.workspaceId).order('created_at', { ascending: false }).limit(1))[0];
      let lead: any;
      if (a.lead) lead = (await findLeads(ctx.workspaceId, a.lead, 1))[0];
      if (!seq) return { found: false, note: 'No sequence written yet.' };
      return { sequence: clip(seq.name, 80), status: seq.status, emails: (seq.steps ?? []).filter((x: any) => x.channel === 'email').slice(0, 3).map((x: any) => ({ day: x.day, subject: clip(x.subject, 100), opening: clip(x.preview, 240) })), lead_hook: lead ? clip(lead.why_now ?? researchOf(lead).hook, 240) : null };
    },
  }),
  tool({
    name: 'stop_lead', roles: ['sdr', 'closer'],
    description: 'Stop all outreach to a lead or their whole company (do not contact).',
    params: z.object({ lead: z.string(), whole_company: z.boolean().nullish() }),
    async run(a, ctx) {
      const { lead, error } = await oneLead(ctx, a.lead);
      if (!lead) return error!;
      if (ctx.readOnly) return { dry_run: true, would_stop: a.whole_company ? lead.company_name : lead.full_name };
      const { stopAccount } = await import('../agents/zara/stop');
      const full = rowsOf(await db().from('leads').select('*').eq('id', lead.id))[0];
      const r = await stopAccount({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, lead: full, reason: 'founder asked in chat' });
      await db().from('leads').update({ do_not_contact: true }).eq(a.whole_company && lead.company_domain ? 'company_domain' : 'id', a.whole_company && lead.company_domain ? lead.company_domain : lead.id).eq('workspace_id', ctx.workspaceId);
      return { stopped: true, lead: lead.full_name, company: lead.company_name, paused_in_sequences: r.paused, already_stopped: r.alreadyStopped, notes: r.notes.slice(0, 3) };
    },
  }),

  // ---------------------------------------------------------------- Zara
  tool({
    name: 'draft_reply', roles: ['closer'],
    description: 'Draft a reply to a prospect who wrote back (with the founder\'s instruction). If a reply card is pending it is redrafted through the Edit flow. Never sends.',
    params: z.object({ lead: z.string(), instruction: z.string().nullish() }),
    async run(a, ctx) {
      const { lead, error } = await oneLead(ctx, a.lead);
      if (!lead) return error!;
      const appr = await pendingApproval(ctx.workspaceId, 'closer', 'send_reply', [lead.id]);
      if (appr && !ctx.readOnly && ctx.slack) {
        const ok = await editApproval(appr, clip(a.instruction ?? 'redraft', 1000), ctx.slack);
        return ok ? { redrafting: true, lead: lead.full_name, next: 'new Send/Edit card in #sales-hq' } : { redrafting: false, reason: 'card was just decided' };
      }
      const ev = rowsOf(await db().from('lead_events').select('summary').eq('lead_id', lead.id).in('type', ['reply_received', 'reply_classified']).order('occurred_at', { ascending: false }).limit(2));
      return { lead: lead.full_name, company: lead.company_name, they_said: ev.map((e) => clip(e.summary, 200)), intent: lead.last_reply_intent ?? null, instruction: a.instruction ?? null, write_draft_in_answer: true, note: 'Draft only — nothing is sent from chat.' };
    },
  }),
  tool({
    name: 'move_deal_stage', roles: ['closer'],
    description: "Update a lead's deal stage/amount in our pipeline (graph8 deal sync follows on Zara's next deal step).",
    params: z.object({ lead: z.string(), deal_stage: z.string(), amount: z.number().nullish() }),
    async run(a, ctx) {
      const { lead, error } = await oneLead(ctx, a.lead);
      if (!lead) return error!;
      if (ctx.readOnly) return { dry_run: true, would_move: lead.full_name, to: a.deal_stage };
      await db().from('leads').update({ deal_stage: clip(a.deal_stage, 40), ...(a.amount != null ? { deal_amount: a.amount } : {}), stage: 'deal' }).eq('id', lead.id);
      return { done: true, lead: lead.full_name, deal_stage: a.deal_stage, amount: a.amount ?? lead.deal_amount ?? null, deals_url: G8_LINKS.deals };
    },
  }),
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export function toolsFor(role: AgentRole): ChatTool[] {
  return TOOLS.filter((t) => t.roles === 'all' || t.roles.includes(role));
}

/** Run one tool call safely: role check, zod parse, errors → small JSON. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolCtx): Promise<ToolOut> {
  const t = TOOL_BY_NAME.get(name);
  if (!t || !(t.roles === 'all' || t.roles.includes(ctx.role))) return { error: `tool ${name} not available to ${ROLE_NAME[ctx.role]}` };
  const parsed = t.params.safeParse(rawArgs ?? {});
  if (!parsed.success) return { error: `bad arguments: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  try { return await t.run(parsed.data, ctx); } catch (e: any) { return { error: clip(e?.message ?? e, 200) }; }
}

