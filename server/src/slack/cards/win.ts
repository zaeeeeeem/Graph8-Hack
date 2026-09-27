/** 🎉 win card (Z3): meeting booked + deal created. Ayesha posts it in #sales-hq from the `win` report (data.blocks). */
import type { Block } from '../../contracts';

export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function winText(p: { leadName: string; company?: string | null; meetingLabel?: string | null; amount: number }): string {
  const who = p.company ? `${p.leadName} at ${p.company}` : p.leadName;
  return `🎉 Meeting booked with ${who}${p.meetingLabel ? ` — ${p.meetingLabel}` : ''}. Deal created: ${usd(p.amount)} est.`;
}

export function winBlocks(p: {
  leadName: string; company?: string | null; meetingLabel?: string | null; amount: number; plan?: string;
  stageName: string; dealUrl: string; threadUrl?: string | null;
}): Block[] {
  const fields = [
    { type: 'mrkdwn', text: `*Meeting*\n${p.meetingLabel ?? 'booked'}` },
    { type: 'mrkdwn', text: `*Deal*\n${usd(p.amount)} est.${p.plan ? ` · ${p.plan}` : ''}` },
    { type: 'mrkdwn', text: `*Stage*\n${p.stageName}` },
    { type: 'mrkdwn', text: `*Closer*\nZara` },
  ];
  const blocks: Block[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${winText(p)}*` } },
    { type: 'section', fields },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Open in graph8' }, url: p.dealUrl, action_id: 'link.open_graph8_deal' },
        ...(p.threadUrl ? [{ type: 'button', text: { type: 'plain_text', text: 'See the thread' }, url: p.threadUrl, action_id: 'link.open_thread' }] : []),
      ],
    },
  ];
  return blocks;
}
