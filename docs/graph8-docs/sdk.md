<!-- https://docs.graph8.com/developers/sdk/ -->
# JavaScript SDK

The `@graph8/sdk` SDK gives you typed access to every graph8 capability from any JavaScript or TypeScript project. 25+ modules, full MCP parity, one `g8.init()` call. 

## Installation 
Terminal window
```

npm install @graph8/sdk
```

## Auth Modes 
The SDK has two auth modes depending on what you’re building: 
| Mode | Key | Use case | Safe in browser?
| Client-side | `writeKey` | Tracking, visitor ID, copilot, chat, calendar, forms | Yes
| Server-side | `apiKey` | Enrichment, sequences, campaigns, integrations, voice, pages | No 

```

// Client-side (browser)

g8.init({ writeKey: 'YOUR_WRITE_KEY' });

// Server-side (Node.js)

g8.init({ apiKey: 'YOUR_API_KEY' });

// Both (full access)

g8.init({ writeKey: 'YOUR_WRITE_KEY', apiKey: 'YOUR_API_KEY' });
```

## Quick Start 

```` 

```

import { g8 } from '@graph8/sdk';

g8.init({ writeKey: 'YOUR_WRITE_KEY' });

// Track events

g8.track('signup', { plan: 'pro', source: 'landing_page' });

// Identify users

g8.identify('[email protected]', {

name: 'Jane Smith',

company: 'Acme Corp',

job_title: 'VP Engineering',

});

// Know who's visiting

const visitor = await g8.visitors.identify();

// { company_name: 'Acme Corp', industry: 'SaaS', employee_count: '200-500' }

// Open AI copilot

g8.copilot.open({ greeting: 'How can I help?' });

// Show booking widget

g8.calendar.show({ username: 'thomas', eventType: 'demo-30min' });
```

## Error Handling & Reliability 
The SDK ships a hardened HTTP core: typed errors, automatic retries, idempotency, and auto-pagination. These are exported as building blocks and used internally by a growing set of resource clients — `contacts`, `companies`, `lists`, `deals`, `notes`, `tasks`, `audiences`, `search`, `agency`, `marketplace`, `snippet`, `meetings`, `integrations`, `pages`, `enrich`, `fields`, `campaigns`, `inbox`, `quotes`, `intent`, `studio`, `pipelines`, `skills`, `workflows`, `voice`, `sequences`, and `analytics` — i.e. every server-side (API-key) resource client. Only the browser/`writeKey` widget clients (`visitors`, `copilot`, `calendar`, `signals`, `forms`) remain on raw `fetch` by design (DOM/tracking surface). The hardened clients throw a `G8Error` on a failed request instead of returning the error body as data. 

### Typed errors — `G8Error` 
Any non-2xx response throws a `G8Error` carrying the standard envelope fields, so you can branch on `status`/`type` and quote `requestId` to support. 

```

import { g8, G8Error } from '@graph8/sdk';

try {

await g8.contacts.create({ work_email: '[email protected]' });

} catch (err) {

if (err instanceof G8Error) {

console.error(err.status, err.type, err.code, err.requestId);

// e.g. 400 "bad_request" "400" "req_abc123"

if (err.status === 404) {/* handle not-found */}

} else {

throw err; // non-HTTP error

}

}
```

| Field | Type | Description
| `status` | number | HTTP status (`0` for a network failure)
| `type` | string | Machine-readable category (`bad_request`, `not_found`, …)
| `code` | string | Short error code (HTTP status by default)
| `requestId` | string | undefined | Correlation id — matches the `X-Request-Id` header
| `detail` | unknown | Original error detail (validation errors, upstream payloads)
| `retryable` | boolean | Whether the failure class was transient (429/5xx/network) 

### Automatic retries 
Transient failures — `429` and `5xx` responses, plus network errors — are retried automatically with exponential backoff + jitter, honoring the `Retry-After` header on `429`. Defaults: up to 2 retries (3 total attempts), 200 ms base. 4xx errors (except 429) are never retried — they won’t succeed on a retry. 

### Idempotency 
Pass an idempotency key to make a create safe to retry — the same key returns the first result instead of creating a duplicate (see Idempotency). 

```

import { randomUUID } from 'node:crypto';

const key = randomUUID();

await g8.contacts.create({ work_email: '[email protected]' }, key);

// a retry with the same key never double-creates
```

### Auto-pagination 
`paginate()` is an async iterator that follows `next_cursor` (see Pagination) so you can walk an entire list without cursor bookkeeping. 

```

import { paginate, request } from '@graph8/sdk';

const base = 'https://be.graph8.com';

for await (const tx of paginate((cursor) =>

request(base, '/api/v1/usage/transactions', apiKey, { query: { limit: 200, cursor } })

)) {

console.log(tx);

}
```

## Reference app: AI-SDR 
Want to see all of this in one place? `examples/ai-sdr/` is a ~160-line, end-to-end “AI SDR” built on the SDK: it prospects with `search`, imports contacts idempotently, organizes them into a list, enriches account context, and enrolls them into a sequence — with centralized `G8Error` handling throughout. A `DRY_RUN=1` mode runs the read-only prospecting path with no writes. 

## React / Next.js 
app/layout.tsx
```

import { G8Provider } from '@graph8/sdk/react';

export default function RootLayout({ children }) {

return (

<G8Provider writeKey="YOUR_WRITE_KEY">

{children}

</G8Provider>

);

}
```

```

// Any component

import { useG8 } from '@graph8/sdk/react';

function PricingPage() {

const { track, visitors, copilot, calendar } = useG8();

useEffect(() => {

visitors.identify().then(v => {

if (v.company_name) setCompany(v.company_name);

});

}, []);

return (

<button onClick={() => {

track('book_demo', { page: 'pricing' });

calendar.show({ username: 'thomas', eventType: 'demo' });

}}>

Book a Demo

</button>

);

}
```

