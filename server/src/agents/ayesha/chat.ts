/**
 * P3 — Chat (mention / DM / thread reply). Gemini classifies intent (D5), code runs the tool:
 * question → T10 facts + answer · delegate → T6 · settings → T11 · pause/resume → T12 · standup → P4 ·
 * not_built → "I can't do that yet" · off_topic → polite decline.
 */
import { z } from 'zod';
import type { RunCtx } from '../../contracts';
import type { AgentRole, JsonObject, TaskKind, WorkspaceSettings } from '../../../../shared/types';
import { llm } from '../../lib/llm';
import { slack } from '../../lib/slack';
import { store } from '../../lib/store';
import { gatherStatus, runStandup } from './standup';
import { errMsg, scrubPii } from './util';

export const CANT_YET = "I can't do that yet. Right now I can find leads, research them, run outreach, and report on the pipeline.";
export const OFF_TOPIC = "That's outside my job. I'm here for your sales 🙂";

export const INTENTS = ['question', 'delegate', 'standup', 'settings', 'pause', 'resume', 'not_built', 'off_topic', 'smalltalk'] as const;
const WORKER_ROLES = ['scout', 'researcher', 'sdr', 'closer'] as const;

export const Intent = z.object({
  intent: z.enum(INTENTS),
  /** delegate: which kind of work */
  work: z.enum(['find_prospects', 'research_leads', 'build_sequence']).nullish(),
  count: z.number().int().nullish(),
  /** settings */
  daily_find: z.number().int().nullish(),
  daily_research: z.number().int().nullish(),
  target_persona: z.string().nullish(),
  target_icp: z.string().nullish(),
  geo: z.array(z.string()).nullish(),
  note: z.string().nullish(),
  /** pause/resume: empty = whole team */
  agents: z.array(z.enum(WORKER_ROLES)).nullish(),
  /** smalltalk / not_built: a short reply in Ayesha's voice */
  reply: z.string().nullish(),
});
export type Intent = z.infer<typeof Intent>;

const CLASSIFY_SYSTEM = `You are the router for Ayesha, Head of Sales of an AI sales team (Bilal scout finds leads, Hira researches, Usman writes and sends sequences, Zara handles replies, meetings and deals). Classify the founder's message:
- question: asks about pipeline, leads, team, credits, plan, status, what someone is doing.
- delegate: asks for work the team does: find more leads (work=find_prospects, count), research leads (research_leads), build/rewrite a sequence (build_sequence).
- standup: asks for the standup / daily summary.
- settings: a lasting preference ("from now on…", "always…", "only target…", change daily numbers, target persona, ICP, geography). Fill daily_find/daily_research/target_persona/target_icp/geo; anything else in note (short, no personal data).
- pause / resume: stop or restart the team or named agents (agents = scout|researcher|sdr|closer; empty = everyone).
- not_built: sales-related but not something the team can do (e.g. write a blog, run ads, change CRM fields, pricing strategy, hire humans, call someone right now).
- off_topic: unrelated to sales (weather, jokes, coding, personal).
- smalltalk: greeting or thanks; put a one-line friendly reply in reply.
Return ONLY this JSON object (omit keys that don't apply):
{"intent": "question"|"delegate"|"standup"|"settings"|"pause"|"resume"|"not_built"|"off_topic"|"smalltalk", "work"?: "find_prospects"|"research_leads"|"build_sequence", "count"?: number, "daily_find"?: number, "daily_research"?: number, "target_persona"?: string, "target_icp"?: string, "geo"?: string[], "note"?: string, "agents"?: ("scout"|"researcher"|"sdr"|"closer")[], "reply"?: string}`;

const ANSWER_SYSTEM = `You are Ayesha, Head of Sales. Crisp, professional, numbers first, 1-3 short sentences. Rarely (about 1 in 5 answers) a light Pakistani touch like "Shabash"; never tack one on at the end. Answer ONLY from the facts given; if a fact is missing say you don't have it yet. Never include emails or phone numbers.`;

interface ChatInput { text: string; kind?: string; channel?: string; threadTs?: string; history?: string[] }

