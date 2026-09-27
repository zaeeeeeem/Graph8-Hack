"use client";

import Image from "next/image";
import { motion, type Transition } from "motion/react";
import { GlowButton, OutlineButton } from "./Buttons";
import { Brand } from "./FusionNav";

// Images hotlinked from the reference site's CDN — replace with our own before launch.
const BG_GRADIENT_SRC = "https://framerusercontent.com/images/Be2eOLzV4xVwCVXDiJq8fLpcY3c.png";
const ORB_SRC = "https://framerusercontent.com/images/VNxTg4trlyPkvi55POCdKXQ04kY.png";

const HEADLINE = "Start Your AI Automation Journey Today";
const DESCRIPTION = "Sign up for Fusion AI and let AI handle your routine tasks—no credit card needed.";

const WORD_FROM = { opacity: 0.001, filter: "blur(2px)", y: 10 };
const WORD_TO = { opacity: 1, filter: "blur(0px)", y: 0 };
const REVEAL_EASE: [number, number, number, number] = [0.12, 0.23, 0.5, 1];
const BUTTON_EASE: [number, number, number, number] = [0, 0, 0.58, 1];
const FADE_UP_FROM = { opacity: 0, y: 30 };
const FADE_UP_TO = { opacity: 1, y: 0 };
const IN_VIEW = { once: true, amount: 0.5 } as const;
const LINK_SPRING: Transition = { type: "spring", stiffness: 500, damping: 60, mass: 1 };

const H2 = "fu-type font-display text-[54px] leading-[1em] font-medium text-white max-fu-desktop:text-5xl max-fu-tablet:text-[40px]";
const BODY = "fu-type font-sans text-base leading-[26px] font-normal text-white";

const COLUMNS: { title: string; links: string[] }[] = [
  { title: "Main Page", links: ["Home", "About", "Pricing", "Blogs", "Contact"] },
  { title: "Quick Links", links: ["Integration", "Teams", "Career", "FAQ", "404"] },
  { title: "Others", links: ["Privacy Policy", "Terms & Condition", "Waitlist", "Changelog"] },
];

// Phosphor "regular" icons, viewBox 0 0 256 256.
const SOCIALS: { label: string; href: string; path: string }[] = [
  {
    label: "Instagram",
    href: "https://instagram.com",
    path: "M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160ZM176,24H80A56.06,56.06,0,0,0,24,80v96a56.06,56.06,0,0,0,56,56h96a56.06,56.06,0,0,0,56-56V80A56.06,56.06,0,0,0,176,24Zm40,152a40,40,0,0,1-40,40H80a40,40,0,0,1-40-40V80A40,40,0,0,1,80,40h96a40,40,0,0,1,40,40ZM192,76a12,12,0,1,1-12-12A12,12,0,0,1,192,76Z",
  },
  {
    label: "Facebook",
    href: "https://facebook.com",
    path: "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm8,191.63V152h24a8,8,0,0,0,0-16H136V112a16,16,0,0,1,16-16h16a8,8,0,0,0,0-16H152a32,32,0,0,0-32,32v24H96a8,8,0,0,0,0,16h24v63.63a88,88,0,1,1,16,0Z",
  },
  {
    label: "X",
    href: "https://x.com",
    path: "M214.75,211.71l-62.6-98.38,61.77-67.95a8,8,0,0,0-11.84-10.76L143.24,99.34,102.75,35.71A8,8,0,0,0,96,32H48a8,8,0,0,0-6.75,12.3l62.6,98.37-61.77,68a8,8,0,1,0,11.84,10.76l58.84-64.72,40.49,63.63A8,8,0,0,0,160,224h48a8,8,0,0,0,6.75-12.29ZM164.39,208,62.57,48h29L193.43,208Z",
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com",
    path: "M216,24H40A16,16,0,0,0,24,40V216a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V40A16,16,0,0,0,216,24Zm0,192H40V40H216V216ZM96,112v64a8,8,0,0,1-16,0V112a8,8,0,0,1,16,0Zm88,28v36a8,8,0,0,1-16,0V140a20,20,0,0,0-40,0v36a8,8,0,0,1-16,0V112a8,8,0,0,1,15.79-1.78A36,36,0,0,1,184,140ZM100,84A12,12,0,1,1,88,72,12,12,0,0,1,100,84Z",
  },
];