The hook returns: `track`, `identify`, `page`, `reset`, `visitors`, `copilot`, `chat`, `calendar`, `forms`, `signals`, and `g8` (the full client).  

## Visitor Intelligence 
Identify anonymous visitors by IP address - know which company is on your site before they fill out a form. 

```

// Resolve visitor's company

const visitor = await g8.visitors.identify();

// {

//   company_name: 'Acme Corp',

//   company_domain: 'acme.com',

//   industry: 'SaaS',

//   employee_count: '200-500',

//   city: 'San Francisco',

//   country: 'United States',

//   confidence: 0.92

// }

// Get engagement score

const score = await g8.visitors.score();

// { engagement: 82, intent: 'high', signals: ['pricing_page', 'case_study'] }

// React to high-intent visitors in real-time

const stop = g8.visitors.onIntent('high', (visitor) => {

showBanner(`${visitor.company_name} is checking us out!`);

g8.copilot.open(); // proactively open copilot

});

// Stop listening

stop();
```

## AI Copilot 
Embed an AI assistant in your product that knows your org’s knowledge base. 

```

// Open as a floating widget

g8.copilot.open({

greeting: 'Hi! How can I help you today?',

position: 'bottom-right',  // or 'bottom-left'

theme: 'dark',             // 'light', 'dark', or 'auto'

});

// Send a message programmatically

const answer = await g8.copilot.ask('What integrations do you support?');

// Register custom actions the AI can trigger

g8.copilot.registerAction('book_demo', async (params) => {

router.push(`/book?date=${params.date}`);

});

// Listen for events

g8.copilot.on('tool_used', (data) => {

analytics.track('copilot_action', data);

});

// Close

g8.copilot.close();
```

## Webchat 
Live chat + AI chat embedded in your product. 

```

// Open chat widget

g8.chat.open({

position: 'bottom-right',

theme: 'auto',

greeting: 'Hi! Ask me anything.',

});

// Send a message

g8.chat.send('I need help with billing');

// Listen for events

g8.chat.on('message', (msg) => { /* new message from agent */ });

g8.chat.on('human_transfer', () => { /* transferred to human */ });

// Configure appearance

g8.chat.configure({

position: 'bottom-left',

avatar: '/logo.png',

});

// Close

g8.chat.close();
```

## Calendar Booking 
Embed scheduling directly in your product - no Calendly redirect. 

```

// Show as a modal overlay

g8.calendar.show({

username: 'thomas',

eventType: 'demo-30min',

prefill: { name: 'Jane', email: '[email protected]' },

});

// Embed inline in a container

g8.calendar.embed('#booking-container', {

username: 'thomas',

eventType: 'discovery-call',

});

// Get available slots programmatically

const slots = await g8.calendar.slots('thomas', 'demo-30min', {

start: '2026-04-07',

end: '2026-04-11',

});

// Book programmatically

const booking = await g8.calendar.book({

event_type_id: 123,

slot: '2026-04-08T10:00:00Z',

attendee: { name: 'Jane', email: '[email protected]' },

});

// Listen for bookings

g8.calendar.on('booked', (booking) => {

showConfirmation(booking);

});
```

## Progressive Forms 
Smart forms that skip fields graph8 already knows - higher conversion, same data. 

```

// Check what's already known

const result = await g8.forms.lookup('[email protected]');

if (result.found) {

console.log('Known:', result.known_fields);

// { name: 'Jane Smith', company: 'Acme Corp' }

console.log('Still need:', result.missing_fields);

// ['phone', 'job_title']

}
```

## Enrichment 

```

// Initialize with API key

g8.init({ apiKey: 'YOUR_API_KEY' });

// Look up a person (1 credit)

const person = await g8.enrich.person({ email: '[email protected]' });

// { found: true, confidence: 0.95, data: { name, title, company, phone, linkedin, ... } }

// Look up a company (1 credit)

const company = await g8.enrich.company({ domain: 'acme.com' });

// { found: true, data: { name, industry, revenue, headcount, tech_stack, ... } }

// Verify an email (1 credit)

const result = await g8.enrich.verifyEmail('[email protected]');

// { email: '[email protected]', valid: true, deliverable: true, catch_all: false }

// Search 700M+ contacts with filters (free on both PAYG and Platform within 50 rps)

const leads = await g8.enrich.search([

{ field: 'seniority_level', operator: 'any_of', value: ['VP', 'Director'] },

{ field: 'company_industry', operator: 'contains', value: ['SaaS'] },

{ field: 'company_employee_count', operator: 'between', value: [50, 500] },

], 1, 25);
```

## Search 
Prospect the open-data graph for new contacts and companies by filter, and optionally save the matches straight into a list. Requires an API key. Built on the hardened HTTP core — every method throws a `G8Error` on failure and retries transient errors. 

```

// Find VPs of Engineering at mid-size SaaS companies

const { data: people } = await g8.search.contacts({

filters: [

{ field: 'job_title', operator: 'any_of', value: ['VP Engineering', 'Head of Engineering'] },

{ field: 'company_industry', operator: 'any_of', value: ['SaaS'] },

],

page: 1,

limit: 25,

});

// Find companies by firmographics

const { data: companies } = await g8.search.companies({

filters: [{ field: 'employee_count', operator: 'between', value: [50, 500] }],

});

// Search and save the matches into a new list (async — returns an estimate immediately)

const job = await g8.search.saveContacts({

list_title: 'Q3 SaaS VPs',

filters: [{ field: 'seniority_level', operator: 'any_of', value: ['VP', 'C-Level'] }],

max_results: 2000,

});

// { list_id, list_title, estimated_total, status: 'processing' }
```

