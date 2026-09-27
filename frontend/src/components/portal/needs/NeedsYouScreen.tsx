"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, History } from "lucide-react";
import { taskId } from "@/lib/portal/format";
import { slackThread } from "@/lib/portal/links";
import type { ApprovalLite, PortalSnapshot } from "@/lib/portal/snapshot";
import { decisionDraft, decisionPayloadLine } from "@/lib/portal/payload";
import { agentsById, needsYouItems } from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import { openTask } from "@/lib/portal/taskNav";
import type { PortalAgentRow, PortalNeedsYouRow } from "@/lib/portal/types";
import { AGENT_STATUS, APPROVAL_KIND, APPROVAL_KIND_ICON, APPROVAL_STATUS, TASK_STATUS, UI_ICON, UNKNOWN_AGENT_LABEL } from "@/lib/portal/vocab";
import { AvatarStatus, EmptyLine, InlineError, Skeleton, StatusPill, TimeAgo, ToneIcon } from "../ui/primitives";
import { CARD_GLOW, LaserBorder, PILL, PILL_SM_BUTTON, PillLink, SURFACE, TAG } from "../ui/surface";
import { INNER_BOX, SectionCard } from "../ui/SectionCard";

/**
 * S5 Needs you — everything waiting on the founder (portal_needs_you), newest first:
 * Decisions (approvals) and tasks Blocked on you, plus Recent decisions. Every action is "Decide in Slack".
 */
