<!-- https://docs.graph8.com/developers/sdk-faq/ -->
# SDK FAQ

Common questions about `@graph8/sdk` — graph8’s JavaScript / TypeScript SDK. If your question isn’t here, see the SDK overview, SDK Examples, or file an issue on the SDK repo. 

## Plans, credits, and parity 

### Is the SDK free to use? 
Yes. The SDK itself is free and open-source. API calls bill against your graph8 credit balance the same way MCP, CLI, or REST calls do. PAYG ships with 1,000 free credits on signup, no card. See Pricing. 

### Does the SDK have parity with the MCP server? 
Yes for server-side operations. The SDK ships 25+ modules that cover every CRM, prospecting, sequence, campaign, quote, pipeline, workflow, skill, voice, intent, and studio operation that MCP exposes — plus widgets and tracking which MCP doesn’t have (copilot, chat, calendar, forms, page tracking). 
The two surfaces target different consumers (MCP = AI agents over stdio/HTTP, SDK = JS/TS code), but both hit the same `/api/v1/*` backend, so feature parity is intentional and complete. 

### Which operations cost credits? 
Mental model: graph8-owned data is free on both plans. Third-party data, AI generation, voice, outreach sends, and meeting bookings charge credits on both plans. Full per-operation matrix in Pricing. 
Always free on both paid plans (within the 50 rps cap) 
graph8-owned data:  
- B2B index search + lookup (`g8.enrich.search`, `g8.enrich.person`, `g8.enrich.company`) 
- Save-to-list from a search 
- Internal email verify (`g8.enrich.verifyEmail`) 
- Intent reads (`g8.intent.stats`, keyword aggregations, page visitors) 
- Website-visitor identification (`g8.visitors.identify`, `score`, `company`) 
- Public signals (`g8.signals.company`)  
First-party CRM + metadata:  
- Contacts / companies / lists / deals / tasks / notes / fields / quotes — full CRUD 
- Workflow / skill / pipeline / landing-page CRUD (the metadata, not the execution) 
- Studio reads (`g8.studio.icps`, `personas`, `globalContext`, `intelligenceData`, `researchReports`) 
- Webhook subscription management + delivery 
- Calendar widget load, slot lookup (`g8.calendar.show`, `slots`) 
- Form widget load (`g8.forms.lookup`) 
- Tracking from the browser (`g8.track`, `g8.identify`, `g8.page`)  
Always charges credits (both plans — drawn from your balance or the 75k bundle)  
- Copilot turns (`g8.copilot.ask`, `chat`) — per LLM tokens. The widget loads free; every message is billed. 
- AI inbox draft (`g8.inbox.draft`) — per LLM tokens 
- Studio AI generation (brief, brand kit, intelligence) — per LLM tokens 
- Landing-page chat edit (`g8.pages.chat`) — per LLM tokens 
- `g8.skills.execute()` with `type=llm` — per LLM tokens 
- Waterfall enrichment (`g8.enrich.run` / `/enrichment/enrich`) — 0.5-20 per 3rd-party provider hit (Prospeo, Apollo, Hunter, Cognism, etc.) 
- Voice minutes — 20 credits / minute 
- Meeting booking (booking confirmation) — 20 credits flat per booking 
- Sequencer / campaign step (real send) — 1 credit per step 
- Newsletter / nurture send — 1 credit per recipient 
- Intent signal processing (background ingest) — 1 credit / 10 events 
- Tracking event ingest at scale — 1 credit / 10 events 
- External email verifier (Kickbox, ZeroBounce) — 1 credit / verify 
- Audience-sync push — per record where the destination platform meters  
If you stay on graph8-owned data and CRUD on records you already own, you spend zero credits on either plan. 

## Installation and bundling 

### How do I install it? 
Terminal window
```

npm install @graph8/sdk

# or

pnpm add @graph8/sdk

yarn add @graph8/sdk
```

Works in any modern bundler (Vite, Webpack, esbuild, Turbopack, Rollup). Tree-shakable — modules you don’t import don’t ship. 

### Does it work in Node? 
Yes. The SDK detects the runtime — tracking and widget modules become no-ops on the server, and the API modules (`enrich`, `sequences`, `campaigns`, etc.) work the same on both. 

### Does it work with React / Next.js? 
Yes. There’s a dedicated React adapter at `@graph8/sdk/react`: 

