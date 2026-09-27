/**
 * R5 write_hook (H1, H5): Gemini phrases a why-now hook + 2 talking points + best first channel from graph8 facts ONLY.
 * Fallback (LLM slow/failed/invalid): deterministic hook from the same facts. The run never stalls.
 */
import { z } from 'zod';
import type { Channel } from '../../../../shared/types';
import type { RunCtx } from '../../contracts';
import { llm } from '../../lib/llm';
import { scrubPii, withTimeout } from '../bilal/util';

export interface HookInput {
  name: string;
  title: string | null;
  company: string | null;
  facts: string[];
  signals: string[];
  channels: Channel[];
  offer?: string;
}
export interface Hook { why_now: string; talking_points: string[]; best_channel: Channel | null; via: 'gemini' | 'fallback' }

const HookSchema = z.object({
  why_now: z.string().min(5),
  talking_points: z.array(z.string()).min(1),
  best_channel: z.string().optional(),
});

export function fallbackHook(h: HookInput): Hook {
  const lead = h.signals[0] ?? h.facts.find((f) => !f.startsWith('about:')) ?? `${h.title ?? 'leader'} at ${h.company ?? 'their company'}`;
  const tp = [
    h.signals[1] ?? h.facts.find((f) => f !== lead && !f.startsWith('about:')) ?? `${h.title ?? 'Their role'} owns the problem we solve`,
    h.offer ? `How ${h.offer.slice(0, 80)} fits ${h.company ?? 'them'}` : `Relevance for ${h.company ?? 'their team'} right now`,
  ];
  return { why_now: capitalize(lead).slice(0, 160), talking_points: tp.map((t) => capitalize(t).slice(0, 160)), best_channel: pickChannel(h.channels, null), via: 'fallback' };
}

export function pickChannel(channels: Channel[], suggested: string | null | undefined): Channel | null {
  const s = (suggested ?? '').toLowerCase() as Channel;
  if (s && channels.includes(s)) return s;
  for (const c of ['email', 'phone', 'linkedin'] as Channel[]) if (channels.includes(c)) return c;
  return null;
}

export async function writeHook(ctx: RunCtx, h: HookInput, ms = 25_000): Promise<Hook> {
  if (!h.facts.length && !h.signals.length) return fallbackHook(h);
  const prompt = [
    'You are a B2B sales researcher. Write a research pack for ONE prospect using ONLY the facts below.',
    'Never invent numbers, news, funding, or events not present in the facts. If facts are thin, keep it about role + company fit.',
    `Prospect: ${h.name}, ${h.title ?? 'unknown title'} at ${h.company ?? 'unknown company'}`,
    `Facts from graph8:\n- ${h.facts.join('\n- ') || '(none)'}`,
    `Signals from graph8:\n- ${h.signals.join('\n- ') || '(none)'}`,
    h.offer ? `Our offer (from our company docs): ${h.offer}` : '',
    `Reachable channels: ${h.channels.join(', ') || 'none'}`,
    'Return JSON: { "why_now": one sentence ≤ 25 words, "talking_points": exactly 2 short strings (their situation → our offer), "best_channel": one of the reachable channels }',
  ].filter(Boolean).join('\n');
  try {
    const r = HookSchema.parse(await withTimeout(llm.json(prompt, HookSchema, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id, temperature: 0.3 }), ms, 'hook'));
    return {
      why_now: scrubPii(r.why_now).slice(0, 200),
      talking_points: r.talking_points.slice(0, 2).map((t) => scrubPii(t).slice(0, 200)),
      best_channel: pickChannel(h.channels, r.best_channel),
      via: 'gemini',
    };
  } catch {
    return fallbackHook(h);
  }
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