export async function classify(ctx: RunCtx, text: string, history: string[] = []): Promise<Intent> {
  const h = history.slice(-20).join('\n');
  const prompt = (h ? `Recent thread:\n${h}\n\n` : '') + `Founder: ${text}`;
  return llm.json(prompt, Intent, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id, system: CLASSIFY_SYSTEM, temperature: 0 });
}

/** Settings patch from the classifier (T11). Clamped; notes appended, capped at 20. */
export function settingsPatch(i: Intent, cur: WorkspaceSettings): { patch: Partial<WorkspaceSettings>; lines: string[] } {
  const patch: Partial<WorkspaceSettings> = {};
  const lines: string[] = [];
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  if (i.daily_find) { patch.daily_find = clamp(i.daily_find, 1, 50); lines.push(`find ${patch.daily_find} leads a day`); }
  if (i.daily_research) { patch.daily_research = clamp(i.daily_research, 1, 20); lines.push(`research ${patch.daily_research} a day`); }
  if (i.target_persona) { patch.target_persona = i.target_persona.slice(0, 160); lines.push(`target ${patch.target_persona}`); }
  if (i.target_icp) { patch.target_icp = i.target_icp.slice(0, 160); lines.push(`companies: ${patch.target_icp}`); }
  if (i.geo?.length) { patch.geo = i.geo.slice(0, 8); lines.push(`geo ${patch.geo.join(', ')}`); }
  if (i.note) {
    const note = scrubPii(i.note).slice(0, 200);
    patch.notes = [...(cur.notes ?? []), note].slice(-20);
    lines.push(note);
  }
  return { patch, lines };
}

/** T12 — pause/resume agent rows. Ayesha never pauses herself (she must be able to resume). Budget pauses stay. */
export async function setPaused(workspaceId: string, paused: boolean, roles?: readonly string[] | null): Promise<string[]> {
  const targets = roles?.length ? roles : WORKER_ROLES;
  let q = store.db.from('agents')
    .update(paused ? { status: 'paused', pause_reason: 'manual' } : { status: 'idle', pause_reason: null })
    .eq('workspace_id', workspaceId).in('role', targets as string[]);
  if (!paused) q = q.eq('status', 'paused').or('pause_reason.is.null,pause_reason.eq.manual');
  const { data, error } = await q.select('name');
  if (error) throw new Error(error.message ?? 'agents update failed');
  return (data ?? []).map((a: any) => String(a.name));
}

export async function answerQuestion(ctx: RunCtx, text: string): Promise<string> {
  const f = await gatherStatus(ctx.workspaceId);
  const { g8_mailbox_email: _pii, ...safeSettings } = ctx.settings;
  const facts = {
    pipeline: f.pipeline, graph8_credits: f.graph8Credits ?? null, team_paused: f.paused, needs_founder: f.blockers,
    done_last_24h: f.doneRecently,
    agents: f.agents.map((a) => ({ name: a.name, title: a.title, status: a.status, now: a.current_task_title, done: a.tasks_done, open: a.tasks_open, credits_today: a.spent_today_credits })),
    settings: safeSettings,
  };
  await ctx.step('tool', 'get_status', 'facts for answer');
  const prompt = `Facts (JSON):\n${JSON.stringify(facts)}\n\nFounder asks: ${text}`;
  return scrubPii(await llm.text(prompt, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id, system: ANSWER_SYSTEM, temperature: 0.3 }));
}

const DELEGATE: Record<'find_prospects' | 'research_leads' | 'build_sequence', { to: AgentRole; who: string }> = {
  find_prospects: { to: 'scout', who: 'Bilal' },
  research_leads: { to: 'researcher', who: 'Hira' },
  build_sequence: { to: 'sdr', who: 'Usman' },
};

