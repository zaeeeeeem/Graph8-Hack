/**
 * Persona text → graph8 /search/contacts filters (spec 02-bilal open item 1), plus B3 widening.
 * Gemini proposes; code keeps only values that exist in the verified vocab, so filters always match something real.
 */
import { z } from 'zod';
import type { RunCtx } from '../../contracts';
import { llm } from '../../lib/llm';
import { INDUSTRIES, SENIORITY, SIZES, pickIndustry, pickSeniority, pickSize } from './vocab';
import { errMsg } from './util';

export interface SearchPlan {
  /** Human label for the list name + card, e.g. "UK fintech CFOs". */
  label: string;
  titles: string[];
  adjacentTitles: string[];
  seniority: string[];
  industries: string[];
  sizes: string[];
  countries: string[];
  nearbyCountries: string[];
  /** Filled by widen(): what was loosened, for Ayesha's handoff. */
  widened: string[];
  /** Filled by widen(): values accepted with reduced score. */
  loose: { titles: string[]; sizes: string[]; countries: string[] };
}

export interface SearchFilter { field: string; operator: 'any_of' | 'contains' | 'none_of' | 'between'; value: unknown[] }

const PlanSchema = z.object({
  label: z.string().default('target prospects'),
  titles: z.array(z.string()).default([]),
  adjacent_titles: z.array(z.string()).default([]),
  seniority: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  sizes: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  nearby_countries: z.array(z.string()).default([]),
});

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

export function sanitizePlan(raw: z.infer<typeof PlanSchema>): SearchPlan {
  return {
    label: raw.label.slice(0, 60) || 'target prospects',
    titles: uniq(raw.titles).slice(0, 6),
    adjacentTitles: uniq(raw.adjacent_titles).filter((t) => !raw.titles.includes(t)).slice(0, 6),
    seniority: uniq(raw.seniority.map((s) => pickSeniority(s) ?? '')),
    industries: uniq(raw.industries.map((s) => pickIndustry(s) ?? '')).slice(0, 8),
    sizes: uniq(raw.sizes.map((s) => pickSize(s) ?? '')),
    countries: uniq(raw.countries).slice(0, 6),
    nearbyCountries: uniq(raw.nearby_countries).filter((c) => !raw.countries.includes(c)).slice(0, 6),
    widened: [],
    loose: { titles: [], sizes: [], countries: [] },
  };
}

const TITLE_HINTS: Array<[RegExp, string[], string[]]> = [
  [/\bcfo|chief financial|finance (head|lead)|head of finance/i, ['CFO', 'Chief Financial Officer'], ['VP Finance', 'Finance Director', 'Head of Finance']],
  [/\bcto|chief tech/i, ['CTO', 'Chief Technology Officer'], ['VP Engineering', 'Head of Engineering']],
  [/\bceo|founder|chief exec/i, ['CEO', 'Founder', 'Co-Founder'], ['Managing Director', 'President']],
  [/\bcmo|marketing/i, ['CMO', 'Head of Marketing'], ['VP Marketing', 'Marketing Director']],
  [/\bcro|sales|revenue/i, ['VP Sales', 'Head of Sales', 'CRO'], ['Sales Director', 'Head of Growth']],
  [/\bcoo|operations/i, ['COO', 'Head of Operations'], ['VP Operations', 'Operations Director']],
];

/** No-LLM fallback: keyword heuristics + vocab substring match + settings.geo. */
export function heuristicPlan(persona: string, geo: string[] = []): SearchPlan {
  const p = persona.toLowerCase();
  const titles: string[] = []; const adj: string[] = [];
  for (const [re, t, a] of TITLE_HINTS) if (re.test(persona)) { titles.push(...t); adj.push(...a); }
  const industries = INDUSTRIES.filter((i) => p.includes(i.toLowerCase()));
  if (/fintech|financ|bank|payment/.test(p)) industries.push('Financial Services', 'Banking');
  if (/saas|software|tech/.test(p)) industries.push('Software Development', 'IT Services and IT Consulting');
  const seniority = /\b(c[a-z]o|chief|founder|ceo)\b/i.test(persona) ? ['CXO', 'Owner / Partner'] : ['CXO', 'Vice President', 'Director'];
  return sanitizePlan({
    label: persona.slice(0, 60), titles: titles.length ? titles : ['Founder', 'CEO'], adjacent_titles: adj,
    seniority, industries, sizes: ['11-50', '51-200', '201-500'], countries: geo, nearby_countries: [],
  });
}

