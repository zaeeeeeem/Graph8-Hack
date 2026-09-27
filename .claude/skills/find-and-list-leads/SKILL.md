---
name: find-and-list-leads
description: Find ICP-matching leads and companies in graph8's open B2B data index and save them to a CRM list. Use when the user wants new prospects, a target list, or contacts at specific kinds of companies.
---

# Find and List Leads

Turn a plain-language ICP description ("VPs of Sales at US SaaS companies, 50-500 employees") into a saved, named CRM list in graph8, using free search previews to iterate before anything is saved.

## When to use

- "Find me leads / prospects / contacts who..."
- "Build a list of <titles> at <kind of company>"
- "Who could we sell to in <industry / region>?"

Not for enriching contacts you already have (use `enrich-stale-contacts`) or launching outreach (use `launch-outbound-sequence` after this).

## Prerequisites

- Connected to the graph8 MCP with an active org. If unsure, call `g8_current_org` once and confirm the org with the user.
- If any tool below is missing from your tool list, activate it first: `g8_tool_search(tool_names=["g8_find_contacts", "g8_find_companies", "g8_create_list", "g8_add_to_list"])`. If your client does not refresh tools mid-session, call them through `g8_execute`.

## Steps

1. **Pin down the ICP.** Extract titles, industries, locations, company size, and any keywords from the user's request. If two or more of these are missing, ask one compact clarifying question; do not fire a vague search.
2. **Preview cheaply.** Call `g8_find_contacts` with the filters and a small page size (10-25). Previews are free. Read the results critically: do titles and companies actually match the intent?
3. **Iterate with the user.** Show 3-5 sample rows and the total match count. Refine filters until the user says the sample looks right. For account-first motions, use `g8_find_companies` to validate the company universe before drilling into people.
4. **Confirm before saving.** State exactly what will happen: "Save N contacts into a new list called <name>?" Saving is the write step; get explicit approval, and confirm whether saving consumes credits on the user's plan before proceeding at volume.
5. **Save.** Create the list with `g8_create_list` (clear, dated name like `SaaS VP Sales - US - 2026-07`), then add the approved contacts with `g8_add_to_list`.
6. **Report and hand off.** Return the list name, id, and count. Suggest the natural next skills: `enrich-stale-contacts` for missing emails/phones, or `launch-outbound-sequence` to start outreach.

## Example prompts

- "Find 200 heads of RevOps at B2B SaaS companies in the US and save them as a list."
- "Build me a target list of construction companies in Texas with 100+ employees, then find their owners."
- "Who are the CMOs at companies similar to Acme? Save the good ones."

## Troubleshooting

- **Zero or weird results:** loosen one filter at a time (drop seniority before dropping title, widen geography last). Titles vary; try synonyms ("Head of", "Director", "VP").
- **Tool not visible:** run `g8_tool_search("prospecting")` and retry, or use `g8_execute`.
- **Huge match counts (100k+):** narrow before saving; nobody sequences 100k contacts. Propose a tiered list instead.
