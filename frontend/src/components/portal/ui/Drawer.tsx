"use client";

import { AnimatePresence, motion } from "motion/react";
import { Mail, MessageCircle, MessageSquare, Phone, Radio } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { EventChannel } from "@/lib/portal/types";
import { CARD_GLOW } from "./surface";

/** Right-side glass sheet shared by the task and lead drawers. Esc / backdrop close it. */
export function DrawerFrame({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="drawer" className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]" />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="absolute top-3 right-3 bottom-3 flex w-[min(580px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#0c0c0f]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_40px_80px_-30px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
          >
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const GLASS_BOX = `rounded-2xl border border-white/[0.07] bg-white/[0.025] ${CARD_GLOW} shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`;
export const DRAWER_SECTION = "mb-2.5 text-[11px] font-medium tracking-[0.1em] text-white/35 uppercase";

type IconProps = { className?: string; strokeWidth?: number };

/** lucide 1.x ships no brand marks — a neutral "in" glyph in the same stroke style. */
function LinkedInGlyph({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 11v5M8 8v.01M12 16v-5M12 13a2 2 0 0 1 4 0v3" />
    </svg>
  );
}

const CHANNEL_ICON: Record<EventChannel, (p: IconProps) => ReactNode> = {
  email: Mail,
  linkedin: LinkedInGlyph,
  phone: Phone,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  system: Radio,
};

export function ChannelIcon({ channel, className = "size-3.5" }: { channel: EventChannel; className?: string }) {
  const Icon = CHANNEL_ICON[channel] ?? Radio;
  return <Icon className={className} strokeWidth={1.8} />;
}
