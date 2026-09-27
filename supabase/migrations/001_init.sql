-- =============================================================================
-- 001_init.sql — AI Sales Team (Slack + Agent Office) — Supabase Postgres 15+
-- =============================================================================
-- Design in docs/SCHEMA.md. Rules that every table follows:
--   * workspace_id on every row (one workspace = one client company / Slack team).
--   * graph8 is the source of truth for contacts, sequences, meetings, deals.
--     We MIRROR only what the portal + agents need, and keep graph8 ids (text).
--   * status/stage/kind columns are text + named CHECK constraint (easy to extend
--     with one ALTER, no enum migrations).
--   * timestamptz everywhere. updated_at maintained by trigger.
--   * No hard deletes in app code; lifecycle via status columns. Cascades only
--     when a workspace is removed.
--   * Server uses the service_role key (bypasses RLS). Portal uses the anon /
--     authenticated keys and only sees PORTAL-SAFE tables. Secrets and PII live
--     in separate tables that have RLS enabled and NO policies.
--
-- Runs on a fresh Supabase project. Also runs on vanilla Postgres 15+ (roles and
-- the realtime publication are created/guarded so local validation works).
-- =============================================================================

-- gen_random_uuid() is core since PG13; pgcrypto kept for Supabase parity.
do $$ begin
  create extension if not exists pgcrypto;
exception when others then null; end $$;

-- Supabase roles exist already; create no-login stubs on vanilla Postgres.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls; end if;
end $$;

-- =============================================================================
-- Helper functions
-- =============================================================================

-- Current Supabase Auth user id (same logic as auth.uid(), no dependency on the
-- auth schema so the migration also runs locally). NULL for anon / service.
create or replace function app_current_user_id() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), '')::uuid
$$;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- 1. Workspaces (one per client company). PORTAL-SAFE.
-- =============================================================================
create table workspaces (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,              -- '8x-social'
  name                   text not null,                     -- '8x.social'
  company_domain         text,                              -- '8x.social'
  timezone               text not null default 'Asia/Karachi',
  status                 text not null default 'onboarding',
  founder_name           text,
  founder_slack_user_id  text,                              -- 'U0123…'
  -- graph8 + Slack references (non-secret)
  g8_org_id              text,                              -- 'org_f3f1e5df96e5'
  g8_schedule_id         text,                              -- 24/7 demo sending schedule
  slack_team_id          text,                              -- 'T0123…'
  slack_channel_team     text,                              -- #sales-team (agents' office)
  slack_channel_hq       text,                              -- #sales-hq (Head <-> founder)
  -- behaviour
  standup_hour           smallint not null default 9 check (standup_hour between 0 and 23),
  demo_time_scale        numeric(8,4) not null default 1.0, -- 1 = real days; demo uses ~0.001
  is_demo                boolean not null default false,    -- true => portal readable with anon key
  budget_daily_credits   integer not null default 500000 check (budget_daily_credits >= 0), -- demo-safe: huge; auto-pause still works
  spent_today_credits    integer not null default 0,
  spend_day              date not null default current_date,
  task_counter           integer not null default 0,        -- feeds tasks.number (T-12)
  sales_brain            jsonb not null default '{}'::jsonb, -- cached ICP/personas/offer summary from graph8
  settings               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint workspaces_status_chk check (status in ('onboarding','active','paused','archived'))
);
create trigger workspaces_updated_at before update on workspaces
  for each row execute function set_updated_at();

-- =============================================================================
-- 2. Workspace secrets. PRIVATE (RLS on, no policies => service_role only).
-- =============================================================================
create table workspace_secrets (
  workspace_id        uuid primary key references workspaces(id) on delete cascade,
  g8_api_key          text,
  g8_webhook_id       text,
  g8_webhook_secret   text,
  slack_bot_token     text,                                  -- xoxb-… (per Slack install). App-level token is global env.
  extra               jsonb not null default '{}'::jsonb,    -- future: tinyfish key, etc.
  updated_at          timestamptz not null default now()
);
create trigger workspace_secrets_updated_at before update on workspace_secrets
  for each row execute function set_updated_at();

-- =============================================================================
-- 3. Workspace members (Supabase Auth users who may see a workspace). Used by
--    RLS later; harmless now (demo workspace is public via is_demo).
-- =============================================================================
create table workspace_members (
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid not null,                               -- auth.users.id
  role          text not null default 'owner',
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_role_chk check (role in ('owner','member','viewer'))
);

create or replace function is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = app_current_user_id()
  )
$$;

-- What the portal may read: demo workspaces (anon) or workspaces you belong to.
create or replace function is_workspace_visible(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspaces w where w.id = ws and w.is_demo)
      or is_workspace_member(ws)
$$;

