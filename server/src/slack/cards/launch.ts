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
  /** First line of the email body (greeting skipped) or a layer's draft preview. */
  preview?: string;
  /** 0 = first email, 1..n-1 = follow-ups, last = breakup. */
  emailIdx?: number;
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

// Slack renders no LinkedIn glyph for a bare 'in' — always an emoji.
const ICON: Record<string, string> = { email: '✉️', phone: '📞', linkedin: '💼', sms: '💬', whatsapp: '🟢' };

export function stepIcon(s: Pick<LaunchCardStep, 'channel'>): string {
  return ICON[s.channel] ?? '•';
}

/** Compact timeline (portal/report text only — the card lists steps instead). */
export function timelineText(steps: LaunchCardStep[]): string {
  return steps.map((s) => `${stepIcon(s)}${s.mode === 'planned' ? ' ⏸' : ''} D${s.day}`).join(' · ');
}

export function dayLabel(secPerDay: number): string {
  if (secPerDay >= 86_400) return 'real days';
  const s = Math.round(secPerDay);
  return s % 60 === 0 ? `demo time: 1 day = ${s / 60} min` : `demo time: 1 day = ${s} s`;
}

export const PREVIEW_MAX = 90;
const clip = (t: string, n = PREVIEW_MAX) => {
  const one = t.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Card header, passed as the approval title (slack.approvalCard renders the title as the card's one heading). */
export function launchCardTitle(i: Pick<LaunchCardInput, 'testNames' | 'prospectCount' | 'revision'>): string {
  return `🚀 Ready to launch · ${plural(i.testNames.length, 'test lead')} · ${i.prospectCount} preview only${i.revision ? ` · rev ${i.revision}` : ''}`;
}

function stepWhat(s: LaunchCardStep): string {
  if (s.channel === 'phone') return 'AI call';
  if (s.channel === 'linkedin') return `LinkedIn ${s.action.replace(/_/g, ' ').replace(/ request$/, '')}`;
  const name = ({ sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' } as Record<string, string>)[s.channel] ?? s.channel;
  const act = s.action.replace(/_/g, ' ');
  return act && act !== s.channel ? `${name} ${act}` : name;
}

/** One clean line per live step: D0 subject · follow-up / breakup first line · live side steps. */
export function stepLine(s: LaunchCardStep, lastEmailIdx = 2): string {
  let what: string;
  if (s.channel === 'email') {
    const idx = s.emailIdx ?? 0;
    if (idx === 0) what = `Email — “${clip(s.subject ?? 'intro')}”`;
    else what = `${idx >= lastEmailIdx ? 'Breakup' : 'Follow-up'}${s.preview ? ` — “${clip(s.preview)}”` : ''}`;
  } else {
    what = `${stepWhat(s)}${s.preview ? ` — “${clip(s.preview)}”` : ''}`;
  }
  return `${stepIcon(s)} *D${s.day}*  ${what}`;
}

export function stepLines(steps: LaunchCardStep[]): string {
  const last = Math.max(0, ...steps.filter((s) => s.channel === 'email').map((s) => s.emailIdx ?? 0));
  return steps.filter((s) => s.mode !== 'planned').map((s) => stepLine(s, last)).join('\n').slice(0, 2900); // section limit 3000
}

/** ONE line for every paused step, grouped by channel, each reason said once:
 *  "⏸ Waiting: 💼 LinkedIn D1 + D6 (connect LinkedIn in graph8) · 📞 D5 AI call (needs an AI-calling number)". */
export function waitingLine(steps: LaunchCardStep[]): string | undefined {
  const groups = new Map<string, { s: LaunchCardStep; days: number[]; reasons: string[] }>();
  for (const s of steps.filter((x) => x.mode === 'planned')) {
    const key = s.channel === 'linkedin' ? 'linkedin' : `${s.channel}:${s.action}`;
    const g = groups.get(key) ?? { s, days: [], reasons: [] };
    g.days.push(s.day);
    if (s.reason && !g.reasons.includes(s.reason)) g.reasons.push(s.reason);
    groups.set(key, g);
  }
  if (!groups.size) return undefined;
  const parts = [...groups.values()].map(({ s, days, reasons }) => {
    const d = days.map((x) => `D${x}`).join(' + ');
    const what = s.channel === 'linkedin' ? `LinkedIn ${d}` : `${d} ${stepWhat(s)}`;
    return `${stepIcon(s)} ${what}${reasons.length ? ` (${reasons.join('; ')})` : ''}`;
  });
  return `⏸ Waiting: ${parts.join(' · ')}`.slice(0, 1500);
}

/** Banner for live LinkedIn steps, e.g. "💼 LinkedIn D1/D6 live via graph8 (Moazam's seat, paced) — test contacts only". */
export function linkedinLiveLine(steps: LaunchCardStep[]): string | undefined {
  const live = steps.filter((s) => s.channel === 'linkedin' && s.mode !== 'planned');
  if (!live.length) return undefined;
  const why = live.find((s) => s.reason)?.reason ?? 'live via graph8 (paced)';
  return `💼 LinkedIn ${live.map((s) => `D${s.day}`).join('/')} ${why}`.slice(0, 300);
}

function quote(text: string, max = 600): string {
  const t = text.length > max ? `${text.slice(0, max)}…` : text;
  return t.split('\n').map((l) => `> ${l}`).join('\n');
}

/** Body blocks; the heading comes from `launchCardTitle` (approval title), buttons from slack.approvalCard. */
export function launchCardBlocks(i: LaunchCardInput): Block[] {
  const enrolled = i.testNames.length
    ? `*Enrolled*\n${plural(i.testNames.length, 'test lead')}: ${i.testNames.join(', ')}`
    : '*Enrolled*\nno test leads';
  const blocks: Block[] = [
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Sequence*\n${i.g8Url ? `<${i.g8Url}|${i.sequenceName}>` : i.sequenceName}` },
      { type: 'mrkdwn', text: enrolled },
      { type: 'mrkdwn', text: `*Preview only*\n${plural(i.prospectCount, 'real prospect')}` },
      { type: 'mrkdwn', text: `*Timing*\n${dayLabel(i.secPerDay)} · stops on reply` },
    ] },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: stepLines(i.steps) || '_no live steps_' } },
  ];
  const liLive = linkedinLiveLine(i.steps);
  if (liLive) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: liLive }] });
  const waiting = waitingLine(i.steps);
  if (waiting) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: waiting }] });
  if (i.preview) {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `*First email · ${i.preview.leadName}${i.preview.company ? `, ${i.preview.company}` : ''}*\n*Subject:* ${i.preview.subject}\n${quote(i.preview.body)}` } },
    );
  }
  if (i.warnings?.length) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `⚠️ ${i.warnings.join(' · ').slice(0, 1500)}` }] });
  }
  return blocks;
}

export function launchCardText(i: LaunchCardInput): string {
  const live = i.steps.filter((s) => s.mode !== 'planned').length;
  return `Ready to launch ${i.sequenceName}: ${live} live step(s), ${i.steps.length - live} waiting — ${i.testNames.length} test lead(s), ${i.prospectCount} preview only.`;
}
