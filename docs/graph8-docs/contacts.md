<!-- https://docs.graph8.com/developers/contacts/ -->
# Contacts

```````` 
Manage contacts in your graph8 workspace — your first-party CRM data. 
Contacts get into your workspace through several paths: saving results from the Search endpoints, importing from a CSV or CRM, creating manually via the API, or automatically during enrichment. Once a contact is in your workspace, these endpoints give you full read/write access at no credit cost. 

## List Contacts 
`GET /contacts` 
Returns a paginated list of contacts. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | `1` | Page number (1-indexed)
| `limit` | integer | `50` | Items per page (1-200)
| `email` | string | — | Filter by work email (exact match)
| `list_id` | integer | — | Filter by list membership
| `name` | string | — | Filter by first or last name (partial match, case-insensitive)
| `job_title` | string | — | Filter by job title (partial match, case-insensitive)
| `seniority_level` | string | — | Filter by seniority level (exact match)
| `company_name` | string | — | Filter by company name (partial match, case-insensitive)
| `company_id` | integer | — | Filter by company ID
| `country` | string | — | Filter by country (exact match)
| `state` | string | — | Filter by state (exact match)
| `city` | string | — | Filter by city (partial match, case-insensitive)
| `job_department` | string | — | Filter by job department (partial match, case-insensitive)
| `industry` | string | — | Filter by company industry (partial match, case-insensitive)
| `include_custom_fields` | boolean | `false` | When `true`, each contact gains a `custom_fields` object of its custom column values keyed by column slug (`name` from `GET /fields`). Default `false` keeps the legacy shape and adds no extra query. 
All filters are optional and can be combined. When multiple filters are provided, results must match all of them (AND logic). 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

# Basic pagination

curl "https://be.graph8.com/api/v1/contacts?limit=10&page=1" \

-H "Authorization: Bearer $API_KEY"

# Search by name and company

curl "https://be.graph8.com/api/v1/contacts?name=jane&company_name=acme" \

-H "Authorization: Bearer $API_KEY"

# Filter by seniority and country

curl "https://be.graph8.com/api/v1/contacts?seniority_level=VP&country=US" \

-H "Authorization: Bearer $API_KEY"

# Filter by department and industry

curl "https://be.graph8.com/api/v1/contacts?job_department=Engineering&industry=SaaS" \

-H "Authorization: Bearer $API_KEY"
```

```

# Basic pagination

response = requests.get(

f"{BASE_URL}/contacts",

headers=HEADERS,

params={"limit": 10, "page": 1}

)

contacts = response.json()

# Search by name and company

response = requests.get(

f"{BASE_URL}/contacts",

headers=HEADERS,

params={"name": "jane", "company_name": "acme"}

)

# Filter by department and industry

response = requests.get(

f"{BASE_URL}/contacts",

headers=HEADERS,

params={"job_department": "Engineering", "industry": "SaaS"}

)
```

```

// Basic pagination

