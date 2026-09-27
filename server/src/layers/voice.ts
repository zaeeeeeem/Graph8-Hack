/**
 * Layer L2 — AI voice call ('voice').
 *
 *  - onboarding `setup_voice_agent`: reuse settings.g8_voice_agent_id or POST /voice/agents (persona "Usman" from the
 *    brand_voice / elevator_pitch docs: 30-s pitch + ask for 15 min, voicemail prompt, calendar = event type id).
 *    Then GET /voice/agent-phone-numbers — no AI-calling number → {ok:false} "voice waiting for an AI-calling number".
 *  - stepPlan: 📞 D5 AI call. 'live' only when agent + AI-calling number exist; else 'planned' with the reason.
 *    We fire it ourselves (no g8Step): fire() → g8.callGuarded (allowlist guard) → lead_events call_placed.
 *  - inbound: voice_ai.* webhooks → `voice.outcome` for Zara (src/inbound/handlers/voice.ts).
 *
 * Verified shapes (docs/verify/layers.md V-V1/V-V2): identity.calendar is a bare int; agent routes use the UUID
 * agent_id; POST /voice/calls (even dry_run) 422s unless from_phone is an AI-calling number; it returns
 * {status, message, room_name}. Hooks never throw and are time-boxed — a broken voice layer never breaks L0.
 */
import { z } from 'zod';
import { NotAllowlisted } from '../contracts';
import type { OnboardingExtra, PlannedStep, RunCtx } from '../contracts';
import type { LeadRow, UUID, WorkspaceSettings } from '../../../shared/types';
import { env } from '../lib/env';
import { g8, unwrap } from '../lib/g8';
import { llm } from '../lib/llm';
import { log as rootLog, redact } from '../lib/log';
import { store } from '../lib/store';
import { layers } from '../layers';
import { trackCall, voiceInbound } from '../inbound/handlers/voice';

const log = rootLog.child('voice');

export const NO_NUMBER_NOTE = 'voice waiting for an AI-calling number';
const HOOK_TIMEOUT_MS = 45_000;
const CALL_DAY = 5;
const DEFAULT_EVENT_TYPE_ID = 1;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms); })])
    .finally(() => clearTimeout(t));
}
const errMsg = (e: unknown) => redact(e instanceof Error ? e.message : String(e)).slice(0, 200);
/** Company caller ids are not prospect PII, but we still show only the tail. */
export const maskNumber = (p: string) => `…${p.replace(/\D/g, '').slice(-4)}`;

// ------------------------------------------------------------------------------------------ numbers
export interface AiNumbers { available: string[]; booked: Array<{ phone: string; agentId?: string }> }

function phoneOf(x: unknown): string | undefined {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    const o = x as Record<string, any>;
    const v = o.phone_number ?? o.phone ?? o.number ?? o.e164 ?? o.did;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/** GET /voice/agent-phone-numbers → { available_numbers, booked_numbers } (both [] in the hackathon org today). */
export async function aiNumbers(): Promise<AiNumbers> {
  const d = unwrap<Record<string, any>>(await g8.get('/voice/agent-phone-numbers')) ?? {};
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    available: arr(d.available_numbers).map(phoneOf).filter((p): p is string => !!p),
    booked: arr(d.booked_numbers).map((b: any) => ({ phone: phoneOf(b)!, agentId: b?.agent_id ?? b?.agent?.agent_id ?? b?.assigned_agent_id })).filter((b) => !!b.phone),
  };
}

/** Caller id for our agent: a number booked to it, else a free AI number, else any org AI number. */
export function pickFromNumber(n: AiNumbers, agentId?: string): string | undefined {
  return n.booked.find((b) => agentId && b.agentId === agentId)?.phone ?? n.available[0] ?? n.booked[0]?.phone;
}

// ------------------------------------------------------------------------------------------ agent
const PersonaOut = z.object({
  persona: z.string().describe('2-3 sentences: how Usman sounds, from the brand voice'),
  description: z.string().describe('One line: what this outbound SDR voice agent does'),
  pitch: z.string().describe('Spoken outbound script, max ~75 words (30 seconds): who we are, one proof point, then ask for 15 minutes this week'),
  voicemail: z.string().describe('Voicemail, max 35 words, first person as Usman, no phone numbers'),
});
type Persona = z.infer<typeof PersonaOut>;

function fallbackPersona(company = 'our team'): Persona {
  return {
    persona: 'Direct, warm, no-fluff SDR. Confident and specific, never pushy, respects the prospect\'s time.',
    description: `Outbound SDR voice agent for ${company}: 30-second pitch, then books a 15-minute discovery call.`,
    pitch: `Hi, this is Usman from ${company}. I'll be quick — we help teams like yours grow pipeline without adding headcount. `
      + 'Could we grab 15 minutes this week so I can show you how? I can book it right now.',
    voicemail: `Hi, this is Usman from ${company}. I wanted 15 minutes this week to show how we help teams like yours. I'll follow up by email — speak soon.`,
  };
}

