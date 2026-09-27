/**
 * Boot: env → agent brains (whatever exists) → layers → Slack (optional) → runtime → HTTP (healthz + graph8 webhook) → cron.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AgentBrain, BusEvents, SlackPort } from './contracts';
import { attachSlack, runtime } from './agents/runtime';
import { autoloadLayers, layers, startLayers } from './layers';
import { bus } from './lib/bus';
import { env } from './lib/env';
import { g8 } from './lib/g8';
import { log as rootLog } from './lib/log';
import { store } from './lib/store';

const log = rootLog.child('boot');
const here = dirname(fileURLToPath(import.meta.url));
const startedAt = Date.now();

/** Import `file` if it exists (tsx runs .ts; a build would have .js). */
async function importIfExists(base: string): Promise<Record<string, unknown> | null> {
  for (const ext of ['.ts', '.js']) {
    const p = base + ext;
    if (existsSync(p)) return import(pathToFileURL(p).href);
  }
  return null;
}

async function loadBrains() {
  const names = ['ayesha', 'bilal', 'hira', 'usman', 'zara'];
  for (const n of names) {
    try {
      const mod = await importIfExists(join(here, 'agents', n));
      if (!mod) { log.info(`agent ${n}: not present, skipping`); continue; }
      const brain = (mod[n] ?? mod.default ?? Object.values(mod).find((v: any) => v && typeof v === 'object' && 'role' in v && typeof v.run === 'function')) as AgentBrain | undefined;
      if (!brain) { log.warn(`agent ${n}: no AgentBrain export`); continue; }
      runtime.register(brain);
    } catch (err) {
      log.error(`agent ${n}: failed to load`, { err });
    }
  }
}

async function loadSlack(): Promise<boolean> {
  if (env.SLACK_DISABLED) { log.info('slack disabled (SLACK_DISABLED=1)'); return false; }
  const mod = await importIfExists(join(here, 'lib', 'slack'));
  if (!mod?.slack) { log.warn('slack: src/lib/slack.ts not present, running without Slack'); return false; }
  const slack = mod.slack as SlackPort;
  attachSlack(slack);
  await slack.start();
  log.info('slack started');
  return true;
}

