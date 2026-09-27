/**
 * SENDFIX — guarded direct first-touch sender for Usman's seam (server/src/agents/usman/first-touch.ts, build branch).
 *
 * Verified live 2026-09-27: `POST /inbox/emails/compose` with `save_as_draft:false` sends from the connected Gmail
 * mailbox in ~1.5 s and returns `{success, email_id, status:"sent"}` (email_id = Gmail message id; shows in Gmail SENT).
 *
 * Wiring (coordinator, in server boot on build):
 *   import { setFirstTouchSender } from './agents/usman';
 *   import { makeFirstTouchSender } from '../../scripts/verify/sendfix-first-touch'; // or copy into server/src/lib
 *   setFirstTouchSender(makeFirstTouchSender(g8));
 *
 * Guard: recipient address comes from the graph8 contact itself (never from the LLM), and must pass
 * g8.isAllowlisted({ email, g8ContactId }) — the same guard enrollGuarded uses. Anything else → { ok:false }.
 */

interface G8Like {
  get<T = any>(path: string, query?: Record<string, unknown>): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  isAllowlisted(x: { email?: string | null; phone?: string | null; g8ContactId?: string | number | null }): Promise<boolean>;
}

interface FirstTouchInput {
  workspaceId: string;
  lead: { full_name?: string | null; email?: string | null; is_test_contact?: boolean | null } & Record<string, unknown>;
  g8ContactId: string;
  g8SequenceId: string;
  subject: string;
  body: string;
  mailbox?: { id: number; email: string };
}
type FirstTouchResult = { ok: boolean; ref?: string; note?: string };

const unwrap = <T = any>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain-text copy → minimal HTML (compose `content` is HTML). */
export const toHtml = (text: string) =>
  text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export function makeFirstTouchSender(g8: G8Like, opts: { defaultFrom?: string } = {}) {
  return async (i: FirstTouchInput): Promise<FirstTouchResult> => {
    if (!i.lead.is_test_contact) return { ok: false, note: 'not a test lead' };
    // Address from graph8, not from the lead row / model output. Contacts created by us expose work_email plainly;
    // withheld ones come back as "***" and are useless here (POST /contacts/unlock-info reveals them, 1 credit).
    const c = unwrap<Record<string, any>>(await g8.get(`/contacts/${i.g8ContactId}`));
    const to = [c?.work_email, c?.personal_emails].find((e) => typeof e === 'string' && e.includes('@')) as string | undefined;
    if (!to) return { ok: false, note: 'graph8 contact has no email' };
    if (!(await g8.isAllowlisted({ email: to, g8ContactId: i.g8ContactId }))) return { ok: false, note: 'blocked by allowlist guard' };

    const from = i.mailbox?.email ?? opts.defaultFrom;
    if (!from) return { ok: false, note: 'no sending mailbox' };
    const r = unwrap<Record<string, any>>(await g8.post('/inbox/emails/compose', {
      to: [to],
      from_mailbox: from,
      subject: i.subject,
      content: toHtml(i.body),
      save_as_draft: false,
    }));
    if (!r?.success || r?.status !== 'sent') return { ok: false, note: `compose status ${r?.status ?? 'unknown'}` };
    return { ok: true, ref: String(r.email_id ?? ''), note: 'sent via /inbox/emails/compose' };
  };
}

// Self-check (no network): `pnpm -C server exec tsx ../scripts/verify/sendfix-first-touch.ts`
if (process.argv[1]?.endsWith('sendfix-first-touch.ts')) {
  const calls: string[] = [];
  const fake = (allow: boolean, email: string | null): G8Like => ({
    get: async () => ({ data: { work_email: email } }),
    post: async (p) => { calls.push(p); return { data: { success: true, status: 'sent', email_id: 'x1' } }; },
    isAllowlisted: async () => allow,
  });
  const base = { workspaceId: 'w', g8ContactId: '4', g8SequenceId: 's', subject: 'Hi', body: 'a\n\nb', mailbox: { id: 1, email: 'from@example.com' } };
  (async () => {
    const lead = { is_test_contact: true };
    const a = await makeFirstTouchSender(fake(false, 'x@example.com'))({ ...base, lead });
    const b = await makeFirstTouchSender(fake(true, null))({ ...base, lead });
    const c = await makeFirstTouchSender(fake(true, 'x@example.com'))({ ...base, lead: { is_test_contact: false } });
    const d = await makeFirstTouchSender(fake(true, 'x@example.com'))({ ...base, lead });
    const ok = !a.ok && !b.ok && !c.ok && d.ok && d.ref === 'x1' && calls.length === 1 && toHtml('a\n\nb') === '<p>a</p><p>b</p>';
    console.log(ok ? 'sendfix-first-touch self-check OK' : 'FAIL', { a, b, c, d, calls });
    process.exit(ok ? 0 : 1);
  })();
}
