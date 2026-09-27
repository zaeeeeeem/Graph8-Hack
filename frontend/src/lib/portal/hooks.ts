"use client";

import { useSyncExternalStore } from "react";

// --- shared clock for relative times ("3 min ago"), ticks every 15 s -------------

let now = typeof window === "undefined" ? 0 : Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!clockTimer) {
    now = Date.now();
    clockTimer = setInterval(() => {
      now = Date.now();
      clockListeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

export const useNow = () => useSyncExternalStore(subscribeClock, () => now, () => 0);

// --- sidebar collapsed preference (per viewer convenience, localStorage) ---------

const SIDEBAR_KEY = "portal.sidebar.collapsed";
const SIDEBAR_EVENT = "portal-sidebar";

function readCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeSidebar(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(SIDEBAR_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SIDEBAR_EVENT, cb);
  };
}

export function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribeSidebar, readCollapsed, () => false);
  const set = (v: boolean) => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      // storage blocked: preference just won't persist
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  };
  return [collapsed, set];
}

// --- "focus this agent on the canvas" bus (sidebar team list → org chart) -------

const focusListeners = new Set<(agentId: string) => void>();

export function focusAgent(agentId: string) {
  focusListeners.forEach((l) => l(agentId));
}

export function onFocusAgent(cb: (agentId: string) => void) {
  focusListeners.add(cb);
  return () => {
    focusListeners.delete(cb);
  };
}
