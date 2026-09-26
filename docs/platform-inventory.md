# graph8 Platform Inventory (partial — in progress)

Generated for graph8 hackathon (Lahore, 26-27 Sep 2026). Read-only walkthrough of app.graph8.com.

## 1. Summary
(draft) graph8 is an all-in-one AI-driven sales/GTM platform: combines a CRM-like "Work" inbox (Slack-style channels + unified inbox), prospecting/data tools (Signals, company/contact search), content creation (Studio), revenue/deal tracking (Revenue), outreach automation (Engage — sequences, dialer, LinkedIn), and AI "Agents" (Chief of Staff and others) that run tasks autonomously. Onboarding uses a gamified "Kickoff" checklist (0 of 37) and a "0/9 steps" setup widget. New account currently near-empty (demo/seed data minimal).

## 2. Top nav observed
Data | Signals | Studio | Revenue | Engage | Agents | Work (active, showing Inbox) — plus top-right icons: search (CRM search, cmd+K), sparkle/copilot icon, phone/dialer, tasks (checklist icon), analytics chart, marketplace (store icon), chat bubble (2 icons), notifications, user menu.

Left rail inside Work: Inbox, Kickoff (0 of 37), Channels (campaigns, customers, hot, onboarding[1 unread], pipeline, wins, work; "Browse channels (7)"), Direct Messages (none yet), Chat ("Welcome to graph8" pinned chat), External connections, Connectors. Bottom-left floating widget: "0/9 steps" onboarding progress.

Inbox currently has 1 item: message from "Chief of Staff" agent in #onboarding channel, Sep 26 4:28PM: "Hi — I'm going to get your first campaign built, ..." (not opened/replied per read-only rule).

## 3. Per-section detail
(filling in as visited)

### Work
| Sub-page | URL | What it does | Data present | Key actions | API tag(s) |
|---|---|---|---|---|---|
| Inbox | /work | Unified message inbox across channels/DMs, filter "All" | 1 unread (Chief of Staff agent msg) | reply, filter dropdown | Inbox, AI Inbox |

### Data
| Sub-page | URL | What it does | Data present | Key actions | API tag(s) |
|---|---|---|---|---|---|
| Search | /search | ICP prospect search builder: filters by job title, employees, industries, person/company details, location, intent search, max results (up to 50000) | Empty (no filters set, no results run) | Add ICP filter, run search, "Add results to list" | Search, Enrichment |
| Lists | /lists | Create/manage saved contact & company lists; tabs: Lists, Performance, Suppressions, All records, Table | 0 lists | Create List | Lists |
| Contacts | /contacts | CRM contact database (name, company, job title, owner, email, phone, city, country) | 0 contacts | Add Contact, Add Column, filters, saved filters | Contacts |
| Companies | /companies | CRM company records (website, domain, industry, owner, employee count, revenue, location) | 0 companies | Add Company, filters | Companies |
| Workbench | /enrichment/staging | "Import, enrich, and export your data" — spreadsheet-like data processing benches | 0 workbenches | New Workbench | Workbench (implied), Enrichment |
| Data Pipelines | /connections | CDP-style pipeline builder; tabs: Overview, Connections, Credentials, Sites, Destinations, Connectors, Syncs, Functions, Live Events, Tailor. Destinations list shows Identify, Warehouse, Chat, Form Tracker, Forms Sync Trigger, Campaign Visitor Trigger | Empty — "Create your first connector" | Add site, Create connector, Add destination | Provider Domains, Integrations, Webhooks |

### Signals
| Sub-page | URL | What it does | Data present | Key actions | API tag(s) |
|---|---|---|---|---|---|
| Visitors | /visitors | Website visitor tracking, de-anonymized to contacts/companies; sub-tabs Contacts, Companies, Chat, Campaigns, Ads, Links; filters by stream/browser/UTM | 0 contacts/companies found | Group by contact toggle, filters | Visitors, Web Analytics |
| Forms | /forms | Embedded lead-capture forms tracker; statuses All/Needs setup/Live/Failing/Ignored | 0 forms | Install tracker | Forms |
| Hiring | /signals/jobs (renders at /signals/hiring) | "Hiring Wave" — tracks companies hiring for your ICP via saved keyword+filter "listeners"; claims daily resolver surfaces hiring companies + decision-makers, auto-syncs new contacts into campaign audience | 0 listeners, 0 results | New Hiring Wave, "Auto-seed from studio docs", Create manually; also has "Talent Moves" tab | Intent (likely) |
| Intent | /keywords | Keyword-based intent tracking list (keyword, matched contacts, companies, sync status) | 0 keywords | Add Keyword, Save List | Intent |
| Radar | /signals/radar | Competitive intelligence: add competitor domain, Radar reads their pages/ads/LinkedIn activity; scans are manual (press Scan, credit cost shown first) | 0 competitors tracked | Track competitor | Radar, Radar Reports |
| SEO | /signals/seo | SEO suite: Overview, Keyword Research, Rank Tracking, Site Audit, AI Visibility (how AI answer engines describe you); domain analysis is credit-metered | No domain analyzed yet | Analyze any domain | SEO |
| Social | /signals/social-listener | Social listening via "graph8's shared X API" (50,000 reads/month quota shown); tabs Brand, Competitors, Keywords, Engagement, Lists; channels: X, LinkedIn, Reddit, Instagram, YouTube; can auto-seed listeners from Studio docs (brand brief, competitor discovery, keyword docs, ICP research) — 1 brand + up to 8 competitor + up to 50 keyword + 2-3 engagement listeners, credit-metered one-time setup | 0 listeners, no brand listener | Create brand listener, Auto-seed from studio docs | Social |

