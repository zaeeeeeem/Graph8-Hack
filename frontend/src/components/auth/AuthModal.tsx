"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, MailCheck, User as UserIcon, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseEnv } from "@/lib/supabase/env";

type Mode = "signin" | "signup";

// --- URL-driven open state: `?auth=signin|signup&next=/office` (the proxy links here too) ---------

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/office";
}

export function openAuth(mode: Mode = "signin", next = "/office") {
  const url = new URL(window.location.href);
  url.searchParams.set("auth", mode);
  url.searchParams.set("next", next);
  url.searchParams.delete("auth_error");
  window.history.pushState(null, "", url);
}

function closeAuth() {
  const url = new URL(window.location.href);
  ["auth", "next", "auth_error"].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, "", url);
}

function setMode(mode: Mode) {
  const url = new URL(window.location.href);
  url.searchParams.set("auth", mode);
  url.searchParams.delete("auth_error");
  window.history.replaceState(null, "", url);
}

/** Mount once on a page (inside Suspense). Renders the modal while `?auth=` is present. */
export function AuthModalHost() {
  const params = useSearchParams();
  const raw = params.get("auth");
  const mode: Mode | null = raw === "signup" ? "signup" : raw === "signin" ? "signin" : null;
  const next = safeNext(params.get("next"));
  const linkError = params.get("auth_error");

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAuth();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mode]);

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          key="auth"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button type="button" aria-label="Close" onClick={closeAuth} className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative w-full max-w-[420px] overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0b0e]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_70%_at_0%_100%,rgba(218,78,36,0.16),transparent_60%),radial-gradient(100%_70%_at_100%_0%,rgba(31,119,246,0.14),transparent_60%)]" />
            <AuthForm key={mode} mode={mode} next={next} linkError={linkError} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Public Auth settings say which providers are switched on in the Supabase dashboard. */
async function googleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return json.external?.google === true;
  } catch {
    return true; // cannot tell: let Supabase answer
  }
}

// --- the form ------------------------------------------------------------------------------------

const FIELD =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-3 pl-10 text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-white/25 focus:bg-white/[0.06]";

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match an account.";
  if (m.includes("email not confirmed")) return "Confirm your email first — we sent you a link.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "Google sign-in is not enabled for this project yet.";
  return message;
}

function AuthForm({ mode, next, linkError }: { mode: Mode; next: string; linkError: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [error, setError] = useState<string | null>(linkError);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const signup = mode === "signup";

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasSupabaseEnv) return setError("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
    setBusy("form");
    setError(null);
    const supabase = getSupabase();
    if (signup) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: callback(), data: name.trim() ? { full_name: name.trim() } : undefined },
      });
      setBusy(null);
      if (error) return setError(friendly(error.message));
      // Supabase returns a user with no identities when the email is already registered.
      if (data.user && data.user.identities?.length === 0) return setError("An account with this email already exists. Sign in instead.");
      if (data.session) return enter();
      return setSentTo(email.trim());
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(null);
    if (error) return setError(friendly(error.message));
    enter();
  };

  const google = async () => {
    if (!hasSupabaseEnv) return setError("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
    setBusy("google");
    setError(null);
    // Without this check a disabled provider sends the user to a raw JSON error page.
    const enabled = await googleEnabled();
    if (!enabled) {
      setBusy(null);
      return setError("Google sign-in is not enabled for this project yet. Use email for now.");
    }
    const { error } = await getSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) {
      setBusy(null);
      setError(friendly(error.message));
    }
    // On success the browser is already navigating to Google.
  };

  const enter = () => {
    router.replace(next);
    router.refresh();
  };

  if (sentTo) {
    return (
      <div className="relative flex flex-col items-center gap-4 px-7 pt-10 pb-8 text-center">
        <CloseButton />
        <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
          <MailCheck className="size-5 text-[#5fe0ad]" />
        </span>
        <h2 id="auth-title" className="text-[22px] font-medium text-white">
          Check your inbox
        </h2>
        <p className="max-w-[30ch] text-[14px] leading-relaxed text-white/55">
          We sent a confirmation link to <span className="text-white/85">{sentTo}</span>. Open it to finish creating your account.
        </p>
        <button type="button" onClick={() => setMode("signin")} className="mt-2 text-[13px] text-white/60 underline-offset-4 hover:text-white hover:underline">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative flex flex-col gap-5 px-7 pt-8 pb-7">
      <CloseButton />
      <div>
        <h2 id="auth-title" className="text-[24px] leading-tight font-medium text-white">
          {signup ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mt-1 text-[14px] text-white/50">{signup ? "Sign up to open your AI sales office." : "Sign in to see your AI sales team at work."}</p>
      </div>

      <button
        type="button"
        onClick={google}
        disabled={busy !== null}
        className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.06] text-[14px] font-medium text-white transition-colors hover:bg-white/[0.1] disabled:opacity-60"
      >
        <GoogleGlyph />
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-[11px] tracking-[0.08em] text-white/30 uppercase">
        <span className="h-px flex-1 bg-white/10" />
        or with email
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="flex flex-col gap-3">
        {signup && (
          <Field icon={<UserIcon className="size-4" />}>
            <input className={FIELD} placeholder="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field icon={<Mail className="size-4" />}>
          <input
            className={FIELD}
            type="email"
            required
            placeholder="Email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field icon={<Lock className="size-4" />}>
          <input
            className={`${FIELD} pr-10`}
            type={show ? "text" : "password"}
            required
            minLength={signup ? 8 : undefined}
            placeholder={signup ? "Password (8+ characters)" : "Password"}
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-white/35 hover:text-white/70"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </Field>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-st-danger/30 bg-st-danger/10 px-3 py-2 text-[13px] text-[#ff9b93]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy !== null}
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-[14px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy === "form" ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
        {busy !== "form" && <ArrowRight className="size-4" />}
      </button>

      <p className="text-center text-[13px] text-white/45">
        {signup ? "Already have an account? " : "New here? "}
        <button type="button" onClick={() => setMode(signup ? "signin" : "signup")} className="text-white/85 underline-offset-4 hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-white/35">{icon}</span>
      {children}
    </label>
  );
}

function CloseButton() {
  return (
    <button
      type="button"
      onClick={closeAuth}
      aria-label="Close (Esc)"
      className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 hover:text-white"
    >
      <X className="size-4" />
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
