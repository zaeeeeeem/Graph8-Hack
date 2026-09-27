/**
 * Create or PATCH the graph8 webhook → ${PUBLIC_URL}/webhooks/graph8 for every event our agents/layers react to.
 * The secret (returned once on create / rotate) is stored in workspace_secrets. Prints only "secret stored" — never the secret.
 *
 *   pnpm -C server exec tsx ../scripts/register-webhook.ts [--rotate] [--dry-run]
 */
import { env } from '../server/src/lib/env';
import { g8 } from '../server/src/lib/g8';
import { store } from '../server/src/lib/store';
import { WEBHOOK_EVENTS } from '../server/src/inbound/handlers/index';

const NAME = 'graphi';
const args = new Set(process.argv.slice(2));

async function main() {
  const base = env.PUBLIC_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('PUBLIC_URL is not set');
  const url = `${base}/webhooks/graph8`;
  const events = [...new Set(WEBHOOK_EVENTS)];

  const list = await g8.get('/webhooks');
  const hooks: any[] = list?.data ?? [];
  const existing = hooks.find((h) => h.name === NAME) ?? hooks.find((h) => String(h.url).endsWith('/webhooks/graph8'));
  console.log(`${existing ? 'update' : 'create'} webhook → ${url} (${events.length} events)`);
  if (args.has('--dry-run')) return;

  let id: string; let secret: string | null = null;
  if (existing) {
    const r = await g8.patch(`/webhooks/${existing.id}`, { url, events, name: NAME, is_active: true });
    id = String((r?.data ?? r).id ?? existing.id);
    if (args.has('--rotate')) {
      const rs = await g8.post(`/webhooks/${id}/rotate-secret`);
      secret = (rs?.data ?? rs)?.secret ?? null;
    }
  } else {
    const r = await g8.post('/webhooks', { url, events, name: NAME });
    const d = r?.data ?? r;
    id = String(d.id);
    secret = d.secret ?? null;
  }

  const row: Record<string, unknown> = { workspace_id: env.WORKSPACE_ID, g8_webhook_id: id };
  if (secret) row.g8_webhook_secret = secret;
  const { error } = await store.db.from('workspace_secrets').upsert(row, { onConflict: 'workspace_id' });
  if (error) throw new Error(`workspace_secrets upsert failed: ${error.message}`);
  console.log(secret ? 'secret stored' : `webhook ${id} updated (secret unchanged; use --rotate to issue a new one)`);
}

main().catch((e) => { console.error(`register-webhook failed: ${(e as Error).message}`); process.exit(1); });
