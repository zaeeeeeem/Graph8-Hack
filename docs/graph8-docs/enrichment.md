<!-- https://docs.graph8.com/developers/enrichment/ -->
# Enrichment

`````````` 
The enrichment endpoints cover three capabilities:  
- Lookup — Find a single person or company from the open data index when you already know their email, LinkedIn URL, or domain. Returns full profile data instantly. 
- Enrich — Fill missing fields (emails, phone numbers) on contacts you already have in your workspace by running them through multiple data providers in sequence (waterfall enrichment). 
- Verify — Check if an email address is deliverable before sending.  

## Two billing buckets 
Enrichment endpoints split into two buckets that bill differently. The split matters because graph8 owns the cost on one side and pays a third-party provider on the other. 

### Index Lookups - free on both plans 
These endpoints hit graph8’s owned indexes (OpenSearch + ClickHouse). Single-record, instant, no waterfall. 
| Endpoint | PAYG | Platform
| `POST /enrichment/lookup/person` | Free (within 50 rps) | Free (within 50 rps)
| `POST /enrichment/lookup/company` | Free (within 50 rps) | Free (within 50 rps)
| `POST /enrichment/verify-email` (internal validator) | Free (within 50 rps) | Free (within 50 rps) 

### Waterfall Enrichment - always credits 
These endpoints chain through external providers (Prospeo, Dropcontact, Cognism, and others). graph8 pays the provider per record - so credits apply on both PAYG and Platform. 
| Endpoint | PAYG | Platform
| `POST /enrichment/enrich` (waterfall) | Variable per record | Variable per record
| External email verifiers (Kickbox, ZeroBounce) | Per-verification | Per-verification 
See Pricing for the full plan comparison.  

## Person Lookup 
`POST /enrichment/lookup/person` 
Instant person lookup. Provide at least one of: `email`, `linkedin_url`, or `first_name` + `last_name` + `company_domain`. 
Pricing: Free on both PAYG and Platform within the 50 rps cap (graph8-owned index data). 

### Request Body 
| Field | Type | Required | Description
| `email` | string | No* | Work email address
| `linkedin_url` | string | No* | LinkedIn profile URL
| `first_name` | string | No* | First name (requires `last_name` + `company_domain`)
| `last_name` | string | No* | Last name (requires `first_name` + `company_domain`)
| `company_domain` | string | No* | Company domain (requires `first_name` + `last_name`) 
*At least one lookup strategy is required. 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/enrichment/lookup/person" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"email": "[email protected]"}'
```

```

response = requests.post(

f"{BASE_URL}/enrichment/lookup/person",

headers=HEADERS,

json={"email": "[email protected]"}

)
```

### Response 

```

{

"data": {

"found": true,

"confidence": 0.95,

"data": {

"first_name": "Jane",

"last_name": "Doe",

"job_title": "VP of Sales",

"company": "Acme Inc",

"linkedin_url": "https://linkedin.com/in/janedoe",

"work_email": "[email protected]"

}

}

}
```

## Company Lookup 
`POST /enrichment/lookup/company` 
Instant company lookup by domain or name. 
Pricing: Free on both PAYG and Platform within the 50 rps cap (graph8-owned index data). 

### Request Body 
| Field | Type | Required | Description
| `domain` | string | No* | Company domain
| `name` | string | No* | Company name 
*At least one of `domain` or `name` is required. 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/enrichment/lookup/company" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"domain": "acme.com"}'
```

```

response = requests.post(

f"{BASE_URL}/enrichment/lookup/company",

headers=HEADERS,

json={"domain": "acme.com"}

)
```

### Response 

```

{

"data": {

"found": true,

"confidence": 0.98,

"data": {

"name": "Acme Inc",

"domain": "acme.com",

"industry": "Technology",

"employee_count": 500,

"annual_revenue": "$50M-$100M"

}

}

}
```

