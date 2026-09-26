---
name: call-review-and-followup
description: Review a graph8 dialer call's transcript and AI grading, extract commitments and objections, and create the follow-up tasks and notes so nothing drops. Use after sales calls or dialer sessions.
---

# Call Review and Follow-up

Turn a finished dialer call into accountability: what was said, how it went, what was promised, and the tasks that make the promises happen. Works for a single call or a whole dialer session review.

## When to use

- "How did my calls go today?"
- "Review the call with <contact> and set up follow-ups"
- "What did I promise on yesterday's calls?"

## Prerequisites

- Calls made through the graph8 dialer (transcripts and gradings exist only for recorded dialer calls).
- Activate missing tools: `g8_tool_search("voice")` or `g8_tool_search("dialer")`, or call via `g8_execute`.

## Steps

1. **Locate the call(s).** From the user's description (contact name, session, "today"), identify the call ids. If reviewing a session, list the calls and let the user pick, or sweep all connected calls.
2. **Read the transcript.** `g8_voice_get_call_transcript`. Extract, with timestamps where useful: commitments made by the rep ("I'll send pricing by Friday"), commitments made by the prospect ("I'll loop in my VP"), objections raised, and any dates/numbers mentioned.
3. **Read the grading.** `g8_voice_get_call_grading` for the AI assessment: talk ratio, discovery quality, objection handling. Pair each weak grade with a concrete moment from the transcript, not generic advice.
4. **Propose the follow-up plan.** A short list: tasks (with owners and due dates derived from what was actually said), and a call summary note for the contact record. Show it before writing anything.
5. **Write on approval.** `g8_create_task` per follow-up (due dates matching the commitments) and `g8_create_note` with the structured summary (outcome, objections, next step) on the contact.
6. **Coach briefly.** One or two specific, transcript-grounded improvements. Skip the lecture.

## Example prompts

- "Review my last call with Jane at Acme and set up the follow-ups."
- "Summarize today's dialer session: what went well, what did I promise?"
- "Pull the objections from this week's calls."

## Troubleshooting

- **No transcript found:** the call may not have connected or recording was off; check the session's call list before assuming data loss.
- **Grading missing but transcript exists:** grading can lag; review from the transcript alone and note the gap.
- **Tool not visible:** `g8_tool_search("dialer")` then retry.
