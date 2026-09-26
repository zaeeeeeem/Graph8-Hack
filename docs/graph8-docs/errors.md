<!-- https://docs.graph8.com/developers/errors/ -->
# Errors

The API uses standard HTTP status codes to indicate success or failure. Error responses include a `detail` field with a human-readable message.  

## Error Response Format 

```

{

"detail": "Company not found"

}
```

For validation errors, the response includes field-level details: 

```

{

"detail": [

{

"loc": ["body", "work_email"],

"msg": "value is not a valid email address",

"type": "value_error.email"

}

]

}
```

## Status Codes 

### Success 
| Code | Meaning | Used By
| `200` | OK | GET, PATCH, DELETE
| `201` | Created | POST 

### Client Errors 
| Code | Meaning | Common Causes
| `400` | Bad Request | Missing required fields, invalid field values, no fields in update
| `401` | Unauthorized | Missing or invalid API key, expired API key, JWT token provided instead of API key
| `404` | Not Found | Resource does not exist or was deleted
| `422` | Unprocessable Entity | Request body fails validation (wrong types, invalid email format)
| `429` | Too Many Requests | Rate limit exceeded — see Rate Limits 

### Server Errors 
| Code | Meaning | Action
| `500` | Internal Server Error | Retry with backoff. If persistent, contact support.  

## Handling Errors  

-   Python  
-   TypeScript  
-   cURL     

```

response = requests.get(f"{BASE_URL}/contacts/99999", headers=HEADERS)

if response.status_code == 200:

contact = response.json()["data"]

elif response.status_code == 404:

print("Contact not found")

elif response.status_code == 401:

print("Check your API key")

elif response.status_code == 429:

retry_after = int(response.headers.get("Retry-After", 5))

print(f"Rate limited. Retry after {retry_after}s")

else:

print(f"Error {response.status_code}: {response.json()}")
```

```

const response = await fetch(`${BASE_URL}/contacts/99999`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

if (response.ok) {

const { data: contact } = await response.json();

} else if (response.status === 404) {

console.error("Contact not found");

} else if (response.status === 401) {

console.error("Check your API key");

} else if (response.status === 429) {

const retryAfter = response.headers.get("Retry-After") || "5";

console.error(`Rate limited. Retry after ${retryAfter}s`);

} else {

const error = await response.json();

console.error(`Error ${response.status}:`, error);

}
```

Terminal window
```

# Use -w to print the HTTP status code

curl -s -w "\nHTTP Status: %{http_code}\n" \

"https://be.graph8.com/api/v1/contacts/99999" \

-H "Authorization: Bearer $API_KEY"
```

## Common Error Scenarios 

### Authentication 
| Error | Cause | Fix
| `Missing Authorization header` | No `Authorization` header sent | Add `Authorization: Bearer <api_key>`
| `JWT token provided instead of API key` | Passed a browser session token | Use an org API key from Settings > API
| `API key not associated with an organization` | Key is malformed or revoked | Create a new key in Settings > API 

### Contacts 
| Error | Cause | Fix
| `list_id is required when creating contacts` | POST /contacts without `list_id` | Include `list_id` — every contact must belong to a list
| `Contact not found` | Contact ID doesn’t exist or was deleted | Verify the contact ID 

### Companies 
| Error | Cause | Fix
| `Company not found` | Company ID doesn’t exist or was deleted | Verify the company ID
| `No fields to update` | PATCH with empty body | Include at least one field to update 

### Lists 
| Error | Cause | Fix
| `Invalid list type` | POST /lists with unrecognized `type` | Use: `contacts`, `companies`, `suppressions`, `deals`, `leads`
| `List not found` | List ID doesn’t exist or was deleted | Verify the list ID
