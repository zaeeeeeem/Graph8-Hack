
## Core Prospecting & Sales Agents

**1. SDR Agent**
Finds new potential customers using graph8's 700M+ contact database and intent signals, then qualifies them for personalized outreach.
→ Links to: **Data**, **Signals** → `g8.enrich.search()`, `g8.signals.list()`

**2. Deal Agent**
Monitors every deal in the active pipeline, flags stuck or at-risk deals, and suggests the next-best-action for each.
→ Links to: **CRM/Revenue** → `g8.deals.list()`, `g8.pipelines.get()`

**3. CSM Agent**
Tracks existing customers for job-change/hiring signals on their accounts, surfacing expansion, upsell, or churn-risk opportunities.
→ Links to: **Signals**, **CRM** → `g8.signals.list()`, `g8.deals.list({status:'closed_won'})`

**4. Content Agent**
Generates campaign content, objection-rebuttals, and competitive battlecards on demand, drawing on graph8's Studio and Campaign Engine.
→ Links to: **Studio / Campaign Engine** → AI campaign ideation, objection-handling features

---

## Outreach Execution Agents

**5. Sequencer Agent**
Automatically enrolls approved leads into a multichannel sequence (email, SMS, LinkedIn) and monitors send/reply performance.
→ Links to: **Sequencer** → `g8.sequences.add()`, `g8.sequences.list()`

**6. Inbox Agent**
Reads incoming replies across channels, classifies intent (interested / objection / not-now), and drafts the next response for approval.
→ Links to: **Inbox** → AI-draft reply feature

**7. Dialer/Voice Agent**
Places or receives calls for leads ready to talk, using AI voice for qualification and logging the disposition automatically.
→ Links to: **Dialer/Voice** → `g8.voice`, power dialer API

**8. Meetings Agent**
Once a lead signals interest, proposes available time slots and books the meeting directly onto the shared calendar.
→ Links to: **Meetings** → `g8.meetings.findAvailableSlots()`, `g8.meetings.book()`

---

## Intelligence & Housekeeping Agents

**9. Signal-Watcher Agent**
Continuously watches target accounts for new triggers (funding, hiring, tech-stack changes) and routes the alert to the relevant agent in real time.
→ Links to: **Signals** (webhook-driven) → `g8.signals` event stream

**10. Data Cleanup Agent**
Detects and merges duplicate contact/company records, and fills in missing fields using enrichment.
→ Links to: **Data / CRM** → `g8.contacts`, `g8.companies`, `g8.enrich`

**11. Forecast/Reporting Agent**
Produces a rolling summary (weekly/daily) of pipeline health, replies, meetings booked, and deals closed — answerable via chat.
→ Links to: **CRM/Revenue** (aggregated) → `g8.deals`, `g8.pipelines`

---

## Additional High-Value Agents (worth adding, not yet listed)

**12. Compliance/Guard Agent**
Checks every AI-drafted message against approved pricing, quote terms, and brand/compliance rules before it sends — flags mismatches for human review.
→ Links to: **Quotes**, **GTM Knowledge Base**, **Sequences/Inbox** (as an intercept layer)

**13. Warm-Intro Agent**
Scans existing customer/contact relationships for warm-path connections into a new target account, before defaulting to cold outreach.
→ Links to: **Data/CRM** → `g8.contacts`, `g8.companies` (relationship/employment-history fields, if available)

**14. Competitive Radar Agent**
Continuously extracts competitor mentions from calls/emails and updates battlecards with why prospects choose or reject a competitor.
→ Links to: **Studio** (battlecards), **Dialer/Inbox** (source data, pending transcript availability)

**15. Territory/Quota Agent**
Analyzes historical account performance and signal density to help fairly split territories and set data-driven quotas across reps.
→ Links to: **CRM**, **Signals** (aggregated account-potential scoring)

**16. Onboarding/Setup Agent**
Given just a company website, auto-configures ICP, initial sequences, and knowledge base — reducing the "6 sections to click through manually" friction you observed.
→ Links to: **GTM Context**, **Sequences**, **Knowledge Base** (setup automation)

---

For a hackathon build, I'd recommend picking **4-5 core agents** (SDR, Deal, CSM, Sequencer, and one of the "additional" agents like Compliance/Guard or Onboarding) to keep scope realistic, and present the rest as the "roadmap" for the full AI CRO vision. Want me to help narrow it down and build the orchestration plan?