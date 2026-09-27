/**
 * Tool-calling chat for all 5 agents (docs/CHAT-BANK.md). One Gemini function-calling loop, persona system prompt per
 * agent, tools from chat/tools.ts filtered by role, ≤ 5 tool calls per answer, thread memory = last 15 Slack messages.
 *   agentChat()     pure loop → { text, blocks, calls } (used by the replay script and ask_agent / hand_off)
 *   postAgentChat() fetch thread history, run the loop, post the answer in the agent's persona (+ lead cards)
 */
import { GoogleGenAI, FunctionCallingConfigMode, type Content, type FunctionDeclaration, type Part } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Block, RunCtx, SlackCtx } from '../contracts';
import type { AgentRole, UUID } from '../../../shared/types';
import { env } from '../lib/env';
import { log as rootLog } from '../lib/log';
import { slack, slackClient } from '../lib/slack';
import { LLM_TOKENS_PER_CREDIT, store } from '../lib/store';
import { scrubPii } from '../agents/ayesha/util';
import { ROLE_NAME, runTool, toolsFor, type ToolCtx, type ToolOut } from './tools';

const log = rootLog.child('agent-chat');
export const MAX_TOOL_CALLS = 5;
export const HISTORY_LIMIT = 15;
let _ai: GoogleGenAI | undefined;
const ai = () => (_ai ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));

export interface HistoryMsg { who: string; text: string }
export interface ToolTrace { name: string; args: unknown; result: ToolOut }
export interface ChatResult {
  text: string;
  blocks: Block[];
  calls: ToolTrace[];
  /** A worker handed the request to a teammate: that teammate's answer, to post in their own voice. */
  handoff?: { role: AgentRole; text: string; blocks: Block[] };
  /** Answers from teammates Ayesha asked (for traces). */
  asked?: Array<{ role: AgentRole; text: string; calls: ToolTrace[] }>;
}
export interface ChatOpts {
  role: AgentRole;
  text: string;
  workspaceId: UUID;
  history?: HistoryMsg[];
  slack?: SlackCtx;
  run?: RunCtx;
  readOnly?: boolean;
  depth?: number;
  /** Set by ask_agent: the question comes from Ayesha, not the founder. */
  askedBy?: AgentRole;
}

// ------------------------------------------------------------------------------------------------ personas
const TEAM = 'Ayesha (Head of Sales, manager), Bilal (Scout: finds prospects in graph8), Hira (Researcher: research packs, hooks, contact checks), Usman (SDR: writes and launches outreach sequences), Zara (Closer: replies, meetings, deals)';

const VOICE: Record<AgentRole, { title: string; style: string; job: string }> = {
  head_of_sales: {
    title: 'Head of Sales', style: 'crisp, warm, numbers first',
    job: `You are the manager. The founder talks to you by default.
- Work requests (find leads, research, build a sequence) → assign_task to the right teammate with EVERY constraint the founder gave (count, titles, industry, country, company size, companies, signals). Put industries exactly as said ("software"). Never swap in the default persona for something the founder specified.
- Big goals ("get me 3 meetings with UK fintech CFOs") → plan_goal, then state the plan in ≤ 4 short lines.
- "Ask Hira…", "on my behalf", "why did Bilal pick…", "check on Usman" → ask_agent, then relay: "Hira says: …" (their words, shortened).
- Lasting preferences ("from now on…") → update_settings. Pause/resume → pause_agents. Budgets → set_budget. "Run today's batch" / standup → run_daily_batch.
- Questions about a lead → find_lead yourself and answer from its facts (fit breakdown, why-now hook).
- "What can you do / help" → 4 short bullets with example asks (no tools).`,
  },
  scout: {
    title: 'Scout', style: 'quick, curious, upbeat',
    job: `You find prospects. Searches → search_prospects with the founder's exact filters (never drift to defaults); look-alikes → find_lookalikes; people at a company → search_company_people; intent → intent_companies. Explain picks from fit_breakdown and fit_reason.`,
  },
  researcher: {
    title: 'Researcher', style: 'precise, calm',
    job: `You research leads. Explain fit and hooks from find_lead facts (fit_breakdown, why_now, talking_points, company_facts, channels). "Contact points" = which channels we can use (email / phone / LinkedIn) and whether they are verified — name the leads, never the addresses. Research asks → research_leads; company questions → company_deep_dive; bad fits → disqualify_lead.`,
  },
  sdr: {
    title: 'SDR', style: 'energetic, brief',
    job: `You write and run outreach sequences. Build → build_sequence; change copy (shorter, casual, mention a case study) → revise_copy; show the email → preview_email; stop someone → stop_lead; send stats → get_sequences.`,
  },
  closer: {
    title: 'Closer', style: 'confident, friendly',
    job: `You handle replies, meetings and deals. Replies → get_replies; draft a reply → draft_reply then write the draft (≤ 90 words) in your answer, marked "Draft (not sent)"; meetings → get_meetings; deals → get_deals / move_deal_stage; do-not-contact → stop_lead. Bookings and sends only ever go to allowlisted test contacts.`,
  },
};

