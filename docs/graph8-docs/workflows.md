<!-- https://docs.graph8.com/developers/workflows/ -->
# Workflows

```` 
Build automation graphs from typed nodes (triggers, actions, delays, branches, agents, skills, loops) connected into directed graphs. The entire workflow graph lives in the `config` field. Node-level edits are made client-side by mutating `config.nodes` / `config.edges` and submitting via `PUT`. 

````  

## Get Node-Type Schemas 
`GET /workflows/node-types/schema` 
Returns schema definitions for all available node types, or a single node type when filtered. 

### Query Parameters 
| Parameter | Type | Default | Description
| `detail` | string | `slim` | Schema verbosity — `slim` (field names only) or `full` (field names + types + constraints)
| `node_type` | string | — | Optional. Filter to a single node type (e.g. `trigger`, `agent`, `delay`) 

### Example  

-   cURL     

Terminal window
```

# Slim schemas for all node types

curl "https://be.graph8.com/api/v1/workflows/node-types/schema" \

-H "Authorization: Bearer $API_KEY"

# Full schema for a single node type

curl "https://be.graph8.com/api/v1/workflows/node-types/schema?detail=full&node_type=agent" \

-H "Authorization: Bearer $API_KEY"
```

## List Workflows 
`GET /workflows` 
Returns a paginated list of workflows. The response uses the key `actions` (not `workflows`) and renames `skill_config` to `config` on each item. 

### Query Parameters 
All parameters are optional. 
| Parameter | Type | Default | Description
| `enabled` | boolean | — | Filter by enabled/disabled status
| `category` | string | — | Filter by workflow category
| `is_template` | boolean | — | Filter to template workflows only 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows" \

-H "Authorization: Bearer $API_KEY"

# Filter to enabled workflows in a category

curl "https://be.graph8.com/api/v1/workflows?enabled=true&category=outreach" \

-H "Authorization: Bearer $API_KEY"

# List templates only

curl "https://be.graph8.com/api/v1/workflows?is_template=true" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"actions": [

{

"id": "wf_abc123",

"name": "Lead nurture",

"description": "Triggered on form submit",

"category": "outreach",

"object_type": "Contact",

"is_template": false,

"config": {

"nodes": [],

"edges": [],

"start_node_id": "n1",

"metadata": {},

"settings": {}

}

}

],

"total_count": 1

}
```

## Get Workflow 
`GET /workflows/{action_id}` 
Returns the full workflow record including the `config` graph (nodes, edges, start node, metadata, settings). 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Workflow ID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/wf_abc123" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"id": "wf_abc123",

"name": "Lead nurture",

"description": "Triggered on form submit",

"category": "outreach",

"object_type": "Contact",

"config": {

"nodes": [

{

"node_id": "n1",

"node_type": "trigger",

"name": "On Submit",

"config": {},

"position": { "x": 0, "y": 0 }

}

],

"edges": [{ "source": "n1", "target": "n2" }],

"start_node_id": "n1",

"metadata": { "name": "Lead nurture", "version": 1 },

"settings": { "stop_on_failure": true }

}

}
```

## Get Trigger Status 
`GET /workflows/{action_id}/trigger-status` 
Returns the current state of an event-stream (cursor-based) trigger for a workflow. 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Workflow ID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/wf_abc123/trigger-status" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"has_trigger": true,

"trigger_type": "event_stream",

