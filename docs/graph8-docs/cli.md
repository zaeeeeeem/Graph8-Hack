<!-- https://docs.graph8.com/developers/cli/ -->
# CLI

The `g8` CLI gives you terminal access to graph8’s developer tools — get framework-specific tracking snippets and progressive form templates directly from your terminal. 

## Personal vs Admin Credentials 
For most users, CLI auth should come from your Profile. 
| Use Case | Where to get credentials | What to use
| Personal CLI usage on your machine | Profile -> Developer | `g8 login` (OAuth) or personal API key
| Shared service account or org-wide automation | Settings -> API | Org API key 

```` 

## Installation 
Terminal window
```

pip install g8-mcp-server
```

This installs the `g8` command. Requires Python 3.10+. 

## Authentication 
Three ways to authenticate: 

### `g8 login` (recommended) 
Terminal window
```

g8 login
```

Opens your browser to sign in via OAuth. Once authenticated, a token is saved to `~/.g8/credentials.json` and used automatically for all future commands. No API key needed. 

### API key 
If you prefer using an API key, use your personal API key from Profile -> Developer. Admins can also use org keys from Settings -> API for shared integrations. 
Store it locally: 
Terminal window
```

g8 login --api-key
```

Prompts you to paste an API key, validates it, and saves it to `~/.g8/credentials.json`. 
Or set it as an environment variable: 
Terminal window
```

export G8_API_KEY="your_api_key_here"
```

```` 

### `g8 logout` 
Remove stored credentials: 
Terminal window
```

g8 logout
```

### `g8 whoami` 
Check your current authentication status: 
Terminal window
```

g8 whoami

# Auth source:  OAuth (~/.g8/credentials.json)

# Logged in as: [email protected]
```

## Commands 

### `g8 snippet` 
Get the graph8 tracking snippet for any supported framework. The snippet loads `p.js` — the graph8 tracking script — on every page. 
Usage: 
Terminal window
```

# Get snippet for a framework

g8 snippet --framework nextjs

# List all supported frameworks

g8 snippet --list

# Get snippet for a specific repo

g8 snippet --framework react --repo-id <repo-id>

# Output as JSON

g8 snippet --framework html --format json
```

Options: 
| Option | Description
| `--framework` | Target framework (required unless `--list`)
| `--list` | List all supported frameworks
| `--repo-id` | Repository ID for repo-specific config (optional)
| `--format` | Output format: `text` (default) or `json` 
Supported Frameworks: 
| Framework | Rendering | Description
| `html` | SSR | HTML / Vanilla JS — script tag in `<head>`
| `react` | CSR | React — `useEffect` component
| `nextjs` | SSR | Next.js — `next/script` for App Router and Pages Router
| `vue` | CSR | Vue — `onMounted` composable
| `wordpress` | SSR | WordPress — `functions.php` hook
| `webflow` | SSR | Webflow — Custom Code in project settings
| `shopify` | SSR | Shopify — `theme.liquid` snippet 

````
`````` 
Example output: 
Terminal window
```

$ g8 snippet --framework nextjs
```

```

graph8 Tracking Snippet — Next.js

Setup Steps:

1. App Router: add the Script to app/layout.tsx

2. Pages Router: add the Script to pages/_app.tsx

3. Use window.g8?.track() and window.g8?.identify() in client components

Code:

————————————————————————————————————————————————————————————

// app/layout.tsx (App Router)

import Script from 'next/script';

export default function RootLayout({ children }) {

return (

<html>

<head>

<Script

src="https://t.graph8.com/p.js"

data-write-key="your-write-key"

data-tracking-host="https://t.graph8.com"

strategy="afterInteractive"

/>

</head>

<body>{children}</body>

</html>

);

}

————————————————————————————————————————————————————————————

Tracking Methods:

identify: g8.identify("user-id", {email: "[email protected]", name: "Jane Doe"})

track: g8.track("event_name", {property: "value"})
```

### Privacy Options 
The generated snippet includes data-attributes you can add to control privacy behavior: 
| Attribute | Values | Description
| `data-privacy-dont-send` | `"true"` | Disables cookies and event sending
| `data-privacy-user-ids` | `"true"` | Disables storing user identifiers
| `data-privacy-ip-policy` | `"keep"`, `"stripLastOctet"`, `"remove"` | Controls IP address handling
| `data-init-only` | `"true"` | Initializes the script without sending a page event 

### Verifying the Snippet 
After adding the snippet to your app:  
- Open browser DevTools -> Network tab 
- Look for requests to your tracking host (`/p.js`) 
- In Console: `window.g8` should be defined 
- Call `g8.track('test_event')` — you should see a network request   

### `g8 form` 
Get a progressive form template — an embeddable or popup form that collects data in stages across multiple visits. 