function FadeUp({ delay, ease, className = "", children }: { delay: number; ease: [number, number, number, number]; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={FADE_UP_FROM}
      whileInView={FADE_UP_TO}
      viewport={IN_VIEW}
      transition={{ delay, duration: 0.6, ease }}
    >
      {children}
    </motion.div>
  );
}

function CTASection() {
  return (
    <section className="relative flex h-min w-full flex-none flex-row items-start justify-center gap-0 overflow-visible px-10 py-[100px] max-fu-desktop:px-[30px] max-fu-desktop:py-[60px] max-fu-tablet:max-w-[500px] max-fu-tablet:px-4 max-fu-tablet:py-[50px]">
      <div className="relative flex h-min w-px max-w-[1240px] flex-1 flex-row items-center justify-center gap-[60px] overflow-visible rounded-[16px] max-fu-desktop:max-w-[810px] max-fu-desktop:gap-10 max-fu-tablet:max-w-[500px] max-fu-tablet:flex-col">
        <div className="relative flex h-min w-px max-w-[725px] flex-1 flex-col items-center justify-start gap-4 overflow-visible max-fu-tablet:w-full max-fu-tablet:flex-none">
          <motion.div
            className="relative aspect-square size-20 flex-none"
            animate={{ rotate: 360 }}
            transition={{ duration: 10, ease: "linear", repeat: Infinity }}
          >
            <Image src={ORB_SRC} alt="circle image" fill sizes="80px" className="object-fill" />
          </motion.div>

          <div className="relative flex h-min w-full flex-none flex-col items-center justify-start gap-8 overflow-visible max-fu-tablet:gap-6">
            <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-6 overflow-visible max-fu-tablet:gap-5">
              <h2 aria-label={HEADLINE} className={`${H2} relative w-full text-center break-words whitespace-pre-wrap max-fu-tablet:hidden`}>
                {HEADLINE.split(" ").map((word, i, words) => (
                  <span key={i} aria-hidden="true">
                    <motion.span
                      className="inline-block"
                      initial={WORD_FROM}
                      whileInView={WORD_TO}
                      viewport={IN_VIEW}
                      transition={{ duration: 0.8, ease: REVEAL_EASE, delay: 0.3 + i * 0.05 }}
                    >
                      {word}
                    </motion.span>
                    {i < words.length - 1 ? " " : null}
                  </span>
                ))}
              </h2>
              <h2 className={`${H2} relative w-full text-center break-words whitespace-pre-wrap fu-tablet:hidden`}>{HEADLINE}</h2>

              <FadeUp delay={0.5} ease={REVEAL_EASE} className="relative w-full flex-none max-fu-tablet:hidden">
                <p className={`${BODY} text-center break-words whitespace-pre-wrap`}>{DESCRIPTION}</p>
              </FadeUp>
              <p className={`${BODY} relative w-full text-center break-words whitespace-pre-wrap fu-tablet:hidden`}>{DESCRIPTION}</p>
            </div>

            <div className="relative flex h-min w-full flex-none flex-col items-center justify-center gap-2.5 overflow-visible">
              <div className="relative flex h-min w-full flex-none flex-row flex-wrap items-center justify-center gap-4 overflow-visible max-fu-tablet:flex-col">
                <FadeUp delay={0.6} ease={BUTTON_EASE} className="relative h-auto w-auto flex-none max-fu-tablet:w-full">
                  <GlowButton href="/office" className="max-fu-tablet:w-full">
                    Get Started - Free
                  </GlowButton>
                </FadeUp>
                <FadeUp delay={0.7} ease={BUTTON_EASE} className="relative h-auto w-auto flex-none max-fu-tablet:w-full">
                  <OutlineButton href="#" className="max-fu-tablet:w-full">
                    View Pricing
                  </OutlineButton>
                </FadeUp>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterLink({ label }: { label: string }) {
  return (
    <motion.a
      href="#"
      initial="rest"
      animate="rest"
      whileHover="hover"
      className="relative flex h-min w-min cursor-pointer flex-row items-center justify-start gap-0 overflow-hidden no-underline"
    >
      <motion.p
        variants={{ rest: { opacity: 0.7 }, hover: { opacity: 1 } }}
        transition={LINK_SPRING}
        className={`${BODY} relative flex-none whitespace-pre`}
      >
        {label}
      </motion.p>
    </motion.a>
  );
}

function SocialIcon({ label, href, path }: { label: string; href: string; path: string }) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      initial="rest"
      animate="rest"
      whileHover="hover"
      className="relative block size-[30px] flex-none cursor-pointer overflow-hidden no-underline"
    >
      <motion.svg
        viewBox="0 0 256 256"
        fill="white"
        aria-hidden="true"
        className="absolute top-[calc(50%-12px)] left-[calc(50%-12px)] size-6"
        variants={{ rest: { opacity: 1 }, hover: { opacity: 0.6 } }}
      >
        <path d={path} />
      </motion.svg>
    </motion.a>
  );
}

