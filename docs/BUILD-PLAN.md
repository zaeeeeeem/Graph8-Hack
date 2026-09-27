# Build plan v2 — 06:45 → 17:30 PKT, Sun 27 Sep 2026

Owner: founder. v1 written 06:40 after reading every doc and re-checking graph8, Slack, Gemini and Supabase live
(read-only). **v2 (06:50)**: founder rejected the cuts — everything in the agent specs is kept, as layers on top of a
core path that never depends on them. §3 explains each v1 cut in plain English; §4 is the layered plan.
Supersedes `docs/IMPLEMENTATION-PLAN.md`. Agent specs in `docs/agents/` stay the behaviour source of truth.

Deadlines: repo public **14:00** · code freeze **17:30** · demo **18:00** (5 min). ~10.5 h. Nothing server-side exists yet.

Founder decisions applied in v2: test spends/writes pre-approved for all workers (allowlisted contacts only, never real
prospects) · fake seed stays on the demo workspace until **12:00**, real runs before that go to a **test workspace row** ·
server hosted on **Render** · allowlist arrives separately · runtime spend is automatic (no founder confirm in product).

---

## 0. Verdict in five lines

1. **Core path first (Layer 0), everything else as layers that degrade, never break.** Core = `/hire-sales` → plan → 10
   real prospects → 5 researched → sequence in graph8 → Launch → real email on a teammate's phone → reply → Zara stops the
   account, books the meeting, creates the deal → 🎉 → `/sales-standup`. Every object real in graph8.
2. **Each layer has: owner, verify-first test, hours, and a stage fallback.** A layer that fails its verify step by its
   deadline ships in "planned/⏸" form (visible in Slack + portal + graph8 as intent), not as a broken live step.
3. **Realistic by 17:30** (§6): Layer 0, Edit auto-revise, chat, cron, intelligence-analyze branch, booking link — **high**.
   Voice call, intent signals, graph8 AI research — **medium** (APIs exist, shapes partly verified, data may not appear in
   time). LinkedIn sending — **blocked** by a missing graph8↔Netrion handshake no API exposes; we ship planned steps + Connect
   card + auto-attach when a sender appears.
4. **Speed on stage comes from pre-warmed leads, not fake data**; reply detection = inbox polling first, webhook second.
5. **Before 12:00 every real run hits the test workspace**; at 12:00 wipe the fake seed, switch `WORKSPACE_ID`, go real.
   Render gets the first deploy at 13:00; laptop stays as hot spare (only one Slack connection at a time).

---

## 1. Live facts (verified 06:25–06:50 PKT, read-only)

