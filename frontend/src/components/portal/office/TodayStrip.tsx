"use client";

import { int, moneyShort } from "@/lib/portal/format";
import { slackThread } from "@/lib/portal/links";
import { needsYouItems } from "@/lib/portal/selectors";
import type { PortalSnapshot } from "@/lib/portal/mock";
import { BudgetBar, ChangeFlash, CountUp, InlineError, Skeleton } from "../ui/primitives";

const TILE = "relative flex min-w-0 flex-col justify-center gap-1 overflow-hidden rounded-[inherit] px-5 py-3.5";
const NUM = "font-display text-[30px] leading-none text-white";
const LABEL = "text-[13px] text-white/50";

/** The demo's scoreboard: one row of today's numbers from portal_today. */
export function TodayStrip({ data, load }: { data: PortalSnapshot | null; load: "loading" | "ready" | "error" }) {
  if (load === "error") return <InlineError what="today's numbers" />;

  const shell =
    "grid shrink-0 grid-cols-2 divide-white/8 overflow-hidden rounded-[20px] border border-white/10 bg-panel sm:grid-cols-4 lg:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.55fr)_minmax(0,1.05fr)] lg:divide-x";

  if (load === "loading" || !data) {
    return (
      <div className={shell} aria-busy="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={TILE}>
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const t = data.today;
  const needs = needsYouItems(data);
  const needLink = needs[0] ? slackThread(needs[0].slack_channel, needs[0].slack_ts) : null;

  const simple: { key: string; value: number; label: string }[] = [
    { key: "found", value: t.leads_found_today, label: "found" },
    { key: "contacted", value: t.leads_contacted_today, label: "contacted" },
    { key: "replies", value: t.replies_today, label: "replies" },
    { key: "meetings", value: t.meetings_booked_today, label: "meetings" },
  ];

  return (
    <section aria-label="Today" className={shell}>
      {simple.map((s) => (
        <div key={s.key} className={TILE}>
          <ChangeFlash signal={`${s.key}-${s.value}`} className="bg-white/7" />
          <CountUp value={s.value} className={NUM} />
          <span className={LABEL}>{s.label}</span>
        </div>
      ))}

      <div className={TILE}>
        <ChangeFlash signal={`deals-${t.deals_created_today}-${t.deals_value}`} className="bg-st-success/10" />
        <div className="flex items-baseline gap-2">
          <CountUp value={t.deals_created_today} className={NUM} />
          {Number(t.deals_value) > 0 && <span className="font-mono text-sm text-[#5fe0ad]">{moneyShort(t.deals_value)} open</span>}
        </div>
        <span className={LABEL}>deals</span>
      </div>

      <div className={`${TILE} gap-2`}>
        <ChangeFlash signal={`credits-${t.credits_spent_today}`} className="bg-white/5" />
        <div className="flex items-baseline gap-1.5">
          <CountUp value={t.credits_spent_today} className="font-display text-[26px] leading-none text-white" />
          <span className="font-mono text-sm text-white/35">/ {int(t.budget_daily_credits)}</span>
        </div>
        <BudgetBar spent={t.credits_spent_today} budget={t.budget_daily_credits} />
        <span className={LABEL}>credits today</span>
      </div>

      <NeedYouTile count={needs.length} href={needLink} />
    </section>
  );
}

function NeedYouTile({ count, href }: { count: number; href: string | null }) {
  const hot = count > 0;
  const body = (
    <>
      <ChangeFlash signal={`need-${count}`} className={hot ? "bg-st-attention/20" : "bg-white/5"} />
      {hot && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_120%,rgba(255,122,47,0.28),transparent_70%)]"
        />
      )}
      <CountUp value={count} className={`font-display text-[30px] leading-none ${hot ? "text-[#ffa46b]" : "text-white/35"}`} />
      <span className={`text-[13px] ${hot ? "text-[#ffa46b]/80" : "text-white/40"}`}>{hot ? "need you · decide in Slack" : "need you"}</span>
    </>
  );
  if (hot && href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`${TILE} transition-colors hover:bg-st-attention/6`} title="Decide in Slack">
        {body}
      </a>
    );
  }
  return <div className={TILE}>{body}</div>;
}
