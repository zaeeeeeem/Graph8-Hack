# Slack and Integrations

## Model: Slack contributes tools, not a second task system

Core rule, stated explicitly: **"Slack contributes provider tools and a bundled skill; it does not introduce another task lifecycle."** Task creation, assignment, approval, completion all stay normal Paperclip operations triggered via mention. — `doc/connections/SLACK-TASK-TOOLS.md`

- A linked person `@mentions` the bot in Slack; the bot reads the thread, summarizes decisions, creates follow-up tasks.
- Every Slack message/DM/thread the bot can act in is bound to: company, endpoint (a specific bot connection), assigned agent, task, run, and the accepted linked Slack identity of the requester. Slack-origin work stays bound to its originating endpoint (agents don't "borrow" another connection's identity).
- Handled as one of 7 `ChatProvider`s in a shared, provider-neutral contract: `slack | github | discord | microsoft-teams | telegram | agentmail | imessage-photon` — `packages/shared/src/types/chat-channels.ts:2-11`. Slack is not special-cased architecturally; it's one adapter in a generic chat-channels subsystem (`server/src/services/chat-channels.ts`, `server/src/services/chat-slack-session-outbox.ts`, `server/src/services/connectors/slack-*.ts`).
- `ChatEndpointStatus`: `draft | verifying | active | paused | attention | revoked | archived` — same generic status vocabulary as everything else in the app.

## Channel/membership permissioning

- **"Allowed Channels controls responses and writes, not reads."** Inviting the bot to a channel makes it readable; newly-invited channels start **enabled** for responses; a person can later disable responses while keeping read access.
- Full workspace members can read public channels the bot is in; guests/private channels/Slack Connect require verified requester membership; membership checks fail closed.
- New channel discovery triggers off Slack's `app_mention` event — the bot processes the message that prompted the invite, it does not scan/replay channel history.
- Private-source markers: content read from a private channel/DM is tagged and can only be republished back into that same private channel or the requester's own DM (no cross-channel leak of private research).

## Tools and governed actions

- Tool/scope matrix lives in `packages/shared/src/slack-tools.ts` — reviewed, closed set (no arbitrary Slack API executor, no user impersonation, no workspace-admin tool).
- Categories: Discovery (channels/members/emoji), Reading (paginated history/threads, inline text files ≤256KiB), Search (bounded, channel+text+author+time), Collaboration (bot messages/replies/edits, uploads ≤20MiB, reactions, pins, bookmarks, topics), Documents (canvas, bot-owned lists).
- **Governed actions requiring approval**: deleting the bot's own messages, deleting bookmarks, creating channels, inviting people, granting list access. New channels created by the bot stay disabled until a person enables them.
- Delivery: idempotency keys scoped to company+connection+task+requester; rate-limited posts retry with the same key after `Retry-After`; uncertain delivery outcomes are never blindly resent (`slack_delivery` reconciles by client message ID / file ID).

## Persona / identity pattern

- The bot posts as itself (single Slack app/bot identity per connection) — no evidence of a "post-as-different-persona-per-agent" pattern like custom icon/name per agent message in the Slack docs read. Distinguishing which Paperclip agent is speaking happens inside message content/threading, not via Slack `chat:write.customize` per-agent identity. **This is a gap vs. our plan** (`docs/IDEA.md` wants 5 distinct personas — Head of Sales, Scout, Researcher, SDR, Closer — each posting with their own name/icon), which our Slack Bolt code (`postAs(agent, channel, text, thread?)`) already accounts for as something we build ourselves.
- Human replies on a Slack-linked task are mirrored back labeled with **"via Paperclip"** and the author's display name — a pattern worth reusing for founder replies routed through our portal.

## Command surface

- No `/slash-command` catalog documented in `doc/connections/SLACK-TASK-TOOLS.md`; interaction model is `@mention` → agent reads thread → acts, plus a "Board-send composer" that starts work via an idempotent wakeup outbox (a UI-triggered send, not literally a Slack command).
- Scheduled/recurring Slack posts (e.g. our daily standup) are **not** a Slack-specific timer — they ride on ordinary Paperclip **routines**; the routine's result is sent to Slack explicitly through the post tool. Direct precedent for our `/sales-standup` and daily 9:00 standup: model it as a routine, not custom cron+Slack code.

## Other channels (non-Slack)

Same generic `chat-channels` subsystem also implements, per `server/src/services/chat-channels.ts` imports and `CHAT_PROVIDERS`:
- **GitHub** — PR/issue chat review bot (`chat-github-*.ts` services), reacts to review events, posts checks.
- **Microsoft Teams** — `provider: "microsoft-teams"` type in `packages/shared/src/types/chat-channels.ts:99`.
- **Discord**, **Telegram** — app-definitions in `packages/shared/src/app-definitions/` (e.g. Discord needs "Message Content intent"; Telegram has its own guidance — see `app-definitions.test.ts:391-424`).
- **AgentMail** — email-as-a-channel provider (`doc/connections/AGENTMAIL.md`).
- **imessage-photon** — iMessage via a "Photon" bridge (`server/src/services/photon/*`), including HEIF image handling and structured question/answer flows (`parsePhotonQuestionAnswer`).
- `doc/CHANNELS.md` is unrelated — it documents npm/Docker **release** channels (stable/beta/nightly/canary), not notification channels. Do not confuse the two despite the filename.

## Relevance to our build

| Paperclip pattern | Steal for us | Effort |
|---|---|---|
| Chat is "tools + skill" bolted onto the existing task engine, one provider-neutral contract (`ChatProvider`) for Slack/Teams/Discord/etc. | Not needed at our scale — we're Slack-only — but confirms our simpler "Slack Bolt + postAs()" approach is the right-sized version of this pattern, not under-building | — |
| Governed-action allowlist (channel creation, invites, deletes need approval) | Add an explicit small allowlist of "risky" Slack bot actions our agents must route through Head of Sales/founder approval (e.g. sending to a brand-new contact, creating a channel) | S |
| Scheduled Slack output rides on generic routines, not bespoke cron | Confirms building `/sales-standup` as a scheduled job that calls the same "post as agent" function used for ad hoc updates, not a separate code path | S |
| `app_mention`-triggered work, not history scraping | For `/hire-sales` and future mentions, only act on the live event, never backfill from channel history | S |
| Human replies mirrored with "via Paperclip" + author name | Mirror founder Slack replies / approvals back into the relevant thread labeled clearly as founder input vs. agent output | S |
