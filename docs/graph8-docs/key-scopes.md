<!-- https://docs.graph8.com/developers/key-scopes/ -->
# Restricted Keys (Scopes)

Restrict an API key to a subset of the API with scopes. A key with no scopes is unrestricted (full access) — so every existing key keeps working; scopes are opt-in. 
| Scope | Grants
| `*` | Everything
| `contacts:*` | Every action on contacts
| `contacts:read` | Exactly contacts read 

## Mint a restricted key 
Pass `scopes` to `POST /v1/api-keys`. The scopes are stored on the key (authoritative) and returned in the response.  

-   curl  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST https://be.graph8.com/v1/api-keys \

-H "Authorization: Bearer $G8_API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "read-only usage", "scopes": ["usage:read", "contacts:read"]}'

# => { "api_key_id": "...", "api_key_token": "g8_live_...", "scopes": ["usage:read","contacts:read"], ... }
```

```

import httpx

r = httpx.post(

"https://be.graph8.com/v1/api-keys",

headers={"Authorization": f"Bearer {api_key}"},

json={"name": "read-only usage", "scopes": ["usage:read", "contacts:read"]},

)
```

```

await fetch("https://be.graph8.com/v1/api-keys", {

method: "POST",

headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },

body: JSON.stringify({ name: "read-only usage", scopes: ["usage:read", "contacts:read"] }),

});
```

## Enforcement 
A request to an endpoint whose required scope the key lacks returns `403` with `{ "type": "forbidden", "code": "403", ... }`. An unscoped key passes every check. 

``