```

import { G8Provider, useG8 } from '@graph8/sdk/react';

<G8Provider writeKey="YOUR_WRITE_KEY">{children}</G8Provider>
```

`useG8()` returns the same surface as the singleton `g8` — see React / Next.js section. 

### How big is the bundle? 
About 12 KB gzipped for the full client (`g8.init()` + tracking). Each additional module is small enough that tree-shaking takes it out if unused. 

## Auth modes 

### What’s the difference between `writeKey` and `apiKey`? 
| Mode | Key | Use case | Safe in browser?
| Client-side | `writeKey` | Tracking, visitors, copilot, chat, calendar, forms, public signals | Yes
| Server-side | `apiKey` | Everything else (enrichment, sequences, campaigns, CRM CRUD, voice, quotes, workflows, etc.) | No 

```

g8.init({ writeKey: 'pk_xxx' });                  // browser

g8.init({ apiKey: 'sk_xxx' });                    // node / server

g8.init({ writeKey: 'pk_xxx', apiKey: 'sk_xxx' });// both (full access)
```

The SDK will throw a clear error if you try to call a server-side module without an `apiKey`. 

### Where do I get my keys?  
- Write key: tracking snippet section in Profile -> Developer (or Settings -> Sources). 
- API key: Profile -> Developer for a personal key, Settings -> API for an org key.  

### Can I expose `apiKey` in browser code? 
No. It grants full access to your workspace. Always proxy server-side methods through your own backend (e.g. Next.js API routes, Cloudflare Workers). 

## React / Next.js / SSR 

### Will the SDK break on SSR? 
No. All tracking and widget methods (`g8.track`, `g8.identify`, `g8.copilot.open`, etc.) are no-ops on the server and hydrate normally on the client. API methods that need an `apiKey` work the same in any Node environment. 

### How do I gate widget code so it only runs in the browser? 
The SDK handles this internally — calls return safely. If you specifically want to skip computation, check `typeof window !== "undefined"` or use a `useEffect`. 

### Can I use it in Edge runtimes (Cloudflare Workers, Vercel Edge)? 
Yes — the API modules use `fetch`, which is native in Edge runtimes. Tracking / widget modules will simply no-op. 

## Common errors 

### `g8.<module> requires an API key` 
You called a server-side module (e.g. `g8.deals`, `g8.enrich`, `g8.workflows`) without passing `apiKey` to `g8.init()`. Pass an `apiKey` or only call from server code. 

### `401 Unauthorized` on an API call 
Your `apiKey` is missing, malformed, or revoked. Run `g8 whoami` from the CLI to verify, or check Profile -> Developer in the app. 

### `429 Too Many Requests` 
You hit the 50 rps per-org rate limit. The response includes a `Retry-After` header — back off and retry. See Rate Limits. 

### `402 Payment Required` 
You ran out of credits on PAYG (waterfall enrichment, AI generation, voice minutes, etc.). Top up at Settings -> Billing, or switch to Platform for the bundled 75k credits/month. 

### TypeScript can’t find a type from `@graph8/sdk` 
Make sure you imported from the entry point: `import type { Deal, Quote, Workflow } from "@graph8/sdk"`. Sub-paths like `@graph8/sdk/src/deals` are internal. 

## Migration 

### Coming from `@graph8/sdk` v0.3 or earlier? 
The package name has never changed — it is and has always been `@graph8/sdk`. (If older docs or examples ever pointed you at `@graph8/js`, that package never existed on npm; `@graph8/sdk` is the only official package.) Upgrading from v0.3 or earlier:  
- Update the package: `pnpm add @graph8/sdk@latest`. 
- Imports are unchanged: `import { g8 } from "@graph8/sdk"`. 
- `g8.voice.start(...)` and `g8.voice.analysis(...)` still work (kept for backwards compat); new dialer code uses `g8.voice.dialer.*`. 
- Module surface is now ~5x larger — see the SDK overview for the full module list.  

### Coming from a custom REST wrapper? 
The SDK is a thin typed layer over the same `/api/v1/*` REST surface, so swap-in is mostly mechanical. Pricing, rate limits, and auto-capture all work the same. See SDK Examples for typical usage patterns. 

## See also  
- SDK overview — full module reference 
- SDK Examples — six worked workflows 
- Authentication — key creation + scoping 
- Rate Limits — retry headers and backoff 
- Pricing — free tier, credit costs, plans
