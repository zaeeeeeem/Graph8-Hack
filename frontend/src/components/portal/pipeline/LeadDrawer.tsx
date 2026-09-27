"use client";

import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect } from "react";
import { money, taskId } from "@/lib/portal/format";
import { g8Contact, g8Deal, g8Meeting, g8Sequence } from "@/lib/portal/links";
import type { LeadEventLite, LeadLite, PortalSnapshot, SequenceLite } from "@/lib/portal/snapshot";
import { agentsById, eventsForLead, tasksById } from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import { closeLead, openTask } from "@/lib/portal/taskNav";
import type { PortalAgentRow } from "@/lib/portal/types";
import {
  AGENT_STATUS,
  CHANNEL,
  DIRECTION_MARK,
  LEAD_EVENT_VERB,
  LEAD_STAGE,
  REPLY_INTENT,
  SEQUENCE_STATE,
  SEQUENCE_STATUS,
  leadStageLabel,
} from "@/lib/portal/vocab";
import { AgentAvatar, AvatarStatus, LinkOut, Mono, StatusPill, TimeAgo } from "../ui/primitives";
import { ChannelIcon, DRAWER_SECTION, DrawerFrame, GLASS_BOX } from "../ui/Drawer";
import { PILL_ICON_BUTTON, PillLink, TAG } from "../ui/surface";

const MEETING_TIME = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** S3c Lead timeline drawer — opened with `?lead=<id>` from the pipeline table or a task. */
export function LeadDrawer() {
  const params = useSearchParams();
  const { load, data } = usePortal();
  const id = params.get("lead");
  const lead = data && id ? data.leads.find((l) => l.id === id) : undefined;

  useEffect(() => {
    if (load === "ready" && id && !lead) closeLead();
  }, [load, id, lead]);

  return (
    <DrawerFrame open={!!(data && lead)} label={lead ? lead.full_name : "Lead"} onClose={closeLead}>
      {data && lead && <LeadBody data={data} lead={lead} />}
    </DrawerFrame>
  );
}

