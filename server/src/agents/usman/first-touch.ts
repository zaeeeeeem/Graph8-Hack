/**
 * Direct email seam. Default sender (registered at Usman load) = usman/compose.ts (POST /inbox/emails/compose).
 * Used for EVERY email step: D0 at Launch (usman.ts), D3/D9 thread replies from scheduler.ts.
 *
 * Originally the fallback seam for the first touch (V3: graph8 sequence contacts can stay `queued` and never send).
 *
 * The coordinator / SENDFIX worker registers a sender with `setFirstTouchSender(fn)` (must be allowlist-guarded,
 * e.g. built on g8 guarded sends). When one is registered AND `settings.usman_direct_first_touch !== false` (default on), Usman sends
 * email 1 directly to each enrolled TEST lead right after launch and records it as graph8 step 1 (so the poll/webhook
 * dedupe treats a later graph8 send of step 1 as the same touch). No sender registered = graph8 does everything.
 */
import type { LeadRow, UUID } from '../../../../shared/types';

export interface FirstTouchInput {
  workspaceId: UUID;
  lead: LeadRow;
  g8ContactId: string;
  g8SequenceId: string;
  subject: string;
  /** Rendered body ({{first_name}} already replaced). */
  body: string;
  mailbox?: { id: number; email: string };
  /** Follow-ups: Gmail message id of email 1, so the reply threads (compose `reply_to_email_id`). */
  replyToEmailId?: string;
}
export type FirstTouchSender = (i: FirstTouchInput) => Promise<{ ok: boolean; ref?: string; note?: string }>;

let sender: FirstTouchSender | undefined;
export function setFirstTouchSender(fn: FirstTouchSender | undefined): void { sender = fn; }
export function firstTouchSender(): FirstTouchSender | undefined { return sender; }

export function renderFirstName(text: string, firstName: string): string {
  return text.replace(/\{\{\s*first_name\s*\}\}/g, firstName);
}

/** Direct mode is on unless the workspace explicitly turns it off (settings.usman_direct_first_touch === false). */
export function directSendOn(settings: { [k: string]: unknown }): boolean {
  return !!sender && settings.usman_direct_first_touch !== false;
}
