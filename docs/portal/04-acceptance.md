# Acceptance checklist and demo timing

Code freeze **Sun 27 Sep 17:30 PKT**, demo 18:00. Projector: 1920×1080, one browser tab, no scrolling on the
Office screen. Deploy to Vercel by 16:30 so we can rehearse against the live database.

## A. Must pass (with the seeded workspace, no server running)

Shell
- [ ] `/` loads in < 2 s on cold start; skeletons, never a spinner page.
- [ ] Live dot shows connected; disconnecting Wi-Fi turns it grey; reconnecting restores updates without reload.
- [ ] No console errors; no request to a private table (`workspace_secrets`, `lead_contacts`, `contact_allowlist`, `run_steps`, `inbound_events`).
- [ ] Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_WORKSPACE_ID`, `NEXT_PUBLIC_G8_APP_URL` in env. No service key anywhere.

Office
- [ ] Org chart canvas: Founder → Ayesha → Bilal, Hira, Usman, Zara, in `sort_order`, SVG edges drawn; drag pans, wheel zooms, Fit button and fit-on-load; fits 1920×1080 with all six cards readable; nodes not draggable.
- [ ] Seed state shows: Ayesha "Waiting on you" (badge) on "Connect LinkedIn so steps 2, 3 and 6 can send", Zara "Working" (pulsing) on "Sara Malik (Northwind) replied — interested", others Idle.
- [ ] Budget (credits today / 100,000): Ayesha 38, Bilal 12, Hira 37, Usman 24, Zara 5.
- [ ] Today strip (seed): 8 found · 4 contacted · 3 replies · 1 meeting · 1 deal ($12,000) · 116 / 500,000 credits · 1 needs you.
- [ ] Global banner: "1 thing needs you — Connect LinkedIn so 3 of 7 touches can send · Decide in Slack".
- [ ] Snippet 1 in `01-data-access.md` §6 → Bilal's card turns Working with "Find batch 2: UK fintech CFOs" within ~1 s, no reload.
- [ ] Snippet "spend 40,000" → Hira's number jumps; snippet "auto-pause" → Hira shows Paused · over budget and the global banner appears.
- [ ] Snippet "founder approves" → needs-you banner disappears, Ayesha turns Working, T-7 turns In progress.

Task drawer
- [ ] Click Zara's current task → drawer: T-6, Handle reply, In progress, assignee Zara, detail text, result "Classified INTERESTED … Sent 3 discovery-call slots … Waiting for her pick", tree shows T-1 root with T-2..T-7 nested (all children of T-1), Zara's report "Sara (Northwind) replied — interested", lead link "Sara Malik · Northwind Fintech", Open in Slack link `https://slack.com/archives/C0C4KMJMKK7/p1790000000000600`.
- [ ] Click Ayesha's current task → T-7 shows "Blocked · waiting on your decision: Connect LinkedIn in graph8" and the approval "Connect LinkedIn so 3 of 7 touches can send" with Decide in Slack.
- [ ] Inserting a report (snippet 2) appears in the open drawer without reload.

Pipeline
- [ ] Funnel: Prospects 2 (Mariam, Hamza) · Contacted 2 · Replied 1 · Meetings 1 · Deals 1 ($12,000) · 1 closed out.
- [ ] Table: Sara first (most recent activity), "test contact" badge on Sara only, Ali muted with "wrong person", Zainab shows $12,000 · Discovery and "Open deal in graph8".
- [ ] Sara's timeline (if drawer built) top entries: "Waiting for Sara to pick a slot", "Replied with 3 slots … (auto-sent …)", "Classified as INTERESTED".
- [ ] No email/phone/LinkedIn anywhere.
- [ ] Snippet "meeting booked for Sara" → she moves to Meetings, strip updates, timeline drawer (if built) gets the new event on top.

Empty state
- [ ] Temporarily set the workspace `status='onboarding'` → full-page onboarding EmptyState with `/hire-sales 8x.social` and Open #sales-hq.

Links
- [ ] Every Slack link uses the `slack.com/archives/{channel}/p{ts-without-dot}` form and opens a new tab.
- [ ] graph8 links only render when the id is non-null; all built from `lib/links.ts`.

## B. Should pass (if built)
- [ ] Needs-you page lists the pending LinkedIn connect decision ("linkedin · steps 2, 3, 6") and a "Recent decisions" section with the approved launch.
- [ ] Reports page: standup renders pipeline + credits tables from `data`; Win row is visually distinct; filter chips work.
- [ ] Agent detail: Hira shows 7 graph8 ledger rows of 3 credits + 1 LLM row of 16 credits (16,000 tokens), 1 run "Enriched 7 contacts…", 1 done task.

## C. Demo timing (what the portal must survive)

| t | What happens in Slack/server | Portal must show |
|---|---|---|
| 0:30 | `/hire-sales` → Ayesha posts plan | cards light up one by one (Working), T-1 appears |
| 1:30 | Bilal, Hira, Usman report up | handoff reports appear; found/contacted counters climb; budget bars move |
| 2:30 | Founder clicks Launch in Slack | banner "needs you" appears then clears; sequence live |
| 3:15 | Teammate replies → Zara | Zara Working; Replied bucket +1; timeline shows "Replied"; meeting booked; Deals +1 with $ value |
| 4:15 | `/sales-standup` | standup report at top of Reports / "Latest from the team" |

Before the demo we run `supabase/seed.sql` to reset, then the server pre-warms. The portal must handle a
**full reset** gracefully: rows disappear and reappear with new ids — never crash on a missing row
(drawer for a deleted task → close it; agent map miss → "Team").

## D. Hand-back
- Code in `office/` in this repo on branch `frontend` (PR to `main`), `office/README.md` with `pnpm dev`, Vercel URL, and the env names above.
- A 20-second screen recording of the Office screen reacting to snippet 1 (we keep it as backup for the pitch).
