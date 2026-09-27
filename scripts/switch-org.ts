/**
 * switch-org — point Graphi at a DIFFERENT graph8 account (a judge's / friend's org, possibly empty).
 *
 *   pnpm -C server exec tsx ../scripts/switch-org.ts --key-from-env NEW_G8_API_KEY --workspace demo [--yes] [--env-file <path>]
 *
 * 1. Verifies the new key (GET /usage + GET /org/settings) — the key is read from the named env var (put it in
 *    .env.local or export it); it is NEVER printed.
 * 2. Readiness report for the new org: credits, mailbox, calendar, LinkedIn, AI-calling number, pipelines, event types,
 *    sending schedules, company docs — with the graph8 page to fix each gap.
 * 3. With --yes: wipes the workspace's work rows AND its settings (every graph8 id belongs to the old org), keeps the 5
 *    agents + budgets, re-seeds the allowlist from TEST_ALLOWLIST, then edits .env.local: G8_API_KEY = new key (backup
 *    .env.local.bak) and comments out the old org's G8_DEMO_SCHEDULE_ID / G8_WEBHOOK_SECRET.
 *    Without --yes it is a dry run (read-only on both graph8 and Supabase).
 * Then restart the server and run /hire-sales <site>; Ayesha discovers or creates schedule, pipeline, meeting type.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_WORKSPACE_ID } from '../shared/types';
import { env, REPO_ROOT } from '../server/src/lib/env';
import { createG8, unwrap } from '../server/src/lib/g8';
import { must, store } from '../server/src/lib/store';
import { isAlwaysOn, rootDomain } from '../server/src/agents/ayesha/org';
import { CLEAN_TABLES, count, wipeOrgSettings, wipeTables } from './reset-demo';
import { editEnvText } from './lib/envfile';

const APP = 'https://app.graph8.com';
export const LINKS = {
  mailbox: `${APP}/studio/settings?tab=mailboxes&category=personal`,
  connectors: `${APP}/profile?tab=connectors`,
  appointments: `${APP}/appointments?tab=bookings`,
  company: `${APP}/studio/settings?tab=company`,
  global: `${APP}/studio?mode=global`,
  deals: `${APP}/deals/pipeline`,
  sequencer: `${APP}/sequencer`,
};
const WIPE = [...CLEAN_TABLES, 'inbound_events', 'contact_allowlist'];

const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : undefined; };
const flag = (n: string) => argv.includes(`--${n}`);

async function resolveWorkspace(w: string): Promise<string> {
  if (w === 'demo') return DEMO_WORKSPACE_ID;
  if (w === 'test') {
    const r = await store.db.from('workspaces').select('id').eq('slug', 'test-workspace').maybeSingle();
    if (!r.data) throw new Error('test workspace missing');
    return r.data.id as string;
  }
  return w;
}

type Line = { ok: boolean | null; label: string; detail: string; fix?: string };

async function main() {
  const keyVar = arg('key-from-env');
  const which = arg('workspace');
  const yes = flag('yes');
  const envFile = resolve(arg('env-file') ?? resolve(REPO_ROOT, '.env.local'));
  if (!keyVar || !which) { console.error('usage: switch-org --key-from-env NEW_G8_API_KEY --workspace demo|test|<uuid> [--yes] [--env-file path]'); process.exit(2); }
  const key = (process.env[keyVar] ?? '').trim();
  if (!key) throw new Error(`env var ${keyVar} is empty — put ${keyVar}=<key> in .env.local or export it (never paste keys in chat)`);
  if (key === env.G8_API_KEY) console.log(`note: ${keyVar} is the SAME key as the current G8_API_KEY (re-running on the current org).`);

  // ---- 1. verify key -------------------------------------------------------------------------------------------
  const g = createG8({ env: { G8_API_KEY: key, G8_BASE_URL: env.G8_BASE_URL, allowlist: [] }, timeoutMs: 20_000 });
  const get = async (p: string, q?: Record<string, unknown>) => unwrap<any>(await g.get(p, q));
  let usage: any; let org: any;
  try { [usage, org] = await Promise.all([get('/usage'), get('/org/settings')]); }
  catch (e: any) { throw new Error(`new key rejected by graph8: ${String(e?.message ?? e).slice(0, 160)}`); }
  let oldOrg: string | null = null;
  try { oldOrg = String(unwrap<any>(await createG8({ env, timeoutMs: 10_000 }).get('/org/settings'))?.org_name ?? '') || null; } catch { /* old key may be dead */ }
  const credits = Number(usage?.available_credits ?? usage?.credits ?? 0);
  console.log(`graph8 key OK → org "${org?.org_name ?? '?'}" (${org?.org_id ?? '?'})${oldOrg ? `   [current: "${oldOrg}"]` : ''}`);

  // ---- 2. readiness report --------------------------------------------------------------------------------------
  const safe = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };
  const [mailboxes, cals, liConn, liSenders, aiNums, phones, pipes, evTypes, schedules, docs, site] = await Promise.all([
    safe(get('/mailboxes')), safe(g.get('/appointments/calendars')), safe(get('/linkedin/connection')),
    safe(g.get('/workflows/integrations/linkedin/senders')), safe(get('/voice/agent-phone-numbers')),
    safe(get('/teams/available/phone-numbers')), safe(get('/deals/pipelines')), safe(get('/event-types')),
    safe(get('/schedules')), safe(get('/global-context/documents')), safe(get('/intelligence/primary-website')),
  ]);
  const arr = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.items) ? x.items : Array.isArray(x?.data) ? x.data : []);
  const activeBoxes = arr(mailboxes).filter((b) => b.connection_status === 'active' && !b.is_archived);
  const validCals = arr(unwrap(cals)).filter((c) => c?.is_valid !== false && !c?.invalid);
  const senders = Number((liSenders as any)?.total_count ?? (liSenders as any)?.senders?.length ?? 0);
  const aiCount = arr(aiNums?.available_numbers).length + arr(aiNums?.booked_numbers).length;
  const phoneCount = arr(phones?.items ?? phones?.numbers ?? phones).length;
  const pipeList = arr(pipes);
  const hasMeetingStage = pipeList.some((p) => arr(p.stages).some((s) => /new meeting/i.test(String(s.name))));
  const evList = arr(evTypes);
  const schList = arr(schedules).filter((s) => !s.is_archived);
  const docList = arr(docs).filter((d) => d.status === 'completed');
  const website = site?.primary_website_url ? rootDomain(String(site.primary_website_url)) : null;

  const report: Line[] = [
    { ok: credits >= 1000 ? true : credits > 0 ? null : false, label: 'Credits', detail: `${Math.round(credits).toLocaleString('en-US')} available`, fix: credits < 1000 ? 'top up in graph8 (Settings → Billing); a full run uses ~100–300' : undefined },
    { ok: activeBoxes.length > 0, label: 'Mailbox', detail: activeBoxes.length ? `${activeBoxes.length} active (daily limit ${activeBoxes[0].daily_limit ?? '?'})` : 'none connected — emails CANNOT send', fix: activeBoxes.length ? undefined : `connect Gmail/Outlook: ${LINKS.mailbox}` },
    { ok: validCals.length > 0, label: 'Calendar', detail: validCals.length ? `${validCals.length} connected` : 'none — no booking link; Zara offers plain-text times', fix: validCals.length ? undefined : `connect Google Calendar: ${LINKS.connectors} (then ${LINKS.appointments})` },
    { ok: Boolean(liConn?.connected) && senders > 0, label: 'LinkedIn', detail: liConn?.connected ? `${senders} sender(s)` : 'not connected — LinkedIn steps stay ⏸', fix: liConn?.connected && senders ? undefined : `optional: ${LINKS.connectors}` },
    { ok: aiCount > 0 ? true : null, label: 'AI-calling number', detail: aiCount ? `${aiCount} number(s)` : `none (${phoneCount} dialer number(s)) — voice step stays ⏸`, fix: aiCount ? undefined : 'optional: ask graph8 staff to provision a Voice AI number' },
    { ok: true, label: 'Deal pipeline', detail: pipeList.length ? `${pipeList.map((p) => p.name).join(', ')}${hasMeetingStage ? ' (has New Meeting)' : ' (Ayesha adds "New Meeting")'}` : 'none — Ayesha creates "Sales Pipeline" at /hire-sales' },
    { ok: true, label: 'Event types', detail: evList.length ? evList.map((e) => `${e.title} (${e.length ?? '?'} min)`).join(', ') : validCals.length ? 'none — Ayesha creates 30-min "Discovery call"' : 'none — created once a calendar is connected' },
    { ok: true, label: 'Sending schedule', detail: schList.some(isAlwaysOn) ? `24/7 exists (${schList.find(isAlwaysOn).name})` : 'no 24/7 — Ayesha creates "Graphi 24/7"' },
    { ok: true, label: 'Company docs', detail: docList.length ? `${docList.length} docs${website ? ` about ${website}` : ''} (used only when /hire-sales is that domain)` : 'none — Ayesha reads the website + starts a graph8 study' },
  ];
  console.log('\nReadiness');
  for (const r of report) console.log(`  ${r.ok === true ? '✅' : r.ok === null ? '⚠️ ' : '❌'} ${r.label.padEnd(18)} ${r.detail}${r.fix ? `\n       → ${r.fix}` : ''}`);

  // ---- 3. workspace wipe plan ------------------------------------------------------------------------------------
  const ws = await resolveWorkspace(which);
  const row = must(await store.db.from('workspaces').select('id,name,is_demo,g8_org_id').eq('id', ws).single(), `workspace ${ws}`) as { id: string; name: string; is_demo: boolean; g8_org_id: string | null };
  console.log(`\nWorkspace: ${row.name} (${row.id})${row.is_demo ? ' [DEMO]' : ''}`);
  console.log('Will delete:');
  for (const t of WIPE) console.log(`  ${t.padEnd(18)} ${await count(t, ws)} rows`);
  console.log('Will reset: settings (all graph8 ids), sales_brain, company_domain, webhook row, status → onboarding; agents → idle');
  console.log(`Will keep:  5 agents + budgets, Slack channels; re-seed ${env.allowlist.length} allowlisted test contact(s) from TEST_ALLOWLIST`);
  console.log(`Will edit:  ${envFile}: G8_API_KEY ← ${keyVar} (backup .bak); comment out G8_DEMO_SCHEDULE_ID, G8_WEBHOOK_SECRET`);

  if (!yes) { console.log('\nDry run. Re-run with --yes to switch.'); return; }

  // ---- 4. do it -------------------------------------------------------------------------------------------------
  await wipeTables(ws, WIPE);
  await wipeOrgSettings(ws, { g8OrgId: org?.org_id ? String(org.org_id) : null });
  for (const e of env.allowlist) {
    must(await store.db.from('contact_allowlist').insert({ workspace_id: ws, label: e.name, email: e.email ?? null, phone: e.phone ?? null, linkedin_url: e.linkedin ?? null }), `allowlist ${e.name}`);
  }
  console.log(`Workspace wiped; ${env.allowlist.length} allowlisted contact(s) re-seeded.`);

  if (!existsSync(envFile)) throw new Error(`${envFile} not found`);
  copyFileSync(envFile, `${envFile}.bak`);
  writeFileSync(envFile, editEnvText(readFileSync(envFile, 'utf8'), { G8_API_KEY: key }, ['G8_DEMO_SCHEDULE_ID', 'G8_WEBHOOK_SECRET']));
  console.log(`${envFile} updated (backup at .bak). Key not printed.`);
  console.log('\nNext: update G8_API_KEY on Render too (and delete G8_DEMO_SCHEDULE_ID / G8_WEBHOOK_SECRET there), restart the server,');
  console.log('run scripts/register-webhook.ts, then /hire-sales <website> in Slack. See docs/NEW-ORG.md.');
}

if (/switch-org\.ts$/.test(process.argv[1] ?? '')) main().catch((e) => { console.error(`switch-org failed: ${String(e?.message ?? e)}`); process.exit(1); });
