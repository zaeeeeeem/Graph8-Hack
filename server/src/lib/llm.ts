// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { Llm } from '../contracts';
const notYet = (): never => { throw new Error('llm not implemented yet (stub)'); };
export const llm: Llm = new Proxy({} as Llm, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
