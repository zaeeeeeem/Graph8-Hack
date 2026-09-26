<!-- https://docs.graph8.com/developers/idempotency/ -->
# Idempotency

Network errors and timeouts are unavoidable — but retrying a `POST` shouldn’t create the same record twice. Send an `Idempotency-Key` header and a safe retry of the same request returns the first response instead of creating a duplicate. 
This is the Stripe idempotency pattern: the first response (status + body) is cached for 24 hours keyed to your organization and the key you chose; any retry with the same key replays that response. 

## How it works  
- Generate a unique key per logical operation — a UUID v4 is ideal. 
- Send it as the `Idempotency-Key` header on your `POST`. 
- If the request succeeds, the response is cached for 24h. 
- Any retry with the same key returns the cached response, flagged with an `Idempotent-Replay: true` response header — no second record is created.   

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl -X POST https://be.graph8.com/api/v1/contacts \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-H "Idempotency-Key: 5f9b8c1e-2a4d-4e7f-9c3b-1d2e3f4a5b6c" \

-d '{"email": "[email protected]", "list_id": 1234}'

# Retry the exact same request (same key) -> same response body,

# with header: Idempotent-Replay: true
```

```

import uuid

import httpx

key = str(uuid.uuid4())  # one key per logical create

headers = {

"Authorization": f"Bearer {API_KEY}",

"Idempotency-Key": key,

}

payload = {"email": "[email protected]", "list_id": 1234}

# Safe to retry on timeout — the second call replays the first response

for attempt in range(3):

try:

r = httpx.post("https://be.graph8.com/api/v1/contacts", json=payload, headers=headers)

if r.headers.get("Idempotent-Replay") == "true":

print("replayed first response, no duplicate created")

break

except httpx.TransportError:

continue
```

```

const key = crypto.randomUUID();

async function createContact() {

return fetch("https://be.graph8.com/api/v1/contacts", {

method: "POST",

headers: {

Authorization: `Bearer ${API_KEY}`,

"Content-Type": "application/json",

"Idempotency-Key": key, // reuse the same key when retrying

},

body: JSON.stringify({ email: "[email protected]", list_id: 1234 }),

});

}
```

## Rules & limits 
| Rule | Detail
| Header name | `Idempotency-Key`
| Max length | 255 characters (a malformed/oversized key returns `400`)
| Cache window | 24 hours per key, scoped to your organization
| Replay marker | Replayed responses carry `Idempotent-Replay: true`
| Recommended value | A UUID v4, unique per logical operation 

## Supported endpoints 
Idempotency is rolling out across `POST` create endpoints, starting with:  
- `POST /api/v1/contacts` — create contacts  
More creators gain `Idempotency-Key` support each release. Sending the header to an endpoint that doesn’t yet support it is harmless — it’s simply ignored. 

## Best practices  
- One key per logical operation — not per process, not per day. Reuse the same key only when retrying the same request. 
- Store the key alongside the operation you’re performing so a retry after a crash can reuse it. 
- Don’t reuse a key for a different payload — the cached response is returned regardless of the new body, so a different payload under the same key won’t take effect.