| Fact | Effect |
|---|---|
| Credits **9,074**. | Build + rehearsals + voice tests well under 500. |
| **Google Calendar already connected** (credential 1, valid); event type **"Discovery call" id 1** (30 min, slug `discovery-call`). | Ayesha T16 = lookup. Zara can book via API on stage. |
| Schedule **"Demo 24/7"** `e5583e4d-…` exists; mailbox **id 1** Gmail active 40/day; phone **+19802944116** (id 1) active. | Email + phone channels available. |
| **`/icps`, `/personas` empty**; 23 `global-context` docs incl. `icp_research`, `persona_research`, `brand_voice`, `pricing_matrix`, `channel_templates`, `writing_style_guide`. | Ayesha reads documents only; target from doc text via Gemini. |
| Pipeline **"Sales Pipeline" `b7fef03e-06d9-440c-bd12-367e6eaf08de`**, stage **New Meeting `1b2f2d3e-48e1-454e-94a7-b3fdc9b90482`**. | Stored in `workspaces.settings` at onboarding. |
| **Voice**: 0 agents, 0 templates. `POST /voice/agents` needs `role` + `persona {agent_name, persona, formality_level, conciseness_level, assertiveness_level, description, outbound_instructions?, outbound_voicemail_prompt?}` + `identity {phone?, voice?, calendar?}` (all optional). **`POST /voice/calls`** = one ad-hoc AI call: `{to_phone, from_phone, agent_id, first_name, email, event_id (booking), callback_url, dry_run}`. `POST /sequencer/content/voice/test-call` also exists. | Voice is buildable and dry-runnable for free. Sequence PHONE step `step_data {dial_dnc, phone_options}` + `voice_agent_name` — whether it auto-dials with the AI agent is unverified → we place the call ourselves with `/voice/calls` at the step time. |
| **LinkedIn**: `GET /linkedin/connection` → `connected:false, api_key_hint:null, webhook_registered:false`; 0 senders; **no POST route** to set a key; `POST /linkedin/accounts/sync` → "Connect your LinkedIn API key before syncing". HEYREACH step keys documented; `UNIPILE` step type exists. | Sending is blocked outside our control (§3 C2). Steps can still be authored. |
| **Intent**: `POST /intent/keywords/add {keywords[], signal_type}`; `POST /intent/keywords/create-from-search {keywords[], contact_limit, page_limit}` pre-resolves pages + contacts immediately; `POST /intent/keywords/{id}/companies` reads matches; index 28 M pages. | Buildable; signals may exist same day via create-from-search. |
| **AI research**: `POST /enrichment/ai/configs {config: {input_mapping, prompt, config, model, usecase, outputs, list_id…}}` (save only), `POST /enrichment/ai/enrich {group_id, list_id, record_ids}` sync. `GET /enrichment/ai/configs?list_id=` requires a list. | Buildable; inner `AIConfigDto`/`outputs` shapes unverified → verify on the test list. |
| **Intelligence**: `POST /intelligence/analyze {website_url, force}`; `GET /intelligence/org-domain` → no domain configured. Webhook `intelligence.completed`. | Cheap to build; `force:false` on 8x.social likely returns fast (docs exist). |
| Booking: `POST /appointments/bookings {event_type_id, start_time, attendees[{name,email,time_zone}]}` ~20 credits; `GET /appointments/event-types/{id}/embed` exists (likely the public booking URL). | Zara books via API; booking link from `/embed` (verify). |
| `POST /sequences/{id}/contacts/{cid}/pause` exists. `POST /inbox/{id}/send {body, channel, subject?, from_address?}`. `SearchRequest` has no `capture` field (FAQ says body `capture:false`). | Zara/Bilal shapes known. |
| Gemini **`gemini-3.8-flash`** listed. Slack bot in `#sales-hq` `C0C49DG285V` + `#sales-team` `C0C4KMJMKK7`; Socket Mode opens. Supabase migration 001 + seed applied; anon denied on secrets. ngrok present; cloudflared not. `TEST_ALLOWLIST` empty. | No infra setup left except allowlist + Render. |
| `workspaces.settings jsonb` exists. | No migration. `WorkspaceSettings` type added to `shared/types.ts`. |

---

## 2. The demo storyline (Layer 0 in bold; layers add beats without moving the core)

```
0:00  pitch line
0:30  /hire-sales 8x.social         Ayesha 👀 + live checklist → plan card (target, why, alternatives, channels, team, budget)
                                    [L6 intent] "tracking 5 buying-intent keywords"   [L3 LinkedIn] ⚠️ LinkedIn not connected → Connect card
                                    [L2 voice] "voice agent Zara-Voice ready on +1 980 294 4116"
0:50  #sales-team                   Bilal thread: 10 real prospects (fit, reason, Open in graph8)  [L6] signal badges if any
1:20                                Hira thread: 5 research packs (hook, channels)  [L5 AI research] "graph8 research + Gemini"
1:50                                Usman thread: sequence in graph8: ✉️ D0 · in D1 ⏸ · ✉️ D3 · 📞 D5 · in D6 ⏸ · ✉️ D9
2:10  #sales-hq                     Launch card: timeline, first-email preview, "2 test leads enrolled · 5 prospects preview only"
2:30  founder clicks [Launch]       email on teammate's phone < 60 s
      (optional beat, L2)           founder: "@Ayesha call Ali now" → teammate's phone rings, AI voice agent pitches (30 s)
3:15  teammate replies "Interested — Tuesday 3pm works"
                                    Zara ≤ 15 s: stopped account · INTERESTED · Discovery call booked Tue 3pm · deal est. $X
                                    · #sales-hq 🎉 [Open in graph8]
4:15  /sales-standup                pipeline, credits per agent + real graph8 balance, per-agent detail in thread
4:30  "@Ayesha how's pipeline?"     one-line answer (L7)
      Agent Office on projector throughout
```

---

## 3. Why v1 cut each item — plain English, and what is truly blocked vs just risky

Legend: **BLOCKED** = cannot work today no matter how much we code · **RISKY** = API exists, shape or behaviour unverified ·
**TIME** = works, just costs hours · **TWEAK** = small rule change, not a cut.

**C1 AI voice call — RISKY (now much less; kept as Layer 2).**
There were zero voice agents and I could not see how to create one; creating one needs a "persona" and "identity" object whose
fields were not in the docs. I have since read the exact fields from the OpenAPI file and found `POST /voice/calls` with a
`dry_run` flag, so we can test without spending. Still unknown: whether a PHONE step inside a graph8 sequence dials by itself,
and what the call-result event looks like. If a live call fails on stage the phone just does not ring — nothing else breaks
if we place the call ourselves as a side step. Cost: ~2.5 h for one worker; ~20 credits per test minute.