export function systemPrompt(role: AgentRole, opts: { askedBy?: AgentRole; companyName?: string; canHandOff: boolean }): string {
  const me = VOICE[role];
  const name = ROLE_NAME[role];
  const asker = opts.askedBy ? `${ROLE_NAME[opts.askedBy]} (your manager) is asking you on the founder's behalf; answer her directly.` : 'You are talking to the founder in Slack.';
  return `You are ${name}, ${me.title} on Graphi, the AI sales team${opts.companyName ? ` for ${opts.companyName}` : ''}. Team: ${TEAM}. Style: ${me.style}. ${asker}

${me.job}

Rules:
- Get facts with tools; never guess and never say "I don't have the details" before calling find_lead / the right read tool. When a person or company is named, call find_lead first.
- Use the thread so far to resolve "he", "that one", "those", "the other one".
- Final answer: at most 4 short sentences (or up to 5 short bullets for lists/plans), first person, plain Slack text, numbers first. Rarely (1 in 5) a light Pakistani touch like "Chalo" or "Shabash".
- Privacy: never write an email address or phone number. If asked for them, call contact_details_link, say we keep them out of Slack for privacy, and give the graph8 link as <url|Open in graph8>.
- Slack formatting: bold is *single asterisks*, links are <url|label> (at most 2).
- When you started work, say who has it with the T-number and that progress is in #sales-team.
- If no tool can do it: "I can't do that yet" + the nearest thing the team can do.${opts.canHandOff ? `
- Not your job (e.g. replies for Bilal, settings/pause for anyone but Ayesha)? Call hand_off with the right teammate; then just say one line like "That's Zara's call, over to her."` : ''}
- Unrelated to sales: one friendly line saying it's outside your job.`;
}

// ------------------------------------------------------------------------------------------------ loop
function declarations(role: AgentRole, canHandOff: boolean): FunctionDeclaration[] {
  return toolsFor(role)
    .filter((t) => canHandOff || t.name !== 'hand_off')
    .map((t) => {
      const js = zodToJsonSchema(t.params, { $refStrategy: 'none' }) as Record<string, unknown>;
      delete js.$schema;
      return { name: t.name, description: t.description, parametersJsonSchema: js };
    });
}

function historyText(h: HistoryMsg[] | undefined): string {
  const rows = (h ?? []).slice(-HISTORY_LIMIT).map((m) => `${m.who}: ${scrubPii(m.text).replace(/\s+/g, ' ').slice(0, 400)}`);
  return rows.length ? `Thread so far (oldest first):\n${rows.join('\n')}\n\n` : '';
}

async function spend(o: ChatOpts, agentId: UUID, usage: any) {
  const total = usage?.totalTokenCount ?? 0;
  await store.spend({
    workspaceId: o.workspaceId, agentId, taskId: o.run?.task.id, source: 'llm', action: 'llm_run',
    credits: Math.max(1, Math.ceil(total / LLM_TOKENS_PER_CREDIT)),
    meta: { input_tokens: usage?.promptTokenCount ?? 0, output_tokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0), note: `${env.GEMINI_MODEL} chat` },
  }).catch((e) => log.warn('spend failed', { err: String(e?.message ?? e) }));
}

async function generate(req: Parameters<GoogleGenAI['models']['generateContent']>[0]) {
  for (let attempt = 0; ; attempt++) {
    try { return await ai().models.generateContent(req); } catch (err: any) {
      const status = Number(err?.status ?? err?.code);
      if (attempt === 0 && (!status || status === 429 || status >= 500)) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      throw err;
    }
  }
}

