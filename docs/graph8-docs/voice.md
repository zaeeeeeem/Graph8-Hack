<!-- https://docs.graph8.com/developers/voice/ -->
# Voice & Dialer

`` 

```` 
The Voice API exposes graph8’s parallel dialer — session management, real-time call records, transcripts, AI grading, agent rosters, and phone number pools. All endpoints are under `/api/v1/voice/dialer/`.  

## List Dialer Sessions 
`GET /voice/dialer/sessions` 
Returns a paginated list of dialer sessions for the org. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | `1` | Page number (1-indexed)
| `page_size` | integer | `50` | Items per page (max 200)
| `status` | string | — | Filter by status — comma-separated values (e.g. `ACTIVE,PAUSED`)
| `user_email` | string | — | Filter by the SDR’s email address
| `name` | string | — | Filter by session name
| `campaign_id` | string | — | Filter by campaign ID
| `list_id` | string | — | Filter by list ID
| `list_name` | string | — | Filter by list name
| `date_from` | string (ISO) | — | Return sessions created on or after this date
| `date_to` | string (ISO) | — | Return sessions created on or before this date
| `sort_by` | string | — | Field to sort by
| `sort_order` | string | `desc` | Sort direction — `asc` or `desc` 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/sessions?status=ACTIVE,PAUSED&page_size=20" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"sessions": [

{

"session_id": "...",

"status": "PAUSED",

"user_id": "...",

"user_email": "...",

"org_id": "...",

"from_phone": "+1...",

"campaign_id": null,

"campaign_builder_campaign_id": null,

"name": "Q3 Outbound",

"session_metadata": { "list_id": "12345", "list_title": "..." },

"total_calls": 0,

"created_at": "...",

"updated_at": "...",

"contact_ids": []

}

],

"pagination": {

"total_items": 1,

"total_pages": 1,

"current_page": 1,

"page_size": 50

}

}

}
```

## Create Dialer Session 
`POST /voice/dialer/sessions` → `201 Created` 
Create a new dialer session. Sessions are created in PAUSED state. Call `POST /voice/dialer/sessions/{session_id}/resume` to begin dialing. 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Session display name (1–200 characters)
| `from_phone` | string | Yes | Caller ID phone number in E.164 format (9–16 characters)
| `list_id` | string | No | ID of the contact list to dial
| `list_title` | string | No | Display title of the contact list
| `agent_id` | string | No | UUID of the voice agent to use
| `agent_name` | string | No | Agent name — V1 fallback when `agent_id` is not supplied
| `entity_type` | string | No | `"agent"` or `"twin"`
| `studio_campaign_id` | string | No | Link to a Studio campaign
| `user_timezone` | string | No | IANA timezone string (e.g. `"America/New_York"`)
| `skip_voicemails` | boolean | No | When `true`, skip contacts that go to voicemail 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/voice/dialer/sessions" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Q3 Outbound",

"from_phone": "+15551234567",

"list_id": "12345",

"list_title": "Q3 Targets",

"agent_id": "agent_uuid",

"entity_type": "agent",

"user_timezone": "America/New_York",

"skip_voicemails": true

}'
```

### Response 

```

{

"data": {

"session_id": "...",

"status": "PAUSED",

"name": "Q3 Outbound",

"org_id": "...",

"user_id": "...",

"user_email": "...",

"from_phone": "+15551234567",

"session_metadata": { "list_id": "12345", "list_title": "Q3 Targets" },

"total_calls": 0,

"created_at": "...",

"message": "..."

}

}
```

## Update Session Status 
`PATCH /voice/dialer/sessions/{session_id}/status` 
Pause, resume, or stop a dialer session. 

### Path Parameters 
| Parameter | Type | Description
| `session_id` | string | Session UUID 

### Request Body 
| Field | Type | Required | Description
| `status` | string | Yes | New status — `"ACTIVE"` (resume), `"PAUSED"` (pause), or `"COMPLETED"` (stop). `"FAILED"` is rejected. 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/voice/dialer/sessions/ses_abc123/status" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "status": "PAUSED" }'
```

### Response 

```

