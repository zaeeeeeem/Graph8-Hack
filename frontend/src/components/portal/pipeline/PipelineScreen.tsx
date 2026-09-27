"use client";

import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Search, UserSearch, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { money } from "@/lib/portal/format";
import { g8Contact, g8Deal } from "@/lib/portal/links";
import type { LeadLite, PortalSnapshot } from "@/lib/portal/mock";
import { agentsById, funnelBuckets, sortedLeads, stagesFor, type FunnelKey } from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import { openLead, setStageFilter } from "@/lib/portal/taskNav";
import type { PortalAgentRow } from "@/lib/portal/types";
import { CHANNEL, LEAD_STAGE, UI_ICON, leadStageLabel } from "@/lib/portal/vocab";
import { ChannelIcon } from "../ui/Drawer";
import { AgentAvatar, ChangeFlash, CountUp, EmptyLine, InlineError, LinkOut, Skeleton, StatusPill, TimeAgo, ToneIcon } from "../ui/primitives";
import { PILL, SURFACE } from "../ui/surface";

// Funnel buckets reuse the icon of their first stage (Prospects = prospect, …).
const BUCKET_ICON: Record<FunnelKey, LucideIcon> = {
  prospects: LEAD_STAGE.prospect.icon,
  contacted: LEAD_STAGE.contacted.icon,
  replied: LEAD_STAGE.replied.icon,
  meetings: LEAD_STAGE.meeting.icon,
  deals: LEAD_STAGE.deal.icon,
  closed: LEAD_STAGE.disqualified.icon,
};

const MEETING_TIME = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const GRID =
  "grid grid-cols-[minmax(170px,1.3fr)_minmax(140px,1.1fr)_minmax(190px,1fr)_72px_minmax(104px,0.8fr)_minmax(140px,1.6fr)_32px_76px] items-center gap-3";

/**
 * S3 Pipeline — "what did it achieve?" for leads. A mirror of graph8, so every row links out.
 * Funnel buckets filter the table (`?stage=`); a row opens the lead timeline (`?lead=`).
 */
export function PipelineScreen() {
  const { load, data, live } = usePortal();
  const params = useSearchParams();
  const stage = (params.get("stage") as FunnelKey | null) ?? null;
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col gap-3 pb-1">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-[26px] leading-tight font-medium text-white">Pipeline</h1>
          <p className="text-[13px] text-white/45">
            {data ? `${data.leads.length} leads · mirrored from graph8 · updating live` : " "}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className={`${PILL} w-[260px] focus-within:border-white/25`}>
            <Search className="size-4 text-white/45" strokeWidth={1.8} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search leads or companies"
              aria-label="Search leads or companies"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-white/35 focus:outline-none"
            />
          </label>
          <span className={PILL}>
            <ToneIcon icon={UI_ICON.live} tone={live === "joined" ? "success" : "muted"} />
            {live === "joined" ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </header>

      {load === "error" ? (
        <div className={`rounded-[22px] p-5 ${SURFACE}`}>
          <InlineError what="the pipeline" />
        </div>
      ) : !data ? (
        <PipelineSkeleton />
      ) : (
        <>
          <Funnel data={data} active={stage} />
          <LeadTable data={data} stage={stage} query={query} />
        </>
      )}
    </div>
  );
}

// --- funnel ---------------------------------------------------------------------------

