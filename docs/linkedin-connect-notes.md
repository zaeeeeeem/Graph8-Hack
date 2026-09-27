# LinkedIn / Netrion connect — findings (2026-09-27)

## Org confirmed correct
- graph8: zaeemulhassanyt@gmail.com, org "Hackathon zaeemulhassanyt", 9,118 credits. Only user in org (Team Members page, Studio > Global > Organization > Users).
- Avatar menu shows workspace switcher entry "Hackathon zaeemulhassa..." selected — no login needed, already correct org.

## Where LinkedIn lives in graph8 (checked all 3 spots)
1. Avatar → Profile → Connectors tab → LinkedIn card → "Sending account" → status **"Not connected"**. Clicked "Connect LinkedIn" → opens `https://app.netrionlabs.com/settings/accounts` in new tab (not an OAuth/consent screen — just Netrion's own Settings > Accounts page). Clicked "Refresh status" → still "Not connected".
2. Studio → Settings → Channels → LinkedIn Accounts → **"No LinkedIn accounts connected"**.
3. No separate Integrations/workspace-selection page found under Settings; LinkedIn Accounts (item 2) is the only channel-level LinkedIn page.

## API checks (read-only, via .env.local G8_API_KEY)
```
GET /linkedin/connection                          -> connected:false, accounts_count:0
GET /integrations/linkedin-outreach/connection     -> connected:false, workspace_configured:false
GET /integrations/linkedin-outreach/workspaces     -> 400 "the LinkedIn outreach platform not connected. Please login first."
GET /integrations/linkedin-outreach/workspaces/active -> connected:false, workspace_configured:false
GET /integrations/linkedin-outreach/accounts       -> 400 "Not connected to the LinkedIn outreach platform. Please login first."
GET /linkedin/accounts                             -> accounts:[], total_count:0
```
No write calls were made — nothing to sync/select since there is no connection to sync from.

## Root cause
The Netrion tab that "Connect LinkedIn" opens is logged in as **zaeem@8x.social**, workspace **"8x"** — a different account/workspace than graph8's org. In that Netrion workspace, Settings → Accounts shows exactly one connected LinkedIn seat: **"Moazam Ali"** (Owner, Classic, Connected). This is not the user's own LinkedIn — it belongs to a teammate on the "8x" Netrion workspace. There is no LinkedIn account under Netrion belonging to zaeemulhassanyt/graph8's org.

No "Sync from LinkedIn" or graph8-side reconnect will fix this, because there is nothing on the graph8 side to sync — the gap is upstream: no LinkedIn seat owned by the user exists inside Netrion at all.

## What the user must still do
Pick one:
1. In Netrion (app.netrionlabs.com/settings/accounts, workspace "8x", logged in as zaeem@8x.social) click **"Connect account"** and log in with their own LinkedIn credentials/2FA — an agent should not do this (credential entry is out of scope). After that, come back to graph8 Profile → Connectors → LinkedIn → "Refresh status" (or "Sync from LinkedIn" in Netrion) to pick it up.
2. If "Moazam Ali" is actually meant to be the shared/team sending account for graph8 outreach (not the user's personal profile), confirm explicitly — then the link can be attempted using that seat instead of a personal one.

Not attempted: no LinkedIn login, no linking of Moazam Ali's account without explicit user confirmation (ambiguous whose account it should be), no write calls (nothing available to sync/link).

## Update 2026-09-27 (after user re-logged into Netrion as zaeemulhassanyt@gmail.com)

User confirmed they logged into Netrion themselves as zaeemulhassanyt@gmail.com (matches graph8 exactly). Netrion dashboard: "Good morning, zaeemulhassanyt", 1 connected account — **Moazam Ali** (Owner, Classic, Connected). This is presumably the user's own LinkedIn (display name may just be a persona/test name); treated as authorized going forward.

Tried, in order:
1. graph8 Profile → Connectors → "Refresh status" — stayed "Not connected".
2. Netrion → Settings → Accounts → "Sync from LinkedIn" — no visible effect; **this action unexpectedly logged Netrion out** to `auth.arlink.netrionlabs.com/en/login` mid-click. Did not touch the login form (Google/Microsoft/SSO/email+password shown) — user had to log back in manually.
3. After user re-logged in: repeated Netrion "Sync from LinkedIn" + graph8 "Refresh status" — still "Not connected".
4. Allowed API writes tried: `POST /integrations/linkedin-outreach/connection/reconnect` → `{"success":false,"message":"No the LinkedIn outreach platform connection found. Please login.","requires_login":true}`. `POST /linkedin/accounts/sync` → 400 `"Connect your LinkedIn API key before syncing accounts."`. `POST /inbox/linkedin/accounts/sync` → 400 `"HeyReach not configured for this workspace"` (graph8's inbox/sequencer LinkedIn step type is literally named `HEYREACH`, not `LINKEDIN` — suggests the org's outreach provider config points at HeyReach, not Netrion, even though the user's seat lives in Netrion).
5. `GET /integrations/linkedin-outreach/workspaces` (and `/workspaces/sync`) → still 400 `"the LinkedIn outreach platform not connected. Please login first."` even after Netrion browser session was valid.
6. Found a Netrion API key already generated, named **"for graph8"**, scopes Accounts/Outreach/Account settings/Webhooks, created ~19 min before I checked, **Last used: never** (Settings → API keys in Netrion). No UI anywhere in graph8 (Profile/Connectors, Studio Settings → Channels/Engage/Integrations, Sequencer → Settings) has a field to paste this key or any equivalent "enter your Netrion API key" step. The existing graph8 "Connect LinkedIn" link is a plain `https://app.netrionlabs.com/settings/accounts` link — no OAuth redirect, no query params, no callback.
7. Checked graph8's own MCP tool `g8_workflow_list_linkedin_senders` → `{"senders":[],"total_count":0}` — org-side confirms zero senders, independent of the browser session.
8. `g8_tool_search` for linkedin/netrion connect tools → no tool exists to programmatically complete this handshake either.

**Conclusion: this is not completable through the web UI or the available graph8 API/MCP surface as currently exposed.** graph8's backend expects some server-to-server handshake with Netrion (consistent with the orphaned "for graph8" API key and the `api_key_hint` field on `/linkedin/connection`) that has no corresponding button/field in the product today, or it is gated on the "HeyReach" provider being configured instead of/alongside Netrion. Recommend the user either use graph8's in-app support (`Contact Support` / the onboarding "Chief of Staff" agent, which already asked about setting up LinkedIn this week) or check with graph8/Netrion directly about the missing key-exchange step.
