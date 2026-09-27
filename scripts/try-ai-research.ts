/**
 * try-ai-research — run the L5 graph8 AI research layer on ONE allowlisted teammate contact and print outputs + credits.
 *   pnpm -C server exec tsx ../scripts/try-ai-research.ts --contact 4 --list 3 [--workspace <uuid>] [--price] [--reset] [--set-domain 8x.social]
 *
 *   --price       only price the run (POST /enrichment/ai/validate-credits, free) — no spend
 *   --reset       clear the circuit breaker (settings.g8_ai_research_tripped) and exit
 *   --set-domain  PATCH the contact's company_domain first (only if it has none)
 * Bypasses the breaker for this one run (force). Prints ids, outputs and credits only — never emails/phones.
 */
import type { LeadRow, WorkspaceSettings } from '../shared/types';
import type { RunCtx } from '../server/src/contracts';
import { env } from '../server/src/lib/env';
import { g8, unwrap } from '../server/src/lib/g8';
import { log } from '../server/src/lib/log';
import { store } from '../server/src/lib/store';
import { collect, ensureForList } from '../server/src/layers/ai-research';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };
const flag = (k: string) => process.argv.includes(k);

async function main() {
  const ws = arg('--workspace') ?? env.WORKSPACE_ID;
  if (flag('--reset')) {
    await store.patchSettings(ws, { g8_ai_research_tripped: null } as Partial<WorkspaceSettings>);
    console.log('breaker cleared');
    return;
  }
  const contactId = Number(arg('--contact'));
  const listId = Number(arg('--list'));
  if (!contactId || !listId) { console.error('usage: try-ai-research --contact <g8 id> --list <g8 list id>'); process.exit(2); }

  // Hard rule: teammate contacts only.
  if (!(await g8.isAllowlisted({ g8ContactId: contactId }))) throw new Error(`contact ${contactId} is not on the test allowlist`);

  let c = unwrap<any>(await g8.get(`/contacts/${contactId}`));
  let domain: string | null = c?.company?.domain ?? c?.company_domain ?? null;
  const setDomain = arg('--set-domain');
  if (!domain && setDomain) {
    await g8.patch(`/contacts/${contactId}`, { company_domain: setDomain });
    c = unwrap<any>(await g8.get(`/contacts/${contactId}`));
    domain = c?.company?.domain ?? c?.company_domain ?? null;
  }
  if (!domain) throw new Error('contact has no company domain — refusing to run (a failed run still bills). Use --set-domain.');
  console.log(`contact ${contactId} company_domain=${domain} list=${listId}`);

  const groupId = await ensureForList(ws, listId);
  console.log(`group_id=${groupId}`);
  const price = unwrap<any>(await g8.post('/enrichment/ai/validate-credits', { group_id: groupId, list_id: listId, record_ids: [contactId] }));
  console.log(`graph8 price estimate: ${price?.required_credits} credits (${price?.message ?? ''})`);
  if (flag('--price')) return;

  const hira = await store.agentByRole(ws, 'researcher');
  const ctx = {
    workspaceId: ws, agentId: hira.id, role: 'researcher', runId: undefined, task: undefined, settings: await store.settings(ws), log,
    step: async (kind: string, name: string, summary: string, data?: object) => console.log(`[step ${kind}] ${name}: ${summary}`, data ?? ''),
  } as unknown as RunCtx;
  const lead = { id: `try-${contactId}`, g8_contact_id: String(contactId), g8_list_id: String(listId), company_domain: domain, full_name: 'teammate' } as LeadRow;

  const t0 = Date.now();
  const before = await g8.credits();
  const out = await collect(ctx, [lead], { force: true });
  const after = await g8.credits();
  console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)} s; credits ${before} -> ${after} (spent ${before - after})`);
  const facts = out[lead.id]?.facts ?? [];
  console.log(facts.length ? facts.map((f) => `  • ${f}`).join('\n') : '  (no outputs — Hira would fall back to Gemini-only)');
  const s = (await store.settings(ws)) as WorkspaceSettings & { g8_ai_research_tripped?: string };
  if (s.g8_ai_research_tripped) console.log(`breaker tripped: ${s.g8_ai_research_tripped} (clear with --reset)`);
}

main().then(() => process.exit(0), (err) => { console.error(String(err?.message ?? err)); process.exit(1); });
