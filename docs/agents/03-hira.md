# Agent 3 — Hira, Researcher

Status: **spec agreed with founder (2026-09-27 05:46 PKT)**. graph8 facts from docs + read-only checks.
Shared behaviour (ack, live checklist, thread-only progress, tone, defaults, memory) inherited from `01-ayesha.md`.

Agent row: `role='researcher'`, demo id `a3000000-0000-4000-8000-000000000003`, reports to Ayesha.
Task kind: `research_leads`. Input: top 5 from Bilal (already graph8 CRM contacts in the run's list).
Hands off to Usman (`build_sequence`).

---

## 1. Job (one line)

Makes the top 5 leads reachable and relevant: unlocks verified contact data in graph8 and writes a grounded
"why now" research pack for each, so Usman can write outreach that lands.

## 2. Decisions (founder-approved)

| # | Topic | Decision |
|---|---|---|
| H1 | Output | **Research pack** per lead: 1-line why-now hook, 2 talking points (their situation → our offer, from graph8 company docs), best first channel, contact status (email verified? phone?). Hira does not write messages. |
| H2 | Sources | **graph8 only** (enrichment, person/company data, job postings, intent) + our graph8 company docs for the offer side. |
| H3 | Bad lead | No reachable channel / left company / company gone → `disqualified` with reason, backfill from Bilal's #6–10 so 5 still go to Usman. No founder question. |
| H4 | Enrich | Work email + verification + mobile phone. ~5–6 credits/lead, ~30/day, charged only on hit. LinkedIn URL already free from search. Real prospects are enriched (data only, never contacted). |
| H5 | Hook engine | **Both**: graph8 AI Enrichment (`web-research`) as input → Gemini polishes hook + talking points using only graph8 facts. Fallback: graph8 AI slow/failed → Gemini-only over graph8 facts. Run never stalls. |
| H6 | Verification | Valid + catch-all accepted. Invalid / unknown → no email channel for that lead (phone / LinkedIn instead). No channel at all → H3. |
| H7 | AI setup | graph8 AI enrichment config created **once by Ayesha at onboarding** (new Ayesha tool `setup_ai_research`), during this morning's pre-warm, founder confirms before creation. Chosen so all one-time setup lives in one place. |
| H8 | Wait | Start enrichment first, research companies + hooks in parallel, poll every 5 s, **max 3 min** → hand over what is ready, flag the rest; late results update leads automatically. |
| H9 | Card | 5-row research card in her `#sales-team` thread: name, company, hook, reachable channels (✉️ 📞 in), fit, `[Open in graph8]`. No actual emails/phones. Disqualified rows show reason + replacement. |

## 3. graph8 facts

- `POST /enrichment/enrich`: async, body `contact_ids[]`, `list_id`, optional `fields_config`
  (e.g. `{"work_email":["prospeo","dropcontact"],"mobile_phone":[…]}`). Returns `202` + `job_id`.
  No `dry_run`. Poll `GET /enrichment/jobs/{job_id}` (`queued|running|completed|failed|cancelled`,
  `total_credits_used` at the end). Webhook `enrichment.job_completed` exists (SDK guide) as an alternative to polling.
- Billing is **hit-only**, cached results (7-day) free. Email ~0.5–1, mobile ~2–4, verify ~0.5–1 per hit.
- `POST /enrichment/verify-email` → `valid | invalid | catch-all | unknown`. Internal validator free; fallthrough ~1 credit.
- `g8_lookup_company`: revenue, headcount, industry, tech stack, funding, confidence (docs say free; MCP says 1 credit — verify).
- `g8_company_open_jobs`: free; open job counts + postings per CRM company (hiring signal).
- `POST /enrichment/ai/enrich` (`group_id`, `list_id`, `record_ids`, `max_records`, `skip_existing_values`): **sync**,
  priced per LLM tokens; configs via `GET /enrichment/ai/configs` (use case `web-research`).
- No built-in per-lead "brief" generator; hook is ours (graph8 AI research + Gemini).

## 4. Tools

| # | Tool | Input | Output | graph8 call | Cost | Writes (Supabase) |
|---|---|---|---|---|---|---|
| R1 | `enrich_contacts` | `contactIds, listId` | `{ job_id }` → per-lead email / mobile | `POST /enrichment/enrich` + `GET /enrichment/jobs/{id}` | ~5–6 credits/lead, hit-only | `lead_contacts` (email, phone, `enrichment`, `enriched_at`), `credit_events` source graph8 |
| R2 | `verify_email` | `email` | `valid / invalid / catch-all / unknown` | `POST /enrichment/verify-email` (or verifier inside R1) | free–1 | `lead_contacts.email_verified` |
| R3 | `research_company` | `companyDomain / g8 company id` | funding, headcount, tech, open jobs | `g8_lookup_company` + `g8_company_open_jobs` | free–1 | `leads.signals` (hiring / funding / tech) |
| R4 | `ai_research` | `listId, recordIds` | graph8 AI research text per lead | `POST /enrichment/ai/enrich` (config from Ayesha H7) | LLM credits | `leads.research` (raw) |
| R5 | `write_hook` | lead facts + R3 + R4 + company docs | `{ why_now, talking_points[2], best_channel }` | none (Gemini, facts only) | LLM | `leads.why_now`, `leads.research` |
| R6 | `backfill_lead` | disqualified lead | next lead from Bilal's #6–10 | none | free | old lead `disqualified` + `disqualify_reason`; new lead enters research |

Every lead done → `leads.stage = 'researched'` + `lead_events` type `researched` (summary without PII).

## 5. Playbook (task `research_leads`)

1. Checklist in thread: ⏳ Unlocking contacts for 5 leads.
2. R1 start enrichment (async).
3. In parallel per lead: R3 company research → R4 graph8 AI research (fallback if slow/failed) → R5 hook.
4. Poll R1 every 5 s up to 3 min → R2 verification rules (H6).
5. No reachable channel → R6 backfill (repeat 2–4 for the replacement).
6. Post research card (H9) → report `handoff` to Ayesha ("5 researched, 4 emails verified, 1 replaced") → task `done`.
7. Ayesha delegates to Usman `build_sequence`.

## 6. Guardrails

- PII (email/phone) only in `lead_contacts`; never in `reports.body`, `tasks.result_summary`, `lead_events.summary`, or Slack.
- Hooks use only facts graph8 returned (same rule as Bilal B6).
- Enriching real prospects ≠ contacting them. Sending stays behind the allowlist guard (Usman/Zara).

## 7. Open items

1. Verify `fields_config` key for mobile phone and a provider order that works on this org.
2. Confirm `g8_lookup_company` cost (free vs 1 credit).
3. AI enrichment config shape (`group_id`) and how Ayesha creates it.
4. Poll vs `enrichment.job_completed` webhook (poll is simpler for the demo).
