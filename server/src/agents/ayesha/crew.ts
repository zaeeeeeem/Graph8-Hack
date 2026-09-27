/**
 * Talk to any agent by name ("Bilal, find 5 fintech CFOs in Dubai", "Zara any replies?").
 * Runs off the bus (no queue wait): a scoped Gemini classifier picks question / work / revise / draft_reply / handoff,
 * then the addressed agent answers in ITS OWN persona in a thread under the founder's message.
 *   question    → Gemini answer from that agent's facts (Supabase, no PII)
 *   work        → runtime.enqueue straight to that agent (its normal checklist follows) + short in-voice ack
 *   revise      → Usman: note on the pending launch card goes through the runtime's Edit flow
 *   draft_reply → Zara: note on a pending reply card → Edit flow; else a draft in the thread (never sent)
 *   handoff     → "That's Zara's call — Zara, over to you" and the right agent takes it (Ayesha for settings/pause/…)
 */
import { z } from 'zod';
import type { BusEvents, SlackCtx } from '../../contracts';
import type { AgentRole, JsonObject, UUID } from '../../../../shared/types';
import { bus } from '../../lib/bus';
import { llm } from '../../lib/llm';
import { slack } from '../../lib/slack';
import { store } from '../../lib/store';
import { voiceLine } from '../../lib/voice';
import { runtime } from '../runtime';
import { gatherStatus } from './standup';
import { errMsg, scrubPii } from './util';

export type CrewRole = Exclude<AgentRole, 'head_of_sales'>;
const NAMES = { ayesha: 'head_of_sales', bilal: 'scout', hira: 'researcher', usman: 'sdr', zara: 'closer' } as const;
type Name = keyof typeof NAMES;

export const CREW: Record<CrewRole, { name: string; title: string; style: string; scope: string; work?: string }> = {
  scout: {
    name: 'Bilal', title: 'Scout', style: 'quick, curious, upbeat',
    scope: 'finding prospects; questions about the leads found, how many, who they are and how well they fit',
    work: 'find prospects (fill count, persona = job titles + company type, icp, geo)',
  },
  researcher: {
    name: 'Hira', title: 'Researcher', style: 'precise, calm',
    scope: 'researching leads; questions about research, hooks, why-now signals and enrichment (who has a verified email/phone, never the address itself)',
    work: 'research leads from the latest list (fill count)',
  },
  sdr: {
    name: 'Usman', title: 'SDR', style: 'energetic, brief',
    scope: 'building outreach sequences; revising sequence copy; questions about sequences, emails sent, opens and clicks',
    work: 'build an outreach sequence for the researched leads',
  },
  closer: {
    name: 'Zara', title: 'Closer', style: 'confident, friendly',
    scope: "questions about replies, meetings and deals; drafting a reply to a prospect who wrote back ('draft a reply to X')",
  },
};

export const CrewIntent = z.object({
  intent: z.enum(['question', 'work', 'revise', 'draft_reply', 'handoff', 'smalltalk', 'off_topic']),
  handoff_to: z.enum(['ayesha', 'bilal', 'hira', 'usman', 'zara']).nullish(),
  count: z.number().int().nullish(),
  persona: z.string().nullish(),
  icp: z.string().nullish(),
  geo: z.array(z.string()).nullish(),
  note: z.string().nullish(),
  lead_name: z.string().nullish(),
  reply: z.string().nullish(),
});
export type CrewIntent = z.infer<typeof CrewIntent>;

export function classifySystem(role: CrewRole): string {
  const me = CREW[role];
  const intents = [
    `- question: asks about something in YOUR scope (${me.scope}).`,
    me.work ? `- work: asks you to ${me.work}.` : '',
    role === 'sdr' ? '- revise: asks to change the copy/tone/length of the sequence waiting for launch; put the instruction in note.' : '',
    role === 'closer' ? '- draft_reply: asks you to draft/write a reply to a prospect; lead_name = their name, note = any instruction.' : '',
    `- handoff: anything outside your scope that a teammate owns; handoff_to = ayesha (settings, "from now on…", daily numbers, targeting changes, pause/resume, standup, plan, credits, team status, anything else) | bilal (finding leads) | hira (research) | usman (sequences, sends) | zara (replies, meetings, deals).`,
    '- smalltalk: greeting or thanks; put a one-line friendly reply in your voice in reply.',
    '- off_topic: unrelated to sales (weather, jokes, coding, personal).',
  ].filter(Boolean).join('\n');
  return `You are the router for ${me.name} (${me.title}) on an AI sales team: Ayesha Head of Sales, Bilal finds leads, Hira researches them, Usman writes and sends sequences, Zara handles replies, meetings and deals. The founder is talking to ${me.name}. Classify the message:
${intents}
Return ONLY this JSON object (omit keys that don't apply):
{"intent": "question"|"work"|"revise"|"draft_reply"|"handoff"|"smalltalk"|"off_topic", "handoff_to"?: "ayesha"|"bilal"|"hira"|"usman"|"zara", "count"?: number, "persona"?: string, "icp"?: string, "geo"?: string[], "note"?: string, "lead_name"?: string, "reply"?: string}`;
}

