-- =============================================================================
-- seed.sql — demo workspace "8x.social" + 5 agents + realistic FAKE sample data
-- =============================================================================
-- All people/companies below are fictional (example.com domains). Re-runnable:
-- deletes the demo workspace first (cascades everything).
-- Fixed UUIDs so the portal + scripts can hard-code the demo workspace:
--   workspace  a0000000-0000-4000-8000-000000000001
--   agents     a1..a5 (Ayesha, Bilal, Hira, Usman, Zara)
-- =============================================================================

begin;

delete from workspaces where id = 'a0000000-0000-4000-8000-000000000001';

-- Workspace ------------------------------------------------------------------
insert into workspaces (id, slug, name, company_domain, timezone, status, founder_name,
  founder_slack_user_id, g8_org_id, slack_channel_team, slack_channel_hq,
  standup_hour, demo_time_scale, is_demo, budget_daily_credits, sales_brain)
values ('a0000000-0000-4000-8000-000000000001', '8x-social', '8x.social', '8x.social',
  'Asia/Karachi', 'active', 'Zaeem', 'U0DEMO0001', 'org_f3f1e5df96e5',
  'C0C4KMJMKK7', 'C0C49DG285V', 9, 0.001, true, 500000,
  '{"offer":"8x.social: AI-run social + outbound growth for B2B startups",
    "icp":"Series A-B fintech, 20-200 employees, US/UK",
    "personas":["CFO","VP Finance","Head of Growth"],
    "tone":"direct, founder-to-founder, no fluff",
    "proof":["3x reply rate vs cold email alone","Set up in one Slack command"]}'::jsonb);

-- Secrets row exists so the server can UPSERT keys into it (values stay empty).
insert into workspace_secrets (workspace_id) values ('a0000000-0000-4000-8000-000000000001');

-- Test allowlist (fake team; replace with real teammates via scripts/seed-allowlist) --
insert into contact_allowlist (workspace_id, label, email, phone, linkedin_url) values
  ('a0000000-0000-4000-8000-000000000001', 'Teammate 1 (test)', 'teammate1@example.com', '+15550000001', 'https://www.linkedin.com/in/teammate-one'),
  ('a0000000-0000-4000-8000-000000000001', 'Teammate 2 (test)', 'teammate2@example.com', '+15550000002', 'https://www.linkedin.com/in/teammate-two'),
  ('a0000000-0000-4000-8000-000000000001', 'Teammate 3 (test)', 'teammate3@example.com', '+15550000003', 'https://www.linkedin.com/in/teammate-three');

-- Agents (org chart) ----------------------------------------------------------
insert into agents (id, workspace_id, role, name, title, job, reports_to, emoji, color, sort_order,
  status, budget_daily_credits, spent_today_credits, spend_day, model, last_active_at) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'head_of_sales', 'Ayesha', 'Head of Sales',
   'Sets the plan, assigns work, rolls up reports, asks you for approvals', null, '🧑‍💼', '#7C3AED', 0,
   'waiting_on_you', 100000, 0, current_date, 'gemini-3.8-flash', now() - interval '3 minutes'),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'scout', 'Bilal', 'Scout',
   'Finds accounts and people that match the ICP and ranks them by buying signals',
   'a1000000-0000-4000-8000-000000000001', '🔎', '#0EA5E9', 1, 'idle', 100000, 0, current_date, 'gemini-3.8-flash', now() - interval '52 minutes'),
  ('a3000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'researcher', 'Hira', 'Researcher',
   'Enriches each lead and writes the two-line "why this person, why now"',
   'a1000000-0000-4000-8000-000000000001', '🧪', '#10B981', 2, 'idle', 100000, 0, current_date, 'gemini-3.8-flash', now() - interval '41 minutes'),
  ('a4000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'sdr', 'Usman', 'SDR',
   'Builds and runs the multi-channel sequence in graph8 (email, LinkedIn, call)',
   'a1000000-0000-4000-8000-000000000001', '✍️', '#F59E0B', 3, 'idle', 100000, 0, current_date, 'gemini-3.8-flash', now() - interval '30 minutes'),
  ('a5000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'closer', 'Zara', 'Closer',
   'Handles every reply, stops outreach, books the meeting, opens the deal',
   'a1000000-0000-4000-8000-000000000001', '🤝', '#EF4444', 4, 'working', 100000, 0, current_date, 'gemini-3.8-flash', now() - interval '1 minute');

