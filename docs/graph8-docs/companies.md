<!-- https://docs.graph8.com/developers/companies/ -->
# Companies

Manage companies in your graph8 workspace — your first-party CRM data. 
Companies arrive in your workspace automatically when contacts are saved, enriched, or imported — you don’t need to create them manually. Each contact is linked to a company, and company records are created or updated as contacts flow in. These endpoints give you full read/write access at no credit cost. 

## List Companies 
`GET /companies` 
Returns a paginated list of companies. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | `1` | Page number (1-indexed)
| `limit` | integer | `50` | Items per page (1-200)
| `domain` | string | — | Filter by domain (exact match)
| `industry` | string | — | Filter by industry (partial match, case-insensitive)
| `name` | string | — | Filter by company name (partial match, case-insensitive)
| `employee_count_min` | integer | — | Minimum employee count
| `employee_count_max` | integer | — | Maximum employee count
| `country` | string | — | Filter by country (exact match)
| `state` | string | — | Filter by state (exact match)
| `city` | string | — | Filter by city (partial match, case-insensitive)
| `description` | string | — | Filter by company description (partial match, case-insensitive)
| `revenue_min` | integer | — | Minimum annual revenue
| `revenue_max` | integer | — | Maximum annual revenue
| `founded_year_min` | integer | — | Minimum founding year
| `founded_year_max` | integer | — | Maximum founding year
| `linkedin_followers_min` | integer | — | Minimum LinkedIn followers
| `linkedin_followers_max` | integer | — | Maximum LinkedIn followers
| `include_custom_fields` | boolean | `false` | When `true`, each company gains a `custom_fields` object of its custom column values keyed by column slug (`name` from `GET /fields/companies`). Default `false` keeps the legacy shape and adds no extra query. 
All filters are optional and can be combined. When multiple filters are provided, results must match all of them (AND logic). 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

# Filter by industry

curl "https://be.graph8.com/api/v1/companies?industry=Technology&limit=10" \

-H "Authorization: Bearer $API_KEY"

# Search by company name with employee count range

curl "https://be.graph8.com/api/v1/companies?name=acme&employee_count_min=100&employee_count_max=1000" \

-H "Authorization: Bearer $API_KEY"

# Search by company description (useful for ICP identification)

curl "https://be.graph8.com/api/v1/companies?description=enterprise%20software" \

-H "Authorization: Bearer $API_KEY"

# Filter by revenue range and founding year

curl "https://be.graph8.com/api/v1/companies?revenue_min=1000000&revenue_max=50000000&founded_year_min=2015" \

-H "Authorization: Bearer $API_KEY"

# Filter by LinkedIn followers (social presence)

curl "https://be.graph8.com/api/v1/companies?linkedin_followers_min=1000&industry=SaaS" \

-H "Authorization: Bearer $API_KEY"
```

```

# Filter by industry

response = requests.get(

f"{BASE_URL}/companies",

headers=HEADERS,

params={"industry": "Technology", "limit": 10}

)

companies = response.json()

# Search by name with employee count range

response = requests.get(

f"{BASE_URL}/companies",

headers=HEADERS,

params={"name": "acme", "employee_count_min": 100, "employee_count_max": 1000}

)

# Filter by revenue range and founding year

response = requests.get(

f"{BASE_URL}/companies",

headers=HEADERS,

params={"revenue_min": 1000000, "revenue_max": 50000000, "founded_year_min": 2015}

)
```

```

// Filter by industry

const response = await fetch(

`${BASE_URL}/companies?industry=Technology&limit=10`,

{ headers: { Authorization: `Bearer ${API_KEY}` } }

);

const companies = await response.json();

// Search by name with employee count range

const filtered = await fetch(

`${BASE_URL}/companies?name=acme&employee_count_min=100&employee_count_max=1000`,

{ headers: { Authorization: `Bearer ${API_KEY}` } }

);

// Filter by revenue range and founding year

const revenueFiltered = await fetch(

`${BASE_URL}/companies?revenue_min=1000000&revenue_max=50000000&founded_year_min=2015`,

{ headers: { Authorization: `Bearer ${API_KEY}` } }

);
```

### Response 

```