## Start Enrichment Job 
`POST /enrichment/enrich` 
Start an async waterfall enrichment job. The job runs across multiple data providers and returns a `job_id` you can poll for results. 
Returns `202 Accepted`. 
Pricing: Credits apply on both PAYG and Platform - waterfall enrichment hits third-party providers (Prospeo, Dropcontact, Cognism, etc.) with per-record cost. Cost varies by which providers are configured in `fields_config`. 

### Request Body 
| Field | Type | Required | Description
| `contact_ids` | integer[] | Yes | Contact IDs to enrich
| `list_id` | integer | Yes | List ID the contacts belong to
| `fields_config` | object | No | Fields to enrich and provider order (see below) 
fields_config example: 

```

{

"work_email": ["prospeo", "dropcontact"],

"direct_phone": ["cognism", "lusha"]

}
```

If omitted, defaults to `{"work_email": ["prospeo", "dropcontact"]}`. 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/enrichment/enrich" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"contact_ids": [101, 102, 103],

"list_id": 5,

"fields_config": {"work_email": ["prospeo", "dropcontact"]}

}'
```

```

response = requests.post(

f"{BASE_URL}/enrichment/enrich",

headers=HEADERS,

json={

"contact_ids": [101, 102, 103],

"list_id": 5,

"fields_config": {"work_email": ["prospeo", "dropcontact"]}

}

)

job_id = response.json()["data"]["job_id"]
```

### Response 

```

{

"data": {

"job_id": "abc-123-def",

"status": "queued",

"total": null,

"completed": null,

"results": null

}

}
```

## Poll Enrichment Job 
`GET /enrichment/jobs/{job_id}` 
Check the status of an enrichment job. Works for both `POST /enrichment/enrich` and `POST /enrichment/waterfall/enrich` jobs. 

### Path Parameters 
| Parameter | Type | Description
| `job_id` | string | Job UUID returned by the enrich endpoint 

### Query Parameters 
| Parameter | Type | Default | Description
| `include_provider_errors` | boolean | `false` | When `true`, adds a `provider_errors` array with per-record, per-provider error details (one extra DB read) 
``

```````` 

### Status Values 
| Status | Description
| `queued` | Job is waiting to start
| `running` | Enrichment in progress
| `completed` | Pipeline ran to completion (check `successful_enrichments` for actual results)
| `failed` | Job failed
| `cancelled` | Job was cancelled 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl "https://be.graph8.com/api/v1/enrichment/jobs/abc-123-def" \

-H "Authorization: Bearer $API_KEY"

# With provider error details

curl "https://be.graph8.com/api/v1/enrichment/jobs/abc-123-def?include_provider_errors=true" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/enrichment/jobs/{job_id}",

headers=HEADERS,

params={"include_provider_errors": True}

)

data = response.json()["data"]
```

### Response 

```

{

"data": {

"job_id": "abc-123-def",

"status": "completed",

"total": 100,

"completed": 100,

"results": null,

"successful_enrichments": 0,

"failed_enrichments": 100,

"total_credits_used": 0,

"warnings": null,

"provider_errors": null

}

}
```

`successful_enrichments`, `failed_enrichments`, and `total_credits_used` are populated only for terminal jobs (`completed`, `failed`, `cancelled`). They are `null` while a job is `queued` or `running`. When `include_provider_errors=true`, `provider_errors` contains entries like `{"record_id": 101, "provider": "hunter", "error": "hunter API key is not configured"}`.  

## Verify Email 
`POST /enrichment/verify-email` 
Verify a single email address and check its deliverability status. 
Pricing: Free on both PAYG and Platform within the 50 rps cap when graph8’s internal validator can answer. Calls that fall through to third-party verifiers (Kickbox, ZeroBounce) consume 1 credit per verify on both plans. 

### Request Body 
| Field | Type | Required | Description
| `email` | string | Yes | Email address to verify 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/enrichment/verify-email" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"email": "[email protected]"}'
```

```

response = requests.post(

f"{BASE_URL}/enrichment/verify-email",

headers=HEADERS,

json={"email": "[email protected]"}

)
```

### Response 

```

