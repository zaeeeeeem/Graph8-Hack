/**
 * LinkedIn live sends via graph8 WORKFLOWS (Netrion). graph8 rejects LinkedIn step types on POST /sequences (V-L1),
 * but workflow nodes `send_netrion_connection_request` / `send_netrion_message` queue a real, paced send from the
 * org's connected seat. Verified live 2026-09-27 (docs/verify/linkedin-send.md):
 *
 *  - GET  /workflows/integrations/linkedin/senders → {senders:[{sender_account_id:"1", account_id:"la_…", display_name, status:"OK"}]}
 *    sender_account_id is used VERBATIM (never the la_… id — strict mode fails the send).
 *  - POST /workflows/validate {config} → {valid, errors, warnings, missing_references}
 *  - POST /workflows {name, description, category, enabled, config} → created action; GET /workflows → {actions, total_count}
 *  - trigger node `trigger_type:"tool_call"` + input_schema → per-run inputs as ${trigger.linkedin_url} / ${trigger.text}
 *  - POST /workflows/{action_id}/execute {input_data} → {execution_id, status}; GET /workflows/executions/{id} → status + node output
 *    (queue_id | skipped + skip_reason | error).
 *
 * ONE reusable workflow per action ("Graphi LinkedIn connect" / "Graphi LinkedIn message"), found by name or created once.
 *
 * GUARD (code, not prompts): the only profile URL ever sent is an allowlisted test contact's (TEST_ALLOWLIST field 4)
 * whose name is in LINKEDIN_SEND_NAMES. Anything else throws NotAllowlisted before any network call.
 * No PII in logs: URLs are never logged; results carry names only.
 */
import { NotAllowlisted } from '../contracts';
import type { AllowlistEntry } from '../contracts';
import { env, linkedinNames } from './env';
import { g8, unwrap } from './g8';
import { log as rootLog } from './log';

const log = rootLog.child('linkedin-send');

export type LiKind = 'connect' | 'message';
export const WORKFLOW_NAMES: Record<LiKind, string> = { connect: 'Graphi LinkedIn connect', message: 'Graphi LinkedIn message' };
export const CONNECT_NOTE_MAX = 300;
export const MESSAGE_MAX = 1_900;