async function buildPersona(ctx: RunCtx): Promise<Persona> {
  // W13: graph8 docs are another company's → never pitch that company on the phone.
  if (ctx.settings?.g8_docs_match === false) return fallbackPersona(typeof ctx.settings?.plan_company === 'string' ? ctx.settings.plan_company : undefined);
  try {
    const docs = unwrap<Array<{ file_type?: string; display_name?: string; content?: string | null }>>(
      await withTimeout(g8.get('/global-context/documents', { include_content: true }), 15_000, 'global-context'),
    ) ?? [];
    const want = ['brand_voice', 'elevator_pitch', 'compliance_rules'];
    const text = (Array.isArray(docs) ? docs : []).filter((d) => want.includes(d.file_type ?? '') && d.content)
      .map((d) => `### ${d.file_type}\n${String(d.content).slice(0, 4000)}`).join('\n\n');
    if (!text) return fallbackPersona();
    return await withTimeout(llm.json(
      'You write the persona for an AI outbound phone SDR named Usman. Use ONLY the company docs below. '
      + 'The call: a 30-second pitch, then ask for 15 minutes this week (the agent can book on the call). Plain spoken English.\n\n' + text,
      PersonaOut, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task?.id, temperature: 0.4 },
    ), 25_000, 'persona llm');
  } catch (err) {
    log.warn('persona from docs failed; using fallback', { err: errMsg(err) });
    return fallbackPersona();
  }
}

/** Reuse settings.g8_voice_agent_id when graph8 still has it; else create "Usman" and store the id. */
export async function ensureAgent(ctx: RunCtx, fromPhone?: string): Promise<{ agentId: string; created: boolean }> {
  const s = ctx.settings ?? (await store.settings(ctx.workspaceId));
  if (s.g8_voice_agent_id) {
    try {
      const a = unwrap<{ agent?: any; agent_id?: string }>(await g8.get(`/voice/agents/${encodeURIComponent(s.g8_voice_agent_id)}`));
      if ((a as any)?.agent_id ?? (a as any)?.agent?.agent_id) return { agentId: s.g8_voice_agent_id, created: false };
    } catch (err) {
      log.warn('stored voice agent not readable; creating a new one', { err: errMsg(err) });
    }
  }
  const p = await buildPersona(ctx);
  const body = {
    role: 'SDR',
    persona: {
      agent_name: 'Usman', persona: p.persona, description: p.description,
      formality_level: 0.4, conciseness_level: 0.7, assertiveness_level: 0.6,
      outbound_instructions: p.pitch, outbound_voicemail_prompt: p.voicemail,
    },
    identity: { calendar: s.g8_event_type_id ?? DEFAULT_EVENT_TYPE_ID, ...(fromPhone ? { phone: fromPhone } : {}) },
  };
  const r = unwrap<Record<string, any>>(await g8.post('/voice/agents', body));
  const agentId: string | undefined = r?.agent?.agent_id ?? r?.agent_id;
  if (!agentId) throw new Error('POST /voice/agents returned no agent_id');
  await store.patchSettings(ctx.workspaceId, { g8_voice_agent_id: agentId } as Partial<WorkspaceSettings>);
  return { agentId, created: true };
}

async function setupVoiceAgent(ctx: RunCtx): Promise<{ ok: boolean; note?: string }> {
  let numbers: AiNumbers = { available: [], booked: [] };
  try { numbers = await aiNumbers(); } catch (err) { log.warn('agent-phone-numbers failed', { err: errMsg(err) }); }
  const pre = pickFromNumber(numbers);
  const { agentId, created } = await ensureAgent(ctx, pre);
  await ctx.step('tool', 'setup_voice_agent', `${created ? 'Created' : 'Reused'} voice agent Usman`, { agent_id: agentId, ai_numbers: numbers.available.length + numbers.booked.length });
  const from = pickFromNumber(numbers, agentId);
  if (!from) return { ok: false, note: NO_NUMBER_NOTE };
  if (!created) {
    // Give an existing agent the caller id so graph8 shows it; harmless if it already has one.
    try { await g8.put(`/voice/agents/${encodeURIComponent(agentId)}`, { identity: { phone: from } }); } catch (err) { log.warn('assign number to agent failed', { err: errMsg(err) }); }
  }
  return { ok: true, note: `voice agent Usman ready on ${maskNumber(from)}` };
}

export const onboarding: OnboardingExtra = {
  name: 'setup_voice_agent',
  label: 'AI voice agent',
  async run(ctx) {
    try {
      return await withTimeout(setupVoiceAgent(ctx), HOOK_TIMEOUT_MS, 'setup_voice_agent');
    } catch (err) {
      log.error('setup_voice_agent failed', { err: errMsg(err) });
      return { ok: false, note: `voice unavailable: ${errMsg(err)}` };
    }
  },
};

