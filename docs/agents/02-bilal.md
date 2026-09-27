# Agent 2 — Bilal, Scout

Status: **spec agreed with founder (2026-09-27 05:12 PKT)**. graph8 facts from docs + one live read-only search
(free, 0 credits charged). Shared behaviour (ack, live checklist, thread-only progress, tone, defaults, memory) is
inherited from `01-ayesha.md` and not repeated here.

Agent row: `role='scout'`, demo id `a2000000-0000-4000-8000-000000000002`, reports to Ayesha.
Task kind: `find_prospects`. Hands off to Hira (`research_leads`, top 5).

---

## 1. Job (one line)

Turns the target persona into 10 real, ranked, deduped prospects per run, saved in graph8, top 5 handed to Hira.

## 2. Decisions (founder-approved)

| # | Topic | Decision |
|---|---|---|
| B1 | Quality | **Fit score + signal bonus.** Top 5 go to Hira. |
| B2 | Skip | Already in our pipeline · already in graph8 CRM · do-not-contact / unsubscribed · max 2 people per company. |
| B3 | Too few | Auto-widen step by step (nearby geo → adjacent titles → bigger company size), max 2 steps, tell Ayesha what was widened. No founder question. |
| B4 | Result | One list card in his `#sales-team` thread: 10 rows (name, title, company, fit, one-line reason, `[Open in graph8]`), top 5 marked "→ Hira". No emails/phones. |
| B5 | Ad-hoc asks | "Find 20 fintech CTOs in Dubai" = one-off run. Defaults change only on "from now on…". Ayesha states which she understood. |
| B6 | Facts only | Reasons built only from data graph8 returned. Gemini may phrase, never invent. No signal → reason is the fit itself (e.g. "CFO, 120-person fintech, UK"). |
| B7 | Signals | **graph8 intent only** (keyword + jobs / job-change tracking). No TinyFish. No signal → fit only. |
| B8 | Save | Search with auto-CRM-capture **off**; save only the final 10 into graph8 CRM (dedupe upsert) in one list per run, e.g. `Sales Team · 27 Sep · UK fintech CFOs`. |
| B9 | Search style | **People-first**: one contact search with company filters. Company-first only when intent points to specific companies. |
| B10 | Intent setup | Ayesha sets up tracking at onboarding (new Ayesha tool `setup_intent_tracking`). Bilal reads it every run. |
| B11 | Pre-warm | Run onboarding on the real org this morning so real intent may exist by the 18:00 demo. **Confirm with founder before creating anything in graph8.** |
| B12 | Fit score | **Fixed formula in code**: title 40 · seniority 15 · industry 20 · company size 15 · geo 10 · intent signal +up to 20 · cap 100. Same input = same score. |
| B13 | Confidence | Prefer graph8 `confidence_score ≥ 50`; lower only to fill up to 10. |
| B14 | Errors (assumed) | graph8 error / rate limit → retry once → task `failed` → Ayesha tells founder in `#sales-hq`. |

## 3. graph8 facts (verified)

- `POST /search/contacts` (SDK `g8.search.contacts()`, MCP `g8_find_contacts`): **free**, sync, ~28 filter fields
  (job_title, seniority_level, company_industry, company_employee_count, country, …), operators `any_of`, `contains`,
  `none_of`, `between`, …; page size 25 default / 100 max. Rate limit 50 req/s, 1000 req/min per org.
- Live test: CFO + Financial Services/Banking + UK → 797 matches, 0 credits. "fintech" alone matched 0 (use broader
  industry values). Emails/phones come back blank or `***` until enrichment (Hira's job).
- Auto-CRM-capture saves every API result by default on paid plans; opt out per call with `capture=false`.
- Save: `POST /lists` (type contacts) + `PUT /contacts/assert/batch` (≤100, dedupe by work_email then linkedin_url,
  returns `created` / `updated`). Free. Enrichment needs contacts in CRM + a `list_id`, so saving here unblocks Hira.
- Intent: `/intent/*` tools (`g8_intent_add_keywords` with signal types incl. jobs / job_changes,
  `g8_intent_domain_search`, `g8_intent_page_visitors`, …). Reads free; processing ~1 credit per 10 events.

## 4. Tools

| # | Tool | Input | Output | graph8 call | Cost | Writes (Supabase) |
|---|---|---|---|---|---|---|
| S1 | `read_intent_signals` | `workspaceId, persona` | `{ companies[{domain, signals[]}] }` | `/intent/*` reads | free | none |
| S2 | `search_people` | `filters, limit` | `Prospect[]` (no PII) | `POST /search/contacts` (`capture=false`) | free | none |
| S3 | `check_existing` | `Prospect[]` | filtered `Prospect[]` | our `leads` + graph8 CRM lookup | free | none |
| S4 | `score_leads` | `Prospect[], persona, signals` | `Prospect[]` with `fit_score`, `reason` | none (formula B12) | free | none |
| S5 | `save_leads` | top 10 `Prospect[]`, list name | `{ g8_list_id, contact ids }` | `POST /lists` + `PUT /contacts/assert/batch` | free | `leads` (stage `prospect`, `fit_score`, `signals`, g8 ids, `source='scout'`), `lead_contacts` (PII if any), `lead_events` `found` |

## 5. Playbook (task `find_prospects`)

1. Checklist in thread: ⏳ Reading target.
2. S1 intent companies? → company-first for those; always also S2 people-first with persona filters.
3. S3 dedupe (B2) → S4 score + confidence preference (B13).
4. Fewer than 10 → widen (B3), max 2 steps.
5. S5 save top 10 in a per-run list.
6. Post list card (B4) → report `handoff` to Ayesha ("Found 10, 6 strong; widened geo to EU") → task `done`.
7. Ayesha delegates top 5 to Hira.

## 6. Open items

1. Exact persona → filter mapping (industry values that actually match, e.g. "Financial Services" not "fintech").
2. Confirm `capture=false` param name on `/search/contacts` live.
3. Which CRM lookup to use for "already in graph8" (assert is an upsert, not a read).
