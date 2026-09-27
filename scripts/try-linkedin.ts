/**
 * try-linkedin — V-L1 re-probe + L3 watcher check (docs/verify/layers.md).
 *   SLACK_DISABLED=1 pnpm -C server exec tsx ../scripts/try-linkedin.ts              # read-only: connection + senders
 *   SLACK_DISABLED=1 pnpm -C server exec tsx ../scripts/try-linkedin.ts --probe-steps # + POST /sequences with HEYREACH/NETRION (expect 422, nothing persists)
 *   SLACK_DISABLED=1 LINKEDIN_FAKE_CONNECTED=1 pnpm -C server exec tsx ../scripts/try-linkedin.ts --watch-once
 *                                                                                   # run one watcher pass on WORKSPACE_ID (writes our DB only)
 * Never contacts anyone; prints no PII.
 */
import { env } from '../server/src/lib/env';
import { g8 } from '../server/src/lib/g8';
import { checkOnce, probeConnection } from '../server/src/layers/linkedin';

const has = (f: string) => process.argv.includes(f);

async function main() {
  const conn = await g8.get('/linkedin/connection').catch((e) => ({ error: String(e?.message ?? e) }));
  const snd = await g8.get('/workflows/integrations/linkedin/senders').catch((e) => ({ error: String(e?.message ?? e) }));
  console.log('GET /linkedin/connection →', JSON.stringify(conn));
  console.log('GET /workflows/integrations/linkedin/senders → total_count', (snd as any)?.total_count ?? (snd as any)?.error);
  console.log('probeConnection() →', JSON.stringify(await probeConnection()));

  if (has('--probe-steps')) {
    for (const step_type of ['HEYREACH', 'NETRION']) {
      const body = {
        name: `graphi linkedin probe ${step_type} (delete me)`,
        steps: [{ step_order: 1, step_type, time_interval: 0, step_data: { action: 'CONNECTION_REQUEST', linkedin_connection_message: 'probe' } }],
      };
      try {
        const r: any = await g8.post('/sequences', body);
        console.log(`POST /sequences ${step_type} → ACCEPTED (graph8 changed! re-read V-L1)`, JSON.stringify(r).slice(0, 300));
      } catch (e: any) {
        console.log(`POST /sequences ${step_type} → rejected:`, String(e?.message ?? e).slice(0, 200));
      }
    }
  }

  if (has('--watch-once')) {
    const flipped = await checkOnce(env.WORKSPACE_ID);
    console.log(`watcher pass on ${env.WORKSPACE_ID} → ${flipped ? 'flipped to connected' : 'no change'}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