`` 
Usage: 
Terminal window
```

# Get an embedded form template

g8 form --framework react --variant embedded

# Get a popup form template

g8 form --framework nextjs --variant popup

# Custom field stages

g8 form --framework html --variant embedded \

--stages '[{"stage":1,"fields":[{"name":"email","type":"email","required":true}]}]'

# Output as JSON

g8 form --framework vue --variant popup --format json
```

Options: 
| Option | Description
| `--framework` | Target framework (required)
| `--variant` | Form variant: `embedded` or `popup` (required)
| `--repo-id` | Repository ID for repo-specific config (optional)
| `--stages` | Custom field stages as JSON string (optional)
| `--format` | Output format: `text` (default) or `json` 
Form Variants: 
| Variant | Best for
| `embedded` | Inline forms within page content (signup sections, footers, sidebars)
| `popup` | Modal/overlay forms triggered by buttons or page events 

### Progressive Form Stages 
Forms collect data progressively across visits — asking for a little more each time. The default stages are: 
| Stage | Fields | Purpose
| 1 | `work_email` | Initial capture — lowest friction
| 2 | `first_name`, `last_name`, `company` | Identity enrichment
| 3 | `job_title`, `phone` | Qualification data 
The form tracks which stage the visitor has completed using `localStorage` and shows the next stage on their return visit. 
Custom stages: Pass a JSON array to `--stages` to override the defaults: 
Terminal window
```

g8 form --framework react --variant embedded \

--stages '[

{"stage": 1, "fields": [

{"name": "email", "type": "email", "required": true}

]},

{"stage": 2, "fields": [

{"name": "name", "type": "text", "required": true},

{"name": "role", "type": "select", "required": false,

"options": ["Developer", "Manager", "Executive"]}

]}

]'
```

### Data Flow 
When a form is submitted, the data flows through graph8’s tracking pipeline:  
- Form captures field values from the visitor 
- `g8.identify()` sends the data to graph8’s CDP 
- `g8.track()` records the form submission event 
- Data appears in the contact profile in your graph8 workspace  

### `g8 logs` 
Show your organization’s most recent API requests — method, path, status code, and `request_id` — for debugging an integration. Reads the same request log the REST API exposes. 
Terminal window
```

# Most recent 50 requests (newest first)

g8 logs

# Limit the number of entries (1-200)

g8 logs --limit 20
```

Each entry includes the `request_id`, which matches the `X-Request-Id` response header — quote it to support when reporting an issue. 

### `g8 usage` 
Show your organization’s credit balance — total, held, available, and lifetime totals. Reads `GET /api/v1/usage`. 
Terminal window
```

g8 usage
```

### `g8 usage-transactions` 
Show your organization’s credit-transaction ledger (most recent first). 
Terminal window
```

# Most recent 50 transactions

g8 usage-transactions

# Limit the number of entries (1-200)

g8 usage-transactions --limit 20
```

### `g8 webhooks` 
List your organization’s webhook subscriptions. Reads `GET /api/v1/webhooks`. 
Terminal window
```

g8 webhooks
```

### `g8 webhooks-events` 
List all available webhook event types — each with its category and description (the event catalog). Use it to discover what you can subscribe to. 
Terminal window
```

g8 webhooks-events
```

## Output Formats 
| Format | Flag | Description
| Text | `--format text` (default) | Human-readable output with headers, code blocks, and setup steps
| JSON | `--format json` | Machine-readable output — same structure as the MCP tool response 
The JSON format is useful for piping into other tools or scripts: 
Terminal window
```

g8 snippet --framework html --format json | jq '.snippet_code'
```

## Workflow 
The recommended order for integrating graph8 into your app:  
-  
Install the tracking snippet — this is always the first step 
Terminal window
```

g8 snippet --framework nextjs
```

-  
Add the snippet to your app — follow the setup steps in the output  
-  
Configure tracking — add identify and track calls: 

```

// On login/signup

g8.identify("user-123", { email: "[email protected]", name: "Jane" });

// On key actions

g8.track("plan_selected", { plan: "pro", billing: "annual" });
```

-  
Add progressive forms — once tracking is working: 
Terminal window
```

g8 form --framework nextjs --variant embedded
```

-  
Verify - open DevTools Network tab and look for requests to your tracking host   

``  

## CRM Commands 

### `g8 search-contacts` 
Search contacts already in your CRM. 
Terminal window
```

g8 search-contacts --job-title "VP Sales" --limit 10

g8 search-contacts --email [email protected]

g8 search-contacts --company "Acme" --seniority VP

g8 search-contacts --list-id 637
```

| Option | Description
| `--email` | Filter by email (exact match)
| `--name` | Filter by name (partial match)
| `--job-title` | Filter by job title (partial match)
| `--seniority` | Filter by seniority (C-Suite, VP, Director, Manager)
| `--company` | Filter by company name (partial match)
| `--country` | Filter by country
| `--list-id` | Filter by contact list ID
| `--page` | Page number (default 1)
| `--limit` | Results per page (default 25) 

