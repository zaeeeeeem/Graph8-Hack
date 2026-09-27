/** Z-T2 classify_reply — Gemini JSON over REPLY_INTENT_VALUES, keyword fallback if the LLM fails. */
import { z } from 'zod';
import { llm } from '../../lib/llm';
import { REPLY_INTENT_VALUES, type ReplyIntent, type UUID } from '../../../../shared/types';

export const ClassificationSchema = z.object({
  intent: z.enum(REPLY_INTENT_VALUES),
  /** ISO date the prospect is back (out_of_office). */
  ooo_until: z.string().nullable().optional(),
  /** ISO datetime when the prospect proposed a concrete meeting time ("Tuesday 3pm works"). */
  proposed_time: z.string().nullable().optional(),
  /** Name/role of the person they referred us to — never an address. */
  referral: z.string().nullable().optional(),
  /** One short sentence, no email addresses or phone numbers. */
  summary: z.string().optional(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

/** Intents Zara handles without asking the founder (Z1). */
export const AUTO_INTENTS: ReplyIntent[] = ['interested', 'out_of_office', 'unsubscribe', 'not_now'];

export async function classifyReply(text: string, ctx: {
  agentId: UUID; workspaceId: UUID; taskId?: UUID; leadName?: string; company?: string; timezone: string; now?: Date;
}): Promise<Classification> {
  const now = ctx.now ?? new Date();
  const prompt = [
    'Classify this sales email reply from a prospect.',
    `Intents: ${REPLY_INTENT_VALUES.join(', ')}.`,
    '- interested: wants a call/demo/more info, or proposes a time.',
    '- question: asks something before committing. objection: pushes back (price, timing, competitor) but still engaged.',
    '- not_now: later / next quarter. not_interested: clear no. unsubscribe: stop emailing / remove me.',
    '- wrong_person / referral: not them; referral when they name someone else. out_of_office: auto-reply away message.',
    `Now is ${now.toISOString()} (founder timezone ${ctx.timezone}). If they propose a concrete meeting time, return it as`,
    'an ISO 8601 datetime with offset in `proposed_time` (resolve "Tuesday 3pm" to the next such day in the founder timezone',
    'unless they name another timezone). If out of office with a return date, put it in `ooo_until` (ISO date).',
    'summary: one short sentence, never include email addresses or phone numbers.',
    ctx.leadName ? `Prospect: ${ctx.leadName}${ctx.company ? ` at ${ctx.company}` : ''}.` : '',
    '--- reply ---',
    text.slice(0, 4000),
  ].filter(Boolean).join('\n');
  try {
    const out = await llm.json(prompt, ClassificationSchema, {
      agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.taskId, temperature: 0,
      system: 'You are Zara, a precise B2B sales reply classifier. Answer with JSON only.',
    });
    return sanitize(out, now);
  } catch {
    return sanitize(keywordClassify(text), now);
  }
}

function sanitize(c: Classification, now: Date): Classification {
  const out = { ...c };
  if (out.proposed_time) {
    const t = Date.parse(out.proposed_time);
    if (Number.isNaN(t) || t < now.getTime()) out.proposed_time = null;
  }
  if (out.ooo_until && Number.isNaN(Date.parse(out.ooo_until))) out.ooo_until = null;
  return out;
}

/** Deterministic fallback so the core path survives an LLM outage. */
export function keywordClassify(text: string): Classification {
  const t = text.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  let intent: ReplyIntent = 'unknown';
  if (has('unsubscribe', 'remove me', 'stop emailing', 'do not contact', "don't contact", 'opt out')) intent = 'unsubscribe';
  else if (has('out of office', 'out-of-office', 'on leave', 'on vacation', 'away until', 'auto-reply', 'autoreply')) intent = 'out_of_office';
  else if (has('not interested', 'no thanks', 'no thank you', 'not a fit')) intent = 'not_interested';
  else if (has('wrong person', 'not the right person', 'no longer at', 'reach out to', 'talk to my colleague')) intent = 'wrong_person';
  else if (has('next quarter', 'not now', 'not right now', 'later this year', 'circle back', 'in a few months')) intent = 'not_now';
  else if (has('interested', 'works for me', "let's talk", 'lets talk', 'book', 'schedule', 'call', 'demo', 'sounds good')) intent = 'interested';
  else if (t.includes('?')) intent = 'question';
  return { intent, summary: `Keyword match: ${intent}` };
}