| Method | Description
| `g8.search.contacts(params?)` | Search open-data contacts. Returns `{ data: SearchContactItem[] }`.
| `g8.search.companies(params?)` | Search open-data companies. Returns `{ data: SearchCompanyItem[] }`.
| `g8.search.saveContacts(params)` | Search contacts and save matches to a new list. Returns a `SearchSaveResult`.
| `g8.search.saveCompanies(params)` | Search companies and save matches to a new list. 
Operators: `any_of`, `all_of`, `none_of`, `contains`, `between`, `exists`, `is_empty`, `is_not_empty`. Filters combine with AND.  

## Agency 
For agency-scoped API keys (minted with `is_agency: true`). Discover the agency credential and the client orgs it may operate. Requires an API key — a non-agency key gets a `403`. 

```

const me = await g8.agency.me();

// { agency_org_id, agency_org_name, is_agency: true, client_count, target_header: 'X-Target-Org-Id' }

const { data: clients } = await g8.agency.clients();

// [{ org_id: 'org_abc' }, { org_id: 'org_def' }]
```

To operate a client org, set the `X-Target-Org-Id` header (the value of `target_header`) to that client’s `org_id` on your subsequent requests — the agency key is then scoped to that one client for the call. 
| Method | Description
| `g8.agency.me()` | Describe the agency credential — agency org + authorized client count. Returns `AgencyInfo`.
| `g8.agency.clients()` | List the client orgs this key may target. Returns `{ data: AgencyClient[] }`. 
See Agency Keys for how agency keys and per-request targeting work.  

## Marketplace 
For SDR/AE talent on the graph8 marketplace: view your profile, see pending hire offers and respond to them, and list your active hirings. Requires a personal API key. Built on the hardened HTTP core — every method throws a `G8Error` on failure and retries transient errors. 

```

const profile = await g8.marketplace.profile();

// { id, email, marketplace_role, monthly_rate_usd, availability_status, is_complete, ... }

const { offers, count } = await g8.marketplace.offers();

for (const offer of offers) {

if (offer.monthly_rate_usd && Number(offer.monthly_rate_usd) >= 4000) {

await g8.marketplace.acceptOffer(offer.id);

} else {

await g8.marketplace.rejectOffer(offer.id);

}

}

const { hirings } = await g8.marketplace.hirings(); // active contracts
```

| Method | Description
| `g8.marketplace.profile()` | Your marketplace SDR profile. Returns `MarketplaceProfile`.
| `g8.marketplace.offers()` | Pending hire offers. Returns `{ offers: MarketplaceOffer[]; count }`.
| `g8.marketplace.acceptOffer(hiringId)` | Accept a pending offer.
| `g8.marketplace.rejectOffer(hiringId)` | Reject a pending offer.
| `g8.marketplace.hirings()` | Your active hiring contracts. Returns `{ hirings: MarketplaceHiring[]; count }`.  

## Snippet 
Fetch your org’s graph8 tracking snippet programmatically — the write key, a React component, a vanilla `<script>` tag, allowed domains, and the full config — to embed the tracker into an app or a customer’s site. Requires an API key. Built on the hardened HTTP core (typed `G8Error` + retries). 

```

const snippet = await g8.snippet.get();

// { write_key, tracking_host, domains, react_snippet, script_tag, config }

// Inject the vanilla tag into a customer's site

customerSite.head.append(snippet.script_tag);
```

| Method | Description
| `g8.snippet.get()` | Get the org tracking snippet. Returns `Snippet` (`write_key`, `react_snippet`, `script_tag`, `domains`, `config`).  

## Intent Signals 
Know when target accounts are in-market. 

```

// Get signals for a specific company

const signals = await g8.signals.company('acme.com');

// { domain: 'acme.com', score: 87, intent: 'high', signals: ['pricing_3x', 'case_study'] }

// Stream signals for multiple domains (polls every 30s)

const stop = g8.signals.stream(['acme.com', 'startup.io'], (signals) => {

const hot = signals.filter(s => s.intent === 'high');

if (hot.length > 0) notifySDR(hot);

});

// Stop streaming

stop();
```

## Sequences 

```

// List available sequences

const sequences = await g8.sequences.list();

// Add contacts to a sequence

await g8.sequences.add({

sequenceId: sequences[0].id,

contactIds: [5028106, 5028105],

listId: 637,

});

// The mutating methods — add, create, run, pause, resume — accept an optional

// trailing idempotency key so a retry never double-triggers the side effect

// (see Error Handling & Reliability → Idempotency).

await g8.sequences.run(sequences[0].id, 'run-seq-2026-06-30');
```

## Campaigns 

```

// List campaigns

const campaigns = await g8.campaigns.list();

// Create a campaign

const campaign = await g8.campaigns.create({

name: 'Q2 Enterprise Push',

category: 'Outbound',

target_persona: 'VP Engineering at SaaS 200-1000',

});

// Launch

await g8.campaigns.launch(campaign.id);

// Get stats

const stats = await g8.campaigns.stats(campaign.id);

// { sent: 500, opened: 230, replied: 45, meetings: 12 }
```

## Contacts 

Full CRUD for contacts in your graph8 workspace - the same records that power sequences, campaigns, and CRM sync. No credit cost; these endpoints only read and write data you already own. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(params?)` 
List contacts with optional filters. Returns `{ data: Contact[]; total: number }`. 

```

const { data, total } = await g8.contacts.list({

company_name: 'Acme Corp',

seniority_level: 'VP',

limit: 25,

page: 1,

});
```

Filterable fields: `email`, `name`, `job_title`, `seniority_level`, `company_name`, `country`, `list_id`, plus `page` and `limit`. 

### `get(contactId)` 
Fetch a single contact by ID. Returns a `Contact`. 

```

