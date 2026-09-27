/**
 * Guarded direct email sender (docs/verify/sendfix.md). graph8's sequencer does not dispatch in this org (mailbox has
 * 0 cold-outbound capacity), so every Usman email step goes out through `POST /inbox/emails/compose`
 * (`save_as_draft:false`, ~1.5 s, returns the Gmail message id as `email_id`). Follow-ups thread with `reply_to_email_id`.
 *
 * Guard (same as enrollGuarded): TEST lead only; recipient address read from the graph8 contact (never from model
 * output); `g8.isAllowlisted({ email, g8ContactId })` must pass. Anything else → { ok:false }, nothing sent.
 * Based on scripts/verify/sendfix-first-touch.ts (makeFirstTouchSender).
 */
import type { G8 } from '../../contracts';
import type { FirstTouchInput, FirstTouchSender } from './first-touch';
import { unwrap } from './util';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain-text copy → minimal HTML (compose `content` is HTML). */
export const toHtml = (text: string) =>
  text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export function makeComposeSender(g8: Pick<G8, 'get' | 'post' | 'isAllowlisted'>, opts: { defaultFrom?: string } = {}): FirstTouchSender {
  return async (i: FirstTouchInput) => {
    if (!i.lead.is_test_contact) return { ok: false, note: 'not a test lead' };
    const c = unwrap<Record<string, any>>(await g8.get(`/contacts/${encodeURIComponent(i.g8ContactId)}`));
    const to = [c?.work_email, c?.personal_emails, c?.email]
      .flatMap((e) => (Array.isArray(e) ? e : [e]))
      .find((e) => typeof e === 'string' && e.includes('@')) as string | undefined;
    if (!to) return { ok: false, note: 'graph8 contact has no email' };
    if (!(await g8.isAllowlisted({ email: to, g8ContactId: i.g8ContactId }))) return { ok: false, note: 'blocked by allowlist guard' };

    const from = i.mailbox?.email ?? opts.defaultFrom;
    if (!from) return { ok: false, note: 'no sending mailbox' };
    const body: Record<string, unknown> = {
      to: [to], from_mailbox: from, subject: i.subject, content: toHtml(i.body), save_as_draft: false,
    };
    if (i.replyToEmailId) body.reply_to_email_id = i.replyToEmailId;
    const r = unwrap<Record<string, any>>(await g8.post('/inbox/emails/compose', body));
    if (!r?.success || r?.status !== 'sent') return { ok: false, note: `compose status ${r?.status ?? 'unknown'}` };
    return { ok: true, ref: String(r.email_id ?? ''), note: 'sent via /inbox/emails/compose' };
  };
}
