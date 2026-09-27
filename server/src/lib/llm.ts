/**
 * llm — Gemini via @google/genai. Every call records a credit_events row (source 'llm', action 'llm_run',
 * credits = ceil(total tokens / LLM_TOKENS_PER_CREDIT)) for the calling agent.
 * json(): JSON mode (responseMimeType application/json) → JSON.parse → zod; one repair round-trip on failure.
 */
import { GoogleGenAI } from '@google/genai';
import type { ZodType } from 'zod';
import type { Llm, LlmCallOpts } from '../contracts';
import { env } from './env';
import { log as rootLog } from './log';
import { LLM_TOKENS_PER_CREDIT, store } from './store';

const log = rootLog.child('llm');
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export class LlmError extends Error {
  constructor(msg: string) { super(msg); this.name = 'LlmError'; }
}

async function call(prompt: string, opts: LlmCallOpts, json: boolean): Promise<string> {
  let res: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: {
          ...(opts.system ? { systemInstruction: opts.system } : {}),
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(json ? { responseMimeType: 'application/json' } : {}),
          abortSignal: AbortSignal.timeout(90_000),
        },
      });
      break;
    } catch (err: any) {
      const status = Number(err?.status ?? err?.code);
      const transient = !status || status === 429 || status >= 500;
      if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      throw new LlmError(`gemini ${env.GEMINI_MODEL} failed${status ? ` (${status})` : ''}: ${String(err?.message ?? err).slice(0, 200)}`);
    }
  }
  const u = res.usageMetadata ?? {};
  const input = u.promptTokenCount ?? 0;
  const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  const total = u.totalTokenCount ?? input + output;
  await store.spend({
    workspaceId: opts.workspaceId,
    agentId: opts.agentId,
    taskId: opts.taskId,
    source: 'llm',
    action: 'llm_run',
    credits: Math.max(1, Math.ceil(total / LLM_TOKENS_PER_CREDIT)),
    meta: { input_tokens: input, output_tokens: output, note: env.GEMINI_MODEL },
  });
  const text = res.text ?? '';
  if (!text) throw new LlmError(`gemini returned no text (finish: ${res.candidates?.[0]?.finishReason ?? 'unknown'})`);
  return text;
}

/** Strip ``` fences a model sometimes adds even in JSON mode. */
function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
}

export const llm: Llm = {
  text(prompt, opts) {
    return call(prompt, opts, false);
  },

  async json<T>(prompt: string, schema: ZodType<T>, opts: LlmCallOpts): Promise<T> {
    const first = await call(prompt, opts, true);
    let problem: string;
    try {
      const r = schema.safeParse(parseJson(first));
      if (r.success) return r.data;
      problem = r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    } catch (err: any) {
      problem = `not valid JSON (${String(err?.message).slice(0, 100)})`;
    }
    log.warn('json invalid, repairing', { problem });
    const repair =
      `${prompt}\n\n---\nYour previous answer was rejected: ${problem}\n` +
      `Previous answer:\n${first.slice(0, 6000)}\n\nReturn ONLY the corrected JSON, matching the required shape exactly.`;
    const second = await call(repair, opts, true);
    try {
      const r = schema.safeParse(parseJson(second));
      if (r.success) return r.data;
      problem = r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    } catch (err: any) {
      problem = `not valid JSON (${String(err?.message).slice(0, 100)})`;
    }
    throw new LlmError(`gemini JSON failed validation after repair: ${problem}`);
  },
};