-- Sequence (mirror of the graph8 draft the SDR built) -------------------------
insert into sequences (id, workspace_id, created_by_agent_id, g8_sequence_id, g8_list_id, g8_schedule_id,
  name, status, channels, steps, lead_count, enrolled_count, stats, launched_at) values
  ('50000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004',
   'seq_demo_fintech_cfo_01', 'list_demo_01', 'e5583e4d-6067-42a2-bc27-45ca18e92564',
   'Fintech CFOs — 7-touch multi-channel', 'live', '{email,linkedin,phone}',
   '[{"n":1,"day":1,"channel":"email","action":"send","subject":"Quick question about finance hiring at {{company}}","preview":"Saw you are hiring two finance roles…"},
     {"n":2,"day":2,"channel":"linkedin","action":"connection_request","preview":"Sent you a note yesterday about finance hiring…"},
     {"n":3,"day":4,"channel":"linkedin","action":"message","preview":"Thanks for connecting — the short version of my email:"},
     {"n":4,"day":5,"channel":"email","action":"send","subject":"How Wingtip cut close time 40%","preview":"One example that might be relevant…"},
     {"n":5,"day":7,"channel":"phone","action":"call","preview":"Call; voicemail if no answer"},
     {"n":6,"day":8,"channel":"linkedin","action":"message","preview":"Left you a voicemail — worth 15 minutes?"},
     {"n":7,"day":12,"channel":"email","action":"send","subject":"Should I close your file?","preview":"Breakup email"}]'::jsonb,
   8, 1, '{"sent":3,"opened":2,"replied":1,"meetings":1}'::jsonb, now() - interval '35 minutes');

-- Tasks (one task = one Slack thread) -----------------------------------------
-- Numbers are assigned by trigger in insertion order (T-1 … T-10).
insert into tasks (id, workspace_id, kind, title, detail, assignee_agent_id, created_by_agent_id, parent_task_id,
  lead_id, sequence_id, status, blocked_on, blocked_reason, result_summary, slack_channel, slack_thread_ts,
  credits_used, created_at, started_at, finished_at) values
  -- T-1 root onboarding (Ayesha) — done
  ('70000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'onboard',
   'Hire sales team for 8x.social', 'Founder ran /hire-sales 8x.social. Read graph8 context, set plan, staff the team.',
   'a1000000-0000-4000-8000-000000000001', null, null, null, null, 'done', null, null,
   'Read 23 context docs from graph8. ICP: Series A-B fintech CFOs (US/UK). Team staffed: Bilal, Hira, Usman, Zara. Budget 100,000 credits/day per agent.',
   'C0C49DG285V', '1790000000.000100', 0, now() - interval '2 hours', now() - interval '2 hours', now() - interval '115 minutes'),
  -- T-2 find prospects (Bilal) — done
  ('70000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'find_prospects',
   'Find 15 fintech CFOs with buying signals', 'ICP: Series A-B fintech, 20-200 employees, US/UK. Rank by hiring + funding signals. Free search only.',
   'a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   null, null, 'done', null, null,
   '12 accounts found, 8 with strong signals (5 hiring finance roles, 3 raised in last 90 days). Saved to graph8 list.',
   'C0C4KMJMKK7', '1790000000.000200', 0, now() - interval '110 minutes', now() - interval '109 minutes', now() - interval '95 minutes'),
  -- T-3 research (Hira) — done
  ('70000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'research_leads',
   'Enrich 7 leads and write why-now', 'Enrich only the 7 leads with a signal or a clear hook (cap 40 credits). Two-line hook each.',
   'a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   null, null, 'done', null, null,
   '7 enriched (21 credits). Why-now written for each; 2 hooks reference fresh funding, 5 reference finance hiring.',
   'C0C4KMJMKK7', '1790000000.000300', 24, now() - interval '94 minutes', now() - interval '93 minutes', now() - interval '70 minutes'),
  -- T-4 build sequence (Usman) — done
  ('70000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'build_sequence',
   'Draft 7-touch multi-channel sequence', 'Email → LinkedIn connect (refs email) → LinkedIn msg → email 2 → call → LinkedIn msg 2 → breakup. finish_on_reply. Demo schedule.',
   'a4000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   null, '50000000-0000-4000-8000-000000000001', 'done', null, null,
   'Sequence drafted in graph8 (seq_demo_fintech_cfo_01) with 7 steps across email, LinkedIn and phone. Copy generated (10 credits).',
   'C0C4KMJMKK7', '1790000000.000400', 10, now() - interval '69 minutes', now() - interval '68 minutes', now() - interval '50 minutes'),
  -- T-5 launch (Ayesha) — done after approval
  ('70000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'launch_sequence',
   'Launch sequence to 8 leads', 'Ask founder to approve; on approve enroll allowlisted test contacts only.',
   'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   null, '50000000-0000-4000-8000-000000000001', 'done', null, null,
   'Approved by founder. Sequence live; 1 allowlisted test contact enrolled, 7 real prospects held (safety allowlist).',
   'C0C49DG285V', '1790000000.000500', 0, now() - interval '49 minutes', now() - interval '48 minutes', now() - interval '35 minutes'),
  -- T-6 handle reply (Zara) — in progress
  ('70000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'handle_reply',
   'Sara Malik (Northwind) replied — interested', 'Email reply on step 1. Stop all channels for Northwind, classify; if interested, auto-send 3 slots (allowlisted contact) and wait for her pick.',
   'a5000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   null, '50000000-0000-4000-8000-000000000001', 'in_progress', null, null, 'Classified INTERESTED. Stopped all channels for Northwind. Sent 3 discovery-call slots on email (auto-send: interested + allowlisted). Waiting for her pick.',
   'C0C4KMJMKK7', '1790000000.000600', 0, now() - interval '6 minutes', now() - interval '5 minutes', null),
  -- T-7 connect LinkedIn (Ayesha) — blocked on the founder's decision
  ('70000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'custom',
   'Connect LinkedIn so steps 2, 3 and 6 can send', 'LinkedIn sender not connected in graph8. Steps 2, 3, 6 of the sequence are queued. Ask founder to connect; email + call steps continue meanwhile.',
   'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   null, '50000000-0000-4000-8000-000000000001', 'blocked', 'founder', 'Connect LinkedIn in graph8', null,
   'C0C49DG285V', '1790000000.000700', 0, now() - interval '3 minutes', null, null),
  -- T-8 standup (Ayesha) — done this morning
  ('70000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'standup',
   'Morning standup', 'Yesterday / today / blockers / pipeline / credits per agent.',
   'a1000000-0000-4000-8000-000000000001', null, null, null, null, 'done', null, null,
   'Posted standup to #sales-hq.', 'C0C49DG285V', '1790000000.000800', 0,
   now() - interval '20 minutes', now() - interval '20 minutes', now() - interval '19 minutes'),
  -- T-9 answer question (Ayesha) — done
  ('70000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'answer_question',
   'Founder asked: how is pipeline?', 'DM from founder.', 'a1000000-0000-4000-8000-000000000001', null, null, null, null,
   'done', null, null, 'Answered with live graph8 numbers: 8 in sequence, 1 replied, 1 meeting, 1 deal ($12k).',
   'C0C49DG285V', '1790000000.000900', 0, now() - interval '12 minutes', now() - interval '12 minutes', now() - interval '11 minutes'),
  -- T-10 next batch (Bilal) — todo
  ('70000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'find_prospects',
   'Find batch 2: UK fintech CFOs', 'Same ICP, UK only, 10 accounts.', 'a2000000-0000-4000-8000-000000000002',
   'a1000000-0000-4000-8000-000000000001', null, null, null, 'todo', null, null, null, null, null, 0,
   now() - interval '2 minutes', null, null);

