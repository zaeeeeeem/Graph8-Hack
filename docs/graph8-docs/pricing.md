<!-- https://docs.graph8.com/developers/pricing/ -->
# Pricing

graph8 has two paid plans plus a free tier. Both paid plans give you the same graph8-owned data for free within a 50 rps cap — contacts, B2B index search + lookup, intent signals, website visitors. Credits only deduct when you reach for third-party providers, AI generation, outreach sends, voice minutes, or paid integrations. 

- 
-  

## Plan Comparison 
|  | Free trial | PAYG | Platform
| Price | $0 | $0.05 / credit | $499 / month
| Free credits on signup | See below | 1,000 | 2,500
| Card required to start | No | No | No
| Included AI credits / month | - | Pay-per-credit | 75,000
| graph8-owned data (contacts, B2B, intent, visitors) | Metered (1 cr / record) | Free (50 rps) | Free (50 rps)
| Waterfall enrichment (3rd-party) | Credits | Credits | Credits
| AI generation (copilot, replies, copy, drafts, landing-page chat) | Credits (per LLM tokens) | Credits (per LLM tokens) | Drawn from 75k bundle, then $0.00666/credit
| Voice minutes | 20 / min | 20 / min | Drawn from 75k bundle
| Meeting bookings (booking confirmation) | 20 each | 20 each | Drawn from 75k bundle
| Sequencer / campaign / newsletter sends | Per step or recipient | Per step or recipient | Drawn from 75k bundle
| Auto-CRM-capture | Off | On (default) | On (default)
| Rate limit | 50 rps | 50 rps | 50 rps
| Work email required | Yes | Yes | Yes
| Best for | Trying graph8 | Developers, evaluators, low volume | Teams running real GTM 

## Free Tier 
Two ways to start free, both without a card:  
- PAYG signup: 1,000 free credits, no expiration timer. 
- Platform trial: 2,500 free credits to evaluate the full Platform experience before subscribing.  
Personal email domains (gmail, yahoo, outlook, etc.) are blocked - signup requires a work email. 

## Free on both PAYG and Platform 
graph8-owned data has no third-party COGS, so it is free for paid orgs within the 50 rps cap on both plans. 

### Contact + B2B data (graph8’s 700M+ / 100M+ index) 
| Endpoint | What it does
| `POST /api/v1/search/contacts` | ICP contact search across 700M+ records
| `POST /api/v1/search/companies` | ICP company search across 100M+ records
| `POST /api/v1/search/contacts/save`, `/search/companies/save` | Save matching records to a list
| `POST /api/v1/enrichment/lookup/person` | Email / LinkedIn / name+domain → person (index hit)
| `POST /api/v1/enrichment/lookup/company` | Domain / name → company (index hit)
| `POST /api/v1/enrichment/verify-email` | Internal validator (free); external Kickbox/ZeroBounce providers charge separately 

### Your CRM (first-party data) 
| Endpoint | What it does
| `GET/POST/PATCH/DELETE /api/v1/contacts` | Full contact CRUD
| `GET/POST/PATCH/DELETE /api/v1/companies` | Full company CRUD
| `GET/POST/PATCH/DELETE /api/v1/lists` | Manage lists
| `GET/POST/PATCH/DELETE /api/v1/deals` | Manage deals
| `GET/POST/PATCH/DELETE /api/v1/tasks`, `/notes`, `/fields`, `/quotes` | Tasks, notes, custom fields, quotes (metadata) 

### Intent + website-visitor signals 
| Endpoint | What it does
| `GET /api/v1/intent/stats` | Org-level intent rollups
| `POST /api/v1/intent/keywords/list` | Tracked keyword groups
| `POST /api/v1/intent/pages/visitors` | Visitor records for a page URL
| `POST /api/v1/intent/pages/contacts` | Contacts that visited a page
| `POST /api/v1/intent/keywords/{id}/companies|contacts|urls` | Per-keyword aggregations
| `GET /api/v1/public/visitors/score`, `/visitors/company` | Anonymous-visitor IP resolution
| `POST /api/v1/public/signals/company` | Aggregate company-level intent score 