{

"data": {

"session_id": "ses_abc123",

"status": "PAUSED",

"name": "Q3 Outbound",

"org_id": "...",

"user_id": "...",

"user_email": "...",

"from_phone": "+15551234567",

"session_metadata": { "list_id": "12345", "list_title": "Q3 Targets" },

"total_calls": 0,

"created_at": "...",

"updated_at": "..."

}

}
```

## Resume Dialer Session 
`POST /voice/dialer/sessions/{session_id}/resume` 
Resume a paused session and dial the next batch of contacts. This endpoint places real outbound calls immediately. 

### Path Parameters 
| Parameter | Type | Description
| `session_id` | string | Session UUID 

### Request Body 
| Field | Type | Required | Description
| `max_contacts` | integer | No | Maximum number of contacts to dial concurrently (1–4, default `4`) 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/voice/dialer/sessions/ses_abc123/resume" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "max_contacts": 4 }'
```

### Response 

```

{

"data": {

"session_id": "ses_abc123",

"status": "ACTIVE",

"from_phone": "+15551234567",

"session_metadata": { "list_id": "12345", "list_title": "Q3 Targets" },

"total_calls": 0,

"dialed_count": 4,

"created_at": "...",

"updated_at": "...",

"message": "..."

}

}
```

## Dialer Stats 
`GET /voice/dialer/stats` 
Returns aggregated dialer analytics. Supports daily or total aggregation with optional date and session filters. 

### Query Parameters 
| Parameter | Type | Default | Description
| `session_id` | string | — | Filter metrics to a specific session
| `user_email` | string | — | Filter metrics to a specific SDR
| `date_from` | string (YYYY-MM-DD) | — | Start date (inclusive)
| `date_to` | string (YYYY-MM-DD) | — | End date (inclusive)
| `aggregation` | string | `DAILY` | Aggregation level — `DAILY` or `TOTAL` 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/stats?aggregation=DAILY&date_from=2026-05-01&date_to=2026-05-31" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"filters": {

"session_id": null,

"user_email": null,

"org_id": "...",

"date_from": "...",

"date_to": "...",

"aggregation": "DAILY"

},

"metrics": [

{

"date": "2026-05-26",

"sdr_name": "...",

"org_id": "...",

"list_title": "...",

"total_dials": 100,

"total_connections": 30,

"connection_rate": 0.3,

"total_voicemails": 10,

"voicemail_rate": 0.1,

"talk_time_minutes": 45.5,

"avg_call_duration_minutes": 1.5,

"dispositions": { "booked": 2, "callback": 5 },

"success_rate": 0.02,

"unique_sessions": 1,

"avg_calls_per_session": 100,

"redial_count": 0,

"redial_success_rate": null,

"peak_calling_hour": 14,

"total_callbacks": 0

}

],

"summary": {}

}

}
```

## List Phone Numbers 
`GET /voice/dialer/numbers` 
Returns the phone numbers provisioned for the org, with usage and health stats. 

### Query Parameters 
| Parameter | Type | Default | Description
| `user_email` | string | — | Filter numbers assigned to a specific user 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/numbers" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"numbers": [

{

"number": "+15551234",

"inbound_type": "ai",

"telephony_provider": "twilio",

"calls_today": 5,

"calls_7d": 40,

"connect_rate_7d": 0.3,

"is_valid": true,

"daily_limit": 40,

"assigned_to": "[email protected]",

"created_at": "..."

}

]

}

}
```

## List Missed Callbacks 
`GET /voice/dialer/missed-callbacks` 
Returns inbound calls that arrived while no SDR was available to answer. 

### Query Parameters 
| Parameter | Type | Default | Description
| `limit` | integer | `50` | Maximum number of records to return (max 200) 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/missed-callbacks?limit=50" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"missed_callbacks": [

{

"id": 1,

"caller_phone": "...",

"inbound_number": "...",

"first_name": "...",

"last_name": "...",

"email": "...",

"contact_id": 101,

"parallel_session_id": "...",

"created_at": "...",

"call_duration": null,

"is_callback": false

}

],