### `g8 search-companies` 
Search companies in your CRM. 
Terminal window
```

g8 search-companies --industry "SaaS" --limit 10

g8 search-companies --domain acme.com
```

| Option | Description
| `--domain` | Filter by domain
| `--industry` | Filter by industry
| `--name` | Filter by company name
| `--page` | Page number (default 1)
| `--limit` | Results per page (default 25) 

### `g8 create-contact` 
Create a new contact in your CRM. 
Terminal window
```

g8 create-contact --email [email protected] --first-name Jane --last-name Smith --job-title "VP Sales"

g8 create-contact --email [email protected] --list-id 637
```

| Option | Description
| `--email` | Work email (required)
| `--first-name` | First name
| `--last-name` | Last name
| `--job-title` | Job title
| `--company-domain` | Company domain
| `--list-id` | Add to this list immediately 

### `g8 create-list` 
Create a new contact or company list. 
Terminal window
```

g8 create-list --title "VP Sales - SaaS SMB"

g8 create-list --title "Target Companies" --type companies
```

| Option | Description
| `--title` | List name (required)
| `--type` | `contacts` (default) or `companies` 

### `g8 add-to-list` 
Add existing contacts to a list. 
Terminal window
```

g8 add-to-list --list-id 637 --contact-ids 5028106,5028105,5028104
```

| Option | Description
| `--list-id` | List ID (required)
| `--contact-ids` | Comma-separated contact IDs (required)  

## Prospecting Commands 

### `g8 lookup-person` 
Look up a single person in graph8’s 700M+ contact index. Free on both PAYG and Platform within the 50 rps cap. 
Terminal window
```

g8 lookup-person --email [email protected]

g8 lookup-person --linkedin "linkedin.com/in/jane-smith"

g8 lookup-person --first-name Jane --last-name Smith --company-domain acme.com
```

| Option | Description
| `--email` | Email address
| `--linkedin` | LinkedIn URL
| `--first-name` | First name (use with last-name + company-domain)
| `--last-name` | Last name
| `--company-domain` | Company domain 

### `g8 lookup-company` 
Look up a company. Costs 1 credit. 
Terminal window
```

g8 lookup-company --domain tiledb.com

g8 lookup-company --name "Acme Corp"
```

### `g8 find-contacts` 
Search the 700M+ open contact index for new prospects. Free on both PAYG and Platform within the 50 rps cap. 
Terminal window
```

g8 find-contacts --filters '[{"field":"seniority_level","operator":"any_of","value":["VP","Director"]},{"field":"company_industry","operator":"contains","value":["SaaS"]}]' --limit 10
```

| Option | Description
| `--filters` | JSON array of filter objects (required)
| `--page` | Page number (default 1)
| `--limit` | Results per page (default 25) 
Filter fields: `first_name`, `last_name`, `work_email`, `job_title`, `seniority_level`, `company_name`, `company_domain`, `company_industry`, `company_employee_count`, `company_revenue`, `country`, `state`, `city` 
Operators: `any_of`, `contains`, `all_of`, `none_of`, `is_empty`, `is_not_empty`, `between`, `exists` 

### `g8 find-companies` 
Search the 100M+ company database. Free on both PAYG and Platform within the 50 rps cap. 
Terminal window
```

g8 find-companies --filters '[{"field":"industry","operator":"contains","value":["SaaS"]},{"field":"employee_count","operator":"between","value":[50,500]}]'
```

### `g8 build-list` 
Search for prospects and save them to a new list in one call. Free on both PAYG and Platform within the 50 rps cap (credits apply later when you enrich, send, or AI-process the saved records). 
Terminal window
```

g8 build-list --filters '[{"field":"seniority_level","operator":"any_of","value":["VP"]}]' --title "VP Sales - SaaS" --max-results 50
```

| Option | Description
| `--filters` | JSON filter array (required)
| `--title` | List name (required)
| `--max-results` | Max contacts to save (default 100) 

``  

## Enrichment 

### `g8 enrich` 
Enrich contacts with verified emails, phones, and company data. Credits charged per contact. 
Terminal window
```

g8 enrich --contact-ids 5028106,5028105,5028104 --list-id 637
```

| Option | Description
| `--contact-ids` | Comma-separated contact IDs (required)
| `--list-id` | List ID the contacts belong to (required)  

## Sequences 

### `g8 sequences` 
List available outbound sequences. 
Terminal window
```

g8 sequences --limit 10
```

### `g8 add-to-sequence` 
Enroll contacts in an outbound sequence. 
Terminal window
```

g8 add-to-sequence --sequence-id "0686895f-..." --contact-ids 5028106,5028105 --list-id 637
```

| Option | Description
| `--sequence-id` | Sequence ID from `g8 sequences` (required)
| `--contact-ids` | Comma-separated contact IDs (required)
| `--list-id` | List ID (required) 

