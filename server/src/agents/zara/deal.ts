/**
 * Z-T7 create_deal (Z3/Z4/Z9).
 * Verified 07:14 PKT: POST /deals {name, owner_id (required), contact_ids:int[] (min 1), company_id:int?, amount, currency,
 * pipeline_id, stage_id, close_date?, allow_duplicate} → {data: DealResponse{id, stage_name, amount, …}}.
 * GET /deals/pipelines → "Sales Pipeline" b7fef03e-… stage "New Meeting" 1b2f2d3e-…. Pricing doc = global-context
 * "Pricing Matrix" (category offer, markdown `content`).
 */
import { z } from 'zod';
import { g8 } from '../../lib/g8';
import { llm } from '../../lib/llm';
import type { LeadRow, UUID, WorkspaceSettings } from '../../../../shared/types';

export const FALLBACK_DEAL_AMOUNT = 12_000;
export const MIN_DEAL_AMOUNT = 1_000;
export const G8_APP = 'https://app.graph8.com';
/** Browser-verified (docs/verify/core.md §4): /deals/{id}; pipeline board when the id is missing. */
export const dealUrl = (dealId: string | null) => (dealId ? `${G8_APP}/deals/${dealId}` : `${G8_APP}/deals/pipeline`);

let pricingCache: { text: string; at: number } | null = null;
export async function pricingMatrix(): Promise<string | null> {
  if (pricingCache && Date.now() - pricingCache.at < 3600_000) return pricingCache.text;
  try {
    const r = await g8.get('/global-context/documents', { include_content: true, limit: 60 });
    const docs: any[] = r?.data ?? [];
    const doc = docs.find((d) => /pricing/i.test(String(d.display_name ?? d.doc_type ?? d.name ?? '')));
    const text = doc?.content ? String(doc.content) : null;
    if (text) pricingCache = { text, at: Date.now() };
    return text;
  } catch {
    return null;
  }
}

const EstimateSchema = z.object({ amount: z.number().positive(), plan: z.string() });

/** Gemini picks the likely plan (annual contract value, USD) for this company from the pricing doc. */
export async function estimateAmount(lead: LeadRow, opts: { agentId: UUID; workspaceId: UUID; taskId?: UUID }): Promise<{ amount: number; plan: string; estimated: true }> {
  const pricing = await pricingMatrix();
  if (!pricing) return { amount: FALLBACK_DEAL_AMOUNT, plan: 'default estimate', estimated: true };
  const research = JSON.stringify(lead.research ?? {}).slice(0, 1200);
  try {
    const out = await llm.json([
      'From this pricing matrix, pick the plan this prospect most likely buys after a discovery call booked by our outbound',
      'team, and its first-year contract value in USD. They are a B2B buyer: pick the main paid offer (managed/pro/business tier),',
      'not a free or self-serve DIY tier, sized to the company. Monthly prices × 12.',
      `Prospect: ${lead.job_title ?? 'contact'} at ${lead.company_name ?? 'unknown company'} (${lead.company_domain ?? 'no domain'}).`,
      `Known company facts: ${research}`,
      'Return {"amount": number (USD, annual), "plan": short plan name}.',
      '--- pricing matrix ---',
      pricing.slice(0, 6000),
    ].join('\n'), EstimateSchema, { ...opts, temperature: 0 });
    const amount = Math.round(out.amount);
    // Self-serve tiers are not what a booked discovery call sells → below MIN_DEAL_AMOUNT use the founder-approved fallback.
    if (!Number.isFinite(amount) || amount < MIN_DEAL_AMOUNT || amount > 5_000_000) throw new Error('implausible');
    return { amount, plan: out.plan.slice(0, 80), estimated: true };
  } catch {
    return { amount: FALLBACK_DEAL_AMOUNT, plan: 'default estimate', estimated: true };
  }
}

let ownerCache: string | null = null;
async function ownerCandidates(settings: WorkspaceSettings): Promise<string[]> {
  const out: string[] = [];
  if (typeof settings.g8_owner_id === 'string') out.push(settings.g8_owner_id);
  if (ownerCache) out.push(ownerCache);
  try {
    const r = await g8.get('/team-members', { limit: 5 });
    const items: any[] = r?.data?.items ?? r?.data ?? [];
    const me = items.find((m) => m.status === 'active') ?? items[0];
    // Verified 10:15 PKT: deal owner_id = team-member `id` (propelauth id is rejected).
    if (me?.id) out.push(String(me.id));
    if (me?.propelauth_user_id) out.push(String(me.propelauth_user_id));
  } catch { /* fall through */ }
  return [...new Set(out)];
}

export interface CreatedDeal { dealId: string | null; stageName: string; amount: number; plan: string; url: string }

export async function createDeal(p: {
  lead: LeadRow; settings: WorkspaceSettings; agentId: UUID; workspaceId: UUID; taskId?: UUID;
}): Promise<CreatedDeal> {
  const { lead, settings } = p;
  if (!lead.g8_contact_id) throw new Error('lead has no graph8 contact id');
  const est = await estimateAmount(lead, p);
  const base: Record<string, unknown> = {
    name: `${lead.company_name ?? lead.full_name} — Discovery call`,
    amount: est.amount, currency: 'USD',
    pipeline_id: settings.g8_pipeline_id, stage_id: settings.g8_stage_new_meeting_id,
    contact_ids: [Number(lead.g8_contact_id)],
  };
  if (lead.g8_company_id && /^\d+$/.test(lead.g8_company_id)) base.company_id = Number(lead.g8_company_id);
  const owners = await ownerCandidates(settings);
  let lastErr: unknown = null;
  let companyAttached = false;
  for (const owner_id of owners.length ? owners : ['']) {
    for (let attempt = 0; attempt < 2; attempt++) try {
      const r = await g8.post('/deals', { ...base, ...(owner_id ? { owner_id } : {}) });
      const d = r?.data ?? r ?? {};
      if (owner_id) ownerCache = owner_id;
      const dealId = d.id ? String(d.id) : null;
      return { dealId, stageName: d.stage_name ?? 'New Meeting', amount: est.amount, plan: est.plan, url: dealUrl(dealId) };
    } catch (e) {
      lastErr = e;
      // core.md §4: "Contact(s) have no associated company" → attach the contact to its company, retry once.
      if (!companyAttached && /no associated company/i.test(String((e as Error).message)) && base.company_id) {
        companyAttached = true;
        try { await g8.patch(`/contacts/${lead.g8_contact_id}`, { company_id: base.company_id }); continue; } catch { /* give up below */ }
      }
      break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('POST /deals failed');
}
