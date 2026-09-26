<!-- https://docs.graph8.com/developers/skills/ -->
# Skills (LLM + API)

Skills are reusable building blocks — either an LLM prompt template or an HTTP API wrapper — that workflows compose into multi-step automation runs. Single-brace `{variable}` placeholders are interpolated at execution time; double-brace `{{...}}` patterns are ignored.  

## List Skills 
`GET /skills` 
Returns skills in your workspace, filtered by the query parameters below. 

### Query Parameters 
| Parameter | Type | Default | Description
| `runtime_type` | string | — | Filter by runtime: `llm` or `api`
| `enabled` | boolean | — | Filter by enabled state
| `category` | string | — | Filter by category
| `object_type` | string | — | Filter by associated object: `Company`, `Contact`, `Deal`, or `Campaign`
| `include_system` | boolean | `false` | When `true`, includes system-managed skills 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/skills?runtime_type=llm&enabled=true" \

-H "Authorization: Bearer $API_KEY"
```

## Get Skill 
`GET /skills/{action_id}` 
Returns the full skill record, including `llm_config` (for LLM skills) or `api_config` (for API skills). 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Skill (action) UUID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/skills/sk_uuid" \

-H "Authorization: Bearer $API_KEY"
```

## Get Skill Variables 
`GET /skills/{action_id}/variables` 
Extracts the input variable names from a skill’s prompt or API template. Only single-brace `{var}` references are returned; `{{...}}` patterns are ignored. 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Skill (action) UUID 

### Response 

```

{

"action_id": "sk_uuid",

"runtime_type": "llm",

"variables": ["name", "company"],

"total": 2

}
```

## List Models 
`GET /skills/models` 
Returns the LLM models available for use in LLM skills. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/skills/models" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"models": [

{ "id": "gpt-4o", "provider": "openai", "label": "GPT-4o" },

{ "id": "claude-sonnet-4-5", "provider": "anthropic", "label": "..." }

],

"total": 9

}
```

## List Templates 
`GET /skills/templates` 
Returns built-in skill templates filtered to `llm` and `api` runtimes only. 

### Query Parameters 
| Parameter | Type | Default | Description
| `category` | string | — | Optional. Filter templates by category 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/skills/templates" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"actions": [

{ "id": "tpl_uuid", "name": "Summarize meeting", "runtime_type": "llm", "category": "summarization" }

],

"total_count": 1

}
```

## Create Skill 
`POST /skills` → `201 Created` 
Creates a new skill. The required fields differ by `runtime_type`. 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Display name for the skill
| `description` | string | No | Optional description
| `runtime_type` | string | Yes | `llm` or `api`
| `object_type` | string | No | Associated object: `Company`, `Contact`, `Deal`, `Campaign`, etc.
| `category` | string | No | Category label
| `requires_approval` | boolean | No | Whether execution requires approval (default `false`)
| `approval_type` | string | No | Approval flow type (nullable)
| `knowledge_scope` | string | No | Knowledge scope (nullable)
| `llm_config` | object | Yes when `runtime_type=llm` | LLM configuration (see below)
| `api_config` | object | Yes when `runtime_type=api` | API configuration (see below) 

#### `llm_config` fields 
| Field | Type | Description
| `model` | string | LLM model ID (e.g. `claude-sonnet-4-5`)
| `prompt_template` | string | Prompt with `{variable}` placeholders
| `temperature` | number | Sampling temperature 

#### `api_config` fields 
| Field | Type | Description
| `endpoint` | string | URL with optional `{variable}` placeholders
| `method` | string | HTTP method (e.g. `GET`, `POST`)
| `headers` | object | Request headers; values may contain `{variable}` placeholders
| `query_params` | object | Query parameters
| `body_template` | string | Request body template with `{variable}` placeholders 

### Example — LLM skill  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/skills" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Summarize meeting",

"description": "Summarize a meeting transcript into key points",

"runtime_type": "llm",

"object_type": "Meeting",

"requires_approval": false,

"llm_config": {

"model": "claude-sonnet-4-5",

"prompt_template": "Summarize: {transcript}",

"temperature": 0.2

}

}'
```

### Example — API skill  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/skills" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Lookup zip",

"runtime_type": "api",

"api_config": {

"endpoint": "https://api.example.com/zip/{zip}",

"method": "GET",

"headers": { "Authorization": "Bearer {api_key}" },

"query_params": {},

"body_template": ""

}

}'
```

## Update Skill 
`PUT /skills/{action_id}` 
Partial update. Supply only the fields you want to change. The `runtime_type` field is silently dropped server-side — you cannot change a skill’s runtime after creation. 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Skill (action) UUID 

### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/skills/sk_uuid" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Summarize meeting v2",

"llm_config": { "temperature": 0.1 }

}'
```

## Validate Skill 
`POST /skills/validate` 
Validates a prompt template string or a full skill definition without saving. Returns extracted variables and any warnings. 

### Request Body 
Two accepted shapes: 
Template string validation: 

```

{ "template": "Hello {name}" }
```

Full definition validation: 

```

{ "runtime_type": "llm", "llm_config": { "model": "claude-sonnet-4-5", "prompt_template": "Hello {name}", "temperature": 0.2 } }
```

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/skills/validate" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "template": "Hello {name}" }'
```

### Response 

```

{

"valid": true,

"variables": ["name"],

"variable_count": 1,

"warnings": []

}
```

## Create Skill from Template 
`POST /skills/from-template` → `201 Created` 
Creates a new skill from a built-in template, with optional overrides. 

### Request Body 
| Field | Type | Required | Description
| `template_id` | string | Yes | UUID of the built-in template
| `name` | string | Yes | Display name for the new skill
| `overrides` | object | No | Fields to override from the template defaults 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/skills/from-template" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"template_id": "tpl_uuid",

"name": "My Skill",

"overrides": { "llm_config": { "temperature": 0.5 } }

}'
```

## Create Skill from Workflow Node 
`POST /skills/from-node` → `201 Created` 
Lifts an existing workflow action node into a standalone reusable skill. The source node must be of type `action`. 

### Request Body 
| Field | Type | Required | Description
| `workflow_id` | string | Yes | UUID of the source workflow
| `node_id` | string | Yes | Node ID within the workflow — must be an `action` node
| `name` | string | No | Display name for the new skill. Defaults to `"<source node name> (Copy)"` 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/skills/from-node" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"workflow_id": "wf_uuid",

"node_id": "n1",

"name": "Draft reply skill"

}'
```

## Execute Skill 
`POST /skills/{action_id}/execute` 
Runs the skill with the provided input data. Use for testing and preview; production execution happens inside workflow runs. 

### Path Parameters 
| Parameter | Type | Description
| `action_id` | string | Skill (action) UUID 

### Request Body 
| Field | Type | Required | Description
| `input_data` | object | No | Key-value pairs for `{variable}` placeholders in the skill
| `triggered_by` | string | No | User identifier. Defaults to the API key owner
| `trigger_type` | string | No | Trigger context. Defaults to `"manual"` 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/skills/sk_uuid/execute" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"input_data": { "name": "Jane" },

"triggered_by": "user_x",

"trigger_type": "manual"

}'
```