export async function agentChat(o: ChatOpts): Promise<ChatResult> {
  const depth = o.depth ?? 0;
  const agent = await store.agentByRole(o.workspaceId, o.role);
  const canHandOff = o.role !== 'head_of_sales' && depth === 0;
  const result: ChatResult = { text: '', blocks: [], calls: [] };
  let companyName: string | undefined;
  try { companyName = (await store.workspace(o.workspaceId)).name ?? undefined; } catch { /* optional */ }

  const tctx: ToolCtx = {
    workspaceId: o.workspaceId, role: o.role, agentId: agent.id, slack: o.slack, run: o.run, readOnly: o.readOnly, depth, blocks: [],
    askAgent: async (role, question) => {
      const r = await agentChat({ ...o, role, text: question, depth: depth + 1, askedBy: o.role === 'head_of_sales' ? 'head_of_sales' : undefined, run: undefined });
      (result.asked ??= []).push({ role, text: r.text, calls: r.calls });
      if (o.role !== 'head_of_sales') result.handoff = { role, text: r.text, blocks: r.blocks };
      return r.text;
    },
  };

  const contents: Content[] = [{ role: 'user', parts: [{ text: `${historyText(o.history)}${o.askedBy ? `${ROLE_NAME[o.askedBy]} asks` : 'Founder says'}: ${o.text}` }] }];
  const config = {
    systemInstruction: systemPrompt(o.role, { askedBy: o.askedBy, companyName, canHandOff }),
    temperature: 0.3,
    tools: [{ functionDeclarations: declarations(o.role, canHandOff) }],
  };
  let calls = 0;
  for (let turn = 0; turn < MAX_TOOL_CALLS + 2; turn++) {
    const force = calls >= MAX_TOOL_CALLS || turn === MAX_TOOL_CALLS + 1;
    const res = await generate({
      model: env.GEMINI_MODEL, contents,
      config: { ...config, toolConfig: { functionCallingConfig: { mode: force ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO } }, abortSignal: AbortSignal.timeout(90_000) },
    });
    if (!o.readOnly) await spend(o, agent.id, res.usageMetadata);
    const fcs = res.functionCalls ?? [];
    if (!fcs.length || force) { result.text = (res.text ?? '').trim(); break; }
    // Keep the model turn as-is (Gemini 3 thought signatures must round-trip with the function calls).
    const modelContent = res.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);
    const parts: Part[] = [];
    for (const fc of fcs) {
      const name = fc.name ?? '';
      if (calls >= MAX_TOOL_CALLS) { parts.push({ functionResponse: { id: fc.id, name, response: { error: 'tool budget used up; answer now with what you have' } } }); continue; }
      calls++;
      const out = await runTool(name, fc.args ?? {}, tctx);
      result.calls.push({ name, args: fc.args ?? {}, result: out });
      await o.run?.step('tool', `chat:${name}`, `${name}(${JSON.stringify(fc.args ?? {}).slice(0, 120)})`).catch(() => undefined);
      parts.push({ functionResponse: { id: fc.id, name, response: { result: JSON.parse(JSON.stringify(out)) } } });
    }
    contents.push({ role: 'user', parts });
  }
  result.text = scrubPii(result.text || "I don't have that yet.").replace(/\*\*(.+?)\*\*/g, '*$1*');
  result.blocks = tctx.blocks.slice(0, 20);
  return result;
}

// ------------------------------------------------------------------------------------------------ Slack
const PERSONA_NAMES = /(ayesha|bilal|hira|usman|zara)/i;

/** Last 15 messages of the thread (excluding the current one), oldest first. Slack failures → no history. */
export async function threadHistory(c: SlackCtx): Promise<HistoryMsg[]> {
  const ts = c.threadTs;
  if (!ts || env.SLACK_DISABLED) return [];
  try {
    const res: any = await slackClient().conversations.replies({ channel: c.channel, ts, limit: 50 });
    const msgs = ((res.messages ?? []) as any[]).filter((m) => m.ts !== c.messageTs);
    return msgs.slice(-HISTORY_LIMIT).map((m) => {
      const persona = m.bot_id ? (PERSONA_NAMES.exec(String(m.username ?? m.bot_profile?.name ?? ''))?.[1] ?? 'Team') : 'Founder';
      const who = persona === 'Founder' || persona === 'Team' ? persona : persona[0].toUpperCase() + persona.slice(1).toLowerCase();
      return { who, text: String(m.text ?? '').replace(/<@[A-Z0-9]+>/g, '').trim() };
    }).filter((m) => m.text);
  } catch (e: any) {
    log.warn('thread history failed', { err: String(e?.message ?? e) });
    return [];
  }
}

const answerBlocks = (text: string, extra: Block[]): Block[] | undefined =>
  extra.length ? [{ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }, ...extra].slice(0, 45) : undefined;

/** Run an agent's chat on a founder message and post the answer (and any hand-off answer) in the thread. */
export async function postAgentChat(p: { role: AgentRole; text: string; slack: SlackCtx; run?: RunCtx; history?: HistoryMsg[] }): Promise<ChatResult> {
  const threadTs = p.slack.threadTs ?? p.slack.messageTs;
  const history = p.history ?? await threadHistory(p.slack);
  // Throws when Gemini fails outright; callers fall back to the classic classifier chat.
  const r = await agentChat({ role: p.role, text: p.text, workspaceId: p.slack.workspaceId, history, slack: { ...p.slack, threadTs }, run: p.run });
  await slack.postAs(p.role, p.slack.channel, { text: r.text, blocks: answerBlocks(r.text, r.handoff ? [] : r.blocks), threadTs });
  if (r.handoff) {
    const h = r.handoff;
    await slack.postAs(h.role, p.slack.channel, { text: scrubPii(h.text), blocks: answerBlocks(scrubPii(h.text), h.blocks), threadTs });
  }
  return r;
}
