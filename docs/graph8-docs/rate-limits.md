<!-- https://docs.graph8.com/developers/rate-limits/ -->
# Rate Limits

The API enforces rate limits per org to ensure fair usage and platform stability. 

## Limits 
| Window | Limit
| Per second | 50 requests
| Per minute | 1,000 requests 
Applied per org (keyed off your API key) across all data API endpoints. The per-second cap absorbs bursts; the per-minute cap governs sustained throughput. Exceeding either returns `429 Too Many Requests`. 

## Rate Limit Headers 
Every response carries your current quota state — on success and on `429` — so you can self-pace before you ever get throttled: 
| Header | Description
| `X-RateLimit-Limit-Second` | Per-second ceiling (`50`)
| `X-RateLimit-Limit-Minute` | Per-minute ceiling (`1000`)
| `X-RateLimit-Remaining` | Requests left in the current minute window
| `X-RateLimit-Reset` | Unix epoch (seconds) when the minute window next frees a slot
| `Retry-After` | Seconds to wait before retrying (sent on `429` only) 

### Example `429` Response 

```

HTTP/1.1 429 Too Many Requests

Retry-After: 1

X-RateLimit-Limit-Second: 50

X-RateLimit-Limit-Minute: 1000

X-RateLimit-Remaining: 0

X-RateLimit-Reset: 1716624957

Content-Type: application/json

{"detail": "Rate limit exceeded. Please slow down."}
```

## Retry Strategy 
Use exponential backoff with the `Retry-After` header:  

-   Python  
-   TypeScript  
-   cURL     

```

import time

import requests

def api_request(url, headers, max_retries=3):

for attempt in range(max_retries):

response = requests.get(url, headers=headers)

if response.status_code != 429:

return response

retry_after = int(response.headers.get("Retry-After", 2 ** attempt))

print(f"Rate limited. Retrying in {retry_after}s...")

time.sleep(retry_after)

return response  # Return last response if all retries exhausted
```

```

async function apiRequest(url: string, headers: HeadersInit, maxRetries = 3) {

for (let attempt = 0; attempt < maxRetries; attempt++) {

const response = await fetch(url, { headers });

if (response.status !== 429) return response;

const retryAfter = parseInt(response.headers.get("Retry-After") || String(2 ** attempt));

console.log(`Rate limited. Retrying in ${retryAfter}s...`);

await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));

}

}
```

Terminal window
```

# Simple retry with backoff

for i in 1 2 3; do

response=$(curl -s -w "\n%{http_code}" \

"https://be.graph8.com/api/v1/contacts" \

-H "Authorization: Bearer $API_KEY")

status=$(echo "$response" | tail -1)

if [ "$status" != "429" ]; then

echo "$response" | head -n -1

break

fi

echo "Rate limited, retrying in ${i}s..."

sleep $i

done
```

## Best Practices  
- Use pagination with high limits - fetch 200 items per page instead of making 200 individual requests. 
- Watch `X-RateLimit-Remaining` - back off as it approaches `0` instead of waiting for a `429`; `X-RateLimit-Reset` tells you when the window frees up. 
- Cache responses - if you fetch the same data repeatedly, cache it locally to reduce API calls. 
- Use backoff, not tight loops - when rate-limited, always respect the `Retry-After` header instead of retrying immediately.