const contact = await g8.contacts.get(5028106);
```

### `create(contact, idempotencyKey?)` 
Create a contact. `work_email` is required; everything else is optional. Pass `list_id` to add the contact to a list at the same time. Returns the created `Contact`. Throws `G8Error` on failure. 
Pass an optional `idempotencyKey` to make a retry safe — the same key returns the first result instead of creating a duplicate (see Error Handling & Reliability). 

```

const contact = await g8.contacts.create({

work_email: '[email protected]',

first_name: 'Jane',

last_name: 'Smith',

job_title: 'VP Engineering',

company_domain: 'acme.com',

list_id: 637,

}, 'create-jane-acme-2026-06-29'); // optional idempotency key
```

### `update(contactId, fields)` 
Partial update - send only the fields you want to change. Returns `{ updated: number }`. 

```

await g8.contacts.update(5028106, {

job_title: 'SVP Engineering',

mobile_phone: '+14155551234',

});
```

### `delete(contactId)` 
Soft-delete a contact. Returns `{ deleted: boolean }`. 

```

await g8.contacts.delete(5028106);
```

## Companies 

Read and update companies in your workspace. Companies are created automatically when contacts are saved or enriched, so you typically `list`, `get`, and `update` rather than create. To get a company’s contacts in one call, use `companies.contacts(id)`. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(params?)` 
List companies with optional filters. Returns `{ data: Company[]; total: number }`. 

```

const { data } = await g8.companies.list({

industry: 'SaaS',

country: 'United States',

limit: 50,

});
```

Filterable fields: `domain`, `industry`, `name`, `country`, plus `page` and `limit`. 

### `get(companyId)` 
Fetch a single company by ID. Returns a `Company`. 

```

const company = await g8.companies.get(8821);

// { id: 8821, name: 'Acme Corp', domain: 'acme.com', industry: 'SaaS', employee_count: 320, ... }
```

### `contacts(companyId, limit?, offset?)` 
Get the contacts associated with a company. Defaults to 50 per page. Returns `{ data: CompanyContact[]; total: number }`. 

```

const { data: people } = await g8.companies.contacts(8821, 25, 0);

// [{ id: 5028106, first_name: 'Jane', last_name: 'Smith', work_email: '[email protected]', job_title: 'VP Engineering' }, ...]
```

### `update(companyId, fields)` 
Partial update. Returns `{ updated: number }`. 

```

await g8.companies.update(8821, {

industry: 'B2B SaaS',

description: 'Workflow automation for revenue teams.',

});
```

### `delete(companyId)` 
Soft-delete a company. Returns `{ deleted: boolean }`. 

```

await g8.companies.delete(8821);
```

## Lists 

Lists organize contacts (or companies) into groups for campaigns, exports, and segmentation. A list created here can be passed straight to `g8.sequences.add()` or used as a target audience for a campaign. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(page?, limit?)` 
Page through every list in the workspace. Defaults to page 1 / limit 50. Returns `{ data: ContactList[]; total: number }`. 

```

const { data: lists } = await g8.lists.list(1, 100);

// [{ id: 637, title: 'Q2 Outbound', type: 'contacts', contact_count: 1240, created_at: '2026-04-01T...' }, ...]
```

### `create(title, type?)` 
Create a new list. `type` defaults to `'contacts'`; use `'companies'` for an account list. Returns the created `ContactList`. 

```

const list = await g8.lists.create('Q2 Enterprise Push', 'contacts');
```

### `delete(listId)` 
Soft-delete a list. Returns `{ deleted: boolean }`. 

```

await g8.lists.delete(637);
```

### `contacts(listId, page?, limit?)` 
Page through the contacts in a list. Returns `{ data: ListContact[]; total: number }`. 

```

const { data } = await g8.lists.contacts(637, 1, 200);
```

### `addContacts(listId, contactIds)` 
Add one or more existing contacts to a list. Returns `{ added: number }`. 

```

await g8.lists.addContacts(637, [5028106, 5028105, 5028104]);
```

### `removeContacts(listId, contactIds)` 
Remove contacts from a list (does not delete the contacts themselves). Returns `{ removed: number }`. 

```

await g8.lists.removeContacts(637, [5028104]);
```

## Deals 

Full CRUD for deals plus pipeline introspection and contact / company graph queries. Reads and writes against your CRM — no credit cost. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `pipelines()` 
List every deal pipeline and its stages. Returns `{ data: Pipeline[] }`. 

```

const { data: pipelines } = await g8.deals.pipelines();

// [{ id: 'pip_default', name: 'Default', is_default: true, stages: [...] }]
```

### `list(params?)` 
List deals with optional filters and pagination. Returns `{ data: Deal[]; pagination?: PaginationMeta }`. 

```

const { data: deals } = await g8.deals.list({

stage_id: 'stg_proposal',

search: 'Acme',

limit: 50,

});
```

Filterable: `stage_id`, `pipeline_id`, `search`, plus `page` and `limit`. 

### `get(dealId)` 
Fetch a single deal by ID. 

```

const deal = await g8.deals.get('deal_abc123');
```

### `create(deal)` 
Create a deal. `name` is required; stage / pipeline default to the org defaults if omitted. 

```

const deal = await g8.deals.create({

name: 'Acme Q3 expansion',

company_id: 8821,

amount: 12500,

currency: 'USD',

close_date: '2026-09-30',

});
```

### `update(dealId, fields)` 
Partial update — most often used to change stage as the deal progresses. 

```

await g8.deals.update('deal_abc123', {

stage_id: 'stg_proposal',

amount: 15000,

});
```

### `delete(dealId)` 
Delete a deal. Returns `{ data: { deleted: boolean } }`. Irreversible — prefer moving the deal to a `closed_lost` stage if you need an audit trail. 

```

