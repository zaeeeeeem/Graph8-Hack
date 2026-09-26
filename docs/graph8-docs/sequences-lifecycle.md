<!-- https://docs.graph8.com/developers/sequences-lifecycle/ -->
# Sequence Lifecycle

The Sequences page covers basic operations (list, get, run, pause/resume, manage enrolled contacts). This page covers the lifecycle endpoints used to author and inspect a sequence end-to-end - typically what a CLI or build tool needs. 
All endpoints share the `/sequences` prefix and require a Bearer API key. 
| Endpoint | Method | Description
| `/sequences` | POST | Create a sequence (with optional steps + channels)
| `/sequences/{id}/preview` | GET | Read sequence + steps + channels (no enrollment)
| `/sequences/{id}` | PATCH | Update sequence metadata
| `/sequences/{id}/steps/{step_id}` | PATCH | Update a single step
| `/sequences/{id}/pause` | POST | Pause a live sequence
| `/sequences/{id}/resume` | POST | Resume a paused sequence
| `/sequences/{id}/analytics` | GET | Comprehensive analytics report
| `/sequences/{id}` | DELETE | Soft-delete (archive) a sequence 
A sequence in a transitional status (`scheduling`, `pausing`, `resuming`, `terminating`) cannot be PATCHed - you’ll get `409 Conflict`. Wait for the operation to settle. 
For machine-readable schemas see the interactive API docs. 

### Enum reference  
- `step_type` (case-insensitive): `EMAIL | PHONE | SMS | WHATSAPP | HEYREACH | MANUAL_DIALER`. The alias `linkedin` maps to `HEYREACH`. For Unipile-based LinkedIn pass `UNIPILE` explicitly. 
- `input_type`: `ON_DEMAND | MANUAL_TEMPLATE | AI_GENERATED_TEMPLATE`. Aliases: `template` / `manual` → `MANUAL_TEMPLATE`; `ai` / `ai_template` → `AI_GENERATED_TEMPLATE`. 
- `channel_type`: `SMTP | GMAIL | INBOXKIT | PHONE | LINKEDIN | SMS | WHATSAPP`.  

### `step_data` by channel 
`step_data` is a free-form object whose meaningful keys depend on `step_type`. Unknown keys are silently ignored — a key that belongs to another channel has no effect. Pick the keys for your step’s channel from the sections below. 
````

```` 
EMAIL 

```

{

"subject": "...",

"body": "...",

"instructions": "...",

"email_type": "plain"

}
```

| Key | Type | Description
| `subject` | string | Email subject line
| `body` | string | Email body — supports `{{merge_tokens}}`
| `instructions` | string | Used when `input_type` is `AI_GENERATED_TEMPLATE`
| `email_type` | string | `"plain"` (default) or `"html"` 
HEYREACH / LinkedIn 
`step_type: "HEYREACH"` (or the `linkedin` alias). `linkedin_action_type` is required — a LinkedIn step without it is accepted at create time but fails at send time. 
| `linkedin_action_type` | Copy / config keys
| `CONNECTION_REQUEST` | `linkedin_connection_message` (string), `linkedin_connection_fallback` (optional string), `linkedin_connection_withdraw_days` (optional integer, default `25`)
| `MESSAGE` | `linkedin_message_text` (string) — supports `{{merge_tokens}}`
| `INMAIL` | `linkedin_inmail_subject` (string), `linkedin_inmail_body` (string)
| `FOLLOW` | — (no copy)
| `VIEW_PROFILE` | — (no copy)
| `LIKE_POST` | `linkedin_like_reaction_type` (optional integer: `0`=Like, `1`=Celebrate, `2`=Support, `3`=Love, `4`=Insightful, `5`=Funny; default `1`), `linkedin_like_react_before_days` (optional integer, default `3`) 

```

{

"linkedin_action_type": "MESSAGE",

"linkedin_message_text": "Hi {{first_name}}, ..."

}
```

For AI-generated LinkedIn copy: set `input_type: "AI_GENERATED_TEMPLATE"` on the step, plus `step_data.linkedin_input_mode: "instructions"` and `step_data.linkedin_instructions: "<prompt>"`. Use `linkedin_input_mode: "manual"` with the explicit copy keys above for fixed text. 