-- =============================================================================
-- 4. Contact allowlist. PRIVATE. The ONLY people agents may ever message/call.
--    Seeded from TEST_ALLOWLIST env; per-workspace so real clients later can
--    allowlist their own team for dry runs. tools/g8.ts guard checks this.
-- =============================================================================
create table contact_allowlist (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  label          text not null,                              -- 'Talha (team)'
  email          text,                                       -- lower-cased
  phone          text,                                       -- E.164
  linkedin_url   text,                                       -- normalized, no trailing slash
  g8_contact_id  text,                                       -- once created in graph8
  created_at     timestamptz not null default now(),
  constraint contact_allowlist_any_handle_chk
    check (email is not null or phone is not null or linkedin_url is not null)
);
create unique index contact_allowlist_email_uq on contact_allowlist (workspace_id, lower(email)) where email is not null;
create unique index contact_allowlist_phone_uq on contact_allowlist (workspace_id, phone) where phone is not null;
create index contact_allowlist_ws_idx on contact_allowlist (workspace_id);

-- =============================================================================
-- 5. Agents — the org chart (reports_to self-FK; NULL = reports to the founder).
--    PORTAL-SAFE. One row per agent instance per workspace.
-- =============================================================================
create table agents (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  role                  text not null,                       -- what it does (extensible set)
  name                  text not null,                       -- 'Ayesha' (Slack persona name)
  title                 text not null,                       -- 'Head of Sales'
  job                   text not null,                       -- one-line job description
  reports_to            uuid references agents(id) on delete set null,
  emoji                 text not null default '🤖',
  color                 text not null default '#6366F1',     -- hex; same in Slack + portal
  avatar_url            text,                                -- Slack icon_url
  sort_order            smallint not null default 0,
  status                text not null default 'idle',
  pause_reason          text,
  current_task_id       uuid,                                -- FK added after tasks
  -- budget (graph8 credits per calendar day in workspace timezone)
  budget_daily_credits  integer not null default 100000 check (budget_daily_credits >= 0), -- demo-safe: huge; auto-pause still works
  spent_today_credits   integer not null default 0,
  spend_day             date not null default current_date,
  budget_warn_pct       smallint not null default 80 check (budget_warn_pct between 1 and 100),
  -- brain config (per-workspace overrides; server has defaults per role)
  model                 text,                                -- e.g. 'gemini-3.8-flash'
  instructions          text,                                -- extra system prompt
  tools                 jsonb not null default '[]'::jsonb,  -- allowed tool names; [] = role default
  last_active_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (workspace_id, name),
  constraint agents_role_chk check (role in ('head_of_sales','scout','researcher','sdr','closer')),
  constraint agents_status_chk check (status in ('idle','working','waiting_on_you','paused','error')),
  constraint agents_pause_reason_chk check (pause_reason is null or pause_reason in ('budget','manual','error')),
  constraint agents_paused_has_reason_chk check (status <> 'paused' or pause_reason is not null),
  constraint agents_not_self_manager_chk check (reports_to is null or reports_to <> id)
);
create index agents_ws_idx on agents (workspace_id, sort_order);
create index agents_ws_status_idx on agents (workspace_id, status);
create index agents_reports_to_idx on agents (workspace_id, reports_to);
create trigger agents_updated_at before update on agents
  for each row execute function set_updated_at();

