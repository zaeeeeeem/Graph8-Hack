# Run Graphi on a different graph8 account

Use this when someone else's graph8 key (a judge, a friend, a fresh empty org) should power the team, and
`/hire-sales <any website>` should work on that account. It shows up in their graph8 app and in our portal.

## 5 steps

**1. Put the new key in `.env.local`. Don't paste it anywhere else.**
```
NEW_G8_API_KEY=<their key>
```

**2. Dry run: check the key and read the readiness report.**
```
pnpm -C server exec tsx ../scripts/switch-org.ts --key-from-env NEW_G8_API_KEY --workspace demo
```
The script checks the key (`/usage` + org name) and prints credits, mailbox, calendar, LinkedIn, AI-calling number,
pipelines, event types, sending schedule and company docs. Anything marked ❌ comes with the graph8 page to fix it:

| Gap | What happens without it | Where to fix it |
|---|---|---|
| Mailbox ❌ | Emails **cannot send**. Research and the sequence still get built. | https://app.graph8.com/studio/settings?tab=mailboxes&category=personal |
| Calendar ❌ | No booking link and no meeting type. Zara offers plain-text times. | https://app.graph8.com/profile?tab=connectors (Google Calendar), then https://app.graph8.com/appointments?tab=bookings |
| LinkedIn ❌ | LinkedIn steps stay ⏸ (optional) | https://app.graph8.com/profile?tab=connectors |
| AI-calling number ⚠️ | Voice step stays ⏸ (optional) | Ask graph8 staff to set up a Voice AI number |
| Credits < 1,000 | One run costs roughly 100–300 credits | graph8 billing |

Ayesha creates the pipeline, the "New Meeting" stage, the 24/7 sending schedule and the 30-min "Discovery call" at
`/hire-sales` if they're missing. You don't need to set those up.

**3. Connect the ❌ items in their graph8 app.** Most important: a mailbox, then a calendar. Run step 2 again until
Mailbox is ✅.

**4. Switch.** This wipes the workspace, including all settings (every graph8 id belongs to the old org). It keeps the
5 agents and their budgets, re-seeds the test allowlist and changes `G8_API_KEY` in `.env.local`. The old file is
saved as `.env.local.bak`. It comments out `G8_DEMO_SCHEDULE_ID` and `G8_WEBHOOK_SECRET`, which belong to the old org.
```
pnpm -C server exec tsx ../scripts/switch-org.ts --key-from-env NEW_G8_API_KEY --workspace demo --yes
```
On Render, set `G8_API_KEY` to the new key and **delete** `G8_DEMO_SCHEDULE_ID` and `G8_WEBHOOK_SECRET`. Then restart
the server and run `pnpm -C server exec tsx ../scripts/register-webhook.ts` so graph8 events reach us. Inbox polling
works even without the webhook.

**5. Hire.** In Slack: `/hire-sales linear.app` (any site). Ayesha:
- uses the org's graph8 docs only if they're about **that** domain. Otherwise she reads the site's homepage and /about
  page right away, so the team starts in seconds. She never pitches the org's own company for someone else's site.
- starts graph8's deep study of the site in the background and adds it to the company brain when it finishes. It
  takes minutes to tens of minutes.
- finds or creates the schedule, pipeline, stage and meeting type, and saves their ids in the workspace settings.
- posts a Connect card for any missing mailbox, calendar or LinkedIn and says plainly what can't run yet.

To go back to the old org: `cp .env.local.bak .env.local`, then run
`reset-demo --workspace demo --clean --settings --yes`, then `allowlist --workspace demo`, then restart.

Only the test contacts in `TEST_ALLOWLIST` are ever emailed, called or booked, on any org. The guard is in code.
