# Layer verification log — VLAYERS

Live against `be.graph8.com/api/v1`, org `Hackathon zaeemulhassanyt` (`org_f3f1e5df96e5`). All writes below use
allowlisted test contacts only (TEST_ALLOWLIST). Credits at start: **9074** (`GET /usage`).

Setup done: upserted 3 allowlisted teammates via `PUT /contacts/assert/batch` (dedupes by email) into list
**"Graphi TEST contacts" id=1** (already existed — created by another worker, reused per instructions).

- Zaeem contact id **4** (`zaeem@8x.social`, `+923124487312`)
- Abbas contact id **5** (`abbasali44ever@gmail.com`, `+923297956905`)
- Afshan contact id **6** (`afshanfarooqdev@gmail.com`, `+923091112099`)

**Gotcha:** list 1 already contained 3 *other* contact rows (ids 1–3) for the same 3 people, created by an earlier
worker **without an email** (name + linkedin only). `assert/batch` dedupes by email, so a contact created without
an email is never matched by a later assert that supplies one — you get duplicates, not an update. Anyone using
"the Zaeem contact" in this list must use id **4**, not id 1.

---

## V-V1 — Voice agent create (`POST /voice/agents`)

**VERDICT: ✅ works, cheap gotchas.** Persona built from `brand_voice` + `elevator_pitch` global-context docs
(ids `252cc0ba-70c7-4c35-bba9-8c988a311955`, `6878e8cd-eefb-469f-96a2-90934005b9ae`).

Request:
```json
POST /voice/agents
{
  "role": "SDR",
  "persona": {
    "agent_name": "Usman",
    "persona": "Direct, operational, honest 8x growth operator. Speaks with confident, data-grounded, no-fluff tone. States facts without hedging, demonstrates deep process knowledge, never oversells.",
    "description": "Outbound SDR voice agent for 8x.social pitching the managed creator network and booking discovery calls.",
    "formality_level": 0.4,
    "conciseness_level": 0.7,
    "assertiveness_level": 0.6,
    "outbound_instructions": "<30-second pitch text, see script below>",
    "outbound_voicemail_prompt": "Hi, this is Usman from 8x.social. ... book a time at 8x.social."
  },
  "identity": { "phone": "+19802944116", "calendar": 1 },
  "name": "Graphi SDR (test)"
}
```

Response (`201`, wrapped `{data:{agent, message}}`):
```json
{
  "id": 2259,
  "agent_id": "f5377a72-3c74-4931-9379-40a9baee5290",
  "org_id": "org_f3f1e5df96e5",
  "agent_status": "active",
  "role": "SDR",
  "entity_type": "agent",
  "persona": { "...": "as sent, plus inbound_instructions:null, company_name_pronunciation:null" },
  "identity": { "phone": "+19802944116", "voice": null, "calendar": 1, "avatar_url": null },
  "knowledge": { "collections": [] },
  "use_company_knowledge": true,
  "is_template": false,
  "template_id": null,
  "created_by_email": "api-key@graph8.com",
  "created_at": "2026-09-27T02:05:06.512977Z",
  "updated_at": null
}
```

`GET /voice/agents/{agent_id}` (used `f5377a72-3c74-4931-9379-40a9baee5290`) returns the identical shape,
`"message": "Agent retrieved successfully"`.

**Gotchas:**
- `identity.calendar` is a **bare integer** (event_type id), NOT `{event_type_id: 1}` — sending an object gives
  `422 int_type` on `identity.calendar`.
- Top-level `"name"` field (`"Graphi SDR (test)"`) is **silently accepted and dropped** — there is no separate
  agent display name distinct from `persona.agent_name`. Only `persona.agent_name` ("Usman") shows anywhere.
  Layer workers should not rely on `name` for the "Graphi SDR (test)" label; use a Slack/portal-side label
  instead, or put it in `persona.description`.
