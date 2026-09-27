"use client";

import { useEffect, useRef, useState } from "react";
import { LiquidGradient } from "./LiquidGradient";
import { SEND_GRADIENT } from "./Buttons";

const PROMPTS = [
  "Generate weekly sales summary report",
  "Create CRM contact from emails",
  "Schedule meetings and send invites automatically",
  "Schedule meetings and send invites automatically",
];
const TYPE_MS = 100;
const DELETE_MS = 20;
const HOLD_MS = 1800;
const TAGS = ["Chat", "Launch Workflow", "Data Analysis"];

// Types a word, holds, deletes it, moves to the next; loops forever.
function useTypewriter(words: string[], enabled: boolean) {
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const word = words[index % words.length];
    let delay = deleting ? DELETE_MS : TYPE_MS;
    if (!deleting && text === word) delay = HOLD_MS;
    const id = setTimeout(() => {
      if (!deleting && text === word) setDeleting(true);
      else if (deleting && text === "") {
        setDeleting(false);
        setIndex((i) => i + 1);
      } else {
        setText(deleting ? word.slice(0, text.length - 1) : word.slice(0, text.length + 1));
      }
    }, delay);
    return () => clearTimeout(id);
  }, [text, index, deleting, words, enabled]);

  return text;
}

const CHIP = "relative flex w-min flex-row items-center justify-center gap-2.5 rounded-[8px] border border-white/[0.08]";
const CHIP_TEXT = "font-sans text-sm leading-[1.5] font-normal whitespace-pre text-white";

