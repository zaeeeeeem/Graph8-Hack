"use client";

import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, FileText, Radio as RadioIcon, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { int, money, moneyShort, taskId } from "@/lib/portal/format";
import { slackThread } from "@/lib/portal/links";
import type { PortalSnapshot } from "@/lib/portal/snapshot";
import { agentsById, tasksById } from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import { openTask, setFilterParam } from "@/lib/portal/taskNav";
import type { PortalAgentRow, ReportKind, ReportRow, StandupData } from "@/lib/portal/types";
import { AGENT_STATUS, FOUNDER_LABEL, REPORT_KIND, UI_ICON, UNKNOWN_AGENT_LABEL } from "@/lib/portal/vocab";
import { AgentAvatar, AvatarStatus, EmptyLine, InlineError, LinkOut, Mono, Skeleton, StatusPill, TimeAgo, ToneIcon } from "../ui/primitives";
import { INNER_BOX, SectionCard } from "../ui/SectionCard";
import { PILL, PILL_BUTTON, PILL_SM_BUTTON, SURFACE, TAG } from "../ui/surface";

type FilterKey = "all" | "standup" | "win" | "handoff" | "update" | "question";

// 02-screens.md §6: All · Standups · Wins · Handoffs · Updates · Questions.
const FILTERS: { key: FilterKey; label: string; kinds: ReportKind[] | null }[] = [
  { key: "all", label: "All", kinds: null },
  { key: "standup", label: "Standups", kinds: ["standup"] },
  { key: "win", label: "Wins", kinds: ["win"] },
  { key: "handoff", label: "Handoffs", kinds: ["handoff"] },
  { key: "update", label: "Updates", kinds: ["update", "plan", "answer"] },
  { key: "question", label: "Questions", kinds: ["question", "alert"] },
];

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" });

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return DAY.format(d);
}

/**
 * S6 Reports — the org chart talking: everything agents post up the chain (also mirrored to Slack),
 * newest first, filterable by kind. Standups render their numbers; wins stand out.
 */
