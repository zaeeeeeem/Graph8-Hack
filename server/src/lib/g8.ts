// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { G8 } from '../contracts';
const notYet = (): never => { throw new Error('g8 not implemented yet (stub)'); };
export const g8: G8 = new Proxy({} as G8, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
