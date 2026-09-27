# Handoff note (paste to the front-end engineer)

Hi — here is the Agent Office portal brief. You can build it end-to-end without us; the database is
already seeded with a realistic fake day.

**What it is:** a read-only, live web page showing a founder's AI sales team (5 agents in an org chart)
at work. The founder acts in Slack; sales actions happen in graph8. The portal answers: is my team
working, what needs me, what did it achieve. Judges watch it on a projector while things move live.

**Read, in order (all in `docs/portal/`):**
1. `00-README.md` — purpose, scope + cut order for ~10 h, tech, setup, how to work against seed data
2. `01-data-access.md` — exact tables/views/columns per screen, realtime hook, link rules, SQL snippets that make the seeded data move
3. `02-screens.md` — each screen with loading/empty/error/live states
4. `03-vocabulary.md` — the only words and status colours allowed
5. `04-acceptance.md` — checklist we will test against, demo timing

Contract files: `shared/types.ts` (copy into the app), `docs/SCHEMA.md`, `supabase/seed.sql`.

**Access:** you get our project's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sent separately,
never commit them). Anon key reads only the demo workspace and never sees emails/phones. No other keys needed and
no writes possible from your side; ask us to run the "make it move" SQL snippets when you want to test realtime.
Workspace id: `a0000000-0000-4000-8000-000000000001`. Code goes in `office/` in this repo (branch `portal`).

**Must-haves, in build order:** shell + realtime → Office (org-chart **canvas with pan/zoom/fit**, needs-you banner,
today strip) → task drawer → pipeline → empty state. Then needs-you page, reports, agent detail if time.
graph8 link paths in `lib/links.ts` are placeholders; we send verified patterns later.
**Never:** write actions, Approve buttons, showing PII, spinner pages, a login.

**Deadlines (PKT, Sun 27 Sep):** Vercel URL by 16:30 for rehearsal, code freeze 17:30, demo 18:00.

Questions → Slack us; if unsure, follow the docs literally and note the assumption in your README.
