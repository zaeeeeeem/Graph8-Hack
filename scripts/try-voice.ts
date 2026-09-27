/**
 * try-voice — check the L2 voice path end to end, and (only with --yes) ring the Zaeem test phone once.
 *   pnpm -C server exec tsx ../scripts/try-voice.ts --dry   # agent + AI-number check, then POST /voice/calls dry_run:true
 *   pnpm -C server exec tsx ../scripts/try-voice.ts --yes   # real call to the Zaeem allowlist phone (~20 credits/min)
 * Never calls anyone but the TEST_ALLOWLIST entry named Zaeem (and g8.callGuarded re-checks). Prints no phone digits
 * except the last 4 of our own caller id.
 * Exit codes: 0 ok, 2 blocked (no agent / no AI-calling number / no Zaeem entry), 1 error.
 */
import { env } from '../server/src/lib/env';
import { g8, unwrap } from '../server/src/lib/g8';
import { store } from '../server/src/lib/store';
import { aiNumbers, maskNumber, NO_NUMBER_NOTE, pickFromNumber } from '../server/src/layers/voice';

const TEST_AGENT_ID = 'f5377a72-3c74-4931-9379-40a9baee5290';

function blocked(msg: string): never {
  console.log(`BLOCKED: ${msg}`);
  process.exit(2);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const yes = process.argv.includes('--yes');
  if (dry === yes) { console.error('usage: try-voice --dry | --yes'); process.exit(2); }

  let agentId = TEST_AGENT_ID;
  let eventId = 1;
  try {
    const s = await store.settings(env.WORKSPACE_ID);
    if (s.g8_voice_agent_id) agentId = s.g8_voice_agent_id;
    if (s.g8_event_type_id) eventId = s.g8_event_type_id;
  } catch (err: any) {
    console.log(`note: workspace settings unreadable (${err?.message ?? err}); using test agent + event type 1`);
  }

  const agent = unwrap<any>(await g8.get(`/voice/agents/${agentId}`).catch(() => null));
  const a = agent?.agent ?? agent;
  if (!a?.agent_id) blocked(`voice agent ${agentId} not found in graph8`);
  console.log(`agent: ${a.persona?.agent_name ?? a.agent_name ?? '?'} (${a.agent_id}) status=${a.agent_status} calendar=${a.identity?.calendar ?? '-'}`);

  const n = await aiNumbers();
  console.log(`AI-calling numbers: available=${n.available.length} booked=${n.booked.length}`);
  const from = pickFromNumber(n, a.agent_id);
  if (!from) blocked(`${NO_NUMBER_NOTE} — founder must provision an AI-calling number in graph8 (Voice → Numbers; dialer-only numbers are rejected by POST /voice/calls)`);
  console.log(`caller id: ${maskNumber(from)}`);

  const zaeem = env.allowlist.find((e) => /zaeem/i.test(e.name) && e.phone);
  if (!zaeem?.phone) blocked('no TEST_ALLOWLIST entry named Zaeem with a phone');

  const body = {
    to_phone: zaeem.phone, from_phone: from, agent_id: a.agent_id, event_id: eventId, first_name: 'Zaeem',
    ...(env.PUBLIC_URL ? { callback_url: env.PUBLIC_URL.replace(/\/+$/, '') + '/webhooks/graph8' } : {}),
    ...(dry ? { dry_run: true } : {}),
  };
  const res = unwrap<any>(await g8.callGuarded(body));
  console.log(`${dry ? 'dry run' : 'CALL PLACED'}: status=${res?.status ?? '?'} room_name=${res?.room_name ?? '-'} message=${res?.message ?? ''}`);
  if (!dry) console.log('Answer the phone; then GET /voice/calls/<room_name>/artifacts or watch the server log for voice.outcome.');
}

main().catch((err) => {
  console.error(`ERROR: ${err?.message ?? err}`);
  process.exit(1);
});
