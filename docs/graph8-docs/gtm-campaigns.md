<!-- https://docs.graph8.com/developers/gtm-campaigns/ -->
# GTM Campaigns

GTM Campaigns are graph8’s AI-Studio campaign objects: a brief, a sequence (ordered step references), and a step catalog (the actual step definitions). Each campaign owns a set of generated documents (campaign brief, sequence doc, ad copy, landing page copy, etc.). 
These endpoints are the org-scoped flavor used by Studio, MCP, and Claude Desktop GTM mode. The same surface is also exposed under `/repos/{repo_id}/campaigns` for spine-installed CLI users; see the CLI reference for that variant. 
| Endpoint | Method | Description
| `/campaigns` | GET | List campaigns
| `/campaigns` | POST | Create a campaign
| `/campaigns/ideas` | GET | List saved campaign ideas
| `/campaigns/{campaign_id}` | GET | Get a campaign with completed documents
| `/campaigns/{campaign_id}` | PATCH | Update campaign content fields
| `/campaigns/{campaign_id}/documents` | GET | List documents for a campaign
| `/campaigns/{campaign_id}/documents` | POST | Create a document
| `/campaigns/{campaign_id}/documents/{document_id}` | GET | Get full document content
| `/campaigns/{campaign_id}/documents/{document_id}` | PUT | Update document content
| `/campaigns/{campaign_id}/documents/{document_id}` | DELETE | Delete a document
| `/campaigns/{campaign_id}/sequence` | GET | Get sequence + step catalog docs
| `/campaigns/{campaign_id}/sequence` | PUT | Replace sequence step ordering
| `/campaigns/{campaign_id}/sequence/steps` | POST | Append a step
| `/campaigns/{campaign_id}/sequence/steps/{step_id}` | PUT | Update a step definition
| `/campaigns/{campaign_id}/sequence/steps/{step_id}` | DELETE | Remove a step
| `/campaigns/{campaign_id}/ad-images` | GET | List generated ad images
| `/campaigns/{campaign_id}/ad-images/{image_id}/hide` | POST | Mark an ad image hidden
| `/campaigns/{campaign_id}/launch` | POST | Launch campaign (real outreach)
| `/campaigns/{campaign_id}/metrics` | GET | Get campaign metrics
| `/campaigns/{campaign_id}/full` | GET | Full snapshot (campaign + audience + docs + sequence)
| `/campaigns/{campaign_id}/full` | PATCH | Deep bulk update in a single transaction
| `/campaigns/{campaign_id}/audience` | PUT | Attach or detach audience list 
For machine-readable schemas see the interactive API docs.  

## List Campaigns 
`GET /campaigns` 
Returns all non-archived campaigns for the org, paginated. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | 1 | Page number
| `limit` | integer | 50 | 1-200 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/campaigns?limit=10" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "cmp_abc",

"name": "Q2 Outbound - VP Marketing",

"slug": "q2-outbound-vp-marketing",

"status": "draft",

"category": "Outbound",

"goal": "Book discovery calls",

"target_persona": "VP Marketing at mid-market SaaS",

"created_at": "2026-04-01T10:00:00Z"

}

]

}
```

## Create Campaign 
`POST /campaigns` 
Create a new campaign. Slug is auto-generated from `name`. 
Campaign field constraints: `name ≤255`, `category ≤100`, `target_persona ≤200`, `goal ≤255`. 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Campaign name (max 255 chars)
| `category` | string | No (default `"Outbound"`) | Campaign category (max 100 chars)
| `brief` | string | No | Campaign brief (uncapped)
| `core_concept` | string | No | One-line concept
| `primary_hook` | string | No | Primary hook text
| `target_persona` | string | No | Target persona (max 200 chars)
| `goal` | string | No | Campaign goal (max 255 chars)
| `audience_list_id` | string | No | Attach a list at create time
| `target_channels` | string[] | No (default `["email"]`) | Channels to target
| `secondary_hooks` | string[] | No | Additional hook lines
| `auto_generate_documents` | boolean | No (default `false`) | When `true`, triggers full Studio bootstrap: creates paired campaign ideas row, metadata, sequence and step catalog stubs, and dispatches Celery doc generation. Sets `status="copy_in_progress"`. The MCP tool always sets this `true`; the launcher requires it. 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/campaigns" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Q2 Outbound - VP Marketing",

"category": "Outbound",

"primary_hook": "Cut SDR ramp time in half",

"goal": "Book discovery calls",

"audience_list_id": "12345",

"target_channels": ["email"],

"auto_generate_documents": true

}'
```

