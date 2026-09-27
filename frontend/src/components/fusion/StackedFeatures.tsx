"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useScroll, useSpring, type MotionValue } from "motion/react";
import { GradientBadge } from "./Buttons";

// Images hotlinked from the reference site's CDN — replace with our own before launch.
const SPARK_SRC = "https://framerusercontent.com/images/sVkwweGRCRcQUW2eM3O9WXUNw4w.png";

// Framer "scroll target" transform: spring that follows the scroll-mapped scale.
const SCALE_SPRING = { stiffness: 422, damping: 69, mass: 2.3 };
const SHRUNK_SCALE = 0.6;
const VIEWPORT_THRESHOLD = 0.5;

type Feature = {
  title: string;
  body: string;
  bullets: [string, string, string];
  src: string;
  // Desktop: image on the left instead of the right.
  imageLeft: boolean;
  // Card that scales this one down as it scrolls over, with Framer's offset.
  shrinkBy?: { card: number; offset: number };
  scrollMargin: string;
};

const FEATURES: Feature[] = [
  {
    title: "Instant, One-Command Actions",
    body: "Type an action once—Fusion AI executes it across Slack, WhatsApp, HubSpot, Calendar, and more.",
    bullets: ["Draft & send multi-channel messages", "Create CRM contacts on the fly", "Cancel meetings or raise issues instantly"],
    src: "https://framerusercontent.com/images/EPHvabqNjiltVRxBW66XsQbr7EM.png",
    imageLeft: false,
    shrinkBy: { card: 1, offset: 120 },
    scrollMargin: "",
  },
  {
    title: "No-Code Workflow Builder",
    body: "Design complex, multi-step automations with drag-and-drop ease—no coding required.",
    bullets: ["Visual workflow canvas", "Pre-built action blocks", "Conditional logic & branching"],
    src: "https://framerusercontent.com/images/mCbhinWgzV3irdrGBTPpxtgkbw.png",
    imageLeft: true,
    shrinkBy: { card: 2, offset: 140 },
    scrollMargin: "scroll-mt-[120px]",
  },
  {
    title: "Natural-Language Interaction",
    body: "Chat with your AI agents to run tasks, query data, or generate content—just type what you need.",
    bullets: ["Context-aware Q&A", "Instant task execution", "Follow-up action chaining"],
    src: "https://framerusercontent.com/images/bPEWWHpZ3ggQQtV7HQFpMLoFk4.png",
    imageLeft: false,
    scrollMargin: "scroll-mt-[140px]",
  },
];

function docTop(el: HTMLElement) {
  let top = 0;
  let node: Element | null = el;
  while (node instanceof HTMLElement && node !== document.documentElement) {
    top += node.offsetTop;
    node = node.offsetParent;
  }
  return top;
}

// Port of Framer's onScrollTarget range: scale 1 → 0.6 while the next card's top travels
// from (viewport * threshold + 1 + offset) upward by the next card's own height.
function scaleAt(scrollY: number, target: HTMLElement, offset: number, viewportH: number) {
  const start = Math.max(docTop(target) - 1 - offset - VIEWPORT_THRESHOLD * viewportH, 0);
  const end = Math.max(start + target.clientHeight, 0);
  if (scrollY <= start) return 1;
  if (scrollY >= end) return SHRUNK_SCALE;
  return 1 + ((scrollY - start) / (end - start)) * (SHRUNK_SCALE - 1);
}