`````````` 
PHONE / MANUAL_DIALER 

```

{

"dial_dnc": false,

"phone_options": ["mobile", "direct"]

}
```

| Key | Type | Description
| `dial_dnc` | boolean | Dial Do-Not-Call numbers (default `false`)
| `phone_options` | string[] | Phone types to dial 
SMS / WHATSAPP 

```

{

"message_body": "...",

"media_urls": ["https://..."],

"whatsapp_template_sid": "...",

"whatsapp_template_variables": {}

}
```

| Key | Type | Description
| `message_body` | string | Message text — supports `{{merge_tokens}}`
| `media_urls` | string[] | WhatsApp media attachment URLs
| `whatsapp_template_sid` | string | WhatsApp Business template SID
| `whatsapp_template_variables` | object | Values for the template variables  

## Create Sequence 
`POST /sequences` 
Create a sequence in `drafted` status. You can optionally include `steps[]` and `channels[]` in the same call. 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Sequence name
| `user_email` | string | Yes | Owner email address
| `description` | string | No | Free-form description
| `finish_on_reply` | boolean | No (default `true`) | Stop contacting on reply
| `send_in_same_thread` | boolean | No (default `false`) | Send follow-ups in the same email thread
| `wait_for_new_contacts` | boolean | No (default `false`) | Keep sequence waiting for new enrollments
| `associated_list_id` | integer | No | Contact list to associate
| `campaign_id` | string | No | AI Studio campaign UUID to link
| `sequence_kind` | string | No (default `"cold_outbound"`) | `"cold_outbound"` or `"nurture"`. Immutable after creation.
| `pinned_mailbox_id` | integer | No | Required when `sequence_kind` is `"nurture"`; ignored otherwise. Immutable after creation.
| `steps` | object[] | No | Step configs — see step config table below
| `channels` | object[] | No | Channel configs — see channel config table below 

#### Step config 
| Field | Type | Required | Description
| `step_order` | integer | Yes | Order within the sequence (1-indexed)
| `step_type` | string | Yes | `EMAIL`, `PHONE`, `SMS`, `WHATSAPP`, `HEYREACH`, `MANUAL_DIALER` (or alias `linkedin`)
| `input_type` | string | No (default `ON_DEMAND`) | `ON_DEMAND`, `MANUAL_TEMPLATE`, or `AI_GENERATED_TEMPLATE`
| `time_interval` | integer | No (default `0`) | Delay in seconds after the previous step
| `step_data` | object | No | Step content — see `step_data` by channel above. LinkedIn steps use `linkedin_*` keys, not `body`. 

#### Channel config 
| Field | Type | Required | Description
| `channel_id` | integer | Yes | Mailbox or phone resource ID
| `channel_value` | string | Yes | The address or number (e.g. `[email protected]`)
| `channel_type` | string | Yes | `SMTP`, `GMAIL`, `INBOXKIT`, `PHONE`, `LINKEDIN`, `SMS`, or `WHATSAPP`
| `channel_data` | object | No | Optional metadata 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/sequences" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Q2 Outbound",

"user_email": "[email protected]",

"associated_list_id": 5,

"steps": [

{

"step_order": 1,

"step_type": "EMAIL",

"input_type": "MANUAL_TEMPLATE",

"time_interval": 0,

"step_data": {"subject": "Quick intro", "body": "Hi {{first_name}}..."}

}

],

"channels": [

{

"channel_id": 12,

"channel_value": "[email protected]",

"channel_type": "SMTP"

}

]

}'
```

### Response `201 Created` 

```

{

"data": {

"id": "seq_abc",

"name": "Q2 Outbound",

"status": "drafted",

"created_at": "2026-04-15T10:00:00Z"

}

}
```

````
- ``
- 
- ``
- ````

### Errors 
| Status | Meaning
| `400` | Invalid step or channel config
| `422` | Nurture sequence missing or mismatched `pinned_mailbox_id`  

## Preview Sequence 
`GET /sequences/{sequence_id}/preview` 
Read-only view of a sequence with all steps and channels. Does not enroll anyone. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence UUID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/sequences/seq_abc/preview" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"id": "seq_abc",

"name": "Q2 Outbound",

"status": "drafted",

"description": null,

"steps": [

{

"id": "stp_1",

"step_order": 1,

"step_type": "EMAIL",

"input_type": "MANUAL_TEMPLATE",

"time_interval": 0,

"step_data": {"subject": "Quick intro", "body": "..."}

}

],

"channels": [

{"id": "ch_1", "channel_id": 12, "channel_value": "[email protected]", "channel_type": "SMTP"}

]

}

}
```

