<!-- https://docs.graph8.com/developers/mcp/ -->
# MCP Server

The graph8 MCP server connects AI coding agents (Claude Code, Cursor, Windsurf, Claude Desktop, ChatGPT) to your graph8 workspace. It exposes tools for contact and company search, sequences, inbox, campaigns, voice/dialer, workflow building, skill authoring, intent signals, quote-to-cash, pipelines, and developer install, all from within your IDE or chat client. 
Claude CodeCursorWindsurfClaude DesktopChatGPT 

## Personal vs Admin Setup 
Most users should use personal MCP setup from Profile. You do not need org admin access. 
| Use Case | Where to set it up | Credential
| Personal MCP in Claude Desktop, Cursor, Windsurf, Claude Code | Profile -> Developer | Personal API key (for local) or OAuth (for remote)
| Shared org automation and admin-managed integrations | Settings -> API | Org API key 

## Setup 
There are two ways to connect: Remote (recommended) and Local. Remote uses OAuth — no API key or installation required. Local runs the server on your machine via stdio. 

### Remote (OAuth) — Recommended 
Paste this config into your AI client. Your client will prompt you to sign in via OAuth when you first connect — no API key needed.  

-   Claude.ai  
-   Claude Desktop  
-   Claude Code  
-   Cursor  
-   Windsurf  
-   ChatGPT     

- Go to Customize > Connectors > Add custom connector 
- Paste the server URL: `https://be.graph8.com/mcp/` 
- Click Add, then Connect 
- Authorize when prompted (one time)  

- Go to Settings > MCP Servers > Add 
- Paste the server URL: `https://be.graph8.com/mcp/` 
- Authorize when prompted (one time)  

Add to `~/.claude/mcp.json`:

```

{

"mcpServers": {

"graph8": {

"url": "https://be.graph8.com/mcp/"

}

}

}
```

Add to `.cursor/mcp.json` in your project root:

```

{

"mcpServers": {

"graph8": {

"url": "https://be.graph8.com/mcp/"

}

}

}
```

Add to your Windsurf MCP config:

```

{

"mcpServers": {

"graph8": {

"url": "https://be.graph8.com/mcp/"

}

}

}
```

- Go to Settings > Apps > Developer Mode 
- Add MCP server and paste: `https://be.graph8.com/mcp/` 
- Authorize via OAuth     

## Setup Guides 
Pick your client. Every guide covers both remote OAuth and local stdio variants. 

Cursor  

Cursor IDE with remote OAuth or local stdio. Open guide   
Claude Desktop  

Anthropic’s desktop app with personal or org API key. Open guide   
Claude Code  

Anthropic’s terminal agent via `~/.claude/mcp.json`. Open guide   
VS Code  

Native MCP via `.vscode/mcp.json` for Copilot Agent Mode. Open guide   
n8n  

Workflow automation via the MCP node or HTTP request. Open guide   
LangChain  

`langchain-mcp-adapters` + LangGraph for Python agents. Open guide   
LlamaIndex  

`llama-index-tools-mcp` for typed Python agents. Open guide   
CrewAI  

`MCPServerAdapter` for multi-agent crews. Open guide   
Pydantic AI  

Typed agent outputs with `MCPServerHTTP` and `MCPServerStdio`. Open guide   
OpenAI Agents SDK  

Native MCP via `MCPServerStreamableHttp`. Open guide   
End-to-end examples  

Worked workflows chaining MCP tools. Open guide   
What You Can Ask  

Free-form prompt patterns and supported workflows. Open guide   

### Local (stdio) 
If you prefer running the server locally (or your client doesn’t support remote MCP), use the stdio transport. This requires Python 3.10+ and an API key. 
Replace `<your-api-key>` with:  
- your personal API key from Profile -> Developer (recommended for end users), or 
- an org API key from Settings -> API (admin/shared integrations).   

-   Developer Mode  
-   GTM Mode  
-   All Mode     

For developers in Cursor, Windsurf, or Claude Code:

```

{

"mcpServers": {

"graph8": {

"command": "uvx",

"args": ["g8-mcp-server"],

"env": {

"G8_API_KEY": "<your-api-key>",

"G8_MCP_MODE": "dev"

}

}

}

}
```

For campaign managers in Claude Desktop:

```

{

"mcpServers": {

"graph8": {

"command": "uvx",

"args": ["g8-mcp-server"],

"env": {

"G8_API_KEY": "<your-api-key>",

"G8_MCP_MODE": "gtm"

}

}

}

}
```

Loads every tool (developer + GTM + voice + workflow + skill authoring):

```

{

"mcpServers": {

"graph8": {

"command": "uvx",

"args": ["g8-mcp-server"],

"env": {

"G8_API_KEY": "<your-api-key>",

"G8_MCP_MODE": "all"

}

}

}

}
```

`uvx` runs the server directly from PyPI without installing it. If you’d rather install permanently, use `pip install g8-mcp-server` — that ships both the MCP server and the `g8` CLI. 

#### Environment Variables (local only) 
| Variable | Required | Default | Description
| `G8_API_KEY` | Yes | — | Your personal API key (Profile) or org API key (Settings -> API) (details)
| `G8_MCP_MODE` | No | `all` | Tool set to load: `dev`, `gtm`, or `all`
| `G8_API_URL` | No | `https://be.graph8.com` | API base URL (for self-hosted or staging) 

## Modes 
The `G8_MCP_MODE` variable controls which tools are loaded. This applies to local (stdio) connections only — remote connections load all tools. 
| Mode | Tools | Best for
| `dev` | 32 | Developers building graph8 into product code in Cursor / Windsurf / Claude Code (repo scan, install snippets, generate forms, CRM operations)
| `gtm` | 51 | Campaign managers and marketing ops in Claude Desktop (campaigns, mailbox warmup, pipelines, ICPs, personas, CRM operations)
| `all` | 114 | Maximum capability: dev + GTM + voice/dialer + workflow builder + skill authoring (default for remote OAuth) 
Counts include the `g8_gtm_` / `g8_voice_` / `g8_workflow_` prefixed registrations used to avoid name collisions in `all` mode. Skill authoring tools are dual-registered under both `g8_skill_*` and `g8_workflow_skill_*` names, so the underlying handler count is ~100 distinct operations. 

### Progressive tool discovery 
The remote MCP endpoint advertises only ~31 always-on tools at connect time, plus the `g8_tool_search` meta-tool. The other 80+ tools (voice, workflows, skills, pipelines, quotes, intent, custom fields, etc.) are loaded on demand — when an agent calls `g8_tool_search(query="workflow")`, matching tools become visible on the next `tools/list` fetch via the standard `notifications/tools/list_changed` event. 
This keeps the steady-state context budget low while still giving agents access to the full 100+ tool surface when they need it. 

### Tool-set scoping on the remote URL (coming soon) 
Today the remote OAuth endpoint `https://be.graph8.com/mcp/` loads every tool your role grants, with `g8_tool_search` for discovery. Per-mode endpoints are on the roadmap so different clients can pull only the tools they need:  
- `https://be.graph8.com/mcp/?mode=dev` - load the 32 developer tools only 
- `https://be.graph8.com/mcp/?mode=gtm` - load the 51 GTM tools only 
- `https://be.graph8.com/mcp/?groups=audience-sync,inbox` - load specific tool groups  
This is roadmap, not shipped. Use `G8_MCP_MODE` on stdio in the meantime. 

## Available Tools 
For the complete per-tool reference (parameters, return shapes, JSON examples, danger warnings), see MCP Tool Reference. The tables below are a quick index by category. 

### Shared platform tools (all modes) 
Available in every mode — core CRM, prospecting, sequences, inbox, intent, sync, meetings, quotes, and custom fields. 