-- =============================================================================
-- 6. Tasks — unit of work; one task = one Slack thread. Parent/child = delegation
--    (Head creates child task for a sub-agent, blocks on it, wakes when done).
--    PORTAL-SAFE.
-- =============================================================================
create table tasks (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  number               integer not null,                     -- per-workspace T-12
  kind                 text not null default 'custom',
  title                text not null,
  detail               text,                                 -- instructions / context for the agent
  assignee_agent_id    uuid references agents(id) on delete set null,
  created_by_agent_id  uuid references agents(id) on delete set null, -- NULL = founder/system
  parent_task_id       uuid references tasks(id) on delete set null,
  root_task_id         uuid references tasks(id) on delete set null, -- top of the tree (= self for roots)
  lead_id              uuid,                                 -- FK added after leads
  sequence_id          uuid,                                 -- FK added after sequences
  priority             smallint not null default 2 check (priority between 0 and 3), -- 0 urgent … 3 low
  status               text not null default 'todo',
  blocked_on           text,                                 -- who/what unblocks (routable owner); 'lead' = waiting for the prospect
  blocked_reason       text,                                 -- 'Approve launch to 12 leads'
  blocked_by_task_id   uuid references tasks(id) on delete set null,
  approval_id          uuid,                                 -- FK added after approvals
  result_summary       text,                                 -- one paragraph, human readable
  input                jsonb not null default '{}'::jsonb,
  output               jsonb not null default '{}'::jsonb,
  credits_used         integer not null default 0,
  -- Slack mapping: parent message in #sales-team is the thread root
  slack_channel        text,
  slack_thread_ts      text,
  -- execution lock (Paperclip "checkout"): only the run holding the lock may write
  locked_by_run_id     uuid,
  locked_at            timestamptz,
  attempt_count        smallint not null default 0,
  due_at               timestamptz,
  started_at           timestamptz,
  finished_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, number),
  constraint tasks_kind_chk check (kind in (
    'onboard','plan','find_prospects','research_leads','build_sequence','launch_sequence',
    'handle_reply','book_meeting','create_deal','standup','answer_question','custom')),
  constraint tasks_status_chk check (status in ('todo','in_progress','blocked','done','failed','cancelled')),
  constraint tasks_blocked_on_chk check (blocked_on is null or blocked_on in
    ('founder','approval','task','graph8','connection','budget','lead')),
  constraint tasks_blocked_needs_owner_chk check (status <> 'blocked' or blocked_on is not null),
  constraint tasks_blocked_task_ref_chk check (blocked_on is distinct from 'task' or blocked_by_task_id is not null),
  constraint tasks_blocked_approval_ref_chk check (blocked_on is distinct from 'approval' or approval_id is not null)
);
create index tasks_ws_status_idx on tasks (workspace_id, status, created_at desc);
create index tasks_assignee_idx on tasks (assignee_agent_id, status);
create index tasks_parent_idx on tasks (parent_task_id);
create index tasks_root_idx on tasks (root_task_id);
create index tasks_lead_idx on tasks (lead_id);
create unique index tasks_slack_thread_uq on tasks (workspace_id, slack_channel, slack_thread_ts)
  where slack_thread_ts is not null;

alter table agents add constraint agents_current_task_fk
  foreign key (current_task_id) references tasks(id) on delete set null;

-- Per-workspace task number + root_task_id + timestamps.
create or replace function tasks_before_insert() returns trigger
language plpgsql as $$
begin
  if new.number is null or new.number = 0 then
    update workspaces set task_counter = task_counter + 1
      where id = new.workspace_id
      returning task_counter into new.number;
  end if;
  if new.root_task_id is null then
    if new.parent_task_id is null then
      new.root_task_id := new.id;
    else
      select coalesce(root_task_id, id) into new.root_task_id from tasks where id = new.parent_task_id;
    end if;
  end if;
  if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
  if new.status in ('done','failed','cancelled') and new.finished_at is null then new.finished_at := now(); end if;
  return new;
end $$;
alter table tasks alter column number set default 0;
create trigger tasks_before_insert before insert on tasks
  for each row execute function tasks_before_insert();

create or replace function tasks_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'in_progress' and old.status <> 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status in ('done','failed','cancelled') and old.status not in ('done','failed','cancelled') then
    new.finished_at := coalesce(new.finished_at, now());
    new.locked_by_run_id := null;
    new.locked_at := null;
  end if;
  if new.status <> 'blocked' then
    new.blocked_on := null; new.blocked_reason := null; new.blocked_by_task_id := null;
  end if;
  return new;
end $$;
create trigger tasks_before_update before update on tasks
  for each row execute function tasks_before_update();

-- =============================================================================
-- 7. Agent runs — one row per heartbeat (stateless wake). PORTAL-SAFE (summary).
-- =============================================================================
create table agent_runs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  agent_id         uuid not null references agents(id) on delete cascade,
  task_id          uuid references tasks(id) on delete set null,
  trigger          text not null,
  trigger_ref      text,                                     -- slack ts / cron name / inbound_event id
  status           text not null default 'running',
  summary          text,                                     -- what the run did, 1-2 lines
  error            text,
  model            text,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  tool_call_count  integer not null default 0,
  credits_used     integer not null default 0,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  constraint agent_runs_trigger_chk check (trigger in
    ('slack_message','slack_action','slash_command','cron','webhook','delegation','approval','system','manual')),
  constraint agent_runs_status_chk check (status in ('running','succeeded','failed','cancelled'))
);
create index agent_runs_ws_idx on agent_runs (workspace_id, started_at desc);
create index agent_runs_agent_idx on agent_runs (agent_id, started_at desc);
create index agent_runs_task_idx on agent_runs (task_id);

alter table tasks add constraint tasks_locked_by_run_fk
  foreign key (locked_by_run_id) references agent_runs(id) on delete set null;