### Studio
| Sub-page | URL | What it does | Data present | Key actions | API tag(s) |
|---|---|---|---|---|---|
| Global (wiki) | /studio?mode=global | "Studio Wiki" — auto-generated knowledge base of company/market docs, grouped in 4 workflows: Intelligence (10/13 done), Context (0/21), Research (0/6), Targeting (0/3), 43 docs total. Docs seen: Competitor Discovery, Buyer Psychology & Decision Factors, Competitive Intelligence Teardown, GTM Channel Intelligence, Industry Analyst & Media Intelligence, Review & Sentiment Intelligence, Voice of Customer Intelligence, Audience Questions, Brand News, Brand Sentiment, Company Enrichment, Organic Keywords... | LIVE — 10/43 docs already generated (marked "Done", updated 3-5 min before observation), rest "Not Started". This is the Chief of Staff agent actively researching in the background right now. | Sources tab, Explorer tab, re-run generation | Knowledge, Knowledge Base, Knowledge Ontology, Company Intelligence, Research |
| Campaign | /studio?mode=campaign | Campaign idea generator — gated: "Prerequisites Required — complete the following workflows before generating campaign ideas": Intelligence, Context, Research, Personas, ICPs (0 of 5 complete) | Locked/empty | "Go to Intelligence" | Campaigns, Campaign Workflows |
| Content | /studio?mode=content | Content/brand engine; sub-tabs Calendar, Brand Kit, Assets, Landing Pages, Ads, LinkedIn, Surveys. Brand Kit auto-extracted from company's live site (8x.social): homepage sections (10 found), colors (6 swatches with names e.g. Accent #0021CC), typography (Barlow heading / Inter body), "Re-extract"/"Re-capture" actions | Brand Kit populated (real extraction from 8x.social, dated 9/26/2026); Section library, Images, Templates all at 0 | Re-extract site, Scan images | Brand Kit, Content, Landing Pages, Ad Campaigns, Ad Creatives, LinkedIn, Surveys |
| Team | /studio?mode=team | "Team profiles and thought leadership" (not opened in detail — time-boxed) | unknown (unverified) | — | Team members |

### Revenue
| Sub-page | URL | What it does | Data present | Key actions | API tag(s) |
|---|---|---|---|---|---|
| My Desk | (Revenue > Work) | "Prioritized revenue work and next actions" | not opened (unverified) | — | Desk |
| Leaderboard | (Revenue > Work) | "Team performance and live activity" | not opened (unverified) | — | SDR Analytics, Dialer Analytics |
| Deals (pipeline) | /deals/pipeline | Deal pipeline kanban/list, deal management, filter by owner/close date | "No deals yet" | New Deal, Create Deal, Add Column, Actions, Filter, List/Kanban toggle | Deals |
| Deals > Companies | (Revenue > Sell > Deals > Companies) | Company/account records (same data as Data > Companies) | 0 | — | Companies |
| Deals > Contacts | (Revenue > Sell > Deals > Contacts) | People records | 0 | — | Contacts |
| Quotes | (Revenue > Sell > Quotes) | "Create and send quotes to prospects" | not opened (unverified) | — | Quotes, Quote Templates, Quote Settings, Quote Billing Contact, Quote Contacts, E-Sign, Signatures |
| Product Analytics | (Revenue > Sell) | "Stripe products, subscriptions, and revenue" — Stripe integration for billing/revenue analytics | not opened (unverified) | — | Revenue Analytics, Manual Products, Quotable Products |

