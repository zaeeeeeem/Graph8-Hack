"use client";

import { motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { GlowButton } from "@/components/fusion/Buttons";
import { slackChannel } from "@/lib/portal/links";
import type { PortalSnapshot } from "@/lib/portal/snapshot";

const GHOST_ROLES = ["Scout", "Researcher", "SDR", "Closer"];

/** Workspace exists but the team is not hired yet (status = onboarding or zero agents). */
export function Onboarding({ data }: { data: PortalSnapshot }) {
  const command = `/hire-sales ${data.workspace.company_domain ?? "yourcompany.com"}`;
  const [copied, setCopied] = useState(false);
  const hq = slackChannel(data.workspace.slack_channel_hq);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: the command is still visible to copy by hand
    }
  };

  return (
    <div className="relative flex h-full min-h-[640px] flex-col items-center justify-center overflow-hidden rounded-[20px] border border-white/10 bg-panel px-6">
      <div aria-hidden="true" className="pointer-events-none absolute top-1/3 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fu-glow-blue/20 blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-[60%] size-[320px] -translate-y-1/2 rounded-full bg-fu-orange/15 blur-[110px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.12, 0.23, 0.5, 1] }}
        className="relative flex max-w-xl flex-col items-center text-center"
      >
        <h1 className="font-display text-4xl leading-tight text-white sm:text-5xl">Your sales team is not hired yet.</h1>
        <p className="mt-4 text-base leading-relaxed text-white/55">
          In Slack, run the command below. Ayesha will read your company, staff the team and post the plan here within a minute.
        </p>

        <div className="mt-8 flex items-center gap-2 rounded-2xl border border-white/12 bg-black/70 py-2 pr-2 pl-5 backdrop-blur">
          <code className="font-mono text-lg text-white">{command}</code>
          <button
            type="button"
            onClick={copy}
            className="flex size-9 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/8 hover:text-white"
            aria-label="Copy command"
            title="Copy"
          >
            {copied ? <Check className="size-4 text-st-success" /> : <Copy className="size-4" />}
          </button>
        </div>

        {hq && (
          <div className="mt-6">
            <GlowButton href={hq} external>
              Open #sales-hq
            </GlowButton>
          </div>
        )}
      </motion.div>

      {/* Ghost org chart: a preview of what will appear */}
      <div aria-hidden="true" className="relative mt-14 flex flex-col items-center gap-6 opacity-60">
        <div className="h-12 w-44 rounded-2xl border border-dashed border-white/15 bg-white/[0.015]" />
        <div className="h-12 w-44 rounded-2xl border border-dashed border-white/15 bg-white/[0.015]" />
        <div className="flex gap-4">
          {GHOST_ROLES.map((r, i) => (
            <motion.div
              key={r}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.35, 0.8, 0.35] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.4 }}
              className="flex h-12 w-32 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.015] text-xs text-white/35"
            >
              {r}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
