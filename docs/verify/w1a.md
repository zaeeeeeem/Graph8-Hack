# W1a verify log — 27 Sep 2026, ~07:10 PKT

All calls against the live graph8 org (`org_f3f1e5df96e5`) and the **TEST workspace** in Supabase.
Credits before and after: **9,074 → 9,074** (nothing in this log was charged).

## V1: contact search filters and `capture:false` (free)

`POST /search/contacts` body `{ filters: [{ field, operator, value: [] }], page, limit (≤100) }`.

- **Operators** (enum `SearchOperator`): `any_of, contains, all_of, none_of, is_empty, is_not_empty, between, exists`.
  `in` is **not** valid: it returns 422.
- **Fields**: an unknown field returns **400** `{"error":"bad_request","message":"Unknown filter field 'x' for contacts. Valid fields: [...]"}`.
  Valid fields: `city, company_city, company_country, company_domain, company_employee_count, company_founded_year,
  company_industry, company_name, company_revenue, company_state, confidence_score, country, direct_phone,
  education_degree, education_field, education_university_name, first_name, gender, job_department, job_title,
  last_name, linkedin_url, mobile_phone, personal_emails, role, seniority_level, skills, state, work_email`.
- A working example is `[{field:'job_title',operator:'contains',value:['CFO']},{field:'country',operator:'any_of',value:['United States']}]`.
  It returned 200 in about 1.1 s with `pagination.total = 10000`. Treat that total as a capped count, not a real one.
- **Result items have no `id`.** They carry `first_name, last_name, middle_name, work_email, personal_emails,
  direct_phone, mobile_phone, job_title, job_department, seniority_level, role, linkedin_url, linkedin_headline,
  city, state, country, company_name, company_domain, company_industry, company_employee_count, company_country,
  confidence_score`. To get CRM contact ids, save the results with `POST /search/contacts/save`.
- **`capture:false`**: graph8 accepts it (200, no validation error). The CRM contact total stayed at **6** with
  `capture:false`, and it also stayed at 6 **without** it. So `/search/contacts` does not auto-capture into the
  CRM, and the flag does nothing here. Sending it is harmless. Search cost **0 credits**.

## V8: Gemini JSON mode and usage tokens (~0)

`@google/genai` 2.24.0, model `gemini-3.8-flash` (the response `modelVersion` confirms it).
`generateContent({ model, contents, config: { responseMimeType: 'application/json', systemInstruction, temperature } })`

- The call took 2.2 s. `res.text` is clean JSON with no code fences.
- `usageMetadata` = `{ promptTokenCount: 28, candidatesTokenCount: 20, thoughtsTokenCount: 211, totalTokenCount: 259 }`.
  **Thinking tokens dominate**, so `llm.ts` bills `output_tokens = candidates + thoughts` and
  `credits = ceil(totalTokenCount / 1000)` (minimum 1).
- End to end through `llm.json`, a run on the TEST workspace wrote `credit_events(source 'llm', action 'llm_run',
  credits 1, input 13, output 213)` with `task_id` and `run_id` filled in. Ayesha's `portal_agents.spent_today_credits`
  went 0 → 1, and `agent_runs.input_tokens/output_tokens` were filled.

## Other shapes seen while building the guard

- `GET /contacts/{id}` → `{ data: { id:int, first_name, last_name, full_name, work_email, personal_emails, direct_phone,
  mobile_phone, job_title, …, linkedin_url, company, custom_fields, … }, pagination: null }`.
- `GET /usage` → `{ data: { customer_id, credits, held_credits, available_credits, total_earned, total_used } }`.
- The error body is `{ error, message, detail, type, code, param, request_id }`.
- `POST /inbox/{reply_id}/send` `SendRequest` also accepts **`to`** (a recipient override). The guard checks it.
- `GET /inbox/{reply_id}?channel=` → `InboxThreadResponse.contact` is a snapshot object ("name, email, company").
- `POST /sequences/{id}/contacts` body is `{ contact_ids: int[], list_id: int }`.
