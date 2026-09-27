"use client";

import { motion, type Transition } from "motion/react";

const ROLL: Transition = { type: "spring", stiffness: 240, damping: 40, mass: 1 };
const PRIMARY_GRADIENT =
  "linear-gradient(163deg, rgb(255, 137, 24) 28%, rgb(162, 41, 4) 54%, rgb(0, 0, 0) 68%, rgb(0, 152, 243) 100%)";

// Two stacked copies in a 26px window; hover slides the second one up into view.
function RollText({ children }: { children: string }) {
  return (
    <div className="relative z-[1] flex h-[26px] w-min flex-col items-center justify-start overflow-hidden">
      <motion.div variants={{ rest: { y: 0 }, hover: { y: -26 } }} transition={ROLL} className="flex flex-col items-center">
        <p className="fu-type relative z-[1] font-sans text-base leading-[26px] font-medium whitespace-pre text-white">
          {children}
        </p>
        <motion.p
          variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
          transition={ROLL}
          className="fu-type relative z-[1] font-sans text-base leading-[26px] font-medium whitespace-pre text-white"
        >
          {children}
        </motion.p>
      </motion.div>
    </div>
  );
}

export function GlowButton({
  href,
  children,
  size = "default",
  className = "",
  external = false,
}: {
  href: string;
  children: string;
  size?: "default" | "small";
  className?: string;
  external?: boolean;
}) {
  const small = size === "small";
  const radius = small ? "rounded-[8px]" : "rounded-[12px]";
  return (
    <motion.a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      initial="rest"
      animate="rest"
      whileHover="hover"
      className={`relative flex w-min cursor-pointer flex-row items-center justify-center gap-2 no-underline ${radius} ${small ? "px-3 py-1.5" : "px-5 py-3"} ${className}`}
    >
      <motion.div
        variants={{ rest: { top: -4 }, hover: { top: small ? -6 : -7 } }}
        transition={ROLL}
        className={`absolute right-[9px] left-[9px] z-0 rounded-full blur-[3px] ${small ? "h-[36px]" : "h-[47px]"}`}
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgb(255, 255, 255) 52.88%, rgb(140, 54, 2) 100%)" }}
      />
      <motion.div
        variants={{ rest: { opacity: 0.6 }, hover: { opacity: 0.7 } }}
        transition={ROLL}
        className={`absolute top-px right-0 left-0 z-[2] overflow-visible rounded-full bg-fu-orange blur-[10px] ${small ? "h-[7px]" : "h-[12px]"}`}
      />
      <div className={`absolute inset-0 z-[1] ${radius}`} style={{ background: PRIMARY_GRADIENT }} />
      <div className={`absolute inset-px z-[1] bg-black ${radius}`} />
      <RollText>{children}</RollText>
    </motion.a>
  );
}

export function OutlineButton({ href, children, className = "" }: { href: string; children: string; className?: string }) {
  return (
    <motion.a
      href={href}
      initial="rest"
      animate="rest"
      whileHover="hover"
      className={`relative flex w-min cursor-pointer flex-row items-center justify-center gap-2 rounded-[12px] border border-white/20 px-[42px] py-3 no-underline ${className}`}
    >
      <RollText>{children}</RollText>
    </motion.a>
  );
}

export function GradientBadge({ children }: { children: string }) {
  return (
    <div
      className="relative flex w-min flex-row items-center justify-center gap-2 rounded-[99px] p-px"
      style={{
        background:
          "linear-gradient(90deg, rgb(105, 51, 0) 0%, rgb(128, 30, 0) 32.88%, rgb(0, 0, 0) 54.05%, rgb(0, 105, 166) 100%)",
      }}
    >
      <div className="relative flex w-min flex-row items-center justify-center gap-2.5 rounded-[14px] bg-black px-3 py-1.5">
        <p className="fu-type font-sans text-sm leading-4 font-medium whitespace-pre text-white uppercase">{children}</p>
      </div>
    </div>
  );
}

export const SEND_GRADIENT = PRIMARY_GRADIENT;