### `g8 create-sequence` 
Create a new outreach sequence. 
Terminal window
```

g8 create-sequence --name "Q2 VP Outbound" --description "Multi-step email + LinkedIn sequence"
```

| Option | Description
| `--name` | Sequence name (required)
| `--description` | Sequence description
| `--steps` | JSON array of step configs
| `--channels` | JSON array of channel configs
| `--campaign-id` | Link to a campaign (optional) 

### `g8 sequence-preview` 
Preview a sequence’s steps and channels before launching. 
Terminal window
```

g8 sequence-preview --sequence-id "0686895f-..."
```

### `g8 update-sequence` 
Update sequence metadata. 
Terminal window
```

g8 update-sequence --sequence-id "0686895f-..." --name "Updated Name" --description "New goal"
```

### `g8 pause-sequence` 
Pause a live sequence. No new messages will be sent until resumed. 
Terminal window
```

g8 pause-sequence --sequence-id "0686895f-..."
```

`` 

### `g8 resume-sequence` 
Resume a paused sequence. Execution times are recalculated respecting business hours. 
Terminal window
```

g8 resume-sequence --sequence-id "0686895f-..."
```

### `g8 sequence-analytics` 
Get performance metrics for a sequence. 
Terminal window
```

g8 sequence-analytics --sequence-id "0686895f-..."
```

Returns overview (total contacts, completion rate), performance (funnel, response rates), engagement (reply rate, bounce rate), and timeline data. 

### `g8 delete-sequence` 
Archive a sequence (soft delete). Active sequences are paused first. 
Terminal window
```

g8 delete-sequence --sequence-id "0686895f-..."
```

## Inbox 

### `g8 inbox-list` 
List reply threads across email, SMS, and LinkedIn. 
Terminal window
```

g8 inbox-list --channel email --limit 20

g8 inbox-list --sequence-id "0686895f-..." --status unread

g8 inbox-list --assignee [email protected] --tag qualified
```

| Option | Description
| `--channel` | Filter by channel: `email`, `sms`, `linkedin`
| `--sequence-id` | Filter by sequence
| `--status` | Filter by thread status
| `--assignee` | Filter by assigned user email
| `--tag` | Filter by tag
| `--page` | Page number (default 1)
| `--limit` | Results per page (default 20) 

### `g8 inbox-get` 
Get a single reply thread with full message history. 
Terminal window
```

g8 inbox-get --reply-id <thread-id> --channel email
```

### `g8 inbox-assign` 
Assign a reply thread to a team member. 
Terminal window
```

g8 inbox-assign --reply-id <thread-id> --assignee [email protected]
```

### `g8 inbox-tag` 
Tag a reply thread for categorization. 
Terminal window
```

g8 inbox-tag --reply-id <thread-id> --tag-ids "qualified,hot-lead"
```

### `g8 inbox-draft` 
Generate an AI reply draft based on conversation context. Charges credits. 
Terminal window
```

g8 inbox-draft --reply-id <thread-id>
```

### `g8 inbox-send` 
Send a reply via email, SMS, or LinkedIn. 
Terminal window
```

g8 inbox-send --reply-id <thread-id> --channel email --body "Thanks for your interest..."
```

## Deals 
Full CRUD for CRM deals plus pipeline introspection. Read operations are free; writes mutate your workspace. 

### `g8 list-pipelines` 
List all deal pipelines and their stages. 
Terminal window
```

g8 list-pipelines
```

### `g8 list-deals` 
List deals with optional filters and pagination. 
Terminal window
```

g8 list-deals --stage-id stg_123 --limit 50

g8 list-deals --pipeline-id pip_default --search "Acme"
```

| Option | Description
| `--stage-id` | Filter by stage ID
| `--pipeline-id` | Filter by pipeline ID
| `--search` | Substring search on deal name
| `--page` | Page number (default 1)
| `--limit` | Results per page (default 25) 

### `g8 get-deal` 
Fetch a single deal by ID. 
Terminal window
```

g8 get-deal --deal-id deal_abc123
```

### `g8 create-deal` 
Create a new deal. Stage / pipeline default to the org’s defaults if omitted. 
Terminal window
```

g8 create-deal --name "Acme Q3 expansion" --company-id 8821 --amount 12500 --close-date 2026-09-30
```

| Option | Description
| `--name` | Deal name (required)
| `--company-id` | Linked company ID
| `--description` | Description
| `--amount` | Deal amount
| `--currency` | Currency (default `USD`)
| `--stage-id` | Stage ID
| `--pipeline-id` | Pipeline ID
| `--close-date` | ISO 8601 close date 

### `g8 update-deal` 
Partial update — common use is changing the stage as the deal progresses. 
Terminal window
```

g8 update-deal --deal-id deal_abc123 --stage-id stg_proposal --amount 15000
```

### `g8 delete-deal` 
Delete a deal. Irreversible. 
Terminal window
```

g8 delete-deal --deal-id deal_abc123
```

