/** Z-T4 draft_reply — short in-thread reply signed as the founder (Z7). Template fallback when the LLM fails. */
import { llm } from '../../lib/llm';
import type { ReplyIntent, UUID } from '../../../../shared/types';
import type { Slot } from './booking';

export interface DraftInput {
  intent: ReplyIntent | 'booked_confirmation' | 'callback';
  replyText: string;
  firstName: string;
  company?: string | null;
  founderName: string;
  companyName: string;
  slots?: Slot[];
  bookingLink?: string | null;
  bookedLabel?: string | null;
  note?: string;           // founder's Edit note
  previousDraft?: string;  // draft being revised
  brand?: string;          // optional brand voice snippet
}

export function signature(founderName: string, companyName: string): string {
  return `\n\nBest,\n${founderName}\n${companyName}`;
}

function slotLines(i: DraftInput): string {
  const s = (i.slots ?? []).map((x) => `- ${x.label}`).join('\n');
  const link = i.bookingLink ? `\n\nOr grab any time that suits you here: ${i.bookingLink}` : '';
  return s ? `${s}${link}` : i.bookingLink ? `Grab any time that suits you here: ${i.bookingLink}` : '';
}

export function templateDraft(i: DraftInput): string {
  const hi = `Hi ${i.firstName || 'there'},\n\n`;
  const sig = signature(i.founderName, i.companyName);
  switch (i.intent) {
    case 'booked_confirmation':
      return `${hi}Great — you're booked for ${i.bookedLabel}. A calendar invite with the Google Meet link is on its way.\n\nLooking forward to it.${sig}`;
    case 'interested':
    case 'callback':
      return `${hi}Thanks for getting back to me. Would either of these work for a quick 30-minute call?\n\n${slotLines(i)}${sig}`;
    case 'not_now':
      return `${hi}Totally understand — thanks for letting me know. I'll check back in a few months; if anything changes before then, just reply here.${sig}`;
    default:
      return `${hi}Thanks for the reply — happy to help. ${slotLines(i) ? `If it's easier to talk it through, here are a couple of times:\n\n${slotLines(i)}` : ''}${sig}`;
  }
}

export async function draftReply(i: DraftInput, opts: { agentId: UUID; workspaceId: UUID; taskId?: UUID }): Promise<string> {
  if (i.intent === 'booked_confirmation') return templateDraft(i);
  const mustInclude = slotLines(i);
  const prompt = [
    `Write a short, warm, plain-text email reply (max 90 words before the signature) from ${i.founderName} at ${i.companyName}`,
    `to ${i.firstName || 'the prospect'}${i.company ? ` at ${i.company}` : ''}, who replied to our outreach.`,
    `Their intent: ${i.intent}.`,
    i.intent === 'interested' || i.intent === 'callback'
      ? 'Goal: book a 30-minute discovery call. Offer exactly these options, verbatim, as a list:' : '',
    mustInclude && (i.intent === 'interested' || i.intent === 'callback' || i.intent === 'question' || i.intent === 'objection')
      ? mustInclude : '',
    i.intent === 'question' || i.intent === 'objection' ? 'Answer their point briefly and honestly; do not invent facts or prices.' : '',
    i.intent === 'wrong_person' || i.intent === 'referral' ? 'Thank them and ask, politely, for an intro to the right person.' : '',
    i.intent === 'not_interested' ? 'Thank them, respect the no, leave the door open in one line. No pitch.' : '',
    i.brand ? `Brand voice notes: ${i.brand.slice(0, 800)}` : '',
    i.previousDraft ? `Revise this previous draft:\n${i.previousDraft}` : '',
    i.note ? `Founder's instruction for this revision: ${i.note}` : '',
    'No subject line. No placeholders like [Name]. Do not mention AI. Start with "Hi <first name>,".',
    `End with exactly this signature:${signature(i.founderName, i.companyName)}`,
    '--- their reply ---',
    i.replyText.slice(0, 2000),
  ].filter(Boolean).join('\n');
  try {
    const out = (await llm.text(prompt, { ...opts, temperature: 0.4, system: 'You write concise, human B2B sales emails.' })).trim();
    if (!out) return templateDraft(i);
    // Guarantee the slots survive the LLM for auto-sent "interested" replies.
    if ((i.intent === 'interested' || i.intent === 'callback') && i.slots?.length && !i.slots.every((s) => out.includes(s.label))) {
      return templateDraft(i);
    }
    return out;
  } catch {
    return templateDraft(i);
  }
}
