/**
 * Personas (chat:write.customize) + a tiny env reader for the Slack layer.
 * `slackEnv` is temporary: W1a's src/lib/env.ts replaces it at merge.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import type { AgentRole } from '../../../shared/types';

let loaded = false;
/** Read an env var, loading repo-root .env.local once. Never log the value. */
export function slackEnv(name: string): string | undefined {
  if (!loaded) {
    config({ path: fileURLToPath(new URL('../../../.env.local', import.meta.url)) });
    loaded = true;
  }
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}
export function requireSlackEnv(name: string): string {
  const v = slackEnv(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export interface Persona {
  role: AgentRole;
  name: string;
  title: string;
  /** Slack display name, e.g. "Ayesha · Head of Sales". */
  username: string;
  icon_emoji: string;
}

export const PERSONAS: Record<AgentRole, Persona> = {
  head_of_sales: { role: 'head_of_sales', name: 'Ayesha', title: 'Head of Sales', username: 'Ayesha · Head of Sales', icon_emoji: ':briefcase:' },
  scout: { role: 'scout', name: 'Bilal', title: 'Scout', username: 'Bilal · Scout', icon_emoji: ':mag:' },
  researcher: { role: 'researcher', name: 'Hira', title: 'Researcher', username: 'Hira · Researcher', icon_emoji: ':books:' },
  sdr: { role: 'sdr', name: 'Usman', title: 'SDR', username: 'Usman · SDR', icon_emoji: ':email:' },
  closer: { role: 'closer', name: 'Zara', title: 'Closer', username: 'Zara · Closer', icon_emoji: ':handshake:' },
};

export function persona(role: AgentRole): Persona {
  return PERSONAS[role];
}

/** Resolve 'team' | 'hq' | raw channel id. */
export function resolveChannel(channel: 'team' | 'hq' | string): string {
  if (channel === 'team') return requireSlackEnv('SLACK_CHANNEL_TEAM');
  if (channel === 'hq') return requireSlackEnv('SLACK_CHANNEL_HQ');
  return channel;
}

export function workspaceId(): string {
  return slackEnv('WORKSPACE_ID') ?? '';
}