const response = await fetch(`${BASE_URL}/contacts?limit=10&page=1`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const contacts = await response.json();

// Search by name and company

const filtered = await fetch(

`${BASE_URL}/contacts?name=jane&company_name=acme`,

{ headers: { Authorization: `Bearer ${API_KEY}` } }

);

// Filter by department and industry

const deptFiltered = await fetch(

`${BASE_URL}/contacts?job_department=Engineering&industry=SaaS`,

{ headers: { Authorization: `Bearer ${API_KEY}` } }

);
```

### Response 

```

{

"data": [

{

"id": 101,

"first_name": "Jane",

"last_name": "Doe",

"work_email": "[email protected]",

"direct_phone": "+1...",

"mobile_phone": "+1...",

"job_title": "VP Sales",

"job_department": "Sales",

"seniority_level": "VP",

"linkedin_url": "https://...",

"city": "Berlin",

"state": "BE",

"country": "DE",

"company_id": 1,

"owner_id": "user_x",

"owner_name": "John",

"custom_fields": null

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

When called with `?include_custom_fields=true`, `custom_fields` is an object like `{"udo_lead_score_1712000000": "92", "udo_persona_1712000111": "Champion"}` (only set values appear; keys are the column slug). Rows with no custom values return `{}`.  

## Get Contact 
`GET /contacts/{contact_id}` 
Returns detailed information about a single contact, including associated company data. 

### Path Parameters 
| Parameter | Type | Description
| `contact_id` | integer | Contact ID 

### Query Parameters 
| Parameter | Type | Default | Description
| `include_custom_fields` | boolean | `false` | When `true`, the response gains a `custom_fields` object (same shape as the list endpoint). Default omits it (`custom_fields: null`). 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/contacts/1" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(f"{BASE_URL}/contacts/1", headers=HEADERS)

contact = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/contacts/1`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const { data: contact } = await response.json();
```

### Response 

```

{

"data": {

"id": 1,

"first_name": "Jane",

"last_name": "Smith",

"full_name": "Jane Smith",

"work_email": "[email protected]",

"personal_emails": null,

"direct_phone": "+1-555-0100",

"mobile_phone": null,

"job_title": "VP of Engineering",

"job_department": "Engineering",

"seniority_level": "VP",

"linkedin_url": "https://linkedin.com/in/janesmith",

"twitter_url": null,

"facebook_url": null,

"city": "San Francisco",

"state": "CA",

"country": "US",

"about": null,

"confidence_score": 0.95,

"company": {

"id": 42,

"name": "Acme Inc",

"domain": "acme.com",

"website": "https://acme.com",

"industry": "Technology",

"employee_count": "500",

"city": "San Francisco",

"state": "CA",

"country": "US",

"linkedin_url": "https://linkedin.com/company/acme",

"logo_url": "https://logo.clearbit.com/acme.com"

},

"meta_data": {},

"custom_fields": null,

"created_at": "2026-01-15T10:30:00Z",

"updated_at": "2026-02-01T14:20:00Z"

}

}
```

### Errors 
| Status | Meaning
| `404` | Contact not found  

## Create Contact 
`POST /contacts` 
Create a new contact and add it to a list. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list to add the contact to
| `first_name` | string | No | First name
| `last_name` | string | No | Last name
| `work_email` | string | No | Work email address
| `personal_emails` | string | No | Personal email addresses
| `direct_phone` | string | No | Direct phone number
| `mobile_phone` | string | No | Mobile phone number
| `job_title` | string | No | Job title
| `job_department` | string | No | Department
| `seniority_level` | string | No | Seniority level
| `linkedin_url` | string | No | LinkedIn profile URL
| `city` | string | No | City
| `state` | string | No | State or province
| `country` | string | No | Country
| `company_domain` | string | No | Company domain for matching 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 5,

"first_name": "John",

"last_name": "Doe",

"work_email": "[email protected]",

"job_title": "CTO",

"company_domain": "techcorp.io"

}'
```

```

response = requests.post(

f"{BASE_URL}/contacts",

headers=HEADERS,

json={

"list_id": 5,

"first_name": "John",

"last_name": "Doe",

"work_email": "[email protected]",

"job_title": "CTO",

"company_domain": "techcorp.io"

}

)

result = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/contacts`, {

method: "POST",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({

list_id: 5,

first_name: "John",

last_name: "Doe",

work_email: "[email protected]",

job_title: "CTO",

company_domain: "techcorp.io"

})

});

const { data: result } = await response.json();
```

### Response `201 Created` 

```

{

"data": {

"status": "ok",

"count": 1,

"validation_errors": []

}

}
```

## Update Contact 
`PATCH /contacts/{contact_id}` 
Update one or more fields on a contact. Only include the fields you want to change. 

### Path Parameters 
| Parameter | Type | Description
| `contact_id` | integer | Contact ID 

### Request Body 
All fields are optional. Include only the fields to update. 
| Field | Type | Description
| `first_name` | string | First name
| `last_name` | string | Last name
| `work_email` | string | Work email address
| `direct_phone` | string | Direct phone number
| `mobile_phone` | string | Mobile phone number
| `job_title` | string | Job title
| `job_department` | string | Department
| `seniority_level` | string | Seniority level
| `linkedin_url` | string | LinkedIn profile URL
| `city` | string | City
| `state` | string | State or province
| `country` | string | Country 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/contacts/1" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"job_title": "CTO", "city": "New York"}'
```

```

response = requests.patch(

f"{BASE_URL}/contacts/1",

headers=HEADERS,

json={"job_title": "CTO", "city": "New York"}

)
```

```

const response = await fetch(`${BASE_URL}/contacts/1`, {

method: "PATCH",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({ job_title: "CTO", city: "New York" })

});
```

### Response 

```

{

"data": {

"updated": 1

}

}
```

### Errors 
| Status | Meaning
| `400` | No fields provided to update
| `404` | Contact not found  

## Delete Contact 
`DELETE /contacts/{contact_id}` 
Soft-delete a contact. The contact is marked as deleted but not permanently removed. 

### Path Parameters 
| Parameter | Type | Description
| `contact_id` | integer | Contact ID 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/contacts/1" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.delete(f"{BASE_URL}/contacts/1", headers=HEADERS)
```

```

const response = await fetch(`${BASE_URL}/contacts/1`, {

method: "DELETE",

headers: { Authorization: `Bearer ${API_KEY}` }

});
```

### Response 

```

{

"data": {

"deleted": true

}

}
```

### Errors 
| Status | Meaning
| `404` | Contact not found 

## Upsert Contact 
`PUT /contacts/assert` 
Single contact upsert. Matches an existing contact by `work_email` first, then by `linkedin_url`. Creates a new contact if no match is found. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list
| `work_email` | string | Conditional | Work email — at least one of `work_email` or `linkedin_url` is required
| `linkedin_url` | string | Conditional | LinkedIn profile URL — at least one of `work_email` or `linkedin_url` is required
| `first_name` | string | No | First name
| `last_name` | string | No | Last name
| `personal_emails` | string | No | Personal email addresses
| `direct_phone` | string | No | Direct phone number
| `mobile_phone` | string | No | Mobile phone number
| `job_title` | string | No | Job title
| `job_department` | string | No | Department
| `seniority_level` | string | No | Seniority level
| `city` | string | No | City
| `state` | string | No | State or province
| `country` | string | No | Country
| `company_domain` | string | No | Company domain for matching 

### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/contacts/assert" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 12345,

"work_email": "[email protected]",

"first_name": "Jane",

"last_name": "Doe",

"job_title": "VP Sales",

"company_domain": "acme.com"

}'
```

### Response 

```

{ "data": { "action": "created", "count": 1 } }
```

The `action` field is either `"created"` or `"updated"`.  

## Bulk Upsert Contacts 
`PUT /contacts/assert/batch` 
Bulk upsert of up to 100 contacts. Uses the same match keys as the single upsert (`work_email` then `linkedin_url`). 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list for all contacts in this batch
| `contacts` | array | Yes | List of contact objects (1–100 items). Each item follows the same field set as `PUT /contacts/assert`, with at least one of `work_email` or `linkedin_url` per row. 

### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/contacts/assert/batch" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 12345,

"contacts": [

{

"work_email": "[email protected]",

"first_name": "Alice",

"last_name": "Smith",

"job_title": "CEO",

"company_domain": "acme.com"

},

{

"linkedin_url": "https://linkedin.com/in/bobdoe",

"first_name": "Bob",

"last_name": "Doe"

}

]

}'
```

### Response 

```

{ "data": { "total": 100, "created": 87, "updated": 13, "errors": [] } }
```

## List Contact Columns 
`GET /contacts/columns` 
List custom contact columns defined in your workspace. 

### Query Parameters 
| Parameter | Type | Default | Description
| `list_id` | integer | — | Filter columns by list. Omit to return all (including global) columns. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/contacts/columns" \

-H "Authorization: Bearer $API_KEY"

# Filter by list

curl "https://be.graph8.com/api/v1/contacts/columns?list_id=12345" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": 1,

"title": "Job Level",

"name": "job_level",

"data_type": "text",

"is_global": true

}

]

}
```

## Create Contact Column 
`POST /contacts/columns/create` 
Create a custom contact column. Optionally provision an enrichment waterfall pipeline in the same request so the column is immediately enrichable. 

### Request Body 
| Field | Type | Required | Description
| `title` | string | Yes | Display name for the column
| `data_type` | string | Yes | Column data type — currently only `"text"` is supported
| `list_id` | integer | No | Scope the column to a specific list. Omit (or `null`) for a global column. Required when `enrichment` is provided (waterfall pipelines are list-scoped).
| `created_by` | string | No | Email of the user creating the column
| `enrichment` | object | No | Enrichment waterfall config — strongly recommended for enrichable columns. When supplied, a companion waterfall pipeline is provisioned in the same request so the UI Enrich button and `POST /enrichment/waterfall/enrich` work out-of-the-box. Without it the column exists but is not enrichable until you call `POST /enrichment/waterfall/configs`. 

#### `enrichment` object 
| Field | Type | Description
| `type` | string | Enrichment type — use `"waterfall"`
| `providers` | array | Ordered list of provider slugs. Mutually exclusive with `steps`. Allowed values: `graph8`, `hunter`, `prospeo`, `dropcontact`, `icypeas`, `leadmagic`, `emaillistverify`, `apollo`, `lusha`, `rocketreach`.
| `email_verification` | object | Optional email verification config (see below) 

#### `enrichment.email_verification` object 
| Field | Type | Description
| `provider` | string | Verification provider (e.g. `"zerobounce"`)
| `enabled` | boolean | Whether verification is active
| `use_system_credentials` | boolean | Use the platform’s credentials instead of your own
| `accept_catchall` | boolean | Whether to accept catch-all addresses
| `valid_statuses` | array | List of statuses to accept (e.g. `["valid"]`) 

### Example  

-   cURL     

Terminal window
```

