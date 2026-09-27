---
name: triage-and-reply-inbox
description: Triage the graph8 multi-channel inbox (email, SMS, LinkedIn), classify what needs attention, draft on-tone replies, and send only after user review. Use when the user wants to work through replies fast.
---

# Triage and Reply Inbox

Work through the graph8 AI inbox the way a great SDR would: surface what matters (positive replies, questions, objections), skip the noise (OOO, bounces), draft replies in the thread's tone, and send only what the user has seen and approved.

## When to use

- "What's in my inbox?" / "Any replies I need to handle?"
- "Draft responses to the positive replies"
- "Answer this thread"

## Prerequisites

- Activate missing tools: `g8_tool_search("inbox")`, or call via `g8_execute`.

## Steps

1. **Pull the queue.** `g8_list_inbox` filtered to unhandled/unread items. Do not dump the raw list; classify it.
2. **Triage into buckets.** Positive / question / objection / not-now / unsubscribe / noise (OOO, bounces). Present counts per bucket and the 3-5 threads that most deserve attention first (positive intent beats recency).
3. **Read before drafting.** For each thread the user picks, load the full context with `g8_get_reply`. Answer what was actually asked; reference specifics from their message.
4. **Draft.** Use `g8_get_reply_draft` for an AI draft, then tighten it: shorter, concrete next step, match the thread's formality. One clear CTA.
5. **The send gate (hard rule).** Show the final draft verbatim. Send with `g8_send_reply` only after explicit approval of THAT text. Batch approval ("send all 5 as shown") is fine; silent sending is not.
6. **Keep the queue clean.** Tag outcomes with `g8_tag_reply` (e.g. meeting-requested, objection-pricing) and route threads that need a human owner with `g8_assign_reply`. Handle unsubscribe requests immediately and flag them to the user.
7. **Summarize.** Replies sent, meetings in motion, threads assigned, and anything that needs the user personally.

## Example prompts

- "Triage my inbox and draft replies to anyone who sounded interested."
- "Handle the pricing questions from this week's campaign replies."
- "Which replies from the launch campaign need me?"

## Troubleshooting

- **Ambiguous intent in a thread:** classify conservatively (question, not positive) and let the user promote it.
- **User asks for full autopilot sending:** decline politely; the review gate is a safety feature of this skill. Offer batch review instead. For durable automation, point them at `auto-reply-workflow` which builds a proper reviewed workflow.
- **Tool not visible:** `g8_tool_search("inbox")` then retry.
