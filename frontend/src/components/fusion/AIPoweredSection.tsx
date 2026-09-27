"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useInView, useScroll, useTransform, type Transition } from "motion/react";
import { SEND_GRADIENT } from "./Buttons";

// Images hotlinked from the reference site's CDN — replace with our own before launch.
const ORB_SRC = "https://framerusercontent.com/images/Ud9wQi3KMKw0DpXcfhAMSRvpsQo.png";
// Desktop: sidebar + glow only; the chat is rendered on top in code.
const DASHBOARD_SRC = "https://framerusercontent.com/images/RycTa5cTaVt64GufCiLDvDc1U0.png";
// Tablet/phone: same dashboard with the chat baked into the image.
const DASHBOARD_STATIC_SRC = "https://framerusercontent.com/images/JvSbWQlPTNqa6sLHVMbkbF3gmE.png";
const USER_AVATAR_SRC = "https://framerusercontent.com/images/GuG9ZZ2TfzZoJIEFtSbrTqZgHz4.png";
const SPARK_SRC = "https://framerusercontent.com/images/sVkwweGRCRcQUW2eM3O9WXUNw4w.png";

const POWERED_GRADIENT = "linear-gradient(90deg, rgb(0, 152, 243) 0%, rgb(0, 191, 251) 37.5%, rgb(255, 82, 29) 70%, rgb(159, 78, 0) 100%)";

const MSG_FROM = { opacity: 0.001, y: 30 };
const MSG_TO = { opacity: 1, y: 0 };
const MSG_SPRING: Transition = { type: "spring", stiffness: 500, damping: 60, mass: 0.1 };
const MSG_LAYOUT: Transition = { type: "spring", bounce: 0.2, duration: 0.4 };
const LETTER_STAGGER = 0.03;

type Message = { from: "user" | "ai"; text: string; maxWidth: string; typed: boolean };

const MESSAGES: Message[] = [
  { from: "user", text: "Hey, can you generate a customer follow-up list", maxWidth: "max-w-[52%]", typed: false },
  { from: "ai", text: "Hey Mark - Done—compiled 60 leads and emailed the list to you. Ready for your outreach!", maxWidth: "max-w-[63%]", typed: true },
  { from: "user", text: "That’s awesome, thanks!", maxWidth: "max-w-[30%]", typed: true },
  { from: "ai", text: "Want me to draft a quick template for your outreach?", maxWidth: "max-w-[56%]", typed: true },
  { from: "user", text: "Yes please—that’d be a huge help!", maxWidth: "max-w-[39%]", typed: true },
];
// Delay before each next message appears, once the chat has been scrolled into view.
const STEP_DELAYS_MS = [1000, 4000, 3000, 3000];

const BUBBLE =
  "relative flex w-px flex-[1_0_0px] flex-row items-center justify-start gap-2.5 rounded-[16px] border border-white/[0.08] bg-white/[0.02] px-5 py-2.5 backdrop-blur-[2.5px]";
const TEXT_14 = "font-sans text-sm leading-[1.5] font-normal text-white";
const CHIP = "relative flex w-min flex-row items-center justify-center gap-2.5 rounded-[8px] border border-white/[0.08]";
const TITLE = "fu-type font-display text-[140px] leading-[1em] font-medium whitespace-pre max-fu-desktop:text-[110px] max-fu-tablet:text-[60px]";

// Letters appear one by one (duration 0, 0.03s stagger). Inline spans keep kerning and wrapping intact.
function TypedText({ text, align }: { text: string; align: "left" | "right" }) {
  return (
    <p className={`${TEXT_14} w-full break-words`} style={{ textAlign: align }} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0, delay: i * LETTER_STAGGER }}
        >
          {ch}
        </motion.span>
      ))}
    </p>
  );
}