await g8.deals.delete('deal_abc123');
```

### `forContact(contactId)` / `forCompany(companyId)` 
Get the trimmed deal list associated with a contact or company. 

```

const { data: contactDeals } = await g8.deals.forContact(5028106);

const { data: companyDeals } = await g8.deals.forCompany(8821);
```

## Tasks 

CRUD for tasks linked to CRM contacts. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(params?)` 
List tasks org-wide. Returns `{ data: Task[] }`. 

```

const { data } = await g8.tasks.list({

status: 'open',

priority: 'high',

limit: 50,

});
```

Filterable: `status`, `priority`, `assignee_id`, `search`, `limit`, `offset`. 

### `listForContact(contactId, status?)` 
List tasks for one contact. 

```

const { data } = await g8.tasks.listForContact(5028106, 'open');
```

### `create(contactId, task)` 
Create a task linked to a contact. 

```

const task = await g8.tasks.create(5028106, {

title: 'Send proposal',

due_date: '2026-06-15',

priority: 'high',

});
```

### `update(taskId, fields)` 
Partial update. 

```

await g8.tasks.update('task_abc', { status: 'completed' });
```

### `delete(taskId)` 
Delete a task. Irreversible. 

```

await g8.tasks.delete('task_abc');
```

## Notes 

CRUD for notes attached to contacts. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(contactId)` 
List every note on a contact. 

```

const { data: notes } = await g8.notes.list(5028106);
```

### `create(contactId, content)` 
Add a note to a contact. 

```

const note = await g8.notes.create(5028106,

'Discovery call: budget approved, decision by Q3'

);
```

### `update(noteId, content)` 
Replace a note’s content. 

```

await g8.notes.update('note_xyz', 'Updated: budget approved for Q4');
```

### `delete(noteId)` 
Delete a note. Irreversible. 

```

await g8.notes.delete('note_xyz');
```

## Custom Fields 

Manage custom columns on contacts or companies. Columns can be global (entity-wide) or list-scoped (only on contacts / companies inside one list). 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `listContactFields(listId?)` / `listCompanyFields(listId?)` 
List field definitions for an entity. Returns base + custom columns. 

```

const { data: contactFields } = await g8.fields.listContactFields();

const { data: listFields } = await g8.fields.listContactFields(637);
```

### `create(params)` 
Create a custom column. Omit `list_id` for a global column. 

```

// Global column on contacts

const field = await g8.fields.create({

title: 'Lead score',

entity: 'contacts',

data_type: 'number',

});

// List-scoped column

const listField = await g8.fields.create({

title: 'Q3 priority',

entity: 'contacts',

data_type: 'boolean',

list_id: 637,

});
```

### `setValue(columnId, recordId, value, entity?)` 
Set a custom column value on a single contact or company row. 

```

await g8.fields.setValue(42, 5028106, 85, 'contacts');
```

### `delete(columnId, params?)` 
Soft-delete a custom column. 

```

await g8.fields.delete(42, { entity: 'contacts' });
```

## Quotes 

`` 
Full quote-to-cash lifecycle — draft, edit, send (with signing + payment links), duplicate, convert back to draft. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(params?)` 
List quotes with optional filters and pagination. 

```

const { data, pagination } = await g8.quotes.list({

status: 'sent',

contact_id: 5028106,

limit: 50,

});
```

Filterable: `status` (`draft`, `sent`, `signed`, `declined`, `expired`, `void`), `contact_id`, `company_id`, `page`, `limit`. 

### `get(quoteId)` 

```

const quote = await g8.quotes.get('quo_abc123');
```

### `create(quote)` 
Create a new quote. `line_items` is required. 

```

const quote = await g8.quotes.create({

contact_id: 5028106,

line_items: [

{ product_id: 'prod_pro', quantity: 1, unit_price: 499, recurring: true },

{ name: 'Onboarding', quantity: 1, unit_price: 1500 },

],

currency: 'USD',

expires_at: '2026-07-15T00:00:00Z',

});
```

### `update(quoteId, fields)` 
Partial update on a draft quote. 

```

await g8.quotes.update('quo_abc123', { notes: 'Updated to 12-month commit' });
```

### `delete(quoteId)` 
Delete a draft quote. Irreversible. 

```

await g8.quotes.delete('quo_abc123');
```

### `duplicate(quoteId)` 
Copy an existing quote into a new draft. 

```

const copy = await g8.quotes.duplicate('quo_abc123');
```

### `editAsDraft(quoteId)` 
Convert a signed / sent quote back into editable draft state. 

```

await g8.quotes.editAsDraft('quo_abc123');
```

### `send(quoteId, params)` 
Send the quote via email. Includes signing link by default. 

```

await g8.quotes.send('quo_abc123', {

recipient_email: '[email protected]',

send_signing_link: true,

});
```

### `products()` / `settings()` 

```

const { data: products } = await g8.quotes.products();

const settings = await g8.quotes.settings();

// { default_currency, default_tax_rate, payment_providers, logo_url, signature_required }
```

### `forContact(contactId)` / `forCompany(companyId)` 

```

const { data } = await g8.quotes.forContact(5028106);

const { data: companyQuotes } = await g8.quotes.forCompany(8821);
```

## Stage Checklist Pipelines 

`` 
Workflow pipelines with per-stage evidence requirements and channel scripts. Used for structured outbound flows (Stage Checklist v2). 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list()` / `get(pipelineId)` 

```

const { data: pipelines } = await g8.pipelines.list();

const pipeline = await g8.pipelines.get('pip_xyz');
```

### `evidenceLibrary()` 
Get the canonical evidence-key library (used when defining stage requirements). 

```