function Funnel({ data, active }: { data: PortalSnapshot; active: FunnelKey | null }) {
  const { buckets, closed, total } = funnelBuckets(data);
  const toggle = (key: FunnelKey) => setStageFilter(active === key ? null : key);
  return (
    <section aria-label="Funnel" className="flex flex-wrap items-stretch gap-2">
      {buckets.map((b, i) => {
        const selected = active === b.key;
        const share = total > 0 ? (b.count / total) * 100 : 0;
        return (
          <div key={b.key} className="flex min-w-[150px] flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => toggle(b.key)}
              aria-pressed={selected}
              className={`relative flex flex-1 flex-col gap-2 overflow-hidden rounded-[20px] px-4 py-3.5 text-left transition-colors ${SURFACE} ${
                selected ? "!border-white/25 !bg-white/[0.07]" : "hover:!border-white/15"
              }`}
              title={selected ? "Show all leads" : `Show ${b.label.toLowerCase()} only`}
            >
              <ChangeFlash signal={`${b.key}-${b.count}-${b.amount}`} className="bg-white/[0.05]" />
              <span className="flex items-center justify-between text-[12px] text-white/55">
                {b.label}
                <ToneIcon icon={BUCKET_ICON[b.key]} tone={LEAD_STAGE[b.stages[0] as LeadLite["stage"]].tone} className="size-4" />
              </span>
              <span className="flex items-baseline gap-2">
                <CountUp value={b.count} className="text-[28px] leading-none font-semibold tracking-tight text-white" />
                {b.key === "deals" && b.amount > 0 && <span className="font-mono text-[13px] text-[#5fe0ad]">{money(b.amount)}</span>}
              </span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <motion.span
                  className="block h-full rounded-full bg-white/50"
                  initial={false}
                  animate={{ width: `${Math.max(share, b.count > 0 ? 4 : 0)}%` }}
                  transition={{ type: "spring", stiffness: 140, damping: 24 }}
                />
              </span>
            </button>
            {i < buckets.length - 1 && <ChevronRight className="hidden size-4 shrink-0 text-white/20 xl:block" />}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => toggle("closed")}
        aria-pressed={active === "closed"}
        className={`${PILL} self-center ${active === "closed" ? "!border-white/25 !bg-white/[0.07] text-white" : "text-white/50 hover:text-white"}`}
        title="Lost and disqualified leads"
      >
        <ToneIcon icon={BUCKET_ICON.closed} tone="muted" />
        {closed.count} closed out
      </button>
    </section>
  );
}

// --- table ------------------------------------------------------------------------------

function LeadTable({ data, stage, query }: { data: PortalSnapshot; stage: FunnelKey | null; query: string }) {
  const byId = agentsById(data);
  const stages = stagesFor(stage);
  const q = query.trim().toLowerCase();
  const rows = sortedLeads(data).filter(
    (l) =>
      (!stages || stages.includes(l.stage)) &&
      (!q || l.full_name.toLowerCase().includes(q) || (l.company_name ?? "").toLowerCase().includes(q) || (l.company_domain ?? "").includes(q)),
  );
  const bucketLabel = stage === "closed" ? "closed out" : stage ? (stage as string) : null;

  return (
    <section aria-label="Leads" className={`overflow-hidden rounded-[22px] ${SURFACE}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[18px] font-medium text-white">
          Leads
          <span className="ml-2 text-[13px] font-normal text-white/40">
            {rows.length}
            {bucketLabel ? ` in ${bucketLabel}` : ""}
          </span>
        </h2>
        {stage && (
          <button type="button" onClick={() => setStageFilter(null)} className="text-[12px] text-white/50 hover:text-white">
            Clear filter
          </button>
        )}
      </div>

      {data.leads.length === 0 ? (
        <EmptyLine icon={<UserSearch className="size-4.5" />}>No leads yet — Bilal (Scout) adds prospects as soon as the team starts.</EmptyLine>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className={`${GRID} border-y border-white/[0.06] px-5 py-2.5 text-[11px] font-medium tracking-[0.08em] text-white/35 uppercase`}>
              <span>Lead</span>
              <span>Company</span>
              <span>Stage</span>
              <span>Fit</span>
              <span>Last touch</span>
              <span>Why now</span>
              <span title="Agent who owns the lead">Owner</span>
              <span className="text-right">graph8</span>
            </div>
            {rows.length === 0 ? (
              <EmptyLine>No leads match{q ? ` “${query}”` : ""}{bucketLabel ? ` in ${bucketLabel}` : ""}.</EmptyLine>
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {rows.map((l) => (
                    <LeadRowView key={l.id} lead={l} owner={l.owner_agent_id ? byId.get(l.owner_agent_id) : undefined} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function LeadRowView({ lead: l, owner }: { lead: LeadLite; owner?: PortalAgentRow }) {
  const st = LEAD_STAGE[l.stage];
  const closed = l.stage === "disqualified" || l.stage === "lost";
  const stageRank = ["meeting", "deal", "won"].includes(l.stage);
  const signal = `${l.stage}|${l.last_activity_at}|${l.deal_amount}`;
  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: closed ? 0.5 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="relative border-b border-white/[0.05] last:border-b-0"
    >
      <ChangeFlash signal={signal} className="bg-white/[0.04]" />
      <div
        role="button"
        tabIndex={0}
        onClick={() => openLead(l.id)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openLead(l.id))}
        className={`${GRID} cursor-pointer px-5 py-3 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none`}
        title={`Open ${l.full_name}'s timeline`}
      >
        {/* Lead */}
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-[14px] text-white">
            <span className="truncate">{l.full_name}</span>
            {l.is_test_contact && (
              <span className="shrink-0 rounded-full border border-st-active/30 px-1.5 text-[10px] leading-4 text-[#8fd3ff]" title="The only person real messages go to">
                test contact
              </span>
            )}
            {l.do_not_contact && <span className="shrink-0 rounded-full border border-st-danger/35 px-1.5 text-[10px] leading-4 text-[#ff8f86]">do not contact</span>}
          </p>
          <p className="truncate text-[12px] text-white/45">{l.job_title}</p>
        </div>
        {/* Company */}
        <div className="min-w-0">
          <p className="truncate text-[13px] text-white/85">{l.company_name}</p>
          <p className="truncate text-[12px] text-white/35">{l.company_domain}</p>
        </div>
        {/* Stage */}
        <div className="min-w-0">
          <StatusPill tone={st.tone} icon={st.icon} label={leadStageLabel(l.stage, l.disqualify_reason)} size="sm" />
          {stageRank && (l.deal_amount || l.meeting_at) && (
            <p className="mt-1 truncate text-[11px] text-white/45">
              {l.deal_amount ? `${money(l.deal_amount)}${l.deal_stage ? ` · ${l.deal_stage}` : ""}` : `Meeting ${MEETING_TIME.format(new Date(l.meeting_at!)).replace(",", "")}`}
            </p>
          )}
        </div>
        {/* Fit */}
        <div className="flex items-center gap-2">
          <span className="h-1 w-8 overflow-hidden rounded-full bg-white/[0.08]">
            <span className="block h-full rounded-full bg-white/55" style={{ width: `${l.fit_score ?? 0}%` }} />
          </span>
          <span className="font-mono text-[12px] text-white/70">{l.fit_score ?? "—"}</span>
        </div>
        {/* Last touch */}
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-white/55">
          {l.last_channel ? (
            <span className="flex items-center gap-1.5" title={CHANNEL[l.last_channel]}>
              <ChannelIcon channel={l.last_channel} />
            </span>
          ) : (
            <span className="text-white/25">—</span>
          )}
          <TimeAgo iso={l.last_activity_at} className="truncate" />
        </div>
        {/* Why now */}
        <p className="truncate text-[12px] text-white/50" title={l.why_now ?? undefined}>
          {l.why_now ?? "—"}
        </p>
        {/* Owner */}
        <span title={owner ? `${owner.name} · ${owner.title}` : undefined}>
          {owner && <AgentAvatar emoji={owner.emoji} color="rgba(255,255,255,0.15)" src={owner.avatar_url} size={26} />}
        </span>
        {/* graph8 links */}
        <div className="flex flex-col items-end gap-0.5 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <LinkOut href={g8Contact(l.g8_contact_id)}>Contact</LinkOut>
          <LinkOut href={g8Deal(l.g8_deal_id)}>Deal</LinkOut>
        </div>
      </div>
    </motion.li>
  );
}

function PipelineSkeleton() {
  return (
    <>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex flex-1 flex-col gap-2 rounded-[20px] px-4 py-3.5 ${SURFACE}`}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-1 w-full" />
          </div>
        ))}
      </div>
      <div className={`flex flex-col gap-3 rounded-[22px] p-5 ${SURFACE}`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </>
  );
}
