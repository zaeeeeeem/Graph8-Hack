/**
 * LinkedIn (L3) Slack cards. No PII: lead names only appear in drafts, never emails/phones/profile urls.
 */
import type { Block } from '../../contracts';
import { context, linkButton, section } from '../blocks';

/** Verified 2026-09-27 in Chrome: Profile → Connectors tab, LinkedIn card ("Sending account"). */
export const LINKEDIN_CONNECT_URL = 'https://app.graph8.com/profile?tab=connectors';

/** Connect card (D10: ask + continue). Link button only — no server round trip; the watcher flips it. */
export function linkedinConnectCard(opts: { touches?: number } = {}): { text: string; blocks: Block[] } {
  const touches = opts.touches ?? 2;
  const text = `LinkedIn isn't connected in graph8. Email starts now; ${touches} LinkedIn touches wait until you connect.`;
  return {
    text,
    blocks: [
      section(
        `⚠️ *LinkedIn isn't connected in graph8.*\n` +
        `Email outreach starts now. The ${touches} LinkedIn touches (day 1 connection request, day 6 message) are drafted per lead and wait ⏸ until a LinkedIn sender is connected.`,
      ),
      { type: 'actions', elements: [{ ...linkButton('Connect LinkedIn in graph8', LINKEDIN_CONNECT_URL, 'link.linkedin.connect'), style: 'primary' }] },
      context('Profile → Connectors → LinkedIn → Sending account. I check every minute and pick it up on my own.'),
    ],
  };
}

/** Card after the watcher sees a sender. Honest about graph8's API limit. */
export function linkedinConnectedCard(opts: { touches: number; sequences: number }): { text: string; blocks: Block[] } {
  const text = `LinkedIn connected — ${opts.touches} touches now live`;
  const where = opts.sequences
    ? `Marked live on ${opts.sequences} sequence${opts.sequences === 1 ? '' : 's'}.`
    : 'They go live on the next sequence.';
  return {
    text,
    blocks: [
      section(`✅ *${text}*\n${where}`),
      context("graph8's API doesn't accept LinkedIn steps yet, so we track them here and the per-lead drafts are ready to send from your LinkedIn sender in graph8."),
    ],
  };
}

/** Replacement for the original connect card once connected (buttons dropped). */
export function linkedinConnectDoneBlocks(): { text: string; blocks: Block[] } {
  return {
    text: 'LinkedIn connected in graph8',
    blocks: [section('✅ *LinkedIn is connected in graph8.*'), context('Picked up automatically by the connection watcher.')],
  };
}