**C2 LinkedIn steps — BLOCKED for sending, TIME for authoring.**
graph8 has 0 LinkedIn senders. Connecting one means graph8 must receive a Netrion API key, and there is no button, page, or API
route to give it that key (`GET /linkedin/connection` shows `api_key_hint: null`; the sync route answers "Connect your LinkedIn API
key first"). The teammate who tried for an hour hit the same wall (`docs/linkedin-connect-notes.md`). So LinkedIn steps cannot
send today. What we can do: author the steps in the graph8 sequence (LinkedIn is a real step type), show them as ⏸ in Slack and
the portal, post the Connect card, and auto-attach/resume when a sender appears. What needs a human: graph8 support or the
Chief of Staff agent to complete the Netrion key exchange, or a Unipile account (graph8 supports a `UNIPILE` step) — both
outside our code. Risk on stage: a LinkedIn step with no sender might stall the steps after it — that is why we verify first.

**C3 AI-generated email per lead + custom fields — RISKY.**
The spec wants graph8 to write each email at send time using Hira's hook saved on the contact. I could not confirm graph8's
AI reads contact custom fields, and I could not see the email before it goes out. If it fails on stage, the teammate gets a
generic or empty email — the worst possible beat. Kept as Layer 8 with a verify: send one AI-generated email to a teammate and
read it. Cost: ~1 h; the manual-template path stays as the default until the AI one is proven.

**C4 Intent tracking / buying signals — RISKY (data), TIME.**
Keywords can be added by API, but signals arrive as graph8 crawls pages and matches contacts; on a fresh org that may take hours
or days, so the demo could show "0 signals" after all the work. I found `create-from-search`, which pre-resolves pages and
contacts immediately, so same-day signals are plausible. If nothing shows up, Bilal's card honestly says "no signals yet" and
ranks on fit — nothing breaks. Cost: ~1.5 h.

**C5 graph8 AI research config — RISKY.**
The endpoint to save a research config exists but its inner fields (model names, output columns) are not documented; the run is
synchronous and billed per token. If it hangs or errors on stage, Hira's cards are late. We keep it as Layer 5 with a 30-second
cap and Gemini-only fallback per lead (already the spec's own fallback, H5). Cost: ~2 h.

**C6 "Analyze my website" for a new client — TIME, not demoable.**
8x.social already has its 23 docs, so this branch never runs on stage. Kept as Layer 4 (cheap now: `{website_url, force}` +
webhook/poll resume). Cost: ~45 min.

**C7 Edit auto-revise — TIME.**
Founder types a change → Usman rewrites the steps → patches the graph8 sequence → asks again. Nothing unknown; just a second
pass that can loop or produce a bad card if rushed. Kept as Layer 7. Cost: ~45 min.

**C8 Booking link + wait for the prospect to book — RISKY (URL shape), TIME (two round-trips on stage).**
I did not know the public booking URL. `GET /appointments/event-types/1/embed` likely returns it (free check). Two reply
round-trips inside a 5-minute demo is the real risk, so the scripted reply includes a time and Zara books at once; the booking
link is still sent in the reply (Layer 9) and `meeting.booked` still works for real clients.

**C9 09:00 cron + per-agent standup detail — TIME.** Trivial; kept (Layer 7). Sunday-evening demo never sees the cron.

**C10 Chat understanding — TIME.** Classifier + handlers; kept (Layer 7, ~1 h). Demo beat 4:30 uses it.

**C11 Hira's 3-minute enrichment wait — TWEAK.** Kept exactly as spec for real clients; on stage it never triggers because leads
are pre-warmed (enrichment cached). Nothing cut.

**C12 "Skip leads already in our pipeline" — TWEAK.** With pre-warming, the same 10 people come back on the live run; skipping
them would leave Bilal with nothing. Rule becomes: skip only leads already contacted/replied/closed; reuse fresh prospects.

**C13 `capture:false` on search — TWEAK.** The field is not in the schema; we send it anyway and check. If ignored, graph8 saves
search results into the CRM — harmless.

**C14 Seed data — resolved by founder.** Test workspace until 12:00, then wipe and go real.

**C15 Inbox polling — TWEAK.** Spec says poll every 20 s; we do 15 s and ignore threads older than the sequence launch so
rehearsal replies don't retrigger.

---

## 4. Layered plan

### Layer 0 — core end-to-end (MUST; nothing below may break it)

Exactly v1 §2 "IN" list: Ayesha P1/P2/P4/P5 (+D19), Bilal S2–S5, Hira R1/R2/R5/R6, Usman U-T2–U-T7 with `MANUAL_TEMPLATE`
emails, Zara Z-T1–Z-T7, server libs, Slack layer, inbound (poll + webhook), scripts. Sequence in graph8 = EMAIL D0 / EMAIL
D3 / EMAIL D9 at `demo_time_scale` (1 day = 1 min) on Demo 24/7, mailbox 1, `finish_on_reply`. Other steps are added by
layers **by patching the same sequence** (`POST /sequences/{id}/steps`? → verify; else create with all steps once L2/L3
verifies pass by 11:00, since steps are known at build time).

Every layer plugs in through one of four hooks, so Layer 0 code never changes:
- `onboarding.extras[]` (Ayesha P1 step 6) — each layer registers `{ name, run(ctx) }`; failures are caught, logged as ⚠️ on the
  checklist and `alert` reports, onboarding continues.
- `sequence.stepPlan` — Usman asks each layer for steps; a layer returns `{ step, state: 'live' | 'planned', reason }`.
  `planned` steps show in Slack/portal as ⏸ and are not sent to graph8 unless the layer says so.
- `research.sources[]` — Hira merges any extra facts (AI research, intent, company lookup) before the Gemini hook; a missing
  source is just fewer facts.
- `inbound.handlers[event]` — Zara/Usman register handlers for voice/LinkedIn/meeting events; unknown events are stored and
  ignored.

### Layers (owner = worker id in §5; Realistic = my estimate of finishing green by 17:30)

| L | Feature (spec refs) | Verify first (test workspace, allowlisted contacts) | Build | Stage fallback (automatic) | Human needed | Realistic |
|---|---|---|---|---|---|---|
| **L1** | Multi-step email sequence + send tracking (U3 email parts, U-T7) | V3: 1-step send to teammate, latency, merge tokens; `GET /sequences/{id}/contacts` states | in L0 | — | — | **High** |
| **L2** | **AI voice call** (U8/T15/U11/Z11/Z-T8): Ayesha creates voice agent at onboarding (`POST /voice/agents`, role "SDR", persona from brand voice, identity phone `+19802944116`, calendar 1); Usman's step "📞 D5" fires `POST /voice/calls {to_phone, from_phone, agent_id, event_id: 1, callback_url, contact_id}` at step time via our scheduler; result via `callback_url` + `voice_ai.call_completed` webhook + `GET /voice/calls/{id}/artifacts`; Zara maps disposition (Z11) | V-V1 create agent (free) → V-V2 `dry_run:true` call (free) → V-V3 real 1-min call to a teammate (~20 credits) → read artifacts/transcript + webhook payload | 2.5 h | Agent create fails → checklist ⚠️ "voice unavailable", step shown ⏸; call dispatch fails → `lead_events call_placed` failed + Usman note, sequence continues; no result event in 3 min → "call ended, no outcome" | Teammate's phone on, in E.164 in allowlist | **Medium** |
| **L3** | **LinkedIn steps** (U3 D1 connect + D6 message, D10, U9): Usman authors HEYREACH steps (`CONNECTION_REQUEST` w/ `linkedin_connection_message`, `MESSAGE` w/ `linkedin_message_text`), `state:'planned'` while `GET /linkedin/connection.connected=false`; Ayesha `connect_account` approval; **connection watcher** polls `/linkedin/connection` + `/workflows/integrations/linkedin/senders` every 60 s → on a sender: PATCH sequence to add/enable the steps, resume the paused LinkedIn contacts, flip approval to approved, post "LinkedIn connected — 2 touches now live" | V-L1: create a **draft** sequence with EMAIL → HEYREACH → EMAIL, enroll 1 teammate, run: does the email after the LinkedIn step still send with no sender? (decides whether LinkedIn steps go into graph8 now or only after connection). V-L2: `GET /appointments…`-style probe of `/linkedin/accounts` after any founder attempt | 1.5 h | Steps stay ⏸ in Slack + portal + (if V-L1 safe) in graph8; email/phone steps unaffected | **Yes — blocked**: graph8 support / Chief-of-Staff chat to finish the Netrion key exchange, or a Unipile account + graph8 config. Founder asks now; the watcher picks it up the moment it lands, even mid-demo | **Blocked** (authoring + Connect card + watcher: High) |
| **L4** | Intelligence analyze + resume (T2/D16) | V-I1 `POST /intelligence/analyze {website_url:'https://8x.social', force:false}` on the test workspace; expect fast "exists"; register `intelligence.completed` | 45 m | Failure → "Could not study the site, using what graph8 knows" + continue with docs | — | **High** |
| **L5** | graph8 AI research (T14/R4/H5): Ayesha saves one config (`usecase:'web-research'`, prompt from brand + persona docs, outputs `why_now`, `talking_points`) on the run list; Hira runs `POST /enrichment/ai/enrich` per batch with 30 s cap, merges text into `research.sources` before Gemini | V-A1 save config on test list (read back with `GET /enrichment/ai/configs?list_id=`); V-A2 run on 1 teammate contact; read result columns; note credits | 2 h | Timeout/error → Gemini-only hook (H5 fallback); card says "graph8 research pending" | — | **Medium** |
| **L6** | Intent tracking (T13/B10/S1/B7): Ayesha `create-from-search` with 5 keywords from `icp_research`/`pains_and_gains` (`contact_limit` 50) + `keywords/add signal_type:'jobs'`; Bilal reads `keywords/{id}/companies` + `/intent/abm/companies` → `signals[]` + B12 bonus; card shows signal badges | V-N1 create-from-search with 2 keywords on test workspace, wait 5 min, read companies; note credits (`/usage` diff) | 1.5 h | 0 matches → "no buying signals yet", fit-only ranking (B6) | — | **Medium** (code High, data uncertain) |
| **L7** | Edit auto-revise (U4/C7) · P3 chat (D5) · 09:00 cron (D11) · per-agent standup thread (D18) · pause/resume (T12) · settings changes (T11) | none (Gemini + DB) | 2 h | Edit fails → "Tell me in this thread" manual path; chat misclassified → "I can't do that yet" | — | **High** |
| **L8** | `AI_GENERATED_TEMPLATE` + contact custom field with Hira's hook (U7/U-T1) | V-T1 create field `sales_hook`, set on teammate contact; V-T2 one AI-generated step to teammate; read the email | 1 h | Email unreadable/late → keep `MANUAL_TEMPLATE` (default until V-T2 green) | — | **High** |
| **L9** | Booking link in Zara's reply + `meeting.booked` handling + reschedule/cancel events (Z5) | V-B1 `GET /appointments/event-types/1/embed` → URL; V-B2 open it, book as teammate (free? check) → webhook | 45 m | No URL → 2 plain-text slots; booking by API when a time is given (core) | — | **High** |
| **L10** | Render hosting (§7) | health endpoint, env vars, first deploy | 1 h | Laptop + ngrok hot spare | Founder: Render account + env paste | **High** |

Merge rule: a layer merges only after its verify step is green **and** Layer 0 acceptance still passes on the test workspace.

---

## 5. Worker tasks (Superset workers; disjoint files; each ends with SUPERSET_WORKER_DONE)

Branch flow: `W1a`+`W1b` → `build` (founder merges ~08:30) → all others branch from `build`; founder merges as each lands; W8
integrates. No worker touches `docs/portal/*`, `supabase/*`, `office/`. Test spends/writes are pre-approved: scripts still
print planned calls and require `--yes`, and the guard never lets a non-allowlisted contact be enrolled, emailed or called.

| ID | Task | Owns | Depends | Est. | Acceptance |
|---|---|---|---|---|---|
| W0 | Founder now: allowlist → `.env.local`; Render account; ask graph8 support / Chief of Staff about the Netrion key (L3); teammate phones charged | — | — | 30 m | — |
| W1a | Foundation: scaffold, `env/log/store/g8/llm`, `runtime.ts`, `index.ts`, layer hook registry (`src/layers.ts`), `scripts/{allowlist,reset-demo}.ts` incl. `--workspace test` | `server/package.json`, `tsconfig`, `src/index.ts`, `src/lib/*`, `src/agents/runtime.ts`, `src/layers.ts`, `scripts/allowlist.ts`, `scripts/reset-demo.ts` | W0 | 90 m | boots; pings Supabase, `/usage`, Gemini JSON; `reset-demo --workspace test --clean` creates/cleans test workspace; guard test passes; ledger moves `portal_agents` |
| W1b | Slack layer | `src/lib/slack.ts`, `src/slack/{blocks,commands,actions,events}.ts` | — | 75 m | `/hire-sales` ack + checklist edits; 5 personas; buttons reach `actions.ts`; `/sales-standup` stub |
| W2 | Ayesha (Layer 0 + L4 + L7) | `src/agents/ayesha.ts`, `src/slack/blocks/{plan,standup,connect}.ts` | W1a, W1b | 3 h | v1 W2 acceptance + analyze branch on a domain with no docs (test ws) + Edit re-ask + chat classifier + cron line |
| W3 | Bilal + Hira (Layer 0) | `src/agents/{bilal,hira}.ts`, `src/slack/blocks/{list,research}.ts` | W1a, W1b | 2 h | v1 W3 acceptance on the test workspace |
| W4 | Usman (Layer 0 + L1 + L8) | `src/agents/usman.ts`, `src/slack/blocks/launch.ts`, `src/inbound/send-poll.ts`, `src/scheduler.ts` (step timer for side steps) | W1a, W1b, V3 | 2.5 h | v1 W4 acceptance; L8 only if V-T2 green |
| W5 | Zara + inbound (Layer 0 + L9) | `src/agents/zara.ts`, `src/inbound/{webhook,inbox-poll}.ts`, `scripts/{simulate-reply,register-webhook}.ts`, `src/slack/blocks/{win,reply}.ts` | W1a, W1b, V4–V7 | 2.5 h | v1 W5 acceptance + booking link + `meeting.*` events |
| W6 | Scripts + hygiene + Render (L10) | `scripts/{prewarm,secret-scan.sh}`, `server/README.md`, `render.yaml`, `docs/DEMO-RUNBOOK.md` | W1a | 1.5 h | secret scan green; `render.yaml` deploys `build`; `/healthz` 200 on Render; webhook registered to the Render URL |
| **W9** | **Voice (L2)** | `src/layers/voice.ts` (onboarding extra `setup_voice_agent`, step plan `📞`, `POST /voice/calls` dispatcher, artifacts reader), `src/inbound/handlers/voice.ts`, `scripts/try-voice.ts` | W1a; V-V1..V3 | 2.5 h | `try-voice --yes` rings a teammate with the AI agent; disposition lands in `lead_events` + Zara reacts (booked → deal; callback → slots email); onboarding checklist shows "voice agent ready" |
| **W10** | **LinkedIn (L3)** | `src/layers/linkedin.ts` (step authoring, connection watcher, PATCH-on-connect), `scripts/try-linkedin.ts` (V-L1) | W1a; V-L1 | 1.5 h | V-L1 answered and recorded in this file; ⏸ steps in Launch card + portal; watcher flips to live when `connected:true` (simulate by env flag in test) |
| **W11** | **Intent (L6)** | `src/layers/intent.ts`, `scripts/try-intent.ts` | W1a; V-N1 | 1.5 h | keywords created at onboarding; Bilal merges signals (or "none yet") |
| **W12** | **graph8 AI research (L5)** | `src/layers/ai-research.ts`, `scripts/try-ai-research.ts` | W1a, W3 contract; V-A1/A2 | 2 h | config saved once; Hira merges text within 30 s or falls back |
| W7 | Portal engineer (unchanged brief) | `office/` | — | — | `docs/portal/04-acceptance.md`; real data from 12:00 |
| W8 | Integration + rehearsals (founder + 1 worker) | `build` | all | 12:30 → 17:30 | §6 checkpoints ×3 from `reset --stage` |

Founder load warning: 12 parallel workers means ~12 merges. Merge in this order to keep `build` green: W1a, W1b, W3, W2, W4,
W5, W6, then layers as they pass verify (W10 ⏸-only first, W9, W11, W12).

---

## 6. Timeline and checkpoints

| Time | Milestone | Proof |
|---|---|---|
| 07:00 | W1a, W1b, W6 start; W9–W12 start their **verify scripts only** (raw fetch, test workspace) | — |
| 08:30 | **L0-a** foundation on `build`; `/hire-sales` acks; guard test; test workspace exists | screen |
| 08:30–09:45 | V2 enrich, V3 send, V4 reply/poll/webhook, V5 booking, V6 deal + record URLs, V7 pause; **V-V1/V-V2 voice**, **V-L1 LinkedIn**, **V-N1 intent**, **V-A1 AI config**, V-B1 embed URL | results appended to §8 by each worker |
| 09:45 | Agent workers code with verified shapes | — |
| 11:30 | **L1** `/hire-sales` → plan + Bilal + Hira cards (test ws) | clip |
| **12:00** | wipe fake seed (`reset-demo --workspace demo --clean`), `WORKSPACE_ID` → demo, tell portal engineer | — |
| 12:30 | **L2** Launch → real email on phone (demo ws) | clip |
| 13:00 | First Render deploy of `build`; webhook re-registered to Render URL; laptop Slack connection off | `/healthz` |
| 13:30 | `secret-scan.sh` green → repo **public 14:00** | GitHub |
| 15:00 | **L3** reply → meeting + deal + 🎉 (real + simulated) | clip |
| 13:00–16:00 | Layers merge as verified: W10 ⏸ + watcher, W9 voice, W11 intent, W12 AI research, L7/L8/L9 | each: acceptance on demo ws |
| 16:15 | Feature freeze for layers; anything not green → fallback mode on (env flag per layer) | — |
| 16:30 / 16:55 / 17:15 | Rehearsals 1–3 from `reset --stage`; record backup video at 17:15 | 3× green |
| 17:30 | **Freeze** | tag |

Realistic finish by 17:30 (honest): L0, L1, L4, L7, L8, L9, L10 **yes**; L2 voice **~60 %** (agent create + dry-run likely; live
call result handling is the uncertain half); L6 intent **code yes, signals maybe**; L5 AI research **~50 %**; L3 LinkedIn
**authoring + Connect + watcher yes, sending no** unless a human unblocks Netrion.

If behind at 12:30: layers pause, everyone on L0 until L3 checkpoint passes.

---

## 7. Hosting on Render

- **Service**: one Render *Web Service* (Node 24, `pnpm -C server start`), Starter plan (free tier sleeps → Socket Mode
  drops; **must be paid**). Exposes `GET /healthz` and `POST /webhooks/graph8` on `$PORT`. Slack Socket Mode is outbound, no
  public events URL needed. Cron (09:00 standup, 15 s inbox poll, 60 s LinkedIn watcher, step scheduler) runs in-process —
  one instance only (`numInstances: 1`).
- **Env vars** (Render dashboard, never in repo; names match `.env.example`): `G8_API_KEY G8_BASE_URL G8_WEBHOOK_SECRET
  G8_DEMO_SCHEDULE_ID GEMINI_API_KEY GEMINI_MODEL SLACK_BOT_TOKEN SLACK_APP_TOKEN SLACK_SIGNING_SECRET SLACK_CHANNEL_TEAM
  SLACK_CHANNEL_HQ SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY WORKSPACE_ID PUBLIC_URL TEST_ALLOWLIST LAYERS_DISABLED` (comma list
  for stage fallbacks, e.g. `voice,ai_research`).
- **`render.yaml`** in repo root (W6): service, build `pnpm install --frozen-lockfile && pnpm -C server build`, health check
  `/healthz`, autoDeploy on `build` branch.
- **Webhook**: `register-webhook.ts` on boot: create or PATCH the graph8 webhook to `${PUBLIC_URL}/webhooks/graph8`; secret
  stored in `workspace_secrets` on first create (returned once) — founder pastes it into Render env as `G8_WEBHOOK_SECRET`
  after the first boot.
- **Only one Slack connection**: laptop spare runs with `SLACK_DISABLED=1` (pollers + webhook only) unless promoted; promoting =
  stop Render service, start laptop with ngrok, `register-webhook` PATCHes the URL.
- **Deploy step**: 13:00 first deploy; then on each merge to `build` (~2–3 min build). Rehearsals run against Render.

---

## 8. Verify-first log (workers append results here; test workspace, allowlisted contacts only)

| V | Test | Cost | Owner | Result (fill) |
|---|---|---|---|---|
| V1 | search filters + `capture:false` check | free | W1a | |
| V2 | enrich 1 teammate; `fields_config`; timing | ~5 | W3 | |
| V3 | 1-step email sequence to 1 teammate; latency; `/run` needed?; merge tokens | ~1 | W4 | |
| V4 | reply → inbox poll delay; webhook delivery (ngrok) | free | W5 | |
| V5 | booking on event type 1 for a teammate; Meet link | ~20 | W5 | |
| V6 | deal in Sales Pipeline; record URLs → `docs/graph8-app-links.md`, portal `RECORD_VERIFIED` | free | W5 | |
| V7 | per-contact pause | free | W5 | |
| V8 | Gemini JSON mode + usage tokens | ~0 | W1a | |
| V-V1 | `POST /voice/agents` (role SDR, persona from brand docs, identity phone/calendar) | free | W9 | |
| V-V2 | `POST /voice/calls dry_run:true` to teammate | free | W9 | |
| V-V3 | real 1-min call; artifacts/transcript; `voice_ai.call_completed` payload | ~20 | W9 | |
| V-L1 | draft sequence EMAIL→HEYREACH→EMAIL with no sender: does the second email send? | ~1 | W10 | |
| V-N1 | `intent/keywords/create-from-search` 2 keywords; companies after 5 min; credits | few | W11 | |
| V-A1/A2 | save AI config on test list; run on 1 teammate; outputs | tokens | W12 | |
| V-I1 | `intelligence/analyze` 8x.social `force:false` | 0–? | W2 | |
| V-B1 | `GET /appointments/event-types/1/embed` → booking URL | free | W5 | |
| V-T1/T2 | custom field + one `AI_GENERATED_TEMPLATE` email to teammate | ~1 | W4 | |

---

## 9. Risks and fallbacks (v1 table still applies; additions)

| Risk | Signal | Fallback |
|---|---|---|
| LinkedIn step with no sender stalls later steps (V-L1) | V-L1 red | LinkedIn steps live only in our plan until connected; graph8 sequence built without them; watcher PATCHes them in on connect |
| Voice call rings but result never arrives | V-V3 | `callback_url` + webhook + 3-min poll of `/voice/calls/{id}/artifacts`; else "call ended, no outcome" |
| Voice agent talks nonsense | V-V3 listen | persona tightened from `elevator_pitch` + `compliance_rules` docs; `outbound_instructions` = 30-second script; disable via `LAYERS_DISABLED=voice` |
| Intent creates cost per event | `/usage` diff after V-N1 | cap at 5 keywords, `contact_limit` 50 |
| AI research slow | > 30 s | cap + fallback; run in parallel with enrichment (H8) |
| Render cold start / sleep | health check | paid instance; laptop spare |
| Two Slack connections (laptop + Render) split events | odd missing acks | `SLACK_DISABLED=1` on the spare |
| 12 merges overwhelm the founder | `build` red | merge order §5; layers behind an env flag so a red layer never blocks L0 |
| Test workspace and demo workspace share Slack channels before 12:00 | confusion | `WORKSPACE_ID` env selects the routed workspace; test run messages prefixed `[test]` by `postAs` when `is_demo=false` |

---

## 10. Pre-warm and demo-day runbook

**T-60 (17:00)** — Render live; `register-webhook` done; `reset-demo --workspace demo --clean`; `allowlist`; `prewarm` (P1+P2 to
the Launch card incl. layers, ~3 min, then `reset --stage`: leads/contacts/settings/voice agent/intent keywords kept; tasks,
reports, approvals, sequences, runs, credits wiped; workspace `onboarding`; bot messages cleared from both channels).
Projector: Agent Office empty state. Teammate: Gmail + phone ringer on. graph8 tabs: Deals pipeline, Sequencer.

**T-10** — `/sales-standup` in a DM to warm Gemini; delete. Live dot green.

**Demo** — §2. Reply text: "Interested — Tuesday 3pm works for me." Backups: `simulate-reply` (20 s rule); voice beat skipped
if `LAYERS_DISABLED` has `voice`; LinkedIn always shown as the Connect beat (honest: "one click for the founder, not ours").

---

## 11. Changes made by this task (v1 + v2)

- `docs/BUILD-PLAN.md` — v2 rewrite (this file).
- `shared/types.ts` — `WorkspaceSettings` + `DEFAULT_WORKSPACE_SETTINGS`; `WorkspaceRow.settings` typed (v1; `tsc --strict` green,
  column diff green). v2 adds optional `g8_voice_agent_id`, `g8_intent_keyword_ids`, `g8_ai_research_group_id`, `linkedin_connected`.
- `docs/IMPLEMENTATION-PLAN.md` — superseded banner (v1).
- No migration, seed, portal doc, or agent spec edits.

---

## 12. Open questions for the founder

1. **LinkedIn (L3)**: will you contact graph8 support / the Chief-of-Staff chat now about the Netrion key exchange, or try a
   Unipile account? Without one of these, LinkedIn cannot send today; everything else about it ships.
2. **Voice on stage**: include the live call beat only if V-V3 sounds good to you (you will hear the recording by ~11:00)?
   Default: include, with `LAYERS_DISABLED=voice` as the kill switch.
3. **Render plan**: Starter (paid) is required so the Slack socket never sleeps — OK?
4. **Merge capacity**: 12 workers → ~12 merges on you. Want W8 (integration worker) to own merges into `build` from 12:30?
5. Deal amount: Gemini over `pricing_matrix` ("est.") with $12,000 fallback — OK?
6. Which teammate replies / answers the phone on stage (one person, one number, one email)?

### Founder answers (06:50 PKT)

1. LinkedIn (L3): show "waiting to connect" for now; founder asks graph8 mentors about the Netrion key exchange at the office (~12:00). L3 ships authoring + Connect card + watcher.
2. Voice (L2): include the live call beat only if the V-V3 test recording sounds good (~11:00); `LAYERS_DISABLED=voice` kill switch.
3. Render: paid Starter plan (always on). Founder creates account + pastes env vars.
4. Merges: lead Claude (coordinator) reviews and merges every layer, not a separate integration worker.
5. Test spends/writes: approved, including beyond the estimate; workers don't ask again (allowlisted test contacts only).
6. Fake seed stays until 12:00; test workspace before that.
7. Allowlist set in .env.local (Zaeem zaeem@8x.social, Abbas, Afshan). Deal amount: Gemini estimate from pricing_matrix, $12,000 fallback (confirmed).
