"use client";

import type { ReactNode } from "react";
import { SURFACE, TAG } from "./surface";

/** Every page section is this card: icon + title + count tag inside the header, body below. */
export function SectionCard({
  icon,
  title,
  count,
  label,
  action,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  label?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section aria-label={label ?? title} className={`flex flex-col rounded-[22px] ${SURFACE} ${className}`}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5">
        <h2 className="flex items-center gap-2 text-[15px] font-medium text-white">
          {icon}
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {action}
          {count != null && <span className={`${TAG} font-mono`}>{count}</span>}
        </div>
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Inner box for one item inside a SectionCard (decisions, reports, recent decisions…). */
export const INNER_BOX = "rounded-[18px] border border-white/[0.08] bg-white/[0.03]";