#### Contacts, lookup, search — 8 tools 
| Tool | Description
| `g8_search_contacts` | Search contacts already in your CRM
| `g8_search_companies` | Search companies already in your CRM
| `g8_lookup_person` | Enrich a single person via the graph8 index (email / LinkedIn / name+domain)
| `g8_lookup_company` | Enrich a single company via the graph8 index (domain / name)
| `g8_find_contacts` | Search graph8’s 700M+ contact index for new prospects
| `g8_find_companies` | Search graph8’s 100M+ company index for new accounts
| `g8_create_contact` | Create a contact in your CRM
| `g8_enrich_contacts` | Run third-party waterfall enrichment on saved contacts; optional `providers[]` + `email_verification` overrides (charges credits) 

#### Contact graph (read) — 5 tools 
| Tool | Description
| `g8_get_contact_detail` | Full enriched details for a single contact
| `g8_get_contact_company` | Company record associated with a contact
| `g8_get_contact_deals` | Deals linked to a contact
| `g8_get_contact_activity` | Activity history for a contact
| `g8_get_company_contacts` | All contacts at a company 

#### Lists — 3 tools 
| Tool | Description
| `g8_get_lists` | List contact and company lists
| `g8_create_list` | Create a list (empty, from CRM contacts, explicit rows, or open-data search)
| `g8_add_to_list` | Add contacts to an existing list 

#### Custom fields — 4 tools 
| Tool | Description
| `g8_list_fields` | List field definitions (base + custom columns)
| `g8_create_field` | Create a custom column on contacts or companies. STRONGLY RECOMMENDED to pass `enrichment_providers` (+ optional `enrichment_email_verification`) in the same call when the column will hold enriched data — otherwise the UI Enrich button and `g8_enrich_contacts` will fail with `422 waterfall_config_missing`
| `g8_set_field_value` | Set a custom column value on a single record
| `g8_delete_field` | Soft-delete a custom column 

#### Deals — 7 tools 
| Tool | Description
| `g8_get_deals` | List deals with stage / pipeline / text filters
| `g8_get_deal` | Get a single deal
| `g8_get_pipeline` | List deal pipelines and stages
| `g8_create_deal` | Create a new deal
| `g8_update_deal` | Update a deal (partial; usually stage change)
| `g8_delete_deal` | Delete a deal
| `g8_get_company_deals` | All deals for a company 

#### Tasks — 5 tools 
| Tool | Description
| `g8_get_tasks` | List tasks with status / priority / assignee / search filters
| `g8_get_task` | Read a single task by ID
| `g8_create_task` | Create a task linked to a contact
| `g8_update_task` | Update a task (partial)
| `g8_delete_task` | Delete a task 

#### Notes — 4 tools 
| Tool | Description
| `g8_list_notes` | List notes on a contact
| `g8_create_note` | Add a note to a contact
| `g8_update_note` | Update a note
| `g8_delete_note` | Delete a note 

#### Enrichment jobs — 1 tool 
| Tool | Description
| `g8_get_enrichment_job` | Status + results of an async enrichment job 

#### Sequences — 9 tools 
Full lifecycle control over outreach sequences. 
| Tool | Description
| `g8_list_sequences` | List outbound sequences
| `g8_add_to_sequence` | Enroll contacts in a sequence (real sends)
| `g8_get_sequence_preview` | Preview steps and channels before launching
| `g8_get_sequence_analytics` | Performance metrics (reply rate, completion, engagement)
| `g8_create_sequence` | Create a new sequence with steps, channels, schedule
| `g8_update_sequence` | Update sequence name, description, or flags
| `g8_update_sequence_step` | Update a single step (template, timing, channel)
| `g8_pause_sequence` | Pause a live sequence
| `g8_resume_sequence` | Resume a paused sequence
| `g8_delete_sequence` | Archive a sequence (soft delete) 

#### Inbox & replies — 6 tools 
| Tool | Description
| `g8_list_inbox` | List reply threads filterable by channel, sequence, status, assignee, or tag
| `g8_get_reply` | Get a single reply thread with full message history
| `g8_get_reply_draft` | Get the auto-generated draft reply (charges credits when generated)
| `g8_send_reply` | Send a reply via email, SMS, or LinkedIn
| `g8_assign_reply` | Assign a reply thread to a team member
| `g8_tag_reply` | Tag a reply thread for categorization 

