/**
 * Inbox polling backup (Z8 / BUILD-PLAN C15): on `cron.tick inbox_poll` (15 s) list GET /inbox per live sequence of ours,
 * take the prospect's latest message per thread, gate through inbound_events.dedupe_key (same scheme as the webhook,
 * see normalize.dedupeKey) and emit `graph8.event`. Threads older than the sequence launch are ignored so rehearsal
 * replies don't retrigger.
 */
import { bus } from '../lib/bus';
import { env } from '../lib/env';
import { log } from '../lib/log';
import { store } from '../lib/store';
import type { JsonObject, UUID } from '../../../shared/types';
import { claimInbound, liveSequences } from '../agents/zara/db';
import { latestInbound, listThreads, threadContactEmail, threadContactId, type InboxThread } from '../agents/zara/inbox';
import { dedupeKey } from './normalize';

const eventTypeFor = (t: InboxThread) =>
  t.channel?.toLowerCase() === 'linkedin' ? 'engagement.linkedin_reply_received'
    : t.channel?.toLowerCase() === 'sms' ? 'engagement.sms_replied' : 'engagement.email_replied';

export async function pollInboxOnce(workspaceId: UUID): Promise<{ checked: number; emitted: number }> {
  const seqs = await liveSequences(workspaceId);
  if (!seqs.length) return { checked: 0, emitted: 0 };
  let ours: string[] = [];
  try { const s = await store.settings(workspaceId); ours = [s.g8_mailbox_email ?? ''].filter(Boolean); } catch { /* ignore */ }
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
