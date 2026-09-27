"use client";

import Image from "next/image";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowUpRight, CircleAlert, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { budgetLevel, budgetPct, int, timeAgo } from "@/lib/portal/format";
import { useNow } from "@/lib/portal/hooks";
import { usePortal } from "@/lib/portal/store";
import type { Tone } from "@/lib/portal/vocab";

// --- tone → classes (the six semantic tokens) ----------------------------------

export const TONE: Record<Tone, { pill: string; dot: string; text: string; ring: string }> = {
  neutral: { pill: "bg-white/6 text-white/70 ring-white/10", dot: "bg-white/45", text: "text-white/70", ring: "ring-white/15" },
  active: { pill: "bg-st-active/12 text-[#5cc2ff] ring-st-active/30", dot: "bg-st-active", text: "text-[#5cc2ff]", ring: "ring-st-active/50" },
  attention: { pill: "bg-st-attention/12 text-[#ffa46b] ring-st-attention/35", dot: "bg-st-attention", text: "text-[#ffa46b]", ring: "ring-st-attention/55" },
  success: { pill: "bg-st-success/12 text-[#5fe0ad] ring-st-success/30", dot: "bg-st-success", text: "text-[#5fe0ad]", ring: "ring-st-success/45" },
  danger: { pill: "bg-st-danger/14 text-[#ff7a70] ring-st-danger/35", dot: "bg-st-danger", text: "text-[#ff7a70]", ring: "ring-st-danger/50" },
  muted: { pill: "bg-white/3 text-white/40 ring-white/6", dot: "bg-white/25", text: "text-white/40", ring: "ring-white/10" },
};

/** A status icon in its tone colour (replaces plain dots on pills, chips, legends and tiles). */
export function ToneIcon({ icon: Icon, tone, className = "size-3.5" }: { icon: LucideIcon; tone: Tone; className?: string }) {
  return <Icon className={`shrink-0 ${TONE[tone].text} ${className}`} strokeWidth={2} aria-hidden="true" />;
}

export function StatusPill({ tone, label, icon, size = "md" }: { tone: Tone; label: string; icon: LucideIcon; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset ${TONE[tone].pill} ${
        size === "sm" ? "h-6 px-2.5 text-[11px]" : "h-7 px-3 text-xs"
      }`}
    >
      <ToneIcon icon={icon} tone={tone} className={size === "sm" ? "size-3" : "size-3.5"} />
      {label}
    </span>
  );
}

/** Photo when `agents.avatar_url` is set, emoji otherwise. Ring in the agent's own colour. */
export function AgentAvatar({
  emoji,
  color,
  src = null,
  size = 40,
  className = "",
}: {
  emoji: string;
  color: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      <span
        aria-hidden="true"
        className={`relative inline-flex shrink-0 overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size, boxShadow: `0 0 0 1.5px ${color}, 0 0 18px -4px ${color}` }}
      >
        {/* Portraits are head-and-shoulders on a dark ground: zoom toward the face so it reads at 20–40px. */}
        <Image src={src} alt="" width={size * 3} height={size * 3} unoptimized={/^https?:/.test(src)} className="size-full scale-[1.45] object-cover object-[50%_38%]" draggable={false} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.48,
        background: `radial-gradient(circle at 30% 25%, ${color}40, ${color}14 70%)`,
        boxShadow: `inset 0 0 0 1.5px ${color}cc, 0 0 18px -6px ${color}`,
      }}
    >
      {emoji}
    </span>
  );
}

/**
 * Avatar + status dot, with the dot centred exactly on the circle's edge at 45° (bottom-right),
 * not on the bounding box corner. Optional spinning ring (`ringConic`) around the photo.
 */