"last_cursor": "2026-06-24T10:00:00Z"

}
```

## Create Workflow 
`POST /workflows` → 201 
Creates a new workflow. The proxy normalizes camelCase, ReactFlow, and hybrid graph shapes to canonical snake_case automatically. 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Workflow name
| `description` | string | No | Human-readable description
| `category` | string | No | Category label for grouping
| `object_type` | string | No | Primary object type this workflow operates on (e.g. `Contact`)
| `config` | object | Yes | Workflow graph — see structure below 

#### `config` object 
| Field | Type | Required | Description
| `nodes` | array | Yes | Array of node objects (see node shape below)
| `edges` | array | Yes | Array of `{ "source": "<node_id>", "target": "<node_id>" }` objects
| `start_node_id` | string | Yes | ID of the first node to execute
| `metadata` | object | No | Arbitrary metadata (e.g. `name`, `version`)
| `settings` | object | No | Execution settings (e.g. `{ "stop_on_failure": true }`) 

#### Node shape 
| Field | Type | Required | Description
| `node_id` | string | Yes | Unique node identifier within this workflow
| `node_type` | string | Yes | Node type (e.g. `trigger`, `agent`, `delay`, `branch`, `loop`)
| `name` | string | Yes | Display name for this node
| `config` | object | Yes | Node-type-specific configuration
| `position` | object | No | Visual position `{ "x": 0, "y": 0 }` for the canvas 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/workflows" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Lead nurture",

"description": "Enroll new form submissions in a sequence",

"category": "outreach",

"object_type": "Contact",

"config": {

"nodes": [

{

"node_id": "n1",

"node_type": "trigger",

"name": "On Submit",

"config": {},

"position": { "x": 0, "y": 0 }

}

],

"edges": [{ "source": "n1", "target": "n2" }],

"start_node_id": "n1",

"metadata": { "name": "Lead nurture", "version": 1 },

"settings": { "stop_on_failure": true }

}

}'
```

### Response `201 Created` 

```

{

"id": "wf_abc123",

"name": "Lead nurture",

"config": { "nodes": [...], "edges": [...], "start_node_id": "n1" }

}
```

## Update Workflow 
`PUT /workflows/{action_id}` 
Partial update. All body fields are optional — pass only the fields you want to change. Same field set as create. 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Workflow ID 

### Request Body 
All fields are optional. 
| Field | Type | Description
| `name` | string | Workflow name
| `description` | string | Human-readable description
| `category` | string | Category label
| `object_type` | string | Primary object type
| `config` | object | Full workflow graph (replaces the existing config) 

### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/workflows/wf_abc123" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Lead nurture v2",

"config": {

"nodes": [...],

"edges": [...],

"start_node_id": "n1"

}

}'
```

## Validate Workflow 
`POST /workflows/validate` 
Validates a workflow graph without saving it. Checks for orphan nodes, dangling edges, missing required fields per node type, and other structural issues. Call before `PUT` to fail fast. 

### Request Body 
| Field | Type | Required | Description
| `config` | object | Yes | Workflow graph to validate — same shape as the `config` field in create/update 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/workflows/validate" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"config": {

"nodes": [

{ "node_id": "n1", "node_type": "trigger", "name": "On Submit", "config": {} }

],

"edges": [],

"start_node_id": "n1"

}

}'
```

### Response 

```

{

"errors": [],

"warnings": ["Node n2 is referenced in edges but not defined in nodes"],

"missing_references": []

}
```

## Execute Workflow 
`POST /workflows/{action_id}/execute` 
Runs a workflow immediately. Returns an `execution_id` you can poll via `GET /workflows/executions/{execution_id}`. 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Workflow ID 

### Request Body 
All fields are optional. 
| Field | Type | Default | Description
| `input_data` | object | `{}` | Input payload passed to the first node
| `triggered_by` | string | caller user id | ID of the user triggering this execution 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/workflows/wf_abc123/execute" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"input_data": { "contact_id": 5028106, "source": "manual_run" },

"triggered_by": "user_x"

}'
```

### Response 

```

{

"execution_id": "exec_xyz789"

}
```

## Reset Trigger Cursor 
`POST /workflows/{action_id}/trigger-reset` 
Resets the event-stream trigger cursor to the current time (`now()`). No request body. Use this to make the trigger start processing new events from this moment forward. 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Workflow ID 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/workflows/wf_abc123/trigger-reset" \

-H "Authorization: Bearer $API_KEY"
```

## Get Execution 
`GET /workflows/executions/{execution_id}` 
Returns the current status of an execution, its output data, and token/cost telemetry. 

### Path Parameters 
| Parameter | Type | Description
| `execution_id` | string | Execution ID returned by `POST /workflows/{action_id}/execute` 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/executions/exec_xyz789" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"execution_id": "exec_xyz789",

