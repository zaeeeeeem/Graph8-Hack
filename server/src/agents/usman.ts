/**
 * Usman — SDR (docs/agents/04-usman.md). Layer 0 + L1 multi-step email + L8 AI template (behind settings flag).
 *
 * build_sequence: packs → Gemini copy (3 emails) → layers' stepPlan (📞 / ⏸) → POST /sequences → Launch card (#sales-hq).
 * onApproval: approved → enroll TEST leads only (g8.enrollGuarded + DB check) · edit → revise + PATCH + re-ask · rejected → cancel.
 * onEvent: sends / bounces / calls → lead_events + live checklist. Pollers: inbound/send-poll.ts, scheduler.ts.
 */
import { g8 } from '../lib/g8';
import { slack } from '../lib/slack';
import { voiceLine } from '../lib/voice';
import { store } from '../lib/store';
import type { AgentBrain, Checklist, ChecklistItem, RunCtx } from '../contracts';
import type { ApprovalRow, Channel, JsonObject, LeadRow, SequenceRow, UUID, WorkspaceSettings } from '../../../shared/types';
import { launchCardBlocks, launchCardText, type LaunchCardInput } from '../slack/cards/launch';
import { previewLead, reviseSequenceCopy, SequenceCopy, writeSequenceCopy } from './usman/copy';
import { archiveSequence, createSequence, patchEmailSteps, resolveMailbox, runSequence, scheduleId, setLeadContext } from './usman/g8ops';
import { buildPlan, collectLayerSteps, emailStepData, firstLine, toG8Steps, toSummary, type PlanStep } from './usman/plan';
import { findLeadByContact, findSequenceByG8, mapG8Event, recordTouch, setTracker, getTracker, statsLine } from './usman/track';
import { aiTemplateEnabled, errMsg, firstName, safe, scrub, secondsPerDay } from './usman/util';
import { directSendOn, firstTouchSender, renderFirstName, setFirstTouchSender } from './usman/first-touch';
import { makeComposeSender } from './usman/compose';
export { setFirstTouchSender, type FirstTouchSender, type FirstTouchInput } from './usman/first-touch';
import { registerFire, registerScheduler } from '../scheduler';
import { startSendPoll } from '../inbound/send-poll';

export const G8_SEQUENCER_URL = 'https://app.graph8.com/sequencer';
/** Verified record URL pattern (docs/verify/core.md). */
export const g8SequenceUrl = (id: string) => `https://app.graph8.com/sequencer/sequence/${id}`;

/** Payload stored on the launch_sequence approval (no PII). */
export interface LaunchPayload extends JsonObject {
  g8_sequence_id: string;
  lead_count: number;
  enroll_count: number;
  channels: Channel[];
  first_send: string;
  sequence_row_id: UUID;
  sequence_name: string;
  lead_ids: UUID[];
  test_lead_ids: UUID[];
  sec_per_day: number;
  ai_template: boolean;
  revision: number;
  copy: JsonObject;
}

const STOP_STAGES = new Set(['replied', 'meeting', 'deal', 'won', 'lost', 'disqualified']);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function openChecklist(ctx: RunCtx, title: string, items: ChecklistItem[]): Promise<Checklist | undefined> {
  return safe(async () => {
    const th = await ctx.thread();
    if (!th.channel || !th.ts) return undefined; // Slack not attached (SLACK_DISABLED) — DB/portal only
    return slack.checklist('sdr', th.channel, title, items, th.ts);
  }, (e) => ctx.log.warn('checklist unavailable', { err: errMsg(e) }));
}
/** One line in this run's #sales-team thread; no-op when Slack is not attached. */
async function postThread(ctx: RunCtx, text: string) {
  await safe(async () => {
    const th = await ctx.thread();
    if (!th.channel || !th.ts) return;
    await slack.postAs('sdr', th.channel, { text: scrub(text), threadTs: th.ts });
  });
}
/** Conversational status line reworded in Usman's voice; falls back to the template (never throws). */
function say(ctx: RunCtx, template: string): Promise<string> {
  return voiceLine('sdr', template, { workspaceId: ctx.workspaceId, agentId: ctx.agentId, taskId: ctx.task.id }).catch(() => template);
}
function mark(c: Checklist | undefined, key: string, state: ChecklistItem['state'], note?: string) {
  return safe(() => c?.set(key, state, note ? scrub(note) : undefined));
}

