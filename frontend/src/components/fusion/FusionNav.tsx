"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { GlowButton } from "./Buttons";

const LINKS = [
  { label: "About us", href: "#" },
  { label: "Pricing", href: "#" },
  { label: "Integration", href: "#" },
  { label: "Blog", href: "#" },
  { label: "Contact", href: "#" },
  { label: "Waitlist", href: "#" },
];

// Placeholder for the reference's glass-sphere logo image.
export function LogoOrb({ size }: { size: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 30% 28%, #9fd4ff 0%, #1f77f6 22%, #0a1a3a 55%, #000 72%), radial-gradient(circle at 75% 80%, #ff7a2f 0%, transparent 45%)",
        backgroundBlendMode: "screen",
        boxShadow: "inset -3px -4px 8px rgba(255,120,40,.55), inset 2px 3px 6px rgba(160,210,255,.35)",
      }}
    />
  );
}

export function Brand({ phone }: { phone?: boolean }) {
  return (
    <Link href="/" className={`relative flex w-min flex-row items-center justify-start ${phone ? "gap-2" : "gap-3"} no-underline`}>
      <LogoOrb size={phone ? 36 : 40} />
      <p className="font-display text-[22px] leading-none font-medium whitespace-pre text-white capitalize">Graphi</p>
    </Link>
  );
}

function NavLink({ label, href }: { label: string; href: string }) {
  return (
    <motion.a
      href={href}
      initial="rest"
      animate="rest"
      whileHover="hover"
      className="relative flex h-[26px] w-min cursor-pointer flex-row items-center justify-start overflow-hidden no-underline"
    >
      <motion.p
        variants={{ rest: { opacity: 0.7 }, hover: { opacity: 1 } }}
        className="fu-type relative z-[1] font-sans text-base leading-[26px] font-medium whitespace-pre text-white select-none"
      >
        {label}
      </motion.p>
    </motion.a>
  );
}

const NAV_SHELL =
  "relative flex max-w-full flex-row items-center justify-center overflow-hidden rounded-[12px] border border-white/10 bg-black/15";

export function FusionNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-1/2 z-10 flex w-full -translate-x-1/2 flex-row items-center justify-center gap-2.5 overflow-hidden p-7 max-fu-desktop:overflow-visible max-fu-desktop:p-6 max-fu-tablet:flex-col max-fu-tablet:p-4">
      {/* Desktop (>=1200px) */}
      <div className={`${NAV_SHELL} w-[1240px] px-4 py-2.5 backdrop-blur-[10px] max-fu-desktop:hidden`}>
        <div className="relative flex w-px flex-1 flex-row items-center justify-between">
          <Brand />
          <div className="relative z-[1] flex w-min flex-row items-center justify-center gap-6">
            {LINKS.map((l) => (
              <NavLink key={l.label} {...l} />
            ))}
          </div>
          <GlowButton href="/office" size="small">
            Get Started
          </GlowButton>
        </div>
      </div>

      {/* Phone / tablet (<1200px) */}
      <div
        className={`${NAV_SHELL} w-full flex-col justify-start px-4 backdrop-blur-[8px] fu-desktop:hidden ${open ? "pt-2.5 pb-4" : "h-16 py-2.5"}`}
      >
        <div className="relative flex w-full flex-none flex-col items-start justify-start gap-8">
          <div className="relative flex w-full flex-row items-center justify-between">
            <Brand phone />
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="relative order-1 size-11 cursor-pointer overflow-hidden"
            >
              <span
                className={`absolute left-[calc(50%-10px)] h-0.5 w-5 rounded-[10px] bg-[#999] transition-all duration-300 ${open ? "top-[calc(50%-1px)] rotate-45" : "top-[calc(37.5%-1px)]"}`}
              />
              <span
                className={`absolute left-[calc(50%-10px)] h-0.5 w-5 rounded-[10px] bg-[#999] transition-all duration-300 ${open ? "top-[calc(50%-1px)] -rotate-45" : "top-[calc(62.5%-1px)]"}`}
              />
            </button>
          </div>
          {open && (
            <div className="relative z-[1] flex w-full flex-col items-start justify-start gap-4">
              {LINKS.map((l) => (
                <NavLink key={l.label} {...l} />
              ))}
              <GlowButton href="/office" size="small">
                Get Started
              </GlowButton>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
