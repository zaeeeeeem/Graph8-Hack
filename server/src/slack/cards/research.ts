/**
 * Hira's research card (spec H9): name, company, hook, reachable channels (✉️ 📞 in), fit, [Open in graph8].
 * Disqualified rows show reason + replacement. Never actual emails/phones.
 */
import type { Block } from '../../contracts';
import type { Channel } from '../../../../shared/types';
import { fitBadge } from './list';

export interface ResearchCardRow {
  name: string;
  company: string;
  hook: string;
  channels: Channel[];
  emailStatus?: 'verified' | 'catch-all' | 'pending' | 'none';
  fit: number | null;
  url: string;
  test?: boolean;
  disqualified?: { reason: string; replacement?: string };
}

export interface ResearchCardInput { rows: ResearchCardRow[]; pendingNote?: string; warnings?: string[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function channelIcons(r: Pick<ResearchCardRow, 'channels' | 'emailStatus'>): string {
  const icons: string[] = [];
  if (r.channels.includes('email')) icons.push(r.emailStatus === 'catch-all' ? '✉️(catch-all)' : '✉️');
  else if (r.emailStatus === 'pending') icons.push('✉️⏳');
  if (r.channels.includes('phone')) icons.push('📞');
  if (r.channels.includes('linkedin')) icons.push('in');
  return icons.join(' ') || '—';
}

export function researchCard(c: ResearchCardInput): { text: string; blocks: Block[] } {
  const live = c.rows.filter((r) => !r.disqualified);
  const dq = c.rows.filter((r) => r.disqualified);
  const emails = live.filter((r) => r.channels.includes('email')).length;
  const text = `Researched ${live.length} leads — ${emails} with a usable email${dq.length ? `, ${dq.length} replaced` : ''}.`;
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: `🧠 Research pack · ${live.length} leads`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${emails}/${live.length} email ready · ${dq.length} replaced${c.pendingNote ? ` · ${esc(c.pendingNote)}` : ''}` }] },
    { type: 'divider' },
  ];
  live.forEach((r, i) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${i + 1}. ${esc(r.name)}*${r.test ? ' 🧪 TEST' : ''} — ${esc(r.company || '—')}  ${fitBadge(r.fit)}  ${channelIcons(r)}\n> ${esc(r.hook)}`,
      },
      accessory: { type: 'button', text: { type: 'plain_text', text: 'Open in graph8' }, url: r.url, action_id: `open_g8_r${i}` },
    });
  });
  if (dq.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: dq.map((r) => `~${esc(r.name)}~ — ${esc(r.disqualified!.reason)}${r.disqualified!.replacement ? ` → replaced by *${esc(r.disqualified!.replacement)}*` : ' (no replacement left)'}`).join('\n') }],
    });
  }
  if (c.warnings?.length) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: c.warnings.map((w) => `⚠️ ${esc(w)}`).join('\n') }] });
  }
  return { text, blocks };
}
