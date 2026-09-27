"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

let client: SupabaseClient | undefined;

/**
 * One browser client for the whole app. The session (JWT) lives in cookies so the proxy and server
 * routes see it too; every query then runs as the `authenticated` role and RLS scopes rows to the
 * workspaces this user may see.
 */
export function getSupabase(): SupabaseClient {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
