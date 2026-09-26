<!-- https://docs.graph8.com/developers/authentication/ -->
# Authentication

graph8 has three authentication methods depending on how you’re integrating: 
| Method | Use case | Where to get it
| API Key | REST API, CLI (server-side), SDK server features | Settings > MCP & API > API tab
| Write Key | SDK client-side (tracking, visitor ID, forms, widgets) | Settings > MCP & API > tracking snippet
| OAuth | MCP Server (Claude.ai, Claude Desktop, Cursor) | Automatic - paste URL and sign in 
OAuth is how AI hosts connect with no key to manage: 
ClaudeClaude DesktopClaude CodeCursorWindsurfChatGPT 

- ``
- 
-  
The Developer API authenticates requests using organization API keys. JWT tokens are not accepted — use an API key for all programmatic access. 

## Creating an API Key  
- Go to Settings -> API in your graph8 workspace 
- Click Create API Key 
- Enter a name (e.g., “CRM Sync” or “Data Export”) 
- Optionally set an expiration (1-365 days) 
- Copy the key immediately — it’s only shown once  

## Using Your API Key 
Include the key in the `Authorization` header with the `Bearer` prefix:  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

export API_KEY="your_api_key_here"

curl "https://be.graph8.com/api/v1/contacts" \

-H "Authorization: Bearer $API_KEY"
```

```

import requests

API_KEY = "your_api_key_here"

BASE_URL = "https://be.graph8.com/api/v1"

HEADERS = {"Authorization": f"Bearer {API_KEY}"}

response = requests.get(f"{BASE_URL}/contacts", headers=HEADERS)

print(response.json())
```

```

const API_KEY = "your_api_key_here";

const BASE_URL = "https://be.graph8.com/api/v1";

const response = await fetch(`${BASE_URL}/contacts`, {

headers: { Authorization: `Bearer ${API_KEY}` }

});

const data = await response.json();

console.log(data);
```

## Key Characteristics 
| Property | Details
| Scope | Organization-level — access to all data in your org
| Format | Opaque token (not a JWT)
| Expiration | Optional, 1-365 days from creation
| Rotation | Delete and create a new key, or use the Rotate button in Settings
| Rate Limit | 50 requests/second + 1,000 requests/minute (per org) - see Rate Limits 
Each API key is bound to exactly one organization at the time it is minted. The server resolves the org from the key itself — request bodies and query strings never carry an `org_id`, and you cannot point a key at a different org. This is what makes the API safe by default for multi-tenant data: a key can only ever read and write its own org’s data. 

`` 

## `X-Org-Id` Header (Optional Guard, Not a Switch) 
You may send an `X-Org-Id` header. It is a safety assertion, not an org selector: 
| Request | Result
| API key only (no `X-Org-Id`) | 200 — resolves to the key’s org
| API key + `X-Org-Id` matching the key’s org (case-insensitive) | 200
| API key + `X-Org-Id` for a different org | 403 — cross-tenant request refused 
Use it as a defensive check when your integration manages keys for several orgs and you want the server to reject a mismatched key/org pairing rather than silently operate on the wrong tenant. 

### Example  

-   cURL     

Terminal window
```

# No X-Org-Id needed — key resolves the org automatically

curl "https://be.graph8.com/api/v1/contacts" \

-H "Authorization: Bearer $API_KEY"

# Optional safety assertion — 403 if key does not belong to this org

curl "https://be.graph8.com/api/v1/contacts" \

-H "Authorization: Bearer $API_KEY" \

-H "X-Org-Id: org_your_org_id"
```

## Working with Multiple Organizations 
For a normal single-org key there is no per-request org switching. If your account belongs to several orgs, mint one API key per org and send the key for the org you intend to act on. Because the org is fixed by the key, a write always lands in that key’s org. 

`````` 

## Agency Keys & Cross-Org Targeting 
An agency is an org that manages a portfolio of client orgs (linked in graph8 as parent→child). An agency can mint a single agency-scoped API key and use it to operate any of its client orgs through the entire Developer API — contacts, sequences, dialer, workflows, appointments, deals, everything — without minting one key per client. 

## POST /v1/api-keys 
`POST /v1/api-keys` 
Mint a new API key. To create an agency-scoped key that can target client orgs, pass `is_agency: true` in the request body. Only allowed when the authenticating org is a recognized agency (has linked client orgs or is flagged as an agency); otherwise returns 400. 

### Request Body 
| Parameter | Type | Description
| `name` | string | Human-readable label for the key (e.g. “CIENCE agency ops”)
| `is_agency` | boolean | Set to `true` to mint an agency-scoped key. Omit or set `false` for a normal single-org key. 

### Response 
Returns the newly created key. The `token` field is shown once and cannot be retrieved again. 
| Field | Type | Description
| `token` | string | The API key value — copy immediately, shown once only
| `name` | string | Label you provided
| `is_agency` | boolean | `true` if this is an agency-scoped key 

### Example  

-   cURL     

Terminal window
```

# Mint a normal single-org key

curl -X POST "https://be.graph8.com/api/v1/api-keys" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "CRM Sync"}'

# Mint an agency-scoped key (agency org only)

curl -X POST "https://be.graph8.com/api/v1/api-keys" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "CIENCE agency ops", "is_agency": true}'
```

### Response 

```

{

"token": "g8_live_<your-key-shown-once-at-creation>",

"name": "CIENCE agency ops",

"is_agency": true

}
```

## Using an Agency Key — `X-Target-Org-Id` 
Send the agency key plus an `X-Target-Org-Id` header naming the client org you want to act on. The request then reads and writes that client org’s data. 

### `X-Target-Org-Id` Behavior 
| Request | Result
| Agency key, no `X-Target-Org-Id` | 200 — resolves to the agency’s own org
| Agency key + `X-Target-Org-Id` for an authorized client (case-insensitive) | 200 — operates that client org
| Agency key + `X-Target-Org-Id` = the agency’s own org | 200 — operates the agency org
| Agency key + `X-Target-Org-Id` for an org outside the agency’s set | 403 — not authorized for that target
| Normal key + `X-Target-Org-Id` | header ignored — resolves to the key’s own org (no error) 
``

- ````
- ````````````
- 
-  

### Example  

-   cURL     

Terminal window
```

# Agency key acting on a client org

curl "https://be.graph8.com/api/v1/contacts" \

-H "Authorization: Bearer $AGENCY_API_KEY" \

-H "X-Target-Org-Id: org_client_org_id"
```

## Authentication Errors 
| Status | Meaning | Fix
| `401` | Missing or invalid `Authorization` header | Check your API key is correct
| `401` | JWT token provided instead of API key | Use an org API key, not a browser session token
| `401` | API key not associated with an organization | Ensure the key was created in Settings -> API
| `429` | Rate limit exceeded | Wait and retry with backoff (see Rate Limits) 

### Example Error Response 

```

{

"detail": "Missing Authorization header. Use: Authorization: Bearer <api_key>"

}
```

## Security Best Practices 
Do:  
- Store keys in environment variables or a secrets manager 
- Use separate keys for development and production 
- Set expiration dates on keys 
- Rotate keys periodically 
- Delete unused keys promptly  
Don’t:  
- Commit keys to version control 
- Share keys via email or chat 
- Expose keys in frontend JavaScript or client-side code 
- Log keys in application output
