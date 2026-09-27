"use client";

import Image from "next/image";
import { motion, type Transition } from "motion/react";
import { GlowButton, GradientBadge, OutlineButton } from "./Buttons";
import { PromptCard } from "./PromptCard";

// Hotlinked from the reference site's CDN — replace with our own clip before launch.
const HERO_VIDEO_SRC: string | null = "https://framerusercontent.com/assets/Bax1SXv4b9QI33bMvkicABKnI.mp4";

const HEADLINE_LINES = ["Automate Your AI Workflows", "with AI Agent"];
const HEADLINE = HEADLINE_LINES.join(" ");
const DESCRIPTION =
  "Connect your favorite apps, set triggers and watch AI handle the rest - no coding required. Get up and running in minutes.";

const TEXT_EFFECT_FROM = { opacity: 0.001, filter: "blur(2px)", y: 10 };
const TEXT_EFFECT_TO = { opacity: 1, filter: "blur(0px)", y: 0 };
const TEXT_EASE: [number, number, number, number] = [0, 0, 0.58, 1];
const BUTTON_EASE: [number, number, number, number] = [0.12, 0.23, 0.5, 1];
const CARD_SPRING: Transition = { type: "spring", stiffness: 80, damping: 30, mass: 1 };

function BlurWords({ lines }: { lines: string[] }) {
  let wordIndex = 0;
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} className="block whitespace-nowrap max-fu-desktop:whitespace-normal">
          {line.split(" ").map((word, i, arr) => {
            const delay = 0.2 + wordIndex++ * 0.08;
            return (
              <span key={i}>
                <motion.span
                  className="inline-block"
                  initial={TEXT_EFFECT_FROM}
                  animate={TEXT_EFFECT_TO}
                  transition={{ duration: 0.7, ease: TEXT_EASE, delay }}
                >
                  {word}
                </motion.span>
                {i < arr.length - 1 ? " " : null}
              </span>
            );
          })}
        </span>
      ))}
    </>
  );
}

const H1 = "fu-type font-display text-[62px] leading-[1.1em] font-medium tracking-normal text-white max-fu-desktop:text-[58px] max-fu-tablet:text-[45px]";
const LEDE = "fu-type font-sans text-base leading-[26px] font-normal text-white";