# Basic column (no enrichment)

curl -X POST "https://be.graph8.com/api/v1/contacts/columns/create" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"title": "Job Level",

"data_type": "text",

"created_by": "[email protected]"

}'

# Column with enrichment waterfall

curl -X POST "https://be.graph8.com/api/v1/contacts/columns/create" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"title": "Job Level",

"data_type": "text",

"list_id": 12345,

"created_by": "[email protected]",

"enrichment": {

"type": "waterfall",

"providers": ["hunter", "prospeo"],

"email_verification": {

"provider": "zerobounce",

"enabled": true,

"use_system_credentials": true,

"accept_catchall": false,

"valid_statuses": ["valid"]

}

}

}'
```

### Response `201 Created` 
Without enrichment: 

```

{

"data": {

"id": 1,

"title": "Job Level",

"data_type": "text",

"name": "job_level",

"object_id": "12345",

"is_global": false,

"enrichment": null

}

}
```

With enrichment: 

```

{

"data": {

"id": 1,

"title": "Job Level",

"data_type": "text",

"name": "job_level",

"object_id": "12345",

"is_global": false,

"enrichment": {

"column_id": "job_level",

"config_id": "uuid",

"name": "Job Level Enrichment",

"type": "waterfall",

"providers": ["hunter", "prospeo"],

"email_verification": { "enabled": true, "provider": "zerobounce" }

}

}

}
```

- ````
- ``````
- ````
- ``````````
- ````
