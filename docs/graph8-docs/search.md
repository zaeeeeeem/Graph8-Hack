<!-- https://docs.graph8.com/developers/search/ -->
# Search

`````` 

The Search endpoints query graph8’s open data index — a global B2B database of millions of contacts and companies aggregated from multiple data providers. Use it to discover new prospects that match your ideal customer profile (ICP), then save them to your workspace. 
This is different from the `/contacts` and `/companies` endpoints, which only return data you’ve already saved — your first-party CRM data. 

- 
- 
-  

### What you can search for  
- Contacts: Filter by job title, seniority, department, skills, location, company attributes, and more (~28 filterable fields) 
- Companies: Filter by industry, employee count, revenue, geography, founded year, LinkedIn presence, and more (~15 filterable fields)  

### How it connects to your data 
Search results come from the open data index and are read-only. To work with them in your workflows:  
- Search — find contacts or companies matching your criteria 
- Save to list — use `/search/contacts/save` or `/search/companies/save` to copy matching records into your workspace 
- Manage — once saved, they appear in `/contacts` and `/companies` as your data  

## Credit Costs 
| Operation | PAYG | Platform
| Contact search | Free (within 50 rps) | Free (within 50 rps)
| Company search | Free (within 50 rps) | Free (within 50 rps)
| Save to list | Free (within 50 rps) | Free (within 50 rps) 
Search and save-to-list are part of the free graph8-owned data tier on both plans — the only ceiling is the 50 rps rate cap and there is no monthly volume cap. Credits only deduct when you act on the saved records: waterfall enrichment via 3rd-party providers, AI generation, message sends, voice minutes, and meeting bookings. 

``  

## Filter Operators 
All search endpoints accept a `filters` array in the request body. Each filter has a `field`, `operator`, and `value`. 
| Operator | Description | Example Value
| `any_of` | Exact match — field matches any value in the list | `["CEO", "CTO"]`
| `contains` | Fuzzy/substring match | `["sales"]`
| `all_of` | Field must contain ALL values | `["python", "javascript"]`
| `none_of` | Field must NOT match any value | `["intern", "student"]`
| `is_empty` | Field has no value | `[]`
| `is_not_empty` | Field has a value | `[]`
| `between` | Numeric range (inclusive) | `[2015, 2025]`
| `exists` | Field exists in the record | `[]`  

## Search Contacts 
`POST /search/contacts` 
Search the open data index for contacts matching the given filters. Returns paginated results with up to 100 results per page. 

### Request Body 
| Field | Type | Required | Description
| `filters` | array | Yes | Filter conditions (AND logic). At least one filter is required. See filter operators
| `page` | integer | No | Page number, 1-indexed (default: 1, max: 100)
| `limit` | integer | No | Results per page (default: 25, max: 100) 

`` 

### Filterable Contact Fields 
| Field | Description
| `first_name` | First name
| `last_name` | Last name
| `work_email` | Work email address
| `personal_emails` | Personal email addresses
| `direct_phone` | Direct phone number
| `mobile_phone` | Mobile phone number
| `job_title` | Job title
| `job_department` | Department
| `seniority_level` | Seniority level (e.g., “VP”, “Director”, “Manager”)
| `role` | Role
| `linkedin_url` | LinkedIn profile URL
| `gender` | Gender
| `skills` | Skills
| `education_degree` | Education degree
| `education_field` | Field of study
| `education_university_name` | University name
| `city` | City
| `state` | State/province
| `country` | Country
| `confidence_score` | Data confidence score
| `company_name` | Company name
| `company_domain` | Company domain
| `company_industry` | Company industry
| `company_employee_count` | Company employee count
| `company_country` | Company country
| `company_state` | Company state
| `company_city` | Company city
| `company_revenue` | Company revenue
| `company_founded_year` | Company founded year 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/search/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"filters": [

{"field": "job_title", "operator": "any_of", "value": ["CEO", "CTO", "VP Engineering"]},

{"field": "company_industry", "operator": "contains", "value": ["Technology"]},

{"field": "company_employee_count", "operator": "between", "value": [50, 500]}

],