export async function loadLeads(workspaceId: UUID, input: JsonObject, settings: WorkspaceSettings): Promise<LeadRow[]> {
  const db = store.db;
  let base: LeadRow[] = [];
  const ids = Array.isArray(input.lead_ids) ? (input.lead_ids as string[]) : [];
  if (ids.length) {
    base = ((await db.from('leads').select('*').eq('workspace_id', workspaceId).in('id', ids)).data ?? []) as LeadRow[];
  } else {
    let q = db.from('leads').select('*').eq('workspace_id', workspaceId).eq('stage', 'researched').is('sequence_id', null);
    if (input.list_id != null) q = q.eq('g8_list_id', String(input.list_id));
    base = ((await q.order('fit_score', { ascending: false }).limit(Number(settings.daily_research ?? 5) + 5)).data ?? []) as LeadRow[];
  }
  // U5: test leads always ride along (they are the only ones ever enrolled).
  const tests = ((await db.from('leads').select('*').eq('workspace_id', workspaceId).eq('is_test_contact', true)
    .eq('do_not_contact', false).in('stage', ['prospect', 'researched', 'queued'])).data ?? []) as LeadRow[];
  const seen = new Set(base.map((l) => l.id));
  const all = [...base, ...tests.filter((t) => !seen.has(t.id) && t.sequence_state !== 'enrolled')];
  return all.filter((l) => !l.do_not_contact && !STOP_STAGES.has(l.stage));
}

function channelsOf(plan: PlanStep[]): Channel[] {
  return [...new Set(plan.filter((s) => s.mode !== 'planned').map((s) => s.channel))];
}

function cardInput(p: LaunchPayload, plan: LaunchCardInput['steps'],
  leads: LeadRow[], copy: SequenceCopy, warnings: string[]): LaunchCardInput {
  const top = previewLead(leads);
  const tests = leads.filter((l) => p.test_lead_ids.includes(l.id));
  return {
    sequenceName: p.sequence_name,
    steps: plan,
    preview: top ? { leadName: top.full_name, company: top.company_name, subject: copy.preview.subject, body: copy.preview.body } : undefined,
    testNames: tests.map((l) => l.full_name),
    prospectCount: leads.length - tests.length,
    secPerDay: p.sec_per_day,
    g8Url: g8SequenceUrl(p.g8_sequence_id),
    revision: p.revision || undefined,
    warnings,
  };
}

async function senderName(workspaceId: UUID): Promise<{ name: string; ws: any }> {
  const ws = await store.workspace(workspaceId);
  return { name: ws.founder_name || ws.name || 'The team', ws };
}

