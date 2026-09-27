/**
 * src/lib/slack.ts — W1b. The only place that talks to Bolt / the Slack Web API.
 * Agents use `slack` (SlackPort); inbound Slack traffic becomes bus events (see src/slack/*).
 */
import { App, LogLevel } from '@slack/bolt';
import type { Block, Checklist, ChecklistItem, SlackPort } from '../contracts';
import type { AgentRole } from '../../../shared/types';
import { persona, requireSlackEnv, resolveChannel, slackEnv } from '../slack/personas';
import { approvalCardBlocks, checklistBlocks, checklistText, personaHeader, section } from '../slack/blocks';
import { registerCommands } from '../slack/commands';
import { registerActions } from '../slack/actions';
import { registerEvents, rememberThread } from '../slack/events';

const CHECKLIST_COALESCE_MS = 700;

let _app: App | null = null;
function app(): App {
  if (!_app) {
    _app = new App({
      token: requireSlackEnv('SLACK_BOT_TOKEN'),
      appToken: slackEnv('SLACK_APP_TOKEN'),
      socketMode: true,
      logLevel: LogLevel.WARN,
    });
  }
  return _app;
}

let started = false;

async function postAs(role: AgentRole, channel: 'team' | 'hq' | string, msg: { text: string; blocks?: Block[]; threadTs?: string }) {
  const p = persona(role);
  const res = await app().client.chat.postMessage({
    channel: resolveChannel(channel),
    text: msg.text,
    blocks: msg.blocks as any,
    thread_ts: msg.threadTs,
    username: p.username,
    icon_emoji: p.icon_emoji,
    unfurl_links: false,
    unfurl_media: false,
  });
  if (!res.ok || !res.ts || !res.channel) throw new Error(`chat.postMessage failed: ${res.error ?? 'unknown'}`);
  rememberThread(msg.threadTs ?? res.ts);
  return { ts: res.ts, channel: res.channel };
}

async function update(channel: string, ts: string, msg: { text: string; blocks?: Block[] }) {
  const res = await app().client.chat.update({ channel: resolveChannel(channel), ts, text: msg.text, blocks: msg.blocks as any });
  if (!res.ok) throw new Error(`chat.update failed: ${res.error ?? 'unknown'}`);
}

/** Live checklist: one message edited in place; bursts of set()/add() within 700 ms become one chat.update. */
async function checklist(role: AgentRole, channel: 'team' | 'hq' | string, title: string, items: ChecklistItem[], threadTs?: string): Promise<Checklist> {
  let curTitle = title;
  const cur: ChecklistItem[] = items.map((i) => ({ ...i }));
  const render = () => ({ text: checklistText(curTitle, cur), blocks: checklistBlocks(curTitle, cur) });
  const posted = await postAs(role, channel, { ...render(), threadTs });

  let timer: NodeJS.Timeout | null = null;
  let waiters: Array<() => void> = [];
  let chain: Promise<void> = Promise.resolve();
  const flush = () => {
    timer = null;
    const done = waiters;
    waiters = [];
    chain = chain
      .then(() => update(posted.channel, posted.ts, render()))
      .catch((err) => console.error('[slack] checklist update failed:', err?.data?.error ?? err?.message ?? err))
      .finally(() => done.forEach((r) => r()));
  };
  const schedule = () =>
    new Promise<void>((resolve) => {
      waiters.push(resolve);
      if (!timer) timer = setTimeout(flush, CHECKLIST_COALESCE_MS);
    });

  return {
    ts: posted.ts,
    channel: posted.channel,
    set(key, state, note) {
      const item = cur.find((i) => i.key === key);
      if (!item) return Promise.resolve();
      item.state = state;
      if (note !== undefined) item.note = note;
      return schedule();
    },
    add(item) {
      const i = cur.findIndex((x) => x.key === item.key);
      if (i >= 0) cur[i] = { ...item };
      else cur.push({ ...item });
      return schedule();
    },
    title(t) {
      curTitle = t;
      return schedule();
    },
  };
}

async function agentThread(role: AgentRole, title: string) {
  return postAs(role, 'team', { text: title, blocks: [section(`*${title}*`), personaHeader(role, 'updates in thread 👇')] });
}

async function approvalCard(role: AgentRole, a: { approvalId: string; title: string; blocks: Block[]; approveLabel?: string }) {
  return postAs(role, 'hq', { text: `Needs your call: ${a.title}`, blocks: approvalCardBlocks(role, a) });
}

async function dm(userId: string, msg: { text: string; blocks?: Block[] }) {
  const open = await app().client.conversations.open({ users: userId });
  const channel = open.channel?.id;
  if (!channel) throw new Error(`conversations.open failed: ${open.error ?? 'unknown'}`);
  await postAs('head_of_sales', channel, msg);
}

async function permalink(channel: string, ts: string) {
  const res = await app().client.chat.getPermalink({ channel: resolveChannel(channel), message_ts: ts });
  return res.permalink ?? '';
}

async function start() {
  if (started) return;
  if (slackEnv('SLACK_DISABLED') === '1' || slackEnv('SLACK_DISABLED') === 'true') {
    console.log('[slack] SLACK_DISABLED set — outbound posts only, no Socket Mode connection');
    return;
  }
  requireSlackEnv('SLACK_APP_TOKEN');
  const a = app();
  registerCommands(a);
  registerActions(a);
  await registerEvents(a);
  await a.start();
  started = true;
  console.log('[slack] Socket Mode connected');
}

export const slack: SlackPort = { postAs, update, checklist, agentThread, approvalCard, dm, permalink, start };

/** Close the Socket Mode connection (scripts / graceful shutdown). */
export async function stopSlack() {
  if (_app && started) await _app.stop();
  started = false;
}

/** Raw Web API client for scripts (e.g. cleanup). Agents must use `slack`. */
export function slackClient() {
  return app().client;
}
