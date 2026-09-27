/**
 * try-linkedin-send — W15 LinkedIn live send via graph8 workflows (Netrion). docs/verify/linkedin-send.md
 *   SLACK_DISABLED=1 pnpm -C server exec tsx ../scripts/try-linkedin-send.ts --dry        # sender + validate + guard, no writes
 *   SLACK_DISABLED=1 pnpm -C server exec tsx ../scripts/try-linkedin-send.ts --live       # ONE DM to Zaeem only
 *   SLACK_DISABLED=1 pnpm -C server exec tsx ../scripts/try-linkedin-send.ts --status <execution_id>
 * Sends only to the allowlisted "Zaeem" entry (guarded in lib/linkedin-send). Prints no emails/phones/profile URLs.
 */
import { NotAllowlisted } from '../server/src/contracts';
import { linkedinNames } from '../server/src/lib/env';
import {
  assertSendable, describeSend, findWorkflow, getExecution, liveSendsOn, resolveSender, sendLinkedin, targetByName,
  validateWorkflow, WORKFLOW_NAMES,
} from '../server/src/lib/linkedin-send';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const has = (f: string) => process.argv.includes(f);
const TEXT = 'Hi Zaeem — quick test from Graphi\'s SDR agent 👋';

async function main() {
  const status = arg('--status');
  if (status) {
    const ex = await getExecution(status);
    console.log(JSON.stringify(ex, null, 1).replace(/https?:\/\/\S*linkedin\S*/gi, '[profile]').slice(0, 4000));
    return;
  }
  const sender = await resolveSender();
  console.log(`sender seat: id ${sender.id} (${sender.name})`);
  console.log(`LINKEDIN_SEND_NAMES=${linkedinNames.send().join(',') || '(empty)'} · LINKEDIN_CONNECTED_NAMES=${linkedinNames.connected().join(',') || '(empty)'} · liveSendsOn=${liveSendsOn()}`);
  for (const k of ['connect', 'message'] as const) {
    console.log(`validate "${WORKFLOW_NAMES[k]}" →`, JSON.stringify(await validateWorkflow(k)), `· existing id: ${await findWorkflow(k) ?? 'none'}`);
  }
  try { assertSendable('https://www.linkedin.com/in/someone-else'); console.log('GUARD BROKEN: non-allowlisted url passed'); process.exit(2); }
  catch (e) { console.log(`guard: non-allowlisted url → ${e instanceof NotAllowlisted ? 'NotAllowlisted ✓' : String(e)}`); }

  const zaeem = targetByName('Zaeem');
  if (!zaeem) { console.log('Zaeem is not a send-enabled allowlisted LinkedIn contact — stop.'); return; }
  const kind = zaeem.connected ? 'message' : 'connect';
  console.log(`would send: ${kind} to ${zaeem.name} (connected=${zaeem.connected}) text="${TEXT}"`);
  if (!has('--live')) { console.log('dry run — nothing sent'); return; }

  const r = await sendLinkedin({ kind, url: zaeem.url, text: TEXT, waitMs: 45_000 });
  console.log(describeSend(r));
  console.log(JSON.stringify({ state: r.state, workflow_id: r.workflow_id, execution_id: r.execution_id, execution_status: r.execution_status, queue_id: r.queue_id, skip_reason: r.skip_reason, error: r.error }));
}

main().then(() => process.exit(0), (e) => { console.error(String(e?.message ?? e).slice(0, 500)); process.exit(1); });
