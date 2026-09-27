import type { Block } from '../../contracts';
import { G8_LINKS, actions, context, section } from '../../agents/ayesha/kit';

export type ConnectAccount = 'linkedin' | 'mailbox' | 'phone' | 'calendar';
const LABEL: Record<ConnectAccount, string> = { linkedin: 'LinkedIn', mailbox: 'an email mailbox', phone: 'a phone number', calendar: 'Google Calendar' };

export function connectUrl(account: ConnectAccount): string {
  return account === 'mailbox' ? G8_LINKS.mailboxes : account === 'calendar' ? G8_LINKS.appointments : G8_LINKS.settings;
}

/** D10: ask + continue. Link button (no server round trip); a watcher flips it when the account appears. */
export function connectCard(account: ConnectAccount, approvalId?: string): { text: string; blocks: Block[] } {
  const what = LABEL[account];
  const text = `${what} isn't connected in graph8. Starting with what works; I'll add its steps once you connect.`;
  return {
    text,
    blocks: [
      section(`⚠️ *${what[0].toUpperCase()}${what.slice(1)} isn't connected in graph8.*\nI'm starting with what works now and will add its steps the moment it's connected.`),
      actions([{ text: 'Connect in graph8', url: connectUrl(account), actionId: 'link.connect_graph8', value: approvalId ?? account, style: 'primary' }]),
      context('One click for you, nothing else changes.'),
    ],
  };
}