const { data: keys } = await g8.pipelines.evidenceLibrary();

// [{ key: 'budget_confirmed', label: 'Budget confirmed', category: 'qualification', ... }]
```

### `create(params)` 
Create a new pipeline. Defaults to a templated stage set; pass `blank: true` for an empty pipeline. 

```

const pipeline = await g8.pipelines.create({

name: 'Enterprise Outbound',

target: 'Land 5 new logos in Q3',

});

const empty = await g8.pipelines.create({ name: 'Custom flow', blank: true });
```

### `update(pipelineId, fields)` 

```

await g8.pipelines.update('pip_xyz', { name: 'Renamed', target: 'New goal' });
```

### `delete(pipelineId)` 
Only allowed when no deals reference the pipeline. 

```

await g8.pipelines.delete('pip_xyz');
```

### `createStage(pipelineId, stage)` 

```

const stage = await g8.pipelines.createStage('pip_xyz', {

name: 'Discovery',

required_elements: ['budget_confirmed', 'timeline_known'],

channel_scripts: {

email: 'Hi {{first_name}}...',

call: 'Hello, calling about...',

},

});
```

### `updateStage(pipelineId, stageId, fields)` 

```

await g8.pipelines.updateStage('pip_xyz', 'stg_discovery', { color: '#00CAEB' });
```

### `deleteStage(pipelineId, stageId)` 

```

await g8.pipelines.deleteStage('pip_xyz', 'stg_discovery');
```

### `reorderStages(pipelineId, stageIds)` 
Pass the full ordered list of stage IDs. 

```

await g8.pipelines.reorderStages('pip_xyz', [

'stg_qual', 'stg_demo', 'stg_negotiation', 'stg_close',

]);
```

### `suggest()` / `fromSuggestion(suggestionId, overrides?)` 
AI-suggested pipeline based on org context (brand, ICP, messaging). Two-step: suggest, then promote to a real pipeline. 

```

const { data: suggestion } = await g8.pipelines.suggest();

// { suggestion_id, name, target, stages: [...], rationale }

const pipeline = await g8.pipelines.fromSuggestion(suggestion.suggestion_id, {

name: 'PLG Path',

});
```

## Workflows 

`` 
Multi-node automation graphs with execution lifecycle. The whole workflow definition is treated as a single record — node-level CRUD is performed client-side by mutating `config.nodes` / `config.connections` and submitting via `update()`. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(params?)` / `get(workflowId)` / `delete(workflowId)` 

```

const { data: workflows } = await g8.workflows.list({ is_active: true });

const workflow = await g8.workflows.get('wf_abc123');

await g8.workflows.delete('wf_abc123');
```

### `create(params)` 

```

const wf = await g8.workflows.create({

name: 'Inbound demo follow-up',

description: 'Triggered when a form is submitted',

config: {

nodes: [

{ id: 'n1', type: 'form_trigger', config: { form_id: 'demo_request' } },

{ id: 'n2', type: 'agent', config: { skill_id: 'sk_qualify' } },

{ id: 'n3', type: 'slack_message', config: { channel: 'C0123' } },

],

connections: [

{ from_node_id: 'n1', to_node_id: 'n2' },

{ from_node_id: 'n2', to_node_id: 'n3' },

],

},

});
```

### `update(workflowId, fields)` 
Pass the full `config` to edit nodes / connections. 

```

const wf = await g8.workflows.get('wf_abc123');

wf.config.nodes.push({ id: 'n4', type: 'delay', config: { hours: 24 } });

wf.config.connections.push({ from_node_id: 'n3', to_node_id: 'n4' });

await g8.workflows.update('wf_abc123', { config: wf.config });
```

### `validate({ config, trigger_config? })` 
Validate a workflow definition (catches orphans, dangling connections, missing required fields). 

```

const { data } = await g8.workflows.validate({ config: wf.config });

if (!data.valid) {

console.log(data.errors);

}
```

### Execution lifecycle 

```

// Kick off

const exec = await g8.workflows.execute('wf_abc123', {

contact_id: 5028106,

source: 'manual_run',

});

// Poll status

const status = await g8.workflows.getExecution(exec.id);

// Mid-flight control

await g8.workflows.pauseExecution(exec.id);

await g8.workflows.resumeExecution(exec.id);

await g8.workflows.stopExecution(exec.id);

// Trigger management (event-stream triggers)

await g8.workflows.getTriggerStatus('wf_abc123');

await g8.workflows.resetTrigger('wf_abc123');
```

### Node-type discovery + integration listings 

```

// Schema for the config UI

const { data: nodeTypes } = await g8.workflows.nodeTypes();

const { data: agentNode } = await g8.workflows.nodeTypes({ type: 'agent' });

// Pickers for action recipients

const { data: slackChannels } = await g8.workflows.listSlackChannels();

const { data: roamGroups } = await g8.workflows.listRoamGroups();

const { data: mcpServers } = await g8.workflows.listMcpServers();

const { data: dispositions } = await g8.workflows.listDispositions();

const { data: fields } = await g8.workflows.listFormFields('form_demo_request');
```

## Skills 

`` 
LLM and API building blocks that workflows compose into runs. Two kinds: LLM skills (prompt + model) and API skills (HTTP request wrappers). 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### Read 

```

const { data: skills } = await g8.skills.list({ type: 'llm' });

const skill = await g8.skills.get('sk_abc123');

const { data: vars } = await g8.skills.getVariables('sk_abc123');

const { data: models } = await g8.skills.listModels();

const { data: templates } = await g8.skills.listTemplates();
```

### Create an LLM skill 