function ChatMessage({ m }: { m: Message }) {
  const isUser = m.from === "user";
  const align = isUser ? "right" : "left";
  return (
    <motion.div
      layout="position"
      className={`relative flex h-min w-full flex-none flex-row gap-4 ${isUser ? "items-center justify-end" : "items-start justify-start"}`}
      initial={MSG_FROM}
      animate={MSG_TO}
      transition={{ default: MSG_SPRING, layout: MSG_LAYOUT }}
    >
      {!isUser && (
        <div className="relative aspect-square size-[46px] flex-none">
          <Image src={SPARK_SRC} alt="" fill sizes="46px" className="object-fill" />
        </div>
      )}
      <div className={`${BUBBLE} ${m.maxWidth}`}>
        <div className="relative h-auto w-px flex-[1_0_0px]">
          {m.typed ? (
            <TypedText text={m.text} align={align} />
          ) : (
            <p className={`${TEXT_14} break-words whitespace-pre-wrap`} style={{ textAlign: align }}>
              {m.text}
            </p>
          )}
        </div>
      </div>
      {isUser && (
        <div className="relative aspect-square size-[46px] flex-none overflow-visible">
          <Image src={USER_AVATAR_SRC} alt="User avatar" fill sizes="46px" className="object-cover" />
        </div>
      )}
    </motion.div>
  );
}

function ChatInput() {
  return (
    <div className="relative flex h-min w-full max-w-[782px] flex-col items-center justify-center gap-0 overflow-hidden rounded-[20px] p-[3px]">
      <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-6 overflow-hidden rounded-[16px] bg-black p-4">
        <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-6">
          <div className="relative flex h-min w-min flex-none flex-row items-start justify-start gap-[8.14px]">
            <div className={`${CHIP} px-3 py-2 backdrop-blur-[2px]`}>
              <svg viewBox="0 0 21 21" className="size-5 shrink-0 opacity-50" fill="none" aria-hidden="true">
                <path d={MODEL_ICON_PATH} fill="white" />
              </svg>
              <p className={`${TEXT_14} w-[81px] break-words whitespace-pre-wrap`}>GPT 5.5</p>
              <svg viewBox="0 0 18 17" className="h-[17px] w-[18px] shrink-0" fill="none" aria-hidden="true">
                <g opacity="0.5">
                  <path d={CHEVRON_PATH} fill="white" />
                </g>
              </svg>
            </div>
            <div className={`${CHIP} p-2 backdrop-blur-[6px]`}>
              <svg viewBox="0 0 21 21" className="size-[21px] shrink-0 opacity-50" fill="none" aria-hidden="true">
                <g opacity="0.8">
                  <path d={GLOBE_PATH} fill="white" />
                </g>
              </svg>
            </div>
          </div>
        </div>

        <p className={`${TEXT_14} relative h-auto w-auto flex-none whitespace-pre opacity-70`}>Hey, can you generate a customer follow-up list</p>

        <div className="relative flex h-min w-full flex-none flex-row flex-wrap items-center justify-start gap-x-[15.14px] gap-y-[11.14px] rounded-[8.14px]">
          <div className="relative flex h-min w-px flex-[1_0_0px] flex-row flex-wrap items-center justify-start gap-[8.14px]">
            {["Chat", "Launch Workflow", "Data Analysis"].map((tag) => (
              <div key={tag} className={`${CHIP} pointer-events-none px-3 py-2 backdrop-blur-[6px] select-none`}>
                <p className={`${TEXT_14} whitespace-pre`}>{tag}</p>
              </div>
            ))}
          </div>
          <div className="relative flex w-min cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[8px]">
            <div className="absolute inset-0 z-[1] rounded-[8px]" style={{ background: SEND_GRADIENT }} />
            <div className="absolute top-px right-0 left-0 z-[2] h-[13px] rounded-full bg-fu-orange opacity-60 blur-[10px]" />
            <div className="absolute inset-px z-[1] rounded-[8px] bg-black" />
            <div className="relative z-[1] flex w-min flex-row items-center justify-center gap-1 overflow-hidden px-3 py-1.5">
              <div className="relative size-6 flex-none">
                <Image src={SPARK_SRC} alt="" fill sizes="24px" className="object-cover" />
              </div>
              <p className={`${TEXT_14} whitespace-pre`}>Send</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Static first message until the section trigger reaches mid-viewport, then plays the conversation once.
function ChatPanel({ trigger }: { trigger: React.RefObject<HTMLDivElement | null> }) {
  const started = useInView(trigger, { once: true, margin: "0px 0px -50% 0px" });
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (!started || count >= MESSAGES.length) return;
    const id = setTimeout(() => setCount((c) => c + 1), STEP_DELAYS_MS[count - 1]);
    return () => clearTimeout(id);
  }, [started, count]);

  return (
    <div className="absolute right-[94px] bottom-[29px] z-[1] flex h-min w-[700px] flex-none flex-col items-center justify-center gap-[30px] overflow-hidden">
      <div className="relative flex h-min w-full flex-none flex-col items-start justify-start gap-6 overflow-hidden">
        {MESSAGES.slice(0, count).map((m) => (
          <ChatMessage key={m.text} m={m} />
        ))}
      </div>
      <div className="relative h-auto w-full flex-none">
        <ChatInput />
      </div>
    </div>
  );
}

