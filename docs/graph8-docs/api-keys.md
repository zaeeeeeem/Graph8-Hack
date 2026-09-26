<!-- https://docs.graph8.com/developers/api-keys/ -->
# API Keys: Live & Test Mode

graph8 API keys come in two modes, Stripe-style: 
| Mode | Prefix | Use for
| Live | `g8_live_…` | Production traffic against your real data
| Test | `g8_test_…` | Integration + CI; tells test keys from live ones at a glance 
The mode is authoritative — it’s stamped on the key at creation and read back on every request. Editing the prefix on a key string does not change its mode; the prefix is only a cosmetic label. Legacy keys with no prefix are treated as live, so existing integrations are unaffected. 

## Create a key 
`POST /v1/api-keys` with an optional `mode` (default `live`). The token is returned once — store it securely.  

-   curl  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST https://be.graph8.com/v1/api-keys \

-H "Authorization: Bearer $G8_API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "CI test key", "mode": "test"}'

# => { "api_key_id": "...", "api_key_token": "g8_test_...", "name": "CI test key", "mode": "test" }
```

```

import httpx

r = httpx.post(

"https://be.graph8.com/v1/api-keys",

headers={"Authorization": f"Bearer {api_key}"},

json={"name": "CI test key", "mode": "test"},

)

token = r.json()["api_key_token"]  # g8_test_...
```

```

const res = await fetch("https://be.graph8.com/v1/api-keys", {

method: "POST",

headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },

body: JSON.stringify({ name: "CI test key", mode: "test" }),

});

const { api_key_token } = await res.json(); // g8_test_...
```

## Using a key 
Send it as a bearer token — the `g8_live_` / `g8_test_` prefix is accepted and stripped automatically before validation: 
Terminal window
```

curl https://be.graph8.com/api/v1/contacts -H "Authorization: Bearer g8_test_..."
```

## Listing keys 
`GET /v1/api-keys` returns each key with its `mode` and `last_used_at` (unix seconds; `null` if the key has never been used). Tokens are never returned by the list. 
Terminal window
```

curl https://be.graph8.com/v1/api-keys -H "Authorization: Bearer $G8_API_KEY"

# {

#   "keys": [

#     { "api_key_id": "...", "name": "CI test key", "mode": "test",

#       "is_agency": false, "created_at": 1719700000, "last_used_at": 1719786400 }

#   ],

#   "total": 1

# }
```

`last_used_at` is stamped best-effort at authentication time (roughly per-minute granularity) — use it to spot stale keys you can revoke.
