<!-- https://docs.graph8.com/developers/inbox/ -->
# Inbox

The Inbox API exposes graph8’s unified inbox across email, SMS, and LinkedIn (HeyReach) in a single thread shape. Use it to build replies and assignments into your own surface, or to power AI agents that triage inbound messages. 
The `channel` query parameter or request field always uses the developer-facing values: 
| Channel value | Internal channel
| `email` | email
| `sms` | sms
| `linkedin` | heyreach 
Threads on the LinkedIn channel return `channel: "linkedin"` in responses. 
| Endpoint | Method | Description
| `/inbox` | GET | List threads across channels
| `/inbox/{reply_id}` | GET | Get a single thread
| `/inbox/{reply_id}/assign` | POST | Assign a user to a thread
| `/inbox/{reply_id}/tag` | POST | Add tags to a thread
| `/inbox/{reply_id}/draft` | GET | Generate an AI draft (charges credits)
| `/inbox/{reply_id}/send` | POST | Send a reply on a channel 
For machine-readable schemas see the interactive API docs.  

## List Inbox Threads 
`GET /inbox` 
Returns paginated threads across all channels (or a single channel via filter). 

### Query Parameters 
| Parameter | Type | Default | Description
| `channel` | string | - | `email`, `sms`, or `linkedin`. Omit for all
| `sequence_id` | string | - | Filter by sequence (campaign) ID
| `status` | string | - | Filter by thread status
| `assignee` | string | - | Filter to threads assigned to this email
| `tag` | string | - | Filter by tag ID
| `exclude_tag_ids` | string[] | - | Array of tag IDs to exclude from results. Threads that carry any of the listed tags are hidden. Pass the parameter multiple times (or as a comma-separated list) to exclude several tags at once.
| `page` | integer | 1 | Page number (>= 1)
| `page_size` | integer | 50 | 1-100 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl "https://be.graph8.com/api/v1/inbox?channel=email&page_size=20" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/inbox",

headers=HEADERS,

params={"channel": "email", "page_size": 20},

)

threads = response.json()["data"]
```

### Response 

```

{

"data": [

{

"id": "thr_abc123",

"channel": "email",

"subject": "Re: Q2 outbound",

"contact": {"email": "[email protected]", "name": "Jane Smith", "company": "Acme Corp"},

"messages": [

{

"message_id": "msg_001",

"from_address": "[email protected]",

"to_addresses": ["[email protected]"],

"content": "Sounds great - let's chat Tuesday.",

"responder": "OTHER",

"date": "2026-04-15T14:30:00Z",

"is_draft": false

}

],

"status": "open",

"tags": [{"id": "tag_1", "name": "interested"}],

"assignees": [{"email": "[email protected]", "name": "Sales Rep"}],

"created_at": "2026-04-15T14:30:00Z",

"updated_at": "2026-04-15T14:30:00Z"

}

],

"pagination": {"page": 1, "limit": 20, "total": 1, "has_next": false}

}
```

The `responder` field on a message is `USER` (a graph8 user replied), `AI` (graph8 sent an AI-drafted reply), or `OTHER` (the contact). `status` is `open`, `responded`, or `ai_responded`. 

````  

## Get Thread 
`GET /inbox/{reply_id}` 
Returns one thread by ID. Pass the matching `channel` query parameter so the right backing store is queried. 

### Query Parameters 
| Parameter | Type | Default | Description
| `channel` | string | `email` | `email`, `sms`, or `linkedin` 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/inbox/thr_abc123?channel=email" \

-H "Authorization: Bearer $API_KEY"
```

### Errors 
| Status | Meaning
| `400` | Invalid `reply_id` (null/undefined/empty rejected early)  

## Assign Reply 
`POST /inbox/{reply_id}/assign` 
Assign a user (by email) to the thread. 

### Request Body 
| Field | Type | Required | Description
| `assignee_email` | string | Yes | Email of the user to assign 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/inbox/thr_abc123/assign?channel=email" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"assignee_email": "[email protected]"}'
```

### Response 

```

{ "data": { "assigned": true, "assignee": "[email protected]", "count": 1 } }
```

## Tag Reply 
`POST /inbox/{reply_id}/tag` 
Attach one or more tags to a thread. Tags must already exist in your workspace - this endpoint does not create them. 

### Query Parameters 
| Parameter | Type | Default | Description
| `channel` | string | `email` | `email`, `sms`, or `linkedin` 

### Request Body 
| Field | Type | Required | Description
| `tag_ids` | string[] | Yes | Tag IDs to associate 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/inbox/thr_abc123/tag?channel=email" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"tag_ids": ["tag_interested", "tag_q2"]}'
```

### Response 

```

{ "data": { "tagged": true, "tag_count": 2 } }
```

## Generate AI Draft 
`GET /inbox/{reply_id}/draft` 
Generate an AI-drafted reply for the thread. This charges credits. A `402 Payment Required` is returned when the org has insufficient credits. 

### Query Parameters 
| Parameter | Type | Default | Description
| `channel` | string | `email` | Channel of the source thread 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/inbox/thr_abc123/draft?channel=email" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"content": "<p>Tuesday at 10am works great...</p>",

"plain_content": "Tuesday at 10am works great...",

"credits_charged": 1

}

}
```

### Errors 
| Status | Meaning
| `402` | Insufficient credits for draft generation  

## Send Reply 
`POST /inbox/{reply_id}/send` 
Send a reply on the chosen channel. The required fields differ per channel. 

### Request Body 
| Field | Type | Required | Description
| `body` | string | Yes | Message body (HTML for email; plain text for SMS/LinkedIn)
| `channel` | string | Yes | `email`, `sms`, or `linkedin`
| `subject` | string | Email only | Email subject
| `to` | string | Email/SMS | Recipient address or phone number
| `from_address` | string | No | Email mailbox, Twilio number, or LinkedIn account ID 
For LinkedIn, `from_address` must be a numeric LinkedIn account ID. 

### Examples  

-   Email  
-   SMS  
-   LinkedIn     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/inbox/thr_abc123/send" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"channel": "email",

"body": "<p>Tuesday at 10am works.</p>",

"subject": "Re: Q2 outbound",

"to": "[email protected]",

"from_address": "[email protected]"

}'
```

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/inbox/thr_sms_xyz/send" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"channel": "sms",

"body": "Confirmed for Tuesday 10am.",

"to": "+15555550100",

"from_address": "+15555550199"

}'
```

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/inbox/conv_li_999/send" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"channel": "linkedin",

"body": "Thanks for connecting!",

"from_address": "12345"

}'
```

### Response 

```

{

"data": {

"message_id": "msg_outbound_001",

"status": "sent",

"channel": "email"

}

}
```

### Errors 
| Status | Meaning
| `400` | Missing `to` or `from_address` for the channel; LinkedIn `from_address` not numeric; unsupported channel