### Response 

```

{

"data": {

"id": "cmp_abc",

"name": "Q2 Outbound - VP Marketing",

"slug": "q2-outbound-vp-marketing",

"status": "copy_in_progress",

"category": "Outbound",

"audience_list_id": "12345",

"campaign_idea_id": "idea_001",

"target_channels": ["email"],

"secondary_hooks": [],

"generation_status": "in_progress",

"total_documents": 15

}

}
```

`generation_status` is `"in_progress"` when `auto_generate_documents` was `true`, `"skipped"` when it was `false`, or `"failed_to_dispatch"` if the Celery dispatch failed. `status` is `"copy_in_progress"` when auto-generation was requested, otherwise `"draft"`.  

## List Campaign Ideas 
`GET /campaigns/ideas` 
Returns saved/AI-generated campaign ideas (pre-conversion). Use these to seed `POST /campaigns`. 

### Query Parameters 
| Parameter | Type | Default | Description
| `favorited` | boolean | - | Filter to favorited ideas only
| `limit` | integer | 50 | 1-200 

### Response 

```

{

"data": [

{

"id": "idea_001",

"rank": 1,

"campaign_name": "Sales Velocity Diagnostic",

"campaign_category": "Outbound",

"campaign_focus": "Mid-market RevOps",

"core_concept": "...",

"why_this_works": "...",

"primary_hook": "Find your stuck deals in 5 minutes",

"secondary_hooks": ["..."],

"target_channels": ["email", "linkedin"],

"required_assets": ["landing page", "demo video"],

"execution_complexity": "medium",

"expected_impact": "high",

"proof_points": ["..."],

"framework_inspiration": "Challenger",

"source": "studio_generated",

"favorited": true,

"converted_to_campaign": false,

"converted_campaign_id": null,

"created_at": "2026-04-01T10:00:00Z",

"updated_at": "2026-04-01T10:00:00Z"

}

]

}
```

## Get Campaign 
`GET /campaigns/{campaign_id}` 
Returns campaign details plus a thumbnail list of completed documents. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/campaigns/cmp_abc" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"id": "cmp_abc",

"name": "Q2 Outbound - VP Marketing",

"slug": "q2-outbound-vp-marketing",

"status": "draft",

"category": "Outbound",

"goal": "Book discovery calls",

"target_persona": "VP Marketing at mid-market SaaS",

"brief": "...",

"core_concept": "...",

"primary_hook": "Cut SDR ramp time in half",

"channels": ["email", "linkedin"],

"documents": [

{"id": "doc_001", "name": "Campaign Brief", "type": "campaign_brief"},

{"id": "doc_002", "name": "Sequence", "type": "sequence"}

],

"created_at": "2026-04-01T10:00:00Z",

"updated_at": "2026-04-10T14:30:00Z"

}

}
```

### Errors 
| Status | Meaning
| `404` | Campaign not found  

## Update Campaign 
`PATCH /campaigns/{campaign_id}` 
Update content fields on a campaign. 

### Request Body 
| Field | Type | Description
| `name` | string | Campaign name
| `brief` | string | Campaign brief
| `core_concept` | string | Core concept
| `primary_hook` | string | Primary hook text
| `target_persona` | string | Target persona
| `category` | string | Campaign category
| `goal` | string | Campaign goal 

### Errors 
| Status | Meaning
| `400` | No fields provided
| `404` | Campaign not found  

## List Campaign Documents 
`GET /campaigns/{campaign_id}/documents` 
Returns metadata for every document associated with the campaign (no content payload). 

### Response 

```

