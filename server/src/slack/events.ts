/**
 * Founder messages -> bus 'slack.message': @mention, DM, or reply in a thread the bot started.
 * Ignores bot messages and subtypes (edits, joins, …). Adds a 👀 reaction as the instant ack (D7).
 */
import type { App } from '@slack/bolt';
import { bus } from '../lib/bus';
import { workspaceId } from './personas';

/** Thread parents we posted (in-memory; fallback check is parent_user_id === bot user). */
const ourThreads = new Set<string>();
export function rememberThread(ts: string) {
  ourThreads.add(ts);
  if (ourThreads.size > 5000) ourThreads.delete(ourThreads.values().next().value as string);
}

function stripMention(text: string, botUserId?: string) {
  return (botUserId ? text.replaceAll(`<@${botUserId}>`, '') : text).trim();
}

export async function registerEvents(app: App) {
  const auth = await app.client.auth.test();
  const botUserId = auth.user_id;
  const botId = (auth as any).bot_id as string | undefined;

  const react = (channel: string, ts: string) =>
    app.client.reactions.add({ channel, timestamp: ts, name: 'eyes' }).catch(() => undefined);

  app.event('app_mention', async ({ event }) => {
    if ((event as any).bot_id || (event as any).subtype) return;
    await react(event.channel, event.ts);
    bus.emit('slack.message', {
      kind: 'mention',
      text: stripMention(event.text ?? '', botUserId),
      ctx: { workspaceId: workspaceId(), userId: event.user ?? '', channel: event.channel, threadTs: event.thread_ts ?? event.ts, messageTs: event.ts },
    });
  });

  app.message(async ({ message }) => {
    const m = message as any;
    if (m.subtype || m.bot_id || !m.user || m.user === botUserId || (botId && m.bot_id === botId)) return;
    const text: string = m.text ?? '';
    const isDm = m.channel_type === 'im';
    // Channel messages that @mention us are handled by app_mention (avoid double events).
    if (!isDm && botUserId && text.includes(`<@${botUserId}>`)) return;

    const inThread = m.thread_ts && m.thread_ts !== m.ts;
    const ourThread = inThread && (ourThreads.has(m.thread_ts) || m.parent_user_id === botUserId);

    let kind: 'dm' | 'thread_reply';
    if (isDm) kind = 'dm';
    else if (ourThread) kind = 'thread_reply';
    else return;

    await react(m.channel, m.ts);
    bus.emit('slack.message', {
      kind,
      text: stripMention(text, botUserId),
      ctx: { workspaceId: workspaceId(), userId: m.user, channel: m.channel, threadTs: inThread ? m.thread_ts : kind === 'dm' ? undefined : m.ts, messageTs: m.ts },
    });
  });
}
