# W15 — LinkedIn live sends via graph8 workflows (Netrion)

Verified live 2026-09-27 ~14:55 PKT against the TEST org, with `scripts/try-linkedin-send.ts`.

## graph8 shapes (REST, `be.graph8.com/api/v1`)

| Call | Shape |
|---|---|
| `GET /workflows/integrations/linkedin/senders` | `{senders:[{sender_account_id:"1", account_id:"la_…", display_name:"Moazam Ali", status:"OK", account_tier:"CLASSIC"}], total_count:1}`. Use `sender_account_id` verbatim, never `la_…`. |
| `GET /workflows/node-types/schema?detail=full` | node catalog; `send_netrion_connection_request` {sender_account_id, connection_message ≤300, linkedin_url \| contact_id}, `send_netrion_message` {sender_account_id, message, linkedin_url \| contact_id}. Output `{success, queue_id, action_type, skipped, skip_reason, error}`. |
| trigger | `node_type:"trigger"`, `config.trigger_type:"tool_call"` + `input_schema:[{name,type,required,description}]`; inputs referenced as `${trigger.<field>}`. `start_node_id` = trigger id; executor follows `node.connections`. |
| `POST /workflows/validate {config}` | `{valid:true, errors:[], warnings:[], missing_references:[]}` for both Graphi workflows. |
| `POST /workflows {name, description, category, enabled, config}` | creates; `GET /workflows` → `{actions:[{action_id, name, …}], total_count}`. |
| `POST /workflows/{action_id}/execute {input_data:{linkedin_url, text}}` | `{execution_id, status}`. |
| `GET /workflows/executions/{execution_id}` | `{status:"completed", trigger_type:"manual", output_data:{node_results:{<node_id>:{status, error, output:{success, queue_id, action_type:"MESSAGE", …}}}}, error_message, duration_ms}`. |
| `GET /linkedin/accounts` | per-seat usage: `messages_used/message_cap 25`, `messages_pending`, `invites_*`, `work_window {start:"09:00", end:"17:00", days:[1..5], tz:"America/New_York"}`. |

Connection status (1st-degree) — **no API found** (checked `/linkedin/*`, `/inbox/linkedin/*`, `/copilot/personal-wiki/linkedin-connections`
is an import job, not a lookup). Fallback: env `LINKEDIN_CONNECTED_NAMES` (allowlisted names already connected), plus a
`linkedin_connection_accepted` lead_event if graph8 ever sends one.

## Workflows (created once, found by name afterwards)

- `Graphi LinkedIn message` → action_id `b9212c5c-1dbc-4f08-9c02-c840f85c339a` (created by the live run)
- `Graphi LinkedIn connect` → created on first connection-request send (validated ✓, not yet created)

## Runs

```
--dry
sender seat: id 1 (Moazam Ali)
LINKEDIN_SEND_NAMES=zaeem · LINKEDIN_CONNECTED_NAMES=zaeem · liveSendsOn=true
validate "Graphi LinkedIn connect" → {"valid":true,"errors":[],"warnings":[]} · existing id: none
validate "Graphi LinkedIn message" → {"valid":true,"errors":[],"warnings":[]} · existing id: none
guard: non-allowlisted url → NotAllowlisted ✓
would send: message to Zaeem (connected=true) text="Hi Zaeem — quick test from Graphi's SDR agent 👋"
dry run — nothing sent

--live (ONCE, Zaeem only)
LinkedIn message queued for Zaeem (graph8, paced)
{"state":"queued","workflow_id":"b9212c5c-1dbc-4f08-9c02-c840f85c339a","execution_id":"fa3d4ec6-fcf9-4b7f-a46d-93f661fc4469",
 "execution_status":"completed","queue_id":"ed939263-0756-48d7-b2ba-ab97823ef8a0"}
```

Execution `fa3d4ec6-…`: status `completed` in 161 ms, 2 nodes executed, message node `success:true`, `action_type:"MESSAGE"`,
`error:null`. `GET /linkedin/accounts` right after: `messages_pending: 1`, `messages_used: 0`.

**Pacing caveat:** the seat's work window is Mon–Fri 09:00–17:00 America/New_York. 2026-09-27 is a Sunday, so the
queued DM is delivered when the window opens (Mon 09:00 ET = 18:00 PKT) unless the founder widens the window in graph8
(`PUT /linkedin/accounts/1/schedule` / LinkedIn settings). Not changed by us.

Not sent to Abbas / Afshan (not in `LINKEDIN_SEND_NAMES`; the guard throws `NotAllowlisted`).
