-- =============================================================================
-- 002 — Portal activity feed: expose run_steps step-by-step activity safely.
--
-- The server writes one run_steps row per agent step (tool/llm/slack/note) via
-- RunCtx.step(): `name` + a PII-redacted summary stored at result->>'summary'.
-- `args` (the step's data: ids/details), the rest of `result`, and `error` may
-- hold prospect details and stay PRIVATE.
--
-- Approach (works with Realtime, which streams table rows and not views):
--   1. `summary` = stored generated column lifted from result->>'summary'.
--   2. RLS SELECT policy for anon/authenticated on visible workspaces.
--   3. Column-level SELECT grant on safe columns only (no args/result/error).
--      `select *` / `select=args` as anon => permission denied. Realtime
--      (postgres_changes) checks the subscriber's RLS and column privileges.
--   4. View `portal_activity` (security_invoker) joins agent_runs + agents for
--      agent name/role/task_id — the one query the portal needs.
--   5. run_steps added to supabase_realtime (default replica identity: inserts only).
-- =============================================================================

alter table run_steps
  add column if not exists summary text generated always as (left(result->>'summary', 500)) stored;

create index if not exists run_steps_run_idx on run_steps (run_id, seq);

drop policy if exists portal_read on run_steps;
create policy portal_read on run_steps for select to anon, authenticated
  using (is_workspace_visible(workspace_id));

revoke all on run_steps from anon, authenticated;
grant select (id, run_id, workspace_id, seq, kind, name, summary, ok, credits_used, duration_ms, created_at)
  on run_steps to anon, authenticated;

create or replace view portal_activity with (security_invoker = true) as
select s.id, s.workspace_id, s.run_id, r.agent_id, r.task_id,
       a.name as agent_name, a.role as agent_role, a.emoji as agent_emoji, a.color as agent_color,
       t.number as task_number, t.title as task_title,
       s.seq, s.kind, s.name, s.summary, s.ok, s.credits_used, s.duration_ms, s.created_at
from run_steps s
join agent_runs r on r.id = s.run_id
join agents a on a.id = r.agent_id
left join tasks t on t.id = r.task_id;

grant select on portal_activity to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'run_steps') then
    alter publication supabase_realtime add table run_steps;
  end if;
end $$;