`` 

### `g8 list-contact-deals` 
List all deals associated with a contact. 
Terminal window
```

g8 list-contact-deals --contact-id 5028106
```

### `g8 list-company-deals` 
List all deals associated with a company. 
Terminal window
```

g8 list-company-deals --company-id 8821
```

## Tasks 
CRUD for tasks linked to contacts. 

### `g8 list-tasks` 
List tasks org-wide with optional filters. 
Terminal window
```

g8 list-tasks --status open --priority high --limit 50

g8 list-tasks --assignee-id user_123 --search "follow up"
```

| Option | Description
| `--status` | Filter by status
| `--priority` | Filter by priority
| `--assignee-id` | Filter by assignee user ID
| `--search` | Substring search on title
| `--limit` | Results per page (default 25)
| `--offset` | Pagination offset (default 0) 

### `g8 list-contact-tasks` 
List tasks for a specific contact. 
Terminal window
```

g8 list-contact-tasks --contact-id 5028106 --status open
```

### `g8 create-task` 
Create a task linked to a contact. 
Terminal window
```

g8 create-task --contact-id 5028106 --title "Send proposal" --due-date 2026-06-15 --priority high
```

| Option | Description
| `--contact-id` | Contact ID (required)
| `--title` | Task title (required)
| `--description` | Task description
| `--due-date` | ISO 8601 due date
| `--assignee-id` | Assignee user ID
| `--priority` | Priority (`low`, `medium`, `high`) 

### `g8 update-task` 
Partial update. 
Terminal window
```

g8 update-task --task-id task_abc --status completed
```

### `g8 delete-task` 
Delete a task. Irreversible. 
Terminal window
```

g8 delete-task --task-id task_abc
```

## Notes 
CRUD for notes attached to contacts. 

### `g8 list-notes` 
List all notes on a contact. 
Terminal window
```

g8 list-notes --contact-id 5028106
```

### `g8 create-note` 
Add a note to a contact. 
Terminal window
```

g8 create-note --contact-id 5028106 --content "Discovery call: budget approved, decision by Q3"
```

### `g8 update-note` 
Update a note’s content. 
Terminal window
```

g8 update-note --note-id note_xyz --content "Updated: budget approved for Q4"
```

### `g8 delete-note` 
Delete a note. Irreversible. 
Terminal window
```

g8 delete-note --note-id note_xyz
```

## Custom Fields 
Manage custom columns on contacts or companies. Fields can be global (entity-wide) or list-scoped (only on contacts/companies inside one list). 

### `g8 list-fields` 
List field definitions for an entity. Includes base + custom columns. 
Terminal window
```

g8 list-fields --entity contacts

g8 list-fields --entity companies --list-id 637
```

| Option | Description
| `--entity` | `contacts` or `companies` (required)
| `--list-id` | Restrict to a list-scoped column set 

### `g8 create-field` 
Create a custom column. Omit `--list-id` to make it global. 
Terminal window
```

g8 create-field --title "Lead score" --entity contacts --data-type number

g8 create-field --title "Q3 priority" --entity contacts --data-type boolean --list-id 637
```

| Option | Description
| `--title` | Column title (required)
| `--entity` | `contacts` or `companies` (required)
| `--data-type` | Data type — `text`, `number`, `boolean`, `date`, etc. (required)
| `--list-id` | Make the column list-scoped instead of global 

### `g8 set-field-value` 
Set a custom column value on a single row. 
Terminal window
```

g8 set-field-value --column-id 42 --record-id 5028106 --value 85 --entity contacts
```

### `g8 delete-field` 
Soft-delete a custom column. 
Terminal window
```

g8 delete-field --column-id 42 --entity contacts
```

## Quotes 
Full quote-to-cash lifecycle: draft, edit, send (with signing + payment link), duplicate, convert back to draft. 

### `g8 list-quotes` 
List quotes with optional filters. 
Terminal window
```

g8 list-quotes --status sent --limit 50

g8 list-quotes --contact-id 5028106
```

| Option | Description
| `--status` | `draft`, `sent`, `signed`, `declined`, `expired`, `void`
| `--contact-id` | Filter by contact
| `--company-id` | Filter by company
| `--page` | Page number (default 1)
| `--limit` | Results per page (default 25) 

### `g8 get-quote` 
Get a single quote by ID. 
Terminal window
```

g8 get-quote --quote-id quo_abc123
```

### `g8 create-quote` 
Create a new quote from line items. Line items are passed as JSON. 
Terminal window
```

g8 create-quote --contact-id 5028106 --line-items '[

{"product_id":"prod_pro","quantity":1,"unit_price":499,"recurring":true},

{"name":"Onboarding","quantity":1,"unit_price":1500}

]' --currency USD --expires-at 2026-07-15T00:00:00Z
```

