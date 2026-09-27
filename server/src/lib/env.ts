/**
 * env — loads repo-root .env.local (then .env) and exposes a typed, validated Env.
 * WORKSPACE_ID is checked lazily: scripts that create workspaces can import this module without it;
 * the server reads it at boot and fails fast.
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AllowlistEntry, Env } from '../contracts';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '../../..');

for (const f of ['.env.local', '.env']) {
  const p = resolve(REPO_ROOT, f);
  if (existsSync(p)) config({ path: p, quiet: true } as any);
}

/** Lower-cased, trimmed email or '' */
export function normEmail(e?: string | null): string {
  return (e ?? '').trim().toLowerCase();
}
/** E.164 compared as digits only ("+92 300-123 4567" -> "923001234567"). */
export function normPhone(p?: string | null): string {
  return (p ?? '').replace(/\D/g, '');
}

/** "Name|email|phone|linkedin;Name2|…" -> entries. Blank parts become undefined. */
export function parseAllowlist(raw?: string): AllowlistEntry[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, email, phone, linkedin] = s.split('|').map((x) => x?.trim() || undefined);
      return {
        name: name ?? 'test contact',
        email: email ? normEmail(email) : undefined,
        phone: phone ? '+' + normPhone(phone) : undefined,
        linkedin: linkedin?.replace(/\/+$/, ''),
      };
    })
    .filter((e) => e.email || e.phone || e.linkedin);
}

function list(raw?: string): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
function bool(raw?: string): boolean {
  return /^(1|true|yes|on)$/i.test((raw ?? '').trim());
}

const REQUIRED = [
  'G8_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function build(src: NodeJS.ProcessEnv): Env {
  const missing = REQUIRED.filter((k) => !src[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')} (repo-root .env.local)`);
  const e = {
    G8_API_KEY: src.G8_API_KEY!,
    G8_BASE_URL: (src.G8_BASE_URL || 'https://be.graph8.com/api/v1').replace(/\/+$/, ''),
    G8_WEBHOOK_SECRET: src.G8_WEBHOOK_SECRET || undefined,
    G8_DEMO_SCHEDULE_ID: src.G8_DEMO_SCHEDULE_ID || undefined,
    GEMINI_API_KEY: src.GEMINI_API_KEY!,
    GEMINI_MODEL: src.GEMINI_MODEL || 'gemini-3.8-flash',
    SLACK_BOT_TOKEN: src.SLACK_BOT_TOKEN ?? '',
    SLACK_APP_TOKEN: src.SLACK_APP_TOKEN ?? '',
    SLACK_SIGNING_SECRET: src.SLACK_SIGNING_SECRET ?? '',
    SLACK_CHANNEL_TEAM: src.SLACK_CHANNEL_TEAM ?? '',
    SLACK_CHANNEL_HQ: src.SLACK_CHANNEL_HQ ?? '',
    SUPABASE_URL: src.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: src.SUPABASE_SERVICE_ROLE_KEY!,
    PUBLIC_URL: src.PUBLIC_URL || undefined,
    PORT: Number(src.PORT) || 8787,
    allowlist: parseAllowlist(src.TEST_ALLOWLIST),
    layersDisabled: list(src.LAYERS_DISABLED),
    SLACK_DISABLED: bool(src.SLACK_DISABLED),
  } as Omit<Env, 'WORKSPACE_ID'> as Env;
  Object.defineProperty(e, 'WORKSPACE_ID', {
    enumerable: true,
    get() {
      const v = src.WORKSPACE_ID;
      if (!v) throw new Error('Missing env: WORKSPACE_ID (run scripts/reset-demo.ts --workspace test to get the test id)');
      return v;
    },
  });
  return e;
}

export const env: Env = build(process.env);