"page": 1,

"limit": 25

}'
```

```

response = requests.post(

f"{BASE_URL}/search/contacts",

headers=HEADERS,

json={

"filters": [

{"field": "job_title", "operator": "any_of", "value": ["CEO", "CTO", "VP Engineering"]},

{"field": "company_industry", "operator": "contains", "value": ["Technology"]},

{"field": "company_employee_count", "operator": "between", "value": [50, 500]}

],

"page": 1,

"limit": 25

}

)
```

```

const response = await fetch(`${BASE_URL}/search/contacts`, {

method: "POST",

headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },

body: JSON.stringify({

filters: [

{ field: "job_title", operator: "any_of", value: ["CEO", "CTO", "VP Engineering"] },

{ field: "company_industry", operator: "contains", value: ["Technology"] },

{ field: "company_employee_count", operator: "between", value: [50, 500] }

],

page: 1,

limit: 25

}),

});
```

### Response 

```

{

"data": [

{

"first_name": "Jane",

"last_name": "Doe",

"middle_name": null,

"work_email": "[email protected]",

"personal_emails": null,

"direct_phone": "+1-555-0100",

"mobile_phone": null,

"job_title": "CEO",

"job_department": "Executive",

"seniority_level": "C-Suite",

"role": "Chief Executive Officer",

"linkedin_url": "https://linkedin.com/in/janedoe",

"linkedin_headline": "CEO at Acme Inc",

"city": "San Francisco",

"state": "California",

"country": "United States",

"company_name": "Acme Inc",

"company_domain": "acme.com",

"company_industry": "Technology",

"company_employee_count": "200",

"company_country": "United States",

"confidence_score": 95

}

],

"pagination": {

"page": 1,

"limit": 25,

"total": 142,

"has_next": true

}

}
```

## Search Companies 
`POST /search/companies` 
Search the open data index for companies matching the given filters. 

### Request Body 
Same structure as contact search. See request body above. 

### Filterable Company Fields 
| Field | Description
| `name` | Company name
| `domain` | Company domain
| `website` | Website URL
| `description` | Company description
| `industry` | Industry
| `industry_group` | Industry group
| `employee_count` | Number of employees
| `revenue` | Annual revenue
| `founded_year` | Year founded
| `country` | Country
| `state` | State/province
| `city` | City
| `phone` | Phone number
| `linkedin_url` | LinkedIn URL
| `linkedin_followers` | LinkedIn follower count 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/search/companies" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"filters": [

{"field": "industry", "operator": "contains", "value": ["Banking"]},

{"field": "employee_count", "operator": "between", "value": [100, 1000]},

{"field": "country", "operator": "any_of", "value": ["United States"]}

],

"page": 1,

"limit": 50

}'
```

```

response = requests.post(

f"{BASE_URL}/search/companies",

headers=HEADERS,

json={

"filters": [

{"field": "industry", "operator": "contains", "value": ["Banking"]},

{"field": "employee_count", "operator": "between", "value": [100, 1000]},

{"field": "country", "operator": "any_of", "value": ["United States"]}

],

"page": 1,

"limit": 50

}

)
```

```

const response = await fetch(`${BASE_URL}/search/companies`, {

method: "POST",

headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },

body: JSON.stringify({

filters: [

{ field: "industry", operator: "contains", value: ["Banking"] },

{ field: "employee_count", operator: "between", value: [100, 1000] },

{ field: "country", operator: "any_of", value: ["United States"] }

],

page: 1,

limit: 50

}),

});
```

### Response 

