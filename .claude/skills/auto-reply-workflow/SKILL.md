---
name: auto-reply-workflow
description: Build a durable graph8 workflow that auto-drafts a follow-up whenever a campaign reply lands, using a custom LLM skill node, validated and shipped disabled-by-default for user review. Use when the user wants reply handling automated.
---

# Auto-Reply Workflow

Instead of triaging replies by hand every day, wire a durable graph8 workflow: reply lands -> LLM skill drafts a contextual follow-up -> draft is ready for review/send. Built conversationally, validated, and delivered DISABLED so the user flips it on deliberately.

Note on naming: this skill uses graph8's `g8_skill_*` tools, which author LLM/API skill records that workflow Action nodes execute. Those are a different thing from Skill Library entries like this file (instructions you install into your agent). This skill composes both worlds.

## When to use

- "Automatically draft follow-ups when someone replies"
- "Build a workflow that handles campaign replies"
- "Stop making me triage manually every morning"

For one-off manual triage, use `triage-and-reply-inbox` instead.

## Prerequisites

- Activate the two tool families: `g8_tool_search("workflow")` and `g8_tool_search("skill")`, or call via `g8_execute`.

## Steps

1. **Discover the building blocks.** `g8_workflow_list_node_types` to see available triggers and actions; `g8_workflow_describe_node_type` on the reply trigger to learn its output fields (sender, subject, body, thread context). Do not guess field names; read them.
2. **Author the LLM skill.** `g8_skill_create_llm` with a prompt template that consumes the trigger's fields as single-brace placeholders, e.g. `{sender_name}`, `{reply_body}`. Single-brace `{var}` is the contract the workflow builder detects; double-brace `{{var}}` is treated as literal text. Use dry_run first, show the user the prompt, then persist.
3. **Design the graph.** Trigger (reply received, scoped to the right campaign/mailbox) -> Action node running the LLM skill with input mappings wiring trigger outputs to the skill's placeholders -> delivery step per the user's preference (draft-for-review is the safe default; fully-auto send only if the user insists and understands the risk).
4. **Create disabled.** `g8_workflow_create` with `enabled=false` (dry_run preview first, then persist). A workflow that has never been reviewed must not be live.
5. **Validate.** `g8_workflow_validate`; fix any missing references or unmapped placeholders it reports. An LLM skill placeholder with no input mapping means the model gets literal `{var}` text at run time.
6. **Walk the user through it.** Show the graph in plain language: "When X happens, Y drafts a reply using Z context, and it lands as a draft for your review." State the per-execution credit cost.
7. **Enable on explicit approval only.** `g8_workflow_update` with `enabled=true` after the user confirms. Suggest a test: send a reply to the campaign from a test address and watch the workflow produce a draft.

## Example prompts

- "When someone replies to the launch campaign, draft a follow-up in my voice for review."
- "Automate first-touch responses to demo requests, but let me approve sends."
- "Build a reply-handling workflow for the RevOps sequence."

## Troubleshooting

- **Validation reports missing references:** re-check input mappings; every `{placeholder}` in the LLM skill needs a mapped source from the trigger.
- **Skill saved but variables not detected:** you used double braces; recreate the prompt with single-brace `{var}`.
- **Tool not visible:** both families are gated; `g8_tool_search("workflow")` / `g8_tool_search("skill")` first.
