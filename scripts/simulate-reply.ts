/**
 * Stage backup (Z8): inject a realistic `engagement.email_replied` for a TEST lead (allowlisted, is_test_contact).
 *
 *   pnpm -C server exec tsx ../scripts/simulate-reply.ts --yes [--lead <lead uuid>] [--text "…"] [--via webhook|direct]
 *
 * --via webhook (default when the server answers /healthz): signed POST to the running server's /webhooks/graph8, so the
 *   reply travels the real path (inbound_events dedupe → bus → Zara).
 * --via direct: no server needed — records inbound_events (source 'simulated') and runs Zara's handle_reply in this process.
 * Zara may book a meeting (~20 credits) and email the test contact, hence --yes. Never targets a non-test lead.
 */
import { createHmac } from 'node:crypto';
import { env } from '../server/src/lib/env';
import { store } from '../server/src/lib/store';
import type { JsonObject, LeadRow } from '../shared/types';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const DEFAULT_TEXT = 'Interested — Tuesday 3pm works for me.';

async function pickLead(): Promise<LeadRow> {
  const id = arg('--lead');
  let q = store.db.from('leads').select('*').eq('workspace_id', env.WORKSPACE_ID).eq('is_test_contact', true).eq('do_not_contact', false);
  if (id) q = q.eq('id', id);
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as LeadRow[];
  const lead = leads.find((l) => l.sequence_state === 'enrolled') ?? leads[0];
  if (!lead) throw new Error(id ? 'lead not found or not a test contact' : 'no test-contact lead in this workspace');
  if (!lead.g8_contact_id) throw new Error('lead has no graph8 contact id');
  return lead;
}

async function g8SequenceId(lead: LeadRow): Promise<string | null> {
  if (!lead.sequence_id) return null;
  const { data } = await store.db.from('sequences').select('g8_sequence_id').eq('id', lead.sequence_id).limit(1);
  return data?.[0]?.g8_sequence_id ?? null;
}

async function webhookSecret(): Promise<string | null> {
  if (env.G8_WEBHOOK_SECRET) return env.G8_WEBHOOK_SECRET;
  const { data } = await store.db.from('workspace_secrets').select('g8_webhook_secret').eq('workspace_id', env.WORKSPACE_ID).limit(1);
  return data?.[0]?.g8_webhook_secret ?? null;
}

async function serverUp(base: string): Promise<boolean> {
  try { const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function main() {
  if (!argv.includes('--yes')) {
    console.log('Dry run. Zara may book a meeting and email the TEST contact. Re-run with --yes.');
    return;
  }
  const lead = await pickLead();
  const { data: lc } = await store.db.from('lead_contacts').select('email').eq('lead_id', lead.id).limit(1);
  const email: string | null = lc?.[0]?.email ?? null;
  const now = new Date();
  const data: JsonObject = {
    contact_id: lead.g8_contact_id, email, sequence_id: await g8SequenceId(lead), campaign_id: null,
    reply_subject: 'Re: quick question', replied_at: now.toISOString(), is_positive: true,
    reply_text: arg('--text') ?? DEFAULT_TEXT, message_id: `sim-${now.getTime()}`, _source: 'simulated',
  };
  const type = 'engagement.email_replied';
  const localBase = `http://localhost:${env.PORT || 3000}`;
  const via = arg('--via') ?? ((await serverUp(localBase)) ? 'webhook' : 'direct');
  console.log(`simulating "${type}" for ${lead.full_name}${lead.company_name ? ` (${lead.company_name})` : ''} via ${via}`);

  if (via === 'webhook') {
    const raw = JSON.stringify({ event: type, timestamp: now.toISOString(), org_id: 'simulated', data });
    const ts = String(Math.floor(now.getTime() / 1000));
    const secret = await webhookSecret();
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-studio-timestamp': ts, 'x-simulated': '1' };
    if (secret) headers['x-studio-signature'] = `sha256=${createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')}`;
    const r = await fetch(`${arg('--url') ?? localBase}/webhooks/graph8`, { method: 'POST', headers, body: raw });
    console.log(`webhook → HTTP ${r.status}`);
    return;
  }

  // direct: same gate + same playbook, in-process
  const { claimInbound } = await import('../server/src/agents/zara/db');
  const { dedupeKey, normalize } = await import('../server/src/inbound/normalize');
  const id = await claimInbound({ workspaceId: env.WORKSPACE_ID, source: 'simulated', eventType: type, dedupeKey: dedupeKey(type, data), payload: data });
  if (!id) { console.log('already simulated (duplicate key)'); return; }
  const { runtime } = await import('../server/src/agents/runtime');
  const { zara } = await import('../server/src/agents/zara');
  runtime.register(zara);
  const reply = normalize(type, data);
  const task = await runtime.enqueue(env.WORKSPACE_ID, 'closer', 'handle_reply', `Handle reply from ${lead.full_name}`, {
    reply: reply as unknown as JsonObject, lead_id: lead.id, inbound_event_id: String(id),
  }, { priority: 0 });
  console.log(`task T-${task.number} queued; waiting…`);
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data: t } = await store.db.from('tasks').select('status,result_summary').eq('id', task.id).limit(1);
    const s = t?.[0];
    // Another server booting on the same workspace marks our in-flight task 'Interrupted…' — the run still continues here.
    const foreignRestart = s?.status === 'failed' && /server restart/i.test(s.result_summary ?? '');
    if (s && !foreignRestart && ['done', 'failed', 'blocked', 'cancelled'].includes(s.status)) { console.log(`${s.status}: ${s.result_summary ?? ''}`); break; }
  }
  process.exit(0);
}

main().catch((e) => { console.error(`simulate-reply failed: ${(e as Error).message}`); process.exit(1); });
