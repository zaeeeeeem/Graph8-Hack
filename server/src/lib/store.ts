/**
 * store — thin Supabase (service role) wrapper. Everything not wrapped: use `store.db` directly.
 * Budget semantics: spend() always records the ledger row (the credits were already spent), then throws
 * BudgetExceeded if the agent is now at/over its daily budget (the DB trigger has already auto-paused it).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_LLM_TOKENS_PER_CREDIT, DEFAULT_WORKSPACE_SETTINGS } from '../../../shared/types';
import type { AgentRole, AgentRow, UUID, WorkspaceRow, WorkspaceSettings } from '../../../shared/types';
import type { Store } from '../contracts';
import { env } from './env';
import { log as rootLog } from './log';

const log = rootLog.child('store');

export class BudgetExceeded extends Error {
  constructor(public agentId: UUID, public spent: number, public budget: number) {
    super(`Daily budget reached for agent ${agentId}: ${spent}/${budget} credits`);
    this.name = 'BudgetExceeded';
  }
}

export const LLM_TOKENS_PER_CREDIT = Number(process.env.LLM_TOKENS_PER_CREDIT) || DEFAULT_LLM_TOKENS_PER_CREDIT;

const db: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Throw with table + message (never the key) when a Supabase call fails. */
export function must<T>(r: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (r.error) throw new Error(`supabase ${what}: ${r.error.message}${r.error.code ? ` (${r.error.code})` : ''}`);
  return r.data as T;
}

/**
 * Set by the runtime around each agent run: spend() fills run/task ids from it and accumulates LLM tokens,
 * so llm.* calls inside a run are attributed to that run without extra plumbing.
 */
export interface RunScope { runId?: UUID; taskId?: UUID; inputTokens: number; outputTokens: number }
export const runScope = new AsyncLocalStorage<RunScope>();

const agentCache = new Map<string, { id: UUID; name: string; role: AgentRole }>();

export const store: Store & {
  agent(id: UUID): Promise<AgentRow>;
  agents(workspaceId: UUID): Promise<AgentRow[]>;
  ping(): Promise<boolean>;
} = {
  db,

  async workspace(id) {
    return must(await db.from('workspaces').select('*').eq('id', id).single(), `workspace ${id}`) as WorkspaceRow;
  },

  async settings(id) {
    const r = must(await db.from('workspaces').select('settings').eq('id', id).single(), 'settings') as { settings: WorkspaceSettings | null };
    return { ...DEFAULT_WORKSPACE_SETTINGS, ...(r.settings ?? {}) };
  },

  async patchSettings(id, patch) {
    const cur = must(await db.from('workspaces').select('settings').eq('id', id).single(), 'settings') as { settings: WorkspaceSettings | null };
    const next = { ...(cur.settings ?? {}), ...patch };
    must(await db.from('workspaces').update({ settings: next }).eq('id', id), 'patchSettings');
    return { ...DEFAULT_WORKSPACE_SETTINGS, ...next } as WorkspaceSettings;
  },

  async agentByRole(workspaceId, role) {
    const k = `${workspaceId}:${role}`;
    const hit = agentCache.get(k);
    if (hit) return hit;
    const r = must(
      await db.from('agents').select('id,name,role').eq('workspace_id', workspaceId).eq('role', role).order('sort_order').limit(1).maybeSingle(),
      `agentByRole ${role}`,
    ) as { id: UUID; name: string; role: AgentRole } | null;
    if (!r) throw new Error(`No ${role} agent in workspace ${workspaceId}`);
    agentCache.set(k, r);
    return r;
  },

  async agent(id) {
    return must(await db.from('agents').select('*').eq('id', id).single(), `agent ${id}`) as AgentRow;
  },

  async agents(workspaceId) {
    return must(await db.from('agents').select('*').eq('workspace_id', workspaceId).order('sort_order'), 'agents') as AgentRow[];
  },

  async spend(e) {
    const meta = (e.meta ?? {}) as Record<string, any>;
    const credits = Math.ceil(e.credits);
    const scope = runScope.getStore();
    if (scope && e.source === 'llm') {
      scope.inputTokens += Number(meta.input_tokens) || 0;
      scope.outputTokens += Number(meta.output_tokens) || 0;
    }
    const row = {
      workspace_id: e.workspaceId,
      agent_id: e.agentId,
      task_id: e.taskId ?? scope?.taskId ?? null,
      run_id: e.runId ?? scope?.runId ?? null,
      lead_id: typeof meta.lead_id === 'string' ? meta.lead_id : null,
      source: e.source,
      action: e.action,
      credits,
      input_tokens: Number.isFinite(meta.input_tokens) ? meta.input_tokens : null,
      output_tokens: Number.isFinite(meta.output_tokens) ? meta.output_tokens : null,
      g8_request_id: typeof meta.g8_request_id === 'string' ? meta.g8_request_id : null,
      note: typeof meta.note === 'string' ? meta.note.slice(0, 500) : null,
    };
    if (credits !== 0) must(await db.from('credit_events').insert(row), 'credit_events insert');
    const a = must(
      await db.from('agents').select('spent_today_credits,budget_daily_credits,status,pause_reason').eq('id', e.agentId).single(),
      'agent budget',
    ) as Pick<AgentRow, 'spent_today_credits' | 'budget_daily_credits' | 'status' | 'pause_reason'>;
    if (a.spent_today_credits >= a.budget_daily_credits || (a.status === 'paused' && a.pause_reason === 'budget')) {
      log.warn('budget reached', { agentId: e.agentId, spent: a.spent_today_credits, budget: a.budget_daily_credits });
      throw new BudgetExceeded(e.agentId, a.spent_today_credits, a.budget_daily_credits);
    }
  },

  async ping() {
    const r = await db.from('workspaces').select('id', { head: true, count: 'exact' }).limit(1);
    return !r.error;
  },
};
