<!-- https://docs.graph8.com/developers/gtm-context/ -->
# GTM Context

These endpoints expose the org’s GTM context — the same data Studio uses to author campaigns. Use them from AI agents (MCP), CLI tools, or integrations to ground campaign generation in your specific brand, ICPs, and recent activity. 
| Endpoint | Method | Description
| `/global-context/documents` | GET | List global context documents (44 per org — brand brief, value props, etc.)
| `/global-context/documents/{doc_id}` | PATCH | Update a Context-bucket document
| `/personas` | GET | List campaign-builder personas
| `/icps` | GET | List Ideal Customer Profiles
| `/mailboxes` | GET | List sending mailboxes
| `/mailboxes/{mailbox_id}/warmup` | GET | Live warmup analytics for a mailbox
| `/intelligence-data` | GET | List machine-generated intelligence documents (read-only)
| `/research-reports` | GET | List AI research reports
| `/research-reports/{report_id}` | PATCH | Update a research report
| `/activities` | GET | List recent CRM activities 
For machine-readable schemas see the interactive API docs.  

## List Global Context Documents 
`GET /global-context/documents` 
Returns the org’s global context documents. Each org has 44 of these total: 21 context docs (brand brief, value props, personas, ICPs, messaging house, etc.), 16 intelligence docs (website scrape, competitor data, keywords), 6 research reports, and 1 campaign intelligence brief. 

### Query Parameters 
| Parameter | Type | Default | Description
| `category` | string | — | Filter by context category
| `include_content` | boolean | `true` | Return the document `content` body. Pass `false` for a lighter metadata-only listing that omits the `content` key.
| `limit` | integer | `50` | 1–200 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/global-context/documents?limit=10" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "ctx_001",

"display_name": "Brand Brief",

"file_type": "brand_brief",

"category": "brand",

"folder_path": "/context/brand",

"status": "completed",

"priority": 100,

"version": 3,

"content": "# Acme brand brief\n\nMission: ...",

"created_at": "2026-03-01T10:00:00Z",

"updated_at": "2026-04-10T14:30:00Z"

}

]

}
```

Documents are sorted by `priority DESC, updated_at DESC`.  

## Update Global Context Document 
`PATCH /global-context/documents/{doc_id}` 
Update a Context-bucket document. The request is partial — send at least one of `content` or `status`. Each save records a `DocumentVersion` snapshot (same as the in-app Studio editor, so history is consistent across UI, API, and MCP). 

### Path Parameters 
| Parameter | Type | Description
| `doc_id` | string | Document ID 

### Request Body 
| Field | Type | Description
| `content` | string | Updated document body (stored at `meta_data.content`)
| `status` | string | Document status, e.g. `"completed"` or `"draft"` 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/global-context/documents/ctx_001" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"content": "Updated brand brief body...",

"status": "completed"

}'
```

### Response 

```

{

"data": {

"id": "ctx_001",

"display_name": "Brand Brief",

"file_type": "brand_brief",

"category": "brand",

"status": "completed",

"version_number": 4,

"content": "Updated brand brief body...",

"updated_at": "2026-04-11T09:00:00Z"

}

}
```

### Errors 
| Status | Meaning
| `400` | Neither `content` nor `status` was provided
| `404` | Document not found in your org  

## List Personas 
`GET /personas` 
Returns campaign-builder personas (target buyer profiles with messaging signals). 

### Query Parameters 
| Parameter | Type | Default | Description
| `status` | string | - | Filter by persona status
| `limit` | integer | 50 | 1-200 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/personas" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "per_001",

"title": "VP of Marketing at mid-market SaaS",

"priority": 1,

"confidence": "high",

"confidence_score": 0.9,

"why_target": "Owns demand gen budget...",

"key_signals": ["hiring SDRs", "expanding into NA"],

"expected_receptivity": "warm",

"campaign_approach": "Lead with peer proof",

"recommended_goal": "Book discovery call",

"status": "approved",

"pinned": true,

"source": "studio_generated",

"created_at": "2026-03-15T10:00:00Z",

"updated_at": "2026-04-01T14:30:00Z"

}

]

}
```

Sorted: pinned first, then by `priority ASC, updated_at DESC`.  

## List ICPs 
`GET /icps` 
Returns Ideal Customer Profiles (firmographic + signal definitions used to find target accounts). 

### Query Parameters 
| Parameter | Type | Default | Description
| `status` | string | - | Filter by ICP status
| `limit` | integer | 50 | 1-200 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/icps" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "icp_001",

"name": "Mid-market SaaS - North America",

"description": "Series B-D SaaS companies, 100-1000 FTE, US/CA HQ",

"firmographics": {"employee_min": 100, "employee_max": 1000, "country": ["US", "CA"]},

"tech_stack": {"required": ["Salesforce"]},

"buying_signals": ["hiring SDRs", "raised funding"],

"fit_score": 0.85,

"opportunity_score": 0.7,

"readiness_score": 0.8,

"total_score": 0.78,

"status": "approved",

"pinned": false,

"priority": 2,

"created_at": "2026-03-15T10:00:00Z",

"updated_at": "2026-04-01T14:30:00Z"

}

]

}
```

## List Mailboxes 
`GET /mailboxes` 
Returns sending mailboxes connected to the org, including warmup status from the configured provider. 

