/**
 * Shared Block Kit builders. Agents build their own cards from these; no PII in anything rendered here.
 */
import type { Block, ChecklistItem } from '../contracts';
import type { AgentRole } from '../../../shared/types';
import { persona } from './personas';

export const STATE_EMOJI: Record<ChecklistItem['state'], string> = {
  todo: '▫️',
  doing: '⏳',
  done: '✅',
  warn: '⚠️',
  fail: '❌',
  paused: '⏸',
};

export function section(text: string): Block {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

export function context(text: string): Block {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

export function divider(): Block {
  return { type: 'divider' };
}

/** Small "*Ayesha* · Head of Sales" line, optionally with a subtitle. */
export function personaHeader(role: AgentRole, subtitle?: string): Block {
  const p = persona(role);
  return context(`*${p.name}* · ${p.title}${subtitle ? ` — ${subtitle}` : ''}`);
}

export function checklistLine(item: ChecklistItem): string {
  return `${STATE_EMOJI[item.state]} ${item.label}${item.note ? ` — _${item.note}_` : ''}`;
}

export function checklistBlocks(title: string, items: ChecklistItem[]): Block[] {
  const lines = items.map(checklistLine).join('\n');
  const blocks: Block[] = [section(`*${title}*`)];
  if (lines) blocks.push(section(lines));
  return blocks;
}

/** Plain-text fallback (notifications / screen readers). */
export function checklistText(title: string, items: ChecklistItem[]): string {
  return [title, ...items.map(checklistLine)].join('\n');
}

// ---------------------------------------------------------------------------
// graph8 app links — see docs/graph8-app-links.md. Only list/base paths are verified; record pages are not,
// so record kinds fall back to their list page. Inbox threads are the one verified record-level link.
// ---------------------------------------------------------------------------
export const G8_APP = 'https://app.graph8.com';
export const G8_LINKS = {
  contacts: `${G8_APP}/contacts`,
  companies: `${G8_APP}/companies`,
  deals: `${G8_APP}/deals/pipeline`,
  sequences: `${G8_APP}/sequencer`,
  meetings: `${G8_APP}/appointments?tab=bookings`,
  inbox: `${G8_APP}/inbox/all`,
  globalContext: `${G8_APP}/studio?mode=global`,
  companyProfile: `${G8_APP}/studio/settings?tab=company`,
  mailboxes: `${G8_APP}/studio/settings?tab=mailboxes&category=personal`,
} as const;
export type G8LinkKind = keyof typeof G8_LINKS;

export function g8InboxThreadUrl(orgId: string, threadId: string, channel = 'email'): string {
  return `${G8_LINKS.inbox}?channel=${encodeURIComponent(channel)}&org_id=${encodeURIComponent(orgId)}&c=${encodeURIComponent(threadId)}`;
}

export function linkButton(text: string, url: string, actionId = `link.${Math.random().toString(36).slice(2, 8)}`): Record<string, unknown> {
  return { type: 'button', text: { type: 'plain_text', text, emoji: true }, url, action_id: actionId };
}

/** "Open in graph8" link button (use inside an actions block, or via `openInGraph8Block`). */
export function openInGraph8(kind: G8LinkKind | { url: string }, text = 'Open in graph8'): Record<string, unknown> {
  const url = typeof kind === 'string' ? G8_LINKS[kind] : kind.url;
  return linkButton(text, url, `link.g8.${typeof kind === 'string' ? kind : 'url'}`);
}

export function openInGraph8Block(kind: G8LinkKind | { url: string }, text?: string): Block {
  return { type: 'actions', elements: [openInGraph8(kind, text)] };
}

// ---------------------------------------------------------------------------
// Approval card
// ---------------------------------------------------------------------------
export const APPROVAL_ACTIONS_BLOCK_ID = 'approval_actions';

export function approvalButtons(approvalId: string, approveLabel = 'Approve'): Block {
  return {
    type: 'actions',
    block_id: APPROVAL_ACTIONS_BLOCK_ID,
    elements: [
      { type: 'button', style: 'primary', text: { type: 'plain_text', text: approveLabel, emoji: true }, action_id: 'approval.approve', value: approvalId },
      { type: 'button', text: { type: 'plain_text', text: 'Edit', emoji: true }, action_id: 'approval.edit', value: approvalId },
      { type: 'button', text: { type: 'plain_text', text: 'Skip', emoji: true }, action_id: 'approval.skip', value: approvalId },
    ],
  };
}

export function approvalCardBlocks(role: AgentRole, a: { approvalId: string; title: string; blocks: Block[]; approveLabel?: string }): Block[] {
  return [
    section(`*${a.title}*`),
    ...a.blocks,
    approvalButtons(a.approvalId, a.approveLabel),
    personaHeader(role, 'needs your call'),
  ];
}

const PAST_TENSE: Record<string, string> = { launch: 'Launched', approve: 'Approved', connect: 'Connected', send: 'Sent', book: 'Booked', enroll: 'Enrolled' };

/** Text shown after a decision, e.g. "✅ Launched by <@U123>" / "⏭ Skipped by <@U123>". */
export function decisionLine(decision: 'approve' | 'skip', userId: string, approveLabel?: string): string {
  if (decision === 'skip') return `⏭ Skipped by <@${userId}>`;
  const verb = PAST_TENSE[(approveLabel ?? 'approve').trim().split(/\s+/)[0].toLowerCase()] ?? 'Approved';
  return `✅ ${verb} by <@${userId}>`;
}

/** Replace the approval buttons with the decision (Slack has no "disabled" buttons, so we drop them). */
export function decidedCardBlocks(blocks: Block[], line: string): Block[] {
  const out = blocks.filter((b) => b.block_id !== APPROVAL_ACTIONS_BLOCK_ID);
  out.push(context(line));
  return out;
}

/** Generic button for `act.<name>` actions (routed to bus 'slack.action'). */
export function actButton(name: string, text: string, value: string, style?: 'primary' | 'danger'): Record<string, unknown> {
  return { type: 'button', text: { type: 'plain_text', text, emoji: true }, action_id: `act.${name}`, value, ...(style ? { style } : {}) };
}
