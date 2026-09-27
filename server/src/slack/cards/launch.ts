/**
 * Launch card (U4) for #sales-hq. Buttons [Launch] [Edit] [Skip] are added by slack.approvalCard / ctx.requestApproval.
 * Minimal local Block Kit JSON (slack/blocks.ts from W1b can replace these helpers once merged).
 * No emails/phones: names + companies only (spec §6).
 */
import type { Block } from '../../contracts';
import type { Channel } from '../../../../shared/types';

export interface LaunchCardStep {
  n: number; day: number; channel: Channel | string; action: string;
  mode: 'g8' | 'fire' | 'planned'; subject?: string; reason?: string;
}
export interface LaunchCardInput {
  sequenceName: string;
  steps: LaunchCardStep[];
  preview?: { leadName: string; company?: string | null; subject: string; body: string };
  testNames: string[];
  prospectCount: number;
  secPerDay: number;
  g8Url?: string;
  revision?: number;
  warnings?: string[];
}

const ICON: Record<string, string> = { email: '✉️', phone: '📞', linkedin: 'in', sms: '💬', whatsapp: '🟢' };

export function stepIcon(s: Pick<LaunchCardStep, 'channel' | 'mode'>): string {
  return s.mode === 'planned' ? `${ICON[s.channel] ?? '•'} ⏸` : (ICON[s.channel] ?? '•');
}

export function timelineText(steps: LaunchCardStep[]): string {
  return steps.map((s) => `${stepIcon(s)} D${s.day}`).join(' · ');
}

export function dayLabel(secPerDay: number): string {
  if (secPerDay >= 86_400) return 'real days';
  const s = Math.round(secPerDay);
  return s % 60 === 0 ? `demo time: 1 day = ${s / 60} min` : `demo time: 1 day = ${s} s`;
}

function stepLine(s: LaunchCardStep): string {
  const what = s.channel === 'email'
    ? `Email${s.subject ? ` — “${s.subject}”` : ''}`
    : s.channel === 'phone' ? 'AI voice call' : s.channel === 'linkedin' ? `LinkedIn ${s.action.replace(/_/g, ' ')}` : `${s.channel} ${s.action}`;
  const tail = s.mode === 'planned' ? ` _(⏸ ${s.reason ?? 'waiting'})_` : s.mode === 'fire' ? ' _(placed by us at step time)_' : '';
  return `${stepIcon(s)} *D${s.day}* ${what}${tail}`;
}

function quote(text: string, max = 900): string {
  const t = text.length > max ? `${text.slice(0, max)}…` : text;
  return t.split('\n').map((l) => `> ${l}`).join('\n');
}

export function launchCardBlocks(i: LaunchCardInput): Block[] {
  const who = i.testNames.length
    ? `*${i.testNames.length} test lead${i.testNames.length === 1 ? '' : 's'} enrolled* (${i.testNames.join(', ')}) · ${i.prospectCount} real prospect${i.prospectCount === 1 ? '' : 's'} preview only`
    : `*No test leads to enroll* · ${i.prospectCount} real prospect${i.prospectCount === 1 ? '' : 's'} preview only`;
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: `🚀 Ready to launch${i.revision ? ` (rev ${i.revision})` : ''}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${i.sequenceName}*\n${timelineText(i.steps)}` } },
    { type: 'section', text: { type: 'mrkdwn', text: i.steps.map(stepLine).join('\n') } },
  ];
  if (i.preview) {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `*First email for ${i.preview.leadName}${i.preview.company ? ` · ${i.preview.company}` : ''}*\n*Subject:* ${i.preview.subject}\n${quote(i.preview.body)}` } },
    );
  }
  blocks.push({ type: 'context', elements: [
    { type: 'mrkdwn', text: `${who} · stops on reply · ${dayLabel(i.secPerDay)}${i.g8Url ? ` · <${i.g8Url}|Open in graph8>` : ''}` },
  ] });
  if (i.warnings?.length) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `⚠️ ${i.warnings.join(' · ').slice(0, 1500)}` }] });
  }
  return blocks;
}

export function launchCardText(i: LaunchCardInput): string {
  return `Ready to launch ${i.sequenceName}: ${timelineText(i.steps)} — ${i.testNames.length} test lead(s), ${i.prospectCount} preview only.`;
}
