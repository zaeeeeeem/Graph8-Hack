"use client";

import { CalendarCheck, CircleDollarSign, MessageSquareReply, Minus, TrendingUp, UserSearch } from "lucide-react";
import type { ComponentType } from "react";
import { int, money } from "@/lib/portal/format";
import type { ActivityPoint, PortalSnapshot } from "@/lib/portal/mock";
import { activitySeries, lastHourDelta } from "@/lib/portal/selectors";
import { ChangeFlash, CountUp, InlineError, Skeleton } from "../ui/primitives";
import { SURFACE } from "../ui/surface";
import { Sparkline } from "./charts";

type Tile = {
  key: Exclude<keyof ActivityPoint, "t">;
  label: (d: PortalSnapshot) => string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  value: (d: PortalSnapshot) => number;
  format: (n: number) => string;
  hint: (d: PortalSnapshot) => string;
};

const TILES: Tile[] = [
  {
    key: "found",
    label: () => "Leads found",
    icon: UserSearch,
    value: (d) => d.today.leads_found_today,
    format: int,
    hint: (d) => `${d.today.leads_contacted_today} contacted today`,
  },
  { key: "replies", label: () => "Replies", icon: MessageSquareReply, value: (d) => d.today.replies_today, format: int, hint: () => "Replies from leads today" },
  {
    key: "meetings",
    label: () => "Meetings booked",
    icon: CalendarCheck,
    value: (d) => d.today.meetings_booked_today,
    format: int,
    hint: () => "Meetings booked today",
  },
  {
    key: "deals_value",
    label: (d) => `Deals open · ${d.today.deals_open}`,
    icon: CircleDollarSign,
    value: (d) => Number(d.today.deals_value),
    format: money,
    hint: (d) => `${d.today.deals_open} open ${d.today.deals_open === 1 ? "deal" : "deals"} in graph8`,
  },
];

/** "What did it achieve?" — four compact stat tiles: value + trend side by side, change underneath. */
export function StatTiles({ data, load }: { data: PortalSnapshot | null; load: "loading" | "ready" | "error" }) {
  if (load === "error") {
    return (
      <div className={`flex items-center justify-center rounded-[22px] p-5 ${SURFACE}`}>
        <InlineError what="today's numbers" />
      </div>
    );
  }
  const series = data ? activitySeries(data) : [];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {TILES.map((t) => (data ? <StatTile key={t.key} tile={t} data={data} series={series} /> : <TileSkeleton key={t.key} />))}
    </div>
  );
}

function StatTile({ tile, data, series }: { tile: Tile; data: PortalSnapshot; series: ActivityPoint[] }) {
  const Icon = tile.icon;
  const value = tile.value(data);
  const delta = lastHourDelta(series, tile.key);
  return (
    <article className={`relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] px-4 py-3.5 ${SURFACE}`} title={tile.hint(data)}>
      <ChangeFlash signal={`${tile.key}-${value}`} className="bg-white/[0.05]" />
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] text-white/55">{tile.label(data)}</p>
          <p className="text-[24px] leading-tight font-semibold tracking-tight text-white">
            <CountUp value={value} format={tile.format} />
          </p>
        </div>
        <div className="w-[42%] max-w-[170px] min-w-[96px]">
          <Sparkline data={series} dataKey={tile.key} format={tile.format} height={44} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] whitespace-nowrap">
        <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 text-white/75">
          {delta > 0 ? <TrendingUp className="size-3 text-[#5fe0ad]" strokeWidth={2.2} /> : <Minus className="size-3 text-white/40" strokeWidth={2.2} />}
          {delta > 0 ? `+${tile.format(delta)}` : "No change"}
        </span>
        <span className="truncate text-white/35">in the last hour</span>
      </div>
    </article>
  );
}

function TileSkeleton() {
  return (
    <div className={`flex flex-col gap-2.5 rounded-[20px] px-4 py-3.5 ${SURFACE}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      </div>
      <Skeleton className="h-5 w-32 rounded-full" />
    </div>
  );
}