- Both numeric `id` (2259) and UUID `agent_id` exist; every other voice route (`GET`, `/voice/calls`) uses the
  UUID `agent_id`.

**Fallback:** none needed — this endpoint is solid.

---

## V-V2 — Voice call dry-run (`POST /voice/calls`) + artifacts/webhook/dispositions

**VERDICT: 🚫 BLOCKED at the org level — not a code bug.** `POST /voice/calls` (even `dry_run:true`) requires
`from_phone` to be one of the org's **AI-calling** numbers. This org's only number (`+19802944116`) is
**dialer-only** (`GET /voice/numbers` → `inbound_type: "dialer"`); `GET /voice/agent-phone-numbers` (the
AI-calling number pool) returns `{available_numbers: [], booked_numbers: []}` — genuinely empty, not a filter
artifact.

Request tried:
```json
POST /voice/calls
{
  "to_phone": "+923124487312",
  "from_phone": "+19802944116",
  "agent_id": "f5377a72-3c74-4931-9379-40a9baee5290",
  "event_id": 1,
  "callback_url": "https://example.com/cb",
  "dry_run": true,
  "first_name": "Zaeem",
  "email": "zaeem@8x.social"
}
```

Response (`422`):
```json
{
  "error": "validation_error",
  "message": "'from_phone' '+19802944116' is not one of this organisation's AI-calling numbers (dialer-only numbers cannot place AI calls). See GET /voice/agent-phone-numbers.",
  "code": "422"
}
```

This blocks **both** V-V2 (dry run) and V-V3 (real call) — there is no way to place any `/voice/calls` request,
dry-run or not, without an AI-calling number provisioned. Same wall the BUILD-PLAN's "50%" estimate didn't
anticipate: it's not the call *result* that's uncertain, it's that the call can't be dispatched at all.

**Fallback:** L2 voice call-dispatch ships `state: 'planned'` for the 📞 step; the founder needs to provision an
AI-calling number in the graph8 UI (Twilio number flagged for AI calling, not just dialer) before V-V3 can run —
this is outside API/code control, same shape of blocker as L3 LinkedIn. Flag to founder now; do **not** wait
past 11:00 on it.

**`GET /voice/calls/{id}/artifacts`** (from OpenAPI, `/api/v1/openapi.json`): returns
`ApiResponse_VoicePayload_` → `VoicePayload` schema is **open-shaped**
(`{"type":"object","additionalProperties":true}`, no fixed keys) — "voice adds fields to these bodies on its own
release cadence." No fixed shape to code against; treat every field as optional/unknown and log the raw payload.

**`voice_ai.call_completed` webhook**: confirmed real event via `GET /webhooks/events`:
`{"event":"voice_ai.call_completed","category":"Voice AI","description":"A Voice AI agent call ended, with its
duration, disposition and sentiment."}`. Sibling events: `voice_ai.call_started`, `voice_ai.voicemail_left`.
No documented payload schema (webhooks share `VoicePayload`-style open shape) — code defensively, key off
`disposition` / `sentiment` / `duration` fields per the description text, don't assume more.

**Dispositions** (`g8_workflow_list_dispositions`, source `"voice"`): `booked, callback, not_interested, dnc,
not_icp, has_solution, irrelevant_job_title, wrong_person, referred, gate_keeper, wrong_number, left_org,
hangup, not_answered, busy, voicemail, no_voice, dial_tree, answering_machine` (`sdr_selectable`) plus
`sdr_hangup, failed` (`system_set`). Zara's disposition mapper (Z11) should switch on these exact string values.

---

## V-L1 — LinkedIn sequence (EMAIL → HEYREACH → EMAIL, no sender)

**VERDICT: 🚫 BLOCKED — worse than BUILD-PLAN assumed.** BUILD-PLAN's L3 plan was "authoring is fine, only
sending is blocked" (no Netrion key). That is now **false**: graph8 rejects LinkedIn step *creation* outright,
so the planned test (does the 2nd email still send around a stalled LinkedIn step?) cannot even be set up.

