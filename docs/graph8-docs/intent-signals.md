<!-- https://docs.graph8.com/developers/intent-signals/ -->
# Intent & Signals

graph8’s intent surface is two layers:  
- `/api/v1/intent/*` — full account-level intent tracking. Keyword groups, page visitor records, contact-level engagement, account-level intent search. 
- `/api/v1/public/signals/company` — a single endpoint that returns an aggregate intent score for one domain. Write-key safe (works from browser code).  
Use the public endpoint for quick lookups in a browser; use the server-side intent surface for prospecting / SDR workflows. 

```` 

## Get Intent Stats 
`GET /intent/stats` 
Returns ClickHouse index stats for your org. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/intent/stats" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"doc_count": 482000,

"size_bytes": 1234567890

}

}
```

## List Pages by Domain 
`POST /intent/pages-by-domain` 
Returns tracked pages for a given domain. 

### Request Body 
| Field | Type | Required | Description
| `domain` | string | Yes | Domain to look up (3–253 chars, e.g. `"cognism.com"`)
| `limit` | integer | No | Max results (1–500, default `200`)
| `offset` | integer | No | Pagination offset (≥0, default `0`) 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/pages-by-domain" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"domain": "cognism.com",

"limit": 200,

"offset": 0

}'
```

### Response 

```

{

"data": {

"domain": "cognism.com",

"total_hits": 482,

"took_ms": 120,

"pages": [

{

"url": "https://cognism.com/pricing",

"domain_root": "cognism.com",

"title": "Pricing",

"summary": "...",

"commercial_score": 0.8,

"mention_score": null,

"page_type": "pricing",

"audience": "b2b"

}

]

}

}
```

## Search Pages 
`POST /intent/pages/search` 
Full-text, semantic, or hybrid search over tracked pages. 

### Request Body 
| Field | Type | Required | Description
| `query` | string | Yes | Search query (1–500 chars, e.g. `"site:cognism.com pricing"`)
| `limit` | integer | No | Max results (1–500)
| `offset` | integer | No | Pagination offset (≥0)
| `semantic_ratio` | float | No | Search mode — `0` = text, `1` = semantic, between = hybrid
| `filters` | object | No | Additional filters dict
| `sort` | array | No | Sort fields list
| `include_visitors` | boolean | No | Whether to include visitor data 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/pages/search" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"query": "site:cognism.com pricing",

"limit": 50,

"offset": 0,

"semantic_ratio": 0.0,

"include_visitors": true

}'
```

### Response 

```

{

"data": {

"query": "site:cognism.com pricing",

"mode": "text",

"total_hits": 0,

"pages": [],

"took_ms": 0

}

}
```

## Get Page Visitors 
`POST /intent/pages/visitors` 
Returns raw visitor objects for a single page URL. 

### Request Body 
| Field | Type | Required | Description
| `url` | string | Yes | Page URL without scheme or www (1–1024 chars, e.g. `"cognism.com/pricing"`)
| `limit` | integer | No | Max results (1–500, default `50`)
| `offset` | integer | No | Pagination offset (≥0)
| `mode` | string | No | Resolution mode — `"quick"` (~500 ms) or `"full"` (~2–3 s) 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/pages/visitors" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"url": "cognism.com/pricing",

"limit": 50,

"offset": 0,

"mode": "quick"

}'
```

Returns raw visitor objects from the resolver (HEM, profile fields, source tier).  

## Get Page Contacts 
`POST /intent/pages/contacts` 
Returns deduplicated contacts across a set of page URLs. 

### Request Body 
| Field | Type | Required | Description
| `urls` | array | Yes | List of page URLs (1–200 items)
| `limit` | integer | No | Max results (1–500, default `100`)
| `offset` | integer | No | Pagination offset (≥0)
| `mode` | string | No | Resolution mode — `"quick"` or `"full"` 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/pages/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"urls": ["cognism.com/pricing", "cognism.com/demo"],

"limit": 100,

