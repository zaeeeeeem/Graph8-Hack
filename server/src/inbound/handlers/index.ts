/**
 * Inbound routing table: which agent's onEvent gets a normalised `graph8.event`.
 * Zara (closer): replies, meetings, unsubscribes, voice outcomes. Voice raw events are W9's (handlers/voice.ts).
 * Unknown types → null (stored in inbound_events and ignored, BUILD-PLAN §4).
 */
import type { AgentRole } from '../../../../shared/types';
import { ZARA_EVENT_TYPES } from '../normalize';

const SDR_EVENTS = [
  'engagement.email_sent', 'engagement.email_bounced', 'engagement.email_clicked', 'engagement.link_clicked',
  'sequence.contact_enrolled', 'sequence.step_completed', 'sequence.step_failed', 'sequence.completed',
];

export function routeFor(type: string): AgentRole | null {
  if (ZARA_EVENT_TYPES.includes(type)) return 'closer';
  if (SDR_EVENTS.includes(type)) return 'sdr';
  return null;
}

/** Events register-webhook subscribes to (every type an agent or layer reacts to). */
export const WEBHOOK_EVENTS: string[] = [
  ...ZARA_EVENT_TYPES.filter((t) => t.includes('.') && !t.startsWith('voice.')),
  ...SDR_EVENTS,
  'engagement.linkedin_connection_accepted', 'engagement.linkedin_message_sent',
  'voice_ai.call_started', 'voice_ai.call_completed', 'voice_ai.voicemail_left',
  'engagement.call_completed', 'engagement.call_disposition_set',
  'intelligence.completed', 'intelligence.failed', 'enrichment.job_completed', 'intent.signal',
  'deal.created', 'deal.stage_changed',
];
