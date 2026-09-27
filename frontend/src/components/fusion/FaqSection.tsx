"use client";

import { useState } from "react";
import { LayoutGroup, motion, type Transition } from "motion/react";
import { GradientBadge, OutlineButton } from "./Buttons";

const SPRING: Transition = { type: "spring", stiffness: 400, damping: 40, mass: 1 };

const FAQS = [
  {
    q: "What is Fusion AI and how does it work?",
    a: "Fluence AI is a powerful platform designed to help businesses integrate, analyze, and automate data workflows using artificial intelligence. It empowers teams to make smarter decisions and drive growth through seamless data management.",
  },
  {
    q: "Which apps can I integrate?",
    a: "Fusion AI supports 50+ integrations, including Slack, HubSpot, Zendesk, Salesforce, Google Workspace, WhatsApp, Zapier, and more.",
  },
  {
    q: "How does Fluence AI automate tasks?",
    a: "Fluence AI uses AI-driven workflows to automate repetitive tasks such as data processing, reporting, and notifications. This helps save time and boosts productivity for your team.",
  },
  {
    q: "Is my data secure with Fluence AI?",
    a: "Absolutely! Fluence AI takes security seriously. We use enterprise-grade encryption to protect your data, ensuring that it's secure at all stages, from integration to processing.",
  },
  {
    q: "What kind of support do you offer?",
    a: "We offer 24/7 support via email for all users, with additional live chat and priority support for Plus and Pro plan subscribers. Our team is always ready to assist with any questions or issues you may have.",
  },
];

// Plus that turns into a minus: the vertical bar rotates 90° onto the horizontal one.
function PlusMinus({ open }: { open: boolean }) {
  const bar = "absolute rounded-[10px] bg-white";
  return (
    <div className="relative z-[1] size-4 flex-none">
      <div className="relative size-full overflow-hidden">
        <motion.div
          className={`${bar} top-[calc(50%-1px)] left-[calc(50%-10px)] h-0.5 w-5`}
          initial={false}
          animate={{ opacity: open ? 1 : 0.7 }}
          transition={SPRING}
        />
        <motion.div
          className={`${bar} top-[calc(50%-10px)] left-[calc(50%-1px)] h-5 w-0.5`}
          initial={false}
          animate={{ opacity: open ? 1 : 0.7, rotate: open ? 90 : 0 }}
          transition={SPRING}
        />
      </div>
    </div>
  );
}

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <motion.div
      layout
      transition={SPRING}
      initial={false}
      animate={open ? "open" : "closed"}
      whileHover="hover"
      onClick={onToggle}
      className={`relative flex h-min w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[16px] p-4 will-change-transform after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-white/10 after:content-[''] ${
        open ? "gap-4" : "gap-0"
      }`}
    >
      <motion.div layout="position" transition={SPRING} className="relative flex h-min w-full flex-none cursor-pointer flex-row items-center justify-start gap-6 select-none">
        <motion.p
          variants={{ closed: { opacity: 0.7 }, hover: { opacity: 1 }, open: { opacity: 1 } }}
          transition={SPRING}
          className="fu-type relative w-px flex-[1_0_0px] font-sans text-lg leading-[28px] font-normal break-words whitespace-pre-wrap text-white max-fu-tablet:text-base max-fu-tablet:leading-[26px]"
        >
          {q}
        </motion.p>
        <PlusMinus open={open} />
      </motion.div>
      {open && (
        <motion.div
          layout="position"
          className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-2.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={SPRING}
        >
          <motion.p
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            transition={SPRING}
            className="fu-type relative w-full flex-none font-sans text-base leading-[26px] font-normal break-words whitespace-pre-wrap text-white select-none"
          >
            {a}
          </motion.p>
        </motion.div>
      )}
    </motion.div>
  );
}

export function FaqSection() {
  // Second question starts open; opening one closes the others, clicking the open one closes it.
  const [open, setOpen] = useState<number | null>(1);

  return (
    <section className="relative flex h-min w-full flex-row items-start justify-center gap-0 bg-black px-10 py-[100px] max-fu-desktop:px-[30px] max-fu-desktop:py-[60px] max-fu-tablet:px-4 max-fu-tablet:py-[50px]">
      <div className="relative flex h-min w-px max-w-[1240px] flex-[1_0_0px] flex-row items-start justify-start gap-[60px] rounded-[16px] max-fu-desktop:max-w-[810px] max-fu-desktop:gap-10 max-fu-tablet:max-w-[500px] max-fu-tablet:flex-col">
        <div className="relative z-[1] flex h-min w-px max-w-[441px] flex-[1_0_0px] flex-col items-start justify-start gap-6 max-fu-desktop:max-w-[291px] max-fu-tablet:w-full max-fu-tablet:max-w-[441px] max-fu-tablet:flex-none max-fu-tablet:gap-5">
          <div className="relative flex h-min w-full flex-none flex-col items-start justify-center gap-3">
            <GradientBadge>FAQ</GradientBadge>
            <h2 className="fu-type relative w-full max-w-[331px] text-left font-display text-[54px] leading-[1em] font-medium break-words whitespace-pre-wrap text-white max-fu-desktop:max-w-none max-fu-desktop:text-5xl max-fu-tablet:max-w-[331px] max-fu-tablet:text-[40px]">
              Frequently asked questions
            </h2>
          </div>
          <div className="relative flex h-min w-full flex-none flex-col items-start justify-center gap-10 overflow-hidden max-fu-tablet:gap-[30px]">
            <div className="relative flex h-min w-full max-w-[335px] flex-none flex-col items-center justify-center gap-0">
              <p className="fu-type relative w-full text-left font-sans text-lg leading-[28px] font-medium break-words whitespace-pre-wrap text-white max-fu-tablet:text-base max-fu-tablet:leading-[26px]">
                Got any Questions?
              </p>
              <p className="fu-type relative w-full text-left font-sans text-base leading-[26px] font-normal break-words whitespace-pre-wrap text-white">
                Let us know! Reach out and our team will get right back to you.
              </p>
            </div>
            <OutlineButton href="#">Contact us</OutlineButton>
          </div>
        </div>

        <div className="relative flex h-min w-px flex-[1_0_0px] flex-row items-start justify-center gap-10 rounded-[16px] max-fu-desktop:flex-col max-fu-tablet:w-full max-fu-tablet:flex-none">
          <div className="relative z-[2] h-auto w-px flex-[1_0_0px] max-fu-desktop:w-full max-fu-desktop:flex-none">
            <LayoutGroup>
              <div className="relative flex h-min w-full flex-col items-start justify-start gap-3 overflow-hidden">
                {FAQS.map((f, i) => (
                  <FaqItem key={f.q} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen((o) => (o === i ? null : i))} />
                ))}
              </div>
            </LayoutGroup>
          </div>
        </div>
      </div>
    </section>
  );
}
