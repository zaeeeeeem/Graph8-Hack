/**
 * try-intent — run the L6 intent layer live against a workspace (TEST by default). Run from repo root:
 *   pnpm -C server exec tsx ../scripts/try-intent.ts [--workspace <uuid>] [--signals-only]
 * 1. setup_intent_tracking (Gemini keywords → graph8 create-from-search + jobs keywords → settings)
 * 2. signals() → per-domain intent signals
 * Prints counts only (no emails/phones; domains are company-level, not PII).
 */
import type { RunCtx } from '../server/src/contracts';
import { log } from '../server/src/lib/log';
import { store } from '../server/src/lib/store';
import { intentLayer, setupIntentTracking } from '../server/src/layers/intent';

const TEST_WORKSPACE_ID = '5d6c3f5e-3909-4b66-b61b-97e590783d9b';

async function main() {
  const i = process.argv.indexOf('--workspace');
  const workspaceId = i > -1 ? process.argv[i + 1] : TEST_WORKSPACE_ID;
  const signalsOnly = process.argv.includes('--signals-only');
  const agent = await store.agentByRole(workspaceId, 'head_of_sales');
  const ctx = async (): Promise<RunCtx> => ({
    workspaceId, agentId: agent.id, role: 'head_of_sales', runId: 'try-intent',
    task: { id: undefined } as any,
    settings: await store.settings(workspaceId),
    log: log.child('try-intent'),
    step: async (_k, name, summary) => console.log(`  step ${name}: ${summary}`),
    report: async (kind, title) => console.log(`  report ${kind}: ${title}`),
    delegate: async () => { throw new Error('not in script'); },
    requestApproval: async () => { throw new Error('not in script'); },
    thread: async () => { throw new Error('not in script'); },
  });

  if (!signalsOnly) {
    const t0 = Date.now();
    const r = await setupIntentTracking(await ctx(), undefined, { awaitJobs: true });
    console.log(`setup_intent_tracking: ok=${r.ok} (${Date.now() - t0} ms incl. jobs keywords) — ${r.note ?? ''}`);
  }
  const c = await ctx();
  console.log(`stored keyword ids: ${(c.settings.g8_intent_keyword_ids ?? []).length}`);
  const t1 = Date.now();
  const sig = await intentLayer.signals!(c, typeof c.settings.target_persona === 'string' ? c.settings.target_persona : '');
  const total = sig.reduce((n, s) => n + s.signals.length, 0);
  console.log(`signals: ${sig.length} domains, ${total} signals (${Date.now() - t1} ms)${sig.length ? '' : ' — no buying signals yet'}`);
  for (const s of sig.slice(0, 5)) console.log(`  ${s.domain}: ${s.signals.length}`);
}

main().then(() => process.exit(0), (e) => { console.error('try-intent failed:', String(e?.message ?? e).slice(0, 200)); process.exit(1); });