export function NeedsYouScreen() {
  const { load, data, live } = usePortal();
  const items = data ? needsYouItems(data) : [];
  const decisions = items.filter((i) => i.item_type === "approval").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const blocked = items.filter((i) => i.item_type === "task").sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="flex flex-col gap-4 pb-1">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-[26px] leading-tight font-medium text-white">Needs you</h1>
          <p className="text-[13px] text-white/45">
            {!data
              ? " "
              : items.length === 0
                ? "Nothing is waiting on you · decisions happen in Slack"
                : `${items.length} ${items.length === 1 ? "thing is" : "things are"} waiting on you · decisions happen in Slack`}
          </p>
        </div>
        <span className={PILL}>
          <ToneIcon icon={UI_ICON.live} tone={live === "joined" ? "success" : "muted"} />
          {live === "joined" ? "Live" : "Reconnecting…"}
        </span>
      </header>

      {load === "error" ? (
        <div className={`rounded-[22px] p-5 ${SURFACE}`}>
          <InlineError what="what needs you" />
        </div>
      ) : !data ? (
        <NeedsSkeleton />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <div className="flex flex-col gap-4">
            <SectionCard
              label="Decisions"
              icon={<ToneIcon icon={UI_ICON.needsYou} tone="attention" className="size-4" />}
              title="Decisions"
              count={decisions.length}
            >
              {decisions.length === 0 ? (
                <EmptyLine icon={<CircleCheck className="size-4.5 text-[#5fe0ad]" />}>
                  Nothing needs you. Ayesha will ask here (and in Slack) when a decision is needed.
                </EmptyLine>
              ) : (
                <ul className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {decisions.map((d) => (
                      <DecisionItem key={d.id} row={d} data={data} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </SectionCard>

            <SectionCard
              label="Blocked on you"
              icon={<ToneIcon icon={TASK_STATUS.blocked.icon} tone="attention" className="size-4" />}
              title="Blocked on you"
              count={blocked.length}
            >
              {blocked.length === 0 ? (
                <p className="px-1 py-2 text-[13px] text-white/40">No tasks are blocked on you.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {blocked.map((b) => (
                      <BlockedItem key={b.id} row={b} data={data} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </SectionCard>
          </div>

          <RecentDecisions data={data} />
        </div>
      )}
    </div>
  );
}

function Requester({ agent, at }: { agent?: PortalAgentRow; at: string }) {
  return (
    <span className="flex items-center gap-2 text-[12px] text-white/45">
      {agent && (
        <AvatarStatus emoji={agent.emoji} color="rgba(255,255,255,0.15)" src={agent.avatar_url} size={24} tone={AGENT_STATUS[agent.status].tone} surface="#111216" />
      )}
      <span>
        asked by <span className="text-white/75">{agent?.name ?? UNKNOWN_AGENT_LABEL}</span> · <TimeAgo iso={at} />
      </span>
    </span>
  );
}

const ITEM_MOTION = {
  layout: true,
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, marginTop: 0 },
  transition: { type: "spring" as const, stiffness: 300, damping: 32 },
};

/** A pending approval. It carries the laser — it is the one thing on the page to act on. */
function DecisionItem({ row, data }: { row: PortalNeedsYouRow; data: PortalSnapshot }) {
  const approval = data.approvals.find((a) => a.id === row.id);
  const byId = agentsById(data);
  const agent = row.agent_id ? byId.get(row.agent_id) : undefined;
  const task = approval?.task_id ? data.tasks.find((t) => t.id === approval.task_id) : undefined;
  const kind = approval?.kind ?? "custom";
  const line = approval ? decisionPayloadLine(approval.kind, approval.payload) : null;
  const draft = approval ? decisionDraft(approval.kind, approval.payload) : null;

  return (
    <motion.li {...ITEM_MOTION}>
      <LaserBorder radius={18} innerClassName={`bg-white/[0.03] ${CARD_GLOW} backdrop-blur-xl`}>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="attention" icon={APPROVAL_STATUS.pending.icon} label={APPROVAL_STATUS.pending.label} size="sm" />
            <StatusPill tone="neutral" icon={APPROVAL_KIND_ICON[kind]} label={APPROVAL_KIND[kind]} size="sm" />
          </div>
          <h3 className="text-[16px] leading-snug font-medium text-white">{row.title}</h3>
          {line && <p className="font-mono text-[12px] text-white/60">{line}</p>}
          {row.detail && <p className="text-[13px] leading-relaxed text-white/55">{row.detail}</p>}
          {draft && (
            <blockquote className="rounded-xl border-l-2 border-white/20 bg-white/[0.03] px-4 py-2.5 text-[13px] leading-relaxed text-white/75 italic">
              “{draft}”
            </blockquote>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
            <Requester agent={agent} at={row.created_at} />
            <div className="flex items-center gap-2">
              {task && (
                <button type="button" onClick={() => openTask(task.number)} className={PILL_SM_BUTTON} title={task.title}>
                  Blocks {taskId(task.number)}
                </button>
              )}
              <PillLink href={slackThread(row.slack_channel, row.slack_ts)}>Decide in Slack</PillLink>
            </div>
          </div>
        </div>
      </LaserBorder>
    </motion.li>
  );
}

/** A task blocked on the founder or an account connection (portal_needs_you item_type = task). */
function BlockedItem({ row, data }: { row: PortalNeedsYouRow; data: PortalSnapshot }) {
  const agent = row.agent_id ? agentsById(data).get(row.agent_id) : undefined;
  const task = data.tasks.find((t) => t.id === row.id);
  return (
    <motion.li {...ITEM_MOTION} className={`flex flex-col gap-3 p-4 ${INNER_BOX}`}>
      <div className="flex items-center gap-2">
        <StatusPill tone="attention" icon={TASK_STATUS.blocked.icon} label="Blocked on you" size="sm" />
        {task && <span className={`${TAG} font-mono`}>{taskId(task.number)}</span>}
      </div>
      <h3 className="text-[16px] leading-snug font-medium text-white">{row.title}</h3>
      {row.detail && <p className="text-[13px] text-white/55">{row.detail}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
        <Requester agent={agent} at={row.created_at} />
        <div className="flex items-center gap-2">
          {task && (
            <button type="button" onClick={() => openTask(task.number)} className={PILL_SM_BUTTON}>
              View task
            </button>
          )}
          <PillLink href={slackThread(row.slack_channel, row.slack_ts)}>Decide in Slack</PillLink>
        </div>
      </div>
    </motion.li>
  );
}

/** approvals with status ≠ pending: what you already decided, newest first. */
function RecentDecisions({ data }: { data: PortalSnapshot }) {
  const decided = data.approvals
    .filter((a) => a.status !== "pending")
    .sort((a, b) => (b.decided_at ?? b.created_at).localeCompare(a.decided_at ?? a.created_at));
  return (
    <SectionCard label="Recent decisions" icon={<History className="size-4 text-white/55" strokeWidth={2} />} title="Recent decisions" count={decided.length}>
      {decided.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-white/40">Decisions you make in Slack will appear here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {decided.map((a) => (
              <DecidedRow key={a.id} approval={a} data={data} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </SectionCard>
  );
}

function DecidedRow({ approval: a, data }: { approval: ApprovalLite; data: PortalSnapshot }) {
  const st = APPROVAL_STATUS[a.status];
  const task = a.task_id ? data.tasks.find((t) => t.id === a.task_id) : undefined;
  const line = decisionPayloadLine(a.kind, a.payload);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`flex flex-col gap-2 p-4 ${INNER_BOX}`}
    >
      <div className="flex items-center justify-between gap-2">
        <StatusPill tone={st.tone} icon={st.icon} label={st.label} size="sm" />
        <span className="text-[11px] text-white/35">
          <TimeAgo iso={a.decided_at ?? a.created_at} />
        </span>
      </div>
      <p className="text-[14px] leading-snug text-white/90">{a.title}</p>
      <p className="text-[12px] text-white/45">
        {APPROVAL_KIND[a.kind]}
        {line ? ` · ${line}` : ""}
      </p>
      {a.decision_note && <p className="text-[12px] text-white/60 italic">“{a.decision_note}”</p>}
      {task && (
        <button type="button" onClick={() => openTask(task.number)} className={`${PILL_SM_BUTTON} mt-1 w-fit`}>
          View {taskId(task.number)}
        </button>
      )}
    </motion.li>
  );
}

function NeedsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
      <div className={`flex flex-col gap-3 rounded-[22px] p-5 ${SURFACE}`}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className={`flex flex-col gap-3 rounded-[22px] p-5 ${SURFACE}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
