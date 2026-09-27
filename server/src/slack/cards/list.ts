/**
 * Bilal's list card (spec B4): 10 rows — name, title, company, fit, one-line reason, [Open in graph8]; top 5 marked → Hira.
 * No emails/phones ever. Local Block Kit JSON (W1b's slack/blocks.ts can replace the primitives later).
 */
import type { Block } from '../../contracts';

export interface ListCardRow {
  name: string;
  title: string;
  company: string;
  fit: number | null;
  reason: string;
  url: string;
  toHira: boolean;
  test?: boolean;
}

export interface ListCardInput {
  listName: string;
  listUrl?: string;
  rows: ListCardRow[];
  widened?: string;
  strong: number;
  signalsNote?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function fitBadge(fit: number | null): string {
  if (fit == null) return '—';
  return `${fit >= 75 ? '🟢' : fit >= 55 ? '🟡' : '⚪'} ${fit}`;
}

export function listCard(c: ListCardInput): { text: string; blocks: Block[] } {
  const prospects = c.rows.filter((r) => !r.test);
  const tests = c.rows.filter((r) => r.test);
  const text = `Found ${prospects.length} prospects (${c.strong} strong) — saved to graph8 list "${c.listName}".`;
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: `🔎 ${prospects.length} prospects · ${c.listName}`.slice(0, 150), emoji: true } },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: [
          `${c.strong} strong fits`,
          c.widened ? `widened ${esc(c.widened)}` : 'no widening needed',
          c.signalsNote ? esc(c.signalsNote) : 'fit-only ranking (no buying signals yet)',
        ].join(' · '),
      }],
    },
    { type: 'divider' },
  ];
  prospects.forEach((r, i) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${i + 1}. ${esc(r.name)}* — ${esc(r.title || '—')}, ${esc(r.company || '—')}  ${fitBadge(r.fit)}${r.toHira ? '  *→ Hira*' : ''}\n_${esc(r.reason)}_`,
      },
      accessory: { type: 'button', text: { type: 'plain_text', text: 'Open in graph8' }, url: r.url, action_id: `open_g8_${i}` },
    });
  });
  if (tests.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `🧪 *TEST* leads (team, allowlisted — the only people we may contact): ${tests.map((t) => esc(t.name)).join(', ')} → Hira` }],
    });
  }
  if (c.listUrl) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open list in graph8' }, url: c.listUrl, action_id: 'open_g8_list' }],
    });
  }
  return { text, blocks };
}