// ---------------------------------------------------------------------------
// build_sequence
// ---------------------------------------------------------------------------
async function buildSequence(ctx: RunCtx): Promise<string> {
  const { workspaceId, settings } = ctx;
  const llmOpts = { agentId: ctx.agentId, workspaceId, taskId: ctx.task.id };
  const c = await openChecklist(ctx, 'Usman · building the outreach sequence', [
    { key: 'leads', label: 'Reading research packs', state: 'doing' },
    { key: 'copy', label: 'Writing step briefs + emails', state: 'todo' },
    { key: 'layers', label: 'Checking extra channels', state: 'todo' },
    { key: 'build', label: 'Building the sequence in graph8', state: 'todo' },
    { key: 'card', label: 'Launch card to the founder', state: 'todo' },
    { key: 'track', label: 'Sends after launch', state: 'todo' },
  ]);

  const leads = await loadLeads(workspaceId, ctx.task.input ?? {}, settings);
  if (!leads.length) {
    await mark(c, 'leads', 'fail', 'no researched leads');
    throw new Error('No researched leads to build a sequence for');
  }
  const tests = leads.filter((l) => l.is_test_contact && l.g8_contact_id);
  await mark(c, 'leads', 'done', `${leads.length} leads · ${tests.length} test`);
  await ctx.step('note', 'load_leads', `${leads.length} leads (${tests.length} test)`);

  // U-T2 + U-T4, with layer step plans (LinkedIn drafts, voice) running in parallel — never break L0.
  await mark(c, 'copy', 'doing');
  await mark(c, 'layers', 'doing');
  const layersP = collectLayerSteps(ctx, leads);
  const { name: sender, ws } = await senderName(workspaceId);
  const copy = await writeSequenceCopy(leads, ws.sales_brain ?? {}, sender, llmOpts);
  await mark(c, 'copy', 'done', copy.tone || '3 emails');
  await ctx.step('llm', 'write_step_briefs', `3 email templates + preview (${copy.tone.slice(0, 60)})`);

  const { planned, warnings } = await layersP;
  const plan = buildPlan(copy, planned);
  for (const w of warnings) await safe(() => c?.add({ key: `warn_${w.slice(0, 20)}`, label: w, state: 'warn' }));
  const extra = plan.filter((s) => s.channel !== 'email');
  await mark(c, 'layers', warnings.length ? 'warn' : 'done', extra.length ? extra.map((s) => `${s.channel} D${s.day}${s.mode === 'planned' ? ' ⏸' : ''}`).join(', ') : 'email only');

  // L8 (flagged)
  const aiTemplate = aiTemplateEnabled(settings);
  if (aiTemplate) {
    await safe(async () => {
      const n = await setLeadContext(leads);
      await ctx.step('tool', 'set_lead_context', `sales_hook on ${n} contacts`);
    }, (e) => warnings.push(`sales_hook not saved: ${errMsg(e)}`));
  }

  // U-T3
  await mark(c, 'build', 'doing');
  const scale = settings.demo_time_scale ?? ws.demo_time_scale;
  const secPerDay = secondsPerDay(scale);
  const mailbox = await resolveMailbox(settings);
  // No ISO date: digit runs like 2026-09-27 get redacted as a phone number by the PII scrubbers.
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const name = `Graphi outreach ${day}${ctx.task.number ? ` · T-${ctx.task.number}` : ''}`;
  const g8Steps = toG8Steps(plan, copy, secPerDay, aiTemplate);
  const created = await createSequence({ name, mailbox, steps: g8Steps, scheduleId: scheduleId(settings) });
  warnings.push(...created.warnings);
  await ctx.step('tool', 'build_sequence', `graph8 sequence ${created.id} · ${g8Steps.length} steps`, { g8_sequence_id: created.id });

  const listId = (ctx.task.input?.list_id ?? settings.last_run_list_id ?? leads.find((l) => l.g8_list_id)?.g8_list_id ?? null);
  const { data: seqRows, error } = await store.db.from('sequences').insert({
    workspace_id: workspaceId, created_by_agent_id: ctx.agentId, task_id: ctx.task.id,
    g8_sequence_id: created.id, g8_list_id: listId != null ? String(listId) : null, g8_schedule_id: scheduleId(settings) ?? null,
    name, status: 'pending_approval', channels: channelsOf(plan), steps: toSummary(plan),
    lead_count: leads.length, enrolled_count: 0, stats: { sec_per_day: secPerDay },
  }).select('*');
  if (error || !seqRows?.[0]) throw new Error(`sequences insert failed: ${error?.message ?? 'no row'}`);
  const seq = seqRows[0] as SequenceRow;
  await store.db.from('leads').update({ sequence_id: seq.id }).in('id', leads.map((l) => l.id));
  for (const s of plan) if (s.mode === 'fire' && s.fire) registerFire(seq.id, s.n, s.fire);
  setTracker(seq.id, c);
  await mark(c, 'build', 'done', `${g8Steps.length} steps in graph8`);

  // U-T5
  const payload: LaunchPayload = {
    g8_sequence_id: created.id, lead_count: leads.length, enroll_count: tests.length, channels: channelsOf(plan),
    first_send: 'on launch', sequence_row_id: seq.id, sequence_name: name,
    lead_ids: leads.map((l) => l.id), test_lead_ids: tests.map((l) => l.id), sec_per_day: secPerDay,
    ai_template: aiTemplate, revision: 0, copy: copy as unknown as JsonObject,
  };
  await requestLaunch(ctx, payload, plan, leads, copy, warnings, c);
  return `Sequence ready (${plan.length} steps, ${tests.length} test lead(s) to enroll, ${leads.length - tests.length} preview only) — waiting for Launch`;
}

