"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export interface AuthState {
  /** undefined while the session is being read; null when signed out. */
  user: User | null | undefined;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ user: undefined, signOut: async () => {} });

/** Session for the whole app, kept in sync with Supabase Auth (sign in / out / token refresh). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(hasSupabaseEnv ? undefined : null);

  useEffect(() => {
    if (!hasSupabaseEnv) return;
    const supabase = getSupabase();
    let alive = true;
    // getUser() asks the Auth server, so a revoked or expired session is never trusted.
    supabase.auth.getUser().then(({ data }) => alive && setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    setUser(null);
    router.replace("/");
    router.refresh();
  };

  return <Ctx.Provider value={{ user, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
