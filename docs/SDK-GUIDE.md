# graph8 SDK — Team Guide (hackathon cheat sheet)

Source: https://docs.graph8.com/developers/sdk/ + npm `@graph8/sdk@0.245.0` type definitions.
Raw doc pages (45) saved in `docs/graph8-docs/`. Full OpenAPI spec: `docs/graph8-openapi.json`.

## 1. What the SDK is
One npm package (`@graph8/sdk`) that talks to every part of graph8 from TypeScript.
Two layers:
- **Hand-written modules** (`g8.contacts`, `g8.sequences`, …) — nice, typed, ~25 modules.
- **`g8.api`** — auto-generated from OpenAPI, covers *every* operation (agents, sandbox, voice, desk, radar…). Use this when no hand-written module exists.

```ts
import { g8 } from '@graph8/sdk';
g8.init({ apiKey: process.env.G8_API_KEY });            // server only
await g8.api.call('list_contacts_contacts_get', { query: { limit: 50 } });
g8.api.operation('list_contacts_contacts_get');          // { method, path, tier: 'read'|'billable'|..., scope }
for await (const c of g8.api.paginate('list_contacts_contacts_get', { query: { limit: 100 } })) {}
```

## 2. Keys & auth
| Key | Where | Safe in browser? | Unlocks |
|---|---|---|---|
| `writeKey` | Settings > MCP & API > tracking snippet | Yes | tracking, visitor ID, copilot, chat, calendar, forms |
| `apiKey` (`g8_live_…` / `g8_test_…`) | Settings > MCP & API > API tab (also Profile > Developer) | **NO — server only** | everything else |

- Test keys: `POST https://be.graph8.com/v1/api-keys {"name":"...","mode":"test"}` → `g8_test_…`.
- Header: `Authorization: Bearer <key>`. Base URL `https://be.graph8.com/api/v1`.
- Rate limit 50 req/s per org. 429 → auto-retry with backoff (SDK does 2 retries).
- Errors throw `G8Error { status, type, code, requestId, retryable }`.
- Creates accept an **idempotency key** (last arg) → safe retries, no duplicates.
- Next.js: never put `apiKey` in client code; call SDK from API routes / server actions.

## 3. Modules (hand-written)
| Stage | Module | Key methods |
|---|---|---|
| **Find** | `g8.search` | `contacts({filters})`, `companies()`, `saveContacts({list_title, filters, max_results})` |
| | `g8.enrich` | `search(filters,page,limit)` (700M, free), `person({email})`, `company({domain})`, `verifyEmail()` (1 credit each) |
| | `g8.contacts` / `g8.companies` | list/get/create/update/delete, `companies.contacts(id)` |
| | `g8.lists` | `create(title)`, `addContacts(listId, ids)`, `contacts(listId)` |
| | `g8.fields` | custom columns: `create({title, entity, data_type})`, `setValue()` |
| **Signals** | `g8.signals` | `company(domain)` → `{score, intent, signals[]}`, `stream(domains, cb)` (polls 30s) |
| | `g8.intent` | keywords, `pageVisitors(url)`, `urlCompanies(url)`, `stats()` |
| | `g8.visitors` (writeKey) | `identify()` (IP → company), `score()`, `onIntent('high', cb)` |
| **Context** | `g8.studio` | `globalContext()`, `icps()`, `personas()`, `intelligenceData()`, `researchReports()` |
| **Reach** | `g8.sequences` | `list/get/create/update/updateStep/add/run/pause/resume/preview/analytics` |
| | `g8.campaigns` | `create({name, category, target_persona})`, `launch()`, `stats()` |
| | `g8.voice` | `start({agent, contactId})`, `analysis()`, `dialer.*` (sessions, calls, `callTranscript`, `callGrading`, stats) |
| | `g8.pages` | `clone(url)`, `create()`, `publish()` → landing pages |
| **AI / automation** | `g8.skills` | `createLLM({...model})`, `createAPI()`, `execute(id, vars)` — custom AI actions |
| | `g8.workflows` | `create/validate/execute`, `getExecution`, pause/resume/stop, `nodeTypes({type:'agent'})` |
| **Close** | `g8.deals` | `pipelines()`, `create({name, amount, company_id})`, `update(id,{stage_id})` |
| | `g8.tasks` / `g8.notes` | tasks + notes on contacts |
| | `g8.quotes` | create → `send()` with signing + payment link |
| | `g8.meetings` | list/get (attendees, transcript, AI analysis) |
| | `g8.pipelines` | stage-checklist pipelines, `suggest()` |
| **Browser widgets** | `g8.copilot` / `g8.chat` / `g8.calendar` / `g8.forms` | embeddable AI copilot, webchat, booking (`slots`, `book`), progressive forms |
| **Other** | `g8.integrations` (HubSpot/SF sync), `g8.audiences` (ad sync), `g8.analytics`, `g8.snippet`, `g8.webhooks` |