### Workflow / Studio / webhook plumbing 
| Endpoint | What it does
| Workflow / skill / pipeline / landing-page CRUD | Metadata management (execution charges separately — see below)
| Studio reads (ICPs, personas, brand brief, intelligence, research reports) | Read-only context for AI generation
| Webhook subscription mgmt + delivery | Configure + receive event callbacks
| Calendar widget load, slot lookup (`g8.calendar.slots`) | Browse availability without booking (booking confirmation charges — see below) 

```````` 

``````  

## What consumes credits 
These call out to third-party providers, send real messages, run AI, or trigger paid services. They consume credits on both PAYG and Platform - the only difference is whether they draw from your pay-per-credit balance (PAYG) or your 75,000-credit monthly bundle (Platform). 
| Action | Credits | Where
| Waterfall enrichment (1 contact) | 0.5-20 per provider hit (typically 1-3) | `POST /api/v1/enrichment/enrich` — full per-provider matrix in Enrichment
| Copilot turn (chat message) | Per LLM tokens (~1 per 1,000) | `g8.copilot.ask()`, Studio Copilot, `/api/v1/public/copilot/chat`
| AI inbox draft | Per LLM tokens | `POST /api/v1/inbox/{id}/draft`
| AI generation — copy, brief, brand kit, intelligence | Per LLM tokens | Studio generation tasks
| Landing-page chat edit | Per LLM tokens | `POST /api/v1/pages/{id}/chat`
| Skill execute (`type=llm`) | Per LLM tokens | `POST /api/v1/skills/{id}/execute`
| Voice AI minute | 20 | Voice / dialer (call audio)
| Meeting booked (booking confirmation) | 20 | `POST /appointments/bookings` — calendar widget load + slot lookup are free
| Process 1 intent signal | 1 | Intent processing (background)
| Event stream ingest at scale | 1 per 10 events | Tracking / CDP
| Campaign step / sequence send 1 | 1 per step | `/campaigns/launch`, sequencer engagement sends
| Newsletter send | 1 per recipient | Newsletter / nurture campaigns
| Bulk email verification (internal) | 1 per email | `POST /api/v1/contacts/verify-emails`
| External email verifier (Kickbox, ZeroBounce) | 1 per verify | `/enrichment/verify-email?provider=...`
| Skill execute (`type=api`) | Free (graph8-side) | Third-party HTTP may charge
| Audience-sync push | Per-record where the destination platform meters | `/audience-syncs/{id}/trigger` 
Storing contacts and companies in your CRM is free. Credits only apply when data is enriched via third parties, used in outreach, processed by AI (copilot, drafts, generation), or pushed to a metered destination. 

## PAYG (Pay-as-you-go) 
The entry tier. Every feature is available - no feature walls.  
- $0.05 per credit, billed against your balance 
- 1,000 free credits on signup, no card 
- Full platform access - search, enrichment, sequences, campaigns, copilot, intent, ads, voice, landing pages 
- Free graph8-owned data within 50 rps — contact CRM, B2B index search + lookup, intent + visitor signals — same as Platform 
- Auto-CRM-capture is on - every contact or company returned by the API is saved into your CRM 
- 50 requests/second on data API endpoints  
Best for: developers, evaluators, scripts, low-volume integrations.  

## Platform - $499/month 
For teams running real GTM workflows on graph8.  
- 2,500 free credits on signup to trial before subscribing (no card) 
- 75,000 credits per month included for AI generation, voice minutes, meeting bookings, waterfall enrichment, and outreach sends 
- Free graph8-owned data within 50 rps — contact CRM, B2B index search + lookup, intent + visitor signals — same as PAYG 
- Additional credits at $0.00666 each beyond the 75,000 included 
- Auto-CRM-capture is on - every API result lands in your CRM as a permanent record 
- Full access to sequences, campaigns, copilot, intent, ads, voice, and landing pages   

## Auto-CRM-Capture 
Every contact and company returned by the API is automatically saved into your CRM. The next time you query `GET /contacts` or open the Contacts grid in the app, it’s there. 

### Defaults by plan 
| Plan | Capture default
| Free trial | Off
| PAYG | On
| Platform | On 

