<!-- https://docs.graph8.com/developers/sequences/ -->
# Sequences

```````` 
Sequences are automated multi-step email campaigns. Use these endpoints to list sequences, control their execution, and manage enrolled contacts. 
For authoring (create / preview / update steps / archive / analytics) see Sequence Lifecycle.  

## List Sequences 
`GET /sequences` 
Returns all sequences with optional status filter and pagination. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | 1 | Page number
| `limit` | integer | 50 | Items per page (max 200)
| `status` | string | — | Filter by status (`drafted`, `live`, `paused`, `completed`)
| `sequence_kind` | string | — | Filter by kind — `cold_outbound` or `nurture`. Omit to list every kind. 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl "https://be.graph8.com/api/v1/sequences?status=live" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/sequences",

headers=HEADERS,

params={"status": "live"}

)
```

### Response 

```

{

"data": [

{

"id": "seq_uuid",

"name": "Q2 Outbound",

"status": "live",

"user_email": "[email protected]",

"step_count": 3,

"contact_count": 200,

"sequence_kind": "cold_outbound",

"associated_list_id": 12345,

"created_at": "2026-02-15T10:00:00",

"updated_at": "2026-02-20T14:30:00"

}

],

"pagination": {

"page": 1,

"limit": 50,

"total": 1,

"has_next": false

}

}
```

## Get Sequence 
`GET /sequences/{sequence_id}` 
Returns detailed information about a sequence, including configuration flags. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence ID 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl "https://be.graph8.com/api/v1/sequences/seq-abc" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/sequences/seq-abc",

headers=HEADERS

)
```

### Response 

```

{

"data": {

"id": "seq-abc",

"name": "Q2 Outbound",

"description": "Multi-touch outbound campaign for Q2 targets",

"status": "live",

"user_email": "[email protected]",

"associated_list_id": 12345,

"finish_on_reply": true,

"send_in_same_thread": false,

"wait_for_new_contacts": false,

"schedule_id": "sched_uuid",

"appointment_id": 1,

"textual_agent_name": "Outbound SDR",

"voice_agent_name": null,

"sequence_kind": "cold_outbound",

"pinned_mailbox_id": null,

"paused_at": null,

"resumed_at": null,

"created_at": "2026-02-15T10:00:00",

"updated_at": "2026-02-20T14:30:00"

}

}
```

## Run Sequence 
`POST /sequences/{sequence_id}/run` 
Start a drafted sequence. Transitions its status from `drafted` to `live`. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence ID 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/sequences/seq-abc/run" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.post(

f"{BASE_URL}/sequences/seq-abc/run",

headers=HEADERS

)
```

### Response 

```

{

"data": {

"sequence_id": "seq-abc",

"status": "live",

"contacts_affected": 200

}

}
```

## Pause Sequence 
`POST /sequences/{sequence_id}/pause` 
Pause a live sequence. No request body required. Scheduled sends are held until the sequence is resumed. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence ID 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/sequences/seq-abc/pause" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"sequence_id": "seq-abc",

"status": "paused",

"contacts_affected": 150

}

}
```

## Resume Sequence 
`POST /sequences/{sequence_id}/resume` 
Resume a paused sequence. No request body required. Held sends are rescheduled. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence ID 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/sequences/seq-abc/resume" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"sequence_id": "seq-abc",

"status": "live",

"contacts_affected": 150

}

}
```

## List Sequence Contacts 
`GET /sequences/{sequence_id}/contacts` 
Returns contacts enrolled in a sequence with their current state. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence ID 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | 1 | Page number
| `limit` | integer | 50 | Items per page (max 200)
| `state` | string | — | Filter by contact state 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl "https://be.graph8.com/api/v1/sequences/seq-abc/contacts?state=active" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/sequences/seq-abc/contacts",

headers=HEADERS,

params={"state": "active"}

)
```

### Response 

```

{

"data": [

{

"id": "sc-uuid",

"contact_id": 101,

"state": "waiting",

"current_step_order": 1,

"created_at": "2026-02-15T10:00:00",

"updated_at": "2026-02-18T09:00:00"

}

],

"pagination": {

"page": 1,

"limit": 50,

"total": 1,

"has_next": false

}

}
```

## Add Contacts to Sequence 
`POST /sequences/{sequence_id}/contacts` 
Add contacts to a live or drafted sequence. Returns `201 Created`. 

### Path Parameters 
| Parameter | Type | Description
| `sequence_id` | string | Sequence ID 

### Request Body 
| Field | Type | Required | Description
| `contact_ids` | integer[] | Yes | Contact IDs to add
| `list_id` | integer | Yes | List ID the contacts belong to 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/sequences/seq-abc/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"contact_ids": [101, 102], "list_id": 12345}'
```

```

response = requests.post(

f"{BASE_URL}/sequences/seq-abc/contacts",

headers=HEADERS,

json={"contact_ids": [101, 102], "list_id": 12345}

)
```

### Response 

```

{

"data": {

"sequence_id": "seq-abc",

"status": "contacts_added",

"contacts_affected": 2

}

}
```