export function answerSystem(role: CrewRole): string {
  const me = CREW[role];
  return `You are ${me.name}, ${me.title} on an AI sales team (${me.style}). You own: ${me.scope}. Answer the founder in 1-3 short sentences, numbers first, in first person. Answer ONLY from the facts given; if a fact is missing say you don't have it yet. Occasionally (1 in 5) a light Pakistani touch like "Chalo" or "Shabash", never tacked on at the end. Never include emails or phone numbers.`;
}

// ------------------------------------------------------------------------------------------------ facts (no PII)
const clip = (s: unknown, n: number) => scrubPii(String(s ?? '')).slice(0, n);
const rows = (r: { data?: any[] | null }) => (r.data ?? []) as any[];
const leadCols = 'id,full_name,job_title,company_name,location,stage,fit_score,why_now,signals,research,last_reply_intent,meeting_at,deal_amount,deal_stage,created_at';

function leadFact(l: any, extra: 'fit' | 'research' | 'deal') {
  const base: JsonObject = { name: l.full_name, title: l.job_title ?? null, company: l.company_name ?? null, stage: l.stage };
  if (extra === 'fit') Object.assign(base, { location: l.location ?? null, fit: l.fit_score ?? null, fit_reason: clip(l.research?.reason, 160) || null });
  if (extra === 'research') {
    const r = l.research ?? {};
    Object.assign(base, {
      why_now: clip(l.why_now, 200) || null,
      signals: (Array.isArray(l.signals) ? l.signals : []).slice(0, 3).map((s: any) => clip(s?.summary ?? s?.title ?? s, 120)),
      hook: clip(r.hook ?? r.hooks?.[0] ?? r.angle, 200) || null,
      has_email: r.has_email ?? null, has_phone: r.has_phone ?? null,
    });
  }
  if (extra === 'deal') Object.assign(base, { reply_intent: l.last_reply_intent ?? null, meeting_at: l.meeting_at ?? null, deal_amount: l.deal_amount ?? null, deal_stage: l.deal_stage ?? null });
  return base;
}

export async function pendingApproval(ws: UUID, role: CrewRole, kind: 'launch_sequence' | 'send_reply', leadIds?: UUID[]) {
  const me = await store.agentByRole(ws, role);
  let q = store.db.from('approvals').select('id,title,lead_id,slack_ts,slack_channel,status,created_at')
    .eq('workspace_id', ws).eq('requested_by_agent_id', me.id).eq('kind', kind).eq('status', 'pending');
  if (leadIds?.length) q = q.in('lead_id', leadIds);
  const { data } = await q.order('created_at', { ascending: false }).limit(1);
  return (data?.[0] ?? null) as null | { id: UUID; title: string; lead_id: UUID | null; slack_ts: string | null; slack_channel: string | null };
}

