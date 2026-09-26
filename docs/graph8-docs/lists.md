<!-- https://docs.graph8.com/developers/lists/ -->
# Lists

`````` 
Lists organize contacts into groups for campaigns, exports, and segmentation. 
Lists are also how data moves from the open data index into your workspace. When you call `/search/contacts/save` or `/search/companies/save`, graph8 creates a new list and populates it with matching records. Those contacts and companies then become part of your first-party data, accessible through the `/contacts` and `/companies` endpoints.  

## List All Lists 
`GET /lists` 
Returns a paginated list of all lists in your organization. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | `1` | Page number (1-indexed)
| `limit` | integer | `50` | Items per page (1-200) 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/lists?limit=20" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/lists",

headers=HEADERS,

params={"limit": 20}

)

lists = response.json()
```

```

const response = await fetch(`${BASE_URL}/lists?limit=20`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const lists = await response.json();
```

### Response 

```

{

"data": [

{

"id": 10,

"title": "Enterprise Prospects Q1",

"type": "contacts",

"source": "graph8",

"status": "completed",

"total": 1250,

"is_dynamic": false,

"tags": ["enterprise", "q1-2026"],

"created_at": "2026-01-15T10:00:00Z",

"created_by": "user_abc123",

"updated_at": "2026-02-20T14:30:00Z"

}

],

"pagination": {

"page": 1,

"limit": 20,

"total": 8,

"has_next": false

}

}
```

## Create List 
`POST /lists` 
Create a new empty list. Add contacts to it afterward using the Add Contacts endpoint. 

### Request Body 
| Field | Type | Required | Default | Description
| `title` | string | Yes | — | Name of the list
| `type` | string | No | `"contacts"` | List type: `contacts`, `companies`, `suppressions`, `deals`, `leads` 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/lists" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"title": "Enterprise Prospects Q1", "type": "contacts"}'
```

```

response = requests.post(

f"{BASE_URL}/lists",

headers=HEADERS,

json={"title": "Enterprise Prospects Q1", "type": "contacts"}

)

new_list = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/lists`, {

method: "POST",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({ title: "Enterprise Prospects Q1", type: "contacts" })

});

const { data: newList } = await response.json();
```

### Response `201 Created` 

```

{

"data": {

"id": 11,

"title": "Enterprise Prospects Q1",

"type": "contacts",

"status": "completed",

"total": 0

}

}
```

### Errors 
| Status | Meaning
| `400` | Invalid list type  

## Delete List 
`DELETE /lists/{list_id}` 
Soft-delete a list. The list is marked as deleted but not permanently removed. 

### Path Parameters 
| Parameter | Type | Description
| `list_id` | integer | List ID 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/lists/10" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.delete(f"{BASE_URL}/lists/10", headers=HEADERS)
```

```

const response = await fetch(`${BASE_URL}/lists/10`, {

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
| `404` | List not found 

## Get List Contacts 
`GET /lists/{list_id}/contacts` 
Returns the contacts in a specific list. 

### Path Parameters 
| Parameter | Type | Description
| `list_id` | integer | List ID 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | `1` | Page number (1-indexed)
| `limit` | integer | `50` | Items per page (1-200) 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/lists/10/contacts?limit=25" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/lists/10/contacts",

headers=HEADERS,

params={"limit": 25}

)

contacts = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/lists/10/contacts?limit=25`, {

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

"limit": 25,

"total": 1250,

"has_next": true

}

}
```

## Add Contacts to List 
`POST /lists/{list_id}/contacts` 
Add one or more contacts to a list by their IDs. 

### Path Parameters 
| Parameter | Type | Description
| `list_id` | integer | List ID 

### Request Body 
| Field | Type | Required | Description
| `contact_ids` | integer[] | Yes | Contact IDs to add 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/lists/10/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"contact_ids": [1, 2, 3, 4, 5]}'
```

```

response = requests.post(

f"{BASE_URL}/lists/10/contacts",

headers=HEADERS,

json={"contact_ids": [1, 2, 3, 4, 5]}

)

result = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/lists/10/contacts`, {

method: "POST",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({ contact_ids: [1, 2, 3, 4, 5] })

});

const { data: result } = await response.json();
```

### Response `201 Created` 

```

{

"data": {

"added": 5

}

}
```

## Remove Contacts from List 
`DELETE /lists/{list_id}/contacts` 
Remove one or more contacts from a list. The contacts are not deleted — they are only removed from this list. 

### Path Parameters 
| Parameter | Type | Description
| `list_id` | integer | List ID 

### Request Body 
| Field | Type | Required | Description
| `contact_ids` | integer[] | Yes | Contact IDs to remove 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/lists/10/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"contact_ids": [3, 4]}'
```

```

response = requests.delete(

f"{BASE_URL}/lists/10/contacts",

headers=HEADERS,

json={"contact_ids": [3, 4]}

)

result = response.json()["data"]
```

```

const response = await fetch(`${BASE_URL}/lists/10/contacts`, {

method: "DELETE",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json"

},

body: JSON.stringify({ contact_ids: [3, 4] })

});

const { data: result } = await response.json();
```

### Response 

```

{

"data": {

"removed": 2

}

}
```