async function requestLaunch(ctx: RunCtx, payload: LaunchPayload, plan: LaunchCardInput['steps'], leads: LeadRow[],
  copy: SequenceCopy, warnings: string[], c?: Checklist): Promise<ApprovalRow> {
  await mark(c, 'card', 'doing');
  const input = cardInput(payload, plan.map((s: any) => ({ ...s, emailIdx: s.emailIdx ?? s.email_idx })), leads, copy, warnings);
  const title = `Launch ${payload.sequence_name}: ${payload.enroll_count} test lead(s), ${payload.lead_count - payload.enroll_count} preview only`;
  const approval = await ctx.requestApproval('launch_sequence', scrub(title), payload, launchCardBlocks(input), 'Launch');
  await store.db.from('sequences').update({ approval_id: approval.id, status: 'pending_approval' }).eq('id', payload.sequence_row_id);
  await mark(c, 'card', 'paused', 'waiting on founder in #sales-hq');
  await safe(() => ctx.report('update', 'Sequence ready for launch', scrub(launchCardText(input))));
  return approval;
}

// ---------------------------------------------------------------------------
// decisions
// ---------------------------------------------------------------------------
async function loadSeq(approval: ApprovalRow, p: LaunchPayload): Promise<SequenceRow> {
  const id = approval.sequence_id ?? p.sequence_row_id;
  const { data } = await store.db.from('sequences').select('*').eq('id', id).limit(1);
  if (!data?.[0]) throw new Error('sequence row not found');
  return data[0] as SequenceRow;
}

async function leadsByIds(workspaceId: UUID, ids: UUID[]): Promise<LeadRow[]> {
  if (!ids.length) return [];
  return ((await store.db.from('leads').select('*').eq('workspace_id', workspaceId).in('id', ids)).data ?? []) as LeadRow[];
}

