<!-- https://docs.graph8.com/developers/public-endpoints/ -->
# Public Endpoints

The `/public/*` endpoints are designed to be called from a browser by the JavaScript SDK. They authenticate with a write key (not an API key) and validate the request `Origin` against the workspace’s allowed domains. 
| Auth header | Where to use
| `X-Write-Key: <key>` | All public endpoints 
The write key is org-scoped (it resolves to one organization) and the `Origin` header must match a domain registered on the write key’s stream config. Server-side calls without an `Origin` header bypass the domain check but still need a valid key. 
These endpoints are also wrapped by the SDK: 
| Endpoint | SDK wrapper
| `POST /public/enrich/lookup` | `<G8Form />` progressive form
| `GET /public/visitors/company` | `g8.visitors.identify()`
| `GET /public/visitors/score` | `g8.visitors.score()`
| `GET /public/signals/company` | `g8.signals.company()`
| `POST /public/copilot/chat` | `g8.copilot.ask()` 
For machine-readable schemas see the interactive API docs.  

## Authentication 
All requests must include the write key: 
Terminal window
```

curl "https://be.graph8.com/api/v1/public/visitors/company" \

-H "X-Write-Key: $WRITE_KEY" \

-H "Origin: https://yoursite.com"
```

### Errors 
| Status | Meaning
| `401` | Missing `X-Write-Key`, invalid key, or key not linked to an org
| `403` | `Origin` not in the workspace’s allowed domains  

## Lookup Contact (Progressive Form) 
`POST /public/enrich/lookup` 
Look up a contact by email and report which form fields graph8 already knows. Used by `<G8Form />` to hide pre-filled fields and only ask for what’s missing. 
The supported form-field set is fixed: `name`, `company`, `phone`, `title`, `website`. 

### Request Body 
| Field | Type | Required | Description
| `email` | string | Yes | Email to look up 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/public/enrich/lookup" \

-H "X-Write-Key: $WRITE_KEY" \

-H "Origin: https://yoursite.com" \

-H "Content-Type: application/json" \

-d '{"email": "[email protected]"}'
```

### Response 

```

{

"data": {

"found": true,

"known_fields": {

"name": "Jane Smith",

"company": "Acme Inc",

"phone": "+1 (555) 234-5678",

"title": "VP of Engineering",

"website": "https://acme.com"

},

"missing_fields": ["phone"]

}

}
```

If no match is found, `found` is `false` and `missing_fields` lists all 5 fields.  

## Identify Visitor Company 
`GET /public/visitors/company` 
Resolve the caller’s IP address to a company using the `ip_2_company` table. graph8 reads the IP from `X-Forwarded-For`, then `X-Real-IP`, then the direct connection. 
If a domain match is found, the response is enriched with industry, employee count, city, and country from the OpenSearch mashup index. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/public/visitors/company" \

-H "X-Write-Key: $WRITE_KEY" \

-H "Origin: https://yoursite.com"
```

### Response 

```

{

"data": {

"company_name": "Acme Inc",

"company_domain": "acme.com",

"industry": "Technology",

"employee_count": "500",

"city": "San Francisco",

"country": "US",

"confidence": 0.85

}

}
```

If the IP cannot be resolved, all fields except `confidence` (which is `0.0`) are `null`.  

## Score Visitor 
`GET /public/visitors/score` 
Return an engagement score (0-100) for the current visitor based on their last 7 days of events. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/public/visitors/score" \

-H "X-Write-Key: $WRITE_KEY" \

-H "Origin: https://yoursite.com"
```

### Response 

```

{

"data": {

"engagement": 75,

"intent": "high",

"signals": ["multi_page_visit", "high_activity"]

}

}
```

`intent` is `high` (>=70), `medium` (>=30), or `low`. Signals are derived from page diversity and event volume.  

## Company Intent Signals 
`GET /public/signals/company` 
Return buying-intent signals for a company domain (not the current visitor). Aggregates the last 30 days of events from any visitors resolved to that domain. 

### Query Parameters 
| Parameter | Type | Required | Description
| `domain` | string | Yes | Company domain (e.g. `acme.com`) 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/public/signals/company?domain=acme.com" \

-H "X-Write-Key: $WRITE_KEY" \

-H "Origin: https://yoursite.com"
```

### Response 

```

{

"data": {

"domain": "acme.com",

"score": 82,

"intent": "high",

"signals": [

"pricing_page",

"demo_page",

"case_study",

"multiple_visitors",

"deep_exploration",

"high_activity"

],

"last_seen": "2026-04-15T14:30:00Z"

}

}
```

The `signals[]` list is derived from page paths (`/pricing`, `/demo`, `/book`, `/case-stud*`), unique visitor count (>=3), unique page count (>=5), and total event count (>=20).  

## Copilot Chat 
`POST /public/copilot/chat` 
Send a message to graph8 copilot scoped to the org’s knowledge base (global context docs, brand brief, FAQs). Unlike the authenticated copilot, this endpoint has no admin tools - it can only read from the org’s RAG index. 

### Request Body 
| Field | Type | Required | Description
| `message` | string | Yes | User message
| `session_id` | string | No | Conversation session ID (echoed back)
| `context` | object | No | Optional client-side context 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/public/copilot/chat" \

-H "X-Write-Key: $WRITE_KEY" \

-H "Origin: https://yoursite.com" \

-H "Content-Type: application/json" \

-d '{"message": "Do you offer SOC 2 compliance?"}'
```

### Response 

```

{

"data": {

"response": "Yes - Acme is SOC 2 Type II compliant as of...",

"session_id": null,

"sources": [

{"title": "Security FAQ", "type": "faq"}

]

}

}
```

When the RAG search or AI completion fails, the endpoint returns a graceful fallback string instead of a 5xx - check `sources` to see whether real context was retrieved.