### Query Parameters 
| Parameter | Type | Default | Description
| `limit` | integer | `100` | 1–500
| `include_archived` | boolean | `false` | Include archived mailboxes
| `connection_status` | string | — | Filter by connection status (e.g. `"active"`) 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/mailboxes?limit=50" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "mbx_001",

"email": "[email protected]",

"display_name": "Rep Name",

"provider": "gmail",

"source": "oauth",

"connection_status": "active",

"is_archived": false,

"shared_with_team": false,

"team_id": null,

"team_name": null,

"daily_limit": 50,

"created_by": "user_x",

"created_at": "2026-01-01T00:00:00Z",

"updated_at": "2026-04-10T14:30:00Z",

"warmup_provider": "smartlead",

"warmup_status": "active",

"smartlead_warmup_enabled": true

}

]

}
```

## Get Mailbox Warmup 
`GET /mailboxes/{mailbox_id}/warmup` 
Live provider fetch for warmup analytics and settings for a specific mailbox. 

### Path Parameters 
| Parameter | Type | Description
| `mailbox_id` | string | Mailbox ID 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/mailboxes/mbx_001/warmup" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"success": true,

"warmup_enabled": true,

"provider": "smartlead",

"analytics": {},

"warmup_settings": {}

}
```

## List Intelligence Data 
`GET /intelligence-data` 
Returns machine-generated intelligence documents for the org. This bucket is intentionally read-only — it is machine-generated and has no manual-edit path. 

### Query Parameters 
| Parameter | Type | Default | Description
| `data_type` | string | — | Filter by type: `website_scrape`, `company_enrichment`, `competitor_discovery`, `company_keywords`, `product_inventory`, `organic_keywords`, `paid_keywords`, or others
| `include_content` | boolean | `false` | Include the full `data` payload in each row
| `limit` | integer | `50` | 1–200 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/intelligence-data?data_type=website_scrape" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "int_001",

"website_url": "https://acme.com",

"data_type": "website_scrape",

"status": "completed",

"data": {},

"collected_at": "2026-03-01T08:00:00Z",

"created_at": "2026-03-01T08:05:00Z",

"updated_at": "2026-03-01T08:05:00Z"

}

]

}
```

## List Research Reports 
`GET /research-reports` 
Returns AI-generated research reports for the org (buyer psychology, competitive teardown, GTM channel analysis, etc.). 

### Query Parameters 
| Parameter | Type | Default | Description
| `report_type` | string | — | Filter by type: `buyer_psychology`, `competitive_teardown`, `gtm_channel`, `industry_analyst`, `review_sentiment`, or `voice_of_customer`
| `include_content` | boolean | `false` | Include full `content` and `markdown_content` in each row
| `limit` | integer | `50` | 1–200 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/research-reports?report_type=buyer_psychology" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "rpt_001",

"website_url": "https://acme.com",

"report_type": "buyer_psychology",

"report_number": 1,

"status": "completed",

"content": {},

"markdown_content": "# Buyer Psychology Report\n\n...",

"created_at": "2026-03-05T10:00:00Z",

"updated_at": "2026-04-01T14:30:00Z"

}

]

}
```

## Update Research Report 
`PATCH /research-reports/{report_id}` 
Update a Research-bucket report. The request is partial — send at least one of `markdown_content` or `status`. Editing `markdown_content` records a `DocumentVersion` snapshot and re-indexes the report to RAG so search stays fresh. 

### Path Parameters 
| Parameter | Type | Description
| `report_id` | string | Research report ID 

### Request Body 
| Field | Type | Description
| `markdown_content` | string | Updated report body — triggers RAG re-index
| `status` | string | Report status, e.g. `"approved"` or `"completed"` 

```` 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/research-reports/rpt_001" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"markdown_content": "# Updated Buyer Psychology Report\n\n...",

"status": "approved"

}'
```

### Response 

```

{

"data": {

"id": "rpt_001",

"report_type": "buyer_psychology",

"status": "approved",

"version_number": 2,

"markdown_content": "# Updated Buyer Psychology Report\n\n...",

"updated_at": "2026-04-12T10:00:00Z"

}

}
```

`version_number` is `null` when only `status` changed (no content snapshot is recorded for status-only updates). 

### Errors 
| Status | Meaning
| `400` | Neither `markdown_content` nor `status` was provided
| `404` | Report not found in your org  

## List Activities 
`GET /activities` 
Returns recent CRM activities (calls, meetings, emails, notes) across the org. 

### Query Parameters 
| Parameter | Type | Default | Description
| `activity_type` | string | - | Filter by type
| `contact_id` | string | - | Filter to one contact
| `company_id` | string | - | Filter to one company
| `deal_id` | string | - | Filter to one deal
| `limit` | integer | 50 | 1-200 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/activities?activity_type=meeting&limit=20" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "act_001",

"activity_type": "meeting",

"activity_subtype": "discovery_call",

"subject": "Discovery call with Acme",

"description": "Walked through current outbound stack...",

"company_id": "comp_42",

"deal_id": "deal_7",

"contact_id": "cont_101",

"owner_id": "user_5",

"owner_name": "Jane Rep",

"activity_date": "2026-04-10T15:00:00Z",

"duration_minutes": 30,

"status": "completed",

"outcome": "qualified",

"next_steps": "Send pricing options by Friday",

"extra_data": {},

"source": "calendar_sync",

"external_id": "gcal_evt_xyz"

}

]

}
```

Sorted by `activity_date DESC`.