export function AIPoweredSection() {
  const triggerRef = useRef<HTMLDivElement>(null);
  // "Powered" rises 200px → 0 while the trigger (top half of the section) scrolls fully into view.
  const { scrollYProgress } = useScroll({ target: triggerRef, offset: ["start end", "end end"] });
  const poweredY = useTransform(scrollYProgress, [0, 1], [200, 0]);

  return (
    <section className="relative flex h-min w-full flex-none flex-row items-center justify-center gap-2.5 overflow-clip bg-black px-10 py-[100px] max-fu-desktop:px-[30px] max-fu-desktop:py-[60px] max-fu-tablet:flex-col max-fu-tablet:px-4 max-fu-tablet:py-[50px]">
      <div
        ref={triggerRef}
        className="pointer-events-none absolute top-0 right-0 left-0 h-1/2 overflow-clip select-none max-fu-tablet:hidden"
        aria-hidden="true"
      />
      <div className="relative flex h-min w-px max-w-[1240px] flex-[1_0_0px] flex-col items-center justify-center gap-20 overflow-clip max-fu-desktop:max-w-[800px] max-fu-desktop:gap-[60px] max-fu-tablet:w-full max-fu-tablet:max-w-[500px] max-fu-tablet:flex-none max-fu-tablet:gap-10">
        <div className="relative flex h-min w-full flex-none flex-row items-center justify-center gap-[50px] overflow-visible max-fu-desktop:gap-6 max-fu-tablet:flex-col max-fu-tablet:gap-0">
          <div className="relative flex h-min w-min flex-none flex-row items-center justify-start gap-2.5 overflow-visible">
            <motion.div
              className="relative aspect-square size-[120px] flex-none max-fu-desktop:size-[100px] max-fu-tablet:size-14"
              animate={{ rotate: 360 }}
              transition={{ duration: 10, ease: "linear", repeat: Infinity }}
            >
              <Image src={ORB_SRC} alt="Gradient Circle Image" fill sizes="120px" className="object-fill" />
            </motion.div>
            <h2 className={`${TITLE} relative flex-none text-center text-white`}>AI</h2>
          </div>
          <motion.p className={`${TITLE} relative flex-none text-center max-fu-tablet:hidden`} style={{ y: poweredY }}>
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: POWERED_GRADIENT }}>
              Powered
            </span>
          </motion.p>
          <p className={`${TITLE} relative flex-none text-center fu-tablet:hidden`}>
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: POWERED_GRADIENT }}>
              Powered
            </span>
          </p>
        </div>

        <div className="relative flex h-min w-full flex-none flex-col items-center justify-center gap-10 overflow-visible max-fu-desktop:gap-[30px]">
          <div className="relative flex h-min w-full flex-none flex-row items-center justify-center gap-2.5 overflow-hidden rounded-[20px] p-px max-fu-desktop:rounded-[16px] max-fu-tablet:rounded-[6px]">
            <div className="relative flex h-min w-px flex-[1_0_0px] flex-row items-center justify-center gap-2.5 overflow-hidden rounded-[inherit] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-white/[0.19] after:content-['']">
              <div className="relative aspect-[1.41791] w-px flex-[1_0_0px] overflow-hidden max-fu-desktop:hidden">
                <Image
                  src={DASHBOARD_SRC}
                  alt="dashboard imagery"
                  fill
                  sizes="(min-width: 1200px) 1240px, 100vw"
                  className="rounded-[inherit] object-cover object-center"
                />
              </div>
              <div className="relative aspect-[1.41439] w-px flex-[1_0_0px] overflow-visible fu-desktop:hidden">
                <Image
                  src={DASHBOARD_STATIC_SRC}
                  alt="Product dashboard screenshot"
                  fill
                  sizes="(min-width: 810px) 800px, 500px"
                  className="rounded-[inherit] object-cover object-center"
                />
              </div>
            </div>
            <div className="contents max-fu-desktop:hidden">
              <ChatPanel trigger={triggerRef} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const MODEL_ICON_PATH = 
  "M19.9056 9.99454C20.1293 10.4936 20.2713 11.027 20.3293 11.5712C20.3853 12.1154 20.3573 12.666 20.2411 13.2016C20.1272 13.7372 19.9293 14.2512 19.6539 14.7244C19.4733 15.0406 19.2603 15.3375 19.0151 15.6106C18.7721 15.8816 18.501 16.1269 18.2064 16.3419C17.9095 16.557 17.5934 16.7377 17.2578 16.8861C16.9244 17.0324 16.576 17.1442 16.2189 17.2174C16.0511 17.7379 15.8016 18.2305 15.479 18.6736C15.1585 19.1166 14.7692 19.506 14.3261 19.8265C13.883 20.1491 13.3926 20.3986 12.8721 20.5664C12.3515 20.7363 11.8073 20.8202 11.2589 20.8202C10.8953 20.8223 10.5297 20.7836 10.1726 20.7105C9.81773 20.6352 9.46928 20.5212 9.13589 20.3728C8.80249 20.2244 8.48631 20.0394 8.19163 19.8243C7.8991 19.6092 7.62808 19.3619 7.38718 19.0887C6.84945 19.2048 6.29881 19.2328 5.75462 19.1769C5.21043 19.1188 4.677 18.9768 4.17584 18.7531C3.67682 18.5316 3.21437 18.2305 2.80784 17.8627C2.40132 17.4948 2.05502 17.0647 1.78185 16.5915C1.59902 16.2753 1.44845 15.9419 1.33445 15.5956C1.22046 15.2493 1.14517 14.8922 1.10646 14.5287C1.06774 14.1674 1.06989 13.8017 1.10861 13.4382C1.14732 13.0768 1.22691 12.7198 1.34091 12.3735C0.975249 11.9669 0.674119 11.5045 0.450422 11.0055C0.228876 10.5043 0.0847632 9.97303 0.0288389 9.42885C-0.0292363 8.88466 0.000876793 8.33402 0.114876 7.79844C0.228876 7.26286 0.426761 6.74879 0.702081 6.27558C0.882759 5.95939 1.0957 5.66041 1.33876 5.3894C1.58181 5.11838 1.85498 4.87317 2.14966 4.65808C2.44434 4.44299 2.76267 4.26016 3.09607 4.11389C3.43161 3.96548 3.78006 3.85578 4.13712 3.78265C4.30489 3.25997 4.5544 2.76956 4.87489 2.32647C5.19753 1.88338 5.58685 1.49406 6.02994 1.17142C6.47303 0.850929 6.96344 0.601421 7.48397 0.431497C8.0045 0.263725 8.54868 0.177687 9.09717 0.179838C9.46068 0.177687 9.82634 0.214253 10.1834 0.289536C10.5404 0.364818 10.8889 0.476667 11.2223 0.625081C11.5557 0.775647 11.8719 0.958476 12.1665 1.17357C12.4612 1.39081 12.7322 1.63602 12.9731 1.90919C13.5087 1.79519 14.0594 1.76723 14.6036 1.82315C15.1477 1.87907 15.679 2.02319 16.1802 2.24473C16.6792 2.46843 17.1417 2.76741 17.5482 3.13522C17.9547 3.50088 18.301 3.92891 18.5742 4.40427C18.757 4.71831 18.9076 5.0517 19.0216 5.40015C19.1356 5.74645 19.213 6.10351 19.2496 6.46701C19.2883 6.83052 19.2883 7.19618 19.2474 7.55969C19.2087 7.9232 19.1291 8.28025 19.0151 8.62655C19.3829 9.03308 19.6819 9.49338 19.9056 9.99454ZM12.7387 19.1769C13.2076 18.9833 13.6335 18.6972 13.9927 18.338C14.3519 17.9788 14.638 17.5529 14.8316 17.0819C15.0251 16.613 15.1262 16.1096 15.1262 15.602V10.8054C15.1248 10.8011 15.1234 10.7961 15.1219 10.7904C15.1205 10.7861 15.1183 10.7818 15.1155 10.7775C15.1126 10.7732 15.109 10.7696 15.1047 10.7667C15.1004 10.7624 15.0961 10.7596 15.0918 10.7581L13.356 9.75579V15.5504C13.356 15.6085 13.3474 15.6687 13.3324 15.7246C13.3173 15.7827 13.2958 15.8365 13.2657 15.8881C13.2356 15.9397 13.2011 15.987 13.1581 16.0279C13.1163 16.0696 13.0693 16.1057 13.0183 16.1355L8.90789 18.5079C8.87347 18.5294 8.8154 18.5596 8.78528 18.5768C8.95521 18.7209 9.14019 18.8478 9.33377 18.9596C9.52951 19.0715 9.7317 19.1661 9.94249 19.2436C10.1533 19.3188 10.3705 19.3769 10.5899 19.4156C10.8115 19.4543 11.0352 19.4737 11.2589 19.4737C11.7665 19.4737 12.2698 19.3726 12.7387 19.1769ZM2.94981 15.9204C3.20577 16.3613 3.54346 16.7442 3.94569 17.0539C4.35006 17.3636 4.80821 17.5895 5.29862 17.7207C5.78904 17.8519 6.30096 17.8863 6.80428 17.8196C7.30759 17.753 7.79155 17.5895 8.2325 17.3357L12.3881 14.9374L12.3989 14.9266C12.4017 14.9238 12.4039 14.9195 12.4053 14.9137C12.4082 14.9094 12.4103 14.9051 12.4118 14.9008V12.8789L7.39578 15.7806C7.34416 15.8107 7.29039 15.8322 7.23446 15.8494C7.17639 15.8644 7.11831 15.8709 7.05809 15.8709C7.00001 15.8709 6.94194 15.8644 6.88386 15.8494C6.82794 15.8322 6.77201 15.8107 6.72039 15.7806L2.60996 13.4059C2.57339 13.3844 2.51962 13.3521 2.48951 13.3328C2.45079 13.5543 2.43143 13.778 2.43143 14.0017C2.43143 14.2254 2.45294 14.4491 2.49166 14.6707C2.53037 14.8901 2.5906 15.1073 2.66588 15.3181C2.74332 15.5289 2.83796 15.7311 2.94981 15.9247V15.9204ZM1.87004 6.95097C1.61623 7.39191 1.45276 7.87803 1.38608 8.38134C1.3194 8.88466 1.35381 9.39443 1.48502 9.887C1.61623 10.3774 1.84207 10.8356 2.15181 11.2399C2.46154 11.6422 2.84656 11.9799 3.28535 12.2337L7.4388 14.6341C7.4431 14.6355 7.44812 14.637 7.45386 14.6384H7.46891C7.47465 14.6384 7.47967 14.637 7.48397 14.6341C7.48827 14.6327 7.49257 14.6305 7.49688 14.6277L9.23913 13.621L4.22316 10.7259C4.17369 10.6957 4.12636 10.6592 4.08335 10.6183C4.04167 10.5765 4.00552 10.5295 3.9758 10.4785C3.94784 10.4269 3.92418 10.3731 3.90912 10.315C3.89406 10.2591 3.88546 10.201 3.88761 10.1408V5.25604C3.67682 5.33347 3.47248 5.42811 3.2789 5.53996C3.08531 5.65396 2.90248 5.78302 2.73041 5.92713C2.56049 6.07124 2.40132 6.23041 2.2572 6.40249C2.11309 6.57241 1.98619 6.75739 1.87434 6.95097H1.87004ZM16.1372 10.272C16.1888 10.3021 16.2361 10.3365 16.2791 10.3796C16.32 10.4204 16.3566 10.4677 16.3867 10.5194C16.4146 10.571 16.4383 10.6269 16.4534 10.6828C16.4663 10.7409 16.4749 10.799 16.4727 10.8592V15.744C17.1632 15.4902 17.7654 15.0449 18.2107 14.4599C18.6581 13.8748 18.9269 13.1758 18.9893 12.4445C19.0517 11.7131 18.9054 10.9775 18.5656 10.3258C18.2257 9.67406 17.7074 9.13202 17.0707 8.76636L12.9172 6.36592C12.9129 6.36449 12.9079 6.36305 12.9022 6.36162H12.8871C12.8828 6.36305 12.8778 6.36449 12.8721 6.36592C12.8678 6.36735 12.8635 6.3695 12.8591 6.37237L11.1255 7.37471L16.1415 10.272H16.1372ZM17.8687 7.66939H17.8665V7.67154L17.8687 7.66939ZM17.8665 7.66723C17.9913 6.94452 17.9074 6.2003 17.6235 5.52275C17.3417 4.84521 16.8706 4.26231 16.2684 3.84073C15.6661 3.42129 14.9563 3.18039 14.2228 3.14812C13.4872 3.11801 12.7602 3.29654 12.1235 3.6622L7.97008 6.06049C7.96578 6.06336 7.96219 6.06694 7.95933 6.07124L7.95072 6.08415C7.94929 6.08845 7.94785 6.09347 7.94642 6.09921C7.94499 6.10351 7.94427 6.10853 7.94427 6.11426V8.11893L12.9602 5.22162C13.0119 5.19151 13.0678 5.17 13.1237 5.15279C13.1818 5.13774 13.2399 5.13128 13.2979 5.13128C13.3582 5.13128 13.4162 5.13774 13.4743 5.15279C13.5302 5.17 13.584 5.19151 13.6356 5.22162L17.7461 7.59625C17.7826 7.61776 17.8364 7.64788 17.8665 7.66723ZM6.99786 5.44747C6.99786 5.3894 7.00646 5.33132 7.02152 5.27325C7.03658 5.21732 7.05809 5.1614 7.0882 5.10978C7.11831 5.0603 7.15273 5.01298 7.19575 4.96996C7.23661 4.9291 7.28393 4.89253 7.33556 4.86457L11.446 2.49209C11.4847 2.46843 11.5385 2.43832 11.5686 2.42326C11.005 1.95221 10.3167 1.65108 9.58758 1.55859C8.85842 1.46394 8.1185 1.5801 7.45386 1.89198C6.78707 2.20387 6.22352 2.70073 5.8299 3.3202C5.43628 3.94182 5.22764 4.66023 5.22764 5.39585V10.1924C5.22908 10.1982 5.23051 10.2032 5.23194 10.2075C5.23338 10.2118 5.23553 10.2161 5.2384 10.2204C5.24126 10.2247 5.24485 10.229 5.24915 10.2333C5.25202 10.2362 5.25632 10.239 5.26206 10.2419L6.99786 11.2442V5.44747ZM7.93997 11.7863L10.1748 13.0768L12.4096 11.7863V9.2073L10.1769 7.91674L7.94212 9.2073L7.93997 11.7863Z";