{

"data": {

"campaign_id": "cmp_abc",

"documents": [

{

"id": "doc_001",

"campaign_id": "cmp_abc",

"display_name": "Campaign Brief",

"name": "Campaign Brief",

"file_type": "campaign_brief",

"type": "campaign_brief",

"folder_path": "/brief",

"status": "completed",

"version": 2,

"current_version": 2,

"created_at": "2026-04-01T10:00:00Z",

"updated_at": "2026-04-05T11:00:00Z"

}

],

"count": 1

}

}
```

## Get Campaign Document 
`GET /campaigns/{campaign_id}/documents/{document_id}` 
Returns full document content. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/campaigns/cmp_abc/documents/doc_001" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"id": "doc_001",

"campaign_id": "cmp_abc",

"name": "Campaign Brief",

"type": "campaign_brief",

"status": "completed",

"version": 2,

"content": "# Campaign Brief\n\nGoal: ...",

"created_at": "2026-04-01T10:00:00Z",

"updated_at": "2026-04-05T11:00:00Z"

}

}
```

## Create Campaign Document 
`POST /campaigns/{campaign_id}/documents` 
Create a new document attached to the campaign. 

### Request Body 
| Field | Type | Required | Description
| `file_type` | string | Yes | Document type (e.g. `campaign_brief`, `sequence`, etc.)
| `display_name` | string | Yes | Human-readable name
| `content` | string | No | Document content (default `""`)
| `folder_path` | string | No | Optional folder path (e.g. `"/briefs"`)
| `status` | string | No (default `"draft"`) | `"draft"` or `"completed"`
| `structured_data` | object | No | Optional structured payload stored in metadata 

### Response `201 Created` 
Returns the same document shape as `GET .../documents/{document_id}`.  

## Update Campaign Document 
`PUT /campaigns/{campaign_id}/documents/{document_id}` 
Update content. Bumps `version` and `current_version` by 1, marks `completed=true` and `generating=false` in metadata. 

### Request Body 
| Field | Type | Description
| `content` | string | New content (defaults to existing if empty)
| `status` | string | Optional status override
| `structured_data` | object | Optional structured payload stored in metadata 

### Errors 
| Status | Meaning
| `404` | Document not found (or its parent campaign is archived)  

## Delete Campaign Document 
`DELETE /campaigns/{campaign_id}/documents/{document_id}` 
Hard delete. Returns `404` if the document or its parent campaign is missing. 

### Response 

```

{ "data": { "status": "deleted", "document_id": "doc_001" } }
```

## Get Sequence 
`GET /campaigns/{campaign_id}/sequence` 
Returns both the sequence document (ordered list of step references) and the step catalog document (step definitions keyed by `step_id`). 

### Response 

```

{

"data": {

"campaign_id": "cmp_abc",

"sequence": {

"steps": [

{"step_id": "step_1", "day": 0, "condition": null, "stop_on_reply": true},

{"step_id": "step_2", "day": 3, "condition": "no_reply", "stop_on_reply": true}

]

},

"step_catalog": {

"steps": {

"step_1": {"name": "Intro email", "channel": "email", "mode": "send", ...},

"step_2": {"name": "LinkedIn follow-up", "channel": "linkedin", "mode": "send", ...}

}

},

"sequence_doc_id": "doc_seq_001",

"catalog_doc_id": "doc_cat_001"

}

}
```

### Errors 
| Status | Meaning
| `404` | Campaign not found  

## Update Sequence 
`PUT /campaigns/{campaign_id}/sequence` 
Replace the ordered list of step references. Each `step_id` must exist in the step catalog. 

### Request Body 
| Field | Type | Required | Description
| `steps` | object[] | Yes | Ordered step references 
Each `step` item: 
| Field | Type | Description
| `step_id` | string | Step ID (must exist in catalog)
| `day` | integer | Day offset from sequence start
| `condition` | string | Optional condition (`no_reply`, etc.)
| `stop_on_reply` | boolean | Default `true` 

