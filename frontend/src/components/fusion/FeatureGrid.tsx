"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { GradientBadge } from "./Buttons";

const REVEAL_EASE: [number, number, number, number] = [0.12, 0.23, 0.5, 1];
const CONIC =
  "conic-gradient(from var(--glow-from) at 50% 50%, #0000 320.4deg, #da4e24 334.8deg, #0000 349.2deg)";

type Feature = {
  title: string;
  body: React.ReactNode;
  src: string;
  alt: string;
  // Outer frame width + reveal delay per card.
  itemClass: string;
  delay: number;
  // Oversized rotating glow layer: conic start angle + inset.
  glowFrom: string;
  glowInset: string;
  // Image box aspect/height per breakpoint.
  imageClass: string;
  innerClass: string;
};

// Images hotlinked from the reference site's CDN — replace with our own before launch.
const ROWS: Feature[][] = [
  [
    {
      title: "Seamless Integrations",
      body: "Integrate Slack, HubSpot, Zendesk & more—automate data flow instantly.",
      src: "https://framerusercontent.com/images/sVc2HPffpGxiK2VXYhRbRHcsQ.png",
      alt: "Integrations illustration",
      itemClass: "w-px flex-1 max-fu-tablet:w-full max-fu-tablet:flex-none",
      delay: 0,
      glowFrom: "1deg",
      glowInset: "-inset-x-[109px] -inset-y-[71px]",
      imageClass: "aspect-[1.35494] h-[316px] max-fu-desktop:h-[201px]",
      innerClass: "w-px flex-1",
    },
    {
      title: "Conversational Actions",
      body: "Create records, assign tasks & queue emails with a simple prompt in seconds flat.",
      src: "https://framerusercontent.com/images/0jK0GfWeBSpF6Rta0Z1hJdNCc.png",
      alt: "Conversational actions illustration",
      itemClass: "w-[58%] flex-none max-fu-desktop:self-stretch max-fu-tablet:w-full",
      delay: 0.2,
      glowFrom: "33deg",
      glowInset: "-top-[166px] -right-[90px] -bottom-[158px] -left-[93px]",
      imageClass: "aspect-[1.99074] h-[317px] max-fu-desktop:h-[209px]",
      innerClass: "w-full flex-none max-fu-desktop:h-full max-fu-desktop:w-px max-fu-desktop:flex-1",
    },
  ],
  [
    {
      title: "Visual Workflow Designer",
      body: (
        <>
          Drag &amp; drop AI actions to build workflows visually—
          <br />
          no coding required.
        </>
      ),
      src: "https://framerusercontent.com/images/TlvPA50zhT5k8DxWWkYnT1FShQ.png",
      alt: "Workflow designer illustration",
      itemClass: "w-[65%] flex-none max-fu-desktop:w-[58%] max-fu-desktop:self-stretch max-fu-tablet:w-full",
      delay: 0.4,
      glowFrom: "344deg",
      glowInset: "-top-[166px] -right-[90px] -bottom-[158px] -left-[93px]",
      imageClass: "aspect-[2.23765] h-[317px] max-fu-desktop:h-[187px]",
      innerClass: "w-full flex-none overflow-hidden max-fu-desktop:h-full max-fu-tablet:w-px max-fu-tablet:flex-1",
    },
    {
      title: "Multi‑Channel Automation",
      body: "Trigger email, SMS & chat messages automatically on schedule.",
      src: "https://framerusercontent.com/images/xu3Rm8ZKi6rTLrVdLsojwkBuuRY.png",
      alt: "Multi-channel automation illustration",
      itemClass: "w-px flex-1 max-fu-tablet:w-full max-fu-tablet:flex-none",
      delay: 0.6,
      glowFrom: "90deg",
      glowInset: "-inset-x-[129px] -inset-y-[71px]",
      imageClass: "aspect-[1.10802] h-[316px] max-fu-desktop:h-[247px] max-fu-tablet:aspect-[1.25385] max-fu-tablet:h-[271px]",
      innerClass: "w-px flex-1 overflow-hidden",
    },
  ],
];

function FeatureCard({ f }: { f: Feature }) {
  return (
    <motion.div
      className={`relative flex h-min flex-row items-center justify-center gap-2.5 overflow-hidden rounded-[16px] bg-[#191919] p-px max-fu-tablet:rounded-[12px] ${f.itemClass}`}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ delay: f.delay, duration: 0.6, ease: REVEAL_EASE }}
    >
      <motion.div
        aria-hidden="true"
        className={`absolute z-0 flex-none overflow-hidden ${f.glowInset}`}
        style={{ background: CONIC, ["--glow-from" as string]: f.glowFrom }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, ease: "linear", repeat: Infinity }}
      />
      <div
        className={`relative flex h-min flex-col items-center justify-start gap-[30px] rounded-[16px] bg-black p-2 max-fu-desktop:gap-6 max-fu-tablet:rounded-[12px] ${f.innerClass}`}
      >
        <div
          className={`relative w-full flex-none overflow-hidden rounded-[12px] select-none max-fu-tablet:aspect-[1.48182] max-fu-tablet:h-[229px] ${f.imageClass}`}
        >
          <Image src={f.src} alt={f.alt} fill sizes="(min-width: 1200px) 800px, 100vw" className="rounded-[inherit] object-cover object-center" />
        </div>
        <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-4 px-[22px] pb-[22px] max-fu-desktop:px-4 max-fu-desktop:pb-4">
          <h3 className="fu-type w-full font-display text-2xl leading-[1.33333em] font-medium text-white max-fu-tablet:text-xl">{f.title}</h3>
          <p className="fu-type w-full font-sans text-base leading-[26px] font-normal text-white">{f.body}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function FeatureGrid() {
  return (
    <section className="relative flex h-min w-full flex-none flex-row items-start justify-center gap-0 overflow-hidden bg-black px-10 py-[100px] max-fu-desktop:px-[30px] max-fu-desktop:py-[60px] max-fu-tablet:px-4 max-fu-tablet:py-[50px]">
      <div className="relative flex h-min w-px max-w-[1240px] flex-1 flex-col items-center justify-center gap-[60px] max-fu-desktop:max-w-[800px] max-fu-desktop:gap-10 max-fu-tablet:max-w-[500px]">
        <div className="relative flex h-min w-full flex-none flex-col items-center justify-start gap-6 max-fu-tablet:gap-5">
          <div className="relative flex h-min w-full flex-none flex-col items-center justify-start gap-4">
            <GradientBadge>AI-Driven Features</GradientBadge>
            <h2 className="fu-type relative w-full max-w-[745px] text-center font-display text-[54px] leading-[1em] font-medium text-white max-fu-desktop:text-5xl max-fu-tablet:text-[40px]">
              Build, scale and manage entire AI workforce
            </h2>
          </div>
          <p className="fu-type relative w-full max-w-[700px] text-center font-sans text-lg leading-[28px] font-normal text-white max-fu-tablet:text-base max-fu-tablet:leading-[26px]">
            Fusion AI helps you tackle data bottlenecks, streamline analysis, and make smarter decisions with ease.
          </p>
        </div>

        <div className="relative z-[1] flex h-min w-full flex-none flex-col items-start justify-start gap-6 max-fu-tablet:items-center max-fu-tablet:gap-8">
          {ROWS.map((row, i) => (
            <div
              key={i}
              className="relative flex h-min w-full flex-none flex-row items-start justify-center gap-6 max-fu-desktop:items-stretch max-fu-tablet:flex-col max-fu-tablet:items-start"
            >
              {row.map((f) => (
                <FeatureCard key={f.title} f={f} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