const CHEVRON_PATH =
  "M14.3782 6.82436L9.28889 11.9136C9.24162 11.961 9.18549 11.9985 9.12371 12.0241C9.06193 12.0497 8.9957 12.0629 8.92882 12.0629C8.86194 12.0629 8.79571 12.0497 8.73393 12.0241C8.67215 11.9985 8.61602 11.961 8.56875 11.9136L3.47947 6.82436C3.38397 6.72886 3.33032 6.59934 3.33032 6.46429C3.33032 6.32924 3.38397 6.19972 3.47947 6.10422C3.57496 6.00873 3.70448 5.95508 3.83953 5.95508C3.97459 5.95508 4.10411 6.00873 4.1996 6.10422L8.92882 10.8341L13.658 6.10422C13.7053 6.05694 13.7615 6.01943 13.8232 5.99384C13.885 5.96825 13.9512 5.95508 14.0181 5.95508C14.085 5.95508 14.1512 5.96825 14.213 5.99384C14.2748 6.01943 14.3309 6.05694 14.3782 6.10422C14.4255 6.15151 14.463 6.20764 14.4886 6.26942C14.5141 6.3312 14.5273 6.39742 14.5273 6.46429C14.5273 6.53116 14.5141 6.59738 14.4886 6.65916C14.463 6.72094 14.4255 6.77707 14.3782 6.82436Z";
