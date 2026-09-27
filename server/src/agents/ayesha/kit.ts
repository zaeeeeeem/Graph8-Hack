// Minimal Block Kit helpers local to Ayesha's cards (W1b's slack/blocks.ts may replace these after merge).
import type { Block } from '../../contracts';

export const G8_APP = 'https://app.graph8.com';
export const G8_LINKS = {
  deals: `${G8_APP}/deals/pipeline`,
  sequencer: `${G8_APP}/sequencer`,
  settings: `${G8_APP}/studio/settings?tab=company`,
  mailboxes: `${G8_APP}/studio/settings?tab=mailboxes&category=personal`,
  appointments: `${G8_APP}/appointments?tab=bookings`,
};

export const section = (text: string): Block => ({ type: 'section', text: { type: 'mrkdwn', text } });
export const context = (text: string): Block => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });
export const header = (text: string): Block => ({ type: 'header', text: { type: 'plain_text', text: text.slice(0, 150), emoji: true } });
export const divider = (): Block => ({ type: 'divider' });
export const fields = (pairs: Array<[string, string]>): Block => ({
  type: 'section',
  fields: pairs.slice(0, 10).map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })),
});

export interface Btn { text: string; actionId?: string; value?: string; url?: string; style?: 'primary' | 'danger' }
export const button = (b: Btn): Record<string, unknown> => ({
  type: 'button',
  text: { type: 'plain_text', text: b.text, emoji: true },
  action_id: b.actionId ?? `link.${b.text.toLowerCase().replace(/\W+/g, '_')}`,
  ...(b.value !== undefined ? { value: b.value } : {}),
  ...(b.url ? { url: b.url } : {}),
  ...(b.style ? { style: b.style } : {}),
});
export const actions = (btns: Btn[]): Block => ({ type: 'actions', elements: btns.map(button) });

/** Optional Agent Office URL (portal). Not in env contract, read raw so it stays optional. */
export const officeUrl = (): string | undefined => process.env.OFFICE_URL || process.env.PORTAL_URL || undefined;