// ------------------------------------------------------------------------------------------------ HTTP
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readRaw(req: IncomingMessage, limit = 2_000_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** X-Studio-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${raw}`)>; reject > 5 min skew. */
export function verifyGraph8Signature(raw: Buffer, sigHeader: string | undefined, tsHeader: string | undefined, secret: string, nowMs = Date.now()): { ok: boolean; reason?: string } {
  if (!sigHeader || !tsHeader) return { ok: false, reason: 'missing signature headers' };
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(nowMs / 1000 - ts) > 300) return { ok: false, reason: 'timestamp skew > 5 min' };
  const expected = createHmac('sha256', secret).update(`${tsHeader}.`).update(raw).digest('hex');
  const given = sigHeader.replace(/^sha256=/, '').trim();
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

async function handleGraph8Webhook(req: IncomingMessage, res: ServerResponse) {
  const raw = await readRaw(req);
  let signatureValid: boolean | null = null;
  if (env.G8_WEBHOOK_SECRET) {
    const v = verifyGraph8Signature(raw, req.headers['x-studio-signature'] as string, req.headers['x-studio-timestamp'] as string, env.G8_WEBHOOK_SECRET);
    if (!v.ok) { log.warn(`webhook rejected: ${v.reason}`); return json(res, 401, { error: v.reason }); }
    signatureValid = true;
  }
  let body: any;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'invalid json' }); }
  const type = String(body?.event ?? body?.type ?? 'unknown');
  const payload = (body && typeof body === 'object' ? body : { value: body }) as BusEvents['graph8.event']['payload'];
  // graph8 retries carry a new delivery id but the same timestamp+data → hash those (docs/SCHEMA.md §3.6).
  const dedupeKey = 'g8:' + createHash('sha256').update(`${type}|${body?.timestamp ?? req.headers['x-studio-timestamp'] ?? ''}|${JSON.stringify(body?.data ?? body)}`).digest('hex');
  const ins = await store.db.from('inbound_events').insert({
    workspace_id: env.WORKSPACE_ID, source: 'graph8', event_type: type, dedupe_key: dedupeKey,
    delivery_id: (req.headers['x-studio-delivery-id'] as string) ?? null, signature_valid: signatureValid, payload,
  }).select('id').maybeSingle();
  if (ins.error) {
    if (ins.error.code === '23505') { log.info(`webhook duplicate ${type} ignored`); return json(res, 200, { ok: true, duplicate: true }); }
    log.error('webhook insert failed', { err: ins.error.message });
    return json(res, 500, { error: 'store failed' });
  }
  json(res, 200, { ok: true });
  bus.emit('graph8.event', { type, payload, inboundEventId: ins.data!.id, workspaceId: env.WORKSPACE_ID });
}

async function healthz(res: ServerResponse) {
  const [supabase, graph8] = await Promise.all([store.ping().catch(() => false), g8.ping().catch(() => false)]);
  json(res, supabase && graph8 ? 200 : 503, {
    ok: supabase && graph8, supabase, g8: graph8, uptime_s: Math.round((Date.now() - startedAt) / 1000),
    workspace_id: env.WORKSPACE_ID, layers: layers.all().map((l) => l.name),
  });
}

function startHttp() {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const p = req.method === 'GET' && url === '/healthz' ? healthz(res)
      : req.method === 'POST' && url === '/webhooks/graph8' ? handleGraph8Webhook(req, res)
      : Promise.resolve(json(res, 404, { error: 'not found' }));
    p.catch((err) => { log.error('http handler failed', { err }); if (!res.headersSent) json(res, 500, { error: 'internal' }); });
  });
  server.listen(env.PORT, () => log.info(`http listening on :${env.PORT}`));
  return server;
}

// ------------------------------------------------------------------------------------------------ cron
/** Hour/minute/date in the workspace timezone. */
function tzNow(tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function startCron(tz: string, standupHour: number) {
  const tick = (name: BusEvents['cron.tick']['name']) => bus.emit('cron.tick', { name });
  setInterval(() => tick('inbox_poll'), 15_000);
  setInterval(() => tick('step_scheduler'), 15_000);
  setInterval(() => tick('linkedin_watch'), 60_000);
  const fired = new Set<string>();
  setInterval(() => {
    const n = tzNow(tz);
    const once = (key: string, name: string) => { if (!fired.has(key)) { fired.add(key); tick(name); } };
    if (n.hour === standupHour && n.minute === 0) once(`standup:${n.date}`, 'standup_0900');
    if (n.hour === 0 && n.minute === 0) once(`budget:${n.date}`, 'budget_reset');
  }, 20_000);
  log.info(`cron started (tz ${tz}, standup ${standupHour}:00)`);
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const wsId = env.WORKSPACE_ID;
  const ws = await store.workspace(wsId);
  log.info(`serving workspace "${ws.name}" (${ws.is_demo ? 'demo' : 'test/real'}) ${wsId}`);
  await loadBrains();
  const files = await autoloadLayers(join(here, 'layers'));
  log.info(`layers: ${files.length} file(s), enabled: ${layers.all().map((l) => l.name).join(', ') || 'none'}`);
  try { await loadSlack(); } catch (err) { log.error('slack failed to start; continuing without it', { err }); }
  await runtime.start();
  await startLayers();
  startHttp();
  startCron(ws.timezone || 'Asia/Karachi', ws.standup_hour ?? 9);
}

main().catch((err) => { log.error('boot failed', { err }); process.exit(1); });
process.on('unhandledRejection', (err) => log.error('unhandled rejection', { err }));
