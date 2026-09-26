<!-- https://docs.graph8.com/developers/deals/ -->
# Deals

Deals represent revenue opportunities in your pipeline. Each deal has a name, value, stage, and can be associated with a company and contacts.  

## List Pipelines 
`GET /deals/pipelines` 
Returns all deal pipelines and their stages. Use this to get valid `pipeline_id` and `stage_id` values before creating or updating deals. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/deals/pipelines" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [{

"id": "pipeline_uuid",

"name": "Sales",

"is_default": true,

"stages": [{

"id": "stage_uuid",

"name": "Discovery",

"probability": 30,

"position": 0,

"stage_type": "open",

"color": "#6B7280",

"required_elements": ["pain_identified"],

"recommended_elements": [],

"channel_scripts": {

"call": "...",

"email": "...",

"linkedin": "..."

}

}]

}]

}
```

## List Deals 
`GET /deals` 
Returns all deals across the organization with pagination and optional filters. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | `1` | Page number
| `limit` | integer | `50` | Items per page
| `stage_id` | string | — | Filter by stage ID
| `pipeline_id` | string | — | Filter by pipeline ID
| `search` | string | — | Search by deal name (partial match) 
All query parameters are optional. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/deals?search=Acme&limit=50" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [{

"id": "deal_uuid",

"name": "...",

"description": "...",

"amount": 50000.0,

"currency": "USD",

"stage_id": "...",

"stage_name": "Discovery",

"pipeline_id": "...",

"company_id": 1,

"owner_id": "user_x",

"close_date": "2026-09-30",

"created_at": "...",

"updated_at": "...",

"contact_count": 3,

"primary_contact": {

"id": 5500429,

"name": "Vince",

"email": "[email protected]",

"title": "VP Sales",

"role": "champion"

},

"contacts": null

}],

"pagination": { "page": 1, "limit": 50, "total": 1, "has_next": false }

}
```

List responses include `contact_count` (live count from deal contacts) and `primary_contact` (resolves the deal’s primary contact ID, falling back to the oldest linked contact). The full nested `contacts` list is intentionally `null` on list responses to keep payloads bounded — use `GET /deals/{deal_id}` for the full set.  

## Create Deal 
`POST /deals` → `201 Created` 
Creates a new deal. If `pipeline_id` is not specified, the organization’s default pipeline is used. If `stage_id` is not specified, the first stage in the pipeline is used. 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Deal name
| `company_id` | integer | No | Company to associate
| `description` | string | No | Deal description
| `amount` | number | No | Monetary value
| `currency` | string | No | Currency code (default: `USD`)
| `stage_id` | string | No | Stage ID — defaults to first stage of default pipeline
| `pipeline_id` | string | No | Pipeline ID — defaults to org default
| `close_date` | string | No | Expected close date (ISO 8601, e.g. `2026-09-30`)
| `owner_id` | string | No | Deal owner (user ID or email); omitted = un-owned
| `contact_ids` | array of integers | No | `mashup_contact_id`s to attach to the deal 
`owner_id` is stored as-is (`String(255)`); whatever convention your org uses (user UUID or email) is preserved. Omitting it leaves the deal un-owned. 
`contact_ids` accepts canonical `mashup_contact_id`s — the same ID space as `GET /contacts/{id}`. Attachments are idempotent: already-linked contacts are skipped silently. When `contact_ids` is provided, the response includes the resolved `contacts` list, `contact_count`, and `primary_contact`. When omitted or empty, `contact_count` is `0`, `primary_contact` is `null`, and `contacts` is `null`. 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/deals" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Acme Q3",

"amount": 50000,

"currency": "USD",

"company_id": 1,

"close_date": "2026-09-30",

"owner_id": "[email protected]",

"contact_ids": [5500429, 5500914]

}'
```

Returns `201 Created` with the full DealResponse including resolved contacts when `contact_ids` are provided.  

## Get Deal 
`GET /deals/{deal_id}` 
Returns a single deal by ID. This is the detail endpoint — it includes the full nested `contacts` list (omitted on list responses). `primary_contact` and `contact_count` mirror the list response. 

### Path Parameters 
| Parameter | Type | Description
| `deal_id` | string | Deal UUID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/deals/deal_uuid" \

-H "Authorization: Bearer $API_KEY"
```

### Response 
The `contacts` array on the detail endpoint includes each linked contact with their role within the deal. 

```

{

"data": {

"id": "deal_uuid",

"name": "Acme Q3",

"description": "...",

"amount": 50000.0,

"currency": "USD",

"stage_id": "stage_uuid",

"stage_name": "Discovery",

"pipeline_id": "pipeline_uuid",

"company_id": 1,

"owner_id": "user_x",

"close_date": "2026-09-30",

"created_at": "...",

"updated_at": "...",

"contact_count": 2,

"primary_contact": {

"id": 5500429,

"name": "Vince",

"email": "[email protected]",

"title": "VP Sales",

"role": "champion"

},

"contacts": [

{ "id": 5500429, "name": "Vince", "email": "[email protected]", "title": "VP Sales", "role": "champion" },

{ "id": 5500914, "name": "Dana", "email": "[email protected]", "title": "CTO", "role": "decision_maker" }

]

}

}
```

