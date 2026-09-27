/**
 * Inbox polling (Z8 / BUILD-PLAN C15) — primary reply detector since sendfix (emails go out via /inbox/emails/compose).
 *
 * Verified live 11:55 PKT (REPLYFIX): `GET /inbox` (any filter) returns total 0 and `GET /inbox/emails/{id}` 404s for
 * both the Gmail id and the thread id, but `POST /inbox/emails/search {mailboxes:[<our mailbox>], search_emails:[…],
 * updated_after}` returns the synced Gmail threads: item `{id: <Message-ID of first msg>, subject, contact{id,email},
 * has_inbound, last_message_at, messages: {messages: [{message_id, date "YYYY-MM-DD hh:mm:ss.ffffff" (UTC),
 * responder "USER"|"OTHER", from_email[], to[], content (text), html_content, draft, headers}]}}`.
 * Needs mailbox sync RUNNING (`GET /inbox/mailboxes/{email}/sync?provider=google_mailbox`).
 *
 * On `cron.tick inbox_poll` (15 s): one search per tick scoped to the addresses of leads we emailed; the prospect's
 * newest unseen message per thread (newer than our first send to them) → inbound_events (dedupe
 * `graph8:engagement.email_replied:<thread>:<message>`) → bus `graph8.event`. Legacy per-sequence `GET /inbox` kept as
 * a fallback for graph8-sequencer threads.
 */
import { bus } from '../lib/bus';
import { env } from '../lib/env';
import { g8 } from '../lib/g8';
import { log } from '../lib/log';
import { store } from '../lib/store';
import type { JsonObject, UUID } from '../../../shared/types';
import { claimInbound, liveSequences } from '../agents/zara/db';
import { latestInbound, listThreads, threadContactEmail, threadContactId, type InboxThread } from '../agents/zara/inbox';
import { stripQuoted } from '../agents/zara/pii';
import { dedupeKey } from './normalize';

const REPLY_TYPE = 'engagement.email_replied';
const LOOKBACK_MS = 3 * 86400_000;

export interface WatchedLead { leadId: UUID; email: string; g8ContactId: string | null; since: number; g8SequenceId: string | null }

/** Leads we have emailed (email_sent events, or enrolled) with their address and first-send time. Server-side only. */
export async function watchedLeads(workspaceId: UUID): Promise<WatchedLead[]> {
  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const ev = await store.db.from('lead_events').select('lead_id,created_at')
    .eq('workspace_id', workspaceId).eq('type', 'email_sent').gte('created_at', cutoff).order('created_at', { ascending: true }).limit(500);
  const firstSent = new Map<string, number>();
  for (const e of (ev.data ?? []) as Array<{ lead_id: string; created_at: string }>) {
    if (!firstSent.has(e.lead_id)) firstSent.set(e.lead_id, Date.parse(e.created_at));
  }
  const enrolled = await store.db.from('leads').select('id').eq('workspace_id', workspaceId).eq('sequence_state', 'enrolled').limit(200);
  const ids = [...new Set([...firstSent.keys(), ...((enrolled.data ?? []) as Array<{ id: string }>).map((l) => l.id)])];
  if (!ids.length) return [];
  const [contacts, leads, seqs] = await Promise.all([
    store.db.from('lead_contacts').select('lead_id,email').in('lead_id', ids),
    store.db.from('leads').select('id,g8_contact_id,sequence_id,do_not_contact').in('id', ids),
    store.db.from('sequences').select('id,g8_sequence_id,launched_at').eq('workspace_id', workspaceId),
  ]);
  const seqById = new Map(((seqs.data ?? []) as any[]).map((s) => [s.id, s]));
  const leadById = new Map(((leads.data ?? []) as any[]).map((l) => [l.id, l]));
  const out: WatchedLead[] = [];
  for (const c of (contacts.data ?? []) as Array<{ lead_id: string; email: string | null }>) {
    const l = leadById.get(c.lead_id);
    if (!c.email || !l || l.do_not_contact) continue;
    const seq = l.sequence_id ? seqById.get(l.sequence_id) : null;
    const since = firstSent.get(c.lead_id) ?? (seq?.launched_at ? Date.parse(seq.launched_at) : Date.now() - 86400_000);
    out.push({ leadId: c.lead_id, email: c.email.toLowerCase(), g8ContactId: l.g8_contact_id, since, g8SequenceId: seq?.g8_sequence_id ?? null });
  }
  return out;
}

