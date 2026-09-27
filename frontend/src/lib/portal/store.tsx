"use client";

// Mock data provider. Exposes the same shape the Supabase/TanStack version will:
// { load, data, live }. When the backend is wired, replace the body of PortalDataProvider
// with queries + useWorkspaceRealtime; components keep calling usePortal().
//
// Preview switches (read once from the URL on mount):
//   ?state=loading | error | empty | onboarding   → force a screen state
//   ?simulate=1                                    → replay the "make it move" snippets every 5 s

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { emptySnapshot, onboardingSnapshot, seedSnapshot, type PortalSnapshot } from "./mock";
import { SCENES } from "./simulate";

export type LoadState = "loading" | "ready" | "error";
export type LiveState = "joined" | "connecting";
export type Preview = "live" | "loading" | "error" | "empty" | "onboarding";

export interface PortalStore {
  load: LoadState;
  data: PortalSnapshot | null;
  live: LiveState;
  preview: Preview;
  simulate: boolean;
  lastScene: string | null;
}

const INITIAL: PortalStore = {
  load: "loading",
  data: null,
  live: "connecting",
  preview: "live",
  simulate: false,
  lastScene: null,
};

const Ctx = createContext<PortalStore>(INITIAL);

const PREVIEWS: Preview[] = ["live", "loading", "error", "empty", "onboarding"];

// Every field a snapshot must have. Dev hot-reload keeps the provider's old state across edits to
// mock.ts; if a field was added since, the snapshot is rebuilt instead of crashing a screen.
const SNAPSHOT_KEYS = Object.keys(seedSnapshot(0)) as (keyof PortalSnapshot)[];

function snapshotFor(preview: Preview, now: number): PortalSnapshot {
  return preview === "empty" ? emptySnapshot(now) : preview === "onboarding" ? onboardingSnapshot(now) : seedSnapshot(now);
}
const FIRST_LOAD_MS = 650;
const SCENE_MS = 5000;

export function PortalDataProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<PortalStore>(INITIAL);

  // First load (client only: mock timestamps are relative to "now", so they must not SSR).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("state") as Preview | null;
    const preview: Preview = requested && PREVIEWS.includes(requested) ? requested : "live";
    const simulate = params.get("simulate") === "1";

    const timer = setTimeout(() => {
      if (preview === "loading") return;
      if (preview === "error") {
        setStore((s) => ({ ...s, load: "error", preview, live: "connecting" }));
        return;
      }
      setStore({ load: "ready", data: snapshotFor(preview, Date.now()), live: "joined", preview, simulate, lastScene: null });
    }, FIRST_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  // Outdated snapshot after a hot reload → rebuild it ("adjust state while rendering").
  if (store.data && SNAPSHOT_KEYS.some((k) => store.data![k] === undefined)) {
    setStore((s) => ({ ...s, data: snapshotFor(s.preview, Date.now()) }));
  }

  // Mock realtime loop.
  useEffect(() => {
    if (!store.simulate || store.load !== "ready") return;
    let i = 0;
    const id = setInterval(() => {
      const scene = SCENES[i % SCENES.length];
      i += 1;
      setStore((s) => (s.data ? { ...s, data: scene.run(s.data, Date.now()), lastScene: scene.label } : s));
    }, SCENE_MS);
    return () => clearInterval(id);
  }, [store.simulate, store.load]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export const usePortal = () => useContext(Ctx);