Contact roles can be: `champion`, `decision_maker`, `influencer`, `blocker`, `coach`, or `end_user`.  

## Update Deal 
`PATCH /deals/{deal_id}` 
Partial update — send only the fields you want to change. Returns `400` only if no actionable fields and both contact delta lists are empty. 

### Path Parameters 
| Parameter | Type | Description
| `deal_id` | string | Deal UUID 

### Request Body 
All fields are optional. 
| Field | Type | Description
| `name` | string | Deal name
| `description` | string | Deal description
| `amount` | number | Monetary value
| `currency` | string | Currency code
| `stage_id` | string | Stage ID
| `close_date` | string | Expected close date (ISO 8601)
| `owner_id` | string | Reassign owner; pass explicit `null` to clear; omit to leave unchanged
| `add_contact_ids` | array of integers | Contact IDs to link (delta, not replace-all; idempotent)
| `remove_contact_ids` | array of integers | Contact IDs to unlink (delta; idempotent; removes run before adds)
| `contact_roles` | object | Buying-committee role per contact, keyed by contact ID: `{"5500429": "champion"}`. `null` clears a role 
`add_contact_ids` and `remove_contact_ids` are delta-style — an empty list is a no-op; omitting the field is also a no-op. The response includes `contact_count` and `primary_contact` post-update; `contacts` remains `null` (use `GET /deals/{deal_id}` for the full list). 
`contact_roles` records what each contact does in the deal. Valid roles are `champion`, `decision_maker`, `influencer`, `blocker`, `coach` and `end_user`; `null` clears a role, and anything else returns `422` listing the vocabulary. Keys are contact IDs — JSON object keys are strings, so send `"5500429"`, not `5500429`; a non-numeric key is `422`. 
Contact operations run in a fixed order inside one transaction: `remove_contact_ids`, then `add_contact_ids`, then `contact_roles`. So a contact you link in this request can be given a role in the same request. A contact named in `contact_roles` that is neither already on the deal nor being added returns `422` naming the ID, and the whole update is rolled back — it is never silently skipped. Omitting `contact_roles` leaves every existing role untouched. 
Read roles back from `GET /deals/{deal_id}` (`contacts[].role`). To set just one, use Set Contact Role below. 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/deals/deal_uuid" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"stage_id": "stage_uuid",

"amount": 75000,

"add_contact_ids": [5500999],

"remove_contact_ids": [5500914],

"contact_roles": { "5500999": "champion", "5500429": "decision_maker" }

}'
```

## Set Contact Role 
`PUT /deals/{deal_id}/contacts/{contact_id}` 
Set or clear one contact’s buying-committee role on a deal. For a whole committee in one call, use `contact_roles` on Update Deal instead. 
This endpoint never creates a link — the contact must already be on the deal. Attach it first with `add_contact_ids` on `PATCH /deals/{deal_id}`. 

### Path Parameters 
| Parameter | Type | Description
| `deal_id` | string | Deal UUID
| `contact_id` | integer | Contact ID, the same ID returned by `GET /contacts/{contact_id}` 

### Request Body 
| Field | Type | Description
| `role` | string or null | Required. One of `champion`, `decision_maker`, `influencer`, `blocker`, `coach`, `end_user`. Pass `null` to clear the role 
`role` is required but nullable: `{"role": null}` clears the role, while an empty body `{}` returns `422`. Returns `404` if the deal is not in your organization or the contact is not linked to it, and `422` for a role outside the vocabulary. Re-sending a role the contact already has writes nothing. 

### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/deals/deal_uuid/contacts/5500429" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{ "role": "champion" }'
```

### Response 

```

{

"data": {

"id": 5500429,

"name": "Vince Reyes",

"email": "[email protected]",

"title": "VP Sales",

"role": "champion"

}

}
```

## Delete Deal 
`DELETE /deals/{deal_id}` 

### Path Parameters 
| Parameter | Type | Description
| `deal_id` | string | Deal UUID 

### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/deals/deal_uuid" \

-H "Authorization: Bearer $API_KEY"
```

### Response 
Returns `200` with `{"data": {"deleted": true}}` on success.  

## Get Contact Deals 
`GET /contacts/{contact_id}/deals` 
Returns all deals associated with a specific contact. 

### Path Parameters 
| Parameter | Type | Description
| `contact_id` | integer | Contact ID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/contacts/5500429/deals" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [{

"deal_id": "...",

"name": "...",

"stage": "...",

"value": 50000.0,

"currency": "USD",

"role": "...",

"pipeline_id": "...",

"close_date": "...",

"owner_id": "...",

"created_at": "..."

}]

}
```

## Get Company Deals 
`GET /companies/{company_id}/deals` 
Returns all deals associated with a specific company. Same response shape as `GET /contacts/{contact_id}/deals`. 

### Path Parameters 
| Parameter | Type | Description
| `company_id` | integer | Company ID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/companies/1/deals" \

-H "Authorization: Bearer $API_KEY"
```