function SiteFooter() {
  return (
    <footer className="relative flex h-min w-full flex-none flex-row items-start justify-center gap-0 overflow-visible px-10 pt-[100px] pb-[30px] max-fu-desktop:px-[30px] max-fu-desktop:pt-[60px] max-fu-tablet:px-4 max-fu-tablet:pt-[50px]">
      <div className="relative z-[2] flex h-min w-px max-w-[1240px] flex-1 flex-col items-center justify-center gap-0 overflow-visible max-fu-desktop:max-w-[810px] max-fu-tablet:max-w-[500px]">
        <div className="relative flex h-min w-full flex-none flex-col items-center justify-center gap-0 overflow-hidden rounded-[20px] bg-black max-fu-desktop:rounded-[16px] max-fu-desktop:border max-fu-desktop:border-[#191919]">
          <div className="relative flex h-min w-full flex-none flex-row items-start justify-between overflow-visible px-[30px] pt-[30px] pb-[60px] max-fu-desktop:flex-col max-fu-desktop:justify-start max-fu-desktop:gap-10 max-fu-tablet:px-6 max-fu-tablet:pt-6 max-fu-tablet:pb-10">
            <div className="relative flex h-min w-px max-w-[272px] flex-1 flex-col items-start justify-start gap-4 overflow-visible max-fu-desktop:w-full max-fu-desktop:flex-none">
              <Brand />
              <p className={`${BODY} relative w-full flex-none break-words whitespace-pre-wrap`}>Fusion AI and let AI handle your routine tasks.</p>
            </div>

            <div className="relative flex h-min w-px max-w-[528px] flex-1 flex-row flex-wrap items-start justify-between overflow-visible max-fu-desktop:w-full max-fu-desktop:max-w-none max-fu-desktop:flex-none max-fu-tablet:grid max-fu-tablet:auto-rows-min max-fu-tablet:grid-cols-[repeat(2,minmax(50px,1fr))] max-fu-tablet:justify-center max-fu-tablet:gap-x-10 max-fu-tablet:gap-y-[30px]">
              {COLUMNS.map((col) => (
                <div
                  key={col.title}
                  className="relative flex h-min w-min flex-none flex-col items-start justify-start gap-3 overflow-visible max-fu-tablet:w-full max-fu-tablet:self-start max-fu-tablet:justify-self-start"
                >
                  <p className="fu-type relative flex-none font-sans text-lg leading-[28px] font-medium whitespace-pre text-white opacity-50 max-fu-tablet:text-base max-fu-tablet:leading-[26px]">
                    {col.title}
                  </p>
                  {col.links.map((label) => (
                    <FooterLink key={label} label={label} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex h-min w-full flex-none flex-row items-start justify-between overflow-visible border-t border-white/15 p-[30px] max-fu-tablet:flex-col max-fu-tablet:items-center max-fu-tablet:justify-start max-fu-tablet:gap-5 max-fu-tablet:p-6">
            <p className={`${BODY} relative flex-none whitespace-pre max-fu-tablet:w-full max-fu-tablet:text-center max-fu-tablet:break-words max-fu-tablet:whitespace-pre-wrap`}>
              © 2025  Design &amp; Developed by Amani Design
            </p>
            <div className="relative flex h-min w-min flex-none flex-row items-center justify-start gap-4 overflow-hidden">
              {SOCIALS.map((s) => (
                <SocialIcon key={s.label} {...s} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function CTAFooter() {
  return (
    <div className="relative flex w-full flex-col items-center">
      <div
        className="pointer-events-none absolute right-0 bottom-0 left-0 z-0 aspect-[1.69811] flex-none overflow-visible select-none"
        aria-hidden="true"
      >
        <Image src={BG_GRADIENT_SRC} alt="" fill sizes="100vw" className="object-cover" />
      </div>
      <CTASection />
      <SiteFooter />
    </div>
  );
}