### How captured records appear 
Captured records are tagged so you can find and audit them:  
- `source = 'api_lookup'` 
- `created_via = 'api'` 
- `api_endpoint` records which endpoint produced the record 
- `last_api_touched_at` updates on each subsequent lookup  
A second lookup of the same person updates `last_api_touched_at` rather than creating a duplicate. Dedup is per-org against the canonical `MashupContact` / `MashupCompany`. 

### Opting out 
You can disable capture at three levels:  
- Per call - append `?capture=false` to a GET, or pass `"capture": false` in the JSON body of a POST. 
- Per API key - configure the key with capture disabled in Settings → API. 
- Org-wide - toggle `auto_capture_enabled` off in Settings → API.  
Terminal window
```

# Per-call opt-out via query string

curl "https://be.graph8.com/api/v1/enrichment/lookup/person?capture=false" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"email": "[email protected]"}'

# Per-call opt-out via JSON body (POST)

curl -X POST "https://be.graph8.com/api/v1/enrichment/lookup/person" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"email": "[email protected]", "capture": false}'
```

`` 

### Cost of capture 
Capture is bundled into the same request — there is no double-charge. On both plans, index-backed lookups and searches are free within the 50 rps cap, so capturing the records they return doesn’t cost credits either. Waterfall enrichment, AI drafts, voice minutes, meeting bookings, and message sends consume credits on both plans as documented above.  

## Rate Limits 
All data API endpoints enforce 50 requests/second + 1,000 requests/minute per org, on both PAYG and Platform.  
- The cap is the same on both plans. 
- On both PAYG and Platform, there is no monthly cap on graph8-owned data endpoints (contacts, B2B index, intent, visitors) — free within the 50 rps cap. 
- Exceeding the cap returns `429 Too Many Requests` with a `Retry-After` header.  
See Rate Limits for retry strategies and headers.  

## FAQ 

### Do I need a credit card to start? 
No. Both PAYG (1,000 free credits) and the Platform trial (2,500 free credits) start without a card. 

### Why is a work email required? 
graph8 is B2B - we use the work email domain to scope your org and prevent abuse. Personal email providers (gmail, yahoo, outlook, etc.) are blocked at signup. 

### Is graph8-owned data really free on both plans? 
Yes, within the 50 rps cap. Contacts CRM, B2B index search + lookup, intent signals, and website-visitor data all hit graph8-owned infrastructure with no third-party COGS — both PAYG and Platform get unlimited access within the rate cap. There is no monthly volume limit on these endpoints. The 50 rps cap exists to keep the platform stable, not to meter usage. 

### So what’s actually different between PAYG and Platform? 
Only the always-charged surfaces (AI generation, voice minutes, meeting bookings, outreach sends, waterfall enrichment through 3rd-party providers). PAYG bills $0.05 / credit against your balance as you go; Platform bundles 75,000 of those credits into the $499 monthly fee and prices any overage at $0.00666 / credit. Free graph8-data access is identical on both plans. 

### What counts as a “third-party” enrichment call? 
Anything under `POST /enrichment/enrich` that runs the waterfall through an external provider (Prospeo, Dropcontact, Cognism, Apollo, Hunter, Kickbox, ZeroBounce, and others). The waterfall consumes credits on both plans because graph8 pays the provider per record. Single-record `lookup/person` and `lookup/company` hit graph8’s own index — free on both plans within 50 rps. 

### What happens to my saved data if I downgrade? 
Your CRM data stays. Captured records remain in your workspace regardless of plan. You only lose the ability to make new credit-consuming calls if your balance hits zero on PAYG. 

### Can I switch between PAYG and Platform? 
Yes. Switching to Platform is instant. Switching from Platform back to PAYG takes effect at the end of your billing cycle. 

### Are MCP and CLI calls billed the same way? 
Yes. The MCP server and CLI call the same Developer API under the hood — the same credit costs, rate limits, and per-plan rules apply (PAYG meters index endpoints; Platform makes them unlimited within 50 rps).  

## What’s next  
- Authentication - create an API key 
- Rate Limits - retry headers and backoff 
- Search - the index-backed search endpoints 
- Enrichment - lookup vs. waterfall, in detail  

## Footnotes  
-  
See the caution note above — per-step vs per-launch charge timing is being confirmed by the backend team. ↩