/** U-T6: enroll TEST leads only. DB flag + allowlist check here, and g8.enrollGuarded enforces it again. */
async function launch(ctx: RunCtx, approval: ApprovalRow, p: LaunchPayload): Promise<void> {
  const seq = await loadSeq(approval, p);
  const c = getTracker(seq.id);
  const leads = await leadsByIds(ctx.workspaceId, p.lead_ids);
  const candidates = leads.filter((l) => l.is_test_contact && !l.do_not_contact && l.g8_contact_id && !STOP_STAGES.has(l.stage));
  const tests: LeadRow[] = [];
  for (const l of candidates) {
    if (await safe(() => g8.isAllowlisted({ g8ContactId: l.g8_contact_id }))) tests.push(l);
    else await safe(() => ctx.report('alert', 'Test lead not on allowlist — skipped', `${scrub(l.full_name)} is marked TEST but did not match the allowlist.`));
  }

  const byList = new Map<string, LeadRow[]>();
  for (const l of tests) {
    const list = l.g8_list_id ?? seq.g8_list_id ?? (ctx.settings.last_run_list_id != null ? String(ctx.settings.last_run_list_id) : null);
    if (!list) { await safe(() => ctx.report('alert', 'No graph8 list for a test lead', `${scrub(l.full_name)} has no list id — not enrolled.`)); continue; }
    byList.set(list, [...(byList.get(list) ?? []), l]);
  }

  let enrolled = 0;
  const enrolledLeads: LeadRow[] = [];
  const problems: string[] = [];
  for (const [list, group] of byList) {
    try {
      const r = await g8.enrollGuarded(p.g8_sequence_id, group.map((l) => l.g8_contact_id!), list);
      const affected = Number((r?.data ?? r)?.contacts_affected ?? group.length);
      enrolled += affected;
      enrolledLeads.push(...group);
      await ctx.step('tool', 'launch_sequence', `enrolled ${affected} test contact(s)`, { g8_sequence_id: p.g8_sequence_id });
    } catch (e) {
      problems.push(errMsg(e));
    }
  }
  if (enrolledLeads.length) {
    const how = await safe(() => runSequence(p.g8_sequence_id), (e) => problems.push(`sequence not started: ${errMsg(e)}`));
    if (how) await ctx.step('tool', 'start_sequence', `graph8 sequence started via ${how}`);
  }
  // sendfix: graph8 does not dispatch here, so email 1 goes out directly (guarded compose) to every verified TEST lead.
  // Those leads are "active" even if the graph8 enroll failed; scheduler.ts sends D3/D9 as thread replies.
  const direct = directSendOn(ctx.settings);
  if (direct) {
    const sent = await directFirstTouch(ctx, p, seq, tests, problems);
    for (const l of sent) if (!enrolledLeads.includes(l)) enrolledLeads.push(l);
  }

  const now = new Date().toISOString();
  await store.db.from('sequences').update({
    status: enrolledLeads.length ? 'live' : 'draft', launched_at: enrolledLeads.length ? now : null, enrolled_count: enrolled,
  }).eq('id', seq.id);
  const enrolledIds = new Set(enrolledLeads.map((l) => l.id));
  if (enrolledIds.size) {
    await store.db.from('leads').update({ stage: 'contacted', sequence_state: 'enrolled', stage_changed_at: now }).in('id', [...enrolledIds]);
  }
  const previewOnly = leads.filter((l) => !enrolledIds.has(l.id) && !l.is_test_contact);
  if (previewOnly.length) {
    await store.db.from('leads').update({ stage: 'queued', sequence_state: 'queued', stage_changed_at: now }).in('id', previewOnly.map((l) => l.id));
  }
  for (const l of enrolledLeads) {
    await store.db.from('lead_events').insert({
      workspace_id: ctx.workspaceId, lead_id: l.id, agent_id: ctx.agentId, task_id: seq.task_id, type: 'enrolled',
      channel: 'system', direction: 'internal', summary: scrub(`${l.full_name} (TEST) enrolled in ${seq.name}`),
      data: { g8_sequence_id: p.g8_sequence_id },
    });
  }

  if (problems.length && !enrolledLeads.length) {
    await mark(c, 'card', 'fail', `launch failed: ${problems[0]}`);
    await safe(() => ctx.report('alert', 'Launch failed', `Could not enroll test leads: ${problems.join('; ')}`));
    return;
  }
  await mark(c, 'card', 'done', `launched · ${enrolled} test enrolled · ${previewOnly.length} preview only`);
  await mark(c, 'track', 'doing', statsLine({}));
  // Thread line in Usman's voice (Gemini, 3 s cap) written while the report posts — no added latency.
  const said = c ? undefined : say(ctx, `🚀 Launched — ${enrolled} test lead(s) enrolled, ${previewOnly.length} prospect(s) preview only. I'll post sends here.`);
  await safe(() => ctx.report('update', 'Sequence launched',
    `${enrolled} test lead(s) enrolled in ${seq.name}; ${previewOnly.length} real prospect(s) preview only.${problems.length ? ` ⚠️ ${problems.join('; ')}` : ''}`));
  if (said) await postThread(ctx, await said);
  startSendPoll();
}

