"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Activity, ArrowLeft, Coins, ListChecks, UserX, Wallet } from "lucide-react";
import { int, taskId } from "@/lib/portal/format";
import { slackChannel, slackThread } from "@/lib/portal/links";
import type { CreditLite, PortalSnapshot, RunLite, TaskLite } from "@/lib/portal/mock";
import {
  agentBySlug,
  agentHref,
  agentsById,
  creditsForAgent,
  needsYouItems,
  pauseBannerText,
  runDelegator,
  runsForAgent,
  spendBySource,
  tasksById,
  tasksForAgent,
} from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import { openTask } from "@/lib/portal/taskNav";
import type { PortalAgentRow } from "@/lib/portal/types";
import {
  AGENT_STATUS,
  CREDIT_SOURCE,
  RUN_STATUS,
  RUN_TRIGGER,
  TASK_STATUS,
  UI_ICON,
  agentStatusLabel,
  creditActionLabel,
  taskStatusLabel,
} from "@/lib/portal/vocab";
import { AgentAvatar, AvatarStatus, BudgetBar, CountUp, EmptyLine, InlineError, LinkOut, Mono, Skeleton, StatusPill, TimeAgo, ToneIcon } from "../ui/primitives";
import { INNER_BOX, SectionCard } from "../ui/SectionCard";
import { CARD_GLOW, LaserBorder, PILL, PILL_SM_BUTTON, PillLink, SURFACE, TAG } from "../ui/surface";

const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const clock = (iso: string) => CLOCK.format(new Date(iso));

function duration(run: RunLite): string {
  if (!run.finished_at) return "running";
  const min = Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 60_000);
  return min < 1 ? "under 1 min" : `${min} min`;
}

/**
 * S7 Agent detail (`/office/agents/[id]`) — "How is this agent spending and waking?"
 * Hero card, budget + credit ledger (credit_events), runs = heartbeats (agent_runs), tasks.
 */
export function AgentScreen({ slug }: { slug: string }) {
  const { load, data, live } = usePortal();
  const agent = data ? agentBySlug(data, slug) : undefined;

  return (
    <div className="flex flex-col gap-4 pb-1">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <Link href="/office" className={`${PILL} transition-colors hover:bg-white/[0.08]`}>
          <ArrowLeft className="size-4 text-white/60" />
          Office
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {data && <AgentSwitcher agents={data.agents} activeId={agent?.id} />}
          <span className={PILL}>
            <ToneIcon icon={UI_ICON.live} tone={live === "joined" ? "success" : "muted"} />
            {live === "joined" ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </header>

      {load === "error" ? (
        <div className={`rounded-[22px] p-5 ${SURFACE}`}>
          <InlineError what="this agent" />
        </div>
      ) : !data ? (
        <AgentSkeleton />
      ) : !agent ? (
        <div className={`rounded-[22px] ${SURFACE}`}>
          <EmptyLine icon={<UserX className="size-4.5" />}>There is no agent called “{decodeURIComponent(slug)}” on this team.</EmptyLine>
        </div>
      ) : (
        <AgentBody data={data} agent={agent} />
      )}
    </div>
  );
}

/** The five agents as small pills: hop between agents without going back to the Office. */
function AgentSwitcher({ agents, activeId }: { agents: PortalAgentRow[]; activeId?: string }) {
  return (
    <nav aria-label="Agents" className="flex flex-wrap items-center gap-1.5">
      {[...agents]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => {
          const active = a.id === activeId;
          return (
            <Link
              key={a.id}
              href={agentHref(a)}
              aria-current={active ? "page" : undefined}
              title={`${a.name} · ${a.title} — ${agentStatusLabel(a.status, a.pause_reason)}`}
              className={`${PILL} pl-1 transition-colors ${active ? "border-white/25 bg-white/[0.1] text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"}`}
            >
              <AvatarStatus
                emoji={a.emoji}
                color="rgba(255,255,255,0.15)"
                src={a.avatar_url}
                size={28}
                tone={AGENT_STATUS[a.status].tone}
                surface="#121317"
                className={a.status === "paused" ? "grayscale" : ""}
              />
              {a.name}
            </Link>
          );
        })}
    </nav>
  );
}

