<!-- https://docs.graph8.com/developers/mcp-examples/ -->
# MCP Examples

Concrete agent workflows that chain graph8 MCP tools end to end. Each example shows the problem, the prompt you would send your agent, the tools used, and the expected outcome. Use these as starter prompts for Claude Code, Cursor, Claude Desktop, or any of the framework integrations. 
Claude CodeCursorClaude Desktop 

## Build a list of 50 VP Engineering at Series B SaaS 
Problem. You want to enroll 50 qualified VP Eng prospects at Series B SaaS companies in a new outreach sequence, without leaving your IDE. 
Prompt: 

```

Use graph8 to find 50 VP Engineering at Series B SaaS startups in the US.

Show me the top 25 by signal score and ask me to confirm before saving.

On confirmation, save them to a new list named "Series B SaaS VP Eng".

Then enroll the list in the sequence named "New SaaS Outreach".

Ask me to confirm before enrolling.
```

Tools used:  
- `g8_find_contacts` - preview prospects (free) 
- `g8_build_contact_list` - save the list (charges credits) 
- `g8_list_sequences` - find the target sequence 
- `g8_get_sequence_preview` - confirm steps before enroll 
- `g8_add_to_sequence` - enroll contacts (sends real outreach)  
Expected outcome. A named list with 25 contacts and an enrollment confirmation, ready to begin outreach on the next sequence run. 

## Reply triage in your IDE 
Problem. You start your morning and want to triage inbound replies across email, SMS, and LinkedIn from your terminal. 
Prompt: 

```

Check my graph8 inbox for replies in the last 24 hours.

For each warm reply (interested, asking for more info), pull the full thread,

generate an AI draft reply, and show me the draft before sending.

On approval, send the reply. Tag any reply that mentions pricing with "pricing-q".
```

Tools used:  
- `g8_list_inbox` - list reply threads with filters 
- `g8_get_reply` - get a single thread with full history 
- `g8_get_reply_draft` - AI-generated draft (charges credits) 
- `g8_tag_reply` - tag for categorization 
- `g8_send_reply` - send the reply (sends a real message)  
Expected outcome. All warm replies handled, drafts approved one by one, pricing-related threads tagged for later batch review. 

## Push a list to Meta and LinkedIn ads 
Problem. You have a target-account list and want a matching audience syncing to both Meta and LinkedIn for an ABM campaign. 
Prompt: 

```

List my graph8 contact lists and find the one named "Q1 ABM Targets".

Create an audience sync to Meta Ads using that list, set to daily cadence.

Create another sync to LinkedIn Ads with the same list.

Trigger both syncs now and report the run status.
```

Tools used:  
- `g8_get_lists` - find the source list 
- `g8_create_audience_sync` - create the Meta sync 
- `g8_create_audience_sync` - create the LinkedIn sync 
- `g8_trigger_audience_sync` - run both syncs 
- `g8_get_audience_sync_runs` - check run status  
Expected outcome. Two new audience syncs (one per platform), both with a successful initial run pushing the list to the ad networks. 

## Install graph8 tracking + progressive form on Next.js 
Problem. You want graph8 visitor identification and a progressive email-capture form live on your Next.js pricing page in under 10 minutes. 
Prompt (requires `dev` mode): 

```

Connect this repo to graph8 and scan it.

Once scanning completes, install the graph8 tracking snippet for Next.js

in app/layout.tsx. Then generate an embedded progressive form for the

pricing page and add it to app/pricing/page.tsx. Show me a diff before

applying any edits.
```

Tools used:  
- `g8_connect_repo` - link the GitHub repo 
- Read the code, then `g8_scan_repo` - record the frameworks you found 
- `g8_get_scan_results` - read scan output 
- `g8_get_tracking_snippet` - get the Next.js snippet 
- `g8_get_form_template` - get the progressive form  
Expected outcome. Two edits applied (tracking snippet in layout, form on pricing page), verified by hitting the pricing page in dev and seeing `window.g8` defined plus a network request to `/p.js`. 

## Voice dialer warmup for SDR start of day 
Problem. An SDR wants to start their morning by warming up a parallel dialer session on a fresh prospect list. 
Prompt: 

```

List my graph8 contact lists and find "Today's Dial List".

Find the from-number with the highest connect rate this week.

Pick the voice agent named "Friendly Inbound SDR".

Create a paused dialer session against that list, number, and agent.

Tell me the session ID so I can open the dialer UI to start dialing.
```

Tools used:  
- `g8_get_lists` - find the list 
- `g8_voice_list_numbers` - pick a from-number 
- `g8_voice_list_agents` - pick a voice agent 
- `g8_voice_create_dialer_session` - create paused session (requires confirmation)  
Expected outcome. A dialer session in `paused` state, ready for the SDR to resume from the dialer UI. 

## Full GTM setup walkthrough 
Problem. You just signed up and want to take a fresh repo from zero to live campaign in one prompt. 
Prompt: 

```

Use the graph8 gtm_setup prompt template with repo_url=https://github.com/acme/app.
```

Tools used: The `gtm_setup` template orchestrates the full sequence:  
- `g8_connect_repo` - link the repo 
- Read the code, then `g8_scan_repo` - record the framework and pages you found 
- `g8_install_spine` - generate the tracking install plan 
- `g8_apply_install` - apply the install 
- `g8_create_campaign` - create a campaign 
- `g8_launch_campaign` - launch it (after confirmation)  
Expected outcome. Tracking installed in the repo, a campaign created in graph8, and either a dry-run report or a real launch depending on your confirmation. 

## Where to go next 

MCP Server overview  

Setup, modes, and the full integration matrix. Open   
MCP Tool Reference  

Every tool with parameters, return shapes, and credit costs. Open   
MCP FAQ  

Common errors, multi-org, security, and rate limits. Open   
What You Can Ask  

Free-form prompt patterns for graph8 MCP. Open