## Update Sequence 
`PATCH /sequences/{sequence_id}` 
Update sequence metadata. Send only the fields you want to change. Returns `409` if the sequence is in a transitional status (`scheduling`, `pausing`, `resuming`, `terminating`). 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence UUID 

### Request Body 
All fields are optional. 
| Field | Type | Description
| `name` | string | Sequence name
| `description` | string | Description
| `is_shared` | boolean | Share with the org
| `finish_on_reply` | boolean | Finish on reply
| `send_in_same_thread` | boolean | Same-thread follow-ups
| `wait_for_new_contacts` | boolean | Wait for new contacts
| `schedule_id` | string | UUID from `GET /schedules`
| `appointment_id` | integer | Integer from `GET /event-types`
| `textual_agent_name` | string | Agent name from `GET /voice/dialer/agents` (since 0.9.7)
| `voice_agent_name` | string | Same agent picker — pass the same value as `textual_agent_name` for the common “one agent, all channels” case 
````

```` 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/sequences/seq_abc" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "Q2 Outbound v2", "send_in_same_thread": true}'
```

### Errors 
| Status | Meaning
| `404` | Sequence not found
| `409` | Sequence is in a transitional status (`scheduling`, `pausing`, `resuming`, `terminating`)  

## Update Step 
`PATCH /sequences/{sequence_id}/steps/{step_id}` 
Update a single step. The same `409` rule applies if the parent sequence is transitioning. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence UUID
| `step_id` | string | Step UUID 

### Request Body 
All fields are optional. 
| Field | Type | Description
| `step_data` | object | Step content — see `step_data` by channel above. Replaced wholesale, not merged. Send the complete object every time; any key you omit is dropped.
| `time_interval` | integer | Delay in seconds after the previous step
| `step_type` | string | `EMAIL`, `PHONE`, `SMS`, `WHATSAPP`, `HEYREACH`, `MANUAL_DIALER`
| `input_type` | string | `ON_DEMAND`, `MANUAL_TEMPLATE`, or `AI_GENERATED_TEMPLATE` 
``

`````` 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/sequences/seq_abc/steps/stp_1" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"step_data": {"subject": "Quick intro v2", "body": "Updated..."}}'
```

## Pause / Resume 
`POST /sequences/{sequence_id}/pause` `POST /sequences/{sequence_id}/resume` 
Pause a live sequence (or resume a paused one). Returns the number of contacts affected. 

### Response 

```

{

"data": {

"sequence_id": "seq_abc",

"status": "paused",

"contacts_affected": 150

}

}
```

## Analytics 
`GET /sequences/{sequence_id}/analytics` 
Returns a comprehensive analytics report - overview KPIs, performance over time, engagement breakdown, contact distribution, per-step metrics, and sender distribution. The shape mirrors the internal `SequenceReports` model. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/sequences/seq_abc/analytics" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"overview": {"sent": 320, "opened": 180, "replied": 22},

"performance": {"open_rate": 0.56, "reply_rate": 0.07},

"engagement": {"by_day": [...]},

"timeline": [...],

"contact_distribution": {"active": 150, "completed": 100, "stopped": 70},

"step_breakdown": [

{"step_id": "stp_1", "sent": 320, "opened": 180}

],

"step_creation_methods": [...],

"sender_distribution": [...]

}

}
```

The full schema lives at /api/v1/docs under `SequenceAnalyticsResponse`.  

## Delete (Archive) 
`DELETE /sequences/{sequence_id}` 
Soft-deletes a sequence by setting `is_archived = true`. Already-archived sequences return `400`. Sequences in certain non-terminal states cannot be archived and return `409`. 

### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/sequences/seq_abc" \

-H "Authorization: Bearer $API_KEY"
```

### Errors 
| Status | Meaning
| `400` | Sequence is already archived
| `404` | Sequence not found
| `409` | Sequence cannot be archived in its current state
