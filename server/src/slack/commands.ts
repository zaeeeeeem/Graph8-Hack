/**
 * Slash commands: ack within 3 s, a quick visible reply from Ayesha, then bus 'slack.command'.
 */
import type { App } from '@slack/bolt';
import { bus } from '../lib/bus';
import { persona, workspaceId } from './personas';

/** "https://www.8x.social/" -> "8x.social" (display only; the raw text goes on the bus). */
export function displayDomain(text: string): string {
  return text.trim().split(/\s+/)[0]?.replace(/^<|>$/g, '').replace(/\|.*$/, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '') ?? '';
}

export function registerCommands(app: App) {
  const ayesha = persona('head_of_sales');

  const handle = (command: string, ackText: (text: string) => string | null, usage?: string) => {
    app.command(command, async ({ command: cmd, ack, client, respond }) => {
      await ack();
      const text = (cmd.text ?? '').trim();
      const reply = ackText(text);
      if (reply === null) {
        await respond({ response_type: 'ephemeral', text: usage ?? 'Usage unclear' }).catch(() => undefined);
        return;
      }
      let messageTs: string | undefined;
      try {
        const res = await client.chat.postMessage({ channel: cmd.channel_id, text: reply, username: ayesha.username, icon_emoji: ayesha.icon_emoji });
        messageTs = res.ts;
      } catch {
        // Bot not in this channel (e.g. someone else's DM) — fall back to an ephemeral reply.
        await respond({ response_type: 'ephemeral', text: reply }).catch(() => undefined);
      }
      bus.emit('slack.command', {
        command,
        text,
        ctx: { workspaceId: workspaceId(), userId: cmd.user_id, channel: cmd.channel_id, threadTs: messageTs, messageTs },
      });
    });
  };

  handle(
    '/hire-sales',
    (text) => (text ? `On it — hiring your team for ${displayDomain(text)} 👋` : null),
    'Give me your company site, e.g. `/hire-sales 8x.social`',
  );
  handle('/sales-standup', () => 'Chalo, pulling today’s standup… ☕');
}
