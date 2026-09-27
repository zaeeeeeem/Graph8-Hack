# Autopilot — Agent Hierarchy, Workflow & Deal Feed Design

## 1. The Big Picture

Just like Okara turns a website URL into a running marketing team, Autopilot turns a website URL into a running sales team. The Orchestrator is the AI CMO equivalent — it reads the Sales Brain docs (our version of Okara's 5 strategy docs) and decides which agent to wake up next. Agents draft everything; a human only touches the Deal Feed (our Agents Feed) to Approve / Edit / Skip. Everything else — finding leads, writing emails, handling replies, booking meetings, creating deals — runs on its own.

---

## 2. The Workflow (Okara Pattern)

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    PASTE YOUR WEBSITE URL                       │
  └────────────────────────────┬────────────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  🧠  ORCHESTRATOR  —  reads the URL, wakes up the right agents  │
  │       Builds the Deal Feed  ·  Answers the Chat                 │
  └──────┬────────────────────────────────────────────────┬─────────┘
         │  parallel background read                      │
         ▼                                                │
  ┌──────────────────────────────────┐                    │
  │  📄  SALES BRAIN DOCS            │◄───────────────────┘
  │  (like Okara's 5 strategy docs)  │
  │  Offer · ICP · Personas          │
  │  Competitors · Tone              │
  └──────────────────┬───────────────┘
                     │  Orchestrator reads docs, then fires agents
                     │
         ┌───────────┴─────────────┐
         │                         │
         ▼                         ▼
  ┌─────────────────┐    ┌──────────────────────────┐
  │ Signal-Watcher  │    │       SDR Agent           │
  │ Agent           │───►│  (Finds new leads,        │
  │ (Funding/hiring │    │   ranks by buy-readiness) │
  │  intent alerts) │    └──────────┬───────────────-┘
  └─────────────────┘               │
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │  Data Cleanup Agent  │ ← runs quietly in background
                         │  (De-dupes records)  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Content Agent       │
                         │  (Writes personal     │
                         │   draft per prospect) │
                         └──────────┬────────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │  Compliance / Guard  │ ← checks before human ever sees it
                         │  Agent               │
                         └──────────┬───────────┘
                                    │
                                    ▼
  ╔═════════════════════════════════════════════════════╗
  ║          DEAL FEED  (= Okara's Agents Feed)         ║
  ║       👤  Human: Approve · Edit · Skip              ║  ← ONLY human step
  ╚═════════════════════════════════════════════════════╝
                                    │
                         ┌──────────┴──────────┐
                  Approved                   Skipped / edited
                         │                        │
                         ▼                        ▼  (back to Content Agent)
                ┌─────────────────┐
                │ Sequencer Agent │
                │ (Sends emails + │
                │  follow-ups)    │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   Inbox Agent   │
                │  (Reads reply,  │
                │ classifies intent│
                └──┬──────────┬───┘
                   │          │
       ┌───────────┘          └──────────────┐
       ▼                                     ▼
  "call me"                             "book a meeting"
  ┌─────────────┐                      ┌─────────────────┐
  │ Dialer Agent│                      │  Meetings Agent │
  │ (Makes call)│                      │  (Books slot)   │
  └──────┬──────┘                      └────────┬────────┘
         │                                      │
         └──────────────┬───────────────────────┘
                        │
                        ▼
               ┌─────────────────┐
               │   Deal Agent    │
               │ (Owns the open  │
               │  deal, tracks   │
               │  it to close)   │
               └────────┬────────┘
                        │
                        ▼
               ┌─────────────────┐
               │   CSM Agent     │
               │ (Grows the won  │
               │  account later) │
               └────────┬────────┘
                        │
                        ▼
               ┌─────────────────┐
               │ Forecast Agent  │
               │ (Summarises all │
               │  activity)      │
               └────────┬────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  🧠  ORCHESTRATOR  — updates Deal Feed + Chat with results      │
  └─────────────────────────────────────────────────────────────────┘
```

**How to read this:** The flow goes top-to-bottom like Okara — URL in, agents work, one human approval gate, then fully automated through to a booked meeting and deal. The Orchestrator bookends everything.

---

## 3. Okara Mapping — Side by Side

| Okara (Marketing) | Autopilot (Sales on graph8) | Agent(s) involved |
|---|---|---|
| Paste website URL | Paste website URL | — |
| Reads site → 5 strategy docs | Reads site → Sales Brain docs (Offer, ICP, Personas, Competitors, Tone) | Orchestrator |
| Channel sub-agents work in parallel | SDR Agent finds leads; Signal-Watcher feeds triggers; Data Cleanup tidies records | SDR Agent, Signal-Watcher, Data Cleanup |
| Writer agent drafts content | Content Agent writes a personalised email per prospect | Content Agent |
| Guard / review step | Compliance/Guard Agent checks draft | Guard Agent |
| Agents Feed — human approves before publish | Deal Feed — human Approves / Edits / Skips | — (human) |
| Publishes via integrations | Sequencer Agent sends via graph8 sequences | Sequencer Agent |
| Reply / engagement handling | Inbox Agent classifies reply → Dialer or Meetings Agent acts | Inbox, Dialer, Meetings |
| Analytics dashboard | Forecast Agent → Orchestrator → Deal Feed + Chat | Forecast Agent, Orchestrator |
| "Talk to AI CMO" chat | "Talk to your sales team" chat (Orchestrator answers) | Orchestrator |

---

## 4. Walk-Through: One Lead's Full Journey

This is the story of a single prospect moving through the whole system, agent by agent:

1. **Signal-Watcher Agent** notices "Northwind just raised funding." → tells the Orchestrator.
2. **Orchestrator** wakes up the **SDR Agent** and hands it Northwind.
3. **SDR Agent** finds the right contact (VP Sales) inside graph8's contact database, and asks the **Content Agent** for a personalized draft.
4. **Content Agent** writes the email, using graph8's knowledge about your product.
5. **Compliance/Guard Agent** checks the draft — correct pricing, no risky claims — before it goes further.
6. A human sees the draft in the **Deal Feed** and clicks **Approve**.
7. **Sequencer Agent** sends the approved email (and follow-ups) across channels.
8. A reply comes in. **Inbox Agent** reads it, sees "interested, call me."
9. **Inbox Agent** hands this off to the **Dialer Agent** (to call) or the **Meetings Agent** (to book), depending on what the reply asked for.
10. **Meetings Agent** books the slot and creates a deal.
11. The new deal is now owned by the **Deal Agent**, which will track it going forward, and flag it if it goes quiet.
12. Everything that happened — the signal, the email, the reply, the meeting, the deal — is summarized by the **Forecast Agent** and shown to the human in the Deal Feed and through Chat.

---

## 5. Why This Structure Matters (For the Team)

- **No agent works alone.** Every agent either *triggers* another agent or *is triggered by* one. This is what makes it feel like "one system," not five separate tools.
- **The human only steps in at approval points** — drafting a message, or making a judgment call on a risky deal. Everything else runs on its own.
- **The Orchestrator is the only "brain" that sees the whole picture.** No single agent needs to know what every other agent is doing — it just needs to know what to do when it's called, and where to send its result next.
- **For the hackathon demo:** you do not need to build all 11–16 agents. Build the **Orchestrator + 4–5 agents** that make one full story work end-to-end (Signal-Watcher → SDR → Content → Guard → Sequencer → Inbox → Meetings → Deal → Forecast is a good minimal chain), and present the rest as "what this becomes next."

---

## 6. Quick Reference Table — Every Agent, One Line Each

| # | Agent | One-Line Job | Talks To |
|---|---|---|---|
| 1 | Orchestrator | Decides what runs and builds the Deal Feed/Chat | All agents |
| 2 | SDR Agent | Finds new leads | Content Agent, Sequencer Agent |
| 3 | Deal Agent | Tracks and advances open deals | Meetings Agent, Forecast Agent |
| 4 | CSM Agent | Finds growth in existing accounts | Signal-Watcher, Forecast Agent |
| 5 | Content Agent | Writes emails, battlecards, pitches | SDR Agent, Guard Agent |
| 6 | Sequencer Agent | Sends the messages | Guard Agent, Inbox Agent |
| 7 | Inbox Agent | Reads and sorts replies | Dialer Agent, Meetings Agent |
| 8 | Dialer Agent | Makes the call | Deal Agent |
| 9 | Meetings Agent | Books the meeting | Deal Agent |
| 10 | Signal-Watcher Agent | Detects triggers (funding, hiring) | SDR Agent, Deal Agent, CSM Agent |
| 11 | Data Cleanup Agent | Keeps records accurate | SDR, Deal, CSM (background) |
| 12 | Compliance/Guard Agent | Checks messages before sending | Sequencer, Inbox |
| 13 | Forecast Agent | Summarizes everything | Orchestrator |

---

## 7. Deal Feed — Card Design (Okara Style)

This is what the Deal Feed actually looks like to the user — one card per agent update, written the way Okara writes its Agents Feed ("2 campaigns ready," "2 opportunities ready"). Every agent keeps working in the background whether the plan is free or paid; the **free plan shows the result exists, the paid plan unlocks it** — same hook Okara uses.

### 7.1 What Each Agent Says in Its Card

| Agent | Card Message |
|---|---|
| SDR Agent | 🟢 "5 new high-intent leads found" |
| Deal Agent | 🟡 "2 deals going cold — needs follow-up" |
| CSM Agent | 🟢 "1 expansion opportunity detected" |
| Content Agent | 🟢 "3 email drafts ready" |
| Sequencer Agent | 🟢 "47 touches sent this week" |
| Inbox Agent | 🟢 "4 replies waiting for review" |
| Dialer Agent | 🟡 "6 calls attempted, 2 connected" |
| Meetings Agent | 🟢 "1 meeting booked — Thu 2 PM" |
| Signal-Watcher Agent | 🟢 "3 new buying signals detected" |
| Data Cleanup Agent | 🟢 "12 duplicate records merged" |
| Compliance/Guard Agent | 🔴 "1 message flagged — pricing mismatch" |
| Forecast Agent | 🟢 "Weekly summary ready" |

**Color code:** 🟢 normal update · 🟡 needs attention · 🔴 urgent / risk

### 7.2 How the Deal Feed Looks (Free Plan — Locked)

```
NEEDS YOUR ATTENTION                              🔄 Refresh

AGENTS

🟢  SDR AGENT
    5 new high-intent leads found                  [🔒 Upgrade]

🟡  DEAL AGENT
    2 deals going cold — needs follow-up            [🔒 Upgrade]

🟢  CONTENT AGENT
    3 email drafts ready                            [🔒 Upgrade]

🔴  COMPLIANCE AGENT
    1 message flagged — pricing mismatch            [🔒 Upgrade]

🟢  MEETINGS AGENT
    1 meeting booked — Thu 2 PM                     [🔒 Upgrade]

🟢  SIGNAL-WATCHER AGENT
    3 new buying signals detected                   [🔒 Upgrade]
```

### 7.3 The Monetization Logic

- **Every agent runs for every user, free or paid** — nothing is held back from working.
- **The card headline is always visible** ("5 new high-intent leads found") — this proves the system is working and creates the pull to upgrade.
- **The content behind the card is what's locked** — the actual lead list, the actual draft, the actual flagged message. That's what "Upgrade" unlocks.
- This mirrors Okara exactly: free users see "2 campaigns ready" / "2 opportunities ready," but can't open them without paying — the value is visible before it's accessible.

### 7.4 Why This Matters for the Demo

Showing the paywall pattern alongside the working agents turns this from "a cool automation demo" into "a working business model." It tells the judges two things at once: the system works end-to-end, and there's a clear, proven way (Okara's own model) to charge for it.