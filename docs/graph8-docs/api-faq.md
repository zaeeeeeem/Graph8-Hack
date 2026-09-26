<!-- https://docs.graph8.com/developers/api-faq/ -->
# REST API FAQ

Common questions about the graph8 Developer REST API at `https://be.graph8.com/api/v1`. If your question isn’t here, see the REST API overview, Authentication, or the interactive Swagger at be.graph8.com/api/v1/docs. 

## Base URL and auth 

### What’s the base URL? 
`https://be.graph8.com/api/v1` for production. Every endpoint in the dev docs hangs off this prefix. 

### What auth headers do I send? 
Two required headers on every call: 

```

Authorization: Bearer <YOUR_API_KEY>

X-Org-Id: <your_org_id>
```

The `X-Org-Id` is omitted in most examples because it’s automatically set when the API key was issued — graph8 reads the org binding off the key. You only need to send `X-Org-Id` when running cross-org service tokens. 

### Where do I get the API key?  
- Personal: Profile -> Developer (recommended for individuals). 
- Org: Settings -> API (admin only — for shared service accounts).  
See Authentication. 

### Is there a public surface that doesn’t need an API key? 
Yes — a small set of “write-key” endpoints under `/api/v1/public/*` for browser tracking, visitor lookup, and copilot chat. See Public Endpoints. 

## Surface boundaries 

### Is there only one API surface? 
There are two: 
| Surface | Mount | Auth | Use case
| Developer API | `/api/v1/*` | Bearer + `X-Org-Id` | Public — what the SDK, CLI, and MCP server all proxy
| Internal Studio | `/v1/*` and `/campaign-builder/*` | PropelAuth session | First-party UI in `app.graph8.com` 
If you’re building an integration, only use `/api/v1/*`. The internal surface is undocumented and changes without notice. 

### How many endpoints are there? 
~150 on `/api/v1/*`. The full inventory is documented per-page in this section (Contacts, Companies, Lists, Search, Enrichment, Sequences, Inbox, Webhooks, GTM Campaigns, Audience Sync, CRM Sync, Public Endpoints) plus the interactive Swagger at be.graph8.com/api/v1/docs. 

### Does the MCP server expose anything the REST API doesn’t? 
Almost. The MCP server adds `g8_tool_search` (a discovery meta-tool) and `g8_load_playbook` (markdown content). Everything else is a thin wrapper over `/api/v1/*`. 

## Pagination 

### What’s the standard pagination shape? 
Most list endpoints accept `page` (default 1) and `limit` (default varies, max 200) and return: 

```

{

"data": [...],

"pagination": {

"page": 1,

"limit": 25,

"total": 1238,

"has_next": true

}

}
```

Some endpoints use cursor pagination (`cursor` + `next_cursor`) — see Pagination for the rules. 

### How do I iterate through all pages? 
Terminal window
```

PAGE=1

while : ; do

resp=$(curl -s -H "Authorization: Bearer $G8_API_KEY" \

"https://be.graph8.com/api/v1/contacts?page=$PAGE&limit=200")

echo "$resp" | jq -c '.data[]'

has_next=$(echo "$resp" | jq '.pagination.has_next')

[[ "$has_next" == "true" ]] || break

PAGE=$((PAGE + 1))

done
```

Or use the SDK / CLI which handle pagination natively. 

## Rate limits 

### What’s the rate limit? 
50 requests per second + 1,000 requests per minute per org, applied across all `/api/v1/*` endpoints. The per-second cap absorbs bursts; the per-minute cap governs sustained throughput. Exceeding either returns `429 Too Many Requests` with a `Retry-After` header (seconds). Every response also carries `X-RateLimit-Limit-Second`, `X-RateLimit-Limit-Minute`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` so you can self-pace before you get throttled — see Rate Limits. 

### Is there a monthly cap? 
No. The 50 rps cap is the only ceiling — there’s no monthly volume limit on index-backed endpoints (search, lookup) on either PAYG or Platform. See Pricing. 

### How do I implement backoff? 

```