```

const skill = await g8.skills.createLLM({

title: 'Qualify lead',

description: 'Score and tag inbound leads',

prompt: 'You are a SDR. Given the contact: {{contact}} and the company: {{company}}, return JSON with { tier: "A"|"B"|"C", reason: string }.',

model: 'claude-sonnet-4-6',

input_schema: {

fields: [

{ name: 'contact', type: 'object', required: true },

{ name: 'company', type: 'object', required: true },

],

},

});
```

### Create an API skill 

```

const apiSkill = await g8.skills.createAPI({

title: 'Enrich domain via Clearbit',

method: 'GET',

url: 'https://company.clearbit.com/v2/companies/find?domain={{domain}}',

headers: { 'Authorization': 'Bearer sk_xxx' },

input_schema: { fields: [{ name: 'domain', type: 'string', required: true }] },

});
```

### From templates / from a node 

```

const fromTemplate = await g8.skills.createFromTemplate({

title: 'Reply summarizer',

template_id: 'summarize_reply',

});

const lifted = await g8.skills.createFromNode({

title: 'Lifted draft-reply node',

node_id: 'n_draft_reply_456',

});
```

### Update / delete / validate 

```

await g8.skills.updateLLM('sk_abc123', { model: 'claude-opus-4-7' });

await g8.skills.delete('sk_abc123');

const { data } = await g8.skills.validate({

type: 'llm',

title: 'Test',

prompt: 'Hello {{name}}',

model: 'claude-sonnet-4-6',

input_schema: { fields: [{ name: 'name', type: 'string', required: true }] },

});
```

### Execute (test / preview) 

```

const result = await g8.skills.execute('sk_abc123', {

contact: { name: 'Jane Smith', title: 'VP Eng' },

company: { name: 'Acme', domain: 'acme.com' },

});

// result.data → { output, latency_ms, tokens, error }
```

## Intent Tracking 

`` 
Track keywords against your site or competitor URLs, then query the visitor + contact graph by keyword or page. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### Org-level stats + keyword management 

```

const { data: stats } = await g8.intent.stats();

// { total_keywords, total_pages, total_visitors_30d, total_companies_30d }

const { data: keywords } = await g8.intent.listKeywords({ search: 'pricing' });

const newKw = await g8.intent.createFromDomain('competitor.com');

await g8.intent.deleteKeyword('kw_abc123');
```

### Per-keyword data 

```

const { data: companies } = await g8.intent.keywordCompanies('kw_abc123', { limit: 50 });

const { data: contacts } = await g8.intent.keywordContacts('kw_abc123');

const { data: urls } = await g8.intent.keywordUrls('kw_abc123');
```

### Page-level visitor data 

```

const { data: pages } = await g8.intent.pagesByDomain('competitor.com');

const { data: searchResults } = await g8.intent.searchPages('pricing');

const { data: visitors } = await g8.intent.pageVisitors('https://example.com/pricing');

const { data: ppl } = await g8.intent.pageContacts('https://example.com/pricing');

const { data: counts } = await g8.intent.pageVisitorCounts([

'https://example.com/pricing',

'https://example.com/docs',

]);
```

### Account-level intent search 

```

const { data } = await g8.intent.urlCompanies('https://competitor.com/pricing', {

date_from: '2026-04-01',

});
```

## Studio Context 

Org-level Studio documents: brand brief, value props, messaging house, ICPs, personas, intelligence (scrapes + enrichment), and AI research reports. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `globalContext(params?)` / `icps(params?)` / `personas(params?)` 

```

const { data: docs } = await g8.studio.globalContext({ category: 'brand_brief' });

const { data: icps } = await g8.studio.icps({ status: 'published' });

const { data: personas } = await g8.studio.personas();
```

### `intelligenceData(params?)` / `researchReports(params?)` 

```

const { data: intel } = await g8.studio.intelligenceData({ source_type: 'website_scrape' });

const { data: reports } = await g8.studio.researchReports({ category: 'competitive_teardown' });
```

## Meetings 

`` 
Read scheduled, completed, and cancelled meetings with attendees, recordings, transcripts, and AI analysis. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: 'YOUR_API_KEY' });
```

### `list(params?)` 
List meetings with optional filters. Returns summary rows (without transcript / analysis). 

```

const { data } = await g8.meetings.list({

status: 'completed',

date_from: '2026-05-01',

contact_id: 5028106,

limit: 25,

});
```

Filterable: `status`, `date_from`, `date_to`, `attendee_id`, `event_type`, `contact_id`, `page`, `limit`. 

### `get(meetingId)` 
Get the full meeting record including transcript and AI analysis. 

```

const meeting = await g8.meetings.get('mtg_abc123');

// → { id, status, attendees, conferencing_url, recording_url, transcript: [...], analysis: { sentiment, summary, next_steps, objections, talk_listen_ratio } }
```

The transcript is available 1-5 minutes after the meeting ends. While transcription is in progress, `transcript` and `analysis` may be `null`.  

## CRM Integrations 

Connect graph8 to your CRM (HubSpot, Salesforce, Pipedrive, etc.) and trigger one-off or bidirectional syncs. 

```

// List connected CRMs

const integrations = await g8.integrations.list();

// [{ id: 'int_123', provider: 'hubspot', status: 'connected', connected_at: '2026-03-15T...' }, ...]

// Connect a new CRM

await g8.integrations.connect('hubspot', { apiKey: 'pat-na1-...' });

// Trigger a sync ('inbound' | 'outbound' | 'bidirectional')

await g8.integrations.sync('hubspot', { direction: 'bidirectional' });
```

### Methods 
| Method | Description
| `g8.integrations.list()` | List connected CRMs. Returns `Integration[]`.
| `g8.integrations.connect(provider, config?)` | Connect a CRM. Provider-specific credentials go in `config`.
| `g8.integrations.sync(provider, { direction? })` | Trigger a sync. `direction` defaults to provider settings.  

## Audiences 
Sync an audience list to ad platforms (Meta, LinkedIn, Google, X) and keep it refreshed. Requires an API key. Built on the hardened HTTP core — every method throws a `G8Error` on failure and retries transient errors. 

```

