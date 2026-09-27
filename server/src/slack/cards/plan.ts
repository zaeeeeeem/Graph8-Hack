import type { Block } from '../../contracts';
import { actions, context, divider, fields, header, officeUrl, section } from '../../agents/ayesha/kit';

/** W1b routes only `act.*` and `approval.*` buttons onto the bus; `plan.start` kept for older cards. */
export const PLAN_START_ACTIONS = ['act.plan_start', 'plan.start'] as const;

export interface PlanCardInput {
  company: string;
  target: string;
  why: string;
  alternatives: string[];
  dailyFind: number;
  dailyResearch: number;
  channels: { email: boolean; phone: boolean; linkedin: boolean };
  extras: string[];            // layer lines, e.g. "voice agent ready"
  credits?: number;            // real graph8 balance
  standupHour: number;
  taskId: string;              // value for [Start]
  started?: boolean;
}


export function planCard(p: PlanCardInput): { text: string; blocks: Block[] } {
  const ch = [
    p.channels.email ? '✉️ email' : '✉️ email ⏸',
    p.channels.phone ? '📞 phone' : '📞 phone ⏸',
    p.channels.linkedin ? 'in LinkedIn' : 'in LinkedIn ⏸ (connect)',
  ].join(' · ');
  const why = p.why.trim();
  const blocks: Block[] = [
    header(`Sales plan for ${p.company}`),
    section(`*Target:* ${p.target}` + (why ? `\n*Why:* ${why}` : '') + (p.alternatives.length ? `\n_Alternatives:_ ${p.alternatives.slice(0, 2).join(' · ')}` : '')),
    fields([
      ['Daily', `find ${p.dailyFind} → research ${p.dailyResearch} → you launch`],
      ['Channels', ch],
    ]),
    context([
      `Standup ${String(p.standupHour).padStart(2, '0')}:00 PKT`,
      p.credits !== undefined ? `graph8 credits ${Math.round(p.credits).toLocaleString('en-US')}` : '',
      ...p.extras.slice(0, 3),
    ].filter(Boolean).join(' · ')),
  ];
  blocks.push(divider());
  const btns = [] as Parameters<typeof actions>[0];
  if (!p.started) btns.push({ text: 'Start', actionId: PLAN_START_ACTIONS[0], value: p.taskId, style: 'primary' });
  const url = officeUrl();
  if (url) btns.push({ text: 'Open Agent Office', url });
  if (btns.length) blocks.push(actions(btns));
  if (p.started) blocks.push(context('▶️ Started. Bilal is finding prospects in #sales-team.'));
  else blocks.push(context('Change anything in plain words, e.g. "from now on find 20 a day".'));
  return { text: `Sales plan for ${p.company}: ${p.target}`, blocks };
}
