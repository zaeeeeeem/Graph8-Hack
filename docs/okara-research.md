# Okara AI — Research & What We Borrow for graph8

Researched 2026-09-26 for the graph8 hackathon. Goal: borrow Okara's product pattern (AI CMO for marketing) and apply it to sales on graph8.

## 1. What Okara is
- "AI CMO" — an AI Chief Marketing Officer that runs a team of specialized marketing sub-agents.
- Claims 100,000+ users / 120,000+ companies; built by a team of 4; processes ~4B tokens/day (Vercel case study).
- Target: solo founders, small teams, agencies without a marketing function.
- Pricing: free analysis; paid from $129/mo; full suite $249/mo.

## 2. How it works (the flow)
1. **Input = website URL only.** "URL to live agent in under 5 minutes."
2. **Research first.** Reads the site and generates 5 strategy docs:
   `product-information.md`, `marketing-strategy.md`, `competitor-analysis.md`, `brand-voice.md`, `content-strategy.md`.
   Homepage line: *"Every agent reads these five documents before it writes a word."*
   Product Information card shows: Overview, What It Does, Category, Target Customers, Business Model, Key Features, Primary CTA, Tech Signals — plus "Generated today · Sources: 24 pages".
3. **Team of channel agents** (~9): SEO, GEO (AI-search visibility), Writer, Reddit, X, LinkedIn, Hacker News, Influencer, UGC Video, Coding (opens GitHub PRs for SEO fixes).
   *"Everything a marketing team does — drafted from the same documents, so nothing drifts off-message."*
4. **Agents Feed** — one daily queue of opportunities + drafts (Reddit threads with reply drafts, posts, SEO fixes, article ideas).
5. **Human approval** — agents draft, a person approves before anything publishes. *"You stay in control."*
6. **Publish via integrations** — WordPress, Webflow, Framer, Wix, Sanity, Search Console, GA4, GitHub, LinkedIn, X, TikTok, Instagram, WhatsApp, Telegram, Slack.
7. **"Talk to AI CMO"** — chat grounded in everything Okara knows about the product.

Dashboard = 4 parts: **Company** (profile, brand voice, strategy docs) · **Analytics** · **Agents Feed** · **Talk to AI CMO**.

## 3. What users praise
- Fast setup (URL → value in minutes).
- No prompting — work shows up in the feed daily.
- One place instead of many tools/agencies.
- Daily/weekly action items; feels like "a small marketing team".

## 4. Criticisms (avoid these)
- "AI CMO" label oversells — it drafts/queues, can't replace judgment.
- Output needs review; lazy approvals can damage the brand.
- Credit burn can be high.

## 5. Mapping to our graph8 project ("AI sales team")
| Okara (marketing) | Ours on graph8 (sales) | graph8 surface |
|---|---|---|
| URL in → live in 5 min | Paste company website → first outreach ready in ~3 min | Company Intelligence (`/intelligence/analyze`), Studio |
| 5 strategy docs | "Sales Brain" cards: Offer, ICP, Personas, Competitors, Tone | GTM Context (`g8.studio.icps/personas/globalContext`) |
| Channel sub-agents | 4 named agents: **Scout** (buyers + signals), **Researcher** (enrich), **Writer** (outreach copy), **Closer** (replies → meeting → deal) | Search, Signals/Intent, Enrichment, Skills, Sequences, AI Inbox, Appointments, Deals |
| Agents Feed | **Deal Feed** — cards: signal → person → draft → [Approve] [Edit] [Skip] | Agent approvals, Desk decisions |
| Approve → publish | Approve → enroll in sequence → sandbox outbox | Sequences + `/sandbox/outbox` |
| Talk to AI CMO | "Talk to your sales team" chat | Copilot / agent chat |
| Analytics | Live funnel: prospects → sent → replies → meetings → pipeline $ | Webhooks, Deals, sequence analytics |

**Pitch line:** "Okara gave founders an AI marketing team. We built the AI sales team — running entirely on graph8."

**Expected judge question:** "graph8 already has Chief of Staff — what's different?"
**Answer:** graph8's pieces exist but are disconnected — campaigns gated behind research, specialist agents off by default, 37-question kickoff. We wire them into one approval-gated flow from website to booked meeting.

## 6. 5-minute demo script
| Time | Beat |
|---|---|
| 0:00–0:30 | Problem: founder needs sales; graph8 has everything but takes 37 questions + 6 sections to start |
| 0:30–1:30 | Paste website URL → Sales Brain cards fill live |
| 1:30–2:30 | 4 agents show "working"; Deal Feed fills with cards (signal + person + draft email) |
| 2:30–3:15 | Approve 3 cards → emails appear in sandbox outbox |
| 3:15–4:15 | Reply arrives → Closer classifies "interested" → books meeting → creates deal |
| 4:15–5:00 | Open real graph8 app → deal is there. Close on funnel numbers |

## Sources
- https://okara.ai/
- https://vercel.com/customers/how-okara-runs-cmo-agents-for-120000-companies-on-vercel
- https://hypertools.so/tool/okara
- https://www.therundown.ai/tools/ai-cmo
