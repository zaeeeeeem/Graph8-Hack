<!-- https://docs.graph8.com/developers/notes/ -->
# Notes

Notes let you attach free-text annotations to contacts for context, follow-ups, and team collaboration.  

## List Notes 
`GET /contacts/{contact_id}/notes` 
Returns all notes on a contact, sorted by most recent first. 

### Path Parameters 
| Parameter | Type | Description
| `contact_id` | string | Contact ID 

### Example  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/contacts/12345/notes" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/contacts/12345/notes",

headers=HEADERS

)

notes = response.json()
```

```

const response = await fetch(`${BASE_URL}/contacts/12345/notes`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const notes = await response.json();
```

### Response 

```

{

"data": [

{

"id": "note_uuid",

"content": "Spoke with Jane about the Q2 renewal.",

"entity_type": "contact",

"entity_id": "12345",

"created_by": "user_x",

"created_by_name": "John",

"created_at": "2026-02-25T14:30:00Z",

"updated_at": "2026-02-25T14:30:00Z"

}

]

}
```

## Create Note 
`POST /contacts/{contact_id}/notes` → `201 Created` 
Returns the full note object on success. 

### Path Parameters 
| Parameter | Type | Description
| `contact_id` | string | Contact ID 

### Request Body 
| Field | Type | Required | Description
| `content` | string | Yes | Note text content 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/contacts/12345/notes" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"content": "Follow up next week about pricing."}'
```

```

response = requests.post(

f"{BASE_URL}/contacts/12345/notes",

headers=HEADERS,

json={"content": "Follow up next week about pricing."}

)
```

### Response `201 Created` 

```

{

"data": {

"id": "note_uuid",

"content": "Follow up next week about pricing.",

"entity_type": "contact",

"entity_id": "12345",

"created_by": "user_x",

"created_by_name": "John",

"created_at": "2026-02-25T14:30:00Z",

"updated_at": "2026-02-25T14:30:00Z"

}

}
```

## Update Note 
`PATCH /notes/{note_id}` 

### Path Parameters 
| Parameter | Type | Description
| `note_id` | string | Note ID 

### Request Body 
| Field | Type | Required | Description
| `content` | string | Yes | Updated note text 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/notes/note_uuid" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"content": "Updated text"}'
```

## Delete Note 
`DELETE /notes/{note_id}` 
Returns `204 No Content` on success.
