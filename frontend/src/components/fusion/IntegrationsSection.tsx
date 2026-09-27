"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useInView, useReducedMotion } from "motion/react";
import { GradientBadge, OutlineButton } from "./Buttons";

// Image hotlinked from the reference site's CDN — replace with our own before launch.
const GLOBE_SRC = "https://framerusercontent.com/images/jLPVBIsLpIQ3tZJZiCCEC1Jz7Ow.png";

// Icons extracted from the reference site's inline SVGs into /public/integrations.
type Icon = { src: string; w: number; h: number };
const TOP: Icon[] = [
  { src: "/integrations/top-01.svg", w: 38, h: 38 },
  { src: "/integrations/top-02.svg", w: 38, h: 38 },
  { src: "/integrations/top-03.svg", w: 38, h: 38 },
  { src: "/integrations/top-04.svg", w: 38, h: 29 },
  { src: "/integrations/top-05.svg", w: 38, h: 27 },
  { src: "/integrations/top-06.svg", w: 38, h: 38 },
  { src: "/integrations/top-07.svg", w: 38, h: 39 },
  { src: "/integrations/top-08.svg", w: 37, h: 36 },
  { src: "/integrations/top-09.svg", w: 37, h: 37 },
  { src: "/integrations/top-10.svg", w: 37, h: 37 },
  { src: "/integrations/top-11.svg", w: 38, h: 38 },
  { src: "/integrations/top-12.svg", w: 38, h: 28 },
  { src: "/integrations/top-13.svg", w: 37, h: 37 },
];
const BOTTOM: Icon[] = [
  { src: "/integrations/bottom-01.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-02.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-03.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-04.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-05.svg", w: 38, h: 39 },
  { src: "/integrations/bottom-06.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-07.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-08.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-09.svg", w: 38, h: 38 },
  { src: "/integrations/bottom-10.svg", w: 37, h: 38 },
];

// Framer Ticker: speed in px/s, copies capped at 100.
const TICKER_SPEED = 50;
const MAX_DUPES = 100;

function Tile({ icon }: { icon: Icon }) {
  return (
    <div className="relative flex aspect-square size-[72px] flex-row items-center justify-center gap-2.5 overflow-hidden rounded-[14px] bg-white/[0.02] p-0 backdrop-blur-[10px] will-change-transform after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-[#ffffff24] after:content-['']">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVGs, no optimisation needed */}
      <img src={icon.src} alt="" width={icon.w} height={icon.h} className="relative flex-none" draggable={false} />
    </div>
  );
}

