/**
 * allowlist — upsert TEST_ALLOWLIST ("Name|email|phone|linkedin;…") into contact_allowlist for a workspace.
 *   pnpm -C server exec tsx ../scripts/allowlist.ts --workspace test|demo|<uuid>
 * Prints labels only (never emails/phones).
 */
import { DEMO_WORKSPACE_ID } from '../shared/types';
import { env } from '../server/src/lib/env';
import { must, store } from '../server/src/lib/store';

const db = store.db;

async function resolveWorkspace(w: string): Promise<string> {
  if (w === 'demo') return DEMO_WORKSPACE_ID;
  if (w === 'test') {
    const r = await db.from('workspaces').select('id').eq('slug', 'test-workspace').maybeSingle();
    if (!r.data) throw new Error('test workspace missing — run scripts/reset-demo.ts --workspace test --clean --yes first');
    return r.data.id as string;
  }
  return w;
}

async function main() {
  const i = process.argv.indexOf('--workspace');
  const w = i > -1 ? process.argv[i + 1] : undefined;
  if (!w) { console.error('usage: allowlist --workspace test|demo|<uuid>'); process.exit(2); }
  const ws = await resolveWorkspace(w);
  if (!env.allowlist.length) throw new Error('TEST_ALLOWLIST is empty');

  const existing = must(await db.from('contact_allowlist').select('id,email,phone').eq('workspace_id', ws), 'read allowlist') as
    Array<{ id: string; email: string | null; phone: string | null }>;
  let inserted = 0, updated = 0;
  for (const e of env.allowlist) {
    const row = { workspace_id: ws, label: e.name, email: e.email ?? null, phone: e.phone ?? null, linkedin_url: e.linkedin ?? null };
    const hit = existing.find((x) => (e.email && x.email?.toLowerCase() === e.email) || (e.phone && x.phone === e.phone));
    if (hit) {
      must(await db.from('contact_allowlist').update(row).eq('id', hit.id), `update ${e.name}`);
      updated++;
    } else {
      must(await db.from('contact_allowlist').insert(row), `insert ${e.name}`);
      inserted++;
    }
    console.log(`  ${hit ? 'updated ' : 'inserted'} ${e.name}`);
  }
  const n = (await db.from('contact_allowlist').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count;
  console.log(`Workspace ${ws}: ${inserted} inserted, ${updated} updated, ${n} total allowlisted contacts.`);
}

main().catch((err) => { console.error(String(err?.message ?? err)); process.exit(1); });
