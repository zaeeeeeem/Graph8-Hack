/**
 * replay-chat — replay the founder's failed chat transcript + chat-bank questions against REAL Gemini and the Supabase
 * demo workspace, READ-ONLY: write tools run in dry-run mode (report what they'd do), no LLM spend rows, no Slack,
 * no server. Prints: route → question → tool calls → answer.
 *   SLACK_DISABLED=1 pnpm -C server exec tsx ../scripts/replay-chat.ts [workspace-id]
 */
process.env.SLACK_DISABLED = '1';
import type { AgentRole } from '../shared/types';
import { store } from '../server/src/lib/store';
import { agentChat, type HistoryMsg } from '../server/src/chat/agent-chat';
import { routeMessage, _resetRouting } from '../server/src/slack/events';
import { ROLE_NAME } from '../server/src/chat/tools';

const HQ = 'C_HQ'; const TEAM = 'C_TEAM';
interface Q { text: string; channel?: string; thread?: string; label?: string }

// Founder's real transcript (thread 't1' = replies under the first ask) then chat-bank questions.
const SCRIPT: Q[] = [
  { label: 'transcript', text: 'ayesha i need 7 prospects from software industry specifically' },
  { label: 'transcript', text: 'why you think thad warren is good here for us?' },
  { label: 'transcript', text: 'ayesha why is thad warren good', thread: 't3' },
  { label: 'transcript', text: 'can you ask on my behalf to hira?', thread: 't3' },
  { label: 'transcript', text: 'hira what do you mean contact points', thread: 't3' },
  { label: 'transcript', text: 'hira  can you share all those emails', thread: 't3' },
  { label: 'bank A', text: "How's the pipeline?" },
  { label: 'bank A', text: "What's everyone doing? Anything waiting on me?" },
  { label: 'bank A', text: 'How many credits have we used, and by whom?' },
  { label: 'bank B', text: 'Show top leads in the United States' },
  { label: 'bank B', text: 'What happened with Thad Warren so far?' },
  { label: 'bank C', text: 'Bilal, find 5 CFOs at fintech companies in the UK with 51-200 staff', channel: TEAM },
  { label: 'bank E', text: 'Usman how many emails sent? any bounces?', channel: TEAM },
  { label: 'bank F', text: 'Zara any replies?', channel: TEAM },
  { label: 'bank F', text: 'Bilal, any replies from prospects?', channel: TEAM },
  { label: 'bank H', text: 'Get me 3 meetings with UK fintech CFOs this week' },
  { label: 'bank G', text: 'From now on find 15 leads a day' },
  { label: 'limits', text: 'write a blog post about our product' },
];

async function main() {
  const ws = process.argv[2] ?? 'a0000000-0000-4000-8000-000000000001';
  const w = await store.workspace(ws);
  console.log(`# replay-chat · workspace ${w.name} (${ws}) · read-only\n`);
  _resetRouting();
  const threads = new Map<string, HistoryMsg[]>();
  const threadTs = new Map<string, string>();
  let n = 0;
  for (const q of SCRIPT) {
    n++;
    const ts = `${1000 + n}.0001`;
    const channel = q.channel ?? HQ;
    const tts = q.thread ? threadTs.get(q.thread) : undefined;
    const route = routeMessage({ text: q.text, isDm: false, channel, ts, threadTs: tts, hqChannel: HQ, teamChannel: TEAM });
    if (q.thread && !tts) threadTs.set(q.thread, ts);
    const key = q.thread ?? `solo-${n}`;
    const history = threads.get(key) ?? [];
    console.log(`\n## ${n}. [${q.label}] ${channel === HQ ? '#sales-hq' : '#sales-team'}${tts ? ' (thread)' : ''}\nFounder: ${q.text}`);
    if (!route) { console.log('→ ignored by routing'); continue; }
    const role: AgentRole = route.addressed ?? 'head_of_sales';
    console.log(`→ routed to ${ROLE_NAME[role]} (${route.kind})`);
    const t0 = Date.now();
    try {
      const r = await agentChat({ role, text: q.text, workspaceId: ws, history, readOnly: true });
      for (const c of r.calls) console.log(`  tool ${c.name}(${JSON.stringify(c.args)}) → ${JSON.stringify(c.result).slice(0, 220)}`);
      for (const a of r.asked ?? []) {
        for (const c of a.calls) console.log(`    [${ROLE_NAME[a.role]}] tool ${c.name}(${JSON.stringify(c.args)}) → ${JSON.stringify(c.result).slice(0, 160)}`);
      }
      console.log(`${ROLE_NAME[role]}: ${r.text}`);
      if (r.handoff) console.log(`${ROLE_NAME[r.handoff.role]}: ${r.handoff.text}`);
      if (r.blocks.length) console.log(`  (+${r.blocks.length} Slack blocks: lead card/list with Open in graph8)`);
      if (/@[\w-]+\.\w|\+?\d[\d\s-]{8,}\d/.test(r.text + (r.handoff?.text ?? ''))) console.log('  !! PII-looking text in answer');
      console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      history.push({ who: 'Founder', text: q.text }, { who: ROLE_NAME[role], text: r.text });
      if (r.handoff) history.push({ who: ROLE_NAME[r.handoff.role], text: r.handoff.text });
      threads.set(key, history);
    } catch (e: any) {
      console.log(`  !! failed: ${String(e?.message ?? e).slice(0, 300)}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
