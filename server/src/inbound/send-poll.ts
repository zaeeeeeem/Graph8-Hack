/**
 * Send poll (W4, U-T7/U12): every 15 s read `GET /sequences/{id}/contacts` for our live sequences and turn progress into
 * `lead_events` (email_sent / email_bounced / call_placed …) + Usman checklist updates. Webhooks arrive via Usman.onEvent;
 * `recordTouch` dedupes per (lead, type, g8 step) so both paths can report the same send.
 *
 * Interpretation of SequenceContactItem (unverified until V3): `current_step_order` = next step to execute, so steps
 * < current are done; a terminal state (finished/completed) means the current step is done too. A state containing
 * "bounce" = bounced. If V3 shows otherwise only `doneSteps()` changes.
 */
import { env } from '../lib/env';
import { g8 } from '../lib/g8';
import { store } from '../lib/store';
import type { LeadRow, SequenceRow, UUID } from '../../../shared/types';
import { findLeadByContact, recordTouch, type TrackKind } from '../agents/usman/track';
import { errMsg, unwrap } from '../agents/usman/util';

export const SEND_POLL_MS = 15_000;

export interface SeqContactItem { contact_id: number | null; state: string | null; current_step_order: number | null }

export function doneSteps(item: SeqContactItem, totalG8Steps: number): number[] {
  const cur = Number(item.current_step_order ?? 0);
  const st = String(item.state ?? '').toLowerCase();
  const terminal = /finish|complet|done/.test(st);
  const last = terminal ? Math.min(Math.max(cur, 1), totalG8Steps) : Math.min(cur - 1, totalG8Steps);
  const out: number[] = [];
  for (let i = 1; i <= last; i++) out.push(i);
  return out;
}

function kindForStep(step: any): TrackKind | undefined {
  switch (step?.channel) {
    case 'email': return 'email_sent';
    case 'phone': return 'call_placed';
    case 'linkedin': return step.action === 'connection_request' ? 'linkedin_connection_sent' : 'linkedin_message_sent';
    case 'sms': return 'sms_sent';
    default: return undefined;
  }
}

async function pollSequence(seq: SequenceRow): Promise<number> {
  const g8Steps = (seq.steps ?? []).filter((s: any) => s.mode === 'g8');
  const res = await g8.get(`/sequences/${seq.g8_sequence_id}/contacts`, { page: 1, limit: 100 });
  const items = (unwrap<SeqContactItem[]>(res) ?? []) as SeqContactItem[];
  let n = 0;
  for (const it of items) {
    if (it.contact_id == null) continue;
    const lead = await findLeadByContact(seq.workspace_id, it.contact_id) as LeadRow | undefined;
    if (!lead) continue;
    if (/bounce/i.test(String(it.state ?? ''))) {
      if (await recordTouch({ workspaceId: seq.workspace_id, kind: 'email_bounced', lead, seq, stepOrder: Number(it.current_step_order ?? 0) || undefined, source: 'poll' })) n++;
      continue;
    }
    for (const order of doneSteps(it, g8Steps.length)) {
      const kind = kindForStep(g8Steps[order - 1]);
      if (kind && await recordTouch({ workspaceId: seq.workspace_id, kind, lead, seq, stepOrder: order, source: 'poll' })) n++;
    }
  }
  return n;
}

/** One pass over live sequences of the served workspace. Returns new events recorded. */
export async function pollSendsOnce(workspaceId: UUID = env.WORKSPACE_ID): Promise<number> {
  const { data } = await store.db.from('sequences').select('*')
    .eq('workspace_id', workspaceId).eq('status', 'live').not('g8_sequence_id', 'is', null);
  let n = 0;
  for (const seq of (data ?? []) as SequenceRow[]) {
    try { n += await pollSequence(seq); } catch (e) { console.warn('[send-poll] sequence poll failed:', errMsg(e)); }
  }
  return n;
}

let timer: NodeJS.Timeout | undefined;
let busy = false;
export function startSendPoll(ms = SEND_POLL_MS): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await pollSendsOnce(); } catch (e) { console.warn('[send-poll] failed:', errMsg(e)); } finally { busy = false; }
  }, ms);
  timer.unref?.();
}
export function stopSendPoll(): void { if (timer) clearInterval(timer); timer = undefined; }
