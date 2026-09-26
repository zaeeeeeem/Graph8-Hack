<!-- https://docs.graph8.com/developers/usage/ -->
# Usage & Metering

Every metered operation in graph8 (enrichment, AI calls, dialer minutes, sends, …) draws down your organization’s credit balance. The Usage API lets you read that balance and the full transaction ledger programmatically — so you can build budget alerts, cost dashboards, or reconcile spend without leaving your own tooling. 
All endpoints are authenticated with an org API key: `Authorization: Bearer <api_key>`. They are read-only.  

## Get current balance 
`GET /usage` 
Returns the organization’s credit balance, held credits, available credits, and lifetime totals.  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/usage" \

-H "Authorization: Bearer $API_KEY"
```

```

import requests

resp = requests.get(

"https://be.graph8.com/api/v1/usage",

headers={"Authorization": f"Bearer {API_KEY}"},

)

balance = resp.json()["data"]

print(balance["available_credits"])
```

```

const resp = await fetch("https://be.graph8.com/api/v1/usage", {

headers: { Authorization: `Bearer ${apiKey}` },

});

const { data } = await resp.json();

console.log(data.available_credits);
```

### Response 

```

{

"data": {

"customer_id": "org_aBc123",

"credits": 10000,

"held_credits": 150,

"available_credits": 9850,

"total_earned": 50000,

"total_used": 40000

}

}
```

| Field | Description
| `credits` | Total credit balance
| `held_credits` | Credits reserved by in-flight holds (e.g. dialer minutes)
| `available_credits` | Spendable now (`credits` − `held_credits`)
| `total_earned` / `total_used` | Lifetime totals  

## List transactions 
`GET /usage/transactions` 
Returns the credit-transaction ledger, most recent first, paginated. 

### Query parameters 
| Param | Default | Description
| `page` | `1` | Page number (1-indexed)
| `limit` | `50` | Items per page (max `200`)  

-   cURL  
-   Python  
-   TypeScript     

Terminal window
```

curl "https://be.graph8.com/api/v1/usage/transactions?page=1&limit=50" \

-H "Authorization: Bearer $API_KEY"
```

```

import requests

resp = requests.get(

"https://be.graph8.com/api/v1/usage/transactions",

headers={"Authorization": f"Bearer {API_KEY}"},

params={"page": 1, "limit": 50},

)

body = resp.json()

for tx in body["data"]:

print(tx["created_at"], tx["service"], tx["amount"])

print("more pages:", body["pagination"]["has_next"])
```

```

const resp = await fetch(

"https://be.graph8.com/api/v1/usage/transactions?page=1&limit=50",

{ headers: { Authorization: `Bearer ${apiKey}` } },

);

const body = await resp.json();

for (const tx of body.data) console.log(tx.created_at, tx.service, tx.amount);
```

### Response 

```

{

"data": [

{

"id": "9f2c…",

"type": "usage",

"amount": -10,

"service": "ai_enrichment",

"quantity": 1,

"llm_tier": "g8_t2",

"description": "Bulk enrichment",

"created_at": "2026-06-29T12:00:00Z"

}

],

"pagination": { "page": 1, "limit": 50, "total": 1240, "has_next": true }

}
```

| Field | Description
| `amount` | Credit delta — negative = spend, positive = top-up/grant
| `service` | The service charged (e.g. `ai_enrichment`, `dialer`, `web_visitor`). Group by this for a per-feature cost breakdown.
| `llm_tier` | `g8_t1` / `g8_t2` / `g8_t3` when the charge was an LLM call
| `type` | Transaction type (`usage`, `purchase`, …) 

````````  

## Errors 
Failures return the standard error envelope with a `request_id`. A `404` means the org has no credit customer record yet (no usage incurred).