/** Facts for one agent's answers: shared pipeline + own row + role-scoped data from Supabase. */
export async function crewFacts(ws: UUID, role: CrewRole): Promise<JsonObject> {
  const db = store.db;
  const f = await gatherStatus(ws);
  const me = f.agents.find((a) => a.role === role);
  const facts: JsonObject = {
    pipeline: f.pipeline as unknown as JsonObject,
    me: me ? { status: me.status, now: me.current_task_title, tasks_done: me.tasks_done, tasks_open: me.tasks_open, credits_today: Number(me.spent_today_credits || 0) } : null,
  };
  const since = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
  if (role === 'scout') {
    const r = await db.from('leads').select(leadCols).eq('workspace_id', ws).order('created_at', { ascending: false }).limit(12);
    facts.recent_leads = rows(r).map((l) => leadFact(l, 'fit'));
  } else if (role === 'researcher') {
    const r = await db.from('leads').select(leadCols).eq('workspace_id', ws).in('stage', ['researched', 'queued', 'contacted', 'replied', 'meeting', 'deal']).order('created_at', { ascending: false }).limit(10);
    facts.researched_leads = rows(r).map((l) => leadFact(l, 'research'));
  } else if (role === 'sdr') {
    const [seq, sent, appr] = await Promise.all([
      db.from('sequences').select('name,status,channels,steps,lead_count,enrolled_count,stats,launched_at').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(3),
      db.from('lead_events').select('type').eq('workspace_id', ws).in('type', ['email_sent', 'email_opened', 'email_clicked', 'email_bounced']).gte('occurred_at', since(7)).limit(1000),
      pendingApproval(ws, role, 'launch_sequence'),
    ]);
    facts.sequences = rows(seq).map((s) => ({ name: clip(s.name, 80), status: s.status, channels: s.channels, steps: Array.isArray(s.steps) ? s.steps.length : 0, leads: s.lead_count, enrolled: s.enrolled_count, stats: s.stats ?? {}, launched_at: s.launched_at }));
    const count = (t: string) => rows(sent).filter((e) => e.type === t).length;
    facts.last_7_days = { sent: count('email_sent'), opened: count('email_opened'), clicked: count('email_clicked'), bounced: count('email_bounced') };
    facts.waiting_for_launch = appr ? clip(appr.title, 120) : null;
  } else {
    const [ev, leads, appr] = await Promise.all([
      db.from('lead_events').select('type,summary,lead_id,occurred_at').eq('workspace_id', ws).in('type', ['reply_received', 'reply_classified', 'reply_sent', 'meeting_booked', 'meeting_rescheduled', 'meeting_cancelled', 'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost']).gte('occurred_at', since(14)).order('occurred_at', { ascending: false }).limit(15),
      db.from('leads').select(leadCols).eq('workspace_id', ws).in('stage', ['replied', 'meeting', 'deal', 'won', 'lost']).order('created_at', { ascending: false }).limit(15),
      pendingApproval(ws, role, 'send_reply'),
    ]);
    const names = new Map(rows(leads).map((l) => [l.id, l.full_name]));
    facts.recent_activity = rows(ev).map((e) => ({ type: e.type, lead: names.get(e.lead_id) ?? null, summary: clip(e.summary, 160), at: e.occurred_at }));
    facts.engaged_leads = rows(leads).map((l) => leadFact(l, 'deal'));
    facts.reply_waiting_for_you = appr ? clip(appr.title, 120) : null;
  }
  return facts;
}

// ------------------------------------------------------------------------------------------------ actions
interface Say { (text: string, fallbackOnly?: boolean): Promise<void> }

async function startWork(role: CrewRole, i: CrewIntent, text: string, c: SlackCtx, say: Say): Promise<string> {
  const ws = c.workspaceId;
  const s = await store.settings(ws);
  const { data: agent } = await store.db.from('agents').select('status').eq('workspace_id', ws).eq('role', role).maybeSingle();
  if (agent?.status === 'paused') { await say(`I'm paused right now. Ask Ayesha to resume me and I'll pick this up.`, true); return 'paused'; }
  const input: JsonObject = { requested_by: 'founder_chat', request: clip(text, 300) };
  if (i.note) input.note = clip(i.note, 200);
  let kind: 'find_prospects' | 'research_leads' | 'build_sequence';
  let title: string;
  if (role === 'scout') {
    const n = Math.max(1, Math.min(50, i.count ?? s.daily_find ?? 10));
    const persona = clip(i.persona, 160) || s.target_persona || null;
    const icp = clip(i.icp, 160) || (i.persona ? '' : s.target_icp ?? '');
    Object.assign(input, {
      count: n, research_count: Math.min(n, s.daily_research ?? 5), target_persona: persona,
      target_icp: icp || s.target_icp || null, geo: i.geo?.length ? i.geo.slice(0, 8) : s.geo ?? [],
    });
    kind = 'find_prospects';
    title = `Find ${n} prospects${persona ? `: ${persona}${i.icp ? ` at ${icp}` : ''}` : ''}${i.geo?.length ? ` in ${i.geo.join(', ')}` : ''}`;
  } else if (role === 'researcher' || role === 'sdr') {
    if (!s.last_run_list_id) { await say(`I need a list from Bilal first. Say "Bilal, find 10 leads" and I'll take it from there.`, true); return 'no list'; }
    input.list_id = s.last_run_list_id;
    if (role === 'researcher') {
      const n = Math.max(1, Math.min(20, i.count ?? s.daily_research ?? 5));
      input.count = n; kind = 'research_leads'; title = `Research top ${n} leads`;
    } else { kind = 'build_sequence'; title = 'Build outreach sequence'; }
  } else {
    await say("That one isn't mine to start. Ask me about replies, meetings or deals.", true);
    return 'no work';
  }
  const t = await runtime.enqueue(ws, role, kind, title.slice(0, 120), input, { priority: 1, slack: c });
  await say(`On it. ${title} (T-${t.number}). My checklist is in #sales-team.`);
  return `enqueued T-${t.number}`;
}