{

"data": {

"email": "[email protected]",

"status": "valid",

"sub_status": null,

"is_valid": true

}

}
```

| Status | Description
| `valid` | Deliverable email address
| `invalid` | Undeliverable
| `catch-all` | Domain accepts all addresses
| `unknown` | Could not determine  

## List Waterfall Configs 
`GET /enrichment/waterfall/configs` 
Returns all waterfall enrichment pipelines configured for a list. Each config includes per-step credential information so you can tell which providers are ready to run. 

### Query Parameters 
| Parameter | Type | Default | Description
| `list_id` | integer | — | Required. List ID to fetch configs for 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/enrichment/waterfall/configs?list_id=12345" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"configs": [

{

"column_id": "waterfall_xxx",

"name": "Email lookup",

"field_to_enrich": "work_email",

"data_type": "text",

"is_global": false,

"is_active": true,

"list_id": 12345,

"step_count": 1,

"providers": ["graph8"],

"providers_detail": [

{

"provider": "graph8",

"is_system_provider": true,

"credential_source": "system",

"credential_ready": true

}

],

"missing_credentials": []

}

],

"list_id": 12345,

"count": 1

}

}
```

`providers_detail` gives the per-step credential breakdown (system vs BYOK and readiness). `missing_credentials` lists providers whose BYOK step has no active org key — those steps will be skipped at run time.  

## Create Waterfall Config 
`POST /enrichment/waterfall/configs` 
Creates (or reuses) a waterfall enrichment pipeline. Idempotent by `(list_id, name)` — calling it twice with the same name returns the existing config with `"created": false`. 
Returns `201 Created`. 
Three call styles are available, in increasing order of control:  
- Bare — pass only `list_id`. Server builds a single-step graph8 lookup (0 credits). Pre-2026-06 contract. 
- By providers — pass `providers=["hunter","prospeo"]`. Server maps each to its default email-finder action in that order. Use this for “try these providers, in this order” pipelines. 
- By steps — pass `steps=[...]` with full step shapes. Server persists them verbatim. Use this for provider-specific config (e.g. Apollo `reveal_phone_numbers=true`).  
`providers` and `steps` are mutually exclusive — pass one or neither. `email_verification` may be combined with any call style. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | List ID to create the config for
| `name` | string | No | Pipeline name (default assigned if omitted)
| `field_to_enrich` | string | No | Field to fill in (default `work_email`)
| `skip_existing_values` | boolean | No | Skip records that already have a value (default `true`)
| `providers` | string[] | No | Ordered list of provider names — server builds default email-finder steps. Mutually exclusive with `steps`.
| `steps` | object[] | No | Full caller-supplied step objects (see below). Mutually exclusive with `providers`.
| `email_verification` | object | No | Post-enrichment email validation config (see below)
| `credential_mode` | string | No | `auto` | `system` | `byok` — controls how `providers[]` resolves credentials (default `auto`). Has no effect on `steps[]`. 
`steps[]` object fields: 
| Field | Type | Description
| `provider` | string | Provider name (e.g. `hunter`)
| `action` | string | Provider action (e.g. `find_email`)
| `input_mapping` | object | Maps provider input keys to contact field tokens
| `output_field` | string | Contact field to write the result to (e.g. `contact.work_email`)
| `order` | integer | Step execution order (0-indexed)
| `is_system_provider` | boolean | `true` to use graph8’s system key (charges credits); `false` to use the org’s BYOK key
| `config` | object | Provider-specific flags (e.g. `{"reveal_phone_numbers": true}` for Apollo) 
`email_verification` object fields: 
| Field | Type | Description
| `enabled` | boolean | Whether to run email verification after enrichment
| `provider` | string | Verifier to use: `zerobounce`, `hunter`, `icypeas`, or `leadmagic`
| `use_system_credentials` | boolean | Use graph8 system key (charges credits)
| `accept_catchall` | boolean | Treat catch-all addresses as valid
| `valid_statuses` | string[] | Statuses to accept (e.g. `["valid"]`) 
`credential_mode` values: 
| Value | Behavior
| `auto` | (Default, matches the UI) Use the org’s BYOK key when configured (free); otherwise use graph8’s system key for funded providers (charges credits). Unfunded providers (`lusha`, `rocketreach`) stay BYOK.
| `system` | Force graph8 system keys for funded providers (always charges credits).
| `byok` | Force the org’s own keys for every non-graph8 provider. Steps silently skip when no key exists. 
`graph8` is always system-funded regardless of mode. graph8 holds system keys for: `graph8`, `apollo`, `hunter`, `builtwith`, `dropcontact`, `prospeo`, `icypeas`, `zerobounce`, `leadmagic`, `emaillistverify`. 
Allowed `providers[]` values: `graph8`, `hunter`, `prospeo`, `dropcontact`, `icypeas`, `leadmagic`, `emaillistverify`, `apollo`, `lusha`, `rocketreach`. Unknown providers return 400 `unsupported_provider`. For other providers (e.g. `zerobounce` as a finder) use `steps[]`. 