| Option | Description
| `--line-items` | JSON array of line items (required)
| `--contact-id` | Linked contact
| `--company-id` | Linked company
| `--currency` | Currency (default `USD`)
| `--notes` | Free-text notes for the quote
| `--expires-at` | ISO 8601 expiry
| `--name` | Display name 

### `g8 update-quote` 
Partial update on a draft quote. 
Terminal window
```

g8 update-quote --quote-id quo_abc123 --notes "Updated to 12-month commit"
```

### `g8 delete-quote` 
Delete a draft quote. Irreversible. 
Terminal window
```

g8 delete-quote --quote-id quo_abc123
```

### `g8 duplicate-quote` 
Duplicate an existing quote into a new draft. 
Terminal window
```

g8 duplicate-quote --quote-id quo_abc123
```

### `g8 edit-quote-draft` 
Convert a signed / sent quote back to editable draft state. 
Terminal window
```

g8 edit-quote-draft --quote-id quo_abc123
```

### `g8 send-quote` 
Send the quote to its recipient via email — includes signing link by default. 
Terminal window
```

g8 send-quote --quote-id quo_abc123 --recipient-email [email protected]

g8 send-quote --quote-id quo_abc123 --recipient-email [email protected] --no-signing-link
```

| Option | Description
| `--quote-id` | Quote ID (required)
| `--recipient-email` | Recipient email (required)
| `--no-signing-link` | Skip attaching the signing link 

### `g8 list-quotable-products` 
List products available for line items. 
Terminal window
```

g8 list-quotable-products
```

### `g8 get-quote-settings` 
Org-level quote settings: default currency, tax rate, payment providers, logo, signature requirement. 
Terminal window
```

g8 get-quote-settings
```

### `g8 list-contact-quotes` / `g8 list-company-quotes` 
Terminal window
```

g8 list-contact-quotes --contact-id 5028106

g8 list-company-quotes --company-id 8821
```

## Stage Checklist Pipelines 
Workflow pipelines with per-stage evidence requirements and channel scripts. Separate from deal pipelines (which live under `g8 list-pipelines` / `g8 get-deal`). 

### `g8 list-stage-pipelines` 
List every Stage Checklist pipeline. 
Terminal window
```

g8 list-stage-pipelines
```

### `g8 get-stage-pipeline` 
Get a pipeline by ID with all stages, evidence, and scripts. 
Terminal window
```

g8 get-stage-pipeline --pipeline-id pip_xyz
```

### `g8 list-stage-evidence` 
Get the canonical evidence-key library (used when defining stage requirements). 
Terminal window
```

g8 list-stage-evidence
```

### `g8 create-stage-pipeline` 
Create a new Stage Checklist pipeline. Defaults to a templated stage set; pass `--blank` for an empty pipeline. 
Terminal window
```

g8 create-stage-pipeline --name "Enterprise Outbound" --target "Land 5 new logos in Q3"

g8 create-stage-pipeline --name "Custom flow" --blank
```

### `g8 update-stage-pipeline` 
Update pipeline metadata. 
Terminal window
```

g8 update-stage-pipeline --pipeline-id pip_xyz --name "Renamed"
```

### `g8 delete-stage-pipeline` 
Delete a pipeline. Only allowed when no deals reference it. 
Terminal window
```

g8 delete-stage-pipeline --pipeline-id pip_xyz
```

### `g8 create-stage` 
Add a stage to a pipeline. 
Terminal window
```

g8 create-stage --pipeline-id pip_xyz --name "Discovery" \

--required-elements '["budget_confirmed","timeline_known"]' \

--channel-scripts '{"email":"Hi {{first_name}}...","call":"Hello..."}'
```

| Option | Description
| `--pipeline-id` | Parent pipeline ID (required)
| `--name` | Stage name (required)
| `--position` | 0-indexed position
| `--required-elements` | JSON array of evidence keys
| `--recommended-elements` | JSON array of evidence keys
| `--channel-scripts` | JSON dict of `channel → script text`
| `--color` | Stage color
| `--stage-type` | Free-form type label 

### `g8 update-stage` 
Partial update on a stage. 
Terminal window
```

g8 update-stage --pipeline-id pip_xyz --stage-id stg_discovery --color "#00CAEB"
```

### `g8 delete-stage` 
Remove a stage from a pipeline. 
Terminal window
```

g8 delete-stage --pipeline-id pip_xyz --stage-id stg_discovery
```

### `g8 reorder-stages` 
Reorder stages by passing all stage IDs in the desired order. 
Terminal window
```

g8 reorder-stages --pipeline-id pip_xyz --stage-ids stg_qual,stg_demo,stg_negotiation,stg_close
```

### `g8 suggest-stage-pipeline` 
Get an AI-suggested pipeline based on org context (brand, ICP, messaging house). 
Terminal window
```

g8 suggest-stage-pipeline
```

### `g8 create-stage-pipeline-from-suggestion` 
Promote an AI suggestion into a real pipeline, optionally overriding name / target. 
Terminal window
```

g8 create-stage-pipeline-from-suggestion --suggestion-id sug_abc123 --name "PLG Path"
```