```

{

"data": [

{

"name": "First National Bank",

"domain": "fnb.com",

"website": "https://www.fnb.com",

"description": "Regional banking institution...",

"industry": "Banking",

"industry_group": "Financial Services",

"employee_count": "450",

"revenue": "$100M-$500M",

"founded_year": 1987,

"phone": "+1-555-0200",

"address": "100 Main St",

"city": "Pittsburgh",

"state": "Pennsylvania",

"country": "United States",

"zip": 15222,

"linkedin_url": "https://linkedin.com/company/fnb",

"linkedin_followers": "12500",

"facebook_url": "https://facebook.com/fnb",

"twitter_url": "https://twitter.com/fnb",

"crunchbase_url": null,

"logo_url": "https://logo.clearbit.com/fnb.com"

}

],

"pagination": {

"page": 1,

"limit": 50,

"total": 89,

"has_next": true

}

}
```

## Save Contacts to List 
`POST /search/contacts/save` 
Search contacts and save matching results to a new list in your organization. Results are saved asynchronously. Returns `202 Accepted`. 

### Request Body 
| Field | Type | Required | Description
| `filters` | array | Yes | Filter conditions (AND logic). At least one filter is required.
| `list_title` | string | Yes | Title for the new list
| `max_results` | integer | No | Maximum results to save (default: 1,000, max: 10,000)
| `page` | integer | No | Page number (default: 1; ignored on save, kept for request symmetry)
| `limit` | integer | No | Results per page (default: 25; ignored on save, kept for request symmetry) 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/search/contacts/save" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"filters": [

{"field": "job_title", "operator": "any_of", "value": ["VP Sales", "Head of Sales"]},

{"field": "company_industry", "operator": "contains", "value": ["SaaS"]}

],

"list_title": "Sales Leaders in SaaS",

"max_results": 5000

}'
```

```

response = requests.post(

f"{BASE_URL}/search/contacts/save",

headers=HEADERS,

json={

"filters": [

{"field": "job_title", "operator": "any_of", "value": ["VP Sales", "Head of Sales"]},

{"field": "company_industry", "operator": "contains", "value": ["SaaS"]}

],

"list_title": "Sales Leaders in SaaS",

"max_results": 5000

}

)

list_id = response.json()["data"]["list_id"]
```

```

const response = await fetch(`${BASE_URL}/search/contacts/save`, {

method: "POST",

headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },

body: JSON.stringify({

filters: [

{ field: "job_title", operator: "any_of", value: ["VP Sales", "Head of Sales"] },

{ field: "company_industry", operator: "contains", value: ["SaaS"] }

],

list_title: "Sales Leaders in SaaS",

max_results: 5000

}),

});

const listId = (await response.json()).data.list_id;
```

### Response 

```

{

"data": {

"list_id": 42,

"list_title": "Sales Leaders in SaaS",

"estimated_total": 3200,

"status": "processing"

}

}
```

````````  

## Save Companies to List 
`POST /search/companies/save` 
Search companies and save matching results to a new list. Returns `202 Accepted`. 

### Request Body 
Same structure as save contacts to list — uses company filter fields instead. 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/search/companies/save" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"filters": [

{"field": "industry", "operator": "any_of", "value": ["Financial Services"]},

{"field": "employee_count", "operator": "between", "value": [500, 5000]}

],

"list_title": "Mid-Market Financial Services",

"max_results": 2000

}'
```

```

response = requests.post(

f"{BASE_URL}/search/companies/save",

headers=HEADERS,

json={

"filters": [

{"field": "industry", "operator": "any_of", "value": ["Financial Services"]},

{"field": "employee_count", "operator": "between", "value": [500, 5000]}

],

"list_title": "Mid-Market Financial Services",

"max_results": 2000

}

)
```

```

const response = await fetch(`${BASE_URL}/search/companies/save`, {

method: "POST",

headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },

body: JSON.stringify({

filters: [

{ field: "industry", operator: "any_of", value: ["Financial Services"] },

{ field: "employee_count", operator: "between", value: [500, 5000] }

],

list_title: "Mid-Market Financial Services",

max_results: 2000

}),

});
```

### Response 

```

{

"data": {

"list_id": 43,

"list_title": "Mid-Market Financial Services",

"estimated_total": 890,

"status": "processing"

}

}
```

````