export async function delegateWork(ctx: RunCtx, work: keyof typeof DELEGATE, count?: number | null, note?: string | null): Promise<string> {
  const s = ctx.settings;
  const d = DELEGATE[work];
  const { data: agent } = await store.db.from('agents').select('status').eq('workspace_id', ctx.workspaceId).eq('role', d.to).maybeSingle();
  if (agent?.status === 'paused') return `${d.who} is paused. Say "resume" and I'll get the team going.`;
  const input: JsonObject = { target_persona: s.target_persona ?? null, target_icp: s.target_icp ?? null, geo: s.geo ?? [], requested_by: 'founder_chat' };
  if (note) input.note = scrubPii(note).slice(0, 200);
  let title: string;
  if (work === 'find_prospects') {
    const n = Math.max(1, Math.min(50, count ?? s.daily_find ?? 10));
    input.count = n; input.research_count = s.daily_research ?? 5;
    title = `Find ${n} prospects`;
  } else {
    if (!s.last_run_list_id) return 'Bilal needs to find leads first. Want me to start with that?';
    input.list_id = s.last_run_list_id;
    if (work === 'research_leads') { const n = Math.max(1, Math.min(20, count ?? s.daily_research ?? 5)); input.count = n; title = `Research top ${n} leads`; }
    else title = 'Build outreach sequence';
  }
  const t = await ctx.delegate(d.to, work as TaskKind, title, input, { parentTaskId: ctx.task.id, priority: 1 });
  return `On it. ${d.who} has it: ${title} (T-${t.number}). Progress in #sales-team.`;
}

export async function runChat(ctx: RunCtx): Promise<string> {
  const input = ctx.task.input as unknown as ChatInput;
  const text = String(input.text ?? '').trim();
  const channel = input.channel ?? ctx.task.slack_channel ?? 'hq';
  const threadTs = input.threadTs ?? ctx.task.slack_thread_ts ?? undefined;
  const reply = (t: string) => slack.postAs('head_of_sales', channel, { text: t, threadTs });
  if (!text) { await reply('Yes? Ask me about the pipeline, the team, or tell me what to change.'); return 'empty'; }

  let intent: Intent;
  try { intent = await classify(ctx, text, input.history); }
  catch (e) { ctx.log.warn('classify failed', { err: errMsg(e) }); await reply(CANT_YET); return 'classify failed'; }
  await ctx.step('llm', 'classify', intent.intent);

  let out: string;
  try {
    switch (intent.intent) {
      case 'question': out = await answerQuestion(ctx, text); break;
      case 'delegate': out = await delegateWork(ctx, intent.work ?? 'find_prospects', intent.count, intent.note); break;
      case 'standup': {
        await runStandup(ctx);
        out = 'Standup is up in #sales-hq 👆';
        break;
      }
      case 'settings': {
        const { patch, lines } = settingsPatch(intent, ctx.settings);
        if (!lines.length) { out = 'What should I change? e.g. "from now on find 20 leads a day" or "only target UK".'; break; }
        ctx.settings = await store.patchSettings(ctx.workspaceId, patch);
        await ctx.step('tool', 'update_settings', `changed: ${Object.keys(patch).join(', ')}`);
        out = `Saved ✅ From now on: ${lines.join(' · ')}.`;
        break;
      }
      case 'pause': {
        const names = await setPaused(ctx.workspaceId, true, intent.agents);
        await ctx.step('tool', 'pause_team', `${names.length} paused`);
        out = names.length ? `Paused ${names.join(', ')} ⏸ Nothing new goes out until you say "resume".` : 'Nobody to pause.';
        break;
      }
      case 'resume': {
        const names = await setPaused(ctx.workspaceId, false, intent.agents);
        await ctx.step('tool', 'resume_team', `${names.length} resumed`);
        out = names.length ? `Back to work ▶️ ${names.join(', ')}.` : 'Everyone is already working.';
        break;
      }
      case 'smalltalk': out = intent.reply?.trim() || 'Wa Alaikum Assalam! Ask me how the pipeline is doing anytime.'; break;
      case 'off_topic': out = OFF_TOPIC; break;
      case 'not_built':
      default: out = CANT_YET;
    }
  } catch (e) {
    ctx.log.error('chat handler failed', { intent: intent.intent, err: errMsg(e) });
    out = `Something went wrong on my side (${errMsg(e)}). Try again in a minute.`;
  }
  out = scrubPii(out);
  await reply(out);
  await ctx.report('answer', `Chat: ${intent.intent}`, out, { intent: intent.intent });
  return out;
}
