# VNUM — how to get an AI-calling number in graph8

## TL;DR
graph8's AI-calling numbers are **only** provisioned through graph8's own "Get a new number" purchase flow inside Engage → Dialer. A Twilio number bought outside graph8 (our +1 980 294 4116, capability "Dialer", A2P Pending) does **not** become an AI-calling number by itself — there is no "convert/assign this Twilio number to an agent" action anywhere in the UI or API. The `agent-phone-numbers` list is empty because the org has never bought a number *through graph8's own flow*.

## Click-path (read-only, verified)
1. Top nav → **Engage** → **Dialer** (`app.graph8.com/dialer`).
2. Click **Start dialing a new list** (top-right button). Opens "Start dialing a new list" modal.
3. Under "How you'll dial" → **Call from** field shows: *"You don't have a dialer number yet — open the dropdown and get one."*
4. Click the **Call from** dropdown → shows "Phone Numbers" search box, "All Areas" toggle, **"No numbers found"**, and a link: **"+ Get a new number"**.
5. Click **+ Get a new number** → opens **"Get a new number"** modal: *"Search and buy a dialer number — it's assigned to you and set as your caller ID."*
   - Fields: Country (US +1), Number Type (Local/Toll-free), Area Code (optional), Search By (Number/Phrase), Digits or Phrase, Match To.
   - Click **Search** (read-only, no purchase) → returns a paginated table (30 results) of available numbers, columns: Number | Location | **Buy** button.
   - No price is shown in the table or anywhere before clicking **Buy** — the price/cost only appears after clicking Buy (not clicked, per read-only instructions).
6. STOPPED HERE. The button that would provision the number is labeled **"Buy"** next to each number row. No price was observed since clicking it was avoided.

## Where "Usman" fits in
- Agents → Agents list shows 3 "Usman" (SDR) rows (looks like duplicate/template agents). One (`agent_id f5377a72-3c74-4931-9379-40a9baee5290` — note: **not** the `846a1d2c-...` id given in the task, so there may be more than one Usman agent) shows Phone = **+19802944116** on its Overview/Identity pages (read-only display).
- Opening **Edit → Identity** tab for that same agent shows the "Phone (optional — skip if this agent is for dialer)" dropdown **empty**, and it never populates with options (matches `available_numbers=[]` from the API) — i.e. the UI has no number to actually assign either, despite the overview page showing +19802944116 as if bound. This is either stale/cached display data or a number that was bound directly via API/backend and isn't in the assignable pool the frontend queries.
- There is no "Assign to agent" or capability-toggle control anywhere for the existing Twilio dialer number.

## API side
- No MCP voice tool exists to buy/provision a number. `g8_voice_list_numbers` (list only) is the only numbers-related read tool; no `g8_voice_buy_number` / `g8_voice_assign_number` tool exists in the activated or searched tool set (`g8_tool_search` for "voice", "phone number", "buy phone number", "provision" surfaced only list/session/agent-upsert tools).
- `g8_voice_upsert_agent` takes a `phone` param (E.164) to bind a phone to an agent, but the docstring says it's rejected if not a valid E.164 — it does not by itself make an arbitrary Twilio number an "AI-calling number"; the earlier `POST /voice/calls` 422 confirms the backend checks `from_phone` against the org's AI-calling number pool (`GET /voice/agent-phone-numbers`), which is populated by whatever graph8's own buy flow provisions — not by owning a Twilio number.
- Did not reach be.graph8.com OpenAPI or docs.graph8.com pages in the 20-minute window (browser + MCP exploration used the full budget); the UI flow above is the authoritative, confirmed path.

## Can the existing Twilio number (+1 980 294 4116) be converted/assigned to the agent?
No mechanism found. It shows up nowhere in the "Get a new number" (buy) flow, nowhere in the agent phone dropdown, and there's no "bring your own number" / "import Twilio number" control anywhere explored (Agents, Dialer, Settings via top nav). It is a dialer-only number per the original 422 error and stays that way until graph8 exposes a BYO-number import path (not found).

## Recommended 3-step instruction for the founder
1. Go to **Engage → Dialer → Start dialing a new list → Call from dropdown → "+ Get a new number"**.
2. Search (any Area Code is fine) and click **Buy** on a number — this purchases a *graph8-managed* AI-calling number (check price shown in the Buy confirmation before accepting).
3. That new number will then appear in `GET /voice/agent-phone-numbers` / the Agent's Identity → Phone dropdown — assign it to Usman there, or pass it as `from_phone` to `POST /voice/calls`. The existing +1 980 294 4116 Twilio number cannot be reused for AI calls; keep it for the power dialer only, or contact graph8 support about a BYO-number import if you want to use it for AI calls.