// ------------------------------------------------------------------------------------------ step + fire
async function leadEvent(workspaceId: UUID, leadId: UUID, summary: string, data: Record<string, unknown>) {
  let agentId: UUID | null = null;
  try { agentId = (await store.agentByRole(workspaceId, 'sdr')).id; } catch { /* optional */ }
  const r = await store.db.from('lead_events').insert({
    workspace_id: workspaceId, lead_id: leadId, agent_id: agentId, type: 'call_placed', channel: 'phone', direction: 'outbound', summary, data,
  });
  if (r?.error) log.warn('lead_events insert failed', { err: r.error.message });
  return agentId;
}

/** Place the D5 AI call for one enrolled lead. Never throws; every outcome is a lead_events call_placed row. */
export async function fireCall(c: { workspaceId: UUID; lead: LeadRow; g8ContactId: string | number; sequenceId: string | number }): Promise<void> {
  const note = (summary: string, data: Record<string, unknown>) => leadEvent(c.workspaceId, c.lead.id, summary, { sequence_id: String(c.sequenceId), ...data }).catch(() => null);
  try {
    if (env.layersDisabled.includes('voice')) return;
    await withTimeout((async () => {
      const s = await store.settings(c.workspaceId);
      const agentId = s.g8_voice_agent_id;
      if (!agentId) { await note('AI call not placed — no voice agent yet', { status: 'skipped', reason: 'no_agent' }); return; }
      const from = pickFromNumber(await aiNumbers(), agentId);
      if (!from) { await note(`AI call not placed — ${NO_NUMBER_NOTE}`, { status: 'skipped', reason: 'no_ai_number' }); return; }
      const lc = await store.db.from('lead_contacts').select('phone').eq('lead_id', c.lead.id).maybeSingle();
      const to = lc?.data?.phone as string | undefined;
      if (!to) { await note('AI call not placed — no phone on file', { status: 'skipped', reason: 'no_phone' }); return; }
      const body = {
        to_phone: to, from_phone: from, agent_id: agentId,
        event_id: s.g8_event_type_id ?? DEFAULT_EVENT_TYPE_ID,
        contact_id: String(c.g8ContactId),
        first_name: c.lead.full_name?.split(/\s+/)[0] || undefined,
        ...(env.PUBLIC_URL ? { callback_url: env.PUBLIC_URL.replace(/\/+$/, '') + '/webhooks/graph8' } : {}),
      };
      let res: Record<string, any>;
      try {
        res = unwrap<Record<string, any>>(await g8.callGuarded(body)) ?? {};
      } catch (err) {
        const blocked = err instanceof NotAllowlisted;
        await note(blocked ? 'AI call blocked — not a test contact' : `AI call failed to dispatch: ${errMsg(err)}`, { status: blocked ? 'blocked' : 'failed', reason: errMsg(err) });
        return;
      }
      const roomName = String(res.room_name ?? res.call_id ?? res.id ?? '');
      const agentRow = await note('AI call placed — Usman pitching, asking for 15 min', { status: res.status ?? 'dispatched', room_name: roomName || null });
      if (roomName) trackCall({ workspaceId: c.workspaceId, leadId: c.lead.id, g8ContactId: String(c.g8ContactId), roomName, agentId: agentRow ?? undefined });
      log.info('call dispatched', { lead_id: c.lead.id, room_name: roomName });
    })(), HOOK_TIMEOUT_MS, 'voice fire');
  } catch (err) {
    log.error('voice fire failed', { err: errMsg(err) });
    await note(`AI call failed: ${errMsg(err)}`, { status: 'failed', reason: errMsg(err) });
  }
}

export async function stepPlan(ctx: RunCtx, _leads: LeadRow[]): Promise<PlannedStep[]> {
  const step: PlannedStep = { day: CALL_DAY, channel: 'phone', action: '📞 AI call (Usman): 30-s pitch + ask for 15 min', state: 'planned', fire: fireCall };
  try {
    const agentId = ctx.settings?.g8_voice_agent_id ?? (await store.settings(ctx.workspaceId)).g8_voice_agent_id;
    if (!agentId) return [{ ...step, reason: 'no voice agent yet' }];
    const from = pickFromNumber(await withTimeout(aiNumbers(), 15_000, 'agent-phone-numbers'), agentId);
    if (!from) return [{ ...step, reason: NO_NUMBER_NOTE }];
    return [{ ...step, state: 'live' }];
  } catch (err) {
    return [{ ...step, reason: `voice unavailable: ${errMsg(err)}` }];
  }
}

layers.register({ name: 'voice', onboarding, stepPlan, inbound: voiceInbound });
