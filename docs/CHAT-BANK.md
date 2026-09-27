# Chat bank — everything the founder can ask the team (draft for approval)

## How the conversation works

1. **Ayesha is the manager.** Any founder message that doesn't name an agent goes to her. This covers:
   - top-level messages in `#sales-hq`;
   - DMs;
   - @Graphi mentions.
2. **Ayesha decides what to do with it:**
   - answers herself;
   - **asks** an agent and relays the answer ("Hira says: …");
   - **assigns** work to an agent, keeping every constraint (count, industry, country, size, signals);
   - splits a big goal into tasks across agents.
3. **Naming an agent** ("Bilal, …") goes straight to that agent. If the request isn't that agent's job, it hands it to the right agent in its own voice.
4. **Tool calling.** Every agent uses real tools (Gemini function calling over Supabase and graph8), so answers use real data and never guess. Each answer allows at most 5 tool calls.
5. **Thread memory.** Agents read the last 15 messages of the thread, so follow-ups like "what do you mean?" or "do it for the other one too" work.
6. **Privacy.** Emails and phone numbers never appear in Slack. Agents say so and give an **Open in graph8** link instead.
7. **Honest limits.** Unsupported requests get "I can't do that yet" plus the nearest thing the team can do.
8. **One "done" line per step.** Duplicate status posts are removed.

## A. Pipeline and status (Ayesha)

| Founder asks | Answer / action |
|---|---|
| How's the pipeline? / How are we doing today? | Counts by stage, today's changes, credits used |
| What is everyone doing? / What is Bilal doing? | Each agent's status and current task |
| What's T-12? / Is the research done? | Task status, owner, summary |
| What's waiting on me? | Pending approvals with links to the cards |
| Any blockers? | Blocked tasks, missing connections, budget |
| How many credits have we used? / by whom? | Credit ledger by agent, today and total |
| Summarize this thread / today | Short summary |
| What can you do? / help | Short capability list with examples |

## B. Leads (any agent reads; Hira explains)

| Founder asks | Answer / action |
|---|---|
| Tell me about Thad Warren / EnergyBot | Lead card: role, company, fit score, why-now hook, signals, stage, Open in graph8 |
| Why is X a good fit? | Fit breakdown (title, industry, size, geo, intent) and hook |
| Show top leads / leads in UK / fintech / replied / in sequence | Filtered list (no private data) |
| Compare X and Y | Side by side, with a recommendation |
| What happened with X? | Timeline from `lead_events` |
| Share emails / phone numbers | Privacy policy plus a graph8 list or contact link |
| Remove X / don't contact X | Do-not-contact, stop outreach (Zara) |

## C. Prospecting (Bilal)

| Founder asks | Action |
|---|---|
| Find N [role] in [industry] [country] [size] | Search with exact filters, no drift to defaults |
| Find more like X | Look-alike: same title/industry/size |
| Find people at [company] | Company-first search |
| Exclude [company/industry] / only companies hiring | Filters and signals |
| Which companies show buying intent? | Intent companies (graph8 intent) |
| Why did you pick these? | Scores and reasons |

## D. Research (Hira)

| Founder asks | Action |
|---|---|
| Research X / these 3 / the new ones | Research pack(s) |
| Dig deeper on [company] | Company facts, jobs, signals |
| What should we say to X? | Hook and 2 talking points |
| Disqualify X because … | Disqualify, backfill from the pool |

## E. Outreach (Usman)

| Founder asks | Action |
|---|---|
| Build a sequence for these leads | New sequence and Launch card |
| Make it shorter / mention our 1M-views case study / more casual | Revise, then a new card (Edit flow) |
| Show me the email for X | Preview the personalized email |
| Send follow-ups faster / slower | Timing change |
| Launch / pause / resume the sequence | Approval or state change |
| Stop emailing X / [company] | Stop the lead or account |
| How many sent? Any bounces? | Send stats |

## F. Replies, meetings, deals (Zara)

| Founder asks | Action |
|---|---|
| Any replies? / What did X say? | Reply list and intent, quoted text (no private data) |
| Draft a reply to X (friendly, offer Tuesday) | Draft, then a Send/Edit card |
| Book X for Tue 3pm | Booking (allowlisted contacts only) |
| Meetings this week? | Meetings list |
| Create / update deal for X, move to Proposal | graph8 deal create or update |
| What's our pipeline value? | Sum of deals (estimated) |

## G. Settings and team (Ayesha)

| Founder asks | Action |
|---|---|
| From now on find 15 a day / target UK fintech CFOs / tone more casual | Settings saved, confirmation |
| Pause Usman / the team, resume | Pause state |
| Raise Bilal's budget | Budget change |
| Move standup to 10am | Settings change |
| Run today's batch now | Starts the daily run |

## H. Manager moves (Ayesha)

| Founder asks | What Ayesha does |
|---|---|
| Ask Hira why X is a fit | Asks Hira, then relays: "Hira says …" |
| Get me 3 meetings with UK fintech CFOs this week | Plan: Bilal finds, then Hira researches, then Usman builds; she posts the plan and tracks it |
| Focus on hiring companies this week | Settings plus instructions to Bilal |
| Who is best to handle X? | Routes to that agent |
| Check on Usman's progress | Asks and reports back |

## Tools to build (shared registry; each agent gets a subset)

**Read (all agents):**
- `get_pipeline`
- `get_agents_status`
- `get_task(T-n)`
- `list_pending_approvals`
- `find_lead(name|company)`
- `list_leads(filters)`
- `get_lead_timeline`
- `get_credits`
- `get_sequence(s)`
- `get_replies`
- `get_meetings`
- `get_deals`
- `graph8_link(record)`

**Manager (Ayesha):**
- `ask_agent(role, question)` returns the agent's answer
- `assign_task(role, kind, constraints)`
- `plan_goal(goal)`
- `update_settings`
- `pause/resume`
- `set_budget`
- `run_daily_batch`

**Bilal:**
- `search_prospects(filters)`
- `find_lookalikes(lead)`
- `search_company_people(company)`
- `intent_companies`

**Hira:**
- `research_leads(ids)`
- `company_deep_dive`
- `explain_fit(lead)`
- `disqualify_lead`

**Usman:**
- `build_sequence(lead_ids)`
- `revise_copy(note)`
- `preview_email(lead)`
- `change_timing`
- `pause/resume_sequence`
- `stop_lead(lead|company)`
- `send_stats`

**Zara:**
- `list_replies`
- `draft_reply(lead, note)`
- `book_meeting(lead, time)`
- `create/update_deal`
- `move_deal_stage`
- `mark_do_not_contact`

## Guard rails (unchanged)

- All sends and bookings go through the allowlist guard.
- No private data in Slack.
- Approvals are still required for launch and risky replies.
- Tool results are summarized before they are posted.
