# Demo runbook — 27 Sep 2026, demo 18:00 PKT

Follow in order. Times are targets, not gates — if a step is late, keep going; layers degrade, they don't block.
Full context: `docs/BUILD-PLAN.md` §6 (timeline) and §10 (pre-warm). Kill switches: `LAYERS_DISABLED` env
(comma list, e.g. `voice,ai_research,intent,linkedin`), `SLACK_DISABLED=1` on the laptop spare.

## T-60 (17:00) — setup

- [ ] Render service is live and green: `curl $PUBLIC_URL/healthz` → `200`.
- [ ] `register-webhook.ts` has run against the Render URL; `G8_WEBHOOK_SECRET` is set in Render env (paste from the
      script's one-time output if this is the first run).
- [ ] `reset-demo.ts --workspace demo --clean` — wipes fake seed, keeps leads/contacts/settings/voice
      agent/intent keywords, wipes tasks/reports/approvals/sequences/runs/credits, sets workspace to `onboarding`,
      clears bot messages from `#sales-team` and `#sales-hq`.
- [ ] `allowlist.ts` — confirms `TEST_ALLOWLIST` (Zaeem zaeem@8x.social, Abbas, Afshan) resolves in graph8.
- [ ] `prewarm.ts` — runs Bilal + Hira ahead so the Launch card is instant on stage (~3 min); confirms whichever
      layers are enabled (voice/intent/AI research) so stage timing doesn't wait on live search/enrichment.
- [ ] `reset-demo.ts --stage` — clears run-scoped state again after prewarm so the on-stage run is fresh.
- [ ] Projector: Agent Office view, empty state.
- [ ] Teammate: Gmail open, phone ringer on, phone number matches the allowlist entry that will answer on stage.
- [ ] graph8 tabs open in browser: Deals pipeline, Sequencer.

## T-10 (17:50) — warm + verify

- [ ] `/sales-standup` as a DM to the bot — warms the Gemini call path; delete the message after.
- [ ] Confirm the Slack app's "green dot" (online) status.
- [ ] Confirm only one Slack connection is live (Render primary; laptop `SLACK_DISABLED=1` if running as spare).

## Demo script (5 min, `docs/BUILD-PLAN.md` §2)

| Time | Beat | Command / action | Fallback |
|---|---|---|---|
| 0:00 | Pitch line | — | — |
| 0:30 | `/hire-sales 8x.social` in `#sales-team` | founder types command | if Ayesha's plan card is slow, narrate over the live checklist — it's still moving |
| 0:50 | Bilal thread: 10 real prospects | auto | if `LAYERS_DISABLED` includes `intent`, no signal badges — ranking is fit-only, say so |
| 1:20 | Hira thread: 5 research packs | auto | if `ai_research` disabled, packs are Gemini-only — still real, just say "Gemini research" not "graph8 + Gemini" |
| 1:50 | Usman thread: sequence built | auto | if `linkedin` disabled/blocked, LinkedIn steps show ⏸ "waiting to connect" — expected, say it's one click for the founder |
| 2:10 | `#sales-hq` Launch card | auto | — |
| 2:30 | Founder clicks **Launch** | click | email should land on the teammate's phone in < 60 s; if slow, keep talking through the checklist |
| (optional) | `@Ayesha call Ali now` | founder types in thread | if `LAYERS_DISABLED` includes `voice`, skip this beat entirely (per founder's kill-switch decision) |
| 3:15 | Teammate replies "Interested — Tuesday 3pm works" | teammate sends real reply | if inbox delivery is slow, run `scripts/simulate-reply.ts` after the 20-second rule (§10) |
| — | Zara reacts ≤ 15s | auto | if it stalls, check `/healthz` and Supabase `inbound_events` for a stuck row |
| 4:15 | `/sales-standup` | founder types command | — |
| 4:30 | `@Ayesha how's pipeline?` | founder types in thread | if chat classifier misses, Ayesha replies "I can't do that yet" — not a crash, just say "next question" and move on |

## Rehearsals

Run this whole script 3× before 17:30 from a clean `reset-demo.ts --stage`, at 16:30 / 16:55 / 17:15. Record a
backup video at 17:15 in case of live failure on stage.

## Layer flags cheat-sheet

Set in Render env `LAYERS_DISABLED` (comma list) if a layer misbehaves in rehearsal:

- `voice` — skips the AI call beat; sequence's phone step becomes a no-op note instead.
- `linkedin` — LinkedIn steps stay ⏸ everywhere (this is also the default state until graph8 support unblocks Netrion).
- `intent` — Bilal ranks on fit only, no signal badges.
- `ai_research` — Hira uses Gemini-only research packs.

## If something breaks on stage

1. Don't debug live — narrate what *should* happen and move to the next beat.
2. If Slack itself is unresponsive, promote the laptop hot-spare (see `server/README.md` § hot-spare laptop mode).
3. If graph8 itself is down, fall back to the 17:15 recorded video.
