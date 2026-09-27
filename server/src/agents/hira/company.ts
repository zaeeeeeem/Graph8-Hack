/**
 * R3 research_company: POST /enrichment/lookup/company (free, index) + POST /companies/open-jobs (free, CRM company ids).
 * Returns short fact strings built only from graph8 data (B6/H2) — no company phone numbers.
 */
import type { LeadSignal } from '../../../../shared/types';
import { g8 } from '../../lib/g8';
import { unwrap, withTimeout } from '../bilal/util';

export interface CompanyFacts { facts: string[]; signals: LeadSignal[]; found: boolean }

export function lookupFacts(r: any): CompanyFacts {
  const found = r?.found !== false && !!r?.data;
  const d = r?.data ?? {};
  const facts: string[] = [];
  if (d.name && d.industry) facts.push(`${d.name} is in ${d.industry}`);
  if (d.employee_count) facts.push(`${d.employee_count} employees`);
  if (d.revenue || d.annual_revenue) facts.push(`revenue ${d.revenue ?? d.annual_revenue}`);
  if (d.founded_year) facts.push(`founded ${d.founded_year}`);
  if (d.country) facts.push(`based in ${d.country}`);
  if (typeof d.description === 'string' && d.description) facts.push(`about: ${d.description.replace(/\s+/g, ' ').slice(0, 280)}`);
  const signals: LeadSignal[] = [];
  if (Array.isArray(d.technologies) && d.technologies.length) signals.push({ type: 'tech', text: `uses ${d.technologies.slice(0, 4).join(', ')}`, source: 'graph8 company lookup' });
  if (d.funding_stage || d.last_funding_round) signals.push({ type: 'funding', text: `funding: ${d.funding_stage ?? d.last_funding_round}`, source: 'graph8 company lookup' });
  return { facts, signals, found };
}

export async function lookupCompany(domain: string | null, name: string | null, ms = 20_000): Promise<CompanyFacts> {
  if (!domain && !name) return { facts: [], signals: [], found: false };
  const body = domain ? { domain } : { name };
  return lookupFacts(unwrap(await withTimeout(g8.post('/enrichment/lookup/company', body), ms, 'company lookup')));
}

/** Parse the loosely-typed open-jobs payload into company_id → { count, titles }. */
export function parseOpenJobs(r: any): Map<string, { count: number; titles: string[] }> {
  const out = new Map<string, { count: number; titles: string[] }>();
  const rows: any[] = Array.isArray(r) ? r : Array.isArray(r?.companies) ? r.companies : Array.isArray(r?.results) ? r.results
    : r && typeof r === 'object' ? Object.entries(r).map(([k, v]) => ({ company_id: k, ...(v as object) })) : [];
  for (const row of rows) {
    const id = row?.company_id ?? row?.id;
    if (id == null) continue;
    const jobs: any[] = Array.isArray(row.jobs) ? row.jobs : Array.isArray(row.postings) ? row.postings : [];
    const count = Number(row.open_jobs ?? row.count ?? row.total ?? jobs.length) || 0;
    const titles = jobs.map((j) => j?.title ?? j?.job_title).filter((t): t is string => typeof t === 'string').slice(0, 3);
    out.set(String(id), { count, titles });
  }
  return out;
}

export async function openJobs(companyIds: string[], ms = 20_000): Promise<Map<string, { count: number; titles: string[] }>> {
  const ids = [...new Set(companyIds)].map(Number).filter((n) => Number.isFinite(n));
  if (!ids.length) return new Map();
  const r = unwrap(await withTimeout(g8.post('/companies/open-jobs', { company_ids: ids, window_days: 60, include_postings: true, limit_per_company: 3 }), ms, 'open jobs'));
  return parseOpenJobs(r);
}

export function hiringSignal(j?: { count: number; titles: string[] }): LeadSignal | null {
  if (!j || j.count <= 0) return null;
  return { type: 'hiring', text: `${j.count} open role${j.count > 1 ? 's' : ''} in 60 days${j.titles.length ? ` (e.g. ${j.titles.join(', ')})` : ''}`.slice(0, 160), source: 'graph8 open jobs' };
}
