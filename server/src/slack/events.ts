/**
 * Founder messages -> bus 'slack.message' (docs/CHAT-BANK.md "How the conversation works"):
 *   - DM, @mention, any top-level message in #sales-hq → Ayesha unless it names an agent ("Bilal, …", "hey Hira …").
 *   - #sales-team top-level → only when it names an agent.
 *   - Replies in our threads → the agent named, else the last agent named in that thread, else Ayesha.
 * Ignores bot messages and subtypes (edits, joins, …). Adds a 👀 reaction as the instant ack (D7).
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

  const react = (channel: string, ts: string) =>
    app.client.reactions.add({ channel, timestamp: ts, name: 'eyes' }).catch(() => undefined);

  app.event('app_mention', async ({ event }) => {
    if ((event as any).bot_id || (event as any).subtype) return;
    await react(event.channel, event.ts);
    const text = stripMention(event.text ?? '', botUserId);
    const named = addressedRole(text);
    const addressed = named ?? (event.thread_ts ? threadRoles.get(event.thread_ts) : undefined);
    if (named) rememberThreadRole(event.thread_ts ?? event.ts, named);
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
    // Channel messages that @mention us are handled by app_mention (avoid double events).
    if (m.channel_type !== 'im' && botUserId && text.includes(`<@${botUserId}>`)) return;
    const r = routeMessage({
      text, isDm: m.channel_type === 'im', channel: m.channel, ts: m.ts, threadTs: m.thread_ts, parentUserId: m.parent_user_id,
      botUserId, hqChannel: slackEnv('SLACK_CHANNEL_HQ'), teamChannel: slackEnv('SLACK_CHANNEL_TEAM'),
    });
    if (!r) return;
    await react(m.channel, m.ts);
    bus.emit('slack.message', {
      kind: r.kind,
      text: stripMention(text, botUserId),
      addressed: r.addressed,
      ctx: { workspaceId: workspaceId(), userId: m.user, channel: m.channel, threadTs: r.threadTs, messageTs: m.ts },
    });
  });
}

export interface RouteIn {
  text: string; isDm: boolean; channel: string; ts: string; threadTs?: string; parentUserId?: string;
  botUserId?: string; hqChannel?: string; teamChannel?: string;
}
export interface Route { kind: 'dm' | 'mention' | 'thread_reply'; addressed?: AgentRole; threadTs?: string }

/**
 * Pure routing decision (unit-tested). `addressed` undefined = Ayesha. Remembers the agent named in a thread so
 * un-named follow-ups ("what do you mean?") stay with whoever the founder last talked to there.
 */
export function routeMessage(m: RouteIn): Route | null {
  const inThread = !!m.threadTs && m.threadTs !== m.ts;
  const named = addressedRole(m.text);
  const inHq = !!m.hqChannel && m.channel === m.hqChannel;
  const inTeam = !!m.teamChannel && m.channel === m.teamChannel;
  const ourThread = inThread && (ourThreads.has(m.threadTs!) || threadRoles.has(m.threadTs!) || (!!m.botUserId && m.parentUserId === m.botUserId));

  let kind: Route['kind'];
  if (m.isDm) kind = inThread ? 'thread_reply' : 'dm';
  else if (ourThread) kind = 'thread_reply';
  else if (inThread && named && (inHq || inTeam)) kind = 'thread_reply';
  else if (!inThread && (inHq || (named && inTeam))) kind = 'mention';
  else return null;

  const addressed = named ?? (inThread ? threadRoles.get(m.threadTs!) : undefined);
  const threadKey = inThread ? m.threadTs! : m.ts;
  if (named && !m.isDm) rememberThreadRole(threadKey, named);
  else if (named && m.isDm && inThread) rememberThreadRole(threadKey, named);
  return { kind, addressed, threadTs: inThread ? m.threadTs : kind === 'dm' ? undefined : m.ts };
}

/** Tests only. */
export function _resetRouting() { ourThreads.clear(); threadRoles.clear(); }
