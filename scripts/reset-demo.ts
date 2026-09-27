/**
 * reset-demo — create / clean / stage a workspace in Supabase. Dry run unless --yes.
 *
 *   tsx scripts/reset-demo.ts --workspace test --clean [--yes]   create TEST workspace if missing (5 agents cloned from the
 *                                                                demo personas) and wipe its work rows; prints its id
 *   tsx scripts/reset-demo.ts --workspace demo --clean [--yes]   wipe the fake seed of the demo workspace (keeps workspace
 *                                                                row + 5 agents, agents reset to idle)
 *   tsx scripts/reset-demo.ts --workspace <id|test|demo> --clean --settings [--yes]
 *                                                                also wipe workspaces.settings (graph8 ids: schedule, mailbox,
 *                                                                pipeline, event type, voice agent, intent keywords, AI research,
 *                                                                lists …), sales_brain, company_domain, allowlist graph8 ids and
 *                                                                the webhook row → workspace back to onboarding. Use when the
 *                                                                graph8 org changes (scripts/switch-org.ts calls this).
 *   tsx scripts/reset-demo.ts --workspace <id|test|demo> --stage [--yes]
 *                                                                keep leads/lead_contacts/settings; wipe tasks, runs, reports,
 *                                                                approvals, sequences, credit_events; workspace → onboarding
 * Run from repo root: pnpm -C server exec tsx ../scripts/reset-demo.ts …
 */
import { DEFAULT_WORKSPACE_SETTINGS, DEMO_WORKSPACE_ID } from '../shared/types';
import type { AgentRow, WorkspaceRow } from '../shared/types';
import { must, store } from '../server/src/lib/store';

const TEST_SLUG = 'test-workspace';
const db = store.db;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function count(table: string, ws: string): Promise<number> {
  const r = await db.from(table).select('*', { count: 'exact', head: true }).eq('workspace_id', ws);
  if (r.error) throw new Error(`${table}: ${r.error.message}`);
  return r.count ?? 0;
}

async function ensureTestWorkspace(yes: boolean): Promise<string | null> {
  const found = await db.from('workspaces').select('id').eq('slug', TEST_SLUG).maybeSingle();
  if (found.data) return found.data.id as string;
  const demo = must(await db.from('workspaces').select('*').eq('id', DEMO_WORKSPACE_ID).single(), 'demo workspace') as WorkspaceRow;
  const demoAgents = must(await db.from('agents').select('*').eq('workspace_id', DEMO_WORKSPACE_ID).order('sort_order'), 'demo agents') as AgentRow[];
  console.log(`Will CREATE workspace "Test workspace" (slug ${TEST_SLUG}, is_demo=false) + ${demoAgents.length} agents cloned from the demo seed.`);
  if (!yes) return null;
  const ws = must(await db.from('workspaces').insert({
    slug: TEST_SLUG, name: 'Test workspace', company_domain: demo.company_domain, timezone: demo.timezone, status: 'onboarding',
    founder_name: demo.founder_name, g8_org_id: demo.g8_org_id, g8_schedule_id: demo.g8_schedule_id,
    slack_team_id: demo.slack_team_id, slack_channel_team: demo.slack_channel_team, slack_channel_hq: demo.slack_channel_hq,
    standup_hour: demo.standup_hour, demo_time_scale: demo.demo_time_scale, is_demo: false,
    budget_daily_credits: demo.budget_daily_credits, sales_brain: {}, settings: {},
  }).select('id').single(), 'create test workspace') as { id: string };
  const head = demoAgents.find((a) => a.role === 'head_of_sales');
  const clone = (a: AgentRow, reportsTo: string | null) => ({
    workspace_id: ws.id, role: a.role, name: a.name, title: a.title, job: a.job, reports_to: reportsTo, emoji: a.emoji,
    color: a.color, avatar_url: a.avatar_url, sort_order: a.sort_order, status: 'idle', budget_daily_credits: a.budget_daily_credits,
    budget_warn_pct: a.budget_warn_pct, model: a.model, instructions: a.instructions, tools: a.tools,
  });
  let headId: string | null = null;
  if (head) headId = (must(await db.from('agents').insert(clone(head, null)).select('id').single(), 'clone head') as { id: string }).id;
  const rest = demoAgents.filter((a) => a !== head).map((a) => clone(a, headId));
  if (rest.length) must(await db.from('agents').insert(rest), 'clone agents');
  console.log(`Created test workspace ${ws.id}`);
  return ws.id;
}

/**
 * graph8-org-specific state lives in settings, sales_brain, allowlist graph8 contact ids and the webhook row; after an
 * org switch every one of those ids points at the OLD org (a stale allowlist contact id could even match a stranger).
 * Keeps: workspace row identity, Slack wiring, the 5 agents and their budgets, allowlist labels/emails/phones.
 */