/** graph8 mailbox dates come as "YYYY-MM-DD hh:mm:ss.ffffff" in UTC. */
export function parseG8Date(d: unknown): number {
  if (typeof d !== 'string' || !d) return NaN;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(d) ? d.replace(' ', 'T') : `${d.replace(' ', 'T')}Z`;
  return Date.parse(iso);
}

interface MailboxMessage {
  message_id?: string; date?: string; responder?: string; from_email?: string[]; content?: string; html_content?: string; draft?: boolean;
}
const threadMessages = (t: any): MailboxMessage[] => {
  const m = t?.messages;
  if (Array.isArray(m)) return m;
  if (m && Array.isArray(m.messages)) return m.messages;
  return [];
};
const htmlToText = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();

/** Prospect messages in a mailbox-search thread (not ours, not drafts), oldest first. */
export function prospectMessages(t: any, ourMailbox: string | null, prospectEmail: string): MailboxMessage[] {
  const mine = ourMailbox?.toLowerCase() ?? '';
  return threadMessages(t)
    .filter((m) => !m.draft)
    .filter((m) => {
      const from = (m.from_email ?? []).map((x) => String(x).toLowerCase());
      if (mine && from.includes(mine)) return false;
      if (from.length) return from.includes(prospectEmail);
      return String(m.responder ?? '').toUpperCase() !== 'USER';
    })
    .sort((a, b) => parseG8Date(a.date) - parseG8Date(b.date));
}

export async function pollMailbox(workspaceId: UUID, mailbox: string, watched: WatchedLead[]): Promise<{ checked: number; emitted: number }> {
  if (!watched.length) return { checked: 0, emitted: 0 };
  const since = Math.min(...watched.map((w) => w.since));
  const r = await g8.post('/inbox/emails/search?page=1&page_size=50', {
    mailboxes: [mailbox], search_emails: [...new Set(watched.map((w) => w.email))].slice(0, 100),
    updated_after: new Date(since - 60_000).toISOString(), sort_by: 'last_message_at', sort_order: 'desc',
  });
  const items: any[] = r?.data?.items ?? [];
  const byEmail = new Map(watched.map((w) => [w.email, w]));
  let emitted = 0;
  for (const t of items) {
    const contactEmail = typeof t.contact?.email === 'string' ? t.contact.email.toLowerCase() : null;
    const w = (contactEmail && byEmail.get(contactEmail))
      ?? watched.find((x) => threadMessages(t).some((m) => (m.from_email ?? []).map((e) => String(e).toLowerCase()).includes(x.email)));
    if (!w) continue;
    const msgs = prospectMessages(t, mailbox, w.email).filter((m) => parseG8Date(m.date) >= w.since - 60_000);
    if (!msgs.length) continue;
    // Newest unseen message wins; older unseen ones are claimed silently so they never replay.
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const text = stripQuoted(m.content?.trim() ? m.content : htmlToText(m.html_content ?? ''));
      const data: JsonObject = {
        reply_id: String(t.id), message_id: m.message_id ?? String(m.date ?? ''), contact_id: t.contact?.id != null ? String(t.contact.id) : w.g8ContactId,
        email: w.email, sequence_id: w.g8SequenceId, reply_subject: t.subject ?? null, replied_at: new Date(parseG8Date(m.date)).toISOString(),
        reply_text: text, channel: 'email', mailbox_thread: true, _source: 'poll',
      };
      const id = await claimInbound({ workspaceId, source: 'graph8', eventType: REPLY_TYPE, dedupeKey: dedupeKey(REPLY_TYPE, data), payload: data });
      if (!id || i !== msgs.length - 1) continue;
      emitted++;
      bus.emit('graph8.event', { type: REPLY_TYPE, payload: { ...data, _inbound_event_id: id }, inboundEventId: id, workspaceId });
    }
  }
  return { checked: items.length, emitted };
}

