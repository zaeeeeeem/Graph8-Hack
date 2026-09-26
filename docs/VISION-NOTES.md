# Founder Vision Notes (human context — read this before changing direction)

Captured from the team lead's own words, 2026-09-27 ~02:15 PKT, graph8 Hackathon Lahore.
This is the *why* behind the product. Other docs (IDEA.md, FLOW.md) describe *what*; this file is the human intent.

---

## 1. Who we serve
- The world is moving toward **$1B companies built by a single person**.
- Our customer is **that one person** — the solo founder with a big vision who wants to win using the power of agents.
- **Not** big tech, corporates, or sales organizations.
- Business logic: if we help that person earn billions, a share of that value comes back to us.

## 2. What that person wants
- They will **not** learn a dashboard or understand how everything works under the hood.
- They show up for **~5 minutes**, check **progress**, and leave.
- **No multi-step setup, no configuration work.** Agents do all of it.
- → **Agent-first**, not dashboard-first. The UI is a progress view, not a control panel.

## 3. Rejected directions (and why)
- **"Playbook-as-Code" (plain-English playbook compiled into graph8 config)** — rejected as lame: it's still a tool for someone who wants to configure things. Our user doesn't want to configure anything.
- A heavy multi-screen dashboard ("Mission Control") — too much for a 5-minute user.
- What we keep from earlier work: the real multi-channel sales process in `docs/FLOW.md` (email → LinkedIn connect with email context → LinkedIn msg → email 2 → call → … stop on any reply → take over the conversation). Agents must follow real on-ground sales reality, not "send one email and wait".

## 4. Ideas to explore

### 4.1 Browser agents instead of account connections
- Connecting mailbox / LinkedIn / Netrion / calendar is hectic (we lived it tonight: wrong org, Netrion link broken).
- Idea: a **cloud browser agent** logs in and does the work on the founder's behalf, so they don't connect accounts manually.
- Candidate: **TinyFish** (cloud browser / web agents).

### 4.2 Learn from Okara again
- Okara ("AI CMO") serves the same kind of person: solo founders / people who want to move fast, not organizations.
- Its UX: user just sees progress.
- Open question: **how does Okara handle connecting X, LinkedIn, YouTube, Instagram, etc.?** Do they force manual connects, or have they solved it differently?

### 4.3 Agent company hierarchy (Paperclip)
- **Paperclip** runs "agent companies": one main orchestrator agent, sub-agents with assigned roles, each reporting up the chain to higher levels (like a real org chart).
- Idea: build on top of Paperclip (reuse their agentic infrastructure) or copy the pattern.
- For us: a **Head of Sales agent** orchestrating sub-agents (e.g., Scout, Researcher, Writer, Closer, …), each reporting to it; it reports to the founder.

### 4.4 Slack as the interface (remove the learning gap)
- Humans already live in Slack. **No new app to learn.**
- Agents report into Slack: every sub-agent reports to the higher-level agent; the top agent posts **daily / hourly / weekly reports** (cadence configurable).
- Founder replies/approves in Slack.
- Demo setup: create a Slack bot, connect it, done.
- Believed to be a **unique** angle.

## 5. Principles distilled
1. Agent-first: agents do the work, humans see progress.
2. 5-minute founder: zero setup, zero learning curve.
3. Meet the human where they already are (Slack), not in our dashboard.
4. Real sales process (multi-channel, event-driven), not a toy.
5. graph8 stays the backend (hackathon rule) — agents act through graph8.

## 6. Open questions (to answer with research)
- TinyFish: can it safely keep the founder logged in and act on LinkedIn/Gmail? Risks (bans, 2FA, ToS)?
- Okara: how do they solve account connections and daily reporting?
- Paperclip: can we realistically run/extend it in hackathon time, or copy the pattern?
- Slack: which reports, which approvals, how the founder talks back to the Head of Sales agent.

---

## 7. Research answers (2026-09-27 ~02:20 PKT)

### TinyFish (cloud browser agents)
- APIs: Agent (goal-based, `POST agent.tinyfish.ai/v1/automation/run`, async/SSE/batch, `output_schema`), **Search + Fetch (free)**, Browser (CDP), **Monitors** (page diff / topic, $0.005/run, webhook). Profiles keep logins (cookies); Vault via 1Password/Bitwarden; TOTP only. Agent ~$0.016/step, 30–90s per multi-step action. $8 free credit.
- **Logging into founder's LinkedIn/Gmail via cloud browser = bad core path**: LinkedIn ToS bans automation, detects cloud IPs → real account ban risk; Google flags cloud sign-ins; captchas unsolved; first login needs a live remote browser we'd have to build.
- **Good uses**: prospect research for personalization (free Search/Fetch), buying-signal Monitors (competitor pricing, careers pages "hiring SDRs", funding news) → webhook → graph8. ~20 min to integrate.

### Okara (how they solved account connections)
- **They did NOT solve it with browser agents.** URL alone gives value (strategy docs + feed). "Integrations are optional… they remove the copy/paste step."
- X/LinkedIn = OAuth post-only; Reddit/HN = always manual copy-paste (to avoid spam systems). Every publish still = 1 human click.
- Connections are asked **at the moment of action** (Post button appears after OAuth), not at signup.
- Delivery: in-app feed + **daily email digest + WhatsApp/Telegram two-way chat** (Slack "soon").
- Audience confirmed: solo founders & 2–3 person teams, "building in public". $129–$249/mo.

### Paperclip (agent companies)
- github.com/paperclipai/paperclip, MIT, ~87k stars, very active (weekly releases, ~2.4k open issues). Node 24 + pnpm monorepo, embedded Postgres, React UI.
- Concepts: company → org chart (`role`, `reportsTo`, budget per agent) → Goals/Projects/Issues; agents **check out** tasks; **heartbeats** (scheduled/mention/assignment wakes); delegation = create issue for subordinate; reporting up = comment on parent issue; budgets auto-pause; board approvals; audit log. Has a new Slack connector.
- It is **not** an agent framework: drives external runtimes via adapters (Claude Code, Codex, `http`, `process`).
- **Verdict: don't build on it for the hackathon** (heavy, fast-moving, slow Claude-Code heartbeats, and we'd demo *their* UI instead of our product + graph8). **Copy its pattern** (org chart, tasks, heartbeats, budgets, approvals) into our own app.

### Slack
- graph8 already sends its Chief of Staff notifications to Slack/WhatsApp/iMessage and has a daily-brief setting → "notifications in Slack" alone is NOT unique.
- Unique = a **whole agent org chart** living in Slack: agents with roles, budgets, standups rolling up to a Head of Sales that reports to the founder, approvals as Slack buttons.
