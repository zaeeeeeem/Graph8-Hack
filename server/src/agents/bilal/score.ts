/**
 * B12 fixed fit formula: title 40 · seniority 15 · industry 20 · company size 15 · geo 10 · intent +≤20 · cap 100.
 * Pure function of (prospect, plan) — same input = same score. B6 reason from graph8 facts only.
 */
import type { LeadSignal } from '../../../../shared/types';
import type { SearchPlan } from './filters';
import { SIZES } from './vocab';
import { normDomain, normLinkedin } from './util';

/** One /search/contacts row, trimmed. Never carries PII (search emails/phones are masked anyway and dropped). */
export interface Prospect {
  first_name: string;
  last_name: string;
  full_name: string;
  job_title: string;
  seniority_level: string;
  job_department: string;
  company_name: string;
  company_domain: string;
  company_industry: string;
  company_employee_count: string;
  country: string;
  state: string;
  linkedin_url: string;
  confidence_score: number;
  signals: LeadSignal[];
  fit_score?: number;
  reason?: string;
  breakdown?: Record<string, number>;
}

const s = (v: unknown) => (typeof v === 'string' && v !== '***' ? v.trim() : '');

export function toProspect(row: Record<string, any>): Prospect {
  const first = s(row.first_name); const last = s(row.last_name);
  return {
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(' ') || 'Unknown',
    job_title: s(row.job_title),
    seniority_level: s(row.seniority_level),
    job_department: s(row.job_department),
    company_name: s(row.company_name),
    company_domain: normDomain(s(row.company_domain)),
    company_industry: s(row.company_industry),
    company_employee_count: s(row.company_employee_count),
    country: s(row.country) || s(row.company_country),
    state: s(row.state),
    linkedin_url: normLinkedin(s(row.linkedin_url)),
    confidence_score: typeof row.confidence_score === 'number' ? row.confidence_score : 0,
    signals: [],
  };
}

/** Stable identity for dedupe across search pages / widen steps. */
export function prospectKey(p: Pick<Prospect, 'linkedin_url' | 'full_name' | 'company_domain' | 'company_name'>): string {
  return p.linkedin_url || `${p.full_name.toLowerCase()}|${p.company_domain || p.company_name.toLowerCase()}`;
}

const lc = (x: string) => x.toLowerCase();
const has = (hay: string, needles: string[]) => needles.some((n) => n && new RegExp(`(^|[^a-z])${escape(lc(n))}([^a-z]|$)`).test(lc(hay)));
const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SENIORITY_LADDER = ['CXO', 'Owner / Partner', 'Vice President', 'Director', 'Experienced Manager', 'Senior'];

export function score(p: Prospect, plan: SearchPlan): Prospect {
  const b: Record<string, number> = { title: 0, seniority: 0, industry: 0, size: 0, geo: 0, intent: 0 };
  const title = `${p.job_title}`;
  if (plan.titles.length && has(title, plan.titles)) b.title = 40;
  else if (has(title, [...plan.adjacentTitles, ...plan.loose.titles])) b.title = 25;
  else if (!plan.titles.length) b.title = 20;

  if (!plan.seniority.length || plan.seniority.includes(p.seniority_level)) b.seniority = 15;
  else {
    const i = SENIORITY_LADDER.indexOf(p.seniority_level);
    const near = plan.seniority.some((x) => Math.abs(SENIORITY_LADDER.indexOf(x) - i) === 1);
    if (i >= 0 && near) b.seniority = 8;
  }

  if (!plan.industries.length || plan.industries.some((x) => lc(p.company_industry).includes(lc(x)))) b.industry = 20;

  if (!plan.sizes.length || plan.sizes.includes(p.company_employee_count)) b.size = 15;
  else {
    const i = SIZES.indexOf(p.company_employee_count as any);
    if (i >= 0 && plan.sizes.some((x) => Math.abs(SIZES.indexOf(x as any) - i) === 1)) b.size = 8;
  }

  if (!plan.countries.length || plan.countries.some((c) => lc(c) === lc(p.country))) b.geo = 10;
  else if (plan.loose.countries.some((c) => lc(c) === lc(p.country))) b.geo = 5;

  b.intent = Math.min(20, p.signals.length * 10);
  const total = Math.min(100, Object.values(b).reduce((a, x) => a + x, 0));
  return { ...p, fit_score: total, breakdown: b, reason: reasonFor(p) };
}

/** B6: facts only — "CFO, 201-500 staff, Financial Services, United Kingdom · hiring: …". */
export function reasonFor(p: Prospect): string {
  const fit = [p.job_title, p.company_employee_count && `${p.company_employee_count} staff`, p.company_industry, p.country]
    .filter(Boolean).join(', ');
  const sig = p.signals[0]?.text;
  return (sig ? `${fit} · ${sig}` : fit).slice(0, 160);
}

/**
 * B2 max 2/company + B13 confidence preference: fill with confidence ≥ 50 first, lower only to reach `n`.
 * Input must be deduped. Output sorted by fit desc (ties: confidence, then name for determinism).
 */
export function rank(ps: Prospect[], n: number, perCompany = 2, minConfidence = 50): Prospect[] {
  const sorted = [...ps].sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0)
    || b.confidence_score - a.confidence_score || a.full_name.localeCompare(b.full_name));
  const perCo = new Map<string, number>();
  const take = (p: Prospect) => {
    const co = p.company_domain || p.company_name.toLowerCase() || p.full_name;
    const c = perCo.get(co) ?? 0;
    if (c >= perCompany) return false;
    perCo.set(co, c + 1);
    return true;
  };
  const picked: Prospect[] = [];
  for (const p of sorted) if (picked.length < n && p.confidence_score >= minConfidence && take(p)) picked.push(p);
  for (const p of sorted) if (picked.length < n && p.confidence_score < minConfidence && take(p)) picked.push(p);
  return picked.sort((a, b) => sorted.indexOf(a) - sorted.indexOf(b));
}
