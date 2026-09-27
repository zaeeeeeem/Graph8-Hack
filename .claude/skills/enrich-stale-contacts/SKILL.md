---
name: enrich-stale-contacts
description: Waterfall-enrich contacts in a graph8 list that are missing emails, phone numbers, or LinkedIn URLs, with cost preview and job polling. Use when the user wants verified contact data filled in.
---

# Enrich Stale Contacts

Fill in missing emails, mobile numbers, and LinkedIn profiles for contacts the user already has, using graph8's enrichment waterfall (multiple providers tried in order until one returns verified data).

## When to use

- "Get emails / phone numbers for this list"
- "These contacts are missing data, fill them in"
- "Verify the emails on my Q3 list"

Not for finding brand-new contacts (use `find-and-list-leads` first).

## Prerequisites

- A target list (ask which list, or find it via `g8_get_lists`) or a clear filter for which contacts to enrich.
- Activate missing tools with `g8_tool_search(tool_names=["g8_enrich_contacts", "g8_get_enrichment_job"])`; use `g8_execute` if your client does not refresh the palette mid-session.

## Steps

1. **Scope the gap.** Identify the list via `g8_get_lists`, then use `g8_search_contacts` (filtered to the list) to count how many members are missing the data type the user cares about (email, phone, LinkedIn). Report the number.
2. **Preview the cost.** Enrichment charges credits per contact per data type. Before anything runs, tell the user: N contacts x data types = approximate credit cost, and ask for explicit approval. Never start an enrichment job without it.
3. **Start the job.** Call `g8_enrich_contacts` with the approved contact set and requested data types. Capture the returned job id.
4. **Poll, do not spam.** Check `g8_get_enrichment_job` with the job id at sensible intervals (start after 30-60 seconds; jobs are batched). Report progress in plain terms: completed / found / not found.
5. **Report yield honestly.** Waterfalls do not hit 100 percent. Summarize: how many got verified emails, how many phones, how many came up empty. Unfound contacts were still attempted; note whether the plan charges only on found data if the user asks.
6. **Hand off.** Suggest `launch-outbound-sequence` now that the list has reachable contacts, or `find-and-list-leads` to top up the list.

## Example prompts

- "Enrich my 'SaaS VP Sales' list with work emails."
- "Get mobile numbers for everyone on the webinar attendees list."
- "How many contacts in list X have no email? Fix that."

## Troubleshooting

- **Job seems stuck:** re-check `g8_get_enrichment_job` after a few minutes before declaring failure; large batches process in waves.
- **Low yield:** normal for stale or very senior audiences. Suggest retrying the misses with a different data type or accepting the yield.
- **Tool not visible:** `g8_tool_search("enrich")` then retry.