"offset": 0,

"mode": "quick"

}'
```

## Get Visitor Counts 
`POST /intent/pages/visitor-counts` 
Returns aggregate visitor counts for up to 15,000 URLs in a single call. 

### Request Body 
| Field | Type | Required | Description
| `urls` | array | Yes | List of page URLs (1–15,000 items) 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/pages/visitor-counts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"urls": ["cognism.com/pricing", "cognism.com/docs"]

}'
```

### Response 

```

{

"counts": {

"cognism.com/pricing": 42,

"cognism.com/docs": 13

}

}
```

````  

## List Keywords 
`POST /intent/keywords/list` 
Returns a paginated list of tracked keyword groups. 

### Request Body 
| Field | Type | Required | Description
| `keyword_contains` | string | No | Case-insensitive substring filter on keyword name
| `page` | integer | No | Page number (default `1`)
| `limit` | integer | No | Items per page (1–500) 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/keywords/list" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"keyword_contains": "cognism",

"page": 1,

"limit": 100

}'
```

### Response 
Returns a list of keyword rows, each with `total_resolved_contacts` and `total_resolved_companies`.  

## Add Keywords 
`POST /intent/keywords/add` 
Bulk-adds plain keyword phrases — the API twin of the web UI’s Buyer Intent > Keywords “Add keywords” screen (same internal handler, identical behavior). Saves each phrase as a plain compete-tracking row; no search seeding. Set per-keyword filters afterwards with Update Keyword Filters. 

### Request Body 
| Field | Type | Required | Description
| `keywords` | string[] | Yes | 1–50 keyword phrases, each ≤500 chars. Trimmed and stored lowercased.
| `signal_type` | string | No | `intent` (default), `jobs`, or `job_changes` 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/keywords/add" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"keywords": ["ai sales agents", "buyer intent data"]

}'
```

### Response 

```

{

"data": {

"created": [

{ "id": "…", "keyword": "ai sales agents", "signal_type": "intent", "created_at": "…" }

],

"skipped": [

{ "keyword": "buyer intent data", "reason": "already_exists" }

],

"created_count": 1,

"skipped_count": 1

}

}
```

Empty / whitespace-only entries and in-request duplicates are skipped with reasons `empty` / `duplicate_in_request`; keywords already tracked for the org + `signal_type` are skipped with `already_exists` (idempotent across requests — existing rows are never replaced). For `signal_type: "intent"`, each newly created keyword seeds its URL set asynchronously in the background. An N-keyword batch counts as N request-rate units.  

## Create Keyword Group from Domain 
`POST /intent/keywords/create-from-domain` 
Seeds a keyword group from every public page on a domain. 

### Request Body 
| Field | Type | Required | Description
| `domain` | string | Yes | Domain to seed from (3–253 chars)
| `page_limit` | integer | No | Max pages to index (1–500)
| `contact_limit` | integer | No | Max contacts to resolve (1–500) 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/keywords/create-from-domain" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"domain": "cognism.com",

"page_limit": 200,

"contact_limit": 200

}'
```

### Response 

```

{

"data": {

"keyword_id": "kw_abc123",

"keyword": "cognism.com",

"pages_seeded": 197,

"contacts_seeded": 184,

"companies_seeded": 42,

"off_domain_rejected": 3,

"message": "Keyword group created successfully"

}

}
```

## Get URLs for Keyword 
`POST /intent/keywords/{keyword_id}/urls` 
Returns a paginated list of URLs associated with a keyword group, with optional field-level filtering. 

### Path Parameters 
| Parameter | Type | Description
| `keyword_id` | string | Keyword group ID 

### Request Body 
| Field | Type | Required | Description
| `page` | integer | No | Page number (default `1`)
| `limit` | integer | No | Items per page (default `100`)
| `conditions` | array | No | Filter conditions — each item is ``{ "field": "...", "operator": "...", "value": "..." }`` 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/keywords/kw_abc123/urls" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"page": 1,

"limit": 100,

"conditions": [

{ "field": "page_type", "operator": "eq", "value": "pricing" }

]

}'
```