### Errors 
| Status | Meaning
| `400` | `step_id` not in catalog
| `404` | Sequence document not found  

## Create Sequence Step 
`POST /campaigns/{campaign_id}/sequence/steps` 
Create a new step and append it to the sequence in one call. The endpoint mints a fresh `step_id` (`step_N`). 

### Channel → Mode Matrix 
The `channel` field determines which `mode` values are valid: 
| Channel | Valid modes
| `email` | `email`
| `phone` | `call`, `voicemail`
| `sms` | `sms`
| `social` | `connect_note`, `dm`, `comment`, `reply`
| `voice_ai` | `call` 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Step name
| `channel` | string | Yes | Channel type — see Channel → Mode Matrix above
| `mode` | string | Yes | Mode for the chosen channel — see Channel → Mode Matrix above
| `day` | integer | Yes | Day offset for sequence placement
| `platform` | string | No | Sub-channel platform (e.g. `"linkedin"`)
| `angle_id` | string | No (default `"angle_1"`) | Messaging angle reference
| `cta_type` | string | No (default `"soft_ask"`) | CTA type
| `personalization_level` | string | No (default `"medium"`) | Level of personalization
| `constraints` | object | No | Constraint dict
| `condition` | string | No | Sequence condition
| `stop_on_reply` | boolean | No (default `true`) | Stop the contact’s enrollment on reply 

### Response `201 Created` 

```

{

"data": {

"status": "created",

"step_id": "step_3",

"step": {

"step_id": "step_3",

"name": "Final follow-up",

"channel": "email",

"mode": "send",

"platform": null,

"angle_id": "angle_1",

"cta_type": "soft_ask",

"personalization_level": "medium",

"constraints": {}

},

"day": 7

}

}
```

## Update Sequence Step 
`PUT /campaigns/{campaign_id}/sequence/steps/{step_id}` 
Update a step definition in the catalog and (optionally) its placement in the sequence. All fields are optional - send only what you want to change. 

### Request Body 
| Field | Type | Description
| `name` | string | Step name
| `channel` | string | Channel
| `mode` | string | Mode
| `platform` | string | Platform
| `angle_id` | string | Messaging angle
| `cta_type` | string | CTA type
| `personalization_level` | string | Level
| `constraints` | object | Constraint dict
| `do_not_send_rules` | string[] | Rules that should suppress sending
| `day` | integer | Sequence placement (updates the sequence doc, not the catalog)
| `condition` | string | Sequence placement condition
| `stop_on_reply` | boolean | Sequence placement override 
`day`, `condition`, and `stop_on_reply` modify the sequence document; everything else modifies the catalog entry. 

### Errors 
| Status | Meaning
| `404` | Step or step catalog not found  

## Delete Sequence Step 
`DELETE /campaigns/{campaign_id}/sequence/steps/{step_id}` 
Remove a step from the catalog and any references in the sequence. 

### Response 

```

{ "data": { "status": "deleted", "step_id": "step_3" } }
```

### Errors 
| Status | Meaning
| `404` | Step not found  

## Launch Campaign 
`POST /campaigns/{campaign_id}/launch` 

Restricted API keys must include the `campaigns:launch` scope. This route enforces that scope even while other Developer API scopes are in soak mode. Legacy API keys created without scope restrictions remain unrestricted. 

### Query Parameters 
| Parameter | Type | Default | Description
| `validate` | boolean | `true` | Deprecated compatibility parameter. Readiness is always validated; `false` returns `400` before a sequence is created. 