"workflow_id": "wf_abc123",

"status": "completed",

"output_data": { "result": "enrolled" },

"tokens_used": 1240,

"cost_credits": 2

}
```

## Pause Execution 
`POST /workflows/executions/{execution_id}/pause` 
Pauses an in-flight execution. The execution state is preserved and can be resumed. 

### Path Parameters 
| Parameter | Type | Description
| `execution_id` | string | Execution ID 

### Request Body 
All fields are optional. 
| Field | Type | Description
| `reason` | string | Internal reason code for the pause
| `message` | string | Human-readable message explaining why the execution was paused 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/workflows/executions/exec_xyz789/pause" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "reason": "manual_review", "message": "Needs human approval before continuing" }'
```

## Resume Execution 
`POST /workflows/executions/{execution_id}/resume` 
Resumes a paused execution, optionally skipping from a specific step or skipping failed nodes. 

### Path Parameters 
| Parameter | Type | Description
| `execution_id` | string | Execution ID 

### Request Body 
All fields are optional. 
| Field | Type | Default | Description
| `from_step` | string | — | Node ID to resume from (skips all preceding steps)
| `skip_failed` | boolean | `false` | When `true`, skips nodes that previously failed and continues from the next node 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/workflows/executions/exec_xyz789/resume" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "from_step": "n3", "skip_failed": false }'
```

## Stop Execution 
`POST /workflows/executions/{execution_id}/stop` 
Permanently stops an execution. This is a terminal action — the execution cannot be resumed after stopping. 

### Path Parameters 
| Parameter | Type | Description
| `execution_id` | string | Execution ID 

### Request Body 
All fields are optional. 
| Field | Type | Default | Description
| `reason` | string | — | Internal reason code for the stop
| `save_partial_results` | boolean | `true` | When `true`, persists any output data collected before the stop
| `message` | string | — | Human-readable message explaining why the execution was stopped 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/workflows/executions/exec_xyz789/stop" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "reason": "cancelled", "save_partial_results": true, "message": "Stopped by user" }'
```

## Resolver Helpers 
A set of read-only GET endpoints that return lookup data for populating node configuration UIs (autocompletes, dropdowns, pickers). No request body for any of these. 

### List Roam Users 
`GET /workflows/integrations/roam/users`  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/integrations/roam/users" \

-H "Authorization: Bearer $API_KEY"
```

### List Roam Groups 
`GET /workflows/integrations/roam/groups`  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/integrations/roam/groups" \

-H "Authorization: Bearer $API_KEY"
```

### List Slack Users 
`GET /workflows/integrations/slack/users`  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/integrations/slack/users" \

-H "Authorization: Bearer $API_KEY"
```

### List Slack Channels 
`GET /workflows/integrations/slack/channels`  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/integrations/slack/channels" \

-H "Authorization: Bearer $API_KEY"
```

### List MCP Servers 
`GET /workflows/mcp-servers` 
Returns available MCP servers that can be used as targets in Agent nodes.  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/mcp-servers" \

-H "Authorization: Bearer $API_KEY"
```

### List Dispositions 
`GET /workflows/dispositions` 
Returns the 17-value call disposition enum used in voice/dialer nodes.  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/dispositions" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

[

"booked",

"callback",

"not_interested",

"dnc",

"not_icp",

"has_solution",

"gate_keeper",

"wrong_number",

"left_org",

"voicemail",

"hangup",

"no_voice",

"dial_tree",

"answering_machine",

"not_answered",

"sdr_hangup",

"failed"

]
```

### Get Form Fields 
`GET /workflows/forms/{form_id}/fields` 
Returns the field schema for a specific form, used to configure form-trigger nodes. 

### Path Parameters 
| Parameter | Type | Description
| `form_id` | string | Form ID  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/workflows/forms/demo_request/fields" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"form_id": "demo_request",

"fields": ["first_name", "last_name", "work_email", "company"],

"sample_size": 42

}
```