// Create a sync from an audience list to a Meta Custom Audience

const sync = await g8.audiences.create({

audience_id: 1234,

platform: "meta",

mode: "mirror",            // or "append_only"

refresh_cadence_hours: 24,

platform_config: { ad_account_id: "act_123" },

});

await g8.audiences.trigger(sync.id);        // run it now

const runs = await g8.audiences.runs(sync.id);

console.log(runs.data[0].members_added);
```

| Method | Description
| `g8.audiences.list()` | List all audience syncs. Returns `{ data: AudienceSync[] }`.
| `g8.audiences.create(params)` | Create a sync. Returns the `AudienceSync`.
| `g8.audiences.get(configId)` | Get one sync by ID.
| `g8.audiences.update(configId, fields)` | Update mode / cadence / active / suppression lists.
| `g8.audiences.delete(configId)` | Delete a sync.
| `g8.audiences.trigger(configId)` | Trigger an immediate sync run.
| `g8.audiences.runs(configId)` | List recent sync runs (members added/removed, status).
| `g8.audiences.errors(configId)` | List recent sync errors. 
Platforms: `meta`, `linkedin`, `google`, `x`. Modes: `mirror` (full two-way membership) or `append_only` (only ever add).  

## Analytics 

```

const overview = await g8.analytics.overview({ period: '30d' });

// { visitors: 12500, contacts_created: 340, emails_sent: 2100, replies: 89, meetings_booked: 23 }
```

## Voice AI 
The `g8.voice` surface has two layers:  
- Top-level preview (`g8.voice.start()`, `g8.voice.analysis()`) — legacy single-call API. 
- `g8.voice.dialer` — the production parallel-dialer surface backed by `/api/v1/voice/dialer/*`.  

```

// Preview single-call API (kept for backwards compat)

const session = await g8.voice.start({ agent: 'sales-discovery', contactId: 123 });

const analysis = await g8.voice.analysis(session.id);

// { sentiment, summary, next_steps, objections, transcript }
```

### Dialer sessions 

```

const { data: sessions } = await g8.voice.dialer.listSessions({ status: 'active' });

const session = await g8.voice.dialer.createSession({

list_id: 637,

agent_id: 'ag_default',

from_number: '+14155551234',

campaign_id: 'cmp_abc',

});

// Pause / resume / stop

await g8.voice.dialer.updateSessionStatus(session.session_id, 'paused');

await g8.voice.dialer.resumeSession(session.session_id, 4);
```

### Calls + transcripts + grading 

```

const { data: calls } = await g8.voice.dialer.listCalls({ campaign_id: 'cmp_abc' });

const forContact = await g8.voice.dialer.listCallsForContact(5028106);

const forSdr = await g8.voice.dialer.listCallsForSdr('[email protected]', {

date_from: '2026-05-01',

});

const transcript = await g8.voice.dialer.callTranscript('room_abc123');

const grading = await g8.voice.dialer.callGrading('room_abc123');
```

### Stats + numbers + agents 

```

const { data: stats } = await g8.voice.dialer.stats({ aggregation: 'daily' });

const { data: numbers } = await g8.voice.dialer.numbers();

const { data: agents } = await g8.voice.dialer.agents();

const { data: callbacks } = await g8.voice.dialer.missedCallbacks(50);
```

``  

## Landing Pages 

```

// Clone from any URL

const page = await g8.pages.clone('https://competitor.com/pricing');

// Create from template

const page = await g8.pages.create({

template: 'lead_magnet',

title: 'The Future of Sales',

});

// Publish to CDN

const { url } = await g8.pages.publish(page.id);

// https://g8-lp-abc12345.pages.dev
```

## Webhooks 
Listen for events from graph8 (server-side). 

```

g8.webhooks.on('reply_received', (event) => {

slack.send(`${event.contact} replied to ${event.sequence}`);

});

g8.webhooks.on('meeting_booked', (event) => {

crm.updateDeal(event.dealId, { stage: 'meeting' });

});

// Stop all listeners

g8.webhooks.stop();
```

Available events: `reply_received`, `meeting_booked`, `contact_enriched`, `contact_created`, `sequence_completed`, `campaign_launched`, `form_submitted`, `visitor_identified`  

## Privacy 

```

g8.init({

writeKey: 'YOUR_WRITE_KEY',

privacy: {

dontSend: true,           // Disable all cookies and event sending

dontStoreUserIds: true,   // Don't store user identifiers

ipPolicy: 'remove',       // 'keep' | 'stripLastOctet' | 'remove'

},

});
```

## SSR Support 
All methods are no-ops on the server and execute on the client after hydration. Safe in Next.js, Nuxt, Remix, and any SSR framework. 

## Config Options 
| Option | Type | Default | Description
| `writeKey` | `string` | - | Write key for client-side features
| `apiKey` | `string` | - | API key for server-side features
| `host` | `string` | `https://t.graph8.com` | Tracking host URL
| `apiUrl` | `string` | `https://be.graph8.com` | Backend API URL
| `debug` | `boolean` | `false` | Enable debug logging
| `privacy.dontSend` | `boolean` | `false` | Disable cookies and event sending
| `privacy.dontStoreUserIds` | `boolean` | `false` | Don’t store user identifiers
| `privacy.ipPolicy` | `string` | `keep` | `keep`, `stripLastOctet`, or `remove` 

## Get Your Keys  
- Go to graph8 Settings > MCP & API 
- Write key is in the tracking snippet section (client-side) 
- API key is in the API tab (server-side)