### Example  

-   cURL     

Terminal window
```

# By providers shortcut (recommended)

curl -X POST "https://be.graph8.com/api/v1/enrichment/waterfall/configs" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 12345,

"name": "Email Pipeline",

"providers": ["hunter", "prospeo"],

"credential_mode": "auto",

"email_verification": {

"enabled": true,

"provider": "zerobounce",

"use_system_credentials": true,

"accept_catchall": false,

"valid_statuses": ["valid"]

}

}'

# By steps (full control)

curl -X POST "https://be.graph8.com/api/v1/enrichment/waterfall/configs" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 12345,

"name": "Apollo with phones",

"steps": [{

"provider": "apollo",

"action": "find_email",

"input_mapping": {"first_name": "CONTACT_FIRST_NAME", "last_name": "CONTACT_LAST_NAME"},

"output_field": "contact.work_email",

"order": 0,

"is_system_provider": true,

"config": {"reveal_phone_numbers": true}

}]

}'
```

### Response 

```

{

"data": {

"column_id": "waterfall_xxx",

"config_id": "uuid",

"name": "Email Pipeline",

"list_id": 12345,

"created": true,

"providers": ["hunter", "prospeo"],

"email_verification": {

"enabled": true,

"provider": "zerobounce",

"use_system_credentials": true,

"accept_catchall": false,

"valid_statuses": ["valid"]

},

"providers_detail": [

{

"provider": "hunter",

"is_system_provider": true,

"credential_source": "system",

"credential_ready": true

},

{

"provider": "prospeo",

"is_system_provider": false,

"credential_source": "byok",

"credential_ready": false

}

],

"missing_credentials": ["prospeo"]

}

}
```

`missing_credentials` lists BYOK steps with no active org key — those steps will be skipped at run time. Call `GET /enrichment/providers` to see which providers need a BYOK key for your org. 
Errors:  
- `400` — `providers` and `steps` are mutually exclusive (pass one, not both) 
- `400 unsupported_provider` — `providers[]` contained a name without a default email-finder mapping   

## Run Waterfall Enrichment 
`POST /enrichment/waterfall/enrich` 
Runs an existing waterfall pipeline against a set of records. Returns `202 Accepted` — poll `GET /enrichment/jobs/{job_id}` for the outcome. 
When a pipeline step is BYOK with no usable org key (or an unfunded provider like `lusha` or `rocketreach`), the 202 response carries a non-blocking `warnings` array naming those providers. The job still queues, but those steps will be skipped. 

### Request Body 
| Field | Type | Required | Description
| `column_id` | string | Yes | Waterfall config ID from `GET /enrichment/waterfall/configs`
| `list_id` | integer | Yes | List the records belong to
| `record_ids` | integer[] | Yes | Non-empty list of contact IDs to enrich
| `skip_existing_values` | boolean | No | Override the pipeline’s `skip_existing_values` setting for this run 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/enrichment/waterfall/enrich" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"column_id": "waterfall_xxx",

"list_id": 12345,

"record_ids": [101, 102, 103],

"skip_existing_values": true

}'
```

### Response 

```

