"use client";

import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { int, taskId } from "@/lib/portal/format";
import { NODE_H, NODE_W, agentHref } from "@/lib/portal/selectors";
import type { TaskLite } from "@/lib/portal/mock";
import type { AgentStatus, PortalAgentRow } from "@/lib/portal/types";
import { AGENT_STATUS, TASK_KIND, agentStatusLabel, taskStatusLabel } from "@/lib/portal/vocab";
import { AvatarStatus, BudgetBar, ChangeFlash, Mono, TimeAgo, ToneIcon } from "../ui/primitives";
import { CARD_GLOW, LaserBorder, PILL_SM_BUTTON, PillLink } from "../ui/surface";
import { openTask } from "@/lib/portal/taskNav";

export type AgentNodeData = {
  agent: PortalAgentRow;
  task: TaskLite | null;
  decideHref: string | null; // Slack link of the first needs-you item
  expanded: boolean;
  focusKey: number; // bumps when the sidebar asks to focus this card
};
export type AgentNodeT = Node<AgentNodeData, "agent">;

/** Lines attach to the header row, so expanding a card does not move them. */
export const HANDLE_Y = { top: 34 };
export const HIDDEN_HANDLE = "!pointer-events-none !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent";

/** Card fill shared by every node on the board: near-black + faint corner glow, 1px top highlight. */
export const NODE_FILL = `bg-[#0c0c0f] ${CARD_GLOW} shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_18px_40px_-24px_rgba(0,0,0,0.95)]`;

export function AgentNode({ data }: NodeProps<AgentNodeT>) {
  const { agent: a, task, decideHref, expanded, focusKey } = data;
  const st = AGENT_STATUS[a.status];
  const signal = `${a.status}|${a.current_task_id}|${a.current_task_status}|${a.spent_today_credits}|${a.tasks_done}`;

  return (
    <div className="group relative" style={{ width: NODE_W, minHeight: NODE_H }}>
      <Handle type="target" position={Position.Left} className={HIDDEN_HANDLE} style={HANDLE_Y} isConnectable={false} />
      <CardShell status={a.status}>
        <ChangeFlash signal={signal} className="ring-1 ring-white/30" />
        {focusKey > 0 && <ChangeFlash signal={`focus-${focusKey}`} className="bg-white/5 ring-2 ring-white/50" />}

        <div className="flex items-center gap-3 px-3.5 pt-3">
          <AvatarStatus
            emoji={a.emoji}
            color="rgba(255,255,255,0.18)"
            src={a.avatar_url}
            size={40}
            tone={st.tone}
            surface="#0c0c0f"
            className={a.status === "paused" ? "grayscale" : ""}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-medium text-white">{a.name}</p>
            <p className="truncate text-[12px] text-white/45">{a.title}</p>
          </div>
          <Mono className="shrink-0 text-[11px] text-white/45">{int(a.spent_today_credits)} cr</Mono>
          <ChevronDown className={`size-4 shrink-0 text-white/30 transition-transform duration-300 group-hover:text-white/70 ${expanded ? "rotate-180" : ""}`} />
        </div>

        {/* chip row — like the reference's "On Success · On Fail" pills */}
        <div className="flex items-center gap-1.5 overflow-hidden px-3.5 pt-2.5 pb-3">
          <Chip>
            <ToneIcon icon={st.icon} tone={st.tone} className="size-3" />
            <span>{agentStatusLabel(a.status, a.pause_reason)}</span>
          </Chip>
          {task && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openTask(task.number);
              }}
              className="nodrag nopan rounded-full transition-opacity hover:opacity-80"
              title={`Open ${taskId(task.number)} · ${task.title}`}
            >
              <Chip>
                <Mono className="text-white/55">{taskId(task.number)}</Mono>
                <span className="max-w-[96px] truncate">{TASK_KIND[task.kind]}</span>
              </Chip>
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="overflow-hidden"
            >
              <Details agent={a} task={task} decideHref={decideHref} />
            </motion.div>
          )}
        </AnimatePresence>
      </CardShell>
      <Handle type="source" position={Position.Right} className={HIDDEN_HANDLE} style={HANDLE_Y} isConnectable={false} />
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium whitespace-nowrap text-white/80">
      {children}
    </span>
  );
}

function Details({ agent: a, task, decideHref }: { agent: PortalAgentRow; task: TaskLite | null; decideHref: string | null }) {
  return (
    <div className="nodrag flex cursor-default flex-col gap-3 border-t border-white/[0.07] px-3.5 pt-3 pb-3.5" onClick={(e) => e.stopPropagation()}>
      <div>
        <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-white/35 uppercase">Current task</p>
        {task ? (
          <>
            <p className="text-[13px] leading-snug text-white/90">
              <Mono className="mr-1.5 text-[11px] text-white/50">{taskId(task.number)}</Mono>
              {task.title}
            </p>
            <p className={`mt-1 text-[11px] ${task.status === "blocked" ? "text-[#ffa46b]" : "text-white/40"}`}>
              {taskStatusLabel(task.status, task.blocked_on)}
              {task.blocked_reason ? `: ${task.blocked_reason}` : ""}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-white/35">No task right now</p>
        )}
      </div>

      <p className="text-[12px] leading-relaxed text-white/45">{a.job}</p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-white/40">credits today</span>
          <Mono className="text-white/70">
            {int(a.spent_today_credits)} <span className="text-white/30">/ {int(a.budget_daily_credits)}</span>
          </Mono>
        </div>
        <BudgetBar spent={a.spent_today_credits} budget={a.budget_daily_credits} warnPct={a.budget_warn_pct} showTick />
        <p className="flex justify-between text-[11px] text-white/40">
          <span>
            <Mono className="text-white/70">{a.tasks_done}</Mono> done · <Mono className="text-white/70">{a.tasks_open}</Mono> open
          </span>
          <span>
            active <TimeAgo iso={a.last_active_at} />
          </span>
        </p>
      </div>

      <div className="nodrag flex flex-wrap items-center gap-2">
        <Link href={agentHref(a)} className={PILL_SM_BUTTON}>
          Profile
        </Link>
        {task && (
          <button type="button" onClick={() => openTask(task.number)} className={PILL_SM_BUTTON}>
            View task
          </button>
        )}
        {a.status === "waiting_on_you" && (
          <span className="ml-auto">
            <PillLink href={decideHref}>Decide in Slack</PillLink>
          </span>
        )}
      </div>
    </div>
  );
}

/** Working and waiting-on-you = the landing page's orbiting laser; paused / error = dashed red. */
function CardShell({ status, children }: { status: AgentStatus; children: ReactNode }) {
  if (status === "working" || status === "waiting_on_you") {
    return (
      <LaserBorder radius={16} innerClassName={NODE_FILL}>
        {children}
      </LaserBorder>
    );
  }
  const border =
    status === "paused" || status === "error"
        ? "border border-dashed border-st-danger/65"
        : "border border-white/10 group-hover:border-white/20";
  return <div className={`relative rounded-[16px] transition-colors ${NODE_FILL} ${border}`}>{children}</div>;
}