const GLOBE_PATH =
  "M10.393 1.90863C8.75729 1.90863 7.15835 2.39366 5.79834 3.30239C4.43833 4.21112 3.37833 5.50273 2.75239 7.01389C2.12645 8.52505 1.96267 10.1879 2.28177 11.7921C2.60088 13.3964 3.38853 14.87 4.54512 16.0266C5.70171 17.1831 7.1753 17.9708 8.77954 18.2899C10.3838 18.609 12.0466 18.4452 13.5578 17.8193C15.0689 17.1933 16.3606 16.1333 17.2693 14.7733C18.178 13.4133 18.663 11.8144 18.663 10.1787C18.6605 7.98613 17.7884 5.88407 16.238 4.33367C14.6876 2.78328 12.5855 1.91116 10.393 1.90863ZM17.3907 10.1787C17.3913 10.8241 17.3022 11.4664 17.1259 12.0872H14.0636C14.2587 10.8224 14.2587 9.53508 14.0636 8.27024H17.1259C17.3022 8.89106 17.3913 9.53336 17.3907 10.1787ZM8.32543 13.3595H12.4605C12.0531 14.6943 11.3459 15.9183 10.393 16.9379C9.44037 15.9181 8.73322 14.6942 8.32543 13.3595ZM8.01531 12.0872C7.7969 10.8243 7.7969 9.53319 8.01531 8.27024H12.777C12.9954 9.53319 12.9954 10.8243 12.777 12.0872H8.01531ZM3.39519 10.1787C3.39464 9.53336 3.48375 8.89106 3.65999 8.27024H6.72231C6.52722 9.53508 6.52722 10.8224 6.72231 12.0872H3.65999C3.48375 11.4664 3.39464 10.8241 3.39519 10.1787ZM12.4605 6.99792H8.32543C8.73281 5.6631 9.44 4.4391 10.393 3.41951C11.3455 4.43937 12.0527 5.66328 12.4605 6.99792ZM16.6218 6.99792H13.7893C13.4323 5.68815 12.8306 4.45779 12.016 3.3718C13.0002 3.60824 13.9217 4.0547 14.7172 4.68059C15.5127 5.30647 16.1635 6.09698 16.6249 6.99792H16.6218ZM8.76995 3.3718C7.95535 4.45779 7.35366 5.68815 6.99665 6.99792H4.16097C4.6224 6.09698 5.27319 5.30647 6.06872 4.68059C6.86426 4.0547 7.78572 3.60824 8.76995 3.3718ZM4.16097 13.3595H6.99665C7.35366 14.6693 7.95535 15.8997 8.76995 16.9856C7.78572 16.7492 6.86426 16.3027 6.06872 15.6769C5.27319 15.051 4.6224 14.2605 4.16097 13.3595ZM12.016 16.9856C12.8306 15.8997 13.4323 14.6693 13.7893 13.3595H16.6249C16.1635 14.2605 15.5127 15.051 14.7172 15.6769C13.9217 16.3027 13.0002 16.7492 12.016 16.9856Z";