-- Tool-call log per run. PRIVATE (args may contain prospect emails/phones).
create table run_steps (
  id            bigint generated always as identity primary key,
  run_id        uuid not null references agent_runs(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  seq           integer not null,
  kind          text not null default 'tool',
  name          text not null,                               -- 'g8.search.contacts' | 'llm' | 'slack.post'
  args          jsonb,
  result        jsonb,                                       -- trimmed/summarized result
  ok            boolean not null default true,
  error         text,
  credits_used  integer not null default 0,
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  unique (run_id, seq),
  constraint run_steps_kind_chk check (kind in ('tool','llm','slack','note'))
);
create index run_steps_ws_idx on run_steps (workspace_id, created_at desc);

-- =============================================================================
-- 8. Reports — messages agents post up the chain (also mirrored to Slack).
--    to_agent_id NULL = to the founder. PORTAL-SAFE. Drives the report stream.
-- =============================================================================
create table reports (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  from_agent_id    uuid not null references agents(id) on delete cascade,
  to_agent_id      uuid references agents(id) on delete set null,
  task_id          uuid references tasks(id) on delete set null,
  run_id           uuid references agent_runs(id) on delete set null,
  kind             text not null default 'update',
  title            text not null,
  body             text,                                     -- markdown-ish plain text
  data             jsonb not null default '{}'::jsonb,       -- structured (pipeline numbers, lead ids…)
  slack_channel    text,
  slack_ts         text,
  slack_thread_ts  text,
  created_at       timestamptz not null default now(),
  constraint reports_kind_chk check (kind in
    ('plan','update','handoff','standup','win','alert','question','answer'))
);
create index reports_ws_idx on reports (workspace_id, created_at desc);
create index reports_task_idx on reports (task_id);

-- =============================================================================
-- 9. Approvals — founder decisions, made with Slack buttons. PORTAL-SAFE.
-- =============================================================================
create table approvals (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references workspaces(id) on delete cascade,
  requested_by_agent_id  uuid not null references agents(id) on delete cascade,
  task_id                uuid references tasks(id) on delete set null,
  sequence_id            uuid,                               -- FK added after sequences
  lead_id                uuid,                               -- FK added after leads
  kind                   text not null,
  title                  text not null,                      -- 'Launch 7-touch sequence to 12 leads'
  summary                text,                               -- what happens if approved
  payload                jsonb not null default '{}'::jsonb, -- typed per kind (see types.ts)
  status                 text not null default 'pending',
  decision_note          text,                               -- founder's Edit/Skip text
  decided_by_slack_user  text,
  decided_at             timestamptz,
  expires_at             timestamptz,
  slack_channel          text,
  slack_ts               text,                               -- message with the buttons (updated on decision)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint approvals_kind_chk check (kind in
    ('launch_sequence','enroll_leads','send_reply','book_meeting','budget_increase','connect_account','custom')),
  constraint approvals_status_chk check (status in
    ('pending','approved','rejected','edit_requested','expired','cancelled'))
);
create index approvals_ws_status_idx on approvals (workspace_id, status, created_at desc);
create unique index approvals_slack_uq on approvals (workspace_id, slack_channel, slack_ts) where slack_ts is not null;
create trigger approvals_updated_at before update on approvals
  for each row execute function set_updated_at();

alter table tasks add constraint tasks_approval_fk
  foreign key (approval_id) references approvals(id) on delete set null;

-- =============================================================================
-- 10. Sequences — mirror of the graph8 sequence the SDR built (steps summary
--     for the approval card + portal). graph8 owns the real thing. PORTAL-SAFE.
-- =============================================================================
create table sequences (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  created_by_agent_id  uuid references agents(id) on delete set null,
  task_id              uuid references tasks(id) on delete set null,
  approval_id          uuid references approvals(id) on delete set null,
  g8_sequence_id       text,
  g8_list_id           text,
  g8_schedule_id       text,
  name                 text not null,
  status               text not null default 'draft',
  channels             text[] not null default '{}',         -- {'email','linkedin','phone'}
  steps                jsonb not null default '[]'::jsonb,   -- [{n, day, channel, action, subject, preview}]
  lead_count           integer not null default 0,           -- leads targeted (shown in approval)
  enrolled_count       integer not null default 0,           -- actually enrolled (allowlisted only)
  stats                jsonb not null default '{}'::jsonb,   -- {sent, opened, replied, meetings}
  launched_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint sequences_status_chk check (status in
    ('draft','pending_approval','live','paused','completed','cancelled'))
);
create index sequences_ws_idx on sequences (workspace_id, created_at desc);
create unique index sequences_g8_uq on sequences (workspace_id, g8_sequence_id) where g8_sequence_id is not null;
create trigger sequences_updated_at before update on sequences
  for each row execute function set_updated_at();

alter table tasks add constraint tasks_sequence_fk
  foreign key (sequence_id) references sequences(id) on delete set null;
alter table approvals add constraint approvals_sequence_fk
  foreign key (sequence_id) references sequences(id) on delete set null;

-- =============================================================================
-- 11. Leads — pipeline mirror (person at a company). PORTAL-SAFE: NO email /
--     phone / LinkedIn here; those live in lead_contacts (private).
-- =============================================================================
create table leads (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  g8_contact_id        text,
  g8_company_id        text,
  g8_list_id           text,
  g8_deal_id           text,
  g8_meeting_id        text,
  sequence_id          uuid references sequences(id) on delete set null,
  owner_agent_id       uuid references agents(id) on delete set null,
  full_name            text not null,
  job_title            text,
  company_name         text,
  company_domain       text,                                 -- also groups the "account"
  location             text,
  source               text not null default 'scout',
  stage                text not null default 'prospect',
  stage_changed_at     timestamptz not null default now(),
  disqualify_reason    text,
  fit_score            smallint check (fit_score between 0 and 100),
  signals              jsonb not null default '[]'::jsonb,   -- [{type:'hiring', text:'…', source:url}]
  why_now              text,                                 -- Researcher's 2-line hook
  research             jsonb not null default '{}'::jsonb,   -- richer notes, links
  sequence_state       text not null default 'none',
  last_channel         text,
  last_reply_intent    text,
  last_activity_at     timestamptz,
  meeting_at           timestamptz,
  deal_amount          numeric(14,2),
  deal_stage           text,                                 -- graph8 stage_name mirror
  is_test_contact      boolean not null default false,       -- allowlisted team member => may be contacted
  do_not_contact       boolean not null default false,       -- unsubscribe / negative reply => never again
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint leads_source_chk check (source in ('scout','signal','inbound','manual','referral')),
  constraint leads_stage_chk check (stage in
    ('prospect','researched','queued','contacted','replied','meeting','deal','won','lost','disqualified')),
  constraint leads_disqualify_reason_chk check (disqualify_reason is null or disqualify_reason in
    ('not_interested','unsubscribed','bounced','wrong_person','no_fit','do_not_contact')),
  constraint leads_sequence_state_chk check (sequence_state in
    ('none','queued','enrolled','stopped','completed')),
  constraint leads_last_channel_chk check (last_channel is null or last_channel in
    ('email','linkedin','phone','sms','whatsapp')),
  constraint leads_last_reply_intent_chk check (last_reply_intent is null or last_reply_intent in
    ('interested','question','objection','not_now','wrong_person','referral','not_interested',
     'unsubscribe','out_of_office','unknown'))
);
create unique index leads_g8_contact_uq on leads (workspace_id, g8_contact_id) where g8_contact_id is not null;
create index leads_ws_stage_idx on leads (workspace_id, stage);
create index leads_ws_company_idx on leads (workspace_id, company_domain);
create index leads_sequence_idx on leads (sequence_id);
create index leads_ws_activity_idx on leads (workspace_id, last_activity_at desc nulls last);

create or replace function leads_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.stage is distinct from old.stage then new.stage_changed_at := now(); end if;
  if new.disqualify_reason in ('unsubscribed','do_not_contact') then new.do_not_contact := true; end if;
  return new;
end $$;
create trigger leads_before_update before update on leads
  for each row execute function leads_before_update();

alter table tasks add constraint tasks_lead_fk
  foreign key (lead_id) references leads(id) on delete set null;
alter table approvals add constraint approvals_lead_fk
  foreign key (lead_id) references leads(id) on delete set null;

-- PII split. PRIVATE (RLS on, no policies). Server-only.
create table lead_contacts (
  lead_id        uuid primary key references leads(id) on delete cascade,
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  email          text,
  email_verified boolean,
  phone          text,                                       -- E.164
  linkedin_url   text,
  enriched_at    timestamptz,
  enrichment     jsonb not null default '{}'::jsonb,         -- raw graph8 enrichment payload (trimmed)
  updated_at     timestamptz not null default now()
);
create index lead_contacts_ws_idx on lead_contacts (workspace_id);
create index lead_contacts_email_idx on lead_contacts (workspace_id, lower(email)) where email is not null;
create trigger lead_contacts_updated_at before update on lead_contacts
  for each row execute function set_updated_at();

-- =============================================================================
-- 12. Lead events — the timeline (touches, replies, meetings, deals). Append-only.
--     PORTAL-SAFE (summary text must not contain email/phone).
-- =============================================================================
create table lead_events (
  id                bigint generated always as identity primary key,
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  lead_id           uuid not null references leads(id) on delete cascade,
  agent_id          uuid references agents(id) on delete set null,
  task_id           uuid references tasks(id) on delete set null,
  inbound_event_id  uuid,                                    -- FK added after inbound_events
  type              text not null,
  channel           text not null default 'system',
  direction         text not null default 'internal',
  summary           text not null,                           -- 'Email 1 sent: "Quick question about…"'
  data              jsonb not null default '{}'::jsonb,      -- {g8_sequence_id, step, reply_excerpt…}
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  constraint lead_events_type_chk check (type in (
    'found','researched','enrolled','stopped',
    'email_sent','email_opened','email_clicked','email_bounced',
    'linkedin_connection_sent','linkedin_connection_accepted','linkedin_message_sent',
    'call_placed','call_completed','voicemail_left','sms_sent',
    'reply_received','reply_classified','reply_sent',
    'meeting_proposed','meeting_booked','meeting_rescheduled','meeting_cancelled','meeting_no_show',
    'deal_created','deal_stage_changed','deal_won','deal_lost',
    'disqualified','note')),
  constraint lead_events_channel_chk check (channel in ('email','linkedin','phone','sms','whatsapp','system')),
  constraint lead_events_direction_chk check (direction in ('outbound','inbound','internal'))
);
create index lead_events_lead_idx on lead_events (lead_id, occurred_at desc);
create index lead_events_ws_idx on lead_events (workspace_id, occurred_at desc);

create or replace function lead_events_after_insert() returns trigger
language plpgsql as $$
begin
  update leads
     set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at),
         last_channel     = case when new.channel <> 'system' then new.channel else last_channel end
   where id = new.lead_id;
  return new;