`GET /linkedin/connection` → `{"connected":false,"accounts_count":0,"api_key_hint":null,"last_synced_at":null,
"accounts_need_attention":false,"webhook_registered":false}`. `GET /workflows/integrations/linkedin/senders` →
`{"senders":[],"total_count":0}`. Both unchanged from BUILD-PLAN §1.

`StepConfig.step_type` enum (from `POST /sequences` 422 body): `'PHONE', 'EMAIL', 'MANUAL_DIALER', 'HEYREACH',
'NETRION', 'SMS', 'WHATSAPP'` — **no `UNIPILE` value exists** (BUILD-PLAN/task both mention Unipile; it is not
in this API version's enum, confirmed by grepping the full OpenAPI spec for "unipile" — zero hits).

Tried both LinkedIn-shaped step types:
- `step_type: "HEYREACH"` → `422 "This LinkedIn step type is no longer available."`
- `step_type: "NETRION"` → `422 "This LinkedIn action type is no longer supported."`, **regardless of
  `step_data`** — tried `action` = `CONNECTION_REQUEST`, `CONNECT`, `INVITE`, `SEND_MESSAGE`, `MESSAGE`,
  `VIEW_PROFILE`, empty `{}`, and omitted `step_data` entirely. Every variant gets the identical error — this is
  a blanket step-type rejection, not a validation nuance on the action value.

No sequence was created by any of these calls (all 422, nothing persisted) — nothing to clean up.

**Answer to the decision question:** moot — since the sequence can't be created at all, "does the email after
LinkedIn still send" can't be tested live. Given the server hard-rejects both known LinkedIn step types, L3
**cannot author LinkedIn steps in a real graph8 sequence today, at all** — not degraded to `state:'planned'`
inside a graph8-side sequence, but literally un-creatable via this API.

**Fallback:** L3 must represent the LinkedIn step **only in our own DB/Slack/portal** (never call
`POST /sequences` with a LinkedIn-shaped step) and skip straight to the next email step when scheduling our own
side-effects. `PlannedStep.g8Step` should stay `undefined` for LinkedIn steps unconditionally — there is no
"try it and fall back," it always fails. Re-probe `HEYREACH`/`NETRION` if graph8 ships an update; nothing here
is a client-side workaround.

---

## V-N1 — Intent keywords (`create-from-search` → `companies` immediate + 5 min)

**VERDICT: ✅ works, but keyword acceptance is finicky — build a retry loop, not a fixed keyword list.**

`POST /intent/keywords/create-from-search {keywords, contact_limit:20, page_limit:10}`. Tried 3 phrases derived
from `icp_research` (ICP: DTC/consumer-app growth teams needing high-volume creator/UGC content):
- `"UGC creator marketing agency"` → `error: "This search has no matching pages; adjust the query before saving it."`
- `"creator content production platform"` → `error: "keyword processing failed"` (opaque, no retry hint)
- `"DTC brand paid social scaling"` → same "no matching pages" error
- `"UGC video creators for brands"` → ✅ created, `pages_seeded:2, contacts_seeded:5, companies_seeded:1`

Response shape (`KeywordsCreateFromSearchResponse`): `{results:[{keyword, keyword_id, status:
'created'|'skipped'|'error', pages_seeded, contacts_seeded, companies_seeded, error}], created_count,
skipped_count, error_count}` — **per-keyword partial failure**, not all-or-nothing; each keyword in the batch
must be checked individually via `status`.

2 keyword ids on record for this test: `23148307-0b8b-4ca0-a933-b3a1388680ae` ("UGC creator marketing agency")
and `a4ba6138-0164-49e4-98ad-e930a14efe0e` ("UGC video creators for brands", the one with actual data).

`POST /intent/keywords/{id}/companies` (empty body `{}`) — **immediate**, no 5-minute wait needed: returned 1
company (Phoenix Financial Services, phoenixinc.com) right after creation. Rows shape:
`{event_date, keyword_id, COMPANY_ID, COMPANY_LINKEDIN_URL, COMPANY_NAME, COMPANY_DOMAIN, page_title, page_url,
signal_details, signal_subtype}` — note the **SCREAMING_SNAKE_CASE** company fields mixed with snake_case
metadata fields; same duplicate-row-per-matching-page pattern as most graph8 list endpoints (2 rows, 1 company,
`total:1` is the correct count — dedupe by `COMPANY_ID`).

`GET /intent/abm/companies` → richer per-company view: `{company_id, company_name, company_domain, industry,
employee_count, logo_url, account_strength, persona_coverage:{economic_buyer, champion, end_user, technical}
(each barometer/signal_count/contact_count), top_keywords:[...]}`. `account_strength:"weak"`,
`persona_coverage` all `"silent"`/0 for this fresh keyword — expected, no engagement yet on a brand-new org.

**Credits**: `GET /usage` before = 9073.0 available, after `create-from-search` (both keyword attempts,
including 2 failures) = still 9073.0 — **`create-from-search` is free even on failed/no-match keywords**,
confirming BUILD-PLAN's "free" note.

**Gotcha:** keyword acceptance depends on graph8's page index having matching content — 2 of 3 ICP-derived
phrases failed with "no matching pages." Bilal/L6 code should try multiple keyword phrasings and only treat
`status:'created'` ones as live; don't assume the first keyword from `icp_research` will resolve.

**Fallback:** if all keywords in a batch fail, Bilal's card says "no buying signals yet" and ranks by fit only
(as BUILD-PLAN already specifies) — this is a real, observed failure mode, not hypothetical.

---

## V-A1/A2 — graph8 AI research config (save + read back + run)

**VERDICT: ⚠️ works end-to-end but charges credits on a FAILED run — cap it hard and don't trust `skip_existing_values` alone.**

**Save** `POST /enrichment/ai/configs`:
```json
{
  "config": {
    "name": "8x.social web research (test)",
    "input_mapping": ["work_email", "first_name", "company_domain"],
    "prompt": "Research this contact and their company for 8x.social ... Produce a why_now ... and 2 ... talking_points ...",
    "model": "gpt-4o-mini",
    "usecase": "web-research",
    "outputs": [{"name": "why_now", "type": "string"}, {"name": "talking_points", "type": "string"}],
    "list_id": 1,
    "is_global": false,
    "config": { "scope": "contact", "skip_existing_values": true, "skip_recently_enriched": false, "auto_update": false }
  }
}
```
**Gotcha #1:** the top-level body key is `config` (an `AIEnrichmentConfigDto`), and *that itself* has a nested
`config` key (`AIConfigDto`, the execution settings: scope/skip flags/auto_update). Omitting the inner `config`
gives `422 missing: body.config.config`. Two same-named nested objects — easy to shoot yourself with a shallow
merge.

Response (`200`):
```json
{
  "success": true,
  "config_id": "90f1862c-08aa-4019-becb-d5e90db16bb3",
  "group_id": "ai_enrich_2f81d1d9",
  "column_mappings": [
    {"output_field":"why_now","column_id":"ai_enrich_2f81d1d9_why_now","column_name":"Why Now"},
    {"output_field":"talking_points","column_id":"ai_enrich_2f81d1d9_talking_points","column_name":"Talking Points"}
  ],
  "message": "AI enrichment config '...' saved successfully with 2 column mappings",
  "job_id": null
}
```
`group_id` format confirmed: `ai_enrich_<8-hex>` (matches `RunAIEnrichRequest`'s doc comment).

**Gotcha #2 — read-back mismatch:** `GET /enrichment/ai/configs?list_id=1` returned `{"configs":[],"list_id":1,
"count":0}` **even after the save**, despite the save request itself carrying `list_id:1`. The list endpoint
never showed the config — possibly gated on `is_global:true`, or a different scoping key not documented. What
*does* work: `GET /enrichment/ai/configs/{group_id}` (i.e. `.../ai_enrich_2f81d1d9`) — returns the full
`AIEnrichmentConfigDto` correctly. **Layer workers: read back configs by `group_id`, never trust the
`?list_id=` list endpoint to enumerate what you just saved.**

**Run** `POST /enrichment/ai/enrich {group_id:"ai_enrich_2f81d1d9", list_id:1, record_ids:[4]}` (contact id 4 =
Zaeem, the allowlisted contact — **not** id 1, see the dedupe gotcha at the top of this doc).

- **Latency: 30.8 s** (measured with `time`) — comfortably over BUILD-PLAN's 30 s cap assumption; L5 should
  treat 30 s as a soft ceiling that this org's real run already brushes against, not a safe margin.
- Response: `{"job_id":"c67bbd5b-...", "status":"completed", "total":1, "completed":1, "results":[{
  "processed_records":1, "successful_enrichments":0, "failed_enrichments":1}], "successful_enrichments":null,
  "failed_enrichments":null, "total_credits_used":null, "warnings":null, "provider_errors":null}` — **the run
  failed** (`failed_enrichments:1`) with **zero diagnostic detail** (`provider_errors:null`, `warnings:null`).
  Root cause (inferred, not returned by the API): contact 4 has no `company_domain` custom field set, and
  `input_mapping` required it — nothing for the web-research prompt to research against.
- `GET /contacts/4` afterward: `custom_fields: null` — confirms **no output columns were written** on failure,
  as expected.
- **Credits: 9072.0 → 9050.0, i.e. 22 credits spent on a run that produced zero usable output.** This is the
  single most important gotcha for L5: **a failed AI-research run still bills.** The 30 s cap + Gemini-only
  fallback (H5) is not just a latency safeguard, it's a cost safeguard — a bad `input_mapping` silently burns
  credits with no error message pointing at the cause.

**Fallback:** Hira/L5 must (a) verify `company_domain` (or whatever `input_mapping` needs) is populated on the
target contact/company before calling `/enrichment/ai/enrich`, since the API won't tell you why it failed after
the fact, and (b) treat any `failed_enrichments > 0` the same as a timeout — fall back to the Gemini-only hook
(H5) rather than retrying (retrying an unfixed `input_mapping` gap just burns credits again).

---

**5-minute recheck** (companies for keyword `a4ba6138-...`, checked ~3 min after creation): `total` still `1` —
unchanged from the immediate check. No new companies matched in the short window; consistent with
`create-from-search` doing all its resolution synchronously up front rather than a background crawl trickling in
results. Bilal/L6 should not expect a "wait 5 min, more shows up" behavior from `create-from-search` specifically
(unlike ordinary keyword `add`, which BUILD-PLAN notes may take hours/days) — what you get immediately is
basically what you get.

---

## V-I1 — Intelligence analyze (`POST /intelligence/analyze`) + org-domain + webhook

**VERDICT: ⚠️ works, but NOT fast — contradicts BUILD-PLAN's "likely returns fast" assumption.**

`GET /intelligence/org-domain` → `{"org_id":"org_f3f1e5df96e5","company_domain":null,"message":"No company
domain configured in organization settings"}` — unchanged from BUILD-PLAN §1.

`POST /intelligence/analyze {"website_url":"https://8x.social","force":false}` → **0.9 s** response, but that's
just the dispatch ack, not the analysis:
```json
{"task_id":"7c78a0da-63f1-483e-9bb1-63143541bf3f","message":"Analysis already in progress",
 "website_url":"https://8x.social","domain_sync_warning":null}
```
`"Analysis already in progress"` on the very first call in this session — an analysis for 8x.social was already
running (either from an earlier worker's test, or graph8 kicked one off on its own). Credits: 9050.0 → 9050.0,
**no charge for the dispatch call itself** (cost, if any, is presumably on the underlying task).

Polled `GET /intelligence/status/{task_id}` twice, ~3 minutes apart: **both times `status:"pending"`,
`progress:0`, `current_step:"Initializing data collection..."`, every one of the 14 `steps` (`website_scrape`,
`company_enrichment`, `company_keywords`, `product_inventory`, `organic_keywords`, `paid_keywords`,
`competitor_discovery`, `top_content`, `audience_questions`, `search_trends`, `visual_assets`, `brand_news`,
`brand_sentiment`, `ai_synthesis`) still `"pending"`.** Zero progress in 3+ minutes on a task already
in-progress before this session started. This is the opposite of BUILD-PLAN's "`force:false` on 8x.social likely
returns fast (docs exist)" — either the analysis pipeline is generally slow (14 sequential steps, plausible
minutes-to-tens-of-minutes total), or this org's task is stuck. Either way: **do not build the demo path assuming
sub-minute intelligence results.**

`IntelligencePayload` (the shape both the analyze response and the `intelligence.completed` webhook carry) is
**open-shaped** in the OpenAPI spec (`additionalProperties:true`, no fixed fields) — same pattern as
`VoicePayload`. `intelligence.completed` / `intelligence.failed` are confirmed real webhook events (`GET
/webhooks/events`, category "Intelligence") but with no fixed payload schema — code defensively.

**Fallback:** L4 already has the right fallback in BUILD-PLAN — "Could not study the site, using what graph8
knows" + continue with the 23 existing global-context docs. Given the observed stall, treat **any** wait over
~30–60 s the same as a failure for demo purposes: register `intelligence.completed`/`intelligence.failed`
handlers for the async path, but do not block onboarding on this call finishing in real time.

---

## Summary — verdicts at a glance

| Item | Verdict | Key number |
|---|---|---|
| V-V1 voice agent create | ✅ works | agent_id `f5377a72-3c74-4931-9379-40a9baee5290` (numeric id 2259) |
| V-V2 voice call dry-run | 🚫 BLOCKED (org has no AI-calling number) | — |
| V-L1 LinkedIn sequence steps | 🚫 BLOCKED (server rejects HEYREACH & NETRION step types outright) | — |
| V-N1 intent keywords | ✅ works, keyword acceptance flaky | keyword_ids `23148307-0b8b-4ca0-a933-b3a1388680ae`, `a4ba6138-0164-49e4-98ad-e930a14efe0e` |
| V-A1/A2 AI research config | ⚠️ works, bills on failure, list-read-back broken | group_id `ai_enrich_2f81d1d9` |
| V-I1 intelligence analyze | ⚠️ works, not fast (stuck pending 3+ min) | task_id `7c78a0da-63f1-483e-9bb1-63143541bf3f` |

Credits: started 9074, now 9050 (24 spent: 22 on the failed AI-research run + 2 on other reads/misc). All spend on
allowlisted-adjacent test objects only; no real prospects touched.

## Test objects left in place (per instructions — do not delete)

- Voice agent **"Usman" / SDR, agent_id `f5377a72-3c74-4931-9379-40a9baee5290`** (labelled "Graphi SDR (test)" in
  intent only — see V-V1 gotcha, the API has no separate display-name field).
- List **"Graphi TEST contacts" id=1** (reused, not created by this task).
- Contacts id **4, 5, 6** (Zaeem/Abbas/Afshan, asserted with email) — ids 1–3 are pre-existing no-email dupes from
  another worker, left alone.
- Intent keywords **`23148307-0b8b-4ca0-a933-b3a1388680ae`** and **`a4ba6138-0164-49e4-98ad-e930a14efe0e`**.
- AI research config **group_id `ai_enrich_2f81d1d9`** on list 1.
- Intelligence task **`7c78a0da-63f1-483e-9bb1-63143541bf3f`** for `https://8x.social` (pre-existing, not created
  by this task — just polled).

No sequence was created for V-L1 (all attempts 422'd, nothing persisted).