/** V3 fallback seam (see usman/first-touch.ts): email 1 sent directly when a guarded sender is registered. */
async function directFirstTouch(ctx: RunCtx, p: LaunchPayload, seq: SequenceRow, leads: LeadRow[], problems: string[]): Promise<LeadRow[]> {
  const sentLeads: LeadRow[] = [];
  const send = firstTouchSender();
  if (!send || ctx.settings.usman_direct_first_touch === false) return sentLeads;
  const copy = SequenceCopy.parse(p.copy);
  const email = copy.emails[0];
  const mailbox = await safe(() => resolveMailbox(ctx.settings));
  for (const lead of leads) {
    // Belt and braces: the registered sender must guard too, but never hand it a non-test lead.
    if (!lead.is_test_contact || !lead.g8_contact_id) continue;
    const fn = firstName(lead.full_name);
    try {
      const r = await send({
        workspaceId: ctx.workspaceId, lead, g8ContactId: lead.g8_contact_id, g8SequenceId: p.g8_sequence_id,
        subject: renderFirstName(email.subject, fn), body: renderFirstName(email.body, fn), mailbox,
      });
      if (!r.ok) { problems.push(`direct first touch failed${r.note ? `: ${scrub(r.note)}` : ''}`); continue; }
      sentLeads.push(lead);
      await recordTouch({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, kind: 'email_sent', lead, seq, stepOrder: 1, source: 'direct', extra: { ref: r.ref ?? null, direct_ref: r.ref ?? null } });
      await ctx.step('tool', 'direct_first_touch', `email 1 sent directly to ${scrub(lead.full_name)} (TEST)`);
    } catch (e) {
      problems.push(`direct first touch failed: ${errMsg(e)}`);
    }
  }
  return sentLeads;
}

async function revise(ctx: RunCtx, approval: ApprovalRow, p: LaunchPayload, note: string): Promise<void> {
  const seq = await loadSeq(approval, p);
  const c = getTracker(seq.id);
  await mark(c, 'card', 'doing', 'revising from your note');
  const leads = await leadsByIds(ctx.workspaceId, p.lead_ids);
  const { name: sender, ws } = await senderName(ctx.workspaceId);
  const current = SequenceCopy.parse(p.copy);
  const copy = await reviseSequenceCopy(current, note, leads, ws.sales_brain ?? {}, sender,
    { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id });
  await ctx.step('llm', 'revise_step_briefs', 'revised 3 emails from founder note');

  const patched = await patchEmailSteps(p.g8_sequence_id, copy.emails.map((e) => emailStepData(e, p.ai_template)),
    p.ai_template ? 'AI_GENERATED_TEMPLATE' : 'MANUAL_TEMPLATE');
  await ctx.step('tool', 'patch_steps', `patched ${patched} email step(s)`);

  const steps = (seq.steps ?? []).map((s: any) => s.email_idx !== undefined && copy.emails[s.email_idx]
    ? { ...s, subject: copy.emails[s.email_idx].subject, preview: firstLine(copy.emails[s.email_idx].body) }
    : s);
  await store.db.from('sequences').update({ steps }).eq('id', seq.id);
  const next: LaunchPayload = { ...p, revision: (p.revision ?? 0) + 1, copy: copy as unknown as JsonObject };
  await requestLaunch(ctx, next, steps as any, leads, copy, [], c);
}

async function cancel(ctx: RunCtx, approval: ApprovalRow, p: LaunchPayload): Promise<void> {
  const seq = await loadSeq(approval, p);
  await store.db.from('sequences').update({ status: 'cancelled' }).eq('id', seq.id);
  // U13: leads stay `researched`; just detach them from this run.
  await store.db.from('leads').update({ sequence_id: null }).eq('sequence_id', seq.id);
  await safe(() => archiveSequence(p.g8_sequence_id));
  await safe(() => store.db.from('tasks').update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('id', ctx.task.id).in('status', ['todo', 'in_progress', 'blocked']));
  await mark(getTracker(seq.id), 'card', 'fail', 'skipped by founder — nothing sent');
  await safe(() => ctx.report('update', 'Outreach skipped', `${seq.name} cancelled; leads stay researched.`));
}

