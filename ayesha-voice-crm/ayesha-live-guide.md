# Ayesha — The Ultimate Setup & Run Guide

This is a comprehensive guide containing all the updated steps and error fixes so you can run the project smoothly every time.

---

## 🛠️ Requirements & Setup

### 1. Running the Tunnel (Required!)
To allow Vapi to reach your local backend, we use `localhost.run` instead of localtunnel (which blocks automated API requests).
Whenever you run the project, start the tunnel in your terminal using this command:
```bash
ssh -R 80:localhost:3000 nokey@localhost.run -o StrictHostKeyChecking=no
```
*(This will generate a new URL like `https://84f42cd8e0a0d6.lhr.life`. Copy it.)*

### 2. Updating Functions in Vapi Dashboard
Every time you get a new tunnel URL, go to **Vapi Dashboard -> Tools** and update all 5 functions:
- URL Pattern: `https://[YOUR_NEW_LHR_LIFE_URL]/api/bilal`
- Method: `POST`

---

## 🎙️ Ayesha's Voice Configuration (Free + Best)

If you don't hear Ayesha speak, fix the Voice settings in your Vapi dashboard:
1. Go to **Assistants -> Riley** (Ayesha).
2. Click the edit icon on the **Voice** card.
3. Select Provider: **OpenAI**.
4. Choose Voice: **Nova** or **Alloy** (These run perfectly within Vapi's $10 free credit).
5. Click **Publish / Save**.

---

## 🚀 How to Run the App Live

1. **Terminal 1 (Backend):**
   ```bash
   npm run dev
   ```
   *(This starts the local backend at `http://localhost:3000`).*

2. **Terminal 2 (Tunnel):**
   ```bash
   ssh -R 80:localhost:3000 nokey@localhost.run -o StrictHostKeyChecking=no
   ```
   *(Make sure to update the 5 function URLs in Vapi with the new link provided by this command).*

3. **Open in Browser:**
   - Go to `http://localhost:3000`
   - If there is a caching issue, press **Ctrl + F5** to hard refresh so the correct Vapi SDK (v2.7.1) loads.
   - Click the **"📞 Start Call"** button and allow microphone permissions.
   
---

## 🚨 Troubleshooting

| Issue | Fix |
|---|---|
| Ayesha generates text but there is no voice | You haven't selected or saved the OpenAI "Nova" voice in the Vapi dashboard. |
| Ayesha says "Unable to access..." | The Server URL is incorrect. Vapi failed to hit the backend. Copy your new `lhr.life` tunnel URL, paste it into the 5 tools in the Vapi dashboard, select POST, and hit Publish. |
| Browser shows "Disconnected" and the call won't start | The `index.html` file is loading an older, cached version of the Vapi SDK. Hard refresh the page (Ctrl+F5). |
| Cannot start a new call after ending one | Just refresh the browser page to clear any cached states. |
