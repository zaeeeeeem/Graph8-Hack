/**
 * Z-T1 get_reply — graph8 inbox reads.
 * Verified 07:10 PKT: GET /inbox {data: InboxThreadResponse[], pagination} with filters channel/sequence_id/status/tag/page/page_size;
 * GET /inbox/{reply_id}?channel= → {data: {id, channel, subject, contact{name,email,company…}, messages[{message_id, from_address,
 * to_addresses, content, responder, date, is_draft}], status, created_at, updated_at}}.
 */
import { g8 } from '../../lib/g8';
import { stripQuoted } from './pii';

export interface InboxMessage {
  message_id?: string | null; from_address?: string | null; to_addresses?: string[]; content?: string | null;
  responder?: string | null; date?: string | null; is_draft?: boolean;
}
export interface InboxThread {
  id: string; channel: string; subject?: string | null;
  contact?: Record<string, any> | null; messages?: InboxMessage[]; status?: string | null;
  created_at?: string | null; updated_at?: string | null;
}

const unwrapData = <T>(r: any): T => (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;

export async function getThread(replyId: string, channel?: string): Promise<InboxThread | null> {
  try {
    return unwrapData<InboxThread>(await g8.get(`/inbox/${encodeURIComponent(replyId)}`, channel ? { channel } : undefined));
  } catch {
    return null;
  }
}

export async function listThreads(q: { sequence_id?: string; channel?: string; page_size?: number; page?: number }): Promise<InboxThread[]> {
  const r = await g8.get('/inbox', { page_size: 50, ...q });
  const d = unwrapData<InboxThread[]>(r);
  return Array.isArray(d) ? d : [];
}

export const threadContactId = (t: InboxThread): string | null => {
  const c = t.contact ?? {};
  const v = c.id ?? c.contact_id ?? c.person_id;
  return v === undefined || v === null ? null : String(v);
};
export const threadContactEmail = (t: InboxThread): string | null => {
  const e = t.contact?.email;
  return typeof e === 'string' && e ? e.toLowerCase() : null;
};

/** Find the thread for a webhook reply (webhooks carry no thread id). Most recently updated match wins. */
export async function findThread(q: { sequenceId?: string | null; contactId?: string | null; email?: string | null; channel?: string }): Promise<InboxThread | null> {
  const tries: Array<Record<string, any>> = [];
  if (q.sequenceId) tries.push({ sequence_id: q.sequenceId, channel: q.channel });
  tries.push({ channel: q.channel });
  const email = q.email?.toLowerCase() ?? null;
  for (const t of tries) {
    let threads: InboxThread[] = [];
    try { threads = await listThreads(t); } catch { continue; }
    const hits = threads.filter((th) =>
      (q.contactId && threadContactId(th) === String(q.contactId)) || (email && threadContactEmail(th) === email)
      || (email && th.messages?.some((m) => m.from_address?.toLowerCase() === email)));
    if (hits.length) {
      hits.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
      return hits[0];
    }
  }
  return null;
}

/**
 * The prospect's latest message in a thread: last non-draft message not sent from one of our addresses
 * (prefers a message from the contact's own address when known).
 */
export function latestInbound(t: InboxThread, ours: string[] = [], contactEmail?: string | null): InboxMessage | null {
  const mine = new Set(ours.filter(Boolean).map((s) => s.toLowerCase()));
  const msgs = (t.messages ?? []).filter((m) => !m.is_draft && (m.content ?? '').trim());
  const sorted = [...msgs].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  const contact = contactEmail?.toLowerCase() ?? null;
  const inbound = sorted.filter((m) => {
    const from = m.from_address?.toLowerCase();
    if (from && mine.has(from)) return false;
    if (contact && from) return from === contact;
    const r = (m.responder ?? '').toLowerCase();
    return !['user', 'agent', 'ai', 'sender', 'us', 'self', 'outbound'].includes(r);
  });
  return inbound[inbound.length - 1] ?? null;
}

export const replyText = (m: InboxMessage | null): string => stripQuoted(m?.content ?? '');
