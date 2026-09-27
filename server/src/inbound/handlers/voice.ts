/**
 * Voice inbound (L2) — graph8 `voice_ai.*` webhooks (+ the call's callback_url POST) → one normalized
 * `graph8.event` of type `voice.outcome` { lead_id, disposition, summary } for Zara (Z11).
 *
 * graph8 voice payloads are open-shaped (docs/verify/layers.md V-V2): every field is optional, we key off
 * room_name / call_id / contact_id / disposition / duration / summary and log what we could not read.
 * Calls we placed are tracked in memory (trackCall); if no outcome lands within OUTCOME_TIMEOUT_MS we poll the
 * artifacts once and otherwise emit disposition 'no_outcome' ("call ended, no outcome").
 * Never throws: every handler swallows + logs. No PII in lead_events summaries (redact()).
 */
import type { BusEvents } from '../../contracts';
import type { JsonObject, UUID } from '../../../../shared/types';
import { bus } from '../../lib/bus';
import { g8, unwrap } from '../../lib/g8';
import { log as rootLog, redact } from '../../lib/log';
import { store } from '../../lib/store';

const log = rootLog.child('voice.inbound');

/** graph8 voice dispositions (GET /voice/dispositions, source "voice"): 19 sdr_selectable + 2 system_set. */
export const VOICE_DISPOSITIONS = [
  'booked', 'callback', 'not_interested', 'dnc', 'not_icp', 'has_solution', 'irrelevant_job_title', 'wrong_person',
  'referred', 'gate_keeper', 'wrong_number', 'left_org', 'hangup', 'not_answered', 'busy', 'voicemail', 'no_voice',
  'dial_tree', 'answering_machine', 'sdr_hangup', 'failed',
] as const;
export type VoiceDisposition = (typeof VOICE_DISPOSITIONS)[number];
/** What Zara receives: a graph8 disposition, 'no_outcome' (timeout) or 'unknown' (unmapped value). */
export type VoiceOutcomeDisposition = VoiceDisposition | 'no_outcome' | 'unknown';
export interface VoiceOutcomePayload { lead_id: UUID; disposition: VoiceOutcomeDisposition; summary: string; [k: string]: string }

export const OUTCOME_TIMEOUT_MS = 3 * 60_000;

const ALIASES: Record<string, VoiceDisposition> = {
  meeting_booked: 'booked', appointment_booked: 'booked', meeting_scheduled: 'booked', booked_meeting: 'booked',
  call_back: 'callback', call_me_back: 'callback', callback_requested: 'callback',
  do_not_call: 'dnc', do_not_contact: 'dnc', not_icp_fit: 'not_icp',
  no_answer: 'not_answered', unanswered: 'not_answered', missed: 'not_answered', no_response: 'not_answered',
  voice_mail: 'voicemail', voicemail_left: 'voicemail', left_voicemail: 'voicemail',
  machine: 'answering_machine', machine_detected: 'answering_machine', am: 'answering_machine',
  hung_up: 'hangup', hang_up: 'hangup', prospect_hangup: 'hangup',
  gatekeeper: 'gate_keeper', referral: 'referred', error: 'failed', call_failed: 'failed',
};

/** Map any graph8 disposition string to one of the 21 values; null/empty → null, unmapped → 'unknown'. */
export function normalizeDisposition(raw: unknown): VoiceOutcomeDisposition | null {
  if (raw == null) return null;
  const v = typeof raw === 'object' ? (raw as any).name ?? (raw as any).value ?? (raw as any).key ?? (raw as any).label : raw;
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s\-/]+/g, '_').replace(/[^a-z_]/g, '');
  if (!s) return null;
  if ((VOICE_DISPOSITIONS as readonly string[]).includes(s)) return s as VoiceDisposition;
  return ALIASES[s] ?? 'unknown';
}

/** Pull the fields we care about out of an open-shaped voice payload (webhook body, callback body or artifacts). */
export function readVoicePayload(p: JsonObject | null | undefined) {
  const root = (p ?? {}) as Record<string, any>;
  const d = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, any>;
  const pick = (...keys: string[]) => {
    for (const src of [d, d.call, d.result, root]) {
      if (!src || typeof src !== 'object') continue;
      for (const k of keys) if (src[k] != null && src[k] !== '') return src[k];
    }
    return undefined;
  };
  const str = (x: unknown) => (x == null ? undefined : String(x));
  const transcript = pick('transcript', 'transcript_text');
  return {
    roomName: str(pick('room_name', 'roomName')),
    callId: str(pick('call_id', 'callId', 'id')),
    contactId: str(pick('contact_id', 'contactId', 'cdp_contact_id')),
    disposition: normalizeDisposition(pick('disposition', 'call_disposition', 'outcome', 'status_disposition')),
    sentiment: str(pick('sentiment')),
    durationS: Number(pick('duration', 'duration_seconds', 'call_duration')) || undefined,
    summary: str(pick('summary', 'call_summary', 'ai_summary', 'notes')),
    transcript: typeof transcript === 'string' ? transcript : Array.isArray(transcript) ? transcript.map((t: any) => t?.text ?? t?.content ?? '').join(' ') : undefined,
    ready: pick('transcript_ready', 'ready', 'artifacts_ready'),
  };
}