{

"data": {

"job_id": "abc-123-def",

"status": "queued",

"total": null,

"completed": null,

"results": null,

"warnings": ["prospeo: no active org key configured — step will be skipped"]

}

}
```

`warnings` is a non-blocking array present when one or more pipeline steps are BYOK with no usable org key (or use an unfunded provider like `lusha` or `rocketreach`). The job still queues and runs; those steps are skipped. `warnings` is `null` when all configured steps have valid credentials. 
Poll `GET /enrichment/jobs/{job_id}` (optionally with `include_provider_errors=true`) to check `successful_enrichments` when the job reaches `completed`. 
Errors:  
- `422 waterfall_config_missing` — no active waterfall pipeline exists for the supplied `column_id`. Fix by calling `POST /enrichment/waterfall/configs` to create or restore the config.   

## List Enrichment Providers 
`GET /enrichment/providers` 
Lists every enrichment provider available to the calling org, including its credential mode and per-action credit cost. This is the programmatic equivalent of the UI’s provider picker — call it before building a pipeline to see which providers run on graph8 credits by default vs need your own API key. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/enrichment/providers" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"providers": [

{

"provider": "hunter",

"system_funded": true,

"byok_configured": false,

"default_credential_source": "system",

"credits_per_row": {

"find_email": 2.0,

"verify_email": 2.0,

"domain_search": 2.0

},

"actions": ["domain_search", "find_email", "verify_email"]

},

{

"provider": "lusha",

"system_funded": false,

"byok_configured": false,

"default_credential_source": "byok",

"credits_per_row": {

"enrich_person": 2.0,

"enrich_company": 2.0

},

"actions": ["enrich_company", "enrich_person"]

}

],

"count": 2

}

}
```

| Field | Description
| `system_funded` | graph8 holds a system key for this provider — works out of the box and charges credits
| `byok_configured` | The org has its own API key configured for this provider
| `default_credential_source` | What `credential_mode="auto"` resolves to right now (`system` or `byok`)
| `credits_per_row` | Per-action credit cost when running on graph8’s system key
| `actions` | Available actions for this provider  

## List AI Enrichment Configs 
`GET /enrichment/ai/configs` 
Returns all AI enrichment configurations for a list. 

### Query Parameters 
| Parameter | Type | Default | Description
| `list_id` | integer | — | Required. List ID to fetch AI configs for 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/enrichment/ai/configs?list_id=12345" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": {

"configs": [

{

"group_id": "ai_enrich_xxx",

"name": "Company research",

"usecase": "web-research",

"list_id": 12345,

"is_global": false,

"is_active": true

}

],

"list_id": 12345,

"count": 1

}

}
```

## Run AI Enrichment 
`POST /enrichment/ai/enrich` 
Runs an AI enrichment config against a set of records. This endpoint is synchronous — it returns when the enrichment is complete (unlike `POST /enrichment/waterfall/enrich` which is async). 

### Request Body 
| Field | Type | Required | Description
| `group_id` | string | Yes | AI enrichment config ID from `GET /enrichment/ai/configs`
| `list_id` | integer | Yes | List the records belong to
| `record_ids` | integer[] | Yes | Non-empty list of contact IDs to enrich
| `max_records` | integer | No | Maximum number of records to process in this call
| `skip_existing_values` | boolean | No | Skip records that already have a value 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/enrichment/ai/enrich" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"group_id": "ai_enrich_xxx",

"list_id": 12345,

"record_ids": [101, 102],

"max_records": 50,

"skip_existing_values": true

}'
```

### Response 

```

{

"data": {

"job_id": "abc-456-ghi",

"status": "completed",

"total": 2,

"completed": 2,

"results": [

{

"processed_records": 2,

"successful_enrichments": 2,

"failed_enrichments": 0

}

]

}

}
```

## Waterfall Credit Matrix 
Waterfall enrichment (`POST /enrichment/enrich`) runs each contact / company through a sequence of 14 third-party providers. Only successful provider hits charge credits — if no provider matches, the entire run is free. Cached results (same record + field, within the 7-day cache TTL) also return for free. 

