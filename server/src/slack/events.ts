/**
 * Founder messages -> bus 'slack.message': @mention, DM, reply in a thread the bot started, or a top-level message in
 * #sales-team / #sales-hq that addresses an agent by name ("Bilal, find 5 fintech CFOs", "hey Hira …").
 * Other plain channel chatter is ignored. Ignores bot messages and subtypes (edits, joins, …).
 * Adds a 👀 reaction as the instant ack (D7).
 */
import type { App } from '@slack/bolt';
import type { AgentRole } from '../../../shared/types';
import { bus } from '../lib/bus';
import { slackEnv, workspaceId } from './personas';

/** Thread parents we posted (in-memory; fallback check is parent_user_id === bot user). */
const ourThreads = new Set<string>();
export function rememberThread(ts: string) {
  ourThreads.add(ts);
  if (ourThreads.size > 5000) ourThreads.delete(ourThreads.values().next().value as string);
}

/** Founder message ts → agent addressed in it, so un-named follow-ups in that thread stay with the same agent. */
const threadRoles = new Map<string, AgentRole>();
function rememberThreadRole(ts: string, role: AgentRole) {
  threadRoles.set(ts, role);
  if (threadRoles.size > 2000) threadRoles.delete(threadRoles.keys().next().value as string);
}

const NAME_ROLE: Record<string, AgentRole> = {
  ayesha: 'head_of_sales', bilal: 'scout', hira: 'researcher', usman: 'sdr', zara: 'closer',
};
const ADDRESS_RE = new RegExp(
  String.raw`^[\s>*_~]*(?:(?:hey|hi|hello|yo|ok|okay|oye|acha|salam|assalam[\s-]?o[\s-]?alaikum|thanks|thank you|dear)[\s,!.]+)?` +
  String.raw`(?:<@[A-Z0-9]+>[\s,]*)?@?(ayesha|bilal|hira|usman|zara)(?=$|[\s,:;!?.\-—–'’])`,
  'i',
);

/** Which agent a message addresses by name at its start ("Bilal, …", "hey Hira …", "@Zara any replies?"). */
export function addressedRole(text: string): AgentRole | undefined {
  const m = ADDRESS_RE.exec(text ?? '');
  return m ? NAME_ROLE[m[1].toLowerCase()] : undefined;
}

function stripMention(text: string, botUserId?: string) {
  return (botUserId ? text.replaceAll(`<@${botUserId}>`, '') : text).trim();
}

export async function registerEvents(app: App) {
  const auth = await app.client.auth.test();
  const botUserId = auth.user_id;
  const botId = (auth as any).bot_id as string | undefined;
  const namedChannels = new Set([slackEnv('SLACK_CHANNEL_TEAM'), slackEnv('SLACK_CHANNEL_HQ')].filter(Boolean) as string[]);

  const react = (channel: string, ts: string) =>
    app.client.reactions.add({ channel, timestamp: ts, name: 'eyes' }).catch(() => undefined);

  app.event('app_mention', async ({ event }) => {
    if ((event as any).bot_id || (event as any).subtype) return;
    await react(event.channel, event.ts);
    const text = stripMention(event.text ?? '', botUserId);
    const addressed = addressedRole(text) ?? (event.thread_ts ? threadRoles.get(event.thread_ts) : undefined);
    if (addressed && !event.thread_ts) rememberThreadRole(event.ts, addressed);
    bus.emit('slack.message', {
      kind: 'mention',
      text,
      addressed,
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
    const ourThread = inThread && (ourThreads.has(m.thread_ts) || threadRoles.has(m.thread_ts) || m.parent_user_id === botUserId);
    const named = addressedRole(text);

    let kind: 'dm' | 'mention' | 'thread_reply';
    if (isDm) kind = 'dm';
    else if (ourThread) kind = 'thread_reply';
    else if (!inThread && named && namedChannels.has(m.channel)) kind = 'mention';
    else return;

    const addressed = named ?? (inThread ? threadRoles.get(m.thread_ts) : undefined);
    if (kind === 'mention' && addressed) rememberThreadRole(m.ts, addressed);

    await react(m.channel, m.ts);
    bus.emit('slack.message', {
      kind,
      text: stripMention(text, botUserId),
      addressed,
      ctx: { workspaceId: workspaceId(), userId: m.user, channel: m.channel, threadTs: inThread ? m.thread_ts : kind === 'dm' ? undefined : m.ts, messageTs: m.ts },
    });
  });
}