update agents set current_task_id = '70000000-0000-4000-8000-000000000006' where id = 'a5000000-0000-4000-8000-000000000005';
update agents set current_task_id = '70000000-0000-4000-8000-000000000007' where id = 'a1000000-0000-4000-8000-000000000001';

-- Leads (fake people, example.com) -------------------------------------------
insert into leads (id, workspace_id, g8_contact_id, g8_company_id, g8_list_id, g8_deal_id, g8_meeting_id, sequence_id,
  owner_agent_id, full_name, job_title, company_name, company_domain, location, source, stage, disqualify_reason,
  fit_score, signals, why_now, sequence_state, last_channel, last_reply_intent, last_activity_at, meeting_at,
  deal_amount, deal_stage, is_test_contact, created_at) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_001', 'co_demo_001', 'list_demo_01', null, null,
   '50000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005',
   'Sara Malik', 'VP Finance', 'Northwind Fintech', 'northwind.example.com', 'New York, US', 'scout', 'replied', null, 92,
   '[{"type":"hiring","text":"Hiring 2 finance roles (Senior Accountant, FP&A Lead)","source":"https://northwind.example.com/careers"},
     {"type":"funding","text":"Raised $18M Series A (Aug 2026)","source":"https://news.example.com/northwind-series-a"}]'::jsonb,
   'Just raised Series A and hiring two finance roles — month-end close is about to get painful. Reference the FP&A posting.',
   'stopped', 'email', 'interested', now() - interval '6 minutes', null, null, null, true, now() - interval '100 minutes'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_002', 'co_demo_002', 'list_demo_01', null, null,
   '50000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004',
   'Ahmed Raza', 'CFO', 'Contoso Pay', 'contosopay.example.com', 'London, UK', 'scout', 'contacted', null, 85,
   '[{"type":"hiring","text":"Hiring Head of Revenue Ops","source":"https://contosopay.example.com/jobs"}]'::jsonb,
   'Hiring a Head of RevOps means outbound is on the roadmap this quarter — offer to be the interim engine.',
   'enrolled', 'email', null, now() - interval '30 minutes', null, null, null, false, now() - interval '100 minutes'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_003', 'co_demo_003', 'list_demo_01', null, null,
   '50000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004',
   'Fatima Noor', 'Head of Finance', 'Fabrikam Capital', 'fabrikam.example.com', 'Austin, US', 'scout', 'contacted', null, 78,
   '[{"type":"intent","text":"Visited pricing page twice this week","source":"graph8 visitors"}]'::jsonb,
   'Two pricing-page visits this week — she is already evaluating. Lead with a concrete number, not a pitch.',
   'enrolled', 'linkedin', null, now() - interval '25 minutes', null, null, null, false, now() - interval '100 minutes'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_004', 'co_demo_004', 'list_demo_01', null, 'mt_demo_004',
   '50000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005',
   'Omar Sheikh', 'CFO', 'Tailspin Ledger', 'tailspin.example.com', 'San Francisco, US', 'scout', 'meeting', null, 88,
   '[{"type":"funding","text":"Raised $9M seed extension","source":"https://news.example.com/tailspin"}]'::jsonb,
   'Fresh seed extension; board will ask for pipeline numbers next quarter. Offer a 15-minute plan.',
   'stopped', 'linkedin', 'interested', now() - interval '45 minutes', now() + interval '2 days', null, null, false, now() - interval '100 minutes'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_005', 'co_demo_005', 'list_demo_01', 'deal_demo_005', 'mt_demo_005',
   '50000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005',
   'Zainab Qureshi', 'CFO', 'Wingtip Finance', 'wingtip.example.com', 'Manchester, UK', 'scout', 'deal', null, 90,
   '[{"type":"hiring","text":"Hiring SDR + AE","source":"https://wingtip.example.com/careers"}]'::jsonb,
   'Hiring a first SDR and AE — pitch "start the pipeline before they join".',
   'stopped', 'phone', 'interested', now() - interval '60 minutes', now() - interval '1 day', 12000, 'Discovery', false, now() - interval '100 minutes'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_006', 'co_demo_006', 'list_demo_01', null, null,
   '50000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003',
   'Hamza Iqbal', 'VP Finance', 'Litware Payments', 'litware.example.com', 'Chicago, US', 'scout', 'queued', null, 74,
   '[]'::jsonb, 'Payments company scaling ops; no public signal yet — lead with the Wingtip case study.',
   'queued', null, null, now() - interval '70 minutes', null, null, null, false, now() - interval '100 minutes'),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_007', 'co_demo_007', 'list_demo_01', null, null,
   null, 'a2000000-0000-4000-8000-000000000002',
   'Mariam Siddiqui', 'Head of Growth', 'Proseware Lending', 'proseware.example.com', 'Boston, US', 'scout', 'prospect', null, 61,
   '[]'::jsonb, null, 'none', null, null, now() - interval '95 minutes', null, null, null, false, now() - interval '100 minutes'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'ct_demo_008', 'co_demo_008', 'list_demo_01', null, null,
   '50000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005',
   'Ali Hassan', 'Controller', 'Adventure Works Capital', 'adventureworks.example.com', 'Denver, US', 'scout', 'disqualified', 'wrong_person', 55,
   '[]'::jsonb, 'Controller, not the buyer — ask for a referral to the CFO.',
   'stopped', 'email', 'wrong_person', now() - interval '28 minutes', null, null, null, false, now() - interval '100 minutes');