const eventTypeFor = (t: InboxThread) =>
  t.channel?.toLowerCase() === 'linkedin' ? 'engagement.linkedin_reply_received'
    : t.channel?.toLowerCase() === 'sms' ? 'engagement.sms_replied' : REPLY_TYPE;

/** Legacy path: graph8-sequencer threads via GET /inbox?sequence_id (empty in this org today). */
async function pollSequenceInbox(workspaceId: UUID, ours: string[]): Promise<{ checked: number; emitted: number }> {
  const seqs = await liveSequences(workspaceId);
  let checked = 0; let emitted = 0;
  for (const seq of seqs) {
    let threads: InboxThread[] = [];
    try { threads = await listThreads({ sequence_id: String(seq.g8_sequence_id) }); } catch { continue; }
    const since = seq.launched_at ? Date.parse(seq.launched_at) : 0;
    for (const t of threads) {
      checked++;
      const email = threadContactEmail(t);
      const msg = latestInbound(t, ours, email);
      if (!msg) continue;
      if (since && msg.date && Date.parse(msg.date) < since) continue;
      const type = eventTypeFor(t);
      const data: JsonObject = {
        reply_id: t.id, message_id: msg.message_id ?? msg.date ?? null, contact_id: threadContactId(t), email,
        sequence_id: String(seq.g8_sequence_id), reply_subject: t.subject ?? null, replied_at: msg.date ?? null,
        channel: t.channel ?? 'email', _source: 'poll',
      };
      const id = await claimInbound({ workspaceId, source: 'graph8', eventType: type, dedupeKey: dedupeKey(type, data), payload: data });
      if (!id) continue;
      emitted++;
      bus.emit('graph8.event', { type, payload: { ...data, _inbound_event_id: id }, inboundEventId: id, workspaceId });
    }
  }
  return { checked, emitted };
}

export async function pollInboxOnce(workspaceId: UUID): Promise<{ checked: number; emitted: number }> {
  let mailbox: string | null = null;
  try { mailbox = (await store.settings(workspaceId)).g8_mailbox_email ?? null; } catch { /* ignore */ }
  if (!mailbox) {
    try { const r = await g8.get('/inbox/mailboxes'); const l: any[] = r?.data?.items ?? r?.data ?? []; mailbox = l[0]?.email ?? null; } catch { /* ignore */ }
  }
  const total = { checked: 0, emitted: 0 };
  if (mailbox) {
    try {
      const r = await pollMailbox(workspaceId, mailbox, await watchedLeads(workspaceId));
      total.checked += r.checked; total.emitted += r.emitted;
    } catch (e) {
      try { log.warn('inbox_poll mailbox search failed', { error: (e as Error).message }); } catch { /* ignore */ }
    }
  }
  try {
    const r = await pollSequenceInbox(workspaceId, mailbox ? [mailbox] : []);
    total.checked += r.checked; total.emitted += r.emitted;
  } catch { /* legacy path is best-effort */ }
  return total;
}

let registered = false;
let running = false;
/** Idempotent. Called when the Zara brain module loads. */
export function registerInboxPoll(): void {
  if (registered) return;
  registered = true;
  bus.on('cron.tick', async (e) => {
    if (e.name !== 'inbox_poll' || running) return;
    running = true;
    try {
      const r = await pollInboxOnce(env.WORKSPACE_ID);
      if (r.emitted) log.info('inbox_poll: new replies', r);
    } catch (err) {
      try { log.warn('inbox_poll failed', { error: (err as Error).message }); } catch { /* stub log */ }
    } finally {
      running = false;
    }
  });
}