/**
 * Edit flow via the runtime: mark the card edit_requested, then hand it the note as a reply in the card's thread
 * (exactly what [Edit] + a thread reply does). The owning agent revises and re-asks.
 */
export async function editApproval(a: { id: UUID; slack_ts: string | null; slack_channel: string | null }, note: string, c: SlackCtx): Promise<boolean> {
  if (!a.slack_ts || !a.slack_channel) return false;
  const { data } = await store.db.from('approvals').update({ status: 'edit_requested', decided_by_slack_user: c.userId, decided_at: new Date().toISOString() })
    .eq('id', a.id).eq('status', 'pending').select('id');
  if (!data?.length) return false;
  bus.emit('slack.message', { kind: 'thread_reply', text: note, ctx: { ...c, channel: a.slack_channel, threadTs: a.slack_ts, messageTs: c.messageTs } });
  return true;
}

async function revise(i: CrewIntent, text: string, c: SlackCtx, say: Say): Promise<string> {
  const a = await pendingApproval(c.workspaceId, 'sdr', 'launch_sequence');
  const note = clip(i.note || text, 1000);
  if (!a) { await say('Nothing is waiting for launch right now. Say "Usman, build a sequence" and I\'ll write one with that in mind.', true); return 'no pending launch'; }
  if (!(await editApproval(a, note, c))) { await say('That card was just decided, so there is nothing to edit.', true); return 'edit raced'; }
  await say('Got it, rewriting the sequence with your note. A fresh launch card is coming to #sales-hq.');
  return `edit ${a.id}`;
}

async function draftReply(i: CrewIntent, text: string, c: SlackCtx, say: Say, agentId: UUID): Promise<string> {
  const ws = c.workspaceId;
  const who = (i.lead_name ?? '').trim();
  let q = store.db.from('leads').select(leadCols).eq('workspace_id', ws).in('stage', ['replied', 'meeting', 'deal', 'won', 'lost']);
  if (who) q = q.or(`full_name.ilike.%${who.replace(/[%,()]/g, '')}%,company_name.ilike.%${who.replace(/[%,()]/g, '')}%`);
  const { data } = await q.order('last_activity_at', { ascending: false }).limit(1);
  const lead = data?.[0] as any;
  if (!lead) { await say(who ? `I don't see a reply from ${who} yet.` : 'Who should I reply to? Give me their name.', true); return 'no lead'; }
  const a = await pendingApproval(ws, 'closer', 'send_reply', [lead.id]);
  if (a) {
    const ok = await editApproval(a, clip(i.note || text, 1000), c);
    await say(ok ? `Redrafting my reply to ${lead.full_name} with your note. The new card lands in #sales-hq.` : 'That reply card was just decided.', true);
    return ok ? `edit ${a.id}` : 'edit raced';
  }
  const { data: ev } = await store.db.from('lead_events').select('summary,type').eq('workspace_id', ws).eq('lead_id', lead.id)
    .in('type', ['reply_received', 'reply_classified']).order('occurred_at', { ascending: false }).limit(3);
  const s = await store.settings(ws);
  const prompt = `Prospect: ${lead.full_name}${lead.job_title ? `, ${lead.job_title}` : ''}${lead.company_name ? ` at ${lead.company_name}` : ''}.
What they said / intent: ${rows({ data: ev }).map((e) => clip(e.summary, 200)).join(' | ') || lead.last_reply_intent || 'unknown'}.
Founder's instruction: ${clip(i.note || text, 300)}.
${s.g8_booking_url ? `Booking link: ${s.g8_booking_url}` : ''}
Write the email reply body only (max 90 words, plain text, no subject, no placeholders, sign off with the founder's first name as "[founder]").`;
  const draft = scrubPii(await llm.text(prompt, { agentId, workspaceId: ws, system: 'You are Zara, a friendly, confident closer. Short, human, one clear next step.', temperature: 0.5 }));
  await say(`Draft for ${lead.full_name} (not sent):\n>>> ${draft.trim()}`, true);
  return 'drafted';
}

