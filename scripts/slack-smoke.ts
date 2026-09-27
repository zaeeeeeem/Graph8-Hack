/**
 * Slack layer smoke test. Run from repo root:  pnpm -C server exec tsx ../scripts/slack-smoke.ts
 * Connects Socket Mode, posts as all 5 personas in ONE #sales-team thread, runs a checklist through 3 updates,
 * posts an approval card in #sales-hq, reads everything back, then deletes it all and disconnects.
 * Pass --keep to leave the messages for a visual check.
 */
import { slack, slackClient, stopSlack } from '../server/src/lib/slack';
import { AGENT_ROLE_VALUES } from '../shared/types';
import { openInGraph8Block, section } from '../server/src/slack/blocks';
import { persona } from '../server/src/slack/personas';

const keep = process.argv.includes('--keep');
const posted: Array<{ channel: string; ts: string }> = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
};

async function main() {
  await slack.start();
  check(true, 'Socket Mode connected');

  // 1. One thread, all 5 personas.
  const parent = await slack.agentThread('head_of_sales', '[smoke] Slack layer check');
  posted.push(parent);
  for (const role of AGENT_ROLE_VALUES) {
    const p = persona(role);
    const r = await slack.postAs(role, 'team', { text: `${p.name} here — reporting for duty. Shabash team!`, threadTs: parent.ts });
    posted.push(r);
  }

  // 2. Checklist in the same thread, 3 updates (the first burst coalesces into one edit).
  const cl = await slack.checklist('head_of_sales', 'team', '[smoke] Onboarding', [
    { key: 'docs', label: 'Read company docs', state: 'doing' },
    { key: 'target', label: 'Pick target persona', state: 'todo' },
    { key: 'linkedin', label: 'LinkedIn', state: 'todo' },
  ], parent.ts);
  posted.push({ channel: cl.channel, ts: cl.ts });
  const t0 = Date.now();
  await Promise.all([cl.set('docs', 'done', '23 docs'), cl.set('target', 'doing')]); // update 1 (coalesced)
  check(Date.now() - t0 >= 650, 'burst coalesced into one delayed update');
  await cl.set('target', 'done', 'Series A fintech CFOs'); // update 2
  await Promise.all([cl.set('linkedin', 'paused', 'not connected'), cl.add({ key: 'bilal', label: 'Bilal finding 10 leads', state: 'warn' })]); // update 3

  const replies = await slackClient().conversations.replies({ channel: parent.channel, ts: parent.ts, limit: 50 });
  const msgs = replies.messages ?? [];
  check(msgs.length >= 7, `thread has parent + 5 personas + checklist (${msgs.length} msgs)`);
  const names = new Set(msgs.map((m: any) => m.username).filter(Boolean));
  check(AGENT_ROLE_VALUES.every((r) => names.has(persona(r).username)), `all 5 persona usernames present`);
  const clMsg = msgs.find((m) => m.ts === cl.ts);
  // Slack stores emoji as :shortcodes: in text, so match on labels/notes from the last update.
  const clText = clMsg?.text ?? '';
  check(clText.includes('Series A fintech CFOs') && clText.includes('not connected') && clText.includes('Bilal finding'), 'checklist edited in place with final state');
  if (!clText.includes('not connected')) console.log('      checklist text:', JSON.stringify(clText));

  // 3. Approval card in #sales-hq.
  const card = await slack.approvalCard('head_of_sales', {
    approvalId: '00000000-0000-0000-0000-000000000000',
    title: '[smoke] Launch 6-touch sequence to 5 leads?',
    blocks: [section('Email D0 · ⏸ LinkedIn D1 · Email D3 · 📞 D5'), openInGraph8Block('sequences')],
    approveLabel: 'Launch',
  });
  posted.push(card);
  check(!!card.ts, 'approval card posted in #sales-hq (chat.postMessage ok)');
  const link = await slack.permalink(card.channel, card.ts);
  check(link.startsWith('https://'), 'permalink resolves');

  if (keep) {
    console.log('--keep: leaving messages. Thread:', await slack.permalink(parent.channel, parent.ts));
    return;
  }
  await sleep(500);
  for (const m of posted.reverse()) {
    await slackClient().chat.delete({ channel: m.channel, ts: m.ts }).catch((e) => {
      failures++;
      console.log('FAIL  delete', e?.data?.error ?? e?.message);
    });
  }
  check(true, `cleaned up ${posted.length} messages`);
}

main()
  .catch((e) => {
    failures++;
    console.error('FAIL ', e?.data?.error ?? e?.message ?? e);
  })
  .finally(async () => {
    await stopSlack().catch(() => undefined);
    console.log(failures ? `\n${failures} failure(s)` : '\nALL PASS');
    process.exit(failures ? 1 : 0);
  });