### Per-provider hit cost 
| Provider | Returns | Email | Phone | Other
| Apollo | Email, phones, title, seniority, company, LinkedIn | 1 | 2 (direct), 2 (mobile) | LinkedIn 1, title 1
| Hunter | Email, domain | 1 | — | Domain 1, verify 2
| Prospeo | Email, direct phone | 1 | 2 | —
| DropContact | Email, phone, company | 1 | 2 (direct), 2 (mobile) | —
| Lusha | Email, direct + mobile phone | 1 | 2 (direct), 2 (mobile) | —
| Icypeas | Email, phone, LinkedIn, title, company | 1 | 1 | Domain 0.5, LinkedIn 1, company 1
| RocketReach | Email, phone, company, LinkedIn | 2 | 2 | 2
| LeadMagic | Email, mobile, LinkedIn, company, industry, funding | 0.5 | 3 (mobile) | LinkedIn 3, company 2, funding 2.5
| Clearbit | Company domain, industry, headcount, title | — | — | 2
| BuiltWith | Company tech stack, domain relationships | — | — | 2 per action
| graph8 internal | Mashup contacts + companies | — | — | 2 per lookup (free if using org-owned API key) 

### Email verifier add-on cost 
Run after a provider returns an email; if invalid the waterfall continues to the next provider. 
| Provider | Verify cost | Notes
| LeadMagic | 0.5 | Cheapest option
| EmailListVerify | 1 | Dedicated verifier
| ZeroBounce | 1 (verify) / 20 (find_email) | Find_email is the expensive outlier
| Icypeas | 1 | Also a data-finding provider
| Hunter | 2 | Slightly higher than competitors 

### Default waterfall order 
Email (work_email / contact_email): Apollo → Hunter → Prospeo → DropContact → Lusha → Icypeas → RocketReach → LeadMagic → (optional verifier: EmailListVerify / ZeroBounce). 
Direct phone: Apollo → Prospeo → DropContact → Lusha. 
Mobile phone: Apollo → DropContact → Lusha → LeadMagic. 
Company domain: Clearbit → Apollo → Hunter. 
Industry / size: Clearbit only. 
Order is configurable per org via the in-app waterfall editor — `enrichment_configs` row drives the live sequence. 

### When credits are (and aren’t) charged 
| Scenario | Charged?
| Provider returns a match | Yes — cost of that field for that provider
| Provider returns no match | No — waterfall moves on
| All providers exhausted, no match | No charge at all
| Cached result returned (same field, same record, within 7d TTL) | Free
| Provider call uses your own API key (configured in the org) | Free
| Record skipped because run conditions weren’t met | Free
| Email verifier validates an email as valid | Verifier cost absorbed; no extra charge
| Email verifier rejects an email | Verifier cost charged; waterfall continues for free 

### Apollo phone-reveal flags 
Apollo offers two add-on flags that cost extra credits beyond the base hit: 
| Flag | Extra credits
| `reveal_phone_numbers=true` | +3 to +15 (depends on number type)
| `reveal_personal_emails=true` | +1 to +7 
Both flags default to off to avoid surprise spend. Enable per call when you specifically need direct phone or personal email. 

### Credit hold + batch charge 
For large enrichment jobs the system pre-holds a credit budget then charges in batches:  
- Job start: hold `total_records × max_per_record × 1.25` (25% safety buffer). 
- Per record completion: pending credits accumulate. 
- Every 100 records: pending → charged from the hold. 
- Job complete: remaining pending charged, unused hold released back to balance.  
Use `GET /enrichment/jobs/{job_id}` to monitor pending vs charged credits mid-run. 

### Pricing examples 
| Scenario | Cost
| Enrich a contact, Apollo finds work email on first hit | 1 credit
| Enrich a contact, no provider matches | 0 credits
| Enrich a contact, need both work email + direct phone, Apollo matches both | 1 + 2 = 3 credits
| Re-enrich the same contact within 7 days | 0 credits (cache hit)
| Bulk enrich 1,000 contacts, ~70% find rate, avg 1.2 credits per hit | ~840 credits
