/**
 * Risky-reply approval card body (Z10): prospect's reply (scrubbed, no address) + Zara's draft.
 * Buttons [Send] [Edit] [Skip] are added by slack.approvalCard (approveLabel 'Send'). Minimal local Block Kit JSON.
 */
import type { Block } from '../../contracts';

const quote = (s: string) => s.split('\n').map((l) => `>${l}`).join('\n');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function replyApprovalBlocks(p: {
  leadName: string; company?: string | null; intent: string; replyPreview: string; draft: string; revision?: number;
}): Block[] {
  const who = p.company ? `${p.leadName} (${p.company})` : p.leadName;
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*${who}* replied — *${p.intent.replace(/_/g, ' ')}*. Outreach to the account is stopped.` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Their reply*\n${quote(clip(p.replyPreview || '(empty)', 1200))}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*My draft${p.revision ? ` (v${p.revision + 1})` : ''}*\n\`\`\`${clip(p.draft, 2500)}\`\`\`` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Send = goes out in the same email thread, signed by you. Edit = tell me what to change in the thread.' }] },
  ];
}

/** One-line thread update lines for Zara's #sales-team run thread. */
export function replyStoryLine(p: { leadName: string; intent: string; action: string }): string {
  return `↩️ ${p.leadName} replied · *${p.intent.replace(/_/g, ' ')}* · ${p.action}`;
}