export async function wipeOrgSettings(ws: string, opts: { g8OrgId?: string | null } = {}): Promise<void> {
  must(await db.from('workspaces').update({
    settings: DEFAULT_WORKSPACE_SETTINGS, sales_brain: {}, company_domain: null, status: 'onboarding', g8_schedule_id: null,
    ...(opts.g8OrgId !== undefined ? { g8_org_id: opts.g8OrgId } : {}),
  }).eq('id', ws), 'reset settings');
  must(await db.from('contact_allowlist').update({ g8_contact_id: null }).eq('workspace_id', ws), 'clear allowlist graph8 ids');
  must(await db.from('workspace_secrets').update({ g8_webhook_id: null, g8_webhook_secret: null, g8_api_key: null }).eq('workspace_id', ws), 'clear webhook row');
}

export async function wipeTables(ws: string, tables: string[]): Promise<void> {
  // agents.current_task_id / tasks.* FKs are all ON DELETE SET NULL, so order only matters for readability.
  await db.from('agents').update({ current_task_id: null }).eq('workspace_id', ws);
  for (const t of tables) must(await db.from(t).delete().eq('workspace_id', ws), `delete ${t}`);
  const today = new Date().toISOString().slice(0, 10);
  must(await db.from('agents').update({ status: 'idle', pause_reason: null, current_task_id: null, spent_today_credits: 0, spend_day: today })
    .eq('workspace_id', ws), 'reset agents');
}

export const CLEAN_TABLES = ['tasks', 'agent_runs', 'reports', 'approvals', 'sequences', 'leads', 'lead_events', 'credit_events'];
export { count };

async function main() {
  const which = arg('workspace');
  const clean = flag('clean');
  const stage = flag('stage');
  const settings = flag('settings');
  const yes = flag('yes');
  if (settings && !clean) { console.error('--settings only works with --clean'); process.exit(2); }
  if (!which || clean === stage) {
    console.error('usage: reset-demo --workspace test|demo|<uuid> (--clean | --stage) [--yes]');
    process.exit(2);
  }

  let ws: string | null;
  if (which === 'test') ws = await ensureTestWorkspace(yes);
  else if (which === 'demo') ws = DEMO_WORKSPACE_ID;
  else ws = which;
  if (!ws) { console.log('\nDry run. Re-run with --yes to create the test workspace, then again to clean it.'); return; }

  const row = must(await db.from('workspaces').select('id,name,is_demo').eq('id', ws).single(), `workspace ${ws}`) as Pick<WorkspaceRow, 'id' | 'name' | 'is_demo'>;
  const wipe = stage
    ? ['tasks', 'agent_runs', 'reports', 'approvals', 'sequences', 'credit_events']
    : which === 'demo'
      ? ['tasks', 'agent_runs', 'reports', 'approvals', 'sequences', 'leads', 'lead_events', 'credit_events', 'inbound_events', 'contact_allowlist']
      : [...CLEAN_TABLES, ...(settings ? ['inbound_events'] : [])];

  console.log(`Workspace: ${row.name} (${row.id})${row.is_demo ? ' [DEMO]' : ''}`);
  console.log(`Mode: ${stage ? 'stage (keep leads, lead_contacts, settings)' : 'clean'}`);
  console.log('Will delete:');
  for (const t of wipe) console.log(`  ${t.padEnd(18)} ${await count(t, ws)} rows`);
  if (!stage) console.log(`  ${'lead_contacts'.padEnd(18)} (cascade with leads)`);
  console.log('Will reset: agents → idle, spent 0, no current task' + (stage ? '; workspace status → onboarding' : '; workspace spent 0, task counter 0'));
  if (settings) console.log('Will reset: settings → defaults, sales_brain, company_domain, allowlist graph8 ids, webhook row; status → onboarding');

  if (!yes) { console.log('\nDry run. Re-run with --yes to do it.'); console.log(`WORKSPACE_ID=${ws}`); return; }

  await wipeTables(ws, wipe);
  if (settings) await wipeOrgSettings(ws);
  const today = new Date().toISOString().slice(0, 10);
  must(await db.from('workspaces').update(stage
    ? { status: 'onboarding', spent_today_credits: 0, spend_day: today }
    : { spent_today_credits: 0, spend_day: today, task_counter: 0 }).eq('id', ws), 'reset workspace');
  console.log('Done.');
  console.log(`WORKSPACE_ID=${ws}`);
}

// Importable (switch-org.ts) without running.
if (/reset-demo\.ts$/.test(process.argv[1] ?? '')) main().catch((err) => { console.error(String(err?.message ?? err)); process.exit(1); });