## Workflows 
Multi-node automation graphs with execution lifecycle. The workflow definition is treated as a single record — node-level CRUD is done by fetching the workflow, mutating `config.nodes` / `config.connections`, and submitting via `workflow-update`. 

### Workflow CRUD 
Terminal window
```

g8 workflow-list --is-active true

g8 workflow-get --workflow-id wf_abc123

g8 workflow-create --name "Inbound demo follow-up" --config '{"nodes":[{"id":"n1","type":"form_trigger","config":{}}], "connections":[]}'

g8 workflow-update --workflow-id wf_abc123 --config '{...}'

g8 workflow-delete --workflow-id wf_abc123

g8 workflow-validate --config '{"nodes":[...], "connections":[...]}'
```

### Execution lifecycle 
Terminal window
```

g8 workflow-execute --workflow-id wf_abc123 --trigger-payload '{"contact_id":5028106}'

g8 workflow-get-execution --execution-id exec_xyz

g8 workflow-pause-execution --execution-id exec_xyz

g8 workflow-resume-execution --execution-id exec_xyz

g8 workflow-stop-execution --execution-id exec_xyz

g8 workflow-trigger-status --workflow-id wf_abc123

g8 workflow-reset-trigger --workflow-id wf_abc123
```

### Discovery + integration pickers 
Terminal window
```

g8 workflow-node-types

g8 workflow-node-types --type agent

g8 workflow-list-slack-users

g8 workflow-list-slack-channels

g8 workflow-list-roam-users

g8 workflow-list-roam-groups

g8 workflow-list-mcp-servers

g8 workflow-list-dispositions

g8 workflow-list-form-fields --form-id form_demo_request
```

``````  

## Skills 
LLM and API building blocks that workflows compose into runs. Two kinds: LLM skills (prompt + model) and API skills (HTTP request wrappers). 

### Read 
Terminal window
```

g8 skill-list --type llm

g8 skill-get --skill-id sk_abc123

g8 skill-get-variables --skill-id sk_abc123

g8 skill-list-models

g8 skill-list-templates --type llm
```

### Create 
Terminal window
```

# LLM skill

g8 skill-create-llm --title "Qualify lead" \

--prompt "You are an SDR. Contact: {{contact}}. Company: {{company}}. Return JSON {tier:A|B|C, reason}." \

--model claude-sonnet-4-6 \

--input-schema '{"fields":[{"name":"contact","type":"object","required":true},{"name":"company","type":"object","required":true}]}'

# API skill

g8 skill-create-api --title "Enrich domain" \

--method GET --url "https://example.com/lookup?domain={{domain}}" \

--headers '{"Authorization":"Bearer xxx"}' \

--input-schema '{"fields":[{"name":"domain","type":"string","required":true}]}'

# From template

g8 skill-create-from-template --title "Reply summarizer" --template-id summarize_reply

# Lifted from a workflow node

g8 skill-create-from-node --title "Lifted draft node" --node-id n_draft_reply_456
```

### Update / delete / validate / execute 
Terminal window
```

g8 skill-update --skill-id sk_abc123 --type llm --model claude-opus-4-7

g8 skill-delete --skill-id sk_abc123

g8 skill-validate --skill-json '{"type":"llm","title":"t","prompt":"hi","model":"claude-sonnet-4-6","input_schema":{"fields":[]}}'

g8 skill-execute --skill-id sk_abc123 --input-payload '{"contact":{"name":"Jane"},"company":{"domain":"acme.com"}}'
```

``  

## Voice (Dialer Extras) 
The base voice commands are documented under the audience / inbox / sync sections; the additions below cover transcripts and call listings. 

### `g8 voice-call-transcript` 
Full transcript for a single dialer call. 
Terminal window
```

g8 voice-call-transcript --room-name room_abc123
```

### `g8 voice-list-calls` 
List dialer calls with optional filters. 
Terminal window
```

g8 voice-list-calls --campaign-id cmp_xyz --date-from 2026-05-01 --limit 50
```

### `g8 voice-list-calls-for-contact` / `g8 voice-list-calls-for-sdr` 
Terminal window
```

g8 voice-list-calls-for-contact --contact-id 5028106

g8 voice-list-calls-for-sdr --user-email [email protected] --date-from 2026-05-01
```

## Intent + Visitor Tracking 
Track keywords (your domain or competitor domains), query the visitor / contact graph by keyword or page URL. 

### Org-level + keyword management 
Terminal window
```

g8 intent-stats

g8 intent-list-keywords

g8 intent-create-from-domain --domain competitor.com

g8 intent-delete-keyword --keyword-id kw_abc123
```

### Per-keyword data 
Terminal window
```

g8 intent-keyword-companies --keyword-id kw_abc123 --limit 50

g8 intent-keyword-contacts --keyword-id kw_abc123

g8 intent-keyword-urls --keyword-id kw_abc123
```