function AgentBody({ data, agent: a }: { data: PortalSnapshot; agent: PortalAgentRow }) {
  const runs = runsForAgent(data, a.id);
  const ledger = creditsForAgent(data, a.id);
  const tasks = tasksForAgent(data, a.id);
  return (
    <>
      <Hero data={data} agent={a} runCount={runs.length} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col gap-4">
          <Budget agent={a} ledger={ledger} />
          <Ledger data={data} rows={ledger} runs={runs} />
        </div>
        <div className="flex flex-col gap-4">
          <Runs data={data} runs={runs} />
          <Tasks open={tasks.open} done={tasks.done} />
        </div>
      </div>
    </>
  );
}

// --- hero ------------------------------------------------------------------------

function Hero({ data, agent: a, runCount }: { data: PortalSnapshot; agent: PortalAgentRow; runCount: number }) {
  const st = AGENT_STATUS[a.status];
  const manager = a.reports_to ? agentsById(data).get(a.reports_to) : undefined;
  const task = a.current_task_id ? tasksById(data).get(a.current_task_id) : undefined;
  const ask = needsYouItems(data).find((i) => i.agent_id === a.id) ?? needsYouItems(data)[0];
  const decideHref = a.status === "waiting_on_you" && ask ? slackThread(ask.slack_channel, ask.slack_ts) : null;
  const paused = a.status === "paused" || a.status === "error";

  const stats: [string, number][] = [
    ["Tasks done", a.tasks_done],
    ["Open", a.tasks_open],
    ["Runs today", runCount],
    ["Credits today", a.spent_today_credits],
  ];

  const body = (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <AvatarStatus
            emoji={a.emoji}
            color="rgba(255,255,255,0.15)"
            src={a.avatar_url}
            size={72}
            tone={st.tone}
            surface="#121317"
            className={a.status === "paused" ? "grayscale" : ""}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] leading-tight font-medium text-white">{a.name}</h1>
              <span className="text-[15px] text-white/45">{a.title}</span>
              <StatusPill tone={st.tone} icon={st.icon} label={agentStatusLabel(a.status, a.pause_reason)} size="sm" />
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">{a.job}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/40">
              {manager ? (
                <Link href={agentHref(manager)} className="flex items-center gap-1.5 hover:text-white/80">
                  <AgentAvatar emoji={manager.emoji} color="rgba(255,255,255,0.15)" src={manager.avatar_url} size={16} />
                  reports to <span className="text-white/70">{manager.name}</span>
                </Link>
              ) : (
                <span>
                  reports to <span className="text-white/70">you</span>
                </span>
              )}
              <span>·</span>
              <span>
                last active <TimeAgo iso={a.last_active_at} />
              </span>
            </p>
          </div>
        </div>

        <dl className={`grid shrink-0 grid-cols-4 divide-x divide-white/[0.06] lg:w-[440px] ${INNER_BOX}`}>
          {stats.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col items-center gap-1 px-2 py-3 text-center">
              <dt className="w-full truncate text-[11px] text-white/45">{k}</dt>
              <dd className="font-mono text-[20px] leading-none text-white">
                <CountUp value={v} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {paused && (
        <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-dashed border-st-danger/40 bg-st-danger/[0.06] px-4 py-3">
          <ToneIcon icon={AGENT_STATUS.paused.icon} tone="danger" className="size-4" />
          <p className="min-w-0 flex-1 text-[13px] text-white/75">
            <span className="text-[#ff7a70]">Paused · {pauseBannerText(a).reason}.</span> {pauseBannerText(a).rest}
          </p>
          <PillLink href={slackChannel(data.workspace.slack_channel_hq)}>Decide in Slack</PillLink>
        </div>
      )}

      {task && (
        <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${INNER_BOX}`}>
          <span className="text-[11px] font-medium tracking-[0.08em] text-white/35 uppercase">Now</span>
          <StatusPill tone={TASK_STATUS[task.status].tone} icon={TASK_STATUS[task.status].icon} label={taskStatusLabel(task.status, task.blocked_on)} size="sm" />
          <span className={`${TAG} font-mono`}>{taskId(task.number)}</span>
          <p className="min-w-0 flex-1 truncate text-[14px] text-white/85">{task.title}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => openTask(task.number)} className={PILL_SM_BUTTON}>
              View task
            </button>
            {decideHref ? (
              <PillLink href={decideHref}>Decide in Slack</PillLink>
            ) : (
              <LinkOut href={slackThread(task.slack_channel, task.slack_thread_ts)} className="text-[12px]">
                Open in Slack
              </LinkOut>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return a.status === "working" || a.status === "waiting_on_you" ? (
    <LaserBorder radius={22} innerClassName={`bg-white/[0.03] ${CARD_GLOW} backdrop-blur-xl`}>
      {body}
    </LaserBorder>
  ) : (
    <section aria-label={a.name} className={`rounded-[22px] ${SURFACE}`}>
      {body}
    </section>
  );
}

// --- budget + ledger -------------------------------------------------------------

function Budget({ agent: a, ledger }: { agent: PortalAgentRow; ledger: CreditLite[] }) {
  const split = spendBySource(ledger);
  const pct = a.budget_daily_credits > 0 ? (a.spent_today_credits / a.budget_daily_credits) * 100 : 0;
  const remaining = Math.max(0, a.budget_daily_credits - a.spent_today_credits);
  const cells: [string, string][] = [
    [CREDIT_SOURCE.graph8.label, int(split.graph8)],
    [CREDIT_SOURCE.llm.label, int(split.llm)],
    ["Remaining", int(remaining)],
  ];
  return (
    <SectionCard icon={<Wallet className="size-4 text-white/55" strokeWidth={2} />} title="Budget today">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 px-1">
          <p className="text-white">
            <span className="text-[30px] leading-none font-semibold tracking-tight">
              <CountUp value={a.spent_today_credits} />
            </span>
            <span className="ml-1.5 text-[13px] text-white/40">/ {int(a.budget_daily_credits)} credits</span>
          </p>
          <span className="text-[12px] text-white/45">
            <Mono className="text-white/75">{pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%</Mono> used
          </span>
        </div>
        <div className="flex flex-col gap-1.5 px-1">
          <BudgetBar spent={a.spent_today_credits} budget={a.budget_daily_credits} warnPct={a.budget_warn_pct} showTick />
          <p className="flex justify-between text-[11px] text-white/35">
            <span>Resets at midnight</span>
            <span>Warns at {a.budget_warn_pct}%, pauses at 100%</span>
          </p>
        </div>
        <dl className={`grid grid-cols-3 divide-x divide-white/[0.06] ${INNER_BOX}`}>
          {cells.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col items-center gap-1 px-2 py-3 text-center">
              <dt className="w-full truncate text-[11px] text-white/45">{k}</dt>
              <dd className="font-mono text-[16px] leading-none text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </SectionCard>
  );
}

function Ledger({ data, rows, runs }: { data: PortalSnapshot; rows: CreditLite[]; runs: RunLite[] }) {
  const byTask = tasksById(data);
  const runById = new Map(runs.map((r) => [r.id, r]));
  return (
    <SectionCard icon={<Coins className="size-4 text-white/55" strokeWidth={2} />} title="Credit ledger" count={rows.length}>
      {rows.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-white/40">No credits spent today.</p>
      ) : (
        <ul className={`divide-y divide-white/[0.05] ${INNER_BOX}`}>
          <AnimatePresence initial={false}>
            {rows.map((c) => {
              const src = CREDIT_SOURCE[c.source];
              const task = c.task_id ? byTask.get(c.task_id) : undefined;
              const run = c.run_id ? runById.get(c.run_id) : undefined;
              const tokens = c.source === "llm" && run ? run.input_tokens + run.output_tokens : null;
              return (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60" title={src.label}>
                    <src.icon className="size-3.5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-white/85">{creditActionLabel(c.action)}</p>
                    <p className="truncate text-[11px] text-white/40">
                      {src.label}
                      {tokens != null ? ` · ${int(tokens)} tokens` : c.note ? ` · ${c.note}` : ""}
                    </p>
                  </div>
                  {task && (
                    <button type="button" onClick={() => openTask(task.number)} className={`${TAG} font-mono hover:text-white`} title={task.title}>
                      {taskId(task.number)}
                    </button>
                  )}
                  <span className="w-11 shrink-0 text-right font-mono text-[11px] text-white/35">{clock(c.created_at)}</span>
                  <Mono className="w-14 shrink-0 text-right text-[13px] text-white">{c.credits < 0 ? `−${int(-c.credits)}` : int(c.credits)}</Mono>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </SectionCard>
  );
}

// --- runs + tasks ----------------------------------------------------------------

/** agent_runs — the heartbeat evidence: what woke the agent, what it did, what it cost. */
function Runs({ data, runs }: { data: PortalSnapshot; runs: RunLite[] }) {
  const byTask = tasksById(data);
  return (
    <SectionCard icon={<Activity className="size-4 text-white/55" strokeWidth={2} />} title="Runs" count={runs.length}>
      {runs.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-white/40">No runs yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {runs.map((r) => (
              <RunItem key={r.id} run={r} task={r.task_id ? byTask.get(r.task_id) : undefined} delegator={runDelegator(data, r)} />
            ))}
          </AnimatePresence>
        </ol>
      )}
    </SectionCard>
  );
}

function RunItem({ run: r, task, delegator }: { run: RunLite; task?: TaskLite; delegator?: PortalAgentRow }) {
  const st = RUN_STATUS[r.status];
  const trig = RUN_TRIGGER[r.trigger];
  const trigLabel = r.trigger === "delegation" && delegator ? `Assigned by ${delegator.name}` : trig.label;
  const running = r.status === "running";
  const tokens = r.input_tokens + r.output_tokens;

  const inner = (
    <div className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60">
          <trig.icon className="size-3.5" strokeWidth={2} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] text-white/85" title={r.trigger_ref ?? undefined}>
          {trigLabel}
        </p>
        <span className="shrink-0 font-mono text-[11px] text-white/35">{clock(r.started_at)}</span>
        <StatusPill tone={st.tone} icon={st.icon} label={st.label} size="sm" />
      </div>
      <p className={`text-[13px] leading-relaxed ${r.summary ? "text-white/65" : "text-white/40"}`}>
        {r.error ?? r.summary ?? (running ? "Working on it — the summary is written when the run finishes." : "No summary.")}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] pt-2.5 font-mono text-[11px] text-white/40">
        {task && (
          <button type="button" onClick={() => openTask(task.number)} className={`${TAG} hover:text-white`} title={task.title}>
            {taskId(task.number)}
          </button>
        )}
        <span>{running ? <>started <TimeAgo iso={r.started_at} /></> : duration(r)}</span>
        <span>
          <span className="text-white/75">{int(r.credits_used)}</span> cr
        </span>
        <span title={`${int(r.input_tokens)} in · ${int(r.output_tokens)} out`}>
          <span className="text-white/75">{int(tokens)}</span> tok
        </span>
        <span>
          <span className="text-white/75">{r.tool_call_count}</span> tools
        </span>
        {r.model && <span className="ml-auto text-white/30">{r.model}</span>}
      </div>
    </div>
  );

  return (
    <motion.li layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
      {running ? (
        <LaserBorder radius={18} innerClassName={`bg-white/[0.03] ${CARD_GLOW} backdrop-blur-xl`}>
          {inner}
        </LaserBorder>
      ) : (
        <div className={INNER_BOX}>{inner}</div>
      )}
    </motion.li>
  );
}

function Tasks({ open, done }: { open: TaskLite[]; done: TaskLite[] }) {
  return (
    <SectionCard icon={<ListChecks className="size-4 text-white/55" strokeWidth={2} />} title="Tasks" count={open.length + done.length}>
      <div className="flex flex-col gap-4">
        <TaskGroup title="Open" tasks={open} empty="Nothing open right now." />
        <TaskGroup title="Done" tasks={done} empty="Nothing finished yet." />
      </div>
    </SectionCard>
  );
}

function TaskGroup({ title, tasks, empty }: { title: string; tasks: TaskLite[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 px-1 text-[11px] font-medium tracking-[0.08em] text-white/35 uppercase">
        {title} · {tasks.length}
      </p>
      {tasks.length === 0 ? (
        <p className="px-1 text-[13px] text-white/40">{empty}</p>
      ) : (
        <ul className={`divide-y divide-white/[0.05] ${INNER_BOX}`}>
          {tasks.map((t) => {
            const st = TASK_STATUS[t.status];
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTask(t.number)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors first:rounded-t-[18px] last:rounded-b-[18px] hover:bg-white/[0.04]"
                >
                  <ToneIcon icon={st.icon} tone={st.tone} className="size-4" />
                  <span className="w-9 shrink-0 font-mono text-[12px] text-white/45">{taskId(t.number)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{t.title}</span>
                  <span className="hidden shrink-0 text-[11px] text-white/40 sm:inline">{taskStatusLabel(t.status, t.blocked_on)}</span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-white/35">
                    <TimeAgo iso={t.finished_at ?? t.created_at} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AgentSkeleton() {
  return (
    <>
      <div className={`flex items-center gap-4 rounded-[22px] p-5 ${SURFACE}`}>
        <Skeleton className="size-[72px] rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {[0, 1].map((i) => (
          <div key={i} className={`flex flex-col gap-3 rounded-[22px] p-5 ${SURFACE}`}>
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-12 w-full" />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