import time, httpx

async def call_with_backoff(client, path, **kw):

for attempt in range(5):

resp = await client.request(method, path, **kw)

if resp.status_code != 429:

return resp

wait = int(resp.headers.get("Retry-After", "1"))

await asyncio.sleep(wait * (attempt + 1))

return resp
```

See Rate Limits for the full strategy. 

## Credits 

### Which endpoints consume credits? 
Mental model: graph8-owned data is free on both plans. Third-party data, AI, voice, sends, and meeting bookings charge credits on both plans. Canonical matrix at Pricing. 
Always free on both paid plans (within the 50 rps cap) 
graph8-owned data: 
| Endpoint family | What it is
| `/search/contacts`, `/search/companies` | B2B index search (700M+ / 100M+ records)
| `/search/contacts/save`, `/search/companies/save` | Save matching records to a list
| `/enrichment/lookup/person`, `/lookup/company` | Single-record index lookup
| `/enrichment/verify-email` (internal validator) | graph8 in-house verification — no provider override
| `/intent/*` (reads) | Intent + keyword + page-visitor data
| `/public/visitors/*`, `/public/signals/company` | Anonymous-visitor IP resolution + summary intent score 
First-party CRM + metadata: 
| Endpoint family | What it is
| `/contacts`, `/companies`, `/lists`, `/deals`, `/tasks`, `/notes`, `/fields` (all CRUD) | First-party CRM
| `/quotes/*` (CRUD; sending a quote is free email) | Quote-to-cash metadata
| `/workflows/*`, `/skills/*`, `/pipelines/*` (CRUD only — `execute` charges per LLM) | Automation graphs
| `/pages/*` (CRUD + publish; chat edit charges per LLM) | Landing pages
| `/icps`, `/personas`, `/global-context/documents`, `/intelligence-data`, `/research-reports` | Studio reads
| `/webhooks/*` (subscription mgmt + delivery) | Webhook plumbing
| `/voice/dialer/calls/{room}/{transcript,grading}` | Voice reads (recording + transcript)
| `/inbox/meetings` (list + get) | Meeting reads — booking confirmation charges 20 cr separately 
Always charges credits (both plans — drawn from balance or 75k bundle) 
| Endpoint | Cost
| `/enrichment/enrich` (waterfall — 14 third-party providers) | 0.5-20 cr per provider hit (typically 1-3)
| `/api/v1/public/copilot/chat` and SDK `g8.copilot.ask` | Per LLM tokens
| `/inbox/{id}/draft` (AI reply draft) | Per LLM tokens
| `/skills/{id}/execute` with `type=llm` | Per LLM tokens
| `/pages/{id}/chat` (landing-page chat edit) | Per LLM tokens
| Studio AI generation (brief, brand kit, intelligence) | Per LLM tokens
| `/voice/dialer/sessions/{id}/resume` (real outbound) | 20 cr / minute audio
| Meeting booking (`POST /appointments/bookings` confirmation) | 20 cr flat per booking
| `/sequences/{id}/contacts`, `/campaigns/{id}/launch` | 1 cr / step
| Newsletter send | 1 cr / recipient
| `/enrichment/verify-email?provider=kickbox|zerobounce` (external) | 1 cr / verify
| Intent signal processing (background) | 1 cr / 10 events
| Event-stream ingest at scale | 1 cr / 10 events
| `/audience-syncs/{id}/trigger` push | Per record where destination meters 

### Is search really unlimited? 
Yes — on both PAYG and Platform, within the 50 rps cap. Search hits graph8’s own indexes (700M+ contacts / 100M+ companies) with no third-party COGS, so neither plan meters search, lookup, save-to-list, or internal email verify. The 50 rps cap exists to keep the platform stable, not to meter usage. (Per-record constants exist in `developer_api/constants.py` as fallback rates for free-trial and grandfathered legacy orgs; plan-aware gating skips them for PAYG and Platform.) 

### How do I check my credit balance via API? 
`GET /usage` returns the current balance for the authenticated org. It requires the `usage:read` scope. 
Terminal window
```

curl -H "Authorization: Bearer $G8_API_KEY" https://be.graph8.com/api/v1/usage

# {

#   "data": {

#     "customer_id": "org_a1b2c3d4",

#     "credits": 75000.0,

#     "held_credits": 0.0,

#     "available_credits": 12450.0,

#     "total_earned": 75000.0,

#     "total_used": 62550.0

#   }

# }
```

`credits` is the total balance, `held_credits` is what is currently reserved by in-flight work, and `available_credits` is what you can actually spend (`credits - held_credits`). 
For the itemised ledger behind those totals, use `GET /usage/transactions` — it supports both page-number (`page` / `limit`) and opaque cursor (`cursor`) pagination. 

## Errors 

### What status codes can I expect? 
| Code | Meaning | Action
| 200 / 201 | Success | —
| 204 | Success, no content (DELETE) | —
| 400 | Validation error | Inspect `error.field`
| 401 | Bad / missing API key | Re-issue key
| 402 | Out of credits (PAYG) | Top up
| 403 | Wrong org / no permission | Check token scope
| 404 | Record not found | —
| 409 | Conflict (e.g. duplicate email) | Use upsert via `/contacts/assert`
| 422 | Semantic error | Inspect `error.message`
| 429 | Rate limit | Backoff with `Retry-After`
| 5xx | graph8 error | Retry with exponential backoff 
See Errors for the full error envelope. 

### What’s the error envelope shape? 

```

{

"error": {

"code": "validation_error",

"message": "work_email is required",

"field": "work_email",

"request_id": "req_abc123"

}

}
```

Include `request_id` in any support ticket — it lets us trace the call end-to-end. 

## Idempotency, upserts, and webhooks 

### How do I upsert (create-or-update) a contact? 
Use `PUT /api/v1/contacts/assert`: 
Terminal window
```

curl -X PUT https://be.graph8.com/api/v1/contacts/assert \

-H "Authorization: Bearer $G8_API_KEY" \

-H "Content-Type: application/json" \

-d '{"work_email":"[email protected]","first_name":"Jane","last_name":"Smith"}'
```

Returns `{ created: bool, id, ... }`. Same shape for `/companies/assert` and `/deals/assert`. See Assert / Upsert. 

### Are webhooks supported? 
Yes. Subscribe via `POST /api/v1/webhooks`: 

```

{

"url": "https://my.app.com/g8-webhook",

"events": ["reply_received", "meeting_booked", "form_submitted", "contact_enriched"],

"secret": "whsec_xxx"

}
```

Payloads are signed with HMAC-SHA256 over the body using the `secret`. Verify the `X-G8-Signature` header before processing. See Webhooks. 

### What events fire? 
`reply_received`, `meeting_booked`, `contact_enriched`, `contact_created`, `sequence_completed`, `campaign_launched`, `form_submitted`, `visitor_identified`. New events get added — listen via `events: ["*"]` to receive everything. 

## Auto-CRM-capture 

### What’s auto-CRM-capture? 
Every contact or company returned by an enrichment lookup / search is saved into your CRM automatically (tagged `source: 'api_lookup'`). The next time you query `GET /contacts`, the record is already there. See Pricing → Auto-CRM-Capture. 

### How do I opt out per call? 
Terminal window
```

curl "https://be.graph8.com/api/v1/enrichment/lookup/person?capture=false" \

-H "Authorization: Bearer $G8_API_KEY" \

-d '{"email":"[email protected]"}'
```

Or pass `"capture": false` in the JSON body for POST endpoints. Per-key and org-wide toggles exist in Settings -> API. 

## See also  
- REST API overview — endpoint index 
- Authentication — key creation, headers 
- Pagination — page / limit / cursor rules 
- Errors — full status-code matrix 
- Rate Limits — 50 rps cap and backoff 
- Pricing — credit costs, plans, auto-capture 
- Webhooks — event subscriptions 
- SDK FAQ / CLI FAQ / MCP FAQ