// ------------------------------------------------------------------------------------------ pending calls
interface Pending {
  workspaceId: UUID; leadId: UUID; g8ContactId: string; roomName: string;
  agentId?: UUID; hint?: VoiceOutcomeDisposition; timer?: ReturnType<typeof setTimeout>;
}
const pending = new Map<string, Pending>();
const settled = new Set<string>();

/** Called by the layer right after POST /voice/calls succeeded. Starts the 3-min "no outcome" clock. */
export function trackCall(p: Omit<Pending, 'timer' | 'hint'>, timeoutMs = OUTCOME_TIMEOUT_MS): void {
  const cur: Pending = { ...p };
  pending.set(p.roomName, cur);
  arm(cur, timeoutMs);
}
function arm(p: Pending, ms = OUTCOME_TIMEOUT_MS) {
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => { void onTimeout(p.roomName); }, ms);
  (p.timer as any)?.unref?.();
}
/** Test helper. */
export function _resetVoiceInbound() { for (const p of pending.values()) if (p.timer) clearTimeout(p.timer); pending.clear(); settled.clear(); }
export function _pending() { return pending; }

function findPending(roomName?: string, contactId?: string): Pending | undefined {
  if (roomName && pending.has(roomName)) return pending.get(roomName);
  if (contactId) for (const p of pending.values()) if (p.g8ContactId === contactId) return p;
  return undefined;
}

async function leadByContact(workspaceId: UUID, contactId?: string): Promise<UUID | null> {
  if (!contactId) return null;
  const r = await store.db.from('leads').select('id').eq('workspace_id', workspaceId).eq('g8_contact_id', contactId).limit(1);
  return (r.data?.[0]?.id as UUID | undefined) ?? null;
}
async function leadByRoom(workspaceId: UUID, roomName?: string): Promise<UUID | null> {
  if (!roomName) return null;
  const r = await store.db.from('lead_events').select('lead_id').eq('workspace_id', workspaceId).eq('type', 'call_placed')
    .eq('data->>room_name', roomName).limit(1);
  return (r.data?.[0]?.lead_id as UUID | undefined) ?? null;
}

async function artifacts(id?: string): Promise<ReturnType<typeof readVoicePayload> | null> {
  if (!id) return null;
  try {
    const r = await Promise.race([
      g8.get(`/voice/calls/${encodeURIComponent(id)}/artifacts`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('artifacts timeout')), 10_000)),
    ]);
    const body = unwrap<JsonObject>(r);
    log.info('artifacts read', { id, fields: Object.keys(body ?? {}).slice(0, 20) });
    return readVoicePayload(body);
  } catch (err) {
    log.warn('artifacts unavailable', { id, err });
    return null;
  }
}

const clipSummary = (s: string | undefined, max = 280) => {
  const t = redact((s ?? '').replace(/\s+/g, ' ').trim());
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};
const LABEL: Record<string, string> = {
  booked: 'booked a meeting', callback: 'asked for a callback', not_interested: 'not interested', dnc: 'asked not to be called',
  voicemail: 'left a voicemail', answering_machine: 'hit an answering machine', not_answered: 'no answer', busy: 'line busy',
  hangup: 'prospect hung up', failed: 'call failed', no_outcome: 'call ended, no outcome', unknown: 'outcome unclear',
};
export const outcomeLabel = (d: VoiceOutcomeDisposition) => LABEL[d] ?? d.replace(/_/g, ' ');

async function sdrAgentId(workspaceId: UUID): Promise<UUID | null> {
  try { return (await store.agentByRole(workspaceId, 'sdr')).id; } catch { return null; }
}

async function insertEvent(row: Record<string, unknown>) {
  const r = await store.db.from('lead_events').insert(row);
  if (r?.error) log.warn('lead_events insert failed', { err: r.error.message, type: row.type });
}

/** Write the call_completed lead_event and re-emit `voice.outcome` once per call. */
async function settle(o: {
  workspaceId: UUID; leadId: UUID; roomName?: string; disposition: VoiceOutcomeDisposition; summary: string;
  inboundEventId: number | string; durationS?: number; sentiment?: string; source: string;
}) {
  const key = o.roomName ?? `lead:${o.leadId}:${o.inboundEventId}`;
  if (settled.has(key)) { log.info('outcome already emitted; ignoring', { roomName: o.roomName }); return; }
  settled.add(key);
  const p = o.roomName ? pending.get(o.roomName) : undefined;
  if (p?.timer) clearTimeout(p.timer);
  if (o.roomName) pending.delete(o.roomName);

  const summary = o.summary || outcomeLabel(o.disposition);
  await insertEvent({
    workspace_id: o.workspaceId, lead_id: o.leadId, agent_id: p?.agentId ?? (await sdrAgentId(o.workspaceId)),
    inbound_event_id: typeof o.inboundEventId === 'string' && /^[0-9a-f-]{36}$/i.test(o.inboundEventId) ? o.inboundEventId : null,
    type: 'call_completed', channel: 'phone', direction: 'outbound',
    summary: `AI call — ${outcomeLabel(o.disposition)}`,
    data: { disposition: o.disposition, room_name: o.roomName ?? null, duration_s: o.durationS ?? null, sentiment: o.sentiment ?? null, source: o.source, summary: clipSummary(summary, 500) },
  });
  const payload: VoiceOutcomePayload = { lead_id: o.leadId, disposition: o.disposition, summary: clipSummary(summary) };
  log.info('voice.outcome', { lead_id: o.leadId, disposition: o.disposition, source: o.source });
  bus.emit('graph8.event', { type: 'voice.outcome', payload, inboundEventId: o.inboundEventId, workspaceId: o.workspaceId });
}

