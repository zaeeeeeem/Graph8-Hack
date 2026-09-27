"use client";

import { AnimatePresence, motion } from "motion/react";
import { MessagesSquare } from "lucide-react";
import { slackThread } from "@/lib/portal/links";
import { agentsById } from "@/lib/portal/selectors";
import type { PortalSnapshot } from "@/lib/portal/mock";
import { FOUNDER_LABEL, REPORT_KIND, UNKNOWN_AGENT_LABEL } from "@/lib/portal/vocab";
import { AgentAvatar, EmptyLine, InlineError, LinkOut, Skeleton, TONE, TimeAgo } from "../ui/primitives";

const ROW_TINT = {
  win: "bg-st-success/6 border-st-success/20",
  question: "bg-st-attention/5 border-st-attention/20",
  alert: "bg-st-attention/5 border-st-attention/20",
} as const;

/** Last 5 reports flowing up the chain — "the org chart talking". */
export function LatestFromTeam({ data, load }: { data: PortalSnapshot | null; load: "loading" | "ready" | "error" }) {
  return (
    <section aria-label="Latest from the team" className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-white/10 bg-panel">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4">
        <p className="text-[11px] font-medium tracking-[0.08em] text-white/35 uppercase">Latest from the team</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {load === "error" && (
          <div className="p-2">
            <InlineError what="reports" />
          </div>
        )}
        {(load === "loading" || (load === "ready" && !data)) &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 px-2.5 py-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          ))}
        {load === "ready" && data && data.reports.length === 0 && (
          <EmptyLine icon={<MessagesSquare className="size-4.5" />}>
            No reports yet. Ayesha posts the plan here as soon as the team starts.
          </EmptyLine>
        )}
        {load === "ready" && data && data.reports.length > 0 && <ReportList data={data} />}
      </div>
    </section>
  );
}

function ReportList({ data }: { data: PortalSnapshot }) {
  const byId = agentsById(data);
  const latest = [...data.reports].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  return (
    <ul className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {latest.map((r) => {
          const from = byId.get(r.from_agent_id);
          const to = r.to_agent_id ? (byId.get(r.to_agent_id)?.name ?? UNKNOWN_AGENT_LABEL) : FOUNDER_LABEL;
          const kind = REPORT_KIND[r.kind];
          const tint = ROW_TINT[r.kind as keyof typeof ROW_TINT] ?? "border-transparent hover:bg-white/3";
          const href = slackThread(r.slack_channel, r.slack_thread_ts ?? r.slack_ts);
          return (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`group rounded-xl border px-3 py-2.5 transition-colors ${tint}`}
            >
              <div className="flex items-center gap-2 text-[11px] text-white/45">
                {from && <AgentAvatar emoji={from.emoji} color={from.color} size={18} />}
                <span className="min-w-0 truncate">
                  <strong className="font-medium text-white/80">{from?.name ?? UNKNOWN_AGENT_LABEL}</strong>
                  <span className="text-white/30"> → </span>
                  <strong className="font-medium text-white/80">{to}</strong>
                </span>
                <span className={`ml-auto shrink-0 ${TONE[kind.tone].text}`}>{kind.label}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-white/85">{r.title}</p>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/35">
                <TimeAgo iso={r.created_at} />
                <LinkOut href={href} className="text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                  Open in Slack
                </LinkOut>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