Returns a paginated URL list.  

## Get Contacts for Keyword 
`POST /intent/keywords/{keyword_id}/contacts` 
Returns resolved contacts for a keyword group. Accepts the same body as the URLs endpoint. 

### Path Parameters 
| Parameter | Type | Description
| `keyword_id` | string | Keyword group ID 

### Request Body 
| Field | Type | Required | Description
| `page` | integer | No | Page number (default `1`)
| `limit` | integer | No | Items per page (default `100`)
| `conditions` | array | No | Filter conditions — each item is ``{ "field": "...", "operator": "...", "value": "..." }`` 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/keywords/kw_abc123/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"page": 1,

"limit": 100

}'
```

## Get Companies for Keyword 
`POST /intent/keywords/{keyword_id}/companies` 
Returns resolved companies for a keyword group. Accepts the same body as the URLs endpoint. 

### Path Parameters 
| Parameter | Type | Description
| `keyword_id` | string | Keyword group ID 

### Request Body 
| Field | Type | Required | Description
| `page` | integer | No | Page number (default `1`)
| `limit` | integer | No | Items per page (default `100`)
| `conditions` | array | No | Filter conditions — each item is ``{ "field": "...", "operator": "...", "value": "..." }`` 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/keywords/kw_abc123/companies" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"page": 1,

"limit": 100

}'
```

## Update Keyword Filters 
`POST /intent/keywords/{keyword_id}/filters` 
Replaces the search filters on a keyword group. All fields inside `search_filters` are optional; omitted fields retain their current value. 

### Path Parameters 
| Parameter | Type | Description
| `keyword_id` | string | Keyword group ID 

### Request Body 
| Field | Type | Required | Description
| `search_filters` | object | Yes | Full replacement filter object (see sub-fields below) 

#### `search_filters` fields 
| Field | Type | Description
| `audience` | string | Target audience, e.g. `"b2b"`
| `exclude_page_types` | array | Page type slugs to exclude, e.g. `["news"]`
| `min_commercial_intent_level` | string | Minimum commercial intent threshold
| `max_urls_per_domain` | integer | Cap on URLs indexed per domain
| `llm_triage` | object | LLM triage config (or `null` to disable)
| `exclude_domains` | array | List of domains to exclude 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/intent/keywords/kw_abc123/filters" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"search_filters": {

"audience": "b2b",

"exclude_page_types": ["news"],

"min_commercial_intent_level": "medium",

"max_urls_per_domain": 50,

"llm_triage": null,

"exclude_domains": []

}

}'
```

### Response 

```

{

"status": "success",

"keyword_id": "kw_abc123"

}
```

``````  

## Credit costs 
| Operation | Credits
| Read endpoints (keywords, pages, visitors, stats) | Free
| Intent signal processing (background, per inbound event) | 1 credit per 10 events
| Keyword creation / deletion | Free 
The 1-per-10-events rate is part of the platform-level event-stream pricing — see Pricing. 

## Errors 
| Status | Cause | Fix
| `401` | Missing or invalid `Authorization: Bearer` header | Get a key
| `402` | Out of credits | Top up in Settings → Billing, or switch to Platform
| `404` | Resource ID doesn’t exist | List first to verify the ID
| `422` | Validation error in request body | Inspect `error.message` + `error.field` in the response
| `429` | Rate limit (50 rps per org) | Backoff per `Retry-After` header. See Rate Limits
| `5xx` | graph8 error | Retry with exponential backoff (5s → 30s → 120s) 
The full error envelope shape: `{ "error": { "code": "...", "message": "...", "field": "...", "request_id": "..." } }`. Include the `request_id` in any support ticket. See Errors for the canonical reference. 

## See also  
- SDK intent methods — same surface in TypeScript 
- CLI intent commands 
- MCP intent tools 
- Pricing — full credit matrix
