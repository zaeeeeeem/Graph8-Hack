"use client";

import { int } from "@/lib/portal/format";
import type { PortalSnapshot } from "@/lib/portal/mock";
import { needsYouItems, tasksDoneShare } from "@/lib/portal/selectors";
import { CountUp, InlineError, Skeleton, StatusPill } from "../ui/primitives";
import { SURFACE } from "../ui/surface";
import { GaugeChart } from "./charts";
import { AGENT_STATUS, UI_ICON } from "@/lib/portal/vocab";

/** "Is my team working?" — today's task completion as a meter, the team's live counts beside it. */
export function TeamCard({ data, load }: { data: PortalSnapshot | null; load: "loading" | "ready" | "error" }) {
  return (
    <section aria-label="Team" className={`flex flex-col rounded-[22px] p-5 ${SURFACE}`}>
      <header className="flex items-center justify-between">
        <h2 className="text-[18px] font-medium text-white">Team</h2>
        {data && <TeamPill data={data} />}
      </header>

      {load === "error" ? (
        <div className="mt-4">
          <InlineError what="the team" />
        </div>
      ) : !data ? (
        <div className="mt-4 flex items-end gap-5">
          <Skeleton className="h-[124px] w-[216px] rounded-t-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-full" />
            ))}
          </div>
        </div>
      ) : (
        <Body data={data} />
      )}
    </section>
  );
}

function TeamPill({ data }: { data: PortalSnapshot }) {
  const t = data.today;
  if (needsYouItems(data).length > 0) return <StatusPill tone="attention" icon={UI_ICON.needsYou} label="Needs you" size="sm" />;
  if (t.agents_paused > 0) return <StatusPill tone="danger" icon={AGENT_STATUS.paused.icon} label="Agent paused" size="sm" />;
  if (t.agents_working > 0) return <StatusPill tone="active" icon={AGENT_STATUS.working.icon} label="Working" size="sm" />;
  return <StatusPill tone="neutral" icon={AGENT_STATUS.idle.icon} label="Idle" size="sm" />;
}

function Body({ data }: { data: PortalSnapshot }) {
  const t = data.today;
  const share = tasksDoneShare(data);
  const rows: { label: string; value: string; tone?: string }[] = [
    { label: "Agents working", value: String(t.agents_working) },
    { label: "Waiting on you", value: String(t.agents_waiting_on_you), tone: t.agents_waiting_on_you > 0 ? "text-[#ffa46b]" : undefined },
    { label: "Tasks open", value: String(t.tasks_open) },
    { label: "Credits today", value: int(t.credits_spent_today) },
    { label: "Paused", value: String(t.agents_paused), tone: t.agents_paused > 0 ? "text-[#ff7a70]" : undefined },
  ];
  return (
    <div className="mt-3 flex items-center gap-5">
      <GaugeChart pct={share.pct}>
        <p className="text-[40px] leading-none font-semibold tracking-tight text-white">
          <CountUp value={share.pct} />
          <span className="ml-0.5 text-[20px] text-white/50">%</span>
        </p>
        <p className="mt-1.5 text-[11px] whitespace-nowrap text-white/45">
          {share.done} of {share.total} tasks done today
        </p>
      </GaugeChart>
      <dl className="flex min-w-0 flex-1 flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex h-7 items-center justify-between gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 text-[12px]">
            <dt className="truncate text-white/55">{r.label}</dt>
            <dd className={`font-medium tabular-nums ${r.tone ?? "text-white"}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