export function FusionHero() {
  return (
    <header className="relative flex h-min w-full flex-none flex-row items-start justify-center gap-0 overflow-hidden bg-black px-10 pt-[140px] pb-10 max-fu-desktop:px-[30px] max-fu-desktop:pt-[130px] max-fu-tablet:px-4 max-fu-tablet:pt-[150px] max-fu-tablet:pb-[50px]">
      <motion.div
        className="absolute top-0 -right-[300px] h-[958px] w-[1437px] flex-none [mask:linear-gradient(#000_80%,#0000_100%)] max-fu-desktop:top-[63px] max-fu-desktop:-right-[379px] max-fu-tablet:-top-[98px] max-fu-tablet:-right-[254px] max-fu-tablet:h-[666px] max-fu-tablet:w-[1020px] max-fu-tablet:opacity-35"
        initial={{ opacity: 0.001 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 1.2, ease: "linear" }}
        aria-hidden="true"
      >
        {HERO_VIDEO_SRC ? (
          <video
            src={HERO_VIDEO_SRC}
            autoPlay
            loop
            muted
            playsInline
            className="block size-full rounded-none bg-transparent object-cover object-center"
          />
        ) : (
          <div className="fu-streaks size-full" />
        )}
      </motion.div>

      <div className="relative z-[3] flex h-min w-px max-w-[1240px] flex-1 flex-col items-start justify-start gap-16 overflow-visible max-fu-desktop:max-w-[810px] max-fu-desktop:gap-16 max-fu-tablet:max-w-[500px] max-fu-tablet:items-center max-fu-tablet:justify-center max-fu-tablet:gap-10">
        <div className="relative z-[1] flex h-min w-full flex-none flex-col items-start justify-start gap-10 max-fu-desktop:max-w-[800px] max-fu-tablet:items-center max-fu-tablet:gap-8">
          <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-6">
            <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-3 max-fu-tablet:max-w-none max-fu-tablet:items-center">
              <GradientBadge>Supercharge Your AI Workflows</GradientBadge>
              <h1 aria-label={HEADLINE} className={`${H1} relative w-full text-left whitespace-pre-wrap break-words max-fu-tablet:hidden`}>
                <BlurWords lines={HEADLINE_LINES} />
              </h1>
              <h1 className={`${H1} relative w-full text-center whitespace-pre-wrap break-words fu-tablet:hidden`}>{HEADLINE}</h1>
            </div>
            <motion.p
              className={`${LEDE} relative w-full max-w-[522px] text-left whitespace-pre-wrap break-words max-fu-tablet:hidden`}
              initial={TEXT_EFFECT_FROM}
              animate={TEXT_EFFECT_TO}
              transition={{ duration: 0.3, ease: TEXT_EASE, delay: 0.7 }}
            >
              {DESCRIPTION}
            </motion.p>
            <p className={`${LEDE} relative w-full text-center whitespace-pre-wrap break-words fu-tablet:hidden`}>{DESCRIPTION}</p>
          </div>

          <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-2.5 max-fu-tablet:items-center">
            <div className="relative flex h-min w-full flex-none flex-row flex-wrap items-center justify-start gap-4 max-fu-tablet:flex-col max-fu-tablet:justify-center">
              <motion.div
                className="relative h-auto w-auto flex-none max-fu-tablet:w-full"
                initial={{ opacity: 0.001, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 0.8, ease: BUTTON_EASE }}
              >
                <GlowButton href="#" className="max-fu-tablet:w-full">
                  Get Started - Free
                </GlowButton>
              </motion.div>
              <motion.div
                className="relative h-auto w-auto flex-none max-fu-tablet:w-full"
                initial={{ opacity: 0.001, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.8, ease: BUTTON_EASE }}
              >
                <OutlineButton href="#" className="max-fu-tablet:w-full">
                  View Pricing
                </OutlineButton>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="relative z-[1] flex h-min w-full flex-none flex-col items-center justify-center gap-0 overflow-hidden pt-[60px] max-fu-tablet:hidden">
          <motion.div
            className="absolute top-0 left-1/2 z-[1] h-auto w-auto flex-none"
            style={{ x: "-50%" }}
            initial={{ opacity: 0.001, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...CARD_SPRING, delay: 0.5 }}
          >
            <PromptCard />
          </motion.div>
          <motion.div
            className="relative flex h-min w-full flex-none flex-row items-center justify-center gap-2.5 overflow-hidden"
            initial={{ opacity: 0.001, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...CARD_SPRING, delay: 0.8 }}
          >
            <div className="relative aspect-[2.08054] h-[538px] w-px flex-1 overflow-hidden rounded-[20px] [mask:linear-gradient(#000_0%,#0000_100%)] max-fu-desktop:h-[361px]">
              <Image
                src="/sidebar.png"
                alt="Autopilot app preview"
                fill
                sizes="(min-width: 1200px) 1240px, 810px"
                className="object-cover object-top-left"
                priority
              />
            </div>
          </motion.div>
        </div>
      </div>

      <motion.div
        className="pointer-events-none absolute top-[calc(63.22%-284px)] right-0 left-0 h-[568px] flex-none overflow-visible"
        initial={{ opacity: 0.001 }}
        animate={{ opacity: 1 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        aria-hidden="true"
      >
        <div className="absolute top-[calc(50%-283.5px)] -right-[150px] -left-[150px] z-0 h-[567px] flex-none blur-[100px] max-fu-desktop:top-auto max-fu-desktop:bottom-[281px] max-fu-desktop:h-[247px] max-fu-tablet:bottom-[195px] max-fu-tablet:h-[219px] max-fu-tablet:blur-[27px]">
          <svg viewBox="-1 -1 1666 567" preserveAspectRatio="none" className="size-full" fill="none">
            <path
              d="M740.674 146C627.874 170.4 260.007 135.833 90.1738 115.5L5.17377 105C-2.4929 190.833 -7.42623 503.7 34.1738 548.5C86.1738 604.5 706.674 505.5 1069.17 411.5C1359.17 336.3 1585.34 442.833 1662.17 505.5C1663.34 408.667 1664.97 147.1 1662.17 115.5C1658.67 76 1465.67 0 1292.67 0C1119.67 0 881.674 115.5 740.674 146Z"
              fill="url(#fuGlowA)"
            />
            <defs>
              <linearGradient id="fuGlowA" x1="69.6738" y1="223" x2="1585.17" y2="209.5" gradientUnits="userSpaceOnUse">
                <stop stopColor="#A22904" />
                <stop offset="0.427885" />
                <stop offset="1" stopColor="#1F77F6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </motion.div>

      <div
        className="pointer-events-none absolute top-[calc(76.9656%-194.5px)] -right-[150px] -left-[150px] z-[1] h-[389px] flex-none blur-[100px] max-fu-desktop:top-auto max-fu-desktop:bottom-[145px] max-fu-desktop:h-[214px] max-fu-desktop:opacity-50 max-fu-tablet:top-[calc(65.3983%-194.5px)] max-fu-tablet:bottom-auto max-fu-tablet:h-[389px] max-fu-tablet:opacity-100"
        aria-hidden="true"
      >
        <svg viewBox="-1 -1 1653 389" preserveAspectRatio="none" className="size-full" fill="none">
          <path
            d="M616.5 101.5C505.7 69.9 159.333 20.6667 0 0V118.5C56.5 155.333 183.6 236.9 240 268.5C310.5 308 848 328 1179 344.5C1443.8 357.7 1602.33 378.333 1648.5 387C1655.17 266.333 1648.1 160.3 1566.5 101.5C1464.5 28 755 141 616.5 101.5Z"
            fill="url(#fuGlowB)"
          />
          <defs>
            <linearGradient id="fuGlowB" x1="0" y1="268.5" x2="1650.41" y2="268.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#DA6D24" />
              <stop offset="0.485577" />
              <stop offset="1" stopColor="#1F77F6" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div
        className="pointer-events-none absolute -right-[634px] bottom-[287px] h-[342px] w-[954px] flex-none rounded-full bg-fu-glow-blue blur-[82px] max-fu-desktop:hidden"
        aria-hidden="true"
      />
    </header>
  );
}