{

"data": [

{

"id": 42,

"name": "Acme Inc",

"description": "Enterprise software company specializing in cloud solutions",

"domain": "acme.com",

"website": "https://acme.com",

"industry": "Technology",

"employee_count": "500",

"revenue": "25000000",

"founded_year": 2015,

"city": "San Francisco",

"state": "CA",

"country": "US",

"linkedin_url": "https://linkedin.com/company/acme",

"linkedin_followers": "12500",

"logo_url": "https://logo.clearbit.com/acme.com",

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

## Get Company 
`GET /companies/{company_id}` 
Returns detailed information about a single company. 

### Path Parameters 
| Parameter | Type | Description
| `company_id` | integer | Company ID 

### Query Parameters 
| Parameter | Type | Default | Description
| `include_custom_fields` | boolean | `false` | When `true`, adds a `custom_fields` object of custom column values keyed by column slug (same shape as the list endpoint). 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/companies/42" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(f"{BASE_URL}/companies/42", headers=HEADERS)

company = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/companies/42`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const { data: company } = await response.json();
```

### Response 

```

{

"data": {

"id": 42,

"name": "Acme Inc",

"description": "Enterprise software company",

"domain": "acme.com",

"website": "https://acme.com",

"logo_url": "https://logo.clearbit.com/acme.com",

"phone": "+1-555-0200",

"address": "123 Market St",

"city": "San Francisco",

"state": "CA",

"country": "US",

"zip": "94105",

"founded_year": 2015,

"employee_count": "500",

"revenue": "25000000",

"industry": "Technology",

"industry_group": "Software",

"linkedin_url": "https://linkedin.com/company/acme",

"linkedin_followers": "12500",

"facebook_url": null,

"twitter_url": "https://twitter.com/acme",

"crunchbase_url": null,

"meta_data": null,

"contact_count": 15,

"custom_fields": null,

"created_at": "2026-01-10T08:00:00Z",

"updated_at": "2026-02-20T16:45:00Z"

}

}
```

### Errors 
| Status | Meaning
| `404` | Company not found  

## Get Company Contacts 
`GET /companies/{company_id}/contacts` 
Returns contacts associated with a company. 

### Path Parameters 
| Parameter | Type | Description
| `company_id` | integer | Company ID 

### Query Parameters 
| Parameter | Type | Default | Description
| `limit` | integer | `100` | Items per page (1-200)
| `offset` | integer | `0` | Offset for pagination 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/companies/42/contacts?limit=50" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/companies/42/contacts",

headers=HEADERS,

params={"limit": 50}

)

contacts = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/companies/42/contacts?limit=50`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const { data: contacts } = await response.json();
```

### Response 

```

{

"data": [

{

"id": 1,

"first_name": "Jane",

"last_name": "Smith",

"full_name": "Jane Smith",

"work_email": "[email protected]",

"job_title": "VP of Engineering",

"seniority_level": "VP",

"direct_phone": "+1-555-0100",

"linkedin_url": "https://linkedin.com/in/janesmith",

"city": "San Francisco",

"state": "CA",

"country": "US"

}

],

"pagination": {

"page": 1,

"limit": 50,

"total": 15,

"has_next": false

}

}
```

## Update Company 
`PATCH /companies/{company_id}` 
Update one or more fields on a company. Only include the fields you want to change. 

### Path Parameters 
| Parameter | Type | Description
| `company_id` | integer | Company ID 

### Request Body 
All fields are optional. Include only the fields to update. 
| Field | Type | Description
| `name` | string | Company name
| `domain` | string | Primary domain
| `website` | string | Website URL
| `phone` | string | Phone number
| `address` | string | Street address
| `city` | string | City
| `state` | string | State or province
| `country` | string | Country
| `zip` | string | ZIP or postal code
| `industry` | string | Industry
| `employee_count` | integer | Number of employees
| `linkedin_url` | string | LinkedIn company page URL 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/companies/42" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"industry": "Enterprise Software", "employee_count": 550}'
```

```

response = requests.patch(

f"{BASE_URL}/companies/42",

headers=HEADERS,

json={"industry": "Enterprise Software", "employee_count": 550}

)
```

```

const response = await fetch(`${BASE_URL}/companies/42`, {

method: "PATCH",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({ industry: "Enterprise Software", employee_count: 550 })

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
| `404` | Company not found  

## Upsert Company 
`PUT /companies/assert` 
Create or update a company by domain, then by LinkedIn URL. If a company with the given `domain` (or `linkedin_url`) already exists it is updated; otherwise a new record is created and added to the specified list. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list to add the company to
| `domain` | string | No* | Company domain (e.g. `acme.com`). At least one of `domain` or `linkedin_url` is required.
| `linkedin_url` | string | No* | LinkedIn company page URL. At least one of `domain` or `linkedin_url` is required.
| `name` | string | No | Company name
| `industry` | string | No | Industry
| `employee_count` | integer | No | Number of employees
| `annual_revenue` | string | No | Annual revenue
| `city` | string | No | City
| `state` | string | No | State or province
| `country` | string | No | Country
| `website` | string | No | Website URL
| `description` | string | No | Company description 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/companies/assert" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 12345,

"domain": "acme.com",

"name": "Acme Inc",

"industry": "Technology",

"employee_count": 100,

"annual_revenue": "5000000",

"city": "San Francisco",

"state": "CA",

"country": "US",

"website": "https://acme.com",

"description": "Enterprise software provider"

}'
```

```

response = requests.put(

f"{BASE_URL}/companies/assert",

headers=HEADERS,

json={

"list_id": 12345,

"domain": "acme.com",

"name": "Acme Inc",

"industry": "Technology",

"employee_count": 100

}

)

result = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/companies/assert`, {

method: "PUT",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({

list_id: 12345,

domain: "acme.com",

name: "Acme Inc",

industry: "Technology",

employee_count: 100

})

});

const { data: result } = await response.json();
```

### Response 

```

{

"data": {

"action": "created",

"count": 1

}

}
```

The `action` field is either `"created"` or `"updated"` depending on whether a matching company already existed.  

## List Company Columns 
`GET /companies/columns` 
Returns the list of columns (fields) defined for companies in a given list. Equivalent to the contacts columns endpoint but scoped to companies. 

### Query Parameters 
| Parameter | Type | Default | Description
| `list_id` | integer | — | Filter columns by list 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/companies/columns?list_id=12345" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/companies/columns",

headers=HEADERS,

params={"list_id": 12345}

)

columns = response.json()
```

```

const response = await fetch(`${BASE_URL}/companies/columns?list_id=12345`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const columns = await response.json();
```

### Response 

```

[

{

"id": 1,

"title": "Verified Domain",

"name": "verified_domain",

"data_type": "string",

"is_global": false

}

]
```

## Create Company Column 
`POST /companies/columns/create` → 201 
Create a custom column for companies. Accepts the same body as `POST /contacts/columns/create`, including the optional `enrichment` block (strongly recommended for enrichable columns). Column slug (`name`) values are company-scoped (e.g. `verified_domain`). Pass `enrichment.field_to_enrich` (e.g. `"company.domain"`) when you want the waterfall to write to a field other than the column itself. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | List to attach the column to
| `title` | string | Yes | Display title for the column
| `name` | string | Yes | Column slug (must be unique within the org, company-scoped)
| `data_type` | string | Yes | Data type (e.g. `string`, `number`, `boolean`, `date`)
| `enrichment` | object | No | Optional enrichment config. Include `field_to_enrich` (e.g. `"company.domain"`) to route waterfall writes to a specific field. Strongly recommended for enrichable columns. 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/companies/columns/create" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 12345,

"title": "Verified Domain",

"name": "verified_domain",

"data_type": "string",

"enrichment": {

"field_to_enrich": "company.domain"

}

}'
```

```

response = requests.post(

f"{BASE_URL}/companies/columns/create",

headers=HEADERS,

json={

"list_id": 12345,

"title": "Verified Domain",

"name": "verified_domain",

"data_type": "string",

"enrichment": {"field_to_enrich": "company.domain"}

}

)

column = response.json()
```

```

const response = await fetch(`${BASE_URL}/companies/columns/create`, {

method: "POST",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({

list_id: 12345,

title: "Verified Domain",

name: "verified_domain",

data_type: "string",

enrichment: { field_to_enrich: "company.domain" }

})

});

const column = await response.json();
```

## Delete Company 
`DELETE /companies/{company_id}` 
Soft-delete a company. The company is marked as deleted but not permanently removed. 

### Path Parameters 
| Parameter | Type | Description
| `company_id` | integer | Company ID 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/companies/42" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.delete(f"{BASE_URL}/companies/42", headers=HEADERS)
```

```

const response = await fetch(`${BASE_URL}/companies/42`, {

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
| `404` | Company not found 

``