#### Activity stream — 3 tools 
| Tool | Description
| `g8_get_activities` | Org-wide activity records (opens, clicks, form fills, etc.)
| `g8_get_activity_summary` | Aggregated activity summary
| `g8_get_contact_activity` | Activity history for one contact 

#### Intent & signals — 15 tools 
| Tool | Description
| `g8_intent_list_keywords` | List tracked keywords
| `g8_intent_add_keywords` | Bulk-add plain keyword phrases (web-UI Add keywords parity)
| `g8_intent_search_pages` | Search website pages by URL or keyword
| `g8_intent_domain_search` | Search visitor activity on a specific domain
| `g8_intent_search_url_companies` | Find companies whose users visited a URL
| `g8_intent_keyword_companies` | Companies showing interest in a keyword
| `g8_intent_keyword_contacts` | Contacts showing interest in a keyword
| `g8_intent_keyword_urls` | URLs associated with a keyword
| `g8_intent_pages_contacts` | Contacts who visited a specific page
| `g8_intent_pages_visitor_counts` | Visitor count aggregates by page
| `g8_intent_page_visitors` | Visitor records for a specific page
| `g8_intent_stats` | Org-level intent stats
| `g8_intent_create_from_domain` | Create a keyword group from a domain
| `g8_intent_update_keyword_filters` | Update keyword tracking rules
| `g8_intent_delete_keyword` | Stop tracking a keyword 

#### Sync — 14 tools 
Push audiences to ad platforms, sync contacts to CRMs, monitor sync health. 
| Tool | Description
| `g8_list_crm_syncs` | List connected CRM integrations (HubSpot, Salesforce, Pipedrive, Zoho, SugarCRM)
| `g8_get_crm_status` | CRM connection health and rate limits
| `g8_get_crm_fields` | Discover available field mappings
| `g8_push_to_crm_contact` | Push contacts to a CRM (may charge per integration)
| `g8_push_to_crm_company` | Push companies to a CRM (may charge per integration)
| `g8_push_to_crm_list` | Push list memberships to a CRM
| `g8_list_audience_syncs` | List configured audience syncs
| `g8_get_audience_sync` | Get one sync’s config
| `g8_create_audience_sync` | Create a sync to Meta / LinkedIn / Google / X / CRM
| `g8_update_audience_sync` | Update cadence, mode, or suppression lists
| `g8_delete_audience_sync` | Remove a sync config
| `g8_trigger_audience_sync` | Manually trigger a sync run
| `g8_get_audience_sync_runs` | Sync run history with record counts
| `g8_get_audience_sync_errors` | Error logs for failed sync runs 

#### Meetings — 2 tools 
| Tool | Description
| `g8_list_meetings` | List meetings with optional filters
| `g8_get_meeting` | Full meeting details (transcript, attendees, recording link) 

#### Quotes (quote-to-cash) — 12 tools 
| Tool | Description
| `g8_list_quotes` | List quotes with optional filters
| `g8_get_quote` | Quote details (line items, values, recipient, status)
| `g8_create_quote` | Create a new quote from line items
| `g8_update_quote` | Update a draft quote
| `g8_duplicate_quote` | Duplicate an existing quote
| `g8_edit_quote_as_draft` | Convert signed/sent quote back to editable draft
| `g8_send_quote` | Send a quote via email (with signature + payment link)
| `g8_delete_quote` | Delete a draft quote
| `g8_list_quotable_products` | List products available for line items
| `g8_get_quote_settings` | Org-level quote settings
| `g8_get_company_quotes` | All quotes for a company
| `g8_get_contact_quotes` | All quotes for a contact 

#### Discovery + playbooks — 3 tools 
| Tool | Description
| `g8_tool_search` | Search the full tool catalog and activate matching tools for this session
| `g8_list_playbooks` | List available graph8 playbooks (workflow guides)
| `g8_load_playbook` | Load a playbook’s full markdown content 

