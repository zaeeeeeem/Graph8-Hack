/**
 * Step plan = Layer 0 emails + whatever layers offer via `stepPlan` (voice 📞, LinkedIn ⏸ …).
 * Layer 0 works with zero layers: every layer call is try/catch + timeout, failures become ⚠️ lines.
 */
import { layers } from '../../layers';
import type { Layer, PlannedStep, RunCtx } from '../../contracts';
import type { Channel, JsonObject, LeadRow, SequenceStep } from '../../../../shared/types';
import { EMAIL_DAYS, type SequenceCopy } from './copy';
import { errMsg, withTimeout } from './util';

export const LAYER_TIMEOUT_MS = 8_000;

/** One row of our plan. `mode`: graph8 sends it | we fire it (scheduler) | shown ⏸ only. */
export interface PlanStep {
  n: number;
  day: number;
  channel: Channel;
  action: string;
  mode: 'g8' | 'fire' | 'planned';
  layer?: string;
  reason?: string;
  subject?: string;
  preview?: string;
  /** Index into copy.emails for Layer 0 email steps. */
  emailIdx?: number;
  g8Step?: JsonObject;
  fire?: PlannedStep['fire'];
}

export interface LayerPlanResult { steps: PlanStep[]; warnings: string[] }

export function safeLayers(): Layer[] {
  try { return layers.all() ?? []; } catch { return []; }
}

export async function collectLayerSteps(ctx: RunCtx, leads: LeadRow[]): Promise<{ planned: Array<PlannedStep & { layer: string }>; warnings: string[] }> {
  const planned: Array<PlannedStep & { layer: string }> = [];
  const warnings: string[] = [];
  for (const layer of safeLayers()) {
    if (!layer.stepPlan) continue;
    try {
      const steps = await withTimeout(layer.stepPlan(ctx, leads), LAYER_TIMEOUT_MS, `${layer.name} stepPlan`);
      for (const s of steps ?? []) planned.push({ ...s, layer: String(layer.name) });
    } catch (e) {
      warnings.push(`${layer.name}: ${errMsg(e)}`);
    }
  }
  return { planned, warnings };
}

export function buildPlan(copy: SequenceCopy, layerSteps: Array<PlannedStep & { layer: string }>): PlanStep[] {
  const rows: Omit<PlanStep, 'n'>[] = EMAIL_DAYS.map((day, i) => ({
    day, channel: 'email' as Channel, action: 'send', mode: 'g8' as const, emailIdx: i,
    subject: copy.emails[i]?.subject, preview: firstLine(copy.emails[i]?.body),
  }));
  for (let s of layerSteps) {
    // docs/verify/layers.md V-L1: graph8 rejects every LinkedIn step type in POST /sequences — never send one.
    if (s.channel === 'linkedin' && s.g8Step) s = { ...s, g8Step: undefined, state: s.fire ? s.state : 'planned', reason: s.reason ?? 'LinkedIn not connected' };
    const mode: PlanStep['mode'] = s.state !== 'live' ? 'planned' : s.g8Step ? 'g8' : s.fire ? 'fire' : 'planned';
    rows.push({
      day: s.day, channel: s.channel, action: s.action, mode, layer: s.layer,
      reason: s.reason ?? (mode === 'planned' && s.state === 'live' ? 'no g8 step or fire()' : undefined),
      g8Step: s.g8Step, fire: s.fire,
    });
  }
  // Stable sort by day; emails first on the same day.
  rows.sort((a, b) => a.day - b.day || (a.channel === 'email' ? -1 : 0) - (b.channel === 'email' ? -1 : 0));
  return rows.map((r, i) => ({ ...r, n: i + 1 }));
}

function firstLine(body?: string): string | undefined {
  if (!body) return undefined;
  const line = body.split('\n').map((l) => l.trim()).filter((l) => l && !/^hi\b|^hey\b|^hello\b/i.test(l))[0] ?? '';
  return line.slice(0, 140);
}

/** graph8 StepConfig[] for the steps graph8 sends. `time_interval` = seconds after the previous graph8 step. */
export function toG8Steps(plan: PlanStep[], copy: SequenceCopy, secPerDay: number, aiTemplate: boolean): JsonObject[] {
  const out: JsonObject[] = [];
  let prevDay = 0;
  for (const s of plan) {
    if (s.mode !== 'g8') continue;
    const time_interval = Math.max(0, Math.round((s.day - prevDay) * secPerDay));
    prevDay = s.day;
    if (s.emailIdx !== undefined) {
      const e = copy.emails[s.emailIdx];
      out.push({
        step_order: out.length + 1,
        step_type: 'EMAIL',
        input_type: aiTemplate ? 'AI_GENERATED_TEMPLATE' : 'MANUAL_TEMPLATE',
        time_interval,
        step_data: emailStepData(e, aiTemplate),
      });
    } else if (s.g8Step) {
      out.push({ ...s.g8Step, step_order: out.length + 1, time_interval });
    }
  }
  return out;
}

export function emailStepData(e: SequenceCopy['emails'][number], aiTemplate: boolean): JsonObject {
  const d: JsonObject = { subject: e.subject, body: e.body, email_type: 'plain' };
  if (aiTemplate) d.instructions = `${e.instructions}\nUse the contact's sales_hook custom field as the opening line's basis.`.trim();
  return d;
}

/** sequences.steps summary (portal + Launch card). Extra keys are fine in jsonb. */
export function toSummary(plan: PlanStep[]): Array<SequenceStep & JsonObject> {
  return plan.map((s) => {
    const row: SequenceStep & JsonObject = { n: s.n, day: s.day, channel: s.channel, action: s.action, mode: s.mode };
    if (s.subject) row.subject = s.subject;
    if (s.preview) row.preview = s.preview;
    if (s.layer) row.layer = s.layer;
    if (s.reason) row.reason = s.reason;
    if (s.emailIdx !== undefined) row.email_idx = s.emailIdx;
    return row;
  });
}
