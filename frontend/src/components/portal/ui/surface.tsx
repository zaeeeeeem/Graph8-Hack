"use client";

import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Brand corner glow for every card, kept very faint: orange rising from the bottom-left, blue from
 * the top-right (same pairing as the page background and the Fusion references).
 */
export const CARD_GLOW =
  "bg-[radial-gradient(100%_90%_at_0%_100%,rgba(218,78,36,0.17),transparent_62%),radial-gradient(100%_90%_at_100%_0%,rgba(31,119,246,0.17),transparent_62%)]";

/** Glossy surface: faint fill + corner glow, hairline border, 1px top highlight. */
export const SURFACE = `border border-white/[0.08] bg-white/[0.025] ${CARD_GLOW} backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_48px_-32px_rgba(0,0,0,0.9)]`;

// Pill sizes are separate constants — never add an h-* on top of one (the base height would win).
const PILL_BASE =
  "inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] text-white/75 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] whitespace-nowrap";
const PRESSABLE = "cursor-pointer transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]";

/** Toolbar / header controls (36px). */
export const PILL = `${PILL_BASE} h-9 px-3.5 text-[13px]`;
export const PILL_BUTTON = `${PILL} ${PRESSABLE}`;

/** Square icon-only pill, same height as PILL. */
export const PILL_ICON_BUTTON = `${PILL_BASE} ${PRESSABLE} size-9 justify-center`;

/** Inline actions inside cards (28px) — same height as PillLink. */
export const PILL_SM = `${PILL_BASE} h-7 gap-1.5 px-3 text-[12px]`;
export const PILL_SM_BUTTON = `${PILL_SM} ${PRESSABLE}`;

/** Tags beside a status pill (24px) — same height as StatusPill size="sm". */
export const TAG = `${PILL_BASE} h-6 gap-1.5 px-2.5 text-[11px]`;

export function Pill({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={`${PILL} ${className}`} title={title}>
      {children}
    </span>
  );
}

/** Outbound link as a small solid pill (the "Decide in Slack" / "Open in Slack" actions). */
export function PillLink({ href, children, className = "" }: { href: string | null; children: ReactNode; className?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`nodrag nopan inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-white px-3 text-[12px] font-medium text-black transition-opacity hover:opacity-85 ${className}`}
    >
      {children}
      <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
    </a>
  );
}

/** The landing page's moving border: a single orange streak orbiting a hairline frame. */
export const LASER_CONIC = "conic-gradient(from 0deg at 50% 50%, #0000 320.4deg, #da4e24 334.8deg, #0000 349.2deg)";

// Keeps only the 1px padding ring of an element visible, so the content inside can be transparent.
const RING_MASK: React.CSSProperties = {
  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
};

/**
 * The orbiting laser is masked to the 1px outline, so the inside can be glass (translucent) —
 * nothing spins behind the content.
 */
export function LaserBorder({
  children,
  radius = 18,
  active = true,
  conic = LASER_CONIC,
  className = "",
  innerClassName = "",
}: {
  children: ReactNode;
  radius?: number;
  active?: boolean;
  conic?: string;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div className={`relative p-px ${className}`} style={{ borderRadius: radius }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden p-px" style={{ borderRadius: radius, ...RING_MASK }}>
        <span className="absolute inset-0 bg-white/12" />
        {active && (
          <span className="absolute top-1/2 left-1/2 aspect-square w-[160%] min-w-[260px] -translate-x-1/2 -translate-y-1/2">
            <span className="portal-spin block size-full" style={{ background: conic }} />
          </span>
        )}
      </span>
      <div className={`relative ${innerClassName}`} style={{ borderRadius: radius - 1 }}>
        {children}
      </div>
    </div>
  );
}