// Port of Framer's Ticker: one set plus enough copies to cover twice the viewport,
// translated by W = set + set * round(parent / set) at a constant speed, looping forever.
function Ticker({ icons, direction }: { icons: Icon[]; direction: "left" | "right" }) {
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const firstRef = useRef<HTMLLIElement>(null);
  const lastRef = useRef<HTMLLIElement>(null);
  const [size, setSize] = useState<{ parent: number; children: number } | null>(null);
  const inView = useInView(sectionRef);
  const reduced = useReducedMotion();

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!sectionRef.current || !list || !firstRef.current || !lastRef.current) return;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const children = lastRef.current.offsetLeft + lastRef.current.offsetWidth - firstRef.current.offsetLeft + gap;
    setSize({ parent: sectionRef.current.offsetWidth, children });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (sectionRef.current) ro.observe(sectionRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const dupes = size ? Math.min(Math.round((size.parent / size.children) * 2) + 1, MAX_DUPES) : 0;
  const travel = size ? size.children + size.children * Math.round(size.parent / size.children) : 0;
  const toX = (px: number) => (direction === "left" ? `translateX(-${px}px)` : `translateX(${px}px)`);

  const animRef = useRef<Animation | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || reduced || !travel) return;
    const anim = list.animate({ transform: [toX(0), toX(travel)] }, { duration: (travel / TICKER_SPEED) * 1000, iterations: Infinity, easing: "linear" });
    animRef.current = anim;
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toX only depends on direction
  }, [travel, reduced, direction]);

  // Pause while offscreen or when the tab is hidden, as Framer does.
  useEffect(() => {
    const sync = () => {
      const anim = animRef.current;
      if (!anim) return;
      if (inView && !document.hidden) {
        if (anim.playState === "paused") anim.play();
      } else if (anim.playState === "running") anim.pause();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [inView, travel]);

  return (
    <section
      ref={sectionRef}
      className="m-0 flex size-full max-h-full max-w-full list-none place-items-center overflow-hidden p-0"
      style={{ opacity: size ? 1 : 0 }}
    >
      <ul
        ref={listRef}
        className="relative m-0 flex size-full max-h-full max-w-full list-none flex-row place-items-center gap-[50px] p-0 max-fu-desktop:gap-[30px] max-fu-tablet:gap-5"
        style={{ left: direction === "right" && travel ? -travel : undefined, willChange: inView ? "transform" : "auto" }}
      >
        {icons.map((icon, i) => (
          <li key={icon.src} ref={i === 0 ? firstRef : i === icons.length - 1 ? lastRef : undefined} className="shrink-0">
            <Tile icon={icon} />
          </li>
        ))}
        {Array.from({ length: dupes }, (_, d) =>
          icons.map((icon) => (
            <li key={`${d}-${icon.src}`} aria-hidden="true" className="shrink-0">
              <Tile icon={icon} />
            </li>
          )),
        )}
      </ul>
    </section>
  );
}

function TickerRow({ icons, direction }: { icons: Icon[]; direction: "left" | "right" }) {
  return (
    <div className="relative flex h-min w-full flex-none flex-row items-center justify-center gap-2.5 overflow-hidden p-0">
      <div className="absolute top-0 bottom-0 left-0 z-[1] w-[95px] flex-none overflow-hidden bg-[linear-gradient(90deg,#000_0%,#0000_100%)] max-fu-tablet:w-[72px]" />
      <div className="absolute top-0 right-0 bottom-0 z-[1] w-[95px] flex-none overflow-hidden bg-[linear-gradient(270deg,#000_0%,#0000_100%)] max-fu-tablet:w-[69px]" />
      <div className="relative h-[78px] w-px flex-[1_0_0px]">
        <Ticker icons={icons} direction={direction} />
      </div>
    </div>
  );
}

export function IntegrationsSection() {
  const globeRef = useRef<HTMLDivElement>(null);
  const globeInView = useInView(globeRef);

  return (
    <section className="relative flex h-min w-full flex-none flex-row items-start justify-center gap-0 bg-black px-10 py-[100px] max-fu-desktop:px-[30px] max-fu-desktop:py-[60px] max-fu-tablet:mx-auto max-fu-tablet:max-w-[500px] max-fu-tablet:px-4 max-fu-tablet:py-[50px]">
      <div className="relative flex h-min w-px max-w-[1240px] flex-[1_0_0px] flex-col items-center justify-center gap-[60px] max-fu-desktop:max-w-[800px] max-fu-desktop:gap-10 max-fu-tablet:max-w-[500px]">
        {/* Globe: centred behind everything, one full turn every 20s, paused offscreen. */}
        <motion.div
          ref={globeRef}
          className="absolute top-1/2 left-1/2 aspect-square size-[477px] flex-none max-fu-desktop:size-[337px] max-fu-tablet:size-[224px]"
          style={{ x: "-50%", y: "-50%" }}
          animate={globeInView ? { rotate: 360 } : undefined}
          transition={{ duration: 20, ease: "linear", repeat: Infinity, repeatType: "loop", repeatDelay: 0 }}
        >
          <Image
            src={GLOBE_SRC}
            alt="Gradient Circle Image"
            fill
            sizes="(min-width: 1200px) 477px, (min-width: 810px) 337px, 224px"
            className="object-fill"
          />
        </motion.div>

        <div className="relative flex h-min w-full flex-none flex-col items-center justify-start gap-4">
          <GradientBadge>POWERFUL INTEGRATIONS</GradientBadge>
          <h2 className="fu-type relative w-full max-w-[620px] text-center font-display text-[54px] leading-[1em] font-medium break-words text-white max-fu-desktop:text-5xl max-fu-tablet:text-[40px]">
            Seamlessly Integrate
            <br />
            Every App
          </h2>
        </div>

        <div className="relative flex h-min w-full flex-none flex-col items-center justify-center gap-10 overflow-hidden p-0 max-fu-desktop:gap-6 max-fu-tablet:gap-5">
          <TickerRow icons={TOP} direction="right" />
          <TickerRow icons={BOTTOM} direction="left" />
        </div>

        <div className="relative h-auto w-auto flex-none max-fu-tablet:w-full">
          <OutlineButton href="#" className="max-fu-tablet:w-full">
            Explore All
          </OutlineButton>
        </div>
      </div>
    </section>
  );
}
