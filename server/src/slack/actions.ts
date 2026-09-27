/**
 * Buttons: approval.approve|edit|skip and generic act.<name> -> bus 'slack.action'. Link buttons (link.*) are acked only.
 */
import type { App, BlockAction, ButtonAction } from '@slack/bolt';
import { bus } from '../lib/bus';
import type { Block } from '../contracts';
import { decidedCardBlocks, decisionLine } from './blocks';
import { persona, workspaceId } from './personas';

export function registerActions(app: App) {
  const ayesha = persona('head_of_sales');

  // URL buttons still send an interaction; ack so Slack shows no warning.
  app.action(/^link\./, async ({ ack }) => {
    await ack();
  });

  app.action<BlockAction<ButtonAction>>(/^(approval\.(approve|edit|skip)|act\..+)$/, async ({ ack, body, action, client }) => {
    await ack();
    const channel = body.channel?.id ?? body.container?.channel_id ?? '';
    const message = body.message as { ts: string; thread_ts?: string; text?: string; blocks?: Block[] } | undefined;
    const messageTs = message?.ts ?? body.container?.message_ts;
    const threadTs = message?.thread_ts ?? messageTs;
    const userId = body.user.id;
    const value = action.value ?? '';

    bus.emit('slack.action', {
      actionId: action.action_id,
      value,
      ctx: { workspaceId: workspaceId(), userId, channel, threadTs, messageTs },
    });

    try {
      if ((action.action_id === 'approval.approve' || action.action_id === 'approval.skip') && message && messageTs) {
        const approveBtn = (message.blocks ?? [])
          .flatMap((b) => ((b as any).elements ?? []) as any[])
          .find((e) => e?.action_id === 'approval.approve');
        const line = decisionLine(action.action_id === 'approval.approve' ? 'approve' : 'skip', userId, approveBtn?.text?.text);
        await client.chat.update({
          channel,
          ts: messageTs,
          text: `${message.text ?? 'Approval'} — ${line.replace(/<@[^>]+>/, 'founder')}`,
          blocks: decidedCardBlocks(message.blocks ?? [], line) as any,
        });
      } else if (action.action_id === 'approval.edit' && messageTs) {
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: 'Tell me what to change 👇',
          username: ayesha.username,
          icon_emoji: ayesha.icon_emoji,
        });
      }
    } catch (err: any) {
      console.error('[slack] action follow-up failed:', err?.data?.error ?? err?.message ?? err);
    }
  });
}