async function onTimeout(roomName: string) {
  const p = pending.get(roomName);
  if (!p || settled.has(roomName)) return;
  try {
    const a = await artifacts(roomName);
    const disposition = a?.disposition ?? p.hint ?? 'no_outcome';
    const summary = a?.summary ?? (disposition === 'no_outcome' ? 'call ended, no outcome' : '');
    await settle({ workspaceId: p.workspaceId, leadId: p.leadId, roomName, disposition, summary, inboundEventId: `voice-timeout:${roomName}`, durationS: a?.durationS, sentiment: a?.sentiment, source: a?.disposition ? 'artifacts_poll' : 'timeout' });
  } catch (err) {
    log.error('voice timeout handling failed', { err });
  }
}

type Handler = (e: BusEvents['graph8.event']) => Promise<void>;

async function resolveLead(e: BusEvents['graph8.event'], v: ReturnType<typeof readVoicePayload>) {
  const p = findPending(v.roomName ?? v.callId, v.contactId);
  const leadId = p?.leadId ?? (await leadByRoom(e.workspaceId, v.roomName ?? v.callId)) ?? (await leadByContact(e.workspaceId, v.contactId));
  return { p, leadId };
}

const callStarted: Handler = async (e) => {
  try {
    const v = readVoicePayload(e.payload);
    const p = findPending(v.roomName ?? v.callId, v.contactId);
    if (p) arm(p); // restart the 3-min clock from when the call actually connected
    log.info('call started', { tracked: !!p });
  } catch (err) { log.error('call_started handler failed', { err }); }
};

const voicemailLeft: Handler = async (e) => {
  try {
    const v = readVoicePayload(e.payload);
    const { p, leadId } = await resolveLead(e, v);
    if (p) p.hint = 'voicemail';
    if (!leadId) { log.warn('voicemail_left for unknown lead'); return; }
    await insertEvent({
      workspace_id: e.workspaceId, lead_id: leadId, agent_id: p?.agentId ?? (await sdrAgentId(e.workspaceId)),
      type: 'voicemail_left', channel: 'phone', direction: 'outbound', summary: 'AI agent left a voicemail',
      data: { room_name: v.roomName ?? null },
    });
    // Emit now only if graph8 will not follow with call_completed for an untracked call.
    if (!p) await settle({ workspaceId: e.workspaceId, leadId, roomName: v.roomName, disposition: 'voicemail', summary: 'left a voicemail', inboundEventId: e.inboundEventId, source: 'voicemail_left' });
  } catch (err) { log.error('voicemail_left handler failed', { err }); }
};

const callCompleted: Handler = async (e) => {
  try {
    let v = readVoicePayload(e.payload);
    const { p, leadId } = await resolveLead(e, v);
    if (!leadId) { log.warn('call_completed for unknown lead', { hasRoom: !!v.roomName, hasContact: !!v.contactId }); return; }
    const a = await artifacts(v.callId ?? v.roomName);
    const disposition = v.disposition ?? a?.disposition ?? p?.hint ?? 'unknown';
    const summary = v.summary ?? a?.summary ?? (a?.transcript ? a.transcript.slice(0, 400) : '');
    v = { ...v, durationS: v.durationS ?? a?.durationS, sentiment: v.sentiment ?? a?.sentiment };
    await settle({ workspaceId: e.workspaceId, leadId, roomName: v.roomName ?? p?.roomName, disposition, summary, inboundEventId: e.inboundEventId, durationS: v.durationS, sentiment: v.sentiment, source: e.type });
  } catch (err) { log.error('call_completed handler failed', { err }); }
};

/** callback_url bodies carry no `event` key → the webhook route types them 'unknown'. Only act when it looks like a voice result. */
const maybeCallback: Handler = async (e) => {
  const v = readVoicePayload(e.payload);
  if (!v.roomName || (!v.disposition && v.durationS == null)) return;
  await callCompleted({ ...e, type: 'voice_callback' });
};

export const voiceInbound: Record<string, Handler> = {
  'voice_ai.call_started': callStarted,
  'voice_ai.call_completed': callCompleted,
  'voice_ai.voicemail_left': voicemailLeft,
  unknown: maybeCallback,
};