### Developer tools (`dev` mode) — 11 tools 
Repo-scoped tools for building graph8 into your codebase. 
| Tool | Description
| `g8_connect_repo` | Connect a GitHub/GitLab repo to graph8
| `g8_scan_repo` | Record scan results you produced by reading the code (graph8 does not scan server-side)
| `g8_get_scan_results` | Get scan results (frameworks, pages, components)
| `g8_status` | Check repo integration status
| `g8_doctor` | Report the graph8-side state of a repo: connection, write key, scan, patch set
| `g8_install_spine` | Generate tracking installation plan
| `g8_apply_install` | Apply the tracking installation
| `g8_list_campaigns` | List campaigns for a repo
| `g8_get_campaign` | Get campaign details
| `g8_get_tracking_snippet` | Get framework-specific tracking snippet (p.js)
| `g8_search_kb` | Search knowledge base articles 
In `dev` mode `g8_get_tracking_snippet` and `g8_get_form_template` are also registered for use with the installation flow. 

### GTM tools (`gtm` mode) — 30 tools 
Campaign builder, Studio, mailbox, and audience operations. 

#### Campaigns — 17 tools 
| Tool | Description
| `g8_list_campaigns` | List campaigns in your org
| `g8_get_campaign` | Campaign details (summary or full)
| `g8_create_campaign` | Create a new campaign
| `g8_update_campaign` | Update campaign metadata
| `g8_patch_campaign_full` | Update full campaign state in one call
| `g8_launch_campaign` | Launch a campaign (sends real outreach)
| `g8_get_campaign_ideas` | AI-generated campaign ideas from org context
| `g8_get_campaign_metrics` | Open / click / reply / meeting metrics
| `g8_attach_audience` | Attach an audience (list) to a campaign
| `g8_list_campaign_documents` | List documents (copy, images, landing pages)
| `g8_get_campaign_document` | Get document content
| `g8_create_campaign_document` | Create a new document
| `g8_update_campaign_document` | Update document content
| `g8_delete_campaign_document` | Delete a document
| `g8_get_ad_images` | List ad image creatives
| `g8_hide_ad_image` | Hide an ad creative from the grid
| `g8_get_campaign_sequence` | Get sequence attached to a campaign 

#### Campaign sequence steps — 4 tools 
| Tool | Description
| `g8_update_campaign_sequence` | Update the sequence on a campaign
| `g8_create_campaign_step` | Add a step
| `g8_update_campaign_step` | Update a step
| `g8_delete_campaign_step` | Delete a step 

#### Studio context — 5 tools 
| Tool | Description
| `g8_get_global_context` | Org-level Studio documents (brand, value props, messaging)
| `g8_get_icps` | ICP definitions
| `g8_get_personas` | Buyer persona definitions
| `g8_list_intelligence_data` | Intelligence data (scrapes, enrichment, competitor research)
| `g8_list_research_reports` | AI research reports (buyer psychology, GTM channel analysis) 

#### Mailbox & KB — 4 tools 
| Tool | Description
| `g8_list_mailboxes` | Warmup-enabled mailboxes
| `g8_get_mailbox_warmup` | Warmup status + analytics
| `g8_list_kb_documents` | Knowledge Base documents
| `g8_search_kb` | Search the Knowledge Base 

#### Pipelines (stage checklist v2) — 12 tools 
`gtm` mode unprefixed; `all` mode prefixed as `g8_gtm_*`. 
| Tool | Description
| `g8_list_pipelines` | List deal pipelines with stages + evidence + channel scripts
| `g8_get_pipeline` | Get a pipeline by ID
| `g8_list_stage_evidence_library` | Get the 8 canonical evidence keys
| `g8_create_pipeline` | Create a new pipeline (default or blank)
| `g8_update_pipeline` | Update pipeline metadata
| `g8_create_stage` | Add a stage with evidence + scripts
| `g8_update_stage` | Update a stage
| `g8_reorder_stages` | Reorder stages
| `g8_delete_pipeline` | Delete a pipeline (when no deals exist)
| `g8_delete_stage` | Delete a stage
| `g8_suggest_pipeline_from_context` | AI-suggested pipeline from org context
| `g8_create_pipeline_from_suggestion` | Create pipeline from AI suggestion 

