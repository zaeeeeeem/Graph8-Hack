/**
 * U-T7 track_sends + U12 live checklist after launch. Used by onEvent (webhooks) and send-poll (GET /sequences/{id}/contacts).
 * Dedupe: one lead_event per (lead, type, g8 step) — webhook and poll can both report the same send.
 */
import { env } from '../../lib/env';
import { g8 } from '../../lib/g8';
import { slack } from '../../lib/slack';
import { store } from '../../lib/store';
import type { Checklist } from '../../contracts';
import type { EventChannel, JsonObject, LeadEventType, LeadRow, SequenceRow, SequenceStats, UUID } from '../../../../shared/types';
import { errMsg, safe, scrub } from './util';

export type TrackKind = 'email_sent' | 'email_bounced' | 'call_placed' | 'call_completed' | 'voicemail_left'
  | 'linkedin_connection_sent' | 'linkedin_message_sent' | 'sms_sent';

const KIND_CHANNEL: Record<TrackKind, EventChannel> = {
  email_sent: 'email', email_bounced: 'email', call_placed: 'phone', call_completed: 'phone', voicemail_left: 'phone',
  linkedin_connection_sent: 'linkedin', linkedin_message_sent: 'linkedin', sms_sent: 'sms',
};

/** graph8 webhook type → our lead_event type. Unknown → undefined (ignored by Usman; Zara handles replies/meetings). */
export function mapG8Event(type: string): TrackKind | undefined {
  const t = type.replace(/^engagement\.|^voice_ai\./, '');
  switch (t) {
    case 'email_sent': return 'email_sent';
    case 'email_bounced': return 'email_bounced';
    case 'call_dispatched': case 'call_started': return 'call_placed';
    case 'call_completed': return 'call_completed';
    case 'voicemail_left': return 'voicemail_left';
    case 'linkedin_connection_sent': return 'linkedin_connection_sent';
    case 'linkedin_message_sent': return 'linkedin_message_sent';
    case 'sms_sent': return 'sms_sent';
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// In-memory checklist per sequence row (the run that built it); fallback = thread message.
// ---------------------------------------------------------------------------
const trackers = new Map<UUID, Checklist>();
export function setTracker(sequenceRowId: UUID, c: Checklist | undefined): void { if (c) trackers.set(sequenceRowId, c); }
export function getTracker(sequenceRowId: UUID): Checklist | undefined { return trackers.get(sequenceRowId); }

export function statsLine(s: SequenceStats): string {
  return `✉️ ${s.sent ?? 0} sent · 📞 ${(s as JsonObject).calls ?? 0} call${(s as JsonObject).calls === 1 ? '' : 's'} · ${s.bounced ?? 0} bounced`;
}

export async function findLeadByContact(workspaceId: UUID, g8ContactId: string | number): Promise<LeadRow | undefined> {
  const { data } = await store.db.from('leads').select('*')
    .eq('workspace_id', workspaceId).eq('g8_contact_id', String(g8ContactId)).limit(1);
  return data?.[0] as LeadRow | undefined;
}

export async function findSequenceByG8(workspaceId: UUID, g8SequenceId: string | number): Promise<SequenceRow | undefined> {
  const { data } = await store.db.from('sequences').select('*')
    .eq('workspace_id', workspaceId).eq('g8_sequence_id', String(g8SequenceId)).limit(1);
  return data?.[0] as SequenceRow | undefined;
}

async function alreadyRecorded(lead: LeadRow, type: LeadEventType, stepKey: string): Promise<boolean> {
  const { data } = await store.db.from('lead_events').select('id')
    .eq('lead_id', lead.id).eq('type', type).contains('data', { step_key: stepKey }).limit(1);
  return !!data?.length;
}

function summaryFor(kind: TrackKind, lead: LeadRow, stepN?: number, subject?: string): string {
  const who = `${lead.full_name}${lead.is_test_contact ? ' (TEST)' : ''}`;
  switch (kind) {
    case 'email_sent': return scrub(`Email${stepN ? ` ${stepN}` : ''} sent to ${who}${subject ? `: “${subject}”` : ''}`);
    case 'email_bounced': return scrub(`Email bounced for ${who} — stopped`);
    case 'call_placed': return scrub(`AI call placed to ${who}`);
    case 'call_completed': return scrub(`AI call with ${who} ended`);
    case 'voicemail_left': return scrub(`Voicemail left for ${who}`);
    case 'linkedin_connection_sent': return scrub(`LinkedIn connection request sent to ${who}`);
    case 'linkedin_message_sent': return scrub(`LinkedIn message sent to ${who}`);
    case 'sms_sent': return scrub(`SMS sent to ${who}`);
  }
}

export interface TrackInput {
  workspaceId: UUID;
  agentId?: UUID;
  kind: TrackKind;
  lead: LeadRow;
  seq?: SequenceRow;
  /** graph8 step order (1-based) when known; also used for dedupe. */
  stepOrder?: number;
  source: 'webhook' | 'poll' | 'scheduler' | 'direct';
  extra?: JsonObject;
}

/** Record one touch. Returns false when it was a duplicate. Never throws on Slack problems. */
export async function recordTouch(i: TrackInput): Promise<boolean> {
  const stepKey = i.kind === 'email_bounced'
    ? `${i.seq?.g8_sequence_id ?? 'none'}:bounce`
    : `${i.seq?.g8_sequence_id ?? 'none'}:${i.stepOrder ?? i.extra?.g8_event_id ?? 'x'}`;
  if (await alreadyRecorded(i.lead, i.kind, stepKey)) return false;

  const summary = summaryFor(i.kind, i.lead, i.stepOrder, emailSubject(i.seq, i.stepOrder));
  const agentId = i.agentId ?? (await safe(() => store.agentByRole(i.workspaceId, 'sdr')))?.id ?? null;
  await store.db.from('lead_events').insert({
    workspace_id: i.workspaceId, lead_id: i.lead.id, agent_id: agentId, task_id: i.seq?.task_id ?? null,
    type: i.kind, channel: KIND_CHANNEL[i.kind], direction: 'outbound', summary,
    data: { step_key: stepKey, g8_sequence_id: i.seq?.g8_sequence_id ?? null, step: i.stepOrder ?? null, source: i.source, ...(i.extra ?? {}) },
  });

  if (i.kind === 'email_bounced') await handleBounce(i.workspaceId, i.lead, i.seq);
  else if (i.lead.stage === 'queued' || i.lead.stage === 'researched') {
    await store.db.from('leads').update({ stage: 'contacted', stage_changed_at: new Date().toISOString() }).eq('id', i.lead.id);
  }

  if (i.seq) {
    const stats = bumpStats(i.seq.stats ?? {}, i.kind);
    await store.db.from('sequences').update({ stats }).eq('id', i.seq.id);
    i.seq.stats = stats;
    await updateTracker(i.seq, summary);
  }
  return true;
}

function emailSubject(seq?: SequenceRow, stepOrder?: number): string | undefined {
  if (!seq || !stepOrder) return undefined;
  const g8Steps = (seq.steps ?? []).filter((s: any) => s.mode === 'g8');
  const s = g8Steps[stepOrder - 1] as any;
  return s?.channel === 'email' ? s.subject : undefined;
}

export function bumpStats(s: SequenceStats, kind: TrackKind): SequenceStats & JsonObject {
  const out = { ...(s as JsonObject) } as SequenceStats & JsonObject;
  const inc = (k: string) => { out[k] = Number(out[k] ?? 0) + 1; };
  if (kind === 'email_sent') inc('sent');
  else if (kind === 'email_bounced') inc('bounced');
  else if (kind === 'call_placed') inc('calls');
  else if (kind === 'linkedin_connection_sent' || kind === 'linkedin_message_sent') inc('linkedin');
  return out;
}

/** U14: lead out, contact paused in the graph8 sequence, no more touches. */
async function handleBounce(workspaceId: UUID, lead: LeadRow, seq?: SequenceRow): Promise<void> {
  await store.db.from('leads').update({
    stage: 'disqualified', disqualify_reason: 'bounced', sequence_state: 'stopped', stage_changed_at: new Date().toISOString(),
  }).eq('id', lead.id);
  if (seq?.g8_sequence_id && lead.g8_contact_id) {
    await safe(() => g8.post(`/sequences/${seq.g8_sequence_id}/contacts/${lead.g8_contact_id}/pause`, {}));
  }
  void workspaceId;
}

/** U12: update the run checklist in Usman's #sales-team thread; else post a line in the task thread. */
export async function updateTracker(seq: SequenceRow, line: string): Promise<void> {
  const c = getTracker(seq.id);
  if (c) {
    await safe(() => c.set('track', 'doing', statsLine(seq.stats ?? {})));
    return;
  }
  await safe(async () => {
    if (!seq.task_id || env.SLACK_DISABLED) return;
    const { data } = await store.db.from('tasks').select('slack_channel, slack_thread_ts').eq('id', seq.task_id).limit(1);
    const t = data?.[0];
    if (!t?.slack_channel || !t?.slack_thread_ts) return;
    await slack.postAs('sdr', t.slack_channel, { text: `${line} · ${statsLine(seq.stats ?? {})}`, threadTs: t.slack_thread_ts });
  }, (e) => console.warn('[usman] tracker update failed:', errMsg(e)));
}