### Engage
| Sub-page | URL | What it does | Data present | Key actions | API tag(s) |
|---|---|---|---|---|---|
| Sequencer | /sequencer | Multi-step outbound sequence builder; tabs Personal/Team/Archived Sequences, Dashboard, Settings | "No sequences yet" | Create Sequence | Sequences, Sequence Lifecycle, Sequence Jobs |
| Appointments | (Engage) | "Schedule and manage appointments" | not opened (unverified) | — | Appointments, Calendar Invites |
| Dialer | (Engage) | "Power dialer for outbound calls" | not opened (unverified) | — | Dialer, Dialer Analytics, Voice, Phone Numbers |
| AI Inbox | (Engage) | "Manage conversations in one place" — same underlying inbox concept as Work inbox | not opened (unverified) | — | AI Inbox, Inbox |
| Newsletter | (Engage) | "Create and send newsletters to subscribers" | not opened (unverified) | — | Newsletter |
| Nurture | (Engage) | "Engage consented audiences at scale" — likely compliance-aware bulk nurture/drip | not opened (unverified) | — | Nurtures |
| Web Chat | (Engage) | "Engage visitors with live chat" — website chat widget | not opened (unverified) | — | Web Chat |

### Agents
| Sub-page | URL | What it does | Data present | Key actions | API tag(s) |
|---|---|---|---|---|---|
| AI Agents / Operator bench | /agents | Central roster of specialist AI agents ("operators") that run parts of the business. "Operator bench — 0 operators on watch across your org", "All clear, no changes in last 24h", "System-managed". Each operator has a toggle (Off/On) and "Approvals route to: <role>" | 4 of 5 operators are Off (RevOps/CRM Admin, Lead Ops, Deal Desk, Deliverability); Chief of Staff is "Always on" | Open (per agent), Chat (Chief of Staff), New, Company Knowledge, Collections | Agent, Agents, Skills, Sales Coach |
| Company Knowledge | /agents (tab) | not opened in depth (unverified) | — | — | Knowledge, Company Intelligence |
| Collections | /agents (tab) | not opened in depth (unverified) | — | — | — |

### Top-right tools & Work sub-icons
| Icon | URL | What it does |
|---|---|---|
| Sparkle/Copilot | in-app assistant (bottom-right floating "Open chat" bubble present on every page) | Global AI chat assistant, persistent across pages (labeled "Copilot" in API tags) |
| Phone/Dialer | /phone | Work phone / dialer entry point (not opened in depth) |
| Tasks (checklist icon) | /tasks | Task list (not opened in depth) |
| Analytics (chart icon) | /analytics | Reports/analytics dashboard (not opened in depth) |
| Marketplace (store icon) | /marketplace | App marketplace — 142 operations in API spec under "Marketplace" tag, suggesting a large installable-app ecosystem (not opened in depth) |
| Notifications (bell) | — | Standard notification center |
| Global search | ⌘K | Search CRM (companies, contacts, deals) |

### Developer surface (Settings > Developers)
User menu → "Developers" opens **/developer**, a full interactive API console:
- Live catalog of every graph8 API operation (3247 operations total across 140+ tag groups), browsable by tag, each with a runnable request builder (tabs: curl / TypeScript / CLI / MCP) and live response viewer.
- Base URL: `https://be.graph8.com/api/v1`, auth via `Authorization: Bearer $G8_API_KEY`.
- Relevant tag groups spotted: **Api Keys** (5 ops), **Mcp** (1 op), **Webhooks** (8 ops), **Sandbox** (9 ops), **Service Token** (1 op), **Integrations** (92 ops), **Installed Apps** (4 ops).
- Console has its own nav: Apps, Connect an agent, Recipes, Resources.
- "Your key" — the console states keys are "used for this request only and never stored," implying key creation happens elsewhere (likely a dedicated API Keys settings page — not located within the time limit; user menu "Settings" link did not resolve to a visible settings page during this session — unverified/possible SPA routing issue).
- MCP: confirmed to exist as a first-class concept (nav tab "Connect an agent", API tag "Mcp", and a request-builder tab literally labeled "MCP" alongside curl/TypeScript/CLI) — graph8 appears to expose itself as an MCP server/tool source, not just a REST API. (unverified beyond this — did not get a working example)
- Sandbox mode: "Sandbox" is both an OpenAPI tag (9 ops) and appears in the credentials/connections area — implies test-mode API access exists, separate from production keys. (unverified detail)