### `all` mode adds — voice, workflows, skills 
Available only in `all` mode (the default for remote OAuth). 

#### Voice & dialer — 13 tools (`g8_voice_*`) 
| Tool | Description
| `g8_voice_list_dialer_sessions` | List parallel dialer sessions (status, SDR, campaign, metrics)
| `g8_voice_get_dialer_stats` | Aggregated dialer analytics (dials, connection rate, talk time)
| `g8_voice_list_numbers` | Phone numbers the org owns
| `g8_voice_list_agents` | Available voice agents
| `g8_voice_list_missed_callbacks` | Missed inbound callbacks / voicemails
| `g8_voice_list_calls_for_contact` | Call history for a contact
| `g8_voice_list_calls_for_sdr` | Call history for an SDR
| `g8_voice_get_call_transcript` | Transcript of a recorded call
| `g8_voice_get_call_grading` | AI grading + talk-track feedback
| `g8_voice_create_dialer_session` | Create a paused dialer session (SDR opens UI to dial)
| `g8_voice_pause_session` | Pause a dialer session
| `g8_voice_resume_session` | Resume a session and dial next batch (real calls)
| `g8_voice_stop_session` | Stop a session permanently 

`` 

#### Workflow builder — 25 tools (`g8_workflow_*`) 
| Tool | Description
| `g8_workflow_list` | List workflows
| `g8_workflow_get` | Full workflow definition (nodes, connections, trigger, execution state)
| `g8_workflow_create` | Create a new workflow
| `g8_workflow_update` | Update workflow metadata
| `g8_workflow_delete` | Delete a workflow
| `g8_workflow_add_node` | Add a node (Action, Delay, Branch, Agent, Skill, Loop)
| `g8_workflow_update_node` | Update a node’s configuration
| `g8_workflow_remove_node` | Remove a node
| `g8_workflow_connect_nodes` | Add an edge between two nodes
| `g8_workflow_list_node_types` | Available node types with schemas
| `g8_workflow_describe_node_type` | Detailed schema for a node type
| `g8_workflow_describe_form_fields` | Form-field schema for the config UI
| `g8_workflow_validate` | Validate a workflow (orphans, dangling connections, required fields)
| `g8_workflow_execute` | Execute immediately with trigger payload
| `g8_workflow_get_execution` | Status + output of an execution
| `g8_workflow_pause_execution` | Pause an in-flight execution
| `g8_workflow_resume_execution` | Resume a paused execution
| `g8_workflow_stop_execution` | Stop an execution (terminal)
| `g8_workflow_get_trigger_status` | Status of external trigger
| `g8_workflow_reset_trigger_cursor` | Reset trigger cursor (event-stream triggers)
| `g8_workflow_list_slack_users` | Slack workspace users
| `g8_workflow_list_slack_channels` | Slack workspace channels
| `g8_workflow_list_roam_users` | Roam (Copilot chat) users
| `g8_workflow_list_roam_groups` | Roam (Copilot chat) groups
| `g8_workflow_list_mcp_servers` | Available MCP servers (for Agent nodes)
| `g8_workflow_list_dispositions` | Available call dispositions (voice nodes) 

#### Skill authoring — 14 tools (`g8_skill_*` + `g8_workflow_skill_*` alias) 
Each skill tool is registered under two names that point at the same handler — pick whichever matches the calling context (canonical `g8_skill_*` or workflow-namespaced `g8_workflow_skill_*`). 
| Tool | Description
| `g8_skill_list` | List skills (LLM/API building blocks)
| `g8_skill_get` | Full skill definition (type, prompt/code, model, schemas)
| `g8_skill_create_llm` | Create an LLM skill (prompt template + model)
| `g8_skill_create_api` | Create an API skill (HTTP request config)
| `g8_skill_create_from_template` | Create a skill from a built-in template
| `g8_skill_create_from_node` | Lift a workflow node into a reusable skill
| `g8_skill_update_llm` | Update an LLM skill
| `g8_skill_update_api` | Update an API skill
| `g8_skill_delete` | Delete a skill
| `g8_skill_execute` | Execute a skill immediately (test / preview)
| `g8_skill_validate_template` | Validate a skill template
| `g8_skill_list_templates` | List available templates
| `g8_skill_list_models` | List available LLM models
| `g8_skill_extract_variables` | Extract `{variable}` placeholders from a prompt 

