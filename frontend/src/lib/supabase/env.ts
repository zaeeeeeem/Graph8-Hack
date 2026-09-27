// Public Supabase settings (anon key only — the service-role key must never reach the browser).
// Values come from frontend/.env.local (gitignored); see frontend/.env.example.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const hasSupabaseEnv = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";

/** Workspace shown to a signed-in user who is not a member of any workspace yet (the public demo one). */
export const DEFAULT_WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID ?? "a0000000-0000-4000-8000-000000000001";