export async function personaToPlan(ctx: RunCtx, persona: string, extra: { icp?: string; geo?: string[] } = {}): Promise<{ plan: SearchPlan; via: 'gemini' | 'fallback'; note?: string }> {
  const prompt = [
    'Map a B2B sales target persona to filters for a people-search API. Return JSON only.',
    `Persona: ${persona}`,
    extra.icp ? `ICP: ${extra.icp}` : '',
    extra.geo?.length ? `Preferred geography: ${extra.geo.join(', ')}` : '',
    '',
    'Fields:',
    '- label: short human label, e.g. "UK fintech CFOs"',
    '- titles: 2-5 exact job titles as people write them (e.g. "CFO", "Chief Financial Officer")',
    '- adjacent_titles: 2-4 nearby titles to use only if too few results (e.g. "VP Finance")',
    `- seniority: subset of ${JSON.stringify(SENIORITY)}`,
    `- industries: 1-6 values copied EXACTLY from this list (fintech → "Financial Services", "Banking"; SaaS → "Software Development"): ${JSON.stringify(INDUSTRIES.slice(0, 160))}`,
    `- sizes: subset of ${JSON.stringify(SIZES)} (employee count buckets)`,
    '- countries: full English country names, e.g. "United Kingdom", "United Arab Emirates"',
    '- nearby_countries: 2-4 neighbouring/similar markets to widen into if needed',
  ].filter(Boolean).join('\n');
  try {
    const raw = await llm.json(prompt, PlanSchema, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id, temperature: 0 });
    const plan = sanitizePlan(PlanSchema.parse(raw));
    if (!plan.countries.length && extra.geo?.length) plan.countries = extra.geo;
    if (!plan.titles.length && !plan.industries.length) throw new Error('mapping returned no usable filters');
    return { plan, via: 'gemini' };
  } catch (e) {
    return { plan: heuristicPlan(persona, extra.geo), via: 'fallback', note: errMsg(e) };
  }
}

export function toFilters(plan: SearchPlan): SearchFilter[] {
  const f: SearchFilter[] = [];
  const titles = [...plan.titles, ...plan.loose.titles];
  if (titles.length) f.push({ field: 'job_title', operator: 'contains', value: titles });
  if (plan.seniority.length) f.push({ field: 'seniority_level', operator: 'any_of', value: plan.seniority });
  if (plan.industries.length) f.push({ field: 'company_industry', operator: 'any_of', value: plan.industries });
  const sizes = [...plan.sizes, ...plan.loose.sizes];
  if (sizes.length) f.push({ field: 'company_employee_count', operator: 'any_of', value: sizes });
  const countries = [...plan.countries, ...plan.loose.countries];
  if (countries.length) f.push({ field: 'country', operator: 'any_of', value: countries });
  return f;
}

/** B3: nearby geo → adjacent titles → bigger company size. Returns false when nothing left to widen. */
export function widen(plan: SearchPlan): boolean {
  if (!plan.widened.includes('geo') && plan.nearbyCountries.length && plan.countries.length) {
    plan.loose.countries = plan.nearbyCountries;
    plan.widened.push('geo');
    return true;
  }
  if (!plan.widened.includes('titles') && plan.adjacentTitles.length) {
    plan.loose.titles = plan.adjacentTitles;
    plan.widened.push('titles');
    return true;
  }
  if (!plan.widened.includes('size') && plan.sizes.length) {
    const maxIdx = Math.max(...plan.sizes.map((s) => SIZES.indexOf(s as any)));
    const bigger = SIZES.slice(maxIdx + 1, maxIdx + 3);
    if (bigger.length) {
      plan.loose.sizes = [...bigger];
      plan.widened.push('size');
      return true;
    }
  }
  return false;
}

export function describeWidened(plan: SearchPlan): string {
  const parts: string[] = [];
  if (plan.widened.includes('geo')) parts.push(`geo to ${plan.loose.countries.join(', ')}`);
  if (plan.widened.includes('titles')) parts.push(`titles to ${plan.loose.titles.join(', ')}`);
  if (plan.widened.includes('size')) parts.push(`company size to ${plan.loose.sizes.join(', ')}`);
  return parts.join('; ');
}
