"use client";

// Live data provider. Loads every snapshot slice from Supabase for the signed-in user's workspace,
// then keeps it fresh (docs/portal/01-data-access.md §4):
//   • Realtime: one channel per workspace, one postgres_changes subscription per published table;
//     a change marks the affected slices and they are refetched (invalidate, don't patch),
//     debounced 250 ms so a burst of writes becomes one refetch.
//   • 15 s poll of every slice, plus a refetch when the tab becomes visible again, so a dropped
//     socket never leaves the screen stale.
// Components read { load, data, live } via usePortal().

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { DEFAULT_WORKSPACE_ID, hasSupabaseEnv } from "@/lib/supabase/env";
import { startOfDayIso } from "./format";
import { FETCH, SLICES, TABLE_TO_SLICES, myWorkspaceIds, type QueryCtx, type SliceKey } from "./queries";
import { buildActivity } from "./selectors";
import type { PortalSnapshot } from "./snapshot";

export type LoadState = "loading" | "ready" | "error";
export type LiveState = "joined" | "connecting";

export interface PortalStore {
  load: LoadState;
  data: PortalSnapshot | null;
  live: LiveState;
  /** Why the first load failed (shown in the inline error). */
  error: string | null;
  /** Refetch every slice now (used by "Retry"). */
  refresh: () => void;
}

const Ctx = createContext<PortalStore>({ load: "loading", data: null, live: "connecting", error: null, refresh: () => {} });

const POLL_MS = 15_000;
const DEBOUNCE_MS = 250;

type Slices = Omit<PortalSnapshot, "activity">;

function withActivity(s: Slices, dayStart: string): PortalSnapshot {
  return { ...s, activity: buildActivity(s, dayStart) };
}

export function PortalDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [load, setLoad] = useState<LoadState>("loading");
  const [data, setData] = useState<PortalSnapshot | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Latest request per slice wins: an older response arriving late never overwrites newer data.
  const seq = useRef<Record<string, number>>({});
  const current = useRef<Slices | null>(null);
  const tz = useRef("Asia/Karachi");

  const ctxFor = useCallback((ws: string): QueryCtx => ({ sb: getSupabase(), ws, dayStart: startOfDayIso(tz.current) }), []);

  /** Refetch some slices and merge whatever succeeded into the snapshot. */
  const refetch = useCallback(
    async (ws: string, keys: SliceKey[]) => {
      if (!current.current) return;
      const ctx = ctxFor(ws);
      const results = await Promise.all(
        keys.map(async (k) => {
          const id = (seq.current[k] = (seq.current[k] ?? 0) + 1);
          try {
            const value = await FETCH[k](ctx);
            return seq.current[k] === id ? ([k, value] as const) : null;
          } catch (e) {
            console.warn(`[portal] refetch ${k} failed:`, (e as Error).message);
            return null;
          }
        }),
      );
      const patch = Object.fromEntries(results.filter((r) => r !== null));
      if (!current.current || Object.keys(patch).length === 0) return;
      const next = { ...current.current, ...patch } as Slices;
      if (patch.workspace) tz.current = next.workspace.timezone || tz.current;
      current.current = next;
      setData(withActivity(next, ctx.dayStart));
    },
    [ctxFor],
  );

  // 1. Resolve the workspace: the user's first membership, else the public demo workspace.
  useEffect(() => {
    if (!user || !hasSupabaseEnv) return; // session loading, signed out or not configured (see `blocked`)
    let alive = true;
    myWorkspaceIds(getSupabase())
      .then((ids) => alive && setWorkspaceId(ids[0] ?? DEFAULT_WORKSPACE_ID))
      .catch(() => alive && setWorkspaceId(DEFAULT_WORKSPACE_ID));
    return () => {
      alive = false;
    };
  }, [user]);

  // 2. First load of every slice (again on Retry).
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    const ctx = ctxFor(workspaceId);
    Promise.all(SLICES.map(async (k) => [k, await FETCH[k](ctx)] as const))
      .then((entries) => {
        if (!alive) return;
        const slices = Object.fromEntries(entries) as unknown as Slices;
        tz.current = slices.workspace.timezone || tz.current;
        // The first load used the default timezone; if the workspace's differs, the next poll corrects the ledger window.
        current.current = slices;
        setData(withActivity(slices, startOfDayIso(tz.current)));
        setError(null);
        setLoad("ready");
      })
      .catch((e: Error) => {
        if (!alive) return;
        const msg = e.message.includes("0 rows") || e.message.includes("multiple (or no) rows")
          ? "This workspace does not exist or you do not have access to it."
          : e.message;
        setError(msg);
        setLoad("error");
      });
    return () => {
      alive = false;
    };
  }, [workspaceId, attempt, ctxFor]);

  // 3. Realtime + poll + refetch on focus, once the first load is in.
  useEffect(() => {
    if (!workspaceId || load !== "ready") return;
    const sb = getSupabase();
    const ws = workspaceId;
    const pending = new Set<SliceKey>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      const keys = [...pending];
      pending.clear();
      if (keys.length) void refetch(ws, keys);
    };
    const mark = (table: string) => {
      TABLE_TO_SLICES[table]?.forEach((k) => pending.add(k));
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    };

    let channel: RealtimeChannel = sb.channel(`ws:${ws}`);
    for (const table of Object.keys(TABLE_TO_SLICES)) {
      const filter = table === "workspaces" ? `id=eq.${ws}` : `workspace_id=eq.${ws}`;
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => mark(table));
    }
    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED" ? "joined" : "connecting");
      // After a reconnect, catch up on anything missed while the socket was down.
      if (status === "SUBSCRIBED") void refetch(ws, SLICES);
    });

    const poll = setInterval(() => void refetch(ws, SLICES), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refetch(ws, SLICES);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      void sb.removeChannel(channel);
      setLive("connecting");
    };
  }, [workspaceId, load, refetch]);

  const refresh = useCallback(() => {
    if (load === "error") {
      setLoad("loading");
      setAttempt((n) => n + 1);
    } else if (workspaceId) void refetch(workspaceId, SLICES);
  }, [load, workspaceId, refetch]);

  // Nothing to load without configuration or a session: report it instead of spinning forever.
  const blocked = !hasSupabaseEnv
    ? "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    : user === null
      ? "You are signed out."
      : null;

  return (
    <Ctx.Provider value={{ load: blocked ? "error" : load, data: blocked ? null : data, live, error: blocked ?? error, refresh }}>{children}</Ctx.Provider>
  );
}

export const usePortal = () => useContext(Ctx);
