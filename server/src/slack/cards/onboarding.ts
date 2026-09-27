import type { Block, ChecklistItem } from '../../contracts';
import { actions, context, officeUrl, section } from '../../agents/ayesha/kit';

/** Keys used on the onboarding live checklist (P1). Layer extras append `extra.<name>`. */
export const ONBOARD_ITEMS: ChecklistItem[] = [
  { key: 'brain', label: 'Company docs', state: 'todo' },
  { key: 'target', label: 'Target', state: 'todo' },
  { key: 'channels', label: 'Channels', state: 'todo' },
  { key: 'pipeline', label: 'Deal pipeline', state: 'todo' },
  { key: 'meeting', label: 'Meeting type', state: 'todo' },
  { key: 'credits', label: 'graph8 credits', state: 'todo' },
];
export const PLAN_ITEM: ChecklistItem = { key: 'plan', label: 'Plan', state: 'todo' };

export function onboardTitle(domain: string): string {
  return `Setting up your sales team for ${domain}`;
}

/** D19: /hire-sales when the team already exists. */
export function rehireCard(p: { company: string; agents: Array<{ name: string; status: string }> }): { text: string; blocks: Block[] } {
  const team = p.agents.map((a) => `${a.name} (${a.status.replace(/_/g, ' ')})`).join(' · ') || 'all 5 on board';
  const url = officeUrl();
  const blocks: Block[] = [
    section(`*Team's already here 👋* for ${p.company}\n${team}`),
    context('Ask me anything with @Ayesha, or run /sales-standup.'),
  ];
  if (url) blocks.push(actions([{ text: 'Open Agent Office', url }]));
  return { text: "Team's already here 👋", blocks };
}

/** D16: no docs in graph8 yet — analysis started. */
export function studyingText(domain: string): string {
  return `Studying ${domain} now. graph8 is building the company brain, back in ~30 min with a plan.`;
}