export function AvatarStatus({
  emoji,
  color,
  src = null,
  size,
  tone,
  ringConic,
  surface = "#0c0c0f",
  className = "",
}: {
  emoji: string;
  color: string;
  src?: string | null;
  size: number;
  tone: Tone;
  ringConic?: string;
  surface?: string;
  className?: string;
}) {
  const dot = Math.max(8, Math.round(size * 0.22));
  const pos = size * (0.5 + 0.5 * Math.SQRT1_2) - dot / 2; // point on the circumference at 45°
  const inset = ringConic ? 3 : 0;
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {ringConic && (
        <>
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
            <span className="portal-spin block size-full" style={{ background: ringConic }} />
          </span>
          <span aria-hidden="true" className="absolute inset-[2px] rounded-full" style={{ background: surface }} />
        </>
      )}
      <span className="absolute" style={{ inset }}>
        <AgentAvatar emoji={emoji} color={color} src={src} size={size - inset * 2} />
      </span>
      <span
        aria-hidden="true"
        className={`absolute rounded-full ${TONE[tone].dot}`}
        style={{ width: dot, height: dot, left: pos, top: pos, boxShadow: `0 0 0 2px ${surface}` }}
      />
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>{children}</span>;
}

// --- budget --------------------------------------------------------------------

const BUDGET_FILL = { ok: "bg-white/55", warn: "bg-st-attention", over: "bg-st-danger" } as const;

export function BudgetBar({ spent, budget, warnPct = 80, showTick = false }: { spent: number; budget: number; warnPct?: number; showTick?: boolean }) {
  const level = budgetLevel(spent, budget, warnPct);
  const pct = budgetPct(spent, budget);
  return (
    <div className="relative h-1 w-full overflow-visible rounded-full bg-white/7" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Credits used today">
      <motion.div
        className={`h-full rounded-full ${BUDGET_FILL[level]}`}
        initial={false}
        animate={{ width: `${Math.max(pct, spent > 0 ? 1.5 : 0)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      />
      {showTick && <span className="absolute -top-0.5 h-2 w-px bg-white/30" style={{ left: `${warnPct}%` }} />}
    </div>
  );
}

// --- numbers + time ------------------------------------------------------------

/** Spring-counts to the new value on change (and from 0 on first paint — the "lights up" moment). */
export function CountUp({ value, format = int, className = "" }: { value: number; format?: (n: number) => string; className?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: [0.12, 0.23, 0.5, 1] });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={`tabular-nums ${className}`}>{text}</motion.span>;
}

export function TimeAgo({ iso, className = "" }: { iso: string | null; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={iso ?? undefined} className={className}>
      {now === 0 ? "" : timeAgo(iso, now)}
    </time>
  );
}

/** Remounts on `signal` change and fades out: the "something changed here" pulse. */
export function ChangeFlash({ signal, className = "" }: { signal: string; className?: string }) {
  return (
    <motion.span
      key={signal}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 rounded-[inherit] ${className}`}
      initial={{ opacity: 0.9 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.1, ease: "easeOut" }}
    />
  );
}

// --- links (the only actions) --------------------------------------------------

export function LinkOut({ href, children, className = "" }: { href: string | null; children: ReactNode; className?: string }) {
  if (!href) return null; // never render a disabled link
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`nodrag nopan inline-flex items-center gap-1 text-white/60 transition-colors hover:text-white ${className}`}
    >
      {children}
      <ArrowUpRight className="size-3.5" strokeWidth={2} />
    </a>
  );
}

// --- states ----------------------------------------------------------------------

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/6 ${className}`} />;
}

export function InlineError({ what }: { what: string }) {
  const { error, refresh } = usePortal();
  return (
    <div role="status" className="flex flex-wrap items-center gap-2.5 rounded-xl border border-st-danger/25 bg-st-danger/7 px-3.5 py-2.5 text-sm text-[#ff9a92]">
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        Could not load {what}.{error ? <span className="text-[#ff9a92]/70"> {error}</span> : null}
      </span>
      <button type="button" onClick={refresh} className="rounded-full border border-st-danger/30 px-3 py-1 text-xs text-[#ffb3ad] hover:bg-st-danger/10">
        Retry
      </button>
    </div>
  );
}

export function EmptyLine({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-sm text-white/45">
      {icon && <span className="flex size-10 items-center justify-center rounded-xl bg-white/4 text-white/40">{icon}</span>}
      <p className="max-w-[34ch] leading-relaxed">{children}</p>
    </div>
  );
}