## Tracking Snippet — Server-Side vs Client-Side 
The graph8 tracking snippet (`p.js`) works differently depending on whether your framework renders on the server or the client. Understanding this is critical for correct installation. 

### Server-Side Rendered (SSR) 
Frameworks: Next.js, WordPress, Shopify, Webflow, HTML 
The snippet is included in the server-rendered HTML layout (e.g., `app/layout.tsx`, `theme.liquid`, `functions.php`). It loads on every page from the first paint — no hydration delay. 

```

// SSR — snippet is always available, call directly

g8.identify("user-123", { email: "[email protected]" });

g8.track("page_view", { page: "/pricing" });
```

### Client-Side Rendered (CSR) 
Frameworks: React, Vue 
The snippet is injected via `useEffect` (React) or `onMounted` (Vue) after hydration. The script may not be ready immediately — use optional chaining to safely call tracking methods. 

```

// CSR — use optional chaining since g8 loads after hydration

window.g8?.identify("user-123", { email: "[email protected]" });

window.g8?.track("button_click", { button: "signup" });
```

### Privacy Options 
Add these data-attributes to the script tag to control privacy behavior: 
| Attribute | Values | Description
| `data-privacy-dont-send` | `"true"` | Disables cookies and event sending
| `data-privacy-user-ids` | `"true"` | Disables storing user identifiers
| `data-privacy-ip-policy` | `"keep"`, `"stripLastOctet"`, `"remove"` | Controls IP address handling
| `data-init-only` | `"true"` | Initializes the script without sending a page event 

### Verification 
After installing the snippet, verify it’s working:  
- Open browser DevTools -> Network tab 
- Look for requests to your tracking host (`/p.js`) 
- In Console: `window.g8` should be defined 
- Call `g8.track('test_event')` — you should see a network request  

## Resources 
MCP resources provide read-only context that agents can include in prompts. 
| Resource URI | Description
| `g8://repos` | List of connected repositories
| `g8://repos/{repo_id}/scan` | Scan results for a repo
| `g8://repos/{repo_id}/kb` | Knowledge base documents for a repo
| `g8://repos/{repo_id}/kb/{doc_id}` | Single KB document content
| `g8://repos/{repo_id}/campaigns` | Campaigns for a repo
| `g8://repos/{repo_id}/campaigns/{campaign_id}/brief` | Campaign brief
| `g8://contacts` | Contact list summary
| `g8://companies` | Company list summary 

## Prompt Templates 
Pre-built prompts for common workflows. 
| Prompt | Arguments | Description
| `gtm_setup` | `repo_url` | Full setup workflow: connect, scan, install, launch
| `campaign_review` | `campaign_id` | Review and optimize a campaign
| `icp_refinement` | `feedback` | Refine ideal customer profile based on feedback 

## Getting Started 
A typical developer workflow with the MCP server:  
- Configure — Add the remote config to your AI client (no install needed) 
- Connect — Ask your agent to connect your repo: “Connect my repo github.com/org/app” 
- Scan — The agent scans your codebase for frameworks and integration points 
- Install snippet — “Install the graph8 tracking snippet for Next.js” 
- Configure tracking — Add `g8.identify()` on login and `g8.track()` on key actions 
- Add forms — “Generate an embedded progressive form for React” 
- Launch campaigns — “Create a campaign targeting trial users”  
For agents using progressive discovery: call `g8_tool_search(query="<topic>")` whenever the right tool isn’t visible in the current `tools/list`. The matching tools become available on the next request. 

## Need help?  
- MCP FAQ - common errors, auth, multi-org, security, rate limits 
- MCP Tool Reference - per-tool parameters and examples 
- End-to-end examples - worked workflows you can copy 
- Interactive Swagger docs - same surface, exposed as REST 
- Pricing - free tier and credit costs
