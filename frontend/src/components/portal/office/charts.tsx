"use client";

import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { ActivityPoint } from "@/lib/portal/mock";

// One accent (brand blue) for the value, a lighter step of the same hue for the track;
// sparklines ride the de-emphasis ink with the current point in the accent.
const ACCENT = "#3aa0ff";
const TRACK = "rgba(58,160,255,0.14)";
const DEEMPH = "rgba(255,255,255,0.55)";

/** Half-circle meter (0–100). The number in the middle is the chart's headline. */
export function GaugeChart({ pct, children }: { pct: number; children?: React.ReactNode }) {
  const v = Math.max(0, Math.min(100, pct));
  const data = [
    { name: "done", value: v },
    { name: "left", value: 100 - v },
  ];
  return (
    <div className="relative h-[124px] w-[216px] shrink-0" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={88}
            outerRadius={102}
            cornerRadius={8}
            paddingAngle={v > 0 && v < 100 ? 2 : 0}
            stroke="none"
            isAnimationActive
            animationDuration={900}
          >
            <Cell fill={ACCENT} />
            <Cell fill={TRACK} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
    </div>
  );
}

type MetricKey = Exclude<keyof ActivityPoint, "t">;

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Sparkline with a crosshair + tooltip on hover (single series: the card title names it). */
export function Sparkline({
  data,
  dataKey,
  format,
  height = 56,
}: {
  data: ActivityPoint[];
  dataKey: MetricKey;
  format: (n: number) => string;
  height?: number;
}) {
  const lastIndex = data.length - 1;
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 4, left: 6 }}>
          <YAxis hide domain={[0, (max: number) => Math.max(1, max * 1.12)]} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.25)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => (
              <SparkTooltip active={active} point={payload?.[0]?.payload as ActivityPoint | undefined} format={format} dataKey={dataKey} />
            )}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={DEEMPH}
            strokeWidth={2}
            fill="rgba(255,255,255,0.05)"
            isAnimationActive
            animationDuration={700}
            activeDot={{ r: 4, fill: ACCENT, stroke: "#0b0b0d", strokeWidth: 2 }}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === lastIndex && p.cx != null && p.cy != null ? (
                <circle key="last" cx={p.cx} cy={p.cy} r={4} fill={ACCENT} stroke="#0b0b0d" strokeWidth={2} />
              ) : (
                <g key={`d${p.index}`} />
              )
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SparkTooltip({
  active,
  point,
  format,
  dataKey,
}: {
  active?: boolean;
  point?: ActivityPoint;
  format: (n: number) => string;
  dataKey: MetricKey;
}) {
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b0b0d]/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur">
      <p className="text-white/45">{TIME.format(new Date(point.t))}</p>
      <p className="font-medium text-white">{format(point[dataKey])}</p>
    </div>
  );
}
