---
name: prioritize-hot-accounts-from-signals
description: Turn recent website-visitor and buyer-intent signals into a prioritized, saveable outreach list. Use when the user wants to know who is showing interest right now and act on it.
---

# Prioritize Hot Accounts from Signals

Convert raw intent exhaust (who visited which pages, how often, how recently) into a ranked shortlist of accounts and people worth contacting today, then save it as a list ready for outreach.

## When to use

- "Who's been on our site this week?"
- "Which accounts are showing buying intent?"
- "Turn our pricing-page visitors into a call list"

## Prerequisites

- graph8 tracking installed on the user's site (if no visitor data comes back, that is the first thing to check).
- Activate missing tools: `g8_tool_search("intent")`, or call via `g8_execute`.

## Steps

1. **Map the hot surfaces.** `g8_intent_pages_visitor_counts` over the recent window (default: last 7 days). High-intent pages rank above generic ones: pricing, demo, integrations, case studies beat the blog.
2. **Pull the visitors.** `g8_intent_page_visitors` for the high-intent pages. Note repeat visits and recency; a 3-visit pricing-page account today outranks a single blog hit last week.
3. **Score and rank.** Build a simple tiering and show it: Tier A (high-intent page, repeated, recent), Tier B (high-intent once), Tier C (everything else). Enrich account context with `g8_lookup_company` for the top tier so the user sees who these companies actually are.
4. **Confirm the save.** Propose saving Tier A (and optionally B) as a dated list, e.g. `Hot signals - pricing - 2026-07`. State counts and any credit cost of identity resolution before proceeding.
5. **Save.** `g8_create_list` + `g8_add_to_list` for the approved tier(s).
6. **Hand off with urgency.** Signals decay in days. Suggest `launch-outbound-sequence` (signal-referencing copy converts better: "saw your team evaluating integrations") or `book-meeting-from-hot-lead` for Tier A accounts with a known champion.

## Example prompts

- "Who visited our pricing page this week? Make me a call list."
- "Rank the accounts showing intent and save the top 20."
- "Any repeat visitors from target accounts in the last 3 days?"

## Troubleshooting

- **No visitor data:** tracking is likely not installed or not firing; point the user to the tracking install flow in graph8 (ask the agent to load the `installing-tracking` playbook via `g8_load_playbook`).
- **Visitors resolve to ISPs / noise:** filter to identified companies only, and say plainly that anonymous traffic was excluded.
- **Tool not visible:** `g8_tool_search("intent")` then retry.