-- Private contact details (fake) ---------------------------------------------
insert into lead_contacts (lead_id, workspace_id, email, email_verified, phone, linkedin_url, enriched_at) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'teammate1@example.com', true, '+15550000001', 'https://www.linkedin.com/in/teammate-one', now() - interval '80 minutes'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'ahmed.raza@contosopay.example.com', true, '+442055550002', 'https://www.linkedin.com/in/ahmed-raza-demo', now() - interval '80 minutes'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'fatima.noor@fabrikam.example.com', true, null, 'https://www.linkedin.com/in/fatima-noor-demo', now() - interval '80 minutes'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'omar.sheikh@tailspin.example.com', true, '+14155550004', 'https://www.linkedin.com/in/omar-sheikh-demo', now() - interval '80 minutes'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'zainab.qureshi@wingtip.example.com', true, '+441615550005', 'https://www.linkedin.com/in/zainab-qureshi-demo', now() - interval '80 minutes'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'hamza.iqbal@litware.example.com', false, null, 'https://www.linkedin.com/in/hamza-iqbal-demo', now() - interval '80 minutes'),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', null, null, null, 'https://www.linkedin.com/in/mariam-siddiqui-demo', null),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'ali.hassan@adventureworks.example.com', true, null, null, now() - interval '80 minutes');

-- Link Zara's tasks to Sara now that the lead exists.
update tasks set lead_id = 'b0000000-0000-4000-8000-000000000001'
 where id = '70000000-0000-4000-8000-000000000006';

-- One simulated inbound webhook (the reply that woke Zara) -------------------
insert into inbound_events (id, workspace_id, source, event_type, dedupe_key, delivery_id, signature_valid, payload, status, received_at, processed_at) values
  ('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'simulated', 'engagement.email_replied',
   'graph8:engagement.email_replied:demo-0001', 'del-demo-0001', true,
   '{"event":"engagement.email_replied","timestamp":"2026-09-27T09:10:00Z","org_id":"org_f3f1e5df96e5",
     "data":{"contact_id":"ct_demo_001","sequence_id":"seq_demo_fintech_cfo_01","reply_subject":"Re: Quick question about finance hiring at Northwind","is_positive":true}}'::jsonb,
   'processed', now() - interval '6 minutes', now() - interval '5 minutes');

