<!-- https://docs.graph8.com/developers/launch-helpers/ -->
# Launch Helpers

These discovery endpoints return the values you need when filling in the four pre-launch fields on `POST /campaigns/{id}/launch` and on `PATCH /sequences/{id}`:  
- `sender_mailbox_ids` — mailbox IDs for sending 
- `textual_agent_name` — the `agent_name` from `GET /voice/dialer/agents` (unified agent picker, returns both agents and twins) 
- `voice_agent_name` — same source as `textual_agent_name` 
- `schedule_id` — the `id` from `GET /schedules` 
- `appointment_id` — the `id` from `GET /event-types`  

````````  

## List Schedules 
`GET /schedules` 
Returns send-window schedules for your org. Pass the row’s `id` back as `schedule_id` when launching a campaign or patching a sequence. 
Days that have no configured window are omitted from each row’s `windows` array. Backed by the sequencer schedules service (`sequencer/utils/schedules`). 

### Query Parameters 
| Parameter | Type | Default | Description
| `include_archived` | boolean | `false` | When `true`, archived schedules are included in the response
| `search` | string | — | Filter by schedule name (partial match) 
All parameters are optional. 

### Example  

-   cURL     

Terminal window
```

# All active schedules

curl "https://be.graph8.com/api/v1/schedules" \

-H "Authorization: Bearer $API_KEY"

# Include archived schedules

curl "https://be.graph8.com/api/v1/schedules?include_archived=true" \

-H "Authorization: Bearer $API_KEY"

# Search by name

curl "https://be.graph8.com/api/v1/schedules?search=europe" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "...",

"name": "...",

"description": "...",

"timezone": "Europe/Madrid",

"windows": [

{ "day": "monday",    "start": "09:00", "end": "17:00" },

{ "day": "tuesday",   "start": "09:00", "end": "17:00" },

{ "day": "wednesday", "start": "09:00", "end": "17:00" },

{ "day": "thursday",  "start": "09:00", "end": "17:00" },

{ "day": "friday",    "start": "09:00", "end": "17:00" }

],

"is_archived": false

}

]

}
```

## List Event Types 
`GET /event-types` 
Returns bookable Cal.com event types (booking links) for your org. Pass the row’s integer `id` back as `appointment_id` when launching a campaign or patching a sequence. 
The `slug` field is what appears in the public booking URL (`appointments/team/{org}/{slug}`). Backed by `EventTypesHandler.handle_list` — the same handler powering the in-app `/appointments/event-types` picker, so per-user visibility rules apply identically. 

### Query Parameters 
| Parameter | Type | Default | Description
| `include_hidden` | boolean | `false` | When `true`, hidden event types are included in the response
| `scheduling_type` | string | — | Filter by scheduling type. Allowed values: `managed`, `round_robin`, `collective` 
All parameters are optional. 

### Example  

-   cURL     

Terminal window
```

# All visible event types

curl "https://be.graph8.com/api/v1/event-types" \

-H "Authorization: Bearer $API_KEY"

# Only round-robin event types

curl "https://be.graph8.com/api/v1/event-types?scheduling_type=round_robin" \

-H "Authorization: Bearer $API_KEY"

# Include hidden event types

curl "https://be.graph8.com/api/v1/event-types?include_hidden=true" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": 42,

"title": "Intro call",

"slug": "intro-call",

"length": 30,

"description": "...",

"scheduling_type": "round_robin",

"hidden": false,

"schedule_id": 7

}

]

}
```
