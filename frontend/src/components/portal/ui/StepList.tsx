"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleX } from "lucide-react";
import type { PortalActivityRow } from "@/lib/portal/types";
import { RUN_STEP_KIND } from "@/lib/portal/vocab";
import { TimeAgo } from "./primitives";

/** Step-by-step agent work from portal_activity (PII-free summaries), oldest first. */
export function StepList({ steps, showAgent = false }: { steps: PortalActivityRow[]; showAgent?: boolean }) {
  return (
    <ol className="relative flex flex-col">
      <span aria-hidden="true" className="absolute top-3 bottom-3 left-[13px] w-px bg-white/10" />
      <AnimatePresence initial={false}>
        {steps.map((st) => {
          const kind = RUN_STEP_KIND[st.kind] ?? RUN_STEP_KIND.note;
          return (
            <motion.li
              key={st.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative flex gap-3 py-1.5"
            >
              <span
                className="relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#141418] text-white/55"
                title={kind.label}
              >
                <kind.icon className="size-3.5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2 text-[12px]">
                  {st.ok ? (
                    <CircleCheck className="size-3.5 shrink-0 text-[#5fe0ad]" aria-label="ok" />
                  ) : (
                    <CircleX className="size-3.5 shrink-0 text-[#ff7a70]" aria-label="failed" />
                  )}
                  <span className="truncate font-mono text-white/70">{st.name}</span>
                  {showAgent && <span className="shrink-0 text-white/40">· {st.agent_name}</span>}
                  <span className="ml-auto shrink-0 text-white/35">
                    {st.duration_ms != null && <span className="mr-2 font-mono">{st.duration_ms < 1000 ? `${st.duration_ms} ms` : `${(st.duration_ms / 1000).toFixed(1)} s`}</span>}
                    <TimeAgo iso={st.created_at} />
                  </span>
                </div>
                {st.summary && <p className="mt-0.5 text-[13px] leading-snug text-white/60">{st.summary}</p>}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