## 4. AI/agent features
- **Chief of Staff** — "the front door" agent, always-on, coordinates the "operator bench" and delegates to specialist agents. Runs the onboarding/kickoff conversation, does autonomous research (reads company site + public sources) before asking questions, and is already populating the Studio Wiki (10/43 docs done within minutes of account creation) and Content Brand Kit (extracted colors/fonts/sections from the account's live website) without being asked.
- **Operator bench** (specialist agents, each toggle Off/On, each routes approvals to a named human role):
  - RevOps/CRM Admin — keeps campaign attribution trustworthy and org config (users/roles/connections/billing) correct
  - Lead Ops — "no lead is lost": routing, SLA, intake, follow-up
  - Deal Desk — "the forecast is real": pipeline & deal quality
  - Deliverability — keeps email reaching the inbox
  - All four are Off by default; only Chief of Staff is Always on.
- **Studio Wiki / Company Knowledge** — auto-generated research docs (Intelligence, Context, Research, Targeting workflows) that feed campaign generation; Campaign creation is explicitly gated on 5 of these being complete (Intelligence, Context, Research, Personas, ICPs).
- **Auto-seeding of Signals from Studio docs** — Social Listener and (implied) Hiring Wave can auto-create listeners by reading the Studio brand/competitor/keyword/ICP docs, avoiding manual setup.
- **AI Inbox** — unified conversational inbox across channels (nav item under Engage, and the Work section's own Inbox).
- **Copilot** — persistent floating chat assistant bubble on every screen.
- **Sales Coach** — present as an API tag (37 ops); not located as a nav item in the time available (unverified where it surfaces in UI — likely inside Dialer/Voice call review).
- **AI Visibility** (under Signals > SEO) — reports how AI answer engines (e.g. chatbots) describe your company; a newer SEO-adjacent GEO (generative-engine-optimization) feature.
- No approvals were queued in this account ("No actions awaiting approval" in the onboarding channel's Approvals tab) — the approval/human-in-the-loop mechanism exists but had nothing to show yet.

## 5. Kickoff checklist (0 of 37) — verbatim
Panel title: "Kickoff record — What you tell the kickoff lands here, with where every value came from." 20 of 37 are marked MUST (required). Grouped under 9 categories:

YOUR GOALS: What you want graph8 to do; How you'll measure success
BUSINESS MODEL: What you sell (MUST); How you make money (MUST); Company stage; Team size; Funding
COMPETITION: Competitors (MUST); Where competitors are strong; Market position; What buyers switch from (MUST)
MESSAGING: Value proposition (MUST); What sets you apart (MUST); Proof points; Category
GO-TO-MARKET: Channels (MUST); Sales motion (MUST); Deal size and sales cycle; Pipeline today
YOUR BUYER: Industry (MUST); Role (MUST); Company size (MUST); Seniority; What a win means for them (MUST); Who they want to impress (MUST)
YOUR BUYER'S DAY: Their typical day (MUST); Who they work with; Tools they use (MUST); What they're measured on (MUST); Competing priorities
YOUR BUYER'S PAIN: How they handle it today (MUST); Where that breaks (MUST); What it costs them (MUST); What they've tried; What makes them act now (MUST)
HOW YOUR BUYER BUYS: Proof they need; What a deal looks like

(2+5+4+4+4+6+5+5+2 = 37, matches "0 of 37")

Onboarding is driven by a single agent conversation: "Chief of Staff" posts to #onboarding channel, says it will read the company's site/public sources first, fill in what it can, then ask only what it can't know (mostly about buyers), starting with "what do you want to run — email, LinkedIn, phone, or some combination?"

## 6. Onboarding (0/9 steps) — verbatim
Bottom-left floating widget "Training Guide", 3 groups, 9 total steps:

Navigate graph8 (0/4): Explore the Data section; Explore Studio; Explore Engage; Visit Settings
Get Your Data In (0/3): Import contacts (auto); Create a list (auto); View a company profile
Connect Your Tools (0/2): Connect a CRM (auto); Connect a mailbox (auto)

Each step has a "Go there" deep link and a "Docs" link. Steps marked "auto" presumably auto-complete when detected (e.g. once a CRM is actually connected) rather than needing a manual click.

## 7. Developer surface
See section 3 "Developer surface" above (folded in there since it was discovered via the user-menu "Developers" link rather than a "Settings" page). Summary: no dedicated "Settings" page was successfully located in the 25-minute window (URL guesses `/settings` 404'd, and the user-menu "Settings" click did not visibly navigate — likely a modal or slow client-side route not captured before the session ended). The "Developers" console at `/developer` is the real developer surface: full live API explorer (3247 ops), curl/TypeScript/CLI/MCP request builders, API Keys/Webhooks/Sandbox/MCP/Service Token all present as operation groups. To get a key: not explicitly found — the console implies a key must exist already ("Your key... Create a key if you don't have one") but the create-key UI itself wasn't located in time. (unverified — likely lives in the still-unfound Settings page.)

## 8. Gaps & friction
- **Everything is empty.** 0 contacts, 0 companies, 0 lists, 0 deals, 0 sequences, 0 forms, 0 workbenches, 0 Data Pipeline connectors, 0 Radar competitors, 0 social listeners, 0 keywords tracked. This is a brand-new account with zero demo/seed data — a hackathon team building on this must generate all their own test data live, or seed it programmatically via the API/CSV import.
- **Campaign creation is hard-gated** behind 5 completed Studio workflows (Intelligence, Context, Research, Personas, ICPs) that are themselves mostly "Not Started" (only Intelligence is 10/13 done). A team wanting to demo "build a campaign" fast will hit this wall unless they either wait for the agent to finish research or find a way to skip/mock the prerequisite.
- **Settings/API key page not discoverable in the top-level nav or user menu within a reasonable click count** — real friction for any team wanting to integrate quickly; the only path found was the "Developers" console, and even that didn't show an obvious "generate key" button.
- **Nav is deep and inconsistent**: some sections are single-page (Sequencer), others are multi-level dropdowns with expandable sub-items (Revenue > Deals > Companies/Contacts). Discovering all sub-pages required repeated clicking/hovering — not obvious to a first-time user, and several nav clicks silently no-op'd or required a retry (fragile dropdown interaction).
- **"0 operators on watch" / all specialist agents Off by default** — the flashiest AI feature (autonomous RevOps/Lead Ops/Deal Desk/Deliverability agents) is inert out of the box. A hackathon demo that wants to show "AI running the revenue machine" must explicitly turn these on.
- **Kickoff record shows 0 of 37 answered** even though the Chief of Staff claims it already read the company's site — the agent's own research doesn't appear to auto-fill the kickoff answers in real time (or the UI hadn't refreshed); worth checking after replying to the agent (not done here per read-only rule).
- **Data Pipelines (/connections) is a fully-fledged CDP-like tool** (Sites, Connectors, Destinations, Syncs, Functions, Live Events) but with zero of anything configured — a lot of unused surface area/complexity for a first-time team to parse.
- **Social Listener "shared X API" quota (50,000 reads/month)** is a shared/limited resource across presumably all graph8 tenants or this account — worth checking before building a demo that hammers it.
- Several sub-pages were not opened due to the 25-minute hard limit (My Desk, Leaderboard, Quotes, Product Analytics, Appointments, Dialer, Newsletter, Nurture, Web Chat, Studio > Team, Agents > Company Knowledge/Collections, Phone, Tasks, Analytics, Marketplace) — marked "(unverified)" above; a follow-up pass should cover these.

## 9. Ideas the platform makes easy
- **Signals → Studio → Campaign → Sequencer → AI Inbox → Deals**: Hiring Wave / Radar / Intent signals surface a target company or trigger event; Studio's auto-generated ICP/persona/messaging docs feed campaign copy; Sequencer runs the outbound; replies land in AI Inbox; a won conversation becomes a Deal in the Revenue pipeline. The whole chain is visible in the nav order (Signals, Studio, Revenue, Engage) and looks intentionally designed as one pipeline.
- **Studio Wiki auto-seeding Social Listeners**: the platform explicitly offers to read its own brand/competitor/ICP research docs to auto-configure Social Listener's brand + competitor + keyword + engagement listeners in one click — a clear "chain two AI features together" opportunity for a hackathon demo (show data flowing from research → live monitoring with almost no manual input).
- **Brand Kit auto-extraction from the company's live website** (colors, fonts, section templates) feeds directly into Content > Landing Pages / Ads — a company's own site becomes a design system for outbound assets with zero manual design work.
- **Data > Search (ICP builder) → Add results to List → Sequencer**: prospecting search results can be piped straight into a saved List, which Sequencer/Engage tools can then target — the classic "find prospects → enroll → outreach" loop, all inside one product (no CSV export/import needed between steps).
- **Agents' "Approvals route to: <role>" pattern**: every autonomous operator (RevOps/CRM Admin, Lead Ops, Deal Desk, Deliverability) is pre-wired to route its approval requests to a specific human role (Sales Manager, SDR Manager, Admin) — a ready-made human-in-the-loop governance layer a hackathon team could showcase ("AI runs the machine, but humans stay in control") without having to build approval routing themselves.

---
NOTE: Sections/rows marked "(unverified)" or "not opened in depth" reflect pages not visited within the 25-minute hard time limit, not confirmed absence of features.

---
NOTE: This file is being written incrementally within a 25-minute hard time limit. If cut short, sections above marked TBD reflect not-yet-visited areas, not confirmed absence.
