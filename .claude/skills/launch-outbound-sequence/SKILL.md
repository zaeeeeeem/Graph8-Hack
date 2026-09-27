---
name: launch-outbound-sequence
description: Create, review, and launch a multi-step graph8 outbound email campaign for a saved list, grounded in the org's brand context, with explicit launch confirmation. Use when the user wants to start outreach.
---

# Launch an Outbound Sequence

Take a saved list from "contacts sitting in the CRM" to "live outbound campaign": draft on-brand messaging, build the step sequence, attach the audience, sanity-check mailboxes, and launch with the user's explicit sign-off.

## When to use

- "Start outreach to this list"
- "Build and launch a cold email campaign for..."
- "Sequence these leads"

Not for one-off replies (use `triage-and-reply-inbox`) and not for finding the audience (use `find-and-list-leads` first).

## Prerequisites

- A saved list with enriched (emailable) contacts. If emails are missing, run `enrich-stale-contacts` first.
- Warmed mailboxes connected to the org.
- Activate missing tools: `g8_tool_search("campaign")`, or call via `g8_execute`.

## Steps

1. **Load brand context first.** Call `g8_gtm_get_global_context` and ground every draft in the org's actual value props, tone, and ICP language. Never write generic cold email boilerplate when real brand context exists.
2. **Create the campaign shell.** `g8_gtm_create_campaign` with a clear internal name and objective. Do NOT launch yet; a created campaign is inert.
3. **Build the sequence.** Draft 3-5 steps (day 0 opener, day 3 bump, day 7 angle change, day 12 breakup) and write them with `g8_gtm_update_campaign_sequence`. Keep emails short, specific, single-CTA. Read back the sequence with `g8_gtm_get_campaign_sequence` and show the user every step verbatim for edits.
4. **Attach the audience.** `g8_gtm_attach_audience` with the approved list. Confirm the final recipient count out loud.
5. **Check send capacity.** `g8_gtm_list_mailboxes`: verify connected mailboxes and warmup status. If capacity is below the audience size, tell the user the realistic daily send rate rather than pretending it will all go out at once.
6. **The launch gate (hard rule).** Summarize in one block: audience count, number of steps, mailboxes to be used, expected daily volume, and that launching sends real emails to real people and consumes credits. Ask: "Launch now?" Only on an explicit yes, call `g8_gtm_launch_campaign`. Never launch on an ambiguous "looks good".
7. **Confirm and monitor.** Report the campaign is live and suggest checking `g8_gtm_get_campaign_metrics` in a few days, and `triage-and-reply-inbox` for handling replies.

## Example prompts

- "Launch a 4-step cold email campaign to my 'RevOps leaders' list."
- "Write outreach for the Texas construction list using our brand voice, show me before sending."
- "Sequence the webinar no-shows with a soft follow-up."

## Troubleshooting

- **No mailboxes / cold mailboxes:** stop at step 5 and tell the user to connect or warm mailboxes; launching through cold mailboxes torches deliverability.
- **User wants to skip review:** still show the sequence summary; the launch gate is not optional.
- **Tool not visible:** campaign tools are mostly always-on; for any missing one, `g8_tool_search("campaign")`.