-- Lead timeline ----------------------------------------------------------------
insert into lead_events (workspace_id, lead_id, agent_id, task_id, inbound_event_id, type, channel, direction, summary, data, occurred_at)
select 'a0000000-0000-4000-8000-000000000001', v.lead_id, v.agent_id, v.task_id, v.inbound_id, v.type, v.channel, v.direction, v.summary, v.data::jsonb, now() - v.ago
from (values
  -- Sara (test contact): found → researched → enrolled → email sent → replied
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'a2000000-0000-4000-8000-000000000002'::uuid, '70000000-0000-4000-8000-000000000002'::uuid, null::uuid, 'found', 'system', 'internal', 'Found by Scout: VP Finance at Northwind Fintech (2 signals)', '{}', interval '98 minutes'),
  ('b0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'researched', 'system', 'internal', 'Enriched (3 credits). Why-now: Series A + hiring FP&A', '{"credits":3}', interval '80 minutes'),
  ('b0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000005', null, 'enrolled', 'system', 'internal', 'Enrolled in "Fintech CFOs — 7-touch" (allowlisted test contact)', '{"g8_sequence_id":"seq_demo_fintech_cfo_01"}', interval '35 minutes'),
  ('b0000000-0000-4000-8000-000000000001', null, null, null, 'email_sent', 'email', 'outbound', 'Email 1 sent: "Quick question about finance hiring at Northwind"', '{"step":1}', interval '33 minutes'),
  ('b0000000-0000-4000-8000-000000000001', null, null, null, 'email_opened', 'email', 'inbound', 'Email 1 opened', '{"step":1}', interval '20 minutes'),
  ('b0000000-0000-4000-8000-000000000001', null, null, '90000000-0000-4000-8000-000000000001', 'reply_received', 'email', 'inbound', 'Replied: "Interesting — can you do Tuesday afternoon?"', '{"step":1,"excerpt":"Interesting — can you do Tuesday afternoon?"}', interval '6 minutes'),
  ('b0000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000006', null, 'stopped', 'system', 'internal', 'Stopped all channels for Northwind (reply received)', '{}', interval '5 minutes'),
  ('b0000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000006', null, 'reply_classified', 'system', 'internal', 'Classified as INTERESTED (asked for a time)', '{"intent":"interested"}', interval '4 minutes'),
  ('b0000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000006', null, 'reply_sent', 'email', 'outbound', 'Replied with 3 slots for Tuesday (auto-sent: interested, allowlisted contact)', '{"auto":true,"slots":3}', interval '3 minutes'),
  ('b0000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000006', null, 'meeting_proposed', 'system', 'internal', 'Waiting for Sara to pick a slot', '{}', interval '3 minutes'),
  -- Ahmed: contacted
  ('b0000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', null, 'found', 'system', 'internal', 'Found by Scout: CFO at Contoso Pay', '{}', interval '98 minutes'),
  ('b0000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'researched', 'system', 'internal', 'Enriched (3 credits). Why-now: hiring Head of RevOps', '{"credits":3}', interval '78 minutes'),
  ('b0000000-0000-4000-8000-000000000002', null, null, null, 'email_sent', 'email', 'outbound', 'Email 1 sent (held: real prospect, not allowlisted — simulated for demo)', '{"step":1,"simulated":true}', interval '30 minutes'),
  -- Fatima: contacted via LinkedIn
  ('b0000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', null, 'found', 'system', 'internal', 'Found by Scout: Head of Finance at Fabrikam Capital (pricing-page visits)', '{}', interval '98 minutes'),
  ('b0000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'researched', 'system', 'internal', 'Enriched (3 credits). Why-now: evaluating pricing', '{"credits":3}', interval '77 minutes'),
  ('b0000000-0000-4000-8000-000000000003', null, null, null, 'linkedin_connection_sent', 'linkedin', 'outbound', 'LinkedIn connection request sent (refs email 1)', '{"step":2,"simulated":true}', interval '25 minutes'),
  -- Omar: meeting booked
  ('b0000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', null, 'found', 'system', 'internal', 'Found by Scout: CFO at Tailspin Ledger (seed extension)', '{}', interval '98 minutes'),
  ('b0000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'researched', 'system', 'internal', 'Enriched (3 credits). Why-now: fresh funding', '{"credits":3}', interval '76 minutes'),
  ('b0000000-0000-4000-8000-000000000004', null, null, null, 'linkedin_connection_accepted', 'linkedin', 'inbound', 'Accepted LinkedIn connection', '{"simulated":true}', interval '55 minutes'),
  ('b0000000-0000-4000-8000-000000000004', null, null, null, 'reply_received', 'linkedin', 'inbound', 'Replied on LinkedIn: "Sure, send me a time"', '{"simulated":true}', interval '50 minutes'),
  ('b0000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000005', null, null, 'stopped', 'system', 'internal', 'Stopped all channels for Tailspin', '{}', interval '49 minutes'),
  ('b0000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000005', null, null, 'meeting_booked', 'system', 'internal', 'Discovery call booked for Tue 15:00 (Google Meet)', '{"g8_meeting_id":"mt_demo_004"}', interval '45 minutes'),
  -- Zainab: deal
  ('b0000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', null, 'found', 'system', 'internal', 'Found by Scout: CFO at Wingtip Finance (hiring SDR + AE)', '{}', interval '98 minutes'),
  ('b0000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'researched', 'system', 'internal', 'Enriched (3 credits). Why-now: building sales team', '{"credits":3}', interval '75 minutes'),
  ('b0000000-0000-4000-8000-000000000005', null, null, null, 'call_completed', 'phone', 'outbound', 'Call completed (4 min): wants a proposal', '{"simulated":true,"duration_s":240}', interval '65 minutes'),
  ('b0000000-0000-4000-8000-000000000005', 'a5000000-0000-4000-8000-000000000005', null, null, 'meeting_booked', 'system', 'internal', 'Discovery call held yesterday', '{"g8_meeting_id":"mt_demo_005"}', interval '1 day'),
  ('b0000000-0000-4000-8000-000000000005', 'a5000000-0000-4000-8000-000000000005', null, null, 'deal_created', 'system', 'internal', 'Deal created: $12,000 — stage Discovery', '{"g8_deal_id":"deal_demo_005","amount":12000,"stage":"Discovery"}', interval '60 minutes'),
  -- Hamza: queued
  ('b0000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', null, 'found', 'system', 'internal', 'Found by Scout: VP Finance at Litware Payments', '{}', interval '98 minutes'),
  ('b0000000-0000-4000-8000-000000000006', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'researched', 'system', 'internal', 'Enriched (3 credits). No public signal; case-study angle', '{"credits":3}', interval '70 minutes'),
  -- Mariam: prospect only
  ('b0000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', null, 'found', 'system', 'internal', 'Found by Scout: Head of Growth at Proseware Lending (weak fit 61)', '{}', interval '95 minutes'),
  -- Ali: disqualified (wrong person)
  ('b0000000-0000-4000-8000-000000000008', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', null, 'found', 'system', 'internal', 'Found by Scout: Controller at Adventure Works Capital', '{}', interval '98 minutes'),
  ('b0000000-0000-4000-8000-000000000008', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', null, 'researched', 'system', 'internal', 'Enriched (3 credits). Likely not the buyer', '{"credits":3}', interval '72 minutes'),
  ('b0000000-0000-4000-8000-000000000008', null, null, null, 'reply_received', 'email', 'inbound', 'Replied: "Not my area — try our CFO"', '{"simulated":true}', interval '29 minutes'),
  ('b0000000-0000-4000-8000-000000000008', 'a5000000-0000-4000-8000-000000000005', null, null, 'disqualified', 'system', 'internal', 'Disqualified: wrong person. Referral to CFO queued for Scout', '{"reason":"wrong_person"}', interval '28 minutes')
) as v(lead_id, agent_id, task_id, inbound_id, type, channel, direction, summary, data, ago);

-- Agent runs (heartbeats) -------------------------------------------------------
insert into agent_runs (id, workspace_id, agent_id, task_id, trigger, trigger_ref, status, summary, model, input_tokens, output_tokens, tool_call_count, credits_used, started_at, finished_at) values
  ('80000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'slash_command', '/hire-sales 8x.social', 'succeeded', 'Read graph8 context (23 docs), wrote plan, created 3 tasks for Bilal/Hira/Usman', 'gemini-3.8-flash', 18200, 1400, 6, 0, now() - interval '2 hours', now() - interval '115 minutes'),
  ('80000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'delegation', '70000000-0000-4000-8000-000000000001', 'succeeded', 'Searched 4 ICP filters (free), ranked by signals, saved 12 to graph8 list', 'gemini-3.8-flash', 9400, 2100, 9, 0, now() - interval '109 minutes', now() - interval '95 minutes'),
  ('80000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'delegation', '70000000-0000-4000-8000-000000000001', 'succeeded', 'Enriched 7 contacts (21 credits), wrote why-now for each', 'gemini-3.8-flash', 12100, 3900, 11, 24, now() - interval '93 minutes', now() - interval '70 minutes'),
  ('80000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000004', 'delegation', '70000000-0000-4000-8000-000000000001', 'succeeded', 'Created list + 7-step sequence in graph8 (drafted, not launched)', 'gemini-3.8-flash', 8800, 5200, 7, 10, now() - interval '68 minutes', now() - interval '50 minutes'),
  ('80000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000005', 'slack_action', 'approve:d0000000-0000-4000-8000-000000000001', 'succeeded', 'Approval received; sequence launched; 1 test contact enrolled', 'gemini-3.8-flash', 3100, 600, 4, 0, now() - interval '36 minutes', now() - interval '35 minutes'),
  ('80000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000008', 'cron', 'standup:2026-09-27', 'succeeded', 'Posted standup', 'gemini-3.8-flash', 6400, 900, 5, 0, now() - interval '20 minutes', now() - interval '19 minutes'),
  ('80000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000006', 'webhook', '90000000-0000-4000-8000-000000000001', 'running', null, 'gemini-3.8-flash', 4200, 300, 3, 0, now() - interval '5 minutes', null);

update inbound_events set run_id = '80000000-0000-4000-8000-000000000007' where id = '90000000-0000-4000-8000-000000000001';

insert into run_steps (run_id, workspace_id, seq, kind, name, args, result, ok, credits_used, duration_ms) values
  ('80000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 1, 'tool', 'g8.sequences.pauseContact', '{"sequence_id":"seq_demo_fintech_cfo_01","contact_id":"ct_demo_001"}', '{"ok":true}', true, 0, 420),
  ('80000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 2, 'llm', 'classify_reply', '{"excerpt":"Interesting — can you do Tuesday afternoon?"}', '{"intent":"interested","confidence":0.94}', true, 0, 1300),
  ('80000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 3, 'tool', 'g8.appointments.slots', '{"event_type":"Discovery call","days":3}', '{"slots":3}', true, 0, 610),
  ('80000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 4, 'tool', 'g8.inbox.sendReply', '{"contact_id":"ct_demo_001","channel":"email","allowlist_check":"pass"}', '{"ok":true}', true, 0, 890);

-- Approvals ----------------------------------------------------------------------
insert into approvals (id, workspace_id, requested_by_agent_id, task_id, sequence_id, lead_id, kind, title, summary, payload, status,
  decision_note, decided_by_slack_user, decided_at, slack_channel, slack_ts, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', null, 'launch_sequence',
   'Launch 7-touch sequence to 8 leads', 'Enrolls allowlisted test contacts now; real prospects stay on hold until you lift the safety allowlist.',
   '{"lead_count":8,"enroll_count":1,"channels":["email","linkedin","phone"],"first_send":"immediately (demo schedule 24/7)","g8_sequence_id":"seq_demo_fintech_cfo_01"}'::jsonb,
   'approved', null, 'U0DEMO0001', now() - interval '36 minutes', 'C0C49DG285V', '1790000000.000510', now() - interval '48 minutes'),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000001', null, 'connect_account',
   'Connect LinkedIn so 3 of 7 touches can send', 'Steps 2, 3 and 6 (LinkedIn) are queued for all leads. Email and call steps keep running. Connect in graph8, then click Done.',
   '{"account":"linkedin","connect_url":"https://app.graph8.com/studio/settings","blocked_steps":[2,3,6]}'::jsonb,
   'pending', null, null, null, 'C0C49DG285V', '1790000000.000710', now() - interval '3 minutes');

update tasks set approval_id = 'd0000000-0000-4000-8000-000000000001' where id = '70000000-0000-4000-8000-000000000005';
update tasks set blocked_on = 'approval', approval_id = 'd0000000-0000-4000-8000-000000000002' where id = '70000000-0000-4000-8000-000000000007';
update sequences set task_id = '70000000-0000-4000-8000-000000000004', approval_id = 'd0000000-0000-4000-8000-000000000001' where id = '50000000-0000-4000-8000-000000000001';

-- Reports (what the portal report stream shows) ------------------------------------
insert into reports (workspace_id, from_agent_id, to_agent_id, task_id, run_id, kind, title, body, data, slack_channel, slack_ts, slack_thread_ts, created_at) values
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, '70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'plan',
   'Hired. Here is the plan.', 'I read 8x.social and the 23 graph8 context docs. Target: Series A-B fintech CFOs (US/UK). Team: Bilal (Scout), Hira (Researcher), Usman (SDR), Zara (Closer). Budget 100,000 credits/day per agent. First standup 9:00.',
   '{"icp":"Series A-B fintech CFOs","budget":100000}', 'C0C49DG285V', '1790000000.000100', null, now() - interval '115 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'handoff',
   'Found 12 accounts, 8 with strong signals', '5 hiring finance roles, 3 raised in the last 90 days. Saved to graph8 list "Fintech CFOs — batch 1".',
   '{"found":12,"strong":8}', 'C0C4KMJMKK7', '1790000000.000210', '1790000000.000200', now() - interval '95 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000003', 'handoff',
   'Enriched 7, why-now written', '21 credits spent (3 per lead). Best hooks: Northwind (Series A + FP&A hire), Wingtip (hiring SDR + AE).',
   '{"enriched":7,"credits":21}', 'C0C4KMJMKK7', '1790000000.000310', '1790000000.000300', now() - interval '70 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000004', 'handoff',
   'Sequence drafted: 7 touches over 12 days', 'Email → LinkedIn connect (refs email) → LinkedIn msg → email 2 → call → LinkedIn msg 2 → breakup. Stops on any reply. Not launched.',
   '{"steps":7,"channels":["email","linkedin","phone"]}', 'C0C4KMJMKK7', '1790000000.000410', '1790000000.000400', now() - interval '50 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, '70000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000005', 'update',
   'Sequence live', 'You approved. 1 allowlisted test contact enrolled; 7 real prospects held by the safety allowlist. First email goes out now.',
   '{"enrolled":1,"held":7}', 'C0C49DG285V', '1790000000.000520', null, now() - interval '35 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, '70000000-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000006', 'standup',
   'Standup — Sun 27 Sep', 'Yesterday: team hired, 12 prospects found, 8 researched, sequence built and launched. Today: handle replies, batch 2 (UK). Blockers: none. Pipeline: 8 in sequence, 1 replied, 1 meeting, 1 deal ($12k). Credits (graph8 + LLM): Ayesha 38, Bilal 12, Hira 37, Usman 24, Zara 0.',
   '{"pipeline":{"prospects":8,"contacted":2,"replied":1,"meetings":1,"deals":1,"deal_value":12000},"credits":{"Ayesha":38,"Bilal":12,"Hira":37,"Usman":24,"Zara":0}}',
   'C0C49DG285V', '1790000000.000800', null, now() - interval '19 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, '70000000-0000-4000-8000-000000000009', null, 'answer',
   'Pipeline right now', '8 in sequence · 1 replied (Sara, Northwind) · 1 meeting (Omar, Tailspin, Tue 15:00) · 1 deal (Wingtip, $12k, Discovery).',
   '{}', 'C0C49DG285V', '1790000000.000900', null, now() - interval '11 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000007', 'update',
   'Sara (Northwind) replied — interested', 'Stopped all channels for Northwind. She asked for Tuesday afternoon. Sent 3 slots on email (auto-send: interested). Waiting for her pick.',
   '{"lead_id":"b0000000-0000-4000-8000-000000000001","intent":"interested"}', 'C0C4KMJMKK7', '1790000000.000610', '1790000000.000600', now() - interval '4 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, '70000000-0000-4000-8000-000000000007', null, 'question',
   'LinkedIn is not connected — connect it?', '3 of 7 touches (LinkedIn) are queued for every lead. Email and call steps run meanwhile. Connect LinkedIn in graph8 and click Done in Slack.',
   '{"approval_id":"d0000000-0000-4000-8000-000000000002"}', 'C0C49DG285V', '1790000000.000710', null, now() - interval '3 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, null, null, 'win',
   'Deal created: Wingtip Finance — $12k', 'Zainab (CFO) took the discovery call. Deal opened in graph8 at stage Discovery.',
   '{"lead_id":"b0000000-0000-4000-8000-000000000005","amount":12000}', 'C0C49DG285V', '1790000000.000950', null, now() - interval '60 minutes');

-- Credit ledger (trigger recomputes agents.spent_today_credits from these) --------
-- Reset the seeded counters first so the trigger's sums are the truth.
update agents set spent_today_credits = 0 where workspace_id = 'a0000000-0000-4000-8000-000000000001';
update workspaces set spent_today_credits = 0 where id = 'a0000000-0000-4000-8000-000000000001';
update tasks set credits_used = 0 where workspace_id = 'a0000000-0000-4000-8000-000000000001';
update agent_runs set credits_used = 0 where workspace_id = 'a0000000-0000-4000-8000-000000000001';

insert into credit_events (workspace_id, agent_id, task_id, run_id, lead_id, source, action, credits, note, created_at)
select 'a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003',
       '80000000-0000-4000-8000-000000000003', l.id, 'graph8', 'enrich_person', 3, 'waterfall enrichment', now() - interval '80 minutes'
from leads l where l.workspace_id = 'a0000000-0000-4000-8000-000000000001' and l.id <> 'b0000000-0000-4000-8000-000000000007';
insert into credit_events (workspace_id, agent_id, task_id, run_id, source, action, credits, note, created_at) values
  ('a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000004', 'graph8', 'ai_generate', 10, 'sequence copy (7 steps)', now() - interval '55 minutes'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'graph8', 'ai_generate', 6, 'plan summary', now() - interval '116 minutes');

-- LLM cost rows (source='llm', 1000 tokens = 1 credit, rounded up) — one per run.
insert into credit_events (workspace_id, agent_id, task_id, run_id, source, action, credits, input_tokens, output_tokens, note, created_at)
select r.workspace_id, r.agent_id, r.task_id, r.id, 'llm', 'llm_run',
       ceil((r.input_tokens + r.output_tokens) / 1000.0)::int, r.input_tokens, r.output_tokens, r.model,
       coalesce(r.finished_at, now())
from agent_runs r where r.workspace_id = 'a0000000-0000-4000-8000-000000000001';

-- The credit trigger touches last_active_at; restore the story's "who is active now".
update agents set status = 'waiting_on_you', last_active_at = now() - interval '3 minutes' where id = 'a1000000-0000-4000-8000-000000000001';
update agents set status = 'idle',           last_active_at = now() - interval '41 minutes' where id = 'a3000000-0000-4000-8000-000000000003';
update agents set status = 'idle',           last_active_at = now() - interval '30 minutes' where id = 'a4000000-0000-4000-8000-000000000004';

commit;
