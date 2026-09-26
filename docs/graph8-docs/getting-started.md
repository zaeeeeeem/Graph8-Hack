<!-- https://docs.graph8.com/developers/getting-started/ -->
# Getting Started

Welcome to the graph8 developer platform. Four ways to integrate - pick the one that fits how you build. 

### Install & Embed 

JavaScript SDK  

25+ modules - tracking, visitor intelligence, AI copilot, webchat, calendar, enrichment. TypeScript. React hooks.
`npm install @graph8/sdk` - Full reference →   
MCP Server  

43 tools for AI agents. Claude.ai, Claude Desktop, Cursor, VS Code, ChatGPT. Just paste the URL.
`https://be.graph8.com/mcp/` - Setup guide →   
Claude CodeClaude DesktopCursorWindsurfVS CodeChatGPT 

### Script & Automate 

CLI  

20+ terminal commands for contacts, prospecting, enrichment, sequences, campaigns. JSON output, scriptable.
`pip install g8-mcp-server` - View commands →   
REST API  

300+ endpoints. Contacts, companies, lists, enrichment, search, sequences, webhooks. Any language.
`https://be.graph8.com/api/v1` - API overview →    

## Which should I use? 
| I’m building… | Use | Why
| A browser app (React, Next.js, Vue) | JavaScript SDK | Typed, SSR-safe, React hooks, widgets
| A server script or backend | REST API or CLI | Direct HTTP or terminal commands
| AI-powered workflows | MCP Server | 43 tools, natural language
| A quick prototype | CLI | Fastest to test, JSON output 

## Authentication 
| Method | For | Where to get it
| Write key | SDK (client-side) | Settings > MCP & API > tracking snippet
| API key | REST API, CLI, SDK (server-side) | Settings > MCP & API > API tab
| OAuth | MCP Server | Automatic - paste URL, sign in 
See Authentication for details.  

## Common Workflows 

### Find and reach new leads 

```

g8.enrich.search(filters)          // or POST /api/v1/search/contacts

→ g8.enrich.person(email)        // or POST /api/v1/enrichment/lookup/person

→ g8.sequences.add(config)       // or POST /api/v1/sequences/{id}/contacts
```

- Search the 700M+ contact / 100M+ company database with filters (SDK | API | CLI) 
- Enrich contacts to fill missing emails/phones (SDK | API | CLI) 
- Sequence to enroll in outreach (SDK | API | CLI)  

### Embed graph8 in your product 

```

g8.init({ writeKey })

g8.visitors.identify()             // Know who's visiting

g8.copilot.open()                  // AI assistant

g8.calendar.show()                 // Booking widget

g8.forms.lookup(email)             // Smart forms
```

All via the JavaScript SDK with a write key. No API key needed. 

### Automate with AI 
Paste `https://be.graph8.com/mcp/` into Claude.ai, Claude Desktop, Cursor, or ChatGPT. Then ask in natural language:  
“Find 10 VPs of Sales at SaaS companies with 50-200 employees, save to a list, and enrich the ones missing emails.”  
See MCP Server and What You Can Ask. 

### Route data to your warehouse 

```

g8.track() → Functions (transform/filter) → BigQuery / Snowflake / Postgres
```

Every event automatically routes to all connected destinations. Add BigQuery in the dashboard - every `g8.track()` call lands there. No extra code.  
- Data Pipeline overview - how events flow 
- Destinations - BigQuery, Snowflake, ClickHouse, Redshift, Postgres, S3, GA4, HubSpot, Amplitude 
- Functions - JavaScript transforms (filter, enrich, PII strip) 
- Live Events - real-time event debugger