end $$;
create trigger lead_events_after_insert after insert on lead_events
  for each row execute function lead_events_after_insert();

-- =============================================================================
-- 13. Inbound events — raw graph8 webhooks / Slack interactions / cron ticks.
--     Idempotency gate: INSERT … ON CONFLICT (dedupe_key) DO NOTHING; process
--     only if inserted. PRIVATE (payloads carry emails).
--     dedupe_key: graph8 => sha256(event|timestamp|data) (delivery id changes on
--     retry); Slack => event_id or "{action_id}:{message_ts}:{user}"; cron =>
--     "{job}:{date}".
-- =============================================================================
create table inbound_events (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid references workspaces(id) on delete cascade, -- NULL until resolved
  source           text not null,
  event_type       text not null,                            -- 'engagement.email_replied' | 'block_actions'
  dedupe_key       text not null unique,
  delivery_id      text,                                     -- X-Studio-Delivery-Id / Slack event_id
  signature_valid  boolean,
  payload          jsonb not null,
  status           text not null default 'received',
  error            text,
  attempts         smallint not null default 0,
  run_id           uuid references agent_runs(id) on delete set null, -- run that handled it
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  constraint inbound_events_source_chk check (source in ('graph8','slack','cron','simulated','manual')),
  constraint inbound_events_status_chk check (status in ('received','processing','processed','ignored','failed'))
);
create index inbound_events_ws_idx on inbound_events (workspace_id, received_at desc);
create index inbound_events_pending_idx on inbound_events (status, received_at) where status in ('received','failed');

