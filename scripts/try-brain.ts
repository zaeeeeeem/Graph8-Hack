/**
 * try-brain — run Ayesha's W13 company brain for ANY domain without Slack or the server: graph8 docs if they're
 * about the domain, else the website (homepage + /about) → Gemini target pick. Never starts a graph8 study (a
 * `force:true` analyze would overwrite the org's docs), never writes settings. One credit_events row (llm) on the
 * TEST workspace.
 *   pnpm -C server exec tsx ../scripts/try-brain.ts linear.app
 */
import { store } from '../server/src/lib/store';
import { companyBrain, companyName, pickTarget } from '../server/src/agents/ayesha/onboarding';
import { normDomain } from '../server/src/agents/ayesha/util';

async function main() {
  const domain = normDomain(process.argv[2] ?? '');
  if (!domain) { console.error('usage: try-brain <domain>'); process.exit(2); }
  const ws = (await store.db.from('workspaces').select('id').eq('slug', 'test-workspace').single()).data?.id as string;
  const agent = (await store.db.from('agents').select('id').eq('workspace_id', ws).eq('role', 'head_of_sales').single()).data?.id as string;
  if (!ws || !agent) throw new Error('test workspace / Ayesha missing (scripts/reset-demo.ts --workspace test --clean --yes)');
  const steps: string[] = [];
  const ctx: any = {
    workspaceId: ws, agentId: agent, task: { id: undefined, input: {} }, settings: {},
    log: { info() {}, warn: (m: string, x?: unknown) => console.warn('warn:', m, x ?? ''), error() {}, child() { return this; } },
    step: async (_k: string, name: string, summary: string) => { steps.push(`${name}: ${summary}`); },
  };
  const t0 = Date.now();
  const b = await companyBrain(ctx, domain, { startStudy: false });
  const t1 = Date.now();
  const pick = await pickTarget(ctx, domain, b.docs, b.site?.text);
  pick.company = await companyName(domain, pick.company, b.docsMatch);
  console.log(steps.map((s) => `  · ${s}`).join('\n'));
  console.log(`org website: ${b.orgDomain ?? '(unknown)'} · docs about ${domain}: ${b.docsMatch} · brain source: ${b.docsMatch ? 'graph8 docs' : b.site?.text ? 'website' : 'none'}`);
  if (b.site) console.log(`pages read: ${b.site.pages.map((p) => p.url).join(', ') || '(none)'} · ${b.site.text.length} chars in ${t1 - t0} ms`);
  console.log(`target picked in ${Date.now() - t1} ms:`);
  console.log(JSON.stringify(pick, null, 2));
  const leak = /8x\s?social|8x\.social/i.test(JSON.stringify(pick));
  if (!b.docsMatch && leak) { console.error('FAIL: target mentions 8x.social for another domain'); process.exit(1); }
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