// ---------------------------------------------------------------------------
// brain
// ---------------------------------------------------------------------------
export const usman: AgentBrain = {
  role: 'sdr',

  async run(ctx) {
    if (ctx.task.kind === 'launch_sequence') {
      // Usman already asks for Launch at the end of build_sequence; never build a second sequence for the same run.
      const { data } = await store.db.from('sequences').select('id, name').eq('workspace_id', ctx.workspaceId)
        .eq('status', 'pending_approval').limit(1);
      if (data?.[0]) return `Launch card for ${data[0].name} is already waiting in #sales-hq`;
    }
    if (ctx.task.kind === 'build_sequence' || ctx.task.kind === 'launch_sequence') return buildSequence(ctx);
    ctx.log.warn('usman: unsupported task kind', { kind: ctx.task.kind });
    return `Usman does not handle ${ctx.task.kind}`;
  },

  async onApproval(ctx, approval, decision, note) {
    if (approval.kind !== 'launch_sequence') return;
    const p = approval.payload as LaunchPayload;
    if (decision === 'approved') return launch(ctx, approval, p);
    if (decision === 'rejected') return cancel(ctx, approval, p);
    const text = (note ?? approval.decision_note ?? '').trim();
    if (!text) {
      await postThread(ctx, await say(ctx, 'What should I change? Reply in this thread and I will revise the sequence.'));
      return;
    }
    try { await revise(ctx, approval, p, text); }
    catch (e) {
      await safe(() => ctx.report('alert', 'Could not revise the sequence', `Edit failed: ${errMsg(e)}. Tell me in the thread and I will retry.`));
      throw e;
    }
  },

  async onEvent(ctx, type, payload) {
    const kind = mapG8Event(type);
    if (!kind) return;
    const data = ((payload as any)?.data ?? payload) as JsonObject;
    if (data.contact_id == null) return;
    const lead = await findLeadByContact(ctx.workspaceId, data.contact_id as string);
    if (!lead) return;
    let seq: SequenceRow | undefined;
    if (data.sequence_id != null) seq = await findSequenceByG8(ctx.workspaceId, data.sequence_id as string);
    if (!seq && lead.sequence_id) seq = ((await store.db.from('sequences').select('*').eq('id', lead.sequence_id).limit(1)).data ?? [])[0];
    const stepOrder = Number(data.step_order ?? data.step_number ?? data.step ?? 0) || await inferStepOrder(lead, seq, kind);
    await recordTouch({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, kind, lead, seq, stepOrder, source: 'webhook', extra: { g8_event: type } });
  },
};

/** Webhook without a step number: the first graph8 step of that channel not yet recorded for this lead. */
async function inferStepOrder(lead: LeadRow, seq: SequenceRow | undefined, kind: string): Promise<number | undefined> {
  if (!seq) return undefined;
  const channel = kind.startsWith('email') ? 'email' : kind.startsWith('call') || kind === 'voicemail_left' ? 'phone' : kind.startsWith('linkedin') ? 'linkedin' : 'sms';
  if (kind === 'email_bounced') return undefined;
  const g8Steps = (seq.steps ?? []).filter((s: any) => s.mode === 'g8');
  const { data } = await store.db.from('lead_events').select('data').eq('lead_id', lead.id).eq('type', kind);
  const done = new Set(((data ?? []) as Array<{ data: JsonObject }>).map((r) => Number(r.data?.step)));
  for (let i = 0; i < g8Steps.length; i++) if ((g8Steps[i] as any).channel === channel && !done.has(i + 1)) return i + 1;
  return undefined;
}

// Default email path (docs/verify/sendfix.md): guarded direct compose. Tests reset/replace it.
setFirstTouchSender(makeComposeSender(g8));

// Background loops: only in the real server (not unit tests).
if (!process.env.VITEST) {
  registerScheduler();
  startSendPoll();
}

export default usman;