alter table lead_events add constraint lead_events_inbound_fk
  foreign key (inbound_event_id) references inbound_events(id) on delete set null;

-- =============================================================================
-- 14. Credit events — budget ledger. BOTH graph8 credits and LLM cost count
--     toward the daily budget, in one unit ("credits"). source tells them apart;
--     llm rows also carry tokens (server converts tokens -> credits with
--     LLM_TOKENS_PER_CREDIT, default 1000, rounded up). Trigger maintains
--     agents.spent_today_credits + workspace counter, resets per day,
--     auto-pauses the agent at 100%. PORTAL-SAFE.
-- =============================================================================
create table credit_events (
  id             bigint generated always as identity primary key,
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  agent_id       uuid not null references agents(id) on delete cascade,
  task_id        uuid references tasks(id) on delete set null,
  run_id         uuid references agent_runs(id) on delete set null,
  lead_id        uuid references leads(id) on delete set null,
  source         text not null default 'graph8',
  action         text not null,                              -- graph8: 'enrich_person' | 'verify_email' | 'sequence_send' | 'voice_minutes' | 'ai_generate' ; llm: 'llm_run' ; manual: 'adjustment'
  credits        integer not null,                           -- budget units; negative = refund/adjustment
  input_tokens   integer,                                    -- llm rows only
  output_tokens  integer,                                    -- llm rows only
  g8_request_id  text,
  note           text,
  created_at     timestamptz not null default now(),
  constraint credit_events_source_chk check (source in ('graph8','llm','manual'))
);
create index credit_events_agent_idx on credit_events (agent_id, created_at desc);
create index credit_events_ws_idx on credit_events (workspace_id, created_at desc);

-- "Today" is the calendar day in the workspace timezone.
create or replace function workspace_today(ws uuid) returns date
language sql stable as $$
  select (now() at time zone coalesce((select timezone from workspaces where id = ws), 'UTC'))::date
$$;

create or replace function credit_events_after_insert() returns trigger
language plpgsql as $$
declare
  today date := workspace_today(new.workspace_id);
  a agents%rowtype;
