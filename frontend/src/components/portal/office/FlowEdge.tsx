"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { AlertTriangle, OctagonPause, RefreshCw } from "lucide-react";

export type FlowTone = "idle" | "working" | "waiting" | "paused";

export type FlowEdgeData = {
  tone: FlowTone;
  label?: string;
  /** Laser runs child → parent (an agent asking the founder, a report going up). */
  reverse?: boolean;
  /** Bumps when a report travels along this edge: plays a one-off laser. */
  burst?: { key: string; reverse: boolean } | null;
};
export type FlowEdgeT = Edge<FlowEdgeData, "flow">;

// Plain lines like the reference: grey by default, amber when degraded, red when failing.
const BASE: Record<FlowTone, React.CSSProperties> = {
  idle: { stroke: "rgba(255,255,255,0.16)", strokeWidth: 1.5 },
  working: { stroke: "rgba(255,255,255,0.22)", strokeWidth: 1.5 },
  waiting: { stroke: "rgba(255,122,47,0.55)", strokeWidth: 1.5 },
  paused: { stroke: "rgba(240,68,56,0.55)", strokeWidth: 1.5 },
};

const LASER = "#da4e24"; // the landing page's border streak colour

const CHIP_ICON: Record<Exclude<FlowTone, "idle">, string> = {
  working: "text-[#8fd3ff]",
  waiting: "text-[#ffa46b]",
  paused: "text-[#ff8f86]",
};

/** Edge with the landing page's laser streak travelling along it while work is handed over. */
export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<FlowEdgeT>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.4 });
  const tone = data?.tone ?? "idle";

  return (
    <>
      <BaseEdge id={id} path={path} style={BASE[tone]} />
      {(tone === "working" || tone === "waiting") && <Laser path={path} reverse={!!data?.reverse} />}
      {data?.burst && <Laser key={data.burst.key} path={path} reverse={data.burst.reverse} once />}
      {data?.label && tone !== "idle" && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute flex h-7 max-w-[210px] items-center gap-1.5 rounded-full border border-white/10 bg-[#0c0c0f] px-2.5 text-[11px] font-medium whitespace-nowrap text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {tone === "working" && <RefreshCw className={`size-3 shrink-0 ${CHIP_ICON.working}`} />}
            {tone === "waiting" && <AlertTriangle className={`size-3 shrink-0 ${CHIP_ICON.waiting}`} />}
            {tone === "paused" && <OctagonPause className={`size-3 shrink-0 ${CHIP_ICON.paused}`} />}
            <span className="truncate">{data.label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Dash length (of pathLength 100) and opacity per layer: a bright core with a soft fade either side,
// matching the conic streak (#0000 → #da4e24 → #0000) that orbits a working card.
const LASER_LAYERS = [
  { l: 18, o: 0.25, w: 2 },
  { l: 11, o: 0.5, w: 2 },
  { l: 6, o: 0.85, w: 2 },
  { l: 2.5, o: 1, w: 2.5 },
];
const LASER_DUR = "2.6s";

/**
 * SVG-native animation (SMIL) so it runs without CSS custom properties in keyframes.
 * Each layer is centred on the same moving point p (from −8 to 108 along pathLength 100):
 * dashoffset = L/2 − p.
 */
function Laser({ path, reverse, once = false }: { path: string; reverse: boolean; once?: boolean }) {
  return (
    <g className="pointer-events-none">
      {LASER_LAYERS.map(({ l, o, w }) => {
        const start = 8 + l / 2;
        const end = -108 + l / 2;
        return (
          <path
            key={l}
            d={path}
            fill="none"
            stroke={LASER}
            strokeOpacity={o}
            strokeWidth={w}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${l} 300`}
            strokeDashoffset={reverse ? end : start}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={reverse ? end : start}
              to={reverse ? start : end}
              dur={LASER_DUR}
              repeatCount={once ? 2 : "indefinite"}
              fill="freeze"
            />
          </path>
        );
      })}
    </g>
  );
}