function LeadBody({ data, lead: l }: { data: PortalSnapshot; lead: LeadLite }) {
  const byId = agentsById(data);
  const owner = l.owner_agent_id ? byId.get(l.owner_agent_id) : undefined;
  const events = eventsForLead(data, l.id);
  const sequence = l.sequence_id ? data.sequences.find((q) => q.id === l.sequence_id) : undefined;
  const stage = LEAD_STAGE[l.stage];
  const initials = l.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <>
      <header className="shrink-0 border-b border-white/[0.07] px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[15px] font-medium text-white/80">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] leading-tight font-medium text-white">{l.full_name}</h2>
            <p className="truncate text-[13px] text-white/50">
              {[l.job_title, l.company_name, l.location].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" onClick={closeLead} className={PILL_ICON_BUTTON} aria-label="Close (Esc)" title="Close  Esc">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <StatusPill tone={stage.tone} icon={stage.icon} label={leadStageLabel(l.stage, l.disqualify_reason)} size="sm" />
          {l.fit_score != null && (
            <span className={TAG}>
              Fit <Mono className="text-white">{l.fit_score}</Mono>
            </span>
          )}
          {owner && (
            <span className={`${TAG} pl-0.5`}>
              <AvatarStatus emoji={owner.emoji} color="rgba(255,255,255,0.15)" src={owner.avatar_url} size={22} tone={AGENT_STATUS[owner.status].tone} surface="#15161a" />
              {owner.name}
            </span>
          )}
          {l.is_test_contact && <span className={`${TAG} text-[#8fd3ff]`}>test contact</span>}
          {l.do_not_contact && <span className={`${TAG} text-[#ff8f86]`}>do not contact</span>}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <PillLink href={g8Contact(l.g8_contact_id)}>Open in graph8</PillLink>
          <PillLink href={g8Deal(l.g8_deal_id)}>Open deal in graph8</PillLink>
          {l.g8_meeting_id && (
            <LinkOut href={g8Meeting(l.g8_meeting_id)} className="px-2 text-[12px]">
              Meeting
            </LinkOut>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {(l.deal_amount || l.meeting_at || l.last_reply_intent) && (
          <div className="grid grid-cols-3 gap-2">
            <Fact label="Deal" value={l.deal_amount ? `${money(l.deal_amount)}${l.deal_stage ? ` · ${l.deal_stage}` : ""}` : "—"} />
            <Fact label="Meeting" value={l.meeting_at ? MEETING_TIME.format(new Date(l.meeting_at)).replace(",", "") : "—"} />
            <Fact label="Last reply" value={l.last_reply_intent ? REPLY_INTENT[l.last_reply_intent] : "—"} />
          </div>
        )}

        {l.why_now && (
          <section>
            <p className={DRAWER_SECTION}>Why now</p>
            <p className={`${GLASS_BOX} px-4 py-3 text-[13px] leading-relaxed text-white/80`}>{l.why_now}</p>
          </section>
        )}

        {l.signals.length > 0 && (
          <section>
            <p className={DRAWER_SECTION}>Signals</p>
            <ul className="flex flex-col gap-2">
              {l.signals.map((sig, i) => (
                <li key={i} className={`${GLASS_BOX} flex items-center gap-3 px-4 py-2.5`}>
                  <span className={`${TAG} capitalize`}>{sig.type}</span>
                  <span className="min-w-0 flex-1 text-[13px] text-white/80">{sig.text}</span>
                  {sig.source?.startsWith("http") ? (
                    <LinkOut href={sig.source} className="text-[12px]">
                      Source
                    </LinkOut>
                  ) : sig.source ? (
                    <span className="text-[11px] text-white/35">{sig.source}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className={DRAWER_SECTION}>Timeline · {events.length}</p>
          {events.length === 0 ? (
            <p className={`${GLASS_BOX} px-4 py-3 text-[13px] text-white/40`}>Nothing has happened with this lead yet.</p>
          ) : (
            <ol className="relative">
              <span aria-hidden="true" className="absolute top-3 bottom-3 left-[15px] w-px bg-white/10" />
              <AnimatePresence initial={false}>
                {events.map((e) => (
                  <TimelineItem key={e.id} event={e} byId={byId} data={data} />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </section>

        {sequence && <SequenceCard sequence={sequence} state={SEQUENCE_STATE[l.sequence_state]} />}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${GLASS_BOX} px-3 py-2.5`}>
      <p className="text-[11px] text-white/40">{label}</p>
      <p className="mt-0.5 truncate text-[13px] text-white">{value}</p>
    </div>
  );
}

function TimelineItem({ event: e, byId, data }: { event: LeadEventLite; byId: Map<string, PortalAgentRow>; data: PortalSnapshot }) {
  const agent = e.agent_id ? byId.get(e.agent_id) : undefined;
  const task = e.task_id ? tasksById(data).get(e.task_id) : undefined;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex gap-3 py-2"
    >
      <span className="relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#141418] text-white/60" title={e.channel === "system" ? "System" : CHANNEL[e.channel]}>
        <ChannelIcon channel={e.channel} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium text-white/85">{LEAD_EVENT_VERB[e.type]}</span>
          <span className="font-mono text-white/35" title={e.direction}>
            {DIRECTION_MARK[e.direction]}
          </span>
          {agent && (
            <span className="flex items-center gap-1 text-white/45">
              <AgentAvatar emoji={agent.emoji} color="rgba(255,255,255,0.15)" src={agent.avatar_url} size={16} />
              {agent.name}
            </span>
          )}
          {task && (
            <button type="button" onClick={() => openTask(task.number)} className="font-mono text-white/45 hover:text-white" title={task.title}>
              {taskId(task.number)}
            </button>
          )}
          <span className="ml-auto shrink-0 text-white/35">
            <TimeAgo iso={e.occurred_at} />
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-white/60">{e.summary}</p>
      </div>
    </motion.li>
  );
}

function SequenceCard({ sequence: q, state }: { sequence: SequenceLite; state: string }) {
  const st = SEQUENCE_STATUS[q.status];
  const stats: [string, number | undefined][] = [
    ["sent", q.stats.sent],
    ["opened", q.stats.opened],
    ["replied", q.stats.replied],
    ["meetings", q.stats.meetings],
  ];
  return (
    <section>
      <p className={DRAWER_SECTION}>Sequence</p>
      <div className={`${GLASS_BOX} flex flex-col gap-3 px-4 py-3.5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] text-white">{q.name}</p>
            <p className="text-[12px] text-white/45">This lead: {state}</p>
          </div>
          <StatusPill tone={st.tone} icon={st.icon} label={st.label} size="sm" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {q.steps.map((step) => (
            <span key={step.n} className={TAG} title={step.subject ?? step.action}>
              <Mono className="text-white/45">D{step.day}</Mono>
              <ChannelIcon channel={step.channel} className="size-3" />
              {CHANNEL[step.channel]}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-[12px]">
          <div className="flex gap-4">
            {stats.map(([k, v]) => (
              <span key={k} className="text-white/45">
                <Mono className="text-white">{v ?? 0}</Mono> {k}
              </span>
            ))}
          </div>
          <LinkOut href={g8Sequence(q.g8_sequence_id)} className="text-[12px]">
            Open in graph8
          </LinkOut>
        </div>
      </div>
    </section>
  );
}