begin
  -- agent counter (reset when the day rolled over)
  update agents
     set spent_today_credits = case when spend_day = today then spent_today_credits else 0 end + new.credits,
         spend_day = today,
         last_active_at = now()
   where id = new.agent_id
   returning * into a;

  if a.spent_today_credits >= a.budget_daily_credits and a.status <> 'paused' then
    update agents set status = 'paused', pause_reason = 'budget' where id = a.id;
  end if;

  -- workspace counter
  update workspaces
     set spent_today_credits = case when spend_day = today then spent_today_credits else 0 end + new.credits,
         spend_day = today
   where id = new.workspace_id;

  -- roll up onto task + run for cheap display
  if new.task_id is not null then
    update tasks set credits_used = credits_used + new.credits where id = new.task_id;
  end if;
  if new.run_id is not null then
    update agent_runs set credits_used = credits_used + new.credits where id = new.run_id;
  end if;
  return new;
end $$;
create trigger credit_events_after_insert after insert on credit_events
  for each row execute function credit_events_after_insert();

-- Cron (standup) calls this; also safe to call any time. Resets counters if the
-- day rolled over and resumes agents that were paused by budget.
create or replace function reset_daily_spend(ws uuid) returns void
language plpgsql as $$
declare today date := workspace_today(ws);
begin
  update agents set spent_today_credits = 0, spend_day = today
    where workspace_id = ws and spend_day <> today;
  update agents set status = 'idle', pause_reason = null
    where workspace_id = ws and status = 'paused' and pause_reason = 'budget'
      and spent_today_credits < budget_daily_credits;
  update workspaces set spent_today_credits = 0, spend_day = today
    where id = ws and spend_day <> today;
end $$;

-- =============================================================================
-- Portal-safe views (security_invoker => table RLS applies to the caller).
-- =============================================================================

-- Org chart + budget + current task in one read.
create view portal_agents with (security_invoker = true) as
select a.id, a.workspace_id, a.role, a.name, a.title, a.job, a.reports_to, a.emoji, a.color,
       a.avatar_url, a.sort_order, a.status, a.pause_reason,
       a.budget_daily_credits,
       case when a.spend_day = workspace_today(a.workspace_id) then a.spent_today_credits else 0 end as spent_today_credits,
       a.budget_warn_pct, a.last_active_at,
       a.current_task_id, t.title as current_task_title, t.status as current_task_status,
       t.slack_thread_ts as current_task_thread_ts,
       (select count(*) from tasks x where x.assignee_agent_id = a.id and x.status = 'done')::int as tasks_done,
       (select count(*) from tasks x where x.assignee_agent_id = a.id and x.status in ('todo','in_progress','blocked'))::int as tasks_open
from agents a
left join tasks t on t.id = a.current_task_id;

-- Pipeline strip: one row per stage per workspace (zero-filled).
create view portal_pipeline with (security_invoker = true) as
select w.id as workspace_id, s.stage, s.ord,
       coalesce(count(l.id), 0)::int as lead_count,
       coalesce(sum(l.deal_amount), 0)::numeric(14,2) as deal_amount
from workspaces w
cross join (values
  ('prospect',1),('researched',2),('queued',3),('contacted',4),('replied',5),
  ('meeting',6),('deal',7),('won',8),('lost',9),('disqualified',10)) as s(stage, ord)
left join leads l on l.workspace_id = w.id and l.stage = s.stage
group by w.id, s.stage, s.ord;

-- "What needs me": pending approvals + tasks blocked on the founder.
create view portal_needs_you with (security_invoker = true) as
select 'approval'::text as item_type, a.id, a.workspace_id, a.title,
       coalesce(a.summary, '') as detail, a.requested_by_agent_id as agent_id,
       a.slack_channel, a.slack_ts, a.created_at
from approvals a where a.status = 'pending'
union all
select 'task', t.id, t.workspace_id, t.title, coalesce(t.blocked_reason, ''), t.assignee_agent_id,
       t.slack_channel, t.slack_thread_ts, t.created_at
from tasks t where t.status = 'blocked' and t.blocked_on in ('founder','connection');

