import type { Block } from '../../contracts';
import type { StandupData } from '../../../../shared/types';
import { context, fields, header, section } from '../../agents/ayesha/kit';

export interface StandupCardInput {
  data: StandupData;
  graph8Credits?: number;
  doneToday: string[];   // one line each, no PII
  today: string;         // plan line
  greeting?: string;
}

const n = (x: number) => Math.round(x).toLocaleString('en-US');

export function standupCard(p: StandupCardInput): { text: string; blocks: Block[] } {
  const pl = p.data.pipeline;
  const credits = Object.entries(p.data.credits).map(([name, c]) => `${name} ${n(c)}`).join(' · ') || 'none yet';
  const blockers = p.data.blockers?.length ? p.data.blockers.map((b) => `• ${b}`).join('\n') : 'Nothing, all clear ✅';
  const blocks: Block[] = [
    header('☀️ Daily standup'),
    ...(p.greeting ? [context(p.greeting)] : []),
    fields([
      ['Pipeline', `${n(pl.prospects)} prospects · ${n(pl.contacted)} contacted · ${n(pl.replied)} replied · ${n(pl.meetings)} meetings · ${n(pl.deals)} deals ($${n(pl.deal_value)})`],
      ['Credits today', credits + (p.graph8Credits !== undefined ? `\ngraph8 balance ${n(p.graph8Credits)}` : '')],
    ]),
    section(`*Done:* ${p.doneToday.length ? p.doneToday.join(' · ') : 'fresh start'}\n*Today:* ${p.today}`),
    section(`*Needs you:*\n${blockers}`),
    context('Per-agent detail in the thread 👇'),
  ];
  return { text: `Standup: ${pl.prospects} prospects, ${pl.meetings} meetings, ${pl.deals} deals`, blocks };
}

export function agentDetailLine(a: { name: string; title: string; status: string; tasksDone: number; tasksOpen: number; credits: number; current?: string | null }): string {
  const status = a.status.replace(/_/g, ' ');
  return `*${a.name}* (${a.title}) · ${status} · ${a.tasksDone} done / ${a.tasksOpen} open · ${n(a.credits)} credits` +
    (a.current ? `\n  now: ${a.current}` : '');
}

/** 🎉 win mirrored from another agent's report (Zara's deal). No PII. */
export function winCard(p: { title: string; body?: string; amount?: number; url?: string }): { text: string; blocks: Block[] } {
  const amt = p.amount ? ` · est. $${n(p.amount)}` : '';
  const blocks: Block[] = [section(`🎉 *${p.title}*${amt}` + (p.body ? `\n${p.body}` : ''))];
  if (p.url) blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in graph8' }, url: p.url, action_id: 'link.open_in_graph8' }] });
  blocks.push(context('Shabash team 👏'));
  return { text: `🎉 ${p.title}${amt}`, blocks };
}

export function alertCard(p: { from: string; title: string; body?: string }): { text: string; blocks: Block[] } {
  return { text: `⚠️ ${p.title}`, blocks: [section(`⚠️ *${p.title}*` + (p.body ? `\n${p.body}` : '')), context(`from ${p.from}`)] };
}
