# Ayesha — Voice CRM Assistant

**Talk to your graph8 CRM in plain English.**

Ayesha is a voice AI assistant powered by [Vapi](https://vapi.ai) + [Deepgram](https://deepgram.com). She answers questions about your deals, clients, and meetings — delegating all data lookups silently to **Bilal**, a backend agent that queries graph8 (currently mocked).

---

## What's Real vs. Mocked

| Component | Status | Notes |
|---|---|---|
| Vapi voice call (browser) | ✅ Real | Uses `@vapi-ai/web` SDK |
| Deepgram transcription (STT) | ✅ Real | `nova-2` model, your own API key |
| ElevenLabs / TTS voice | ✅ Real | Set in Vapi assistant config |
| Function-call webhook (`/api/bilal`) | ✅ Real | Express server receives Vapi payloads |
| CRM data (clients, deals, meetings) | 🟡 Mocked | Realistic dummy data in `src/bilal.ts` |
| graph8 SDK integration | ⏳ Ready | Swap one file — see below |

---

## Quick Start

### 1. Clone & install
```bash
git clone <this-repo>
cd ayesha-voice-crm
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Fill in your keys:
# - VAPI_PUBLIC_KEY + VAPI_PRIVATE_KEY → https://dashboard.vapi.ai
# - DEEPGRAM_API_KEY → https://console.deepgram.com
```

### 3. Create Ayesha in Vapi dashboard

Go to https://dashboard.vapi.ai → **Assistants** → **Create**:

**System prompt:**
> "You are Ayesha, a friendly voice assistant for a company's CRM on graph8. When the user asks about clients, deals, or meetings, call the appropriate function to get the data before answering. Never make up numbers — always call a function first. Speak naturally and concisely, like a helpful colleague reading off a dashboard."

**Transcriber:** Set provider to `deepgram`, model `nova-2`, your `DEEPGRAM_API_KEY`.

**Voice (TTS):** ElevenLabs → Rachel (or any natural voice).

**Functions** — register these 5, all pointing to `https://<your-server>/api/bilal`:

| Function name | Parameters | Description |
|---|---|---|
| `get_top_clients` | `limit` (number, optional) | Top clients by deal value |
| `get_deal_status` | `company` (string, required) | Deal stage, value, owner |
| `get_todays_meetings` | — | Today's scheduled meetings |
| `get_pipeline_summary` | — | Total open value, deal count |
| `get_stalled_deals` | `staleDays` (number, optional) | Deals with no recent activity |

### 4. Update index.html
```js
const VAPI_PUBLIC_KEY  = 'your-vapi-public-key';
const ASSISTANT_ID     = 'your-assistant-id-from-vapi-dashboard';
```

### 5. Expose your backend (for Vapi webhook)
```bash
# Option A — cloudflared
cloudflared tunnel --url http://localhost:3000

# Option B — ngrok
ngrok http 3000
```
Copy the public URL and use it as the server URL in your Vapi function configs.

### 6. Run
```bash
npm run dev
# → Bilal backend running on http://localhost:3000

# In another terminal or via Live Server:
open public/index.html
```

### 7. Test
- Click **"📞 Start Call"** → allow mic
- Say: *"What are my top 5 clients?"*
- Confirm: Vapi transcribes → calls `/api/bilal` → Bilal answers → Ayesha speaks

---

## Swapping Mock Data for Real graph8

When you have a `G8_API_KEY`, the only file you need to change is **`src/bilal.ts`**.

Each function has a `// TODO:` comment with the exact real `@graph8/sdk` call to use:

```ts
// Before (mock)
export async function getTopClients(limit = 5) {
  // TODO: real version → g8.deals.list({ status:'closed_won', sort:'value', order:'desc', limit })
  return MOCK_CLIENTS.slice(0, limit);
}

// After (real)
export async function getTopClients(limit = 5) {
  return g8.deals.list({ status: 'closed_won', sort: 'value', order: 'desc', limit });
}
```

The server, the webhook handler, the frontend — **nothing else changes**.

---

## Project Structure

```
ayesha-voice-crm/
├── src/
│   ├── bilal.ts       ← data agent (mock → swap for real graph8 here)
│   └── server.ts      ← Express + Vapi function-call webhook
├── public/
│   └── index.html     ← voice call UI (dark theme, Vapi Web SDK)
├── .env.example       ← required environment variables
├── package.json
├── tsconfig.json
└── README.md
```
