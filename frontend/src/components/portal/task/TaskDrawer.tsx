"use client";

import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { DRAWER_SECTION, DrawerFrame, GLASS_BOX } from "../ui/Drawer";
import { CircleAlert, CircleX, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { int, taskId } from "@/lib/portal/format";
import { g8Contact, g8Deal, g8Sequence, slackThread } from "@/lib/portal/links";
import type { LeadLite, PortalSnapshot, SequenceLite, TaskLite } from "@/lib/portal/snapshot";
import { agentsById, decisionForTask, reportsForTask, stepsForTask, taskByNumber, taskTree, type TaskTreeNode } from "@/lib/portal/selectors";
import { StepList } from "../ui/StepList";
import { usePortal } from "@/lib/portal/store";
import { closeTask, openLead, openTask } from "@/lib/portal/taskNav";
import type { PortalAgentRow, ReportRow } from "@/lib/portal/types";
import { decisionPayloadLine } from "@/lib/portal/payload";
import {
  AGENT_STATUS,
  APPROVAL_KIND,
  APPROVAL_STATUS,
  BLOCKED_ON_OWNER,
  CHANNEL,
  FOUNDER_LABEL,
  LEAD_STAGE,
  REPORT_KIND,
  SEQUENCE_STATUS,
  TASK_KIND,
  TASK_STATUS,
  UI_ICON,
  UNKNOWN_AGENT_LABEL,
  taskStatusLabel,
} from "@/lib/portal/vocab";
import { AgentAvatar, AvatarStatus, LinkOut, Mono, StatusPill, TONE, TimeAgo, ToneIcon } from "../ui/primitives";
import { LaserBorder, PILL_ICON_BUTTON, PILL_SM, PillLink, TAG } from "../ui/surface";

const SECTION = DRAWER_SECTION;

/**
 * S2 Task drawer — "what exactly is this agent doing, who asked, what came back".
 * Opened from anywhere via `?task=<number>`; one task = one Slack thread.
 */
export function TaskDrawer() {
  const params = useSearchParams();
  const { load, data } = usePortal();
  const n = Number(params.get("task"));
  const task = data && Number.isFinite(n) && n > 0 ? taskByNumber(data, n) : undefined;

  // Task vanished (full reseed) → close quietly instead of showing an empty panel.
  useEffect(() => {
    if (load === "ready" && params.get("task") && !task) closeTask();
  }, [load, params, task]);

  return (
    <DrawerFrame open={!!(data && task)} label={task ? `${taskId(task.number)} ${task.title}` : "Task"} onClose={closeTask}>
      {data && task && <DrawerBody data={data} task={task} />}
    </DrawerFrame>
  );
}

function DrawerBody({ data, task }: { data: PortalSnapshot; task: TaskLite }) {
  const byId = agentsById(data);
  const assignee = task.assignee_agent_id ? byId.get(task.assignee_agent_id) : undefined;
  const creator = task.created_by_agent_id ? byId.get(task.created_by_agent_id)?.name ?? UNKNOWN_AGENT_LABEL : FOUNDER_LABEL;
  const st = TASK_STATUS[task.status];
  const decision = decisionForTask(data, task);
  const reports = reportsForTask(data, task.id);
  const steps = stepsForTask(data, task.id);
  const tree = taskTree(data, task);
  const lead = task.lead_id ? data.leads.find((l) => l.id === task.lead_id) : undefined;
  const sequence = task.sequence_id ? data.sequences.find((q) => q.id === task.sequence_id) : undefined;
  const pendingDecision = decision?.status === "pending" ? decision : undefined;
  const statusLabel = taskStatusLabel(task.status, task.blocked_on) + (task.status === "blocked" && task.blocked_reason ? `: ${task.blocked_reason}` : "");

  return (
    <>
      {/* Header */}
      <header className="shrink-0 border-b border-white/[0.07] px-6 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className={`${PILL_SM} font-mono text-white/80`}>{taskId(task.number)}</span>
          <span className={PILL_SM}>{TASK_KIND[task.kind]}</span>
          <span className="flex-1" />
          <PillLink href={slackThread(task.slack_channel, task.slack_thread_ts)}>Open in Slack</PillLink>
          <button type="button" onClick={closeTask} className={PILL_ICON_BUTTON} aria-label="Close (Esc)" title="Close  Esc">
            <X className="size-4" />
          </button>
        </div>
        <h2 className="mt-3 text-[20px] leading-snug font-medium text-white">{task.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill tone={st.tone} icon={st.icon} label={statusLabel} size="sm" />
          {assignee && (
            <span className={`${TAG} pl-0.5`}>
              <AvatarStatus
                emoji={assignee.emoji}
                color="rgba(255,255,255,0.15)"
                src={assignee.avatar_url}
                size={22}
                tone={AGENT_STATUS[assignee.status].tone}
                surface="#15161a"
              />
              {assignee.name}
            </span>
          )}
          <span className="text-[12px] text-white/40">
            by {creator} · <TimeAgo iso={task.created_at} />
            {task.credits_used > 0 && (
              <>
                {" · "}
                <Mono className="text-white/60">{int(task.credits_used)} cr</Mono>
              </>
            )}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {pendingDecision && <DecisionCard decision={pendingDecision} data={data} />}

        {task.detail && (
          <section>
            <p className={SECTION}>Instruction</p>
            <p className={`${GLASS_BOX} px-4 py-3 text-[13px] leading-relaxed text-white/60`}>{task.detail}</p>
          </section>
        )}

        <Outcome task={task} />

        {steps.length > 0 && (
          <section>
            <p className={SECTION}>Steps · {steps.length}</p>
            <div className={`${GLASS_BOX} px-3 py-2`}>
              <StepList steps={steps} />
            </div>
          </section>
        )}

        {tree && (
          <section>
            <p className={SECTION}>Delegation</p>
            <div className={`${GLASS_BOX} p-2`}>
              <TreeNode node={tree} currentId={task.id} byId={byId} depth={0} />
            </div>
          </section>
        )}

        <section>
          <p className={SECTION}>Reports on this task{reports.length > 0 ? ` · ${reports.length}` : ""}</p>
          {reports.length === 0 ? (
            <p className={`${GLASS_BOX} px-4 py-3 text-[13px] text-white/40`}>
              No reports yet — {assignee?.name ?? "the agent"} will post here when done.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {reports.map((r) => (
                  <ReportItem key={r.id} report={r} byId={byId} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {(lead || sequence || (decision && !pendingDecision)) && (
          <section>
            <p className={SECTION}>Linked</p>
            <div className="flex flex-col gap-2">
              {lead && <LeadRow lead={lead} />}
              {sequence && <SequenceRow sequence={sequence} />}
              {decision && !pendingDecision && (
                <LinkedRow
                  title={decision.title}
                  sub={`${APPROVAL_KIND[decision.kind]} · decided`}
                  right={<StatusPill tone={APPROVAL_STATUS[decision.status].tone} icon={APPROVAL_STATUS[decision.status].icon} label={APPROVAL_STATUS[decision.status].label} size="sm" />}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/** The ask that unblocks this task, pinned to the top. Carries the laser: it's the thing to act on. */
function DecisionCard({ decision, data }: { decision: NonNullable<ReturnType<typeof decisionForTask>>; data: PortalSnapshot }) {
  const who = data.agents.find((a) => a.id === decision.requested_by_agent_id);
  return (
    <LaserBorder radius={18} innerClassName="bg-white/[0.03] backdrop-blur-xl">
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.1em] text-[#ffa46b] uppercase">
          <ToneIcon icon={UI_ICON.needsYou} tone="attention" className="size-3.5" />
          Needs your decision · {APPROVAL_KIND[decision.kind]}
        </div>
        <p className="text-[15px] leading-snug text-white">{decision.title}</p>
        <p className="text-[13px] leading-relaxed text-white/55">
          {decisionPayloadLine(decision.kind, decision.payload) ?? decision.summary}
        </p>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[12px] text-white/40">
            asked by {who?.name ?? UNKNOWN_AGENT_LABEL} · <TimeAgo iso={decision.created_at} />
          </span>
          <PillLink href={slackThread(decision.slack_channel, decision.slack_ts)}>Decide in Slack</PillLink>
        </div>
      </div>
    </LaserBorder>
  );
}

function Outcome({ task }: { task: TaskLite }) {
  if (task.status === "blocked") {
    return (
      <Callout icon={<CircleAlert className="size-4 text-[#ffa46b]" />} label="Blocked">
        Waiting on {task.blocked_on ? BLOCKED_ON_OWNER[task.blocked_on] : "someone"}
        {task.blocked_reason ? ` — ${task.blocked_reason}` : ""}.
      </Callout>
    );
  }
  if (task.status === "failed") {
    return (
      <Callout icon={<CircleX className="size-4 text-[#ff7a70]" />} label="Failed">
        {task.result_summary ?? "The run failed. Details are in the Slack thread."}
      </Callout>
    );
  }
  if (!task.result_summary) return null;
  const st = TASK_STATUS[task.status];
  return (
    <Callout
      icon={<ToneIcon icon={st.icon} tone={st.tone} className="size-4" />}
      label={task.status === "done" ? "Result" : "Progress so far"}
    >
      {task.result_summary}
    </Callout>
  );
}

function Callout({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <section>
      <p className={SECTION}>{label}</p>
      <div className={`${GLASS_BOX} flex gap-3 px-4 py-3`}>
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{icon}</span>
        <p className="text-[13px] leading-relaxed text-white/80">{children}</p>
      </div>
    </section>
  );
}

function TreeNode({ node, currentId, byId, depth }: { node: TaskTreeNode; currentId: string; byId: Map<string, PortalAgentRow>; depth: number }) {
  const t = node.task;
  const who = t.assignee_agent_id ? byId.get(t.assignee_agent_id) : undefined;
  const current = t.id === currentId;
  const st = TASK_STATUS[t.status];
  return (
    <div>
      <button
        type="button"
        onClick={() => !current && openTask(t.number, { replace: true })}
        className={`flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors ${
          current ? "border border-white/10 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "border border-transparent hover:bg-white/[0.04]"
        }`}
        aria-current={current ? "true" : undefined}
      >
        <Mono className="w-9 shrink-0 text-[12px] text-white/45">{taskId(t.number)}</Mono>
        <span className={`min-w-0 flex-1 truncate text-[13px] ${current ? "text-white" : "text-white/75"}`}>{t.title}</span>
        {who && <AgentAvatar emoji={who.emoji} color="rgba(255,255,255,0.15)" src={who.avatar_url} size={20} />}
        <span className="flex w-[92px] shrink-0 items-center gap-1.5 text-[11px] text-white/50">
          <ToneIcon icon={st.icon} tone={st.tone} className="size-3" />
          <span className="truncate">{st.label}</span>
        </span>
      </button>
      {node.children.length > 0 && (
        <div className={`${depth === 0 ? "ml-[22px]" : "ml-5"} border-l border-white/10 pl-2.5`}>
          {node.children.map((c) => (
            <TreeNode key={c.task.id} node={c} currentId={currentId} byId={byId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportItem({ report: r, byId }: { report: ReportRow; byId: Map<string, PortalAgentRow> }) {
  const from = byId.get(r.from_agent_id);
  const to = r.to_agent_id ? byId.get(r.to_agent_id)?.name ?? UNKNOWN_AGENT_LABEL : FOUNDER_LABEL;
  const kind = REPORT_KIND[r.kind];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`${GLASS_BOX} group px-4 py-3`}
    >
      <div className="flex items-center gap-2 text-[12px] text-white/45">
        {from && <AgentAvatar emoji={from.emoji} color="rgba(255,255,255,0.15)" src={from.avatar_url} size={20} />}
        <span className="min-w-0 truncate">
          <strong className="font-medium text-white/85">{from?.name ?? UNKNOWN_AGENT_LABEL}</strong>
          <span className="text-white/30"> → </span>
          <strong className="font-medium text-white/85">{to}</strong>
        </span>
        <span className={`shrink-0 ${TONE[kind.tone].text}`}>· {kind.label}</span>
        <span className="ml-auto shrink-0">
          <TimeAgo iso={r.created_at} />
        </span>
      </div>
      <p className="mt-2 text-[14px] leading-snug text-white">{r.title}</p>
      {r.body && <p className="mt-1 text-[13px] leading-relaxed text-white/55">{r.body}</p>}
      <LinkOut href={slackThread(r.slack_channel, r.slack_thread_ts ?? r.slack_ts)} className="mt-2 text-[12px]">
        Open in Slack
      </LinkOut>
    </motion.li>
  );
}

function LinkedRow({
  title,
  sub,
  right,
  links,
  onClick,
}: {
  title: ReactNode;
  sub: ReactNode;
  right?: ReactNode;
  links?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={`${GLASS_BOX} flex items-center gap-3 px-4 py-3`}>
      <div className="min-w-0 flex-1">
        {onClick ? (
          <button type="button" onClick={onClick} className="block max-w-full truncate text-left text-[14px] text-white hover:underline" title="Open lead timeline">
            {title}
          </button>
        ) : (
          <p className="truncate text-[14px] text-white">{title}</p>
        )}
        <p className="truncate text-[12px] text-white/45">{sub}</p>
        {links && <div className="mt-1.5 flex flex-wrap gap-3 text-[12px]">{links}</div>}
      </div>
      {right}
    </div>
  );
}

function LeadRow({ lead }: { lead: LeadLite }) {
  const stage = LEAD_STAGE[lead.stage];
  return (
    <LinkedRow
      onClick={() => openLead(lead.id)}
      title={
        <>
          {lead.full_name} <span className="text-white/40">· {lead.company_name}</span>
        </>
      }
      sub={`Lead · ${lead.job_title ?? ""}${lead.is_test_contact ? " · test contact" : ""}`}
      right={<StatusPill tone={stage.tone} icon={stage.icon} label={stage.label} size="sm" />}
      links={
        <>
          <LinkOut href={g8Contact(lead.g8_contact_id)}>Open in graph8</LinkOut>
          <LinkOut href={g8Deal(lead.g8_deal_id)}>Open deal in graph8</LinkOut>
        </>
      }
    />
  );
}

function SequenceRow({ sequence: q }: { sequence: SequenceLite }) {
  const st = SEQUENCE_STATUS[q.status];
  return (
    <LinkedRow
      title={q.name}
      sub={`Sequence · ${q.steps.length} steps · ${q.channels.map((c) => CHANNEL[c]).join(", ")} · ${q.enrolled_count} of ${q.lead_count} enrolled`}
      right={<StatusPill tone={st.tone} icon={st.icon} label={st.label} size="sm" />}
      links={<LinkOut href={g8Sequence(q.g8_sequence_id)}>Open in graph8</LinkOut>}
    />
  );
}