export const normUrl = (u?: string | null) =>
  (u ?? '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const first = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/https?:\/\/\S*linkedin\S*/gi, '[profile]').slice(0, 200);

// ------------------------------------------------------------------------------------------------ guard
export interface LiTarget { name: string; url: string; connected: boolean }

/** Live LinkedIn sends are on when at least one allowlisted name is in LINKEDIN_SEND_NAMES and the layer isn't disabled. */
export function liveSendsOn(): boolean {
  return !env.layersDisabled.includes('linkedin') && sendableEntries().length > 0;
}

function sendableEntries(allow: AllowlistEntry[] = env.allowlist): AllowlistEntry[] {
  const names = linkedinNames.send().map(first);
  if (!names.length) return [];
  return allow.filter((a) => a.linkedin && names.includes(first(a.name)));
}

function toTarget(a: AllowlistEntry): LiTarget {
  return { name: a.name, url: a.linkedin!, connected: linkedinNames.connected().map(first).includes(first(a.name)) };
}

/**
 * The allowlisted, send-enabled target for a lead, matched by LinkedIn URL or email (never by name alone).
 * The URL returned is ALWAYS the allowlist's own, never the lead's.
 */
export function sendTargetFor(m: { linkedin?: string | null; email?: string | null }): LiTarget | undefined {
  const li = normUrl(m.linkedin);
  const em = (m.email ?? '').trim().toLowerCase();
  const hit = sendableEntries().find((a) => (li && normUrl(a.linkedin) === li) || (em && a.email === em));
  return hit ? toTarget(hit) : undefined;
}

/** Throws NotAllowlisted unless `url` is a send-enabled allowlisted profile. */
export function assertSendable(url: string): LiTarget {
  const hit = sendableEntries().find((a) => normUrl(a.linkedin) === normUrl(url));
  if (!hit || !normUrl(url)) throw new NotAllowlisted('linkedin: target is not a send-enabled test contact (TEST_ALLOWLIST + LINKEDIN_SEND_NAMES)');
  return toTarget(hit);
}

export function targetByName(name: string): LiTarget | undefined {
  const hit = sendableEntries().find((a) => first(a.name) === first(name));
  return hit ? toTarget(hit) : undefined;
}

// ------------------------------------------------------------------------------------------------ sender + workflows
export interface Sender { id: string; name: string }
let senderCache: Sender | undefined;

export async function resolveSender(): Promise<Sender> {
  if (senderCache) return senderCache;
  const r = unwrap<any>(await g8.get('/workflows/integrations/linkedin/senders'));
  const senders: any[] = Array.isArray(r?.senders) ? r.senders : [];
  const ok = senders.find((s) => String(s?.status ?? '').toUpperCase() === 'OK' && s?.sender_account_id != null);
  if (!ok) throw new Error(`no LinkedIn sender seat with status OK (${senders.length} seat(s))`);
  senderCache = { id: String(ok.sender_account_id), name: String(ok.display_name ?? 'LinkedIn seat') };
  return senderCache;
}

const TRIGGER_ID = 'trigger-9a7f0c11';
const NODE_ID: Record<LiKind, string> = { connect: 'send_netrion_connection_request-4c2e8b10', message: 'send_netrion_message-6d3f9a21' };

export function workflowConfig(kind: LiKind, senderId: string): Record<string, unknown> {
  const node = NODE_ID[kind];
  const nodeConfig = kind === 'connect'
    ? { sender_account_id: senderId, connection_message: '${trigger.text}', linkedin_url: '${trigger.linkedin_url}', input_mappings: [] }
    : { sender_account_id: senderId, message: '${trigger.text}', linkedin_url: '${trigger.linkedin_url}', input_mappings: [] };
  return {
    metadata: { name: WORKFLOW_NAMES[kind], version: 1 },
    settings: {},
    start_node_id: TRIGGER_ID,
    nodes: [
      {
        node_id: TRIGGER_ID, node_type: 'trigger', name: 'Graphi SDR (on demand)', position: { x: 0, y: 0 }, connections: [node],
        config: {
          trigger_type: 'tool_call',
          input_schema: [
            { name: 'linkedin_url', type: 'string', required: true, description: 'Target LinkedIn profile URL' },
            { name: 'text', type: 'string', required: true, description: kind === 'connect' ? 'Connection note (≤300 chars)' : 'DM text' },
          ],
        },
      },
      {
        node_id: node, node_type: kind === 'connect' ? 'send_netrion_connection_request' : 'send_netrion_message',
        name: kind === 'connect' ? 'LinkedIn connection request' : 'LinkedIn message', position: { x: 0, y: 160 }, connections: [],
        config: nodeConfig,
      },
    ],
    edges: [{ id: `edge-${TRIGGER_ID}-${node}`, source: TRIGGER_ID, target: node }],
  };
}

export async function validateWorkflow(kind: LiKind): Promise<{ valid: boolean; errors: unknown[]; warnings: unknown[] }> {
  const s = await resolveSender();
  const r = unwrap<any>(await g8.post('/workflows/validate', { config: workflowConfig(kind, s.id) }));
  return { valid: Boolean(r?.valid), errors: r?.errors ?? [], warnings: r?.warnings ?? [] };
}

const wfCache = new Map<LiKind, string>();

export async function findWorkflow(kind: LiKind): Promise<string | undefined> {
  if (wfCache.has(kind)) return wfCache.get(kind);
  const r = unwrap<any>(await g8.get('/workflows'));
  const rows: any[] = Array.isArray(r?.actions) ? r.actions : Array.isArray(r) ? r : [];
  const hit = rows.find((a) => a?.name === WORKFLOW_NAMES[kind]);
  const id = hit ? String(hit.action_id ?? hit.id) : undefined;
  if (id) wfCache.set(kind, id);
  return id;
}

/** Find by name or create (enabled; a tool_call trigger never fires on its own). */
export async function ensureWorkflow(kind: LiKind): Promise<string> {
  const found = await findWorkflow(kind);
  if (found) return found;
  const s = await resolveSender();
  const config = workflowConfig(kind, s.id);
  const v = unwrap<any>(await g8.post('/workflows/validate', { config }));
  if (!v?.valid) throw new Error(`workflow invalid: ${JSON.stringify(v?.errors ?? []).slice(0, 200)}`);
  const r = unwrap<any>(await g8.post('/workflows', {
    name: WORKFLOW_NAMES[kind], category: 'sales', enabled: true, config,
    description: `Graphi SDR agent: on-demand LinkedIn ${kind === 'connect' ? 'connection request' : 'message'} via Netrion (allowlisted test contacts only).`,
  }));
  const id = String(r?.action_id ?? r?.id ?? r?.action?.action_id ?? '');
  if (!id) throw new Error('workflow create returned no action_id');
  wfCache.set(kind, id);
  log.info(`created workflow "${WORKFLOW_NAMES[kind]}"`, { action_id: id });
  return id;
}

// ------------------------------------------------------------------------------------------------ send
export interface LiSendResult {
  state: 'queued' | 'skipped' | 'failed' | 'running';
  kind: LiKind;
  name: string;
  workflow_id?: string;
  execution_id?: string;
  execution_status?: string;
  queue_id?: string;
  skip_reason?: string;
  error?: string;
}

/** Depth-first search for the node output fields in an unknown execution shape. */
function findOutput(x: unknown, depth = 0): { queue_id?: string; skipped?: boolean; skip_reason?: string; error?: string } {
  if (!x || typeof x !== 'object' || depth > 6) return {};
  const o = x as Record<string, unknown>;
  if ('queue_id' in o || 'skipped' in o || 'skip_reason' in o) {
    return {
      queue_id: o.queue_id != null ? String(o.queue_id) : undefined, skipped: Boolean(o.skipped),
      skip_reason: o.skip_reason ? String(o.skip_reason) : undefined, error: o.error ? String(o.error) : undefined,
    };
  }
  for (const v of Object.values(o)) {
    const r = findOutput(v, depth + 1);
    if (r.queue_id || r.skipped || r.skip_reason) return r;
  }
  return {};
}

function execError(x: any): string | undefined {
  const e = x?.error ?? x?.error_message ?? x?.failure_reason;
  return e ? (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 300) : undefined;
}

export async function getExecution(executionId: string): Promise<any> {
  return unwrap<any>(await g8.get(`/workflows/executions/${encodeURIComponent(executionId)}`));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DONE = /^(completed|succeeded|success|failed|error|stopped|cancelled|canceled)$/i;

/**
 * Queue ONE LinkedIn action for an allowlisted, send-enabled test contact. Guard first (throws NotAllowlisted);
 * then execute the reusable workflow and poll the execution (≤ waitMs) for queue_id / skip_reason.
 */
export async function sendLinkedin(i: { kind: LiKind; url: string; text: string; waitMs?: number }): Promise<LiSendResult> {
  const target = assertSendable(i.url);
  const text = i.text.trim().slice(0, i.kind === 'connect' ? CONNECT_NOTE_MAX : MESSAGE_MAX);
  if (!text) throw new Error('linkedin: empty text');
  const base: LiSendResult = { state: 'failed', kind: i.kind, name: target.name };
  const workflowId = await ensureWorkflow(i.kind);
  const ex = unwrap<any>(await g8.post(`/workflows/${encodeURIComponent(workflowId)}/execute`, { input_data: { linkedin_url: target.url, text } }));
  const executionId = String(ex?.execution_id ?? ex?.id ?? '');
  const res: LiSendResult = { ...base, workflow_id: workflowId, execution_id: executionId || undefined, execution_status: ex?.status, state: 'running' };
  if (!executionId) return { ...res, state: 'failed', error: 'execute returned no execution_id' };

  const deadline = Date.now() + (i.waitMs ?? 20_000);
  let last: any = ex;
  while (Date.now() < deadline) {
    await sleep(1_500);
    try { last = await getExecution(executionId); } catch (e) { log.warn('execution poll failed', { err: errMsg(e) }); continue; }
    if (DONE.test(String(last?.status ?? ''))) break;
  }
  const out = findOutput(last);
  const status = String(last?.status ?? res.execution_status ?? 'unknown');
  const r: LiSendResult = { ...res, execution_status: status, queue_id: out.queue_id, skip_reason: out.skip_reason };
  if (out.queue_id && !out.skipped) r.state = 'queued';
  else if (out.skipped) r.state = 'skipped';
  else if (/fail|error|stop|cancel/i.test(status)) { r.state = 'failed'; r.error = out.error ?? execError(last) ?? status; }
  else r.state = DONE.test(status) ? 'failed' : 'running';
  if (r.state === 'failed' && !r.error) r.error = out.error ?? 'no queue_id in execution output';
  log.info(`linkedin ${i.kind} for ${target.name}: ${r.state}`, { execution_id: executionId, queue_id: r.queue_id ?? null, status });
  return r;
}

/** Slack/report-safe one-liner (no URLs, no PII). */
export function describeSend(r: LiSendResult): string {
  const what = r.kind === 'connect' ? 'LinkedIn connection request' : 'LinkedIn message';
  if (r.state === 'queued') return `${what} queued for ${r.name} (graph8, paced)`;
  if (r.state === 'running') return `${what} for ${r.name} submitted to graph8 (still running)`;
  if (r.state === 'skipped') return `${what} for ${r.name} skipped by graph8: ${r.skip_reason ?? 'no reason given'}`;
  return `⚠️ ${what} for ${r.name} failed: ${errMsg(r.error ?? 'unknown')}`;
}
