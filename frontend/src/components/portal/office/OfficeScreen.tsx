"use client";

import { AnimatePresence, motion } from "motion/react";
import { officeHeadline } from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import { GlobalBanner } from "../shell/GlobalBanner";
import { InlineError, Skeleton, ToneIcon } from "../ui/primitives";
import { AGENT_STATUS, UI_ICON } from "@/lib/portal/vocab";
import { PILL, SURFACE } from "../ui/surface";
import { Onboarding } from "./Onboarding";
import { OrgCanvas } from "./OrgCanvas";
import { StatTiles } from "./StatTiles";
import { TeamCard } from "./TeamCard";

/**
 * S1 Office — top: the team at a glance (meter + four stat tiles); below: the live agent network.
 * Answers, in order: is my team working · what needs me · what did it achieve.
 */
export function OfficeScreen() {
  const { load, data } = usePortal();

  if (load === "ready" && data && (data.workspace.status === "onboarding" || data.agents.length === 0)) {
    return <Onboarding data={data} />;
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <Header />

      <div id="overview" className="grid scroll-mt-3 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
        <TeamCard data={data} load={load} />
        <StatTiles data={data} load={load} />
      </div>

      <section
        id="network"
        aria-label="Live agent network"
        className={`flex h-[clamp(520px,calc(100dvh-120px),760px)] scroll-mt-3 flex-col rounded-[22px] ${SURFACE}`}
      >
        <NetworkHeader />
        <div className="relative mx-3 mb-3 flex-1 overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#060607]">
          {load === "ready" && data ? (
            <OrgCanvas data={data} />
          ) : load === "error" ? (
            <div className="absolute inset-x-0 top-10 mx-auto w-fit">
              <InlineError what="the team" />
            </div>
          ) : (
            <BoardSkeleton />
          )}
        </div>
      </section>
    </div>
  );
}

function Header() {
  const { load, data, live } = usePortal();
  const facts = load === "ready" && data ? officeHeadline(data) : [];
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-medium text-white">Office</h1>
        <div className="h-5 overflow-hidden">
          {load === "loading" ? (
            <Skeleton className="mt-1 h-3.5 w-64" />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={facts.join("|")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="truncate text-[13px] text-white/45"
              >
                {facts.join(" · ")}
              </motion.p>
            </AnimatePresence>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <GlobalBanner />
        <span className={PILL} title={live === "joined" ? "Updates arrive automatically" : "Reconnecting — showing last known state"}>
          <ToneIcon icon={UI_ICON.live} tone={live === "joined" ? "success" : "muted"} />
          {live === "joined" ? "Live" : "Reconnecting…"}
        </span>
      </div>
    </header>
  );
}

function NetworkHeader() {
  const { load, data } = usePortal();
  const t = data?.today;
  const summary =
    load === "ready" && data && t
      ? [
          `${data.agents.length} agents`,
          `${t.agents_working} working`,
          t.agents_waiting_on_you > 0 ? `${t.agents_waiting_on_you} waiting on you` : null,
          t.agents_paused > 0 ? `${t.agents_paused} paused` : null,
          "updating live",
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  const legend = (["working", "waiting_on_you", "paused", "idle"] as const).map((k) => ({ ...AGENT_STATUS[k] }));
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[20px] font-medium text-white">Live agent network</h2>
        <p className="truncate text-[13px] text-white/45">{summary || " "}</p>
      </div>
      <div className={`${PILL} hidden gap-4 md:inline-flex`}>
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-[12px]">
            <ToneIcon icon={l.icon} tone={l.tone} />
            {l.label}
          </span>
        ))}
      </div>
    </header>
  );
}

/** Ghost cards in the same left → right shape, so nothing jumps when data arrives. */
function BoardSkeleton() {
  const card = "h-[96px] w-[264px] animate-pulse rounded-[16px] border border-white/[0.06] bg-white/[0.03]";
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-24 p-6" aria-busy="true">
      <div className={card} />
      <div className={card} />
      <div className="flex flex-col gap-7">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={card} />
        ))}
      </div>
    </div>
  );
}
