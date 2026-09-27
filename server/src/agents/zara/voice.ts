/** Z11: voice disposition → Zara action. W9 emits `voice.outcome {contact_id, disposition, summary?, call_id?, scheduled_at?}`. */
export type VoiceAction = 'deal' | 'propose_times' | 'stop' | 'do_not_contact' | 'continue' | 'approval_draft' | 'note';

export function mapDisposition(raw: string): VoiceAction {
  const d = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (/(^|_)(booked|meeting_booked|appointment_set|meeting_set)($|_)/.test(d)) return 'deal';
  if (/callback|call_back|interested|follow_up/.test(d) && !/not_interested/.test(d)) return 'propose_times';
  if (/dnc|do_not_(call|contact)/.test(d)) return 'do_not_contact';
  if (/not_interested/.test(d)) return 'stop';
  if (/voicemail|not_answered|no_answer|busy|unreachable|failed/.test(d)) return 'continue';
  if (/wrong_person|wrong_number|referred|referral|gatekeeper/.test(d)) return 'approval_draft';
  return 'note';
}
