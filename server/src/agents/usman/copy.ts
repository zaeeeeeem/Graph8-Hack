/** U-T2 write_step_briefs + U-T4 preview_copy (+ Edit revise). Gemini only, facts from Hira's packs only. */
import { z } from 'zod';
import { llm } from '../../lib/llm';
import type { LlmCallOpts } from '../../contracts';
import type { LeadRow, SalesBrain } from '../../../../shared/types';
import { firstName, packOf } from './util';

/** Layer 0 email days (U3 email parts). */
export const EMAIL_DAYS = [0, 3, 9] as const;

export const EmailCopy = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  /** Brief for graph8 AI when AI_GENERATED_TEMPLATE is on (L8). */
  instructions: z.string().max(1500).default(''),
});
export type EmailCopy = z.infer<typeof EmailCopy>;

export const SequenceCopy = z.object({
  tone: z.string().max(200).default(''),
  emails: z.array(EmailCopy).length(3),
  preview: z.object({ subject: z.string().max(120), body: z.string().max(2000) }),
});
export type SequenceCopy = z.infer<typeof SequenceCopy>;

const SYSTEM = [
  'You are Usman, an SDR writing a 3-email cold outbound sequence (day 0 intro, day 3 follow-up, day 9 short breakup).',
  'Rules: plain text, no HTML, under 110 words per email, one clear ask (15-minute call), no hype, no fake facts,',
  'use ONLY facts given in the research packs and brand notes. Never invent numbers, customers or news.',
  'Templates are sent to several people by graph8: the ONLY merge token allowed is {{first_name}} (exactly that spelling).',
  'Do not use any other {{…}} tokens, placeholders like [Company], or brackets. Sign off with the sender name given.',
  'Follow-ups are sent in the same thread: keep them short and reference the first email.',
].join(' ');

function packsText(leads: LeadRow[]): string {
  return leads.map((l, i) => {
    const p = packOf(l);
    return `${i + 1}. ${l.full_name}, ${l.job_title ?? 'unknown title'} at ${l.company_name ?? 'unknown company'}` +
      `${l.is_test_contact ? ' (TEST contact)' : ''}\n   hook: ${p.hook || 'n/a'}\n   talking points: ${p.talking_points.join(' | ') || 'n/a'}`;
  }).join('\n');
}

function brandText(brain: SalesBrain, senderName: string): string {
  return [
    `Sender name: ${senderName}`,
    brain.offer ? `Offer: ${brain.offer}` : '',
    brain.icp ? `ICP: ${brain.icp}` : '',
    brain.tone ? `Brand voice: ${brain.tone}` : '',
    Array.isArray(brain.proof) && brain.proof.length ? `Proof (usable): ${brain.proof.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

/** Pick the lead whose pack drives the card preview: top real prospect (spec §6), else first lead. */
export function previewLead(leads: LeadRow[]): LeadRow | undefined {
  const real = leads.filter((l) => !l.is_test_contact);
  const pool = real.length ? real : leads;
  return [...pool].sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))[0];
}

export async function writeSequenceCopy(
  leads: LeadRow[], brain: SalesBrain, senderName: string, opts: LlmCallOpts,
): Promise<SequenceCopy> {
  const top = previewLead(leads);
  const prompt = [
    'Brand:', brandText(brain, senderName), '',
    'Research packs for this run:', packsText(leads), '',
    'Write:',
    '1. `emails`: exactly 3 templates (day 0, day 3, day 9) that work for every lead above. Lean on the common pain in the hooks.',
    '   Each has `subject`, `body` (use {{first_name}} in the greeting) and `instructions` (2-4 sentences telling an AI writer',
    '   how to personalise this step with the contact\'s sales_hook field, tone, and the ask).',
    `2. \`preview\`: the day-0 email fully personalised for ${top ? `${top.full_name} at ${top.company_name ?? 'their company'}` : 'the first lead'}`,
    '   using their hook (no merge tokens, real first name).',
    '3. `tone`: one line describing the voice you used.',
  ].join('\n');
  const out = await llm.json(prompt, SequenceCopy, { ...opts, system: SYSTEM, temperature: 0.6 });
  return sanitizeCopy(out, top);
}

export async function reviseSequenceCopy(
  current: SequenceCopy, note: string, leads: LeadRow[], brain: SalesBrain, senderName: string, opts: LlmCallOpts,
): Promise<SequenceCopy> {
  const top = previewLead(leads);
  const prompt = [
    'Brand:', brandText(brain, senderName), '',
    'Research packs:', packsText(leads), '',
    'Current sequence (JSON):', JSON.stringify(current), '',
    `The founder asked for this change: """${note.slice(0, 1000)}"""`,
    'Apply the change to all 3 emails and the preview. Keep everything else that was not asked to change.',
    'Return the same JSON shape (tone, emails[3], preview).',
  ].join('\n');
  const out = await llm.json(prompt, SequenceCopy, { ...opts, system: SYSTEM, temperature: 0.4 });
  return sanitizeCopy(out, top);
}

/** Enforce the single allowed merge token and strip stray placeholders the model might add. */
export function sanitizeCopy(c: z.input<typeof SequenceCopy>, top?: LeadRow): SequenceCopy {
  const clean = (s: string) => s
    .replace(/\{\{\s*first[_ ]?name\s*\}\}/gi, '{{first_name}}')
    .replace(/\{\{(?!first_name\}\})[^}]*\}\}/g, '')
    .replace(/\[(?:first ?name|company|name)\]/gi, '')
    .trim();
  const fn = top ? firstName(top.full_name) : 'there';
  return {
    tone: c.tone ?? '',
    emails: c.emails.map((e) => ({ subject: clean(e.subject), body: clean(e.body), instructions: e.instructions ?? '' })),
    preview: {
      subject: clean(c.preview.subject).replace(/\{\{first_name\}\}/g, fn),
      body: clean(c.preview.body).replace(/\{\{first_name\}\}/g, fn),
    },
  };
}