"count": 1

}

}
```

## Get Call Grading 
`GET /voice/dialer/calls/{room_name}/grading` 
Returns the AI-graded talk-track feedback for a call. If grading is still being computed, `status` will be `"pending"`. 

### Path Parameters 
| Parameter | Type | Description
| `room_name` | string | LiveKit room name for the call 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/calls/room_abc123/grading" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"room_name": "...",

"status": "ready",

"grading": {},

"reviewed": false,

"reviewed_at": null

}

}
```

`status` is `"pending"` while grading is still being computed.  

## Get Call Transcript 
`GET /voice/dialer/calls/{room_name}/transcript` 
Returns the full transcript for a call, along with the summary, disposition, and recording URL. 

### Path Parameters 
| Parameter | Type | Description
| `room_name` | string | LiveKit room name for the call 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/calls/room_abc123/transcript" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"room_name": "...",

"status": "ready",

"transcript": [

{ "speaker": "SDR", "content": "...", "timestamp": "..." }

],

"summary": "...",

"disposition": "booked",

"contact_id": "101",

"call_duration": 90,

"recording_url": "...",

"parallel_session_id": "...",

"created_at": "..."

}

}
```

## List Calls 
`GET /voice/dialer/calls` 
Returns calls matching the given filters. At least one of `contact_id`, `user_email`, or `parallel_session_id` is required. 

### Query Parameters 
| Parameter | Type | Default | Description
| `contact_id` | string | — | Filter by contact ID (at least one filter required)
| `user_email` | string | — | Filter by SDR email (at least one filter required)
| `parallel_session_id` | string | — | Filter by session ID (at least one filter required)
| `created_after` | string (ISO) | — | Return calls created after this timestamp
| `limit` | integer | `20` | Maximum number of records to return (max 100) 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/calls?contact_id=101&limit=20" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"contact_id": "101",

"user_email": null,

"parallel_session_id": null,

"count": 1,

"calls": [

{

"room_name": "...",

"created_at": "...",

"disposition": "booked",

"summary": "...",

"call_duration": 90,

"recording_url": "...",

"parallel_session_id": "...",

"contact_id": "101",

"from_": "+1...",

"to": "+1...",

"has_transcript": true

}

]

}

}
```

## List Voice Agents 
`GET /voice/dialer/agents` 
Returns available voice agents and digital twins for the org. 

### Query Parameters 
| Parameter | Type | Default | Description
| `role` | string | — | Filter by agent role (e.g. `SDR`)
| `agent_status` | string | — | Filter by agent status (e.g. `active`)
| `entity_type` | string | — | Filter by entity type — `agent` or `twin`
| `search` | string | — | Search agents by name or description 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/voice/dialer/agents?entity_type=agent&agent_status=active" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"agents": [

{

"agent_id": "uuid",

"agent_name": "...",

"role": "SDR",

"agent_status": "active",

"entity_type": "agent",

"description": "...",

"phone": "+1...",

"is_template": false

}

],

"total_count": 1

}

}
```

## Credit Costs 
| Operation | Credits
| Read endpoints (sessions, calls, transcripts, grading, stats, numbers, agents) | Free
| Outbound call audio | 20 per minute
| Booked meeting | 20 per booking
| Inbound callback (handled by AI receptionist) | 20 per minute  

## Errors 
| Status | Cause | Fix
| `401` | Missing or invalid `Authorization: Bearer` header | Get a key
| `402` | Out of credits | Top up in Settings → Billing
| `404` | Resource ID does not exist | List first to verify the ID
| `422` | Validation error in request body | Inspect `error.message` and `error.field` in the response
| `429` | Rate limit (50 rps per org) | Back off per `Retry-After` header
| `5xx` | graph8 error | Retry with exponential backoff (5s → 30s → 120s) 
The full error envelope: `{ "error": { "code": "...", "message": "...", "field": "...", "request_id": "..." } }`. Include `request_id` in any support ticket.
