<!-- https://docs.graph8.com/developers/assert/ -->
# Assert / Upsert

Assert endpoints provide idempotent create-or-update (upsert) semantics. If a matching record exists it gets updated; otherwise a new one is created. This makes them safe to call repeatedly without creating duplicates.  

## Assert Contact 
`PUT /contacts/assert` 
Create or update a single contact. Matches by `work_email` first, then falls back to `linkedin_url`. 
Requires `list_id` and at least one match key (`work_email` or `linkedin_url`). 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list ID
| `work_email` | string | No* | Work email (primary match key)
| `linkedin_url` | string | No* | LinkedIn URL (fallback match key)
| `first_name` | string | No | First name
| `last_name` | string | No | Last name
| `job_title` | string | No | Job title
| `company_domain` | string | No | Company domain
| … |  |  | Any other contact field 
*At least one of `work_email` or `linkedin_url` is required. 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X PUT "https://api.graph8.com/api/v1/contacts/assert" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 5,

"work_email": "[email protected]",

"first_name": "Jane",

"last_name": "Doe",

"job_title": "VP of Sales"

}'
```

```

response = requests.put(

f"{BASE_URL}/contacts/assert",

headers=HEADERS,

json={

"list_id": 5,

"work_email": "[email protected]",

"first_name": "Jane",

"last_name": "Doe",

"job_title": "VP of Sales"

}

)
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

The `action` field tells you what happened: `"created"` for a new record, `"updated"` for an existing match.  

## Batch Assert Contacts 
`PUT /contacts/assert/batch` 
Create or update up to 100 contacts at once. Each contact should include `work_email` or `linkedin_url` as a match key. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list ID
| `contacts` | object[] | Yes | Up to 100 contact objects 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X PUT "https://api.graph8.com/api/v1/contacts/assert/batch" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 5,

"contacts": [

{"work_email": "[email protected]", "first_name": "Jane"},

{"work_email": "[email protected]", "first_name": "Bob"}

]

}'
```

```

response = requests.put(

f"{BASE_URL}/contacts/assert/batch",

headers=HEADERS,

json={

"list_id": 5,

"contacts": [

{"work_email": "[email protected]", "first_name": "Jane"},

{"work_email": "[email protected]", "first_name": "Bob"}

]

}

)
```

### Response 

```

{

"data": {

"total": 2,

"created": 2,

"updated": 0,

"errors": []

}

}
```

## Assert Company 
`PUT /companies/assert` 
Create or update a company. Matches by `domain` first, then falls back to `linkedin_url`. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list ID
| `domain` | string | No* | Company domain (primary match key)
| `linkedin_url` | string | No* | LinkedIn URL (fallback match key)
| `name` | string | No | Company name
| `industry` | string | No | Industry
| `employee_count` | integer | No | Number of employees
| … |  |  | Any other company field 
*At least one of `domain` or `linkedin_url` is required. 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X PUT "https://api.graph8.com/api/v1/companies/assert" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"list_id": 5,

"domain": "acme.com",

"name": "Acme Inc",

"industry": "Technology"

}'
```

```

response = requests.put(

f"{BASE_URL}/companies/assert",

headers=HEADERS,

json={

"list_id": 5,

"domain": "acme.com",

"name": "Acme Inc",

"industry": "Technology"

}

)
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

## Batch Assert Companies 
`PUT /companies/assert/batch` 
Create or update up to 100 companies at once. 

### Request Body 
| Field | Type | Required | Description
| `list_id` | integer | Yes | Target list ID
| `companies` | object[] | Yes | Up to 100 company objects  

## Assert Deal 
`PUT /deals/assert` 
Create or update a deal. Matches by `name` + `company_id`. 

### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Deal name (match key)
| `company_id` | string | No | Company ID (match key, combined with name)
| `amount` | number | No | Monetary value
| `currency` | string | No | Currency code
| `stage_id` | string | No | Pipeline stage ID
| `pipeline_id` | string | No | Pipeline ID
| `description` | string | No | Deal description
| `close_date` | string | No | Expected close date (ISO 8601) 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X PUT "https://api.graph8.com/api/v1/deals/assert" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Enterprise Deal",

"amount": 50000,

"company_id": "comp-123"

}'
```

```

response = requests.put(

f"{BASE_URL}/deals/assert",

headers=HEADERS,

json={

"name": "Enterprise Deal",

"amount": 50000,

"company_id": "comp-123"

}

)
```

### Response 

```

{

"data": {

"action": "created",

"deal_id": "deal-new-abc"

}

}
```

## Assert Deal-Contact Association 
`PUT /contacts/{contact_id}/deals/assert` 
Link a contact to a deal. Idempotent — if the association already exists, returns `"exists"` without error. 

### Request Body 
| Field | Type | Required | Description
| `deal_id` | string | Yes | Deal ID to associate 

### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://api.graph8.com/api/v1/contacts/12345/deals/assert" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"deal_id": "deal-abc"}'
```

### Response 

```

{

"data": {

"action": "created",

"deal_id": "deal-abc",

"contact_id": 12345

}

}
```

The `action` field returns `"created"` for a new link, or `"exists"` if the association was already present.