export function ReportsScreen() {
  const { load, data, live } = usePortal();
  const params = useSearchParams();
  const filter = (FILTERS.find((f) => f.key === params.get("kind"))?.key ?? "all") as FilterKey;

  return (
    <div className="flex flex-col gap-4 pb-1 xl:h-full xl:pb-0">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-[26px] leading-tight font-medium text-white">Reports</h1>
          <p className="text-[13px] text-white/45">
            {data ? `${data.reports.length} reports from the team · mirrored from Slack · updating live` : " "}
          </p>
        </div>
        <span className={PILL}>
          <ToneIcon icon={UI_ICON.live} tone={live === "joined" ? "success" : "muted"} />
          {live === "joined" ? "Live" : "Reconnecting…"}
        </span>
      </header>

      {load === "error" ? (
        <div className={`rounded-[22px] p-5 ${SURFACE}`}>
          <InlineError what="reports" />
        </div>
      ) : !data ? (
        <ReportsSkeleton />
      ) : (
        <>
          <FilterBar data={data} active={filter} />
          {/* Desktop: the grid fills the screen; the stream scrolls inside its card, the side column on its own. */}
          <div className="grid grid-cols-1 items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] xl:items-stretch">
            <Stream data={data} filter={filter} />
            <div className="portal-thin-scroll flex flex-col gap-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              <LatestStandup data={data} />
              <ByAgent data={data} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FilterBar({ data, active }: { data: PortalSnapshot; active: FilterKey }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2" role="tablist" aria-label="Filter reports">
      {FILTERS.map((f) => {
        const n = f.kinds ? data.reports.filter((r) => f.kinds!.includes(r.kind)).length : data.reports.length;
        const selected = active === f.key;
        const Icon = f.kinds ? REPORT_KIND[f.kinds[0]].icon : FileText;
        return (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setFilterParam("kind", f.key === "all" ? null : f.key)}
            className={`${PILL_BUTTON} ${selected ? "!border-white/25 !bg-white/[0.1] text-white" : ""}`}
          >
            <Icon className={`size-3.5 ${selected ? "text-white" : "text-white/50"}`} strokeWidth={2} />
            {f.label}
            <span className="font-mono text-[11px] text-white/40">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function Stream({ data, filter }: { data: PortalSnapshot; filter: FilterKey }) {
  const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? null;
  const rows = [...data.reports]
    .filter((r) => !kinds || kinds.includes(r.kind))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const byId = agentsById(data);
  const byTask = tasksById(data);

  // Group by day, keeping order.
  const groups: { label: string; items: ReportRow[] }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.created_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "All";

  return (
    <SectionCard
      icon={<FileText className="size-4 text-white/55" strokeWidth={2} />}
      title={filter === "all" ? "Report stream" : filterLabel}
      count={rows.length}
      action={
        filter !== "all" ? (
          <button type="button" onClick={() => setFilterParam("kind", null)} className="text-[12px] text-white/50 hover:text-white">
            Show all
          </button>
        ) : undefined
      }
      className="xl:h-full xl:min-h-0"
      bodyClassName="portal-thin-scroll p-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
    >
      {data.reports.length === 0 ? (
        <EmptyLine icon={<FileText className="size-4.5" />}>No reports yet. The first standup posts at {data.workspace.standup_hour}:00.</EmptyLine>
      ) : rows.length === 0 ? (
        <EmptyLine>No {filterLabel.toLowerCase()} yet.</EmptyLine>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2.5 px-1 text-[11px] font-medium tracking-[0.1em] text-white/35 uppercase">{g.label}</p>
              <ul className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {g.items.map((r) => (
                    <ReportItem key={r.id} report={r} byId={byId} taskNumber={r.task_id ? byTask.get(r.task_id)?.number : undefined} />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

const TINT: Partial<Record<ReportKind, string>> = {
  win: "!border-st-success/25 !bg-st-success/[0.05]",
  question: "!border-st-attention/25 !bg-st-attention/[0.04]",
  alert: "!border-st-attention/25 !bg-st-attention/[0.04]",
};

function ReportItem({ report: r, byId, taskNumber }: { report: ReportRow; byId: Map<string, PortalAgentRow>; taskNumber?: number }) {
  const [open, setOpen] = useState(false);
  const from = byId.get(r.from_agent_id);
  const to = r.to_agent_id ? byId.get(r.to_agent_id)?.name ?? UNKNOWN_AGENT_LABEL : FOUNDER_LABEL;
  const kind = REPORT_KIND[r.kind];
  const standup = r.kind === "standup" ? (r.data as unknown as Partial<StandupData>) : null;
  const long = (r.body?.length ?? 0) > 160;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className={`flex flex-col gap-2.5 p-4 ${INNER_BOX} ${TINT[r.kind] ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={kind.tone} icon={kind.icon} label={kind.label} size="sm" />
        <span className={`${TAG} gap-1.5 pl-1`}>
          {from && <AgentAvatar emoji={from.emoji} color="rgba(255,255,255,0.15)" src={from.avatar_url} size={18} />}
          <span className="text-white/85">{from?.name ?? UNKNOWN_AGENT_LABEL}</span>
          <span className="text-white/30">→</span>
          <span className="text-white/85">{to}</span>
        </span>
        <span className="ml-auto text-[11px] text-white/35">
          <TimeAgo iso={r.created_at} />
        </span>
      </div>

      <h3 className="text-[15px] leading-snug font-medium text-white">{r.title}</h3>

      {r.body && (
        <p className={`text-[13px] leading-relaxed text-white/55 ${open || !long ? "" : "line-clamp-2"}`}>{r.body}</p>
      )}

      {standup && (standup.pipeline || standup.credits) && <StandupTables data={standup} byName={byId} />}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {long && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={PILL_SM_BUTTON} aria-expanded={open}>
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Less" : "More"}
          </button>
        )}
        {taskNumber && (
          <button type="button" onClick={() => openTask(taskNumber)} className={PILL_SM_BUTTON}>
            View {taskId(taskNumber)}
          </button>
        )}
        <LinkOut href={slackThread(r.slack_channel, r.slack_thread_ts ?? r.slack_ts)} className="ml-auto text-[12px]">
          Open in Slack
        </LinkOut>
      </div>
    </motion.li>
  );
}

/** StandupData rendered as two horizontal strips: pipeline numbers and credits per agent, one cell each. */
function StandupTables({ data, byName }: { data: Partial<StandupData>; byName: Map<string, PortalAgentRow> }) {
  const agentByName = new Map([...byName.values()].map((a) => [a.name, a]));
  const p = data.pipeline;
  const pipelineCells: { k: string; v: string; sub?: string }[] = p
    ? [
        { k: "Prospects", v: int(p.prospects) },
        { k: "Contacted", v: int(p.contacted) },
        { k: "Replied", v: int(p.replied) },
        { k: "Meetings", v: int(p.meetings) },
        { k: "Deals", v: int(p.deals), sub: moneyShort(p.deal_value) },
      ]
    : [];
  const credits = Object.entries(data.credits ?? {});
  return (
    <div className="flex flex-col gap-3">
      {pipelineCells.length > 0 && (
        <StandupStrip title="Pipeline" count={pipelineCells.length}>
          {pipelineCells.map((c) => (
            <div key={c.k} className="flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-center" title={c.k === "Deals" && p ? `${int(p.deals)} · ${money(p.deal_value)}` : undefined}>
              <dt className="w-full truncate text-[11px] text-white/45">{c.k}</dt>
              <dd className="font-mono text-[15px] leading-none text-white">{c.v}</dd>
              {c.sub && <dd className="font-mono text-[10px] leading-none text-white/45">{c.sub}</dd>}
            </div>
          ))}
        </StandupStrip>
      )}
      {credits.length > 0 && (
        <StandupStrip title="Credits by agent" count={credits.length}>
          {credits.map(([name, n]) => {
            const a = agentByName.get(name);
            return (
              <div key={name} className="flex min-w-0 flex-col items-center gap-1.5 px-1 py-2.5 text-center">
                <dt className="flex w-full min-w-0 flex-col items-center gap-1 text-[11px] text-white/45">
                  {a && <AgentAvatar emoji={a.emoji} color="rgba(255,255,255,0.15)" src={a.avatar_url} size={24} />}
                  <span className="w-full truncate">{name}</span>
                </dt>
                <dd className="font-mono text-[15px] leading-none text-white">{int(n)}</dd>
              </div>
            );
          })}
        </StandupStrip>
      )}
    </div>
  );
}

function StandupStrip({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-white/35 uppercase">{title}</p>
      <dl className="grid divide-x divide-white/[0.06]" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {children}
      </dl>
    </div>
  );
}

function LatestStandup({ data }: { data: PortalSnapshot }) {
  const latest = [...data.reports].filter((r) => r.kind === "standup").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const byId = agentsById(data);
  return (
    <SectionCard icon={<RadioIcon className="size-4 text-white/55" strokeWidth={2} />} title="Latest standup">
      {!latest ? (
        <p className="px-1 py-2 text-[13px] text-white/40">The first standup posts at {data.workspace.standup_hour}:00.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[14px] text-white">{latest.title}</p>
            <span className="text-[11px] text-white/35">
              <TimeAgo iso={latest.created_at} />
            </span>
          </div>
          <StandupTables data={latest.data as unknown as Partial<StandupData>} byName={byId} />
        </div>
      )}
    </SectionCard>
  );
}

/** How much each agent has reported — the chain of command, at a glance. */
function ByAgent({ data }: { data: PortalSnapshot }) {
  const agents = [...data.agents].sort((a, b) => a.sort_order - b.sort_order);
  const counts = new Map<string, number>();
  for (const r of data.reports) counts.set(r.from_agent_id, (counts.get(r.from_agent_id) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  return (
    <SectionCard icon={<Users className="size-4 text-white/55" strokeWidth={2} />} title="Reports by agent">
      <ul className="flex flex-col gap-2.5">
        {agents.map((a) => {
          const n = counts.get(a.id) ?? 0;
          return (
            <li key={a.id} className="flex items-center gap-3">
              <AvatarStatus emoji={a.emoji} color="rgba(255,255,255,0.15)" src={a.avatar_url} size={30} tone={AGENT_STATUS[a.status].tone} surface="#111216" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-white/85">
                    {a.name} <span className="text-white/35">· {a.title}</span>
                  </span>
                  <Mono className="text-white/70">{n}</Mono>
                </div>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.span
                    className="block h-full rounded-full bg-white/45"
                    initial={false}
                    animate={{ width: `${(n / max) * 100}%` }}
                    transition={{ type: "spring", stiffness: 140, damping: 24 }}
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function ReportsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
      <div className={`flex flex-col gap-3 rounded-[22px] p-5 ${SURFACE}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className={`flex flex-col gap-3 rounded-[22px] p-5 ${SURFACE}`}>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
