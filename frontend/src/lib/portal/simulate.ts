// Mock realtime: the "make it move" SQL snippets from docs/portal/01-data-access.md §6,
// replayed in a loop on the client when the page is opened with `?simulate=1`.
import { AGENT_ID, makeReport, pipelineFrom, seedSnapshot, taskUuid, type CreditLite, type PortalSnapshot } from "./mock";
import type { PortalAgentRow } from "./types";

type Scene = { label: string; run: (s: PortalSnapshot, now: number) => PortalSnapshot };

function patchAgent(s: PortalSnapshot, id: string, patch: Partial<PortalAgentRow>): PortalSnapshot {
  const agents = s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a));
  return {
    ...s,
    agents,
    today: {
      ...s.today,
      agents_working: agents.filter((a) => a.status === "working").length,
      agents_waiting_on_you: agents.filter((a) => a.status === "waiting_on_you").length,
      agents_paused: agents.filter((a) => a.status === "paused").length,
    },
  };
}

const iso = (now: number) => new Date(now).toISOString();
const SIM_RUN = "80000000-0000-4000-8000-000000000008";

function addCredit(s: PortalSnapshot, row: Omit<CreditLite, "id">): CreditLite[] {
  return [{ id: Math.max(0, ...s.creditEvents.map((c) => c.id)) + 1, ...row }, ...s.creditEvents];
}

export const SCENES: Scene[] = [
  {
    label: "Bilal starts T-10",
    run: (s, now) => {
      const tasks = s.tasks.map((t) => (t.number === 10 ? { ...t, status: "in_progress" as const } : t));
      const task = tasks.find((t) => t.number === 10)!;
      const runs = [
        {
          id: SIM_RUN, agent_id: AGENT_ID.bilal, task_id: task.id, trigger: "delegation" as const, trigger_ref: taskUuid(1),
          status: "running" as const, summary: null, error: null, model: "gemini-3.8-flash",
          input_tokens: 2100, output_tokens: 200, tool_call_count: 2, credits_used: 0, started_at: iso(now), finished_at: null,
        },
        ...s.runs.filter((r) => r.id !== SIM_RUN),
      ];
      return patchAgent({ ...s, tasks, runs }, AGENT_ID.bilal, {
        status: "working",
        current_task_id: task.id,
        current_task_title: task.title,
        current_task_status: "in_progress",
        last_active_at: iso(now),
      });
    },
  },
  {
    label: "Bilal reports up and finishes",
    run: (s, now) => {
      const bilal = s.agents.find((a) => a.id === AGENT_ID.bilal)!;
      const next = patchAgent(
        {
          ...s,
          tasks: s.tasks.map((t) => (t.number === 10 ? { ...t, status: "done" as const } : t)),
          runs: s.runs.map((r) =>
            r.id === SIM_RUN
              ? { ...r, status: "succeeded" as const, summary: "Searched UK fintech filters, saved 10 CFOs to graph8 list", input_tokens: 9800, output_tokens: 2100, tool_call_count: 8, credits_used: 12, finished_at: iso(now) }
              : r,
          ),
          creditEvents: addCredit(s, {
            agent_id: AGENT_ID.bilal, task_id: taskUuid(10), run_id: SIM_RUN, lead_id: null, source: "llm", action: "llm_run",
            credits: 12, note: "gemini-3.8-flash", created_at: iso(now),
          }),
          reports: [
            makeReport(`sim-${now}`, AGENT_ID.bilal, AGENT_ID.ayesha, 10, "handoff", "Found 10 UK fintech CFOs",
              "4 hiring finance roles, 2 raised recently.", now),
            ...s.reports,
          ],
        },
        AGENT_ID.bilal,
        {
          status: "idle",
          current_task_id: null,
          current_task_title: null,
          current_task_status: null,
          tasks_done: bilal.tasks_done + 1,
          tasks_open: Math.max(0, bilal.tasks_open - 1),
          spent_today_credits: bilal.spent_today_credits + 12,
          last_active_at: iso(now),
        },
      );
      return {
        ...next,
        today: {
          ...next.today,
          leads_found_today: next.today.leads_found_today + 10,
          credits_spent_today: next.today.credits_spent_today + 12,
          tasks_done_today: next.today.tasks_done_today + 1,
        },
      };
    },
  },
  {
    label: "You approve in Slack",
    run: (s, now) => {
      const next = patchAgent(
        {
          ...s,
          needsYou: [],
          approvals: s.approvals.map((a) => (a.status === "pending" ? { ...a, status: "approved" as const, decided_at: iso(now) } : a)),
          tasks: s.tasks.map((t) =>
            t.id === taskUuid(7) ? { ...t, status: "in_progress" as const, blocked_on: null, blocked_reason: null } : t,
          ),
          reports: [
            makeReport(`sim-${now}`, AGENT_ID.ayesha, null, 7, "update", "LinkedIn connected — steps 2, 3, 6 sending",
              "Thanks. LinkedIn touches are no longer queued; the sequence continues on all three channels.", now),
            ...s.reports,
          ],
        },
        AGENT_ID.ayesha,
        { status: "working", current_task_status: "in_progress", last_active_at: iso(now) },
      );
      return { ...next, today: { ...next.today, approvals_pending: 0 } };
    },
  },
  {
    label: "Meeting booked for Sara",
    run: (s, now) => {
      const SARA = "b0000000-0000-4000-8000-000000000001";
      const leads = s.leads.map((l) =>
        l.id === SARA
          ? { ...l, stage: "meeting" as const, meeting_at: iso(now + 2 * 86_400_000), g8_meeting_id: "mt_demo_001", last_activity_at: iso(now) }
          : l,
      );
      const next = patchAgent(
        {
          ...s,
          leads,
          pipeline: pipelineFrom(leads),
          leadEvents: [
            ...s.leadEvents,
            {
              id: Math.max(0, ...s.leadEvents.map((e) => e.id)) + 1,
              lead_id: SARA,
              agent_id: AGENT_ID.zara,
              task_id: taskUuid(6),
              type: "meeting_booked" as const,
              channel: "system" as const,
              direction: "internal" as const,
              summary: "Discovery call booked for Tue 15:00",
              data: { g8_meeting_id: "mt_demo_001" },
              occurred_at: iso(now),
            },
          ],
          reports: [
            makeReport(`sim-${now}`, AGENT_ID.ayesha, null, 6, "win", "Meeting booked: Sara Malik (Northwind) — Tue 15:00",
              "Discovery call on the calendar in graph8. Zara stopped all channels for Northwind.", now),
            ...s.reports,
          ],
        },
        AGENT_ID.zara,
        { last_active_at: iso(now) },
      );
      return { ...next, today: { ...next.today, meetings_booked_today: next.today.meetings_booked_today + 1 } };
    },
  },
  {
    label: "Hira goes over budget",
    run: (s, now) => {
      const hira = s.agents.find((a) => a.id === AGENT_ID.hira)!;
      const withCredit = {
        ...s,
        creditEvents: addCredit(s, {
          agent_id: AGENT_ID.hira, task_id: null, run_id: null, lead_id: null, source: "graph8", action: "enrich_company",
          credits: 100000, note: "bulk company enrichment", created_at: iso(now),
        }),
      };
      const next = patchAgent(withCredit, AGENT_ID.hira, {
        status: "paused",
        pause_reason: "budget",
        spent_today_credits: hira.spent_today_credits + 100000,
        last_active_at: iso(now),
      });
      return { ...next, today: { ...next.today, credits_spent_today: next.today.credits_spent_today + 100000 } };
    },
  },
  { label: "Reset to the seeded day", run: (_s, now) => seedSnapshot(now) },
];