### Page-level data 
Terminal window
```

g8 intent-pages-by-domain --domain competitor.com

g8 intent-search-pages --query pricing

g8 intent-page-visitors --url https://example.com/pricing

g8 intent-page-contacts --url https://example.com/pricing

g8 intent-page-visitor-counts --urls https://example.com/pricing,https://example.com/docs
```

### Account-level intent search 
Terminal window
```

g8 intent-url-companies --url https://competitor.com/pricing --date-from 2026-04-01
```

## Studio Context 
Read-only access to the 44-doc intelligence engine that powers campaign generation: brand brief, value props, ICPs, personas, intelligence (scrapes + enrichment), AI research reports. 
Terminal window
```

g8 studio-global-context --category brand_brief

g8 studio-icps --status published

g8 studio-personas

g8 studio-intelligence-data --source-type website_scrape

g8 studio-research-reports --category competitive_teardown
```

## Meetings 
Read scheduled, completed, cancelled meetings (with transcripts + AI analysis on completed ones). 

### `g8 list-meetings` 
Terminal window
```

g8 list-meetings --status completed --limit 10

g8 list-meetings --contact-id 5028106

g8 list-meetings --date-from 2026-05-01 --date-to 2026-05-31
```

| Option | Description
| `--status` | `scheduled`, `completed`, `cancelled`, `no_show`
| `--date-from` / `--date-to` | ISO 8601 date range
| `--attendee-id` | Filter by attendee user ID
| `--event-type` | e.g. `demo-30min`
| `--contact-id` | Filter by linked contact
| `--page` / `--limit` | Pagination 

### `g8 get-meeting` 
Full detail including transcript + AI analysis. 
Terminal window
```

g8 get-meeting --meeting-id mtg_abc123 | jq '.transcript[]'
```

## Audience & CRM Sync 

### `g8 sync-audience-list` 
List configured audience syncs to ad platforms. 
Terminal window
```

g8 sync-audience-list
```

### `g8 sync-audience-create` 
Create a new audience sync to Meta, LinkedIn Ads, Google Ads, or X. 
Terminal window
```

g8 sync-audience-create --audience-id 42 --platform meta --mode mirror --cadence 24
```

| Option | Description
| `--audience-id` | Source audience/list ID (required)
| `--platform` | Target platform: `meta`, `linkedin`, `google`, `x` (required)
| `--mode` | Sync mode: `mirror` (full replace) or `append_only` (required)
| `--cadence` | Refresh cadence in hours (0 = manual only) 

### `g8 sync-audience-trigger` 
Manually trigger a sync run. 
Terminal window
```

g8 sync-audience-trigger --config-id <id>
```

### `g8 sync-audience-runs` 
View sync run history with record counts. 
Terminal window
```

g8 sync-audience-runs --config-id <id>
```

### `g8 sync-audience-errors` 
View error logs for failed sync runs. 
Terminal window
```

g8 sync-audience-errors --config-id <id>
```

### `g8 sync-crm-list` 
List connected CRM integrations. 
Terminal window
```

g8 sync-crm-list
```

### `g8 sync-crm-push` 
Push contacts, companies, or list memberships to a CRM. 
Terminal window
```

g8 sync-crm-push --provider hubspot --type contacts --records '[{"email":"[email protected]","properties":{"firstname":"Jane"}}]'

g8 sync-crm-push --provider salesforce --type companies --records '[{"Name":"Acme Corp","Website":"acme.com"}]'
```

| Option | Description
| `--provider` | CRM provider: `hubspot`, `salesforce`, `pipedrive`, `zoho`, `sugarcrm` (required)
| `--type` | Push type: `contacts`, `companies`, `lists` (required)
| `--records` | JSON array of records to push (required) 

### `g8 sync-crm-fields` 
Discover available field mappings for a CRM provider. 
Terminal window
```

g8 sync-crm-fields --provider hubspot
```

### `g8 sync-crm-status` 
Check CRM connection health and rate limits. 
Terminal window
```

g8 sync-crm-status --provider salesforce
```

## Campaigns 

### `g8 campaigns` 
List campaigns in your organization. 
Terminal window
```

g8 campaigns --limit 10
```

### `g8 campaign` 
Get full details for a specific campaign. 
Terminal window
```

g8 campaign 4781adce-464b-402e-9a69-b6dbb6376150
```

## Piping & Scripting 
All commands output JSON, making them scriptable: 
Terminal window
```

# Extract emails from search results

g8 search-contacts --job-title "CTO" --limit 50 | jq '.[].work_email'

# Count contacts in a list

g8 search-contacts --list-id 637 | jq 'length'

# Export to CSV

g8 search-contacts --seniority VP --limit 100 | jq -r '.[] | [.first_name,.last_name,.work_email,.job_title] | @csv'
```
