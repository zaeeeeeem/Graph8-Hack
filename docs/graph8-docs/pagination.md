<!-- https://docs.graph8.com/developers/pagination/ -->
# Pagination

All API responses use a standard JSON envelope. List endpoints include pagination metadata to help you iterate through large datasets.  

## Response Envelope 
Every response wraps its payload in a `data` field: 

```

{

"data": { ... }

}
```

List endpoints also include a `pagination` object: 

```

{

"data": [ ... ],

"pagination": {

"page": 1,

"limit": 50,

"total": 342,

"has_next": true,

"next_cursor": "bzo1MA"

}

}
```

### Pagination Fields 
| Field | Type | Description
| `page` | integer | Current page number (1-indexed)
| `limit` | integer | Number of items per page
| `total` | integer | Total number of items across all pages
| `has_next` | boolean | `true` if more pages are available
| `next_cursor` | string | null | Opaque cursor for the next page; `null` on the last page. Pass it back as `cursor`.  

## Query Parameters 
All list endpoints accept these pagination parameters: 
| Parameter | Type | Default | Range | Description
| `page` | integer | `1` | 1+ | Page number to retrieve
| `limit` | integer | `50` | 1-200 | Number of items per page
| `cursor` | string | — | — | Opaque cursor from a prior response’s `next_cursor`. Takes precedence over `page`. 
You can paginate two ways: by page number (`page`) or by opaque cursor (`cursor`). They share the same `limit`. When you send a `cursor`, the `page` parameter is ignored.  

## Iterating Through Pages 
Use `has_next` to determine when to stop paginating.  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

# Fetch page 1

curl "https://be.graph8.com/api/v1/contacts?page=1&limit=100" \

-H "Authorization: Bearer $API_KEY"

# If has_next is true, fetch page 2

curl "https://be.graph8.com/api/v1/contacts?page=2&limit=100" \

-H "Authorization: Bearer $API_KEY"
```

```

import requests

API_KEY = "your_api_key_here"

BASE_URL = "https://be.graph8.com/api/v1"

HEADERS = {"Authorization": f"Bearer {API_KEY}"}

all_contacts = []

page = 1

while True:

response = requests.get(

f"{BASE_URL}/contacts",

headers=HEADERS,

params={"page": page, "limit": 200}

)

data = response.json()

all_contacts.extend(data["data"])

if not data["pagination"]["has_next"]:

break

page += 1

print(f"Fetched {len(all_contacts)} contacts")
```

```

const API_KEY = "your_api_key_here";

const BASE_URL = "https://be.graph8.com/api/v1";

async function fetchAllContacts() {

const allContacts = [];

let page = 1;

while (true) {

const response = await fetch(

`${BASE_URL}/contacts?page=${page}&limit=200`,

{ headers: { Authorization: `Bearer ${API_KEY}` } }

);

const { data, pagination } = await response.json();

allContacts.push(...data);

if (!pagination.has_next) break;

page++;

}

return allContacts;

}
```

## Cursor Pagination 
For forward iteration you can follow `next_cursor` instead of incrementing `page`. The cursor is an opaque token — don’t parse or construct it; just pass the last response’s `next_cursor` back as the `cursor` parameter. When `next_cursor` is `null`, you’ve reached the end. 
This is the Stripe `starting_after` / Twilio `PageToken` equivalent, and is the recommended pattern for scripts that walk an entire list.  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

# First page — no cursor

curl "https://be.graph8.com/api/v1/usage/transactions?limit=100" \

-H "Authorization: Bearer $API_KEY"

# => { "data": [...], "pagination": { "next_cursor": "bzoxMDA", ... } }

# Next page — pass the previous next_cursor

curl "https://be.graph8.com/api/v1/usage/transactions?limit=100&cursor=bzoxMDA" \

-H "Authorization: Bearer $API_KEY"
```

```

import requests

API_KEY = "your_api_key_here"

URL = "https://be.graph8.com/api/v1/usage/transactions"

HEADERS = {"Authorization": f"Bearer {API_KEY}"}

rows, cursor = [], None

while True:

params = {"limit": 200}

if cursor:

params["cursor"] = cursor

page = requests.get(URL, headers=HEADERS, params=params).json()

rows.extend(page["data"])

cursor = page["pagination"]["next_cursor"]

if not cursor:  # null -> done

break

print(f"Fetched {len(rows)} transactions")
```

```

const API_KEY = "your_api_key_here";

const URL = "https://be.graph8.com/api/v1/usage/transactions";

async function fetchAll() {

const rows: unknown[] = [];

let cursor: string | null = null;

do {

const qs = new URLSearchParams({ limit: "200" });

if (cursor) qs.set("cursor", cursor);

const res = await fetch(`${URL}?${qs}`, {

headers: { Authorization: `Bearer ${API_KEY}` },

});

const { data, pagination } = await res.json();

rows.push(...data);

cursor = pagination.next_cursor;

} while (cursor);

return rows;

}
```

A malformed or foreign `cursor` returns `400` with `{ "type": "bad_request", ... }`.  

## Best Practices  
- Prefer `cursor` for walking an entire list — follow `next_cursor` until it’s `null`. Use `page` only when you need to jump to a specific page number. 
- Use the maximum `limit` (200) when exporting large datasets to minimize requests. 
- Check `has_next` (or a `null` `next_cursor`) instead of computing from `page * limit < total` — this avoids off-by-one errors. 
- Respect rate limits — add a short delay between pages if fetching many pages. See Rate Limits. 
- Don’t assume order — results are returned in the default order for each resource. If you need a specific order, sort client-side.
