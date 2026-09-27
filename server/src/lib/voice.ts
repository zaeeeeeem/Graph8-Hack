/**
 * Short status lines in an agent's own voice, written by Gemini so they don't repeat word-for-word.
 * Always falls back to the template when Gemini is slow or fails — a status line must never block a run.
 */
import type { AgentRole, UUID } from '../../../shared/types';
import { llm } from './llm';

const PERSONA: Record<AgentRole, string> = {
  head_of_sales: 'Ayesha, Head of Sales: crisp, warm, numbers first',
  scout: 'Bilal, Scout: quick, curious',
  researcher: 'Hira, Researcher: precise, calm',
  sdr: 'Usman, SDR: energetic, brief',
  closer: 'Zara, Closer: confident, friendly',
};

export async function voiceLine(
  role: AgentRole,
  fallback: string,
  opts: { workspaceId: UUID; agentId: UUID; taskId?: UUID; timeoutMs?: number },
): Promise<string> {
  const prompt =
    `Rewrite this Slack status update in your own words as ${PERSONA[role]}. ` +
    `One sentence, max 25 words, same facts (keep every number, name, T-number and #channel exactly), ` +
    `at most one emoji, occasionally (1 in 4) a light Pakistani touch like "Chalo" or "Shabash". ` +
    `No quotes, no email addresses. Return only the sentence.\n\nUpdate: ${fallback}`;
  try {
    const out = await Promise.race([
      llm.text(prompt, { workspaceId: opts.workspaceId, agentId: opts.agentId, taskId: opts.taskId, temperature: 0.9 }),
      new Promise<null>((r) => setTimeout(() => r(null), opts.timeoutMs ?? 3000)),
    ]);
    const line = (out ?? '').trim().replace(/^["']|["']$/g, '');
    if (!line || line.length > 240 || /@\S+\.\w/.test(line)) return fallback;
    return line;
  } catch {
    return fallback;
  }
}
