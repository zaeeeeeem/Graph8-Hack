/**
 * Normalise graph8 events (webhook envelope, bare webhook `data`, inbox poll hit, simulated) into the shapes Zara acts on.
 * Pure functions — no I/O. Shared dedupe-key scheme with the webhook endpoint (W1a):
 *   graph8:<event_type>:<reply_id|meeting_id|fallback>
 */
import type { JsonObject } from '../../../shared/types';

export const REPLY_EVENTS = [
  'engagement.email_replied', 'engagement.linkedin_reply_received', 'engagement.sms_replied',
] as const;
export const MEETING_EVENTS = ['meeting.booked', 'meeting.cancelled', 'meeting.rescheduled', 'meeting.no_show'] as const;
export const UNSUBSCRIBE_EVENTS = ['engagement.contact_unsubscribed'] as const;
/** Emitted by the voice layer (W9) after mapping a call result. */
export const VOICE_OUTCOME_EVENT = 'voice.outcome';
/** Every event type Zara reacts to (runtime routes these to the closer's onEvent). */
export const ZARA_EVENT_TYPES: string[] = [...REPLY_EVENTS, ...MEETING_EVENTS, ...UNSUBSCRIBE_EVENTS, VOICE_OUTCOME_EVENT];

export type ReplyChannel = 'email' | 'linkedin' | 'sms';
export interface NormalizedReply {
  kind: 'reply';
  eventType: string;
  channel: ReplyChannel;
  contactId: string | null;
  email: string | null;
  sequenceId: string | null;
  /** graph8 inbox thread id (`/inbox/{reply_id}`) when known (poll/simulated). Webhooks don't carry it. */
  replyId: string | null;
  messageId: string | null;
  subject: string | null;
  repliedAt: string | null;
  isPositive: boolean | null;
  /** Reply body when the source already had it (simulated / poll). */
  text: string | null;
  source: 'webhook' | 'poll' | 'simulated';
}
export interface NormalizedMeeting {
  kind: 'meeting';
  eventType: string;
  action: 'booked' | 'cancelled' | 'rescheduled' | 'no_show';
  contactId: string | null;
  email: string | null;
  meetingId: string | null;
  title: string | null;
  scheduledAt: string | null;
  durationMinutes: number | null;
}
export interface NormalizedUnsubscribe { kind: 'unsubscribe'; eventType: string; contactId: string | null; email: string | null }
export interface NormalizedVoice {
  kind: 'voice';
  eventType: string;
  contactId: string | null;
  /** Our lead id — the voice layer (W9) sends lead_id rather than contact_id. */
  leadId?: string | null;
  disposition: string;
  summary: string | null;
  callId: string | null;
  scheduledAt: string | null;
}
export type NormalizedEvent = NormalizedReply | NormalizedMeeting | NormalizedUnsubscribe | NormalizedVoice;

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Accepts either the full envelope `{event, timestamp, org_id, data}` or the bare `data`. */
export function unwrap(payload: JsonObject): { data: JsonObject; event?: string; timestamp?: string } {
  const p = payload as Record<string, any>;
  if (p && typeof p.data === 'object' && p.data && !Array.isArray(p.data) && (p.event || p.timestamp || p.org_id)) {
    return { data: p.data as JsonObject, event: str(p.event) ?? undefined, timestamp: str(p.timestamp) ?? undefined };
  }
  return { data: payload };
}

function replyChannel(type: string, d: Record<string, any>): ReplyChannel {
  if (type.includes('linkedin')) return 'linkedin';
  if (type.includes('sms')) return 'sms';
  const c = String(d.channel ?? '').toLowerCase();
  return c === 'linkedin' || c === 'sms' ? c : 'email';
}

export function normalize(type: string, payload: JsonObject): NormalizedEvent | null {
  const { data, event } = unwrap(payload);
  const t = type || event || '';
  const d = data as Record<string, any>;
  if ((REPLY_EVENTS as readonly string[]).includes(t)) {
    return {
      kind: 'reply', eventType: t, channel: replyChannel(t, d),
      contactId: str(d.contact_id), email: str(d.email), sequenceId: str(d.sequence_id),
      replyId: str(d.reply_id ?? d.thread_id), messageId: str(d.message_id), subject: str(d.reply_subject ?? d.subject),
      repliedAt: str(d.replied_at), isPositive: typeof d.is_positive === 'boolean' ? d.is_positive : null,
      text: str(d.reply_text ?? d.text), source: d._source === 'poll' ? 'poll' : d._source === 'simulated' ? 'simulated' : 'webhook',
    };
  }
  if ((MEETING_EVENTS as readonly string[]).includes(t)) {
    return {
      kind: 'meeting', eventType: t, action: t.split('.')[1] as NormalizedMeeting['action'],
      contactId: str(d.contact_id), email: str(d.email), meetingId: str(d.meeting_id ?? d.booking_uid ?? d.uid ?? d.id),
      title: str(d.meeting_title ?? d.title), scheduledAt: str(d.scheduled_at ?? d.start_time ?? d.new_scheduled_at),
      durationMinutes: num(d.duration_minutes ?? d.length),
    };
  }
  if ((UNSUBSCRIBE_EVENTS as readonly string[]).includes(t)) {
    return { kind: 'unsubscribe', eventType: t, contactId: str(d.contact_id), email: str(d.email) };
  }
  if (t === VOICE_OUTCOME_EVENT) {
    return {
      kind: 'voice', eventType: t, contactId: str(d.contact_id), leadId: str(d.lead_id), disposition: String(d.disposition ?? 'unknown').toLowerCase(),
      summary: str(d.summary), callId: str(d.call_id ?? d.room_name), scheduledAt: str(d.scheduled_at ?? d.callback_at),
    };
  }
  return null;
}

/** Shared dedupe key (webhook + poll + simulate). Falls back to contact+time when graph8 omits the reply id. */
export function dedupeKey(type: string, payload: JsonObject): string {
  const { data } = unwrap(payload);
  const d = data as Record<string, any>;
  const thread = d.reply_id ?? d.thread_id;
  // A thread can carry several prospect replies ("interested" then "Tue 3pm") — key on the message when we have it.
  const id = thread ? (d.message_id ? `${thread}:${d.message_id}` : thread)
    : d.meeting_id ?? d.booking_uid ?? d.call_id
    ?? `${d.contact_id ?? 'na'}:${d.message_id ?? d.replied_at ?? d.scheduled_at ?? d.timestamp ?? 'na'}`;
  return `graph8:${type}:${id}`;
}