### Request Body 
All fields are optional. An empty body is valid and keeps the 0.9.6 auto-pick contract. 
| Field | Type | Description
| `sender_mailbox_ids` | integer[] | Explicit sender mailbox IDs from `GET /mailboxes`. Each must be `connection_status="active"` and non-archived. Missing IDs return `400`.
| `disable_auto_pick` | boolean | Deprecated compatibility field. `false` is ignored; `true` returns `400` because a consequential launch cannot proceed without an executable sender.
| `textual_agent_name` | string | Since 0.9.7. Agent name from `GET /voice/dialer/agents` (the unified Agents+Twins picker). Stamped onto the sequence. Used for email and social steps.
| `voice_agent_name` | string | Since 0.9.7. Same picker; for phone and SMS steps. Set equal to `textual_agent_name` for the common “one agent, all channels” case.
| `schedule_id` | string | Since 0.9.7. UUID from `GET /schedules`. Stamped onto the sequence (send window + timezone). When omitted the sequencer falls back to its org-default send window.
| `appointment_id` | integer | Since 0.9.7. Integer from `GET /event-types`. Stamped onto the sequence so the booking-link rewrite kicks in during send. 
Sender selection precedence:  
- If `sender_mailbox_ids` is provided → attach exactly those mailboxes. 
- Otherwise the bridge auto-picks the first active email mailbox (`ORDER BY id ASC`). 
- If no supported active sender exists, the request fails before sequence creation.  
Launch readiness is mandatory and requires a non-empty audience, completed campaign copy, at least one complete step, and every channel required by those steps. The one-step API launch currently supports email execution. For social, phone, SMS, or other multichannel work, create a Sequencer draft and configure the required channels before Go Live. 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/campaigns/cmp_abc/launch" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"sender_mailbox_ids": [42, 17],

"textual_agent_name": "my-agent",

"voice_agent_name": "my-agent",

"schedule_id": "sched_uuid",

"appointment_id": 1

}'
```

### Response 

```

{

"data": {

"status": "live",

"campaign_id": "cmp_abc",

"sequence_id": "seq_001",

"sequence_name": "Q2 Outbound - VP Marketing",

"steps_created": 3,

"link_id": "link_001",

"warnings": [],

"channels_attached": [

{ "mailbox_id": 42, "email": "[email protected]", "channel_type": "email", "auto_picked": false }

],

"agent_assigned": {

"textual_agent_name": "my-agent",

"voice_agent_name": "my-agent"

},

"schedule_id": "sched_uuid",

"appointment_id": 1,

"execution": {

"status": "live",

"contacts_total": 120,

"orchestrator_version": "v2-sync"

},

"message": "Sequence started successfully (V2)"

}

}
```

`channels_attached` lists the sender mailboxes the bridge attached. `auto_picked: true` means the bridge selected a mailbox automatically. `status` is truthful: `live` only after synchronous initialization completes, or `scheduling` with job and polling fields inside `execution` for background initialization. 
If the draft is created but activation fails, the endpoint returns `502`. `detail.status` is `draft_created_activation_failed` when the sequence was confirmed back in Draft, or `activation_state_uncertain` when the final state could not be proven. Follow the returned recovery instruction; do not repeat an uncertain launch.  

## Get Ad Images 
`GET /campaigns/{campaign_id}/ad-images` 
Returns generated ad images for the campaign. 

### Path Parameters 
| Parameter | Type | Description
| `campaign_id` | string | Campaign ID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/campaigns/cmp_abc/ad-images" \

-H "Authorization: Bearer $API_KEY"
```

## Hide Ad Image 
`POST /campaigns/{campaign_id}/ad-images/{image_id}/hide` 
Marks an ad image as hidden. No request body required. 

### Path Parameters 
| Parameter | Type | Description
| `campaign_id` | string | Campaign ID
| `image_id` | string | Ad image ID 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/campaigns/cmp_abc/ad-images/img_001/hide" \

-H "Authorization: Bearer $API_KEY"
```

## Get Campaign Metrics 
`GET /campaigns/{campaign_id}/metrics` 
Returns engagement metrics for the campaign over a rolling time window. 

### Path Parameters 
| Parameter | Type | Description
| `campaign_id` | string | Campaign ID 

### Query Parameters 
| Parameter | Type | Default | Description
| `days` | integer | `30` | Rolling window in days (1–365) 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/campaigns/cmp_abc/metrics?days=30" \

-H "Authorization: Bearer $API_KEY"
```

