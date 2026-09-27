"use client";

import { AnimatePresence, motion } from "motion/react";
import { OctagonPause } from "lucide-react";
import { slackThread } from "@/lib/portal/links";
import { needsYouItems, pauseBannerText, pausedAgent } from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import { openTask } from "@/lib/portal/taskNav";
import { ToneIcon } from "../ui/primitives";
import { UI_ICON } from "@/lib/portal/vocab";
import { LaserBorder, PILL, PillLink } from "../ui/surface";

/**
 * One message as a pill, priority order (docs/portal/02-screens.md): paused agent → needs you → nothing.
 * The needs-you pill carries the landing page's orbiting laser — it's the one thing to act on.
 */
export function GlobalBanner() {
  const { load, data } = usePortal();
  if (load !== "ready" || !data || data.agents.length === 0) return null;

  const paused = pausedAgent(data);
  const items = needsYouItems(data);
  const first = items[0];

  let content: { key: string; node: React.ReactNode } | null = null;

  if (paused) {
    const t = pauseBannerText(paused);
    content = {
      key: `paused-${paused.id}`,
      node: (
        <span className={`${PILL} max-w-full border-st-danger/40`} title={t.rest}>
          <OctagonPause className="size-3.5 shrink-0 text-[#ff7a70]" />
          <span className="truncate">
            <strong className="font-medium text-white">{t.name} is paused</strong>
            <span className="text-white/45"> · {t.reason} · resume in Slack</span>
          </span>
        </span>
      ),
    };
  } else if (first) {
    // The task this ask unblocks (approval → approvals.task_id, or the blocked task itself).
    const taskUuid = first.item_type === "approval" ? data.approvals.find((a) => a.id === first.id)?.task_id : first.id;
    const blockedTask = data.tasks.find((t) => t.id === taskUuid);
    content = {
      key: `needs-${items.length}-${first.id}`,
      node: (
        <LaserBorder radius={18} className="max-w-full" innerClassName="bg-[#0c0c0f]">
          <span className="flex h-[34px] max-w-full items-center gap-2 pr-1 pl-3.5 text-[13px] text-white/75">
            <ToneIcon icon={UI_ICON.needsYou} tone="attention" />
            <button
              type="button"
              onClick={() => blockedTask && openTask(blockedTask.number)}
              className="min-w-0 truncate text-left hover:text-white"
              title={blockedTask ? `Open ${blockedTask.title}` : undefined}
            >
              <strong className="font-medium text-white">
                {items.length} {items.length === 1 ? "thing needs" : "things need"} you
              </strong>
              <span className="text-white/45"> · {first.title}</span>
            </button>
            <PillLink href={slackThread(first.slack_channel, first.slack_ts)}>Decide in Slack</PillLink>
          </span>
        </LaserBorder>
      ),
    };
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      {content && (
        <motion.div
          key={content.key}
          className="min-w-0"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          role="status"
        >
          {content.node}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