// ------------------------------------------------------------------------------------------------ entry
export interface CrewChat { role: CrewRole; text: string; ctx: SlackCtx; kind: BusEvents['slack.message']['kind']; hops?: number }

/** Ayesha takes it the normal way (answer_question on her queue), in the same thread. */
async function toAyesha(text: string, c: SlackCtx, kind: string, threadTs: string | undefined) {
  await runtime.enqueue(c.workspaceId, 'head_of_sales', 'answer_question', `Chat: ${text.slice(0, 60)}`, {
    text, kind, channel: c.channel, threadTs: threadTs ?? null,
  }, { priority: 1, slack: c });
}

export async function runCrewChat(m: CrewChat): Promise<string> {
  const { role, ctx: c } = m;
  const text = m.text.trim();
  const ws = c.workspaceId;
  const me = CREW[role];
  const agent = await store.agentByRole(ws, role);
  const threadTs = c.threadTs ?? c.messageTs;
  const opts = { agentId: agent.id, workspaceId: ws };
  const say: Say = async (t, fallbackOnly) => {
    const line = fallbackOnly ? t : await voiceLine(role, t, opts);
    await slack.postAs(role, c.channel, { text: scrubPii(line), threadTs });
  };

  let i: CrewIntent;
  try {
    i = await llm.json(`Founder: ${text}`, CrewIntent, { ...opts, system: classifySystem(role), temperature: 0 });
  } catch (e) {
    await say(`Sorry, I didn't catch that. Try again in a minute. (${errMsg(e)})`, true);
    return 'classify failed';
  }
  try {
    switch (i.intent) {
      case 'question': {
        const facts = await crewFacts(ws, role);
        const out = await llm.text(`Facts (JSON):\n${JSON.stringify(facts)}\n\nFounder asks: ${text}`, { ...opts, system: answerSystem(role), temperature: 0.3 });
        await say(out.trim() || "I don't have that yet.", true);
        return 'answered';
      }
      case 'work': return await startWork(role, i, text, c, say);
      case 'revise': return role === 'sdr' ? await revise(i, text, c, say) : await startWork(role, i, text, c, say);
      case 'draft_reply':
        if (role === 'closer') return await draftReply(i, text, c, say, agent.id);
        return await handoff(m, 'zara', say, threadTs);
      case 'handoff': return await handoff(m, i.handoff_to ?? 'ayesha', say, threadTs);
      case 'smalltalk': await say(i.reply?.trim() || `Here! Ask me anything about ${me.scope.split(';')[0]}.`, true); return 'smalltalk';
      case 'off_topic':
      default: await say(`That's outside my job. I'm here for your sales 🙂`, true); return 'off_topic';
    }
  } catch (e) {
    await say(`Something went wrong on my side (${errMsg(e)}). Try again in a minute.`, true);
    return 'failed';
  }
}

async function handoff(m: CrewChat, to: Name, say: Say, threadTs: string | undefined): Promise<string> {
  const target = NAMES[to] as AgentRole;
  const targetName = to[0].toUpperCase() + to.slice(1);
  // A loop guard: never bounce twice, and never hand to yourself — Ayesha takes anything unresolved.
  const next: AgentRole = target === m.role || (m.hops ?? 0) >= 1 ? 'head_of_sales' : target;
  const nextName = next === 'head_of_sales' ? 'Ayesha' : targetName;
  await say(`That's ${nextName}'s call. ${nextName}, over to you.`, true);
  if (next === 'head_of_sales') { await toAyesha(m.text, m.ctx, m.kind, threadTs); return 'handoff ayesha'; }
  await runCrewChat({ ...m, role: next as CrewRole, hops: (m.hops ?? 0) + 1, ctx: { ...m.ctx, threadTs } });
  return `handoff ${next}`;
}