## 4. Only via `g8.api` (no hand-written module) — important for us
- **Sandbox**: `/sandbox/status`, `/sandbox/outbox` (simulated sends!), `/sandbox/fixtures/seed|reset|snapshot|restore`, `/sandbox/failure-injection`
- **Agent runtime**: `/agent/runs` (create/get/cancel), `/agent/approvals` + `/decide` (human-in-loop), `/agent/sessions`, `/agent/chat`
- **Desk** (My Desk queue): `/desk/decisions`, `/brief`, `/resolve`
- **AI Inbox**: threads, AI drafts, replies
- **Voice agents**: receptionist, clone, twins, agent memory, agent skills
- **Radar**, **Research reports**, **Company intelligence** (`/intelligence/analyze`)

## 5. Webhooks (push events to our server)
Verify every delivery:
```ts
const event = g8.webhooks.constructEvent(rawBody, req.header('X-Studio-Signature'),
  req.header('X-Studio-Timestamp'), process.env.G8_WEBHOOK_SECRET, { toleranceSeconds: 300 });
```
Useful events: `engagement.email_replied`, `engagement.sms_replied`, `engagement.linkedin_reply_received`,
`engagement.call_completed`, `engagement.call_graded`, `voice_ai.call_completed`, `meeting.booked`, `meeting.no_show`,
`sequence.contact_enrolled`, `sequence.step_completed`, `deal.created`, `deal.stage_changed`, `deal.won`,
`quote.accepted`, `quote.payment_received`, `form.submitted`, `visitor.identified`, `intent.signal`,
`company_intelligence.completed`, `enrichment.job_completed`, `workflow.execu…` (100+ total).
Register: `POST /webhooks` (via `g8.api`). Needs a public URL (ngrok/cloudflared) during dev.

## 6. Credits (cost)
- **Free**: own CRM data CRUD, `enrich.search` / `search.*` (within 50 rps).
- **Costs credits**: person/company enrichment, email verify, AI generation, voice minutes, sends, bookings.
- PAYG gives 1,000 free credits. `402` = out of credits.

## 7. Other ways in (same backend)
- **MCP server**: `https://be.graph8.com/mcp/` — 43 tools. Can plug into Claude Code (`docs/graph8-docs/claude-code-setup.md`) so our agents can query graph8 directly while coding.
- **CLI**: `pip install g8-mcp-server` → `g8` command, JSON output (fast for poking at data).
- **REST**: any language.

## 8. Official reference app
Docs mention `examples/ai-sdr/` (~160 lines): search → idempotent contact import → list → enrich → enroll in sequence, with `DRY_RUN=1`.
Repo `graph8-com/g8` is **not public** (404) and the npm package ships no examples → ask mentors for it.
Our project must go **beyond** this baseline (it's the obvious thing every team will build).

## 9. Open questions for mentors
1. Sandbox key: live or `g8_test_`? Does it auto-route sends to `/sandbox/outbox`?
2. Can we simulate an inbound reply in sandbox (to fire `engagement.email_replied`)?
3. Are voice agents / dialer usable in sandbox?
4. Can we get the `examples/ai-sdr` source?
5. Credit budget per team?