-- Today strip for the Office screen: one row per workspace, all numbers for
-- "today" in the workspace timezone. Refetch on any realtime change.
create view portal_today with (security_invoker = true) as
select w.id as workspace_id,
       workspace_today(w.id) as today,
       case when w.spend_day = workspace_today(w.id) then w.spent_today_credits else 0 end as credits_spent_today,
       w.budget_daily_credits,
       (select count(*) from agents a where a.workspace_id = w.id and a.status = 'working')::int as agents_working,
       (select count(*) from agents a where a.workspace_id = w.id and a.status = 'waiting_on_you')::int as agents_waiting_on_you,
       (select count(*) from agents a where a.workspace_id = w.id and a.status = 'paused')::int as agents_paused,
       (select count(*) from approvals p where p.workspace_id = w.id and p.status = 'pending')::int as approvals_pending,
       (select count(*) from tasks t where t.workspace_id = w.id and t.status in ('todo','in_progress','blocked'))::int as tasks_open,
       (select count(*) from tasks t where t.workspace_id = w.id and t.status = 'done'
          and (t.finished_at at time zone w.timezone)::date = workspace_today(w.id))::int as tasks_done_today,
       (select count(*) from lead_events e where e.workspace_id = w.id and e.type = 'found'
          and (e.occurred_at at time zone w.timezone)::date = workspace_today(w.id))::int as leads_found_today,
       (select count(distinct e.lead_id) from lead_events e where e.workspace_id = w.id and e.direction = 'outbound'
          and (e.occurred_at at time zone w.timezone)::date = workspace_today(w.id))::int as leads_contacted_today,
       (select count(*) from lead_events e where e.workspace_id = w.id and e.type = 'reply_received'
          and (e.occurred_at at time zone w.timezone)::date = workspace_today(w.id))::int as replies_today,
       (select count(*) from lead_events e where e.workspace_id = w.id and e.type = 'meeting_booked'
          and (e.occurred_at at time zone w.timezone)::date = workspace_today(w.id))::int as meetings_booked_today,
       (select count(*) from lead_events e where e.workspace_id = w.id and e.type = 'deal_created'
          and (e.occurred_at at time zone w.timezone)::date = workspace_today(w.id))::int as deals_created_today,
       (select count(*) from leads l where l.workspace_id = w.id and l.stage in ('deal','won'))::int as deals_open,
       (select coalesce(sum(l.deal_amount),0) from leads l where l.workspace_id = w.id and l.stage in ('deal','won'))::numeric(14,2) as deals_value
from workspaces w;

-- =============================================================================
-- Row Level Security
--   * server: service_role key => bypasses RLS.
--   * portal: anon / authenticated => SELECT on portal-safe tables where the
--     workspace is a public demo or the user is a member. No INSERT/UPDATE.
--   * private tables: RLS on, NO policies (=> nobody but service_role).
-- =============================================================================
alter table workspaces        enable row level security;
alter table workspace_secrets enable row level security;
alter table workspace_members enable row level security;
alter table contact_allowlist enable row level security;
alter table agents            enable row level security;
alter table tasks             enable row level security;
alter table agent_runs        enable row level security;
alter table run_steps         enable row level security;
alter table reports           enable row level security;
alter table approvals         enable row level security;
alter table sequences         enable row level security;
alter table leads             enable row level security;
alter table lead_contacts     enable row level security;
alter table lead_events       enable row level security;
alter table inbound_events    enable row level security;
alter table credit_events     enable row level security;

create policy portal_read on workspaces    for select to anon, authenticated using (is_workspace_visible(id));
create policy portal_read on agents        for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on tasks         for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on agent_runs    for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on reports       for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on approvals     for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on sequences     for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on leads         for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on lead_events   for select to anon, authenticated using (is_workspace_visible(workspace_id));
create policy portal_read on credit_events for select to anon, authenticated using (is_workspace_visible(workspace_id));
-- a signed-in user may see their own memberships (needed for a workspace switcher later)
create policy own_membership on workspace_members for select to authenticated using (user_id = app_current_user_id());

-- Grants (Supabase default privileges already grant these; explicit for vanilla PG
-- and so the private tables are provably unreadable even if RLS were disabled).
grant usage on schema public to anon, authenticated, service_role;
grant select on workspaces, agents, tasks, agent_runs, reports, approvals, sequences,
                leads, lead_events, credit_events, workspace_members,
                portal_agents, portal_pipeline, portal_needs_you, portal_today
  to anon, authenticated;
revoke all on workspace_secrets, contact_allowlist, run_steps, lead_contacts, inbound_events
  from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function app_current_user_id(), is_workspace_member(uuid), is_workspace_visible(uuid),
                          workspace_today(uuid) to anon, authenticated, service_role;
grant execute on function reset_daily_spend(uuid) to service_role;

-- =============================================================================
-- Realtime — portal subscribes to these (postgres_changes honours RLS above).
-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry old rows for filters.
-- =============================================================================
alter table workspaces  replica identity full;
alter table agents      replica identity full;
alter table tasks       replica identity full;
alter table reports     replica identity full;
alter table approvals   replica identity full;
alter table sequences   replica identity full;
alter table leads       replica identity full;
alter table lead_events replica identity full;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      workspaces, agents, tasks, reports, approvals, sequences, leads, lead_events;
  end if;
end $$;