// Desktop only: Framer disables the transform effect on tablet and phone.
function useStackScale(cards: React.RefObject<(HTMLDivElement | null)[]>, shrinkBy?: Feature["shrinkBy"]) {
  const raw = useMotionValue(1);
  const scale = useSpring(raw, SCALE_SPRING);
  const { scrollY } = useScroll();

  useEffect(() => {
    if (!shrinkBy) return;
    const desktop = window.matchMedia("(min-width: 1200px)");
    const update = () => {
      const target = cards.current[shrinkBy.card];
      raw.set(desktop.matches && target ? scaleAt(scrollY.get(), target, shrinkBy.offset, window.innerHeight) : 1);
    };
    update();
    const unsub = scrollY.on("change", update);
    desktop.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      unsub();
      desktop.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [cards, shrinkBy, raw, scrollY]);

  return scale;
}

function Bullet({ text }: { text: string }) {
  return (
    <div className="relative flex h-min w-full flex-row items-center justify-start gap-4">
      <div className="relative size-8 flex-none">
        <div className="relative flex size-full flex-row items-center justify-center overflow-hidden rounded-[4px] p-1 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-[#191919] after:content-['']">
          <div className="relative aspect-square size-6 flex-none">
            <Image src={SPARK_SRC} alt="feature card icon" fill sizes="24px" className="rounded-[inherit] object-cover object-center" />
          </div>
        </div>
      </div>
      <p className="fu-type relative w-px flex-[1_0_0px] font-sans text-lg leading-[28px] font-medium break-words whitespace-pre-wrap text-white max-fu-tablet:text-base max-fu-tablet:leading-[26px]">
        {text}
      </p>
    </div>
  );
}

function FeatureCard({ f, scale, setRef }: { f: Feature; scale: MotionValue<number>; setRef: (el: HTMLDivElement | null) => void }) {
  return (
    <motion.div
      ref={setRef}
      className={`sticky top-[100px] z-[1] h-auto w-full flex-none will-change-transform max-fu-desktop:top-20 max-fu-tablet:relative max-fu-tablet:top-auto ${f.scrollMargin}`}
      style={{ scale, transformPerspective: 1200 }}
    >
      <div className="relative flex h-min w-full flex-row items-center justify-center gap-[60px] rounded-[16px] bg-black p-4 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-[#191919] after:content-[''] max-fu-desktop:gap-6 max-fu-desktop:p-6 max-fu-tablet:flex-col">
        <div
          className={`relative flex h-min w-px flex-[1_0_0px] flex-col items-start justify-start gap-8 max-fu-desktop:gap-6 max-fu-desktop:p-0 max-fu-tablet:order-1 max-fu-tablet:w-full max-fu-tablet:flex-none ${
            f.imageLeft ? "order-1 pr-11" : "pl-11"
          }`}
        >
          <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-6 max-fu-desktop:gap-4">
            <h3 className="fu-type relative w-full font-display text-[44px] leading-[1.2em] font-medium break-words whitespace-pre-wrap text-white max-fu-desktop:text-2xl max-fu-desktop:leading-[1.33333em] max-fu-tablet:text-[26px] max-fu-tablet:leading-[1.2em]">
              {f.title}
            </h3>
            <p className="fu-type relative w-full font-sans text-base leading-[26px] font-normal break-words whitespace-pre-wrap text-white opacity-80">
              {f.body}
            </p>
          </div>
          <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-4">
            {f.bullets.map((b) => (
              <Bullet key={b} text={b} />
            ))}
          </div>
        </div>
        <div
          className={`relative flex h-min w-[48%] flex-none flex-row items-center justify-center gap-0 overflow-hidden rounded-[8px] will-change-transform max-fu-desktop:aspect-[1.06883] max-fu-desktop:w-px max-fu-desktop:flex-[1_0_0px] max-fu-tablet:order-0 max-fu-tablet:w-full max-fu-tablet:flex-none ${
            f.imageLeft ? "order-0" : "max-fu-desktop:order-1"
          }`}
        >
          <div
            className={`relative w-px flex-[1_0_0px] overflow-visible select-none ${
              f.imageLeft ? "h-[494px] max-fu-desktop:aspect-[1.0668] max-fu-desktop:h-auto" : "aspect-[1.0668]"
            }`}
          >
            <Image
              src={f.src}
              alt="Image of dashbaord"
              fill
              sizes="(min-width: 1200px) 580px, (min-width: 810px) 364px, 468px"
              className="rounded-[inherit] object-cover object-center"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Hooks per card must be called unconditionally, so the three cards are listed out.
function CardStack() {
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const scales = [
    useStackScale(cards, FEATURES[0].shrinkBy),
    useStackScale(cards, FEATURES[1].shrinkBy),
    useStackScale(cards, FEATURES[2].shrinkBy),
  ];
  return (
    <div className="relative z-[1] flex h-min w-full flex-none flex-col items-start justify-start gap-[100px] max-fu-desktop:gap-[60px] max-fu-tablet:items-center max-fu-tablet:gap-8">
      {FEATURES.map((f, i) => (
        <FeatureCard
          key={f.title}
          f={f}
          scale={scales[i]}
          setRef={(el) => {
            cards.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}

export function StackedFeatures() {
  return (
    <section
      id="feature"
      className="relative flex h-min w-full flex-none flex-row items-start justify-center gap-0 bg-black px-10 py-[100px] max-fu-desktop:px-[30px] max-fu-desktop:py-[60px] max-fu-tablet:px-4 max-fu-tablet:py-[50px]"
    >
      <div className="relative flex h-min w-px max-w-[1240px] flex-[1_0_0px] flex-col items-center justify-center gap-[60px] max-fu-desktop:max-w-[800px] max-fu-desktop:gap-10 max-fu-tablet:max-w-[500px]">
        <div className="relative flex h-min w-full flex-none flex-col items-center justify-start gap-6 max-fu-tablet:gap-5">
          <div className="relative flex h-min w-full flex-none flex-col items-center justify-start gap-4">
            <GradientBadge>AI-Driven Features</GradientBadge>
            <h2 className="fu-type relative w-full max-w-[732px] text-center font-display text-[54px] leading-[1em] font-medium text-white max-fu-desktop:text-5xl max-fu-tablet:text-[40px]">
              Build, scale and manage entire AI workforce
            </h2>
          </div>
          <p className="fu-type relative w-full max-w-[700px] text-center font-sans text-lg leading-[28px] font-normal text-white max-fu-tablet:text-base max-fu-tablet:leading-[26px]">
            Fluence AI helps you tackle data bottlenecks, streamline analysis, and make smarter decisions with ease.
          </p>
        </div>
        <CardStack />
      </div>
    </section>
  );
}