export function PromptCard({ onSubmit }: { onSubmit?: (prompt: string) => void }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const showPlaceholder = !focused && value === "";
  const typed = useTypewriter(PROMPTS, showPlaceholder);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = value.trim();
    if (prompt) onSubmit?.(prompt);
  };

  return (
    <div className="relative flex w-[782px] max-w-[782px] flex-col items-center justify-center gap-0 overflow-hidden rounded-[20px] p-1 max-fu-desktop:w-[642px] max-fu-desktop:max-w-[682px]">
      <div className="absolute -inset-2.5 z-0">
        <LiquidGradient className="block size-full" />
      </div>
      <form
        onSubmit={submit}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button")) inputRef.current?.focus();
        }}
        className="relative flex w-full cursor-text flex-col items-start justify-start gap-6 overflow-hidden rounded-[16px] bg-black p-4"
      >
        <div className="relative flex w-full flex-col items-start justify-start gap-6">
          <div className="relative flex w-min flex-row items-start justify-start gap-[8.14px]">
            <div className={`${CHIP} px-3 py-2 backdrop-blur-[2px]`}>
              {/* Placeholder model icon — the reference uses a third-party logo. */}
              <svg viewBox="0 0 21 21" className="size-5 shrink-0 opacity-50" fill="white" aria-hidden="true">
                <path d="M10.5 1.5 12.6 8.4 19.5 10.5 12.6 12.6 10.5 19.5 8.4 12.6 1.5 10.5 8.4 8.4Z" />
              </svg>
              <p className={`w-[81px] ${CHIP_TEXT} whitespace-pre-wrap`}>GPT 5.5</p>
              <svg viewBox="0 0 18 17" className="h-[17px] w-[18px] shrink-0" fill="none" aria-hidden="true">
                <g opacity="0.5">
                  <path
                    d="M14.3782 6.82436L9.28889 11.9136C9.24162 11.961 9.18549 11.9985 9.12371 12.0241C9.06193 12.0497 8.9957 12.0629 8.92882 12.0629C8.86194 12.0629 8.79571 12.0497 8.73393 12.0241C8.67215 11.9985 8.61602 11.961 8.56875 11.9136L3.47947 6.82436C3.38397 6.72886 3.33032 6.59934 3.33032 6.46429C3.33032 6.32924 3.38397 6.19972 3.47947 6.10422C3.57496 6.00873 3.70448 5.95508 3.83953 5.95508C3.97459 5.95508 4.10411 6.00873 4.1996 6.10422L8.92882 10.8341L13.658 6.10422C13.7053 6.05694 13.7615 6.01943 13.8232 5.99384C13.885 5.96825 13.9512 5.95508 14.0181 5.95508C14.085 5.95508 14.1512 5.96825 14.213 5.99384C14.2748 6.01943 14.3309 6.05694 14.3782 6.10422C14.4255 6.15151 14.463 6.20764 14.4886 6.26942C14.5141 6.3312 14.5273 6.39742 14.5273 6.46429C14.5273 6.53116 14.5141 6.59738 14.4886 6.65916C14.463 6.72094 14.4255 6.77707 14.3782 6.82436Z"
                    fill="white"
                  />
                </g>
              </svg>
            </div>
            <div className={`${CHIP} p-2 backdrop-blur-[6px]`}>
              <svg viewBox="0 0 21 21" className="size-[21px] shrink-0 opacity-50" fill="none" aria-hidden="true">
                <g opacity="0.8">
                  <path
                    d="M10.393 1.90863C8.75729 1.90863 7.15835 2.39366 5.79834 3.30239C4.43833 4.21112 3.37833 5.50273 2.75239 7.01389C2.12645 8.52505 1.96267 10.1879 2.28177 11.7921C2.60088 13.3964 3.38853 14.87 4.54512 16.0266C5.70171 17.1831 7.1753 17.9708 8.77954 18.2899C10.3838 18.609 12.0466 18.4452 13.5578 17.8193C15.0689 17.1933 16.3606 16.1333 17.2693 14.7733C18.178 13.4133 18.663 11.8144 18.663 10.1787C18.6605 7.98613 17.7884 5.88407 16.238 4.33367C14.6876 2.78328 12.5855 1.91116 10.393 1.90863ZM17.3907 10.1787C17.3913 10.8241 17.3022 11.4664 17.1259 12.0872H14.0636C14.2587 10.8224 14.2587 9.53508 14.0636 8.27024H17.1259C17.3022 8.89106 17.3913 9.53336 17.3907 10.1787ZM8.32543 13.3595H12.4605C12.0531 14.6943 11.3459 15.9183 10.393 16.9379C9.44037 15.9181 8.73322 14.6942 8.32543 13.3595ZM8.01531 12.0872C7.7969 10.8243 7.7969 9.53319 8.01531 8.27024H12.777C12.9954 9.53319 12.9954 10.8243 12.777 12.0872H8.01531ZM3.39519 10.1787C3.39464 9.53336 3.48375 8.89106 3.65999 8.27024H6.72231C6.52722 9.53508 6.52722 10.8224 6.72231 12.0872H3.65999C3.48375 11.4664 3.39464 10.8241 3.39519 10.1787ZM12.4605 6.99792H8.32543C8.73281 5.6631 9.44 4.4391 10.393 3.41951C11.3455 4.43937 12.0527 5.66328 12.4605 6.99792ZM16.6218 6.99792H13.7893C13.4323 5.68815 12.8306 4.45779 12.016 3.3718C13.0002 3.60824 13.9217 4.0547 14.7172 4.68059C15.5127 5.30647 16.1635 6.09698 16.6249 6.99792H16.6218ZM8.76995 3.3718C7.95535 4.45779 7.35366 5.68815 6.99665 6.99792H4.16097C4.6224 6.09698 5.27319 5.30647 6.06872 4.68059C6.86426 4.0547 7.78572 3.60824 8.76995 3.3718ZM4.16097 13.3595H6.99665C7.35366 14.6693 7.95535 15.8997 8.76995 16.9856C7.78572 16.7492 6.86426 16.3027 6.06872 15.6769C5.27319 15.051 4.6224 14.2605 4.16097 13.3595ZM12.016 16.9856C12.8306 15.8997 13.4323 14.6693 13.7893 13.3595H16.6249C16.1635 14.2605 15.5127 15.051 14.7172 15.6769C13.9217 16.3027 13.0002 16.7492 12.016 16.9856Z"
                    fill="white"
                  />
                </g>
              </svg>
            </div>
          </div>
        </div>

        <div className="relative w-full font-sans text-[17px] leading-[1.2em] font-medium">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Describe what you want the agents to do"
            className="relative z-[1] block w-full bg-transparent p-0 text-white caret-white/75 outline-none"
          />
          {showPlaceholder && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-start text-white/80"
            >
              <span className="whitespace-pre">{typed}</span>
              <span className="relative top-0 left-[3px] animate-fu-blink text-white/75">|</span>
            </span>
          )}
        </div>

        <div className="relative flex w-full flex-row flex-wrap items-center justify-start gap-x-[15.14px] gap-y-[11.14px] rounded-[8.14px]">
          <div className="relative flex w-px flex-1 flex-row flex-wrap items-center justify-start gap-[8.14px]">
            {TAGS.map((tag) => (
              <div key={tag} className={`${CHIP} pointer-events-none px-3 py-2 backdrop-blur-[6px] select-none`}>
                <p className={CHIP_TEXT}>{tag}</p>
              </div>
            ))}
          </div>
          <button type="submit" className="relative flex w-min cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[8px]">
            <div className="absolute inset-0 z-[1] rounded-[8px]" style={{ background: SEND_GRADIENT }} />
            <div className="absolute top-px right-0 left-0 z-[2] h-[13px] rounded-full bg-fu-orange opacity-60 blur-[10px]" />
            <div className="absolute inset-px z-[1] rounded-[8px] bg-black" />
            <div className="relative z-[1] flex w-min flex-row items-center justify-center gap-1 overflow-hidden px-3 py-1.5">
              {/* Placeholder send icon — the reference uses a raster image. */}
              <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" aria-hidden="true">
                <path d="M5 12h12M13 6l6 6-6 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className={CHIP_TEXT}>Send</p>
            </div>
          </button>
        </div>
      </form>
    </div>
  );
}