## Get Campaign Full Snapshot 
`GET /campaigns/{campaign_id}/full` 
Returns a full snapshot of the campaign including audience, all documents, and the sequence. 

### Path Parameters 
| Parameter | Type | Description
| `campaign_id` | string | Campaign ID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/campaigns/cmp_abc/full" \

-H "Authorization: Bearer $API_KEY"
```

## Bulk Update Campaign 
`PATCH /campaigns/{campaign_id}/full` 
Deep bulk update executed in a single transaction. Updates campaign fields, patches or creates documents, reorders sequence steps, and links or unlinks existing sequences. 

### Path Parameters 
| Parameter | Type | Description
| `campaign_id` | string | Campaign ID 

### Request Body 
All fields are optional. 
| Field | Type | Description
| `name` | string | Campaign name (max 255 chars)
| `brief` | string | Campaign brief
| `core_concept` | string | Core concept
| `primary_hook` | string | Primary hook
| `target_persona` | string | Target persona (max 200 chars)
| `category` | string | Campaign category (max 100 chars)
| `goal` | string | Campaign goal (max 255 chars)
| `audience_list_id` | string | Provide a list ID (or `""`) to set the audience. Use `detach_audience` to clear it.
| `detach_audience` | boolean | When `true`, explicitly sets `audience_list_id` to null
| `documents` | object[] | List of document patch/create objects (see below)
| `sequence_steps` | object[] | Replaces the full sequence ordering
| `linked_sequence_ids` | string[] | Link existing sequences (sets `status="linked"`)
| `unlink_sequence_ids` | string[] | Unlink sequences. Only deletes `status="linked"` rows; audit rows are untouched. 

#### `documents` item fields 
| Field | Type | Description
| `id` | string | When present, updates an existing document. When absent, creates a new document (then `file_type` and `display_name` are required).
| `file_type` | string | Document type (required for create)
| `display_name` | string | Human-readable name (required for create)
| `folder_path` | string | Optional folder path
| `status` | string | `"draft"` or `"completed"`
| `content` | string | Document content
| `structured_data` | object | Optional structured payload 

#### `sequence_steps` item fields 
| Field | Type | Description
| `step_id` | string | Step ID (must exist in catalog)
| `day` | integer | Day offset from sequence start
| `condition` | string | Optional condition string
| `stop_on_reply` | boolean | Stop enrollment on reply 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/campaigns/cmp_abc/full" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Q3 Outbound - VP Engineering",

"brief": "Updated brief text",

"audience_list_id": "12345",

"documents": [

{

"id": "doc_uuid",

"status": "completed",

"content": "Updated brief content"

},

{

"file_type": "landing_page",

"display_name": "Landing Page v2",

"content": "New landing page copy",

"structured_data": {}

}

],

"sequence_steps": [

{ "step_id": "step_1", "day": 1, "condition": null, "stop_on_reply": true },

{ "step_id": "step_2", "day": 3, "condition": null, "stop_on_reply": true }

],

"linked_sequence_ids": ["seq_existing_001"],

"unlink_sequence_ids": ["seq_old_002"]

}'
```

## Attach or Detach Audience 
`PUT /campaigns/{campaign_id}/audience` 
Attach an audience list to the campaign, or detach the current one by passing `null`. 

### Path Parameters 
| Parameter | Type | Description
| `campaign_id` | string | Campaign ID 

### Request Body 
| Field | Type | Description
| `list_id` | string | Audience list ID to attach. Pass `null` to detach the current audience. 

### Example  

-   cURL     

Terminal window
```

# Attach an audience

curl -X PUT "https://be.graph8.com/api/v1/campaigns/cmp_abc/audience" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "list_id": "12345" }'

# Detach the audience

curl -X PUT "https://be.graph8.com/api/v1/campaigns/cmp_abc/audience" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "list_id": null }'
```
