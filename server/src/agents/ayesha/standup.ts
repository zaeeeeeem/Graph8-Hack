/** P4 — Standup (T5 + T10 → T9). Card in #sales-hq; each agent posts its own line in the thread (D18). */
import type { RunCtx } from '../../contracts';
import type { AgentRole, JsonObject, PortalAgentRow, PortalPipelineRow, StandupData, UUID } from '../../../../shared/types';
import { slack } from '../../lib/slack';
import { store } from '../../lib/store';
import { agentDetailLine, standupCard } from '../../slack/cards/standup';
import { LOW_CREDITS, checkCredits } from './onboarding';
import { errMsg, fmtNum } from './util';

export interface StatusFacts {
  pipeline: StandupData['pipeline'];
  agents: PortalAgentRow[];
  blockers: string[];
  doneRecently: string[];
  graph8Credits?: number;
  paused: boolean;
}

/** T10 get_status — facts only from our DB views + graph8 /usage. No PII. */
export async function gatherStatus(workspaceId: UUID): Promise<StatusFacts> {
  const db = store.db;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [pipe, agents, needs, done, credits] = await Promise.allSettled([
    db.from('portal_pipeline').select('*').eq('workspace_id', workspaceId),
    db.from('portal_agents').select('*').eq('workspace_id', workspaceId).order('sort_order'),
    db.from('portal_needs_you').select('title,item_type').eq('workspace_id', workspaceId).limit(5),
    db.from('tasks').select('title').eq('workspace_id', workspaceId).eq('status', 'done').gte('finished_at', since).order('finished_at', { ascending: false }).limit(6),
    checkCredits(),
  ]);
  const rows = (r: PromiseSettledResult<any>): any[] => (r.status === 'fulfilled' ? r.value?.data ?? [] : []);
  const stages = rows(pipe) as PortalPipelineRow[];
  const count = (...s: string[]) => stages.filter((r) => s.includes(r.stage)).reduce((a, r) => a + Number(r.lead_count || 0), 0);
  const agentRows = rows(agents) as PortalAgentRow[];
  return {
    pipeline: {
      prospects: stages.filter((r) => r.stage !== 'disqualified').reduce((a, r) => a + Number(r.lead_count || 0), 0),
      contacted: count('contacted', 'replied', 'meeting', 'deal', 'won', 'lost'),
      replied: count('replied', 'meeting', 'deal', 'won'),
      meetings: count('meeting', 'deal', 'won'),
      deals: count('deal', 'won'),
      deal_value: stages.reduce((a, r) => a + Number(r.deal_amount || 0), 0),
    },
    agents: agentRows,
    blockers: rows(needs).map((n) => String(n.title)),
    doneRecently: rows(done).map((t) => String(t.title)),
    graph8Credits: credits.status === 'fulfilled' ? credits.value.available : undefined,
    paused: agentRows.length > 0 && agentRows.filter((a) => a.role !== 'head_of_sales').every((a) => a.status === 'paused'),
  };
}

export async function runStandup(ctx: RunCtx): Promise<string> {
  const f = await gatherStatus(ctx.workspaceId);
  await ctx.step('tool', 'get_status', `${f.pipeline.prospects} prospects, ${f.blockers.length} blockers`);
  const data: StandupData = {
    pipeline: f.pipeline,
    credits: Object.fromEntries(f.agents.map((a) => [a.name, Number(a.spent_today_credits || 0)])),
    blockers: f.blockers,
  };
  const s = ctx.settings;
  const today = f.paused ? 'Team is paused. Say "resume" when ready.'
    : `find ${s.daily_find ?? 10} → research ${s.daily_research ?? 5} → build sequence → your launch call`;
  const hour = new Date().getUTCHours() + 5; // PKT
  const greeting = hour >= 5 && hour < 12 ? 'Assalam o Alaikum! Here is where we stand.' : undefined;
  const card = standupCard({ data, graph8Credits: f.graph8Credits, doneToday: f.doneRecently, today, greeting });
  const msg = await slack.postAs('head_of_sales', 'hq', card);

  for (const a of f.agents) {
    if (a.role === 'head_of_sales') continue;
    const line = agentDetailLine({
      name: a.name, title: a.title, status: a.status, tasksDone: a.tasks_done, tasksOpen: a.tasks_open,
      credits: Number(a.spent_today_credits || 0), current: a.current_task_title,
    });
    await slack.postAs(a.role as AgentRole, msg.channel, { text: line, threadTs: msg.ts }).catch((e) => ctx.log.warn('standup detail failed', { err: errMsg(e) }));
  }
  if (f.graph8Credits !== undefined && f.graph8Credits < LOW_CREDITS) {
    await slack.postAs('head_of_sales', msg.channel, { text: `⚠️ graph8 credits low: ${fmtNum(f.graph8Credits)} left.`, threadTs: msg.ts }).catch(() => undefined);
  }
  await ctx.report('standup', 'Daily standup', card.text, { ...(data as unknown as JsonObject), graph8_credits: f.graph8Credits ?? null, slack_ts: msg.ts });
  return card.text;
}
