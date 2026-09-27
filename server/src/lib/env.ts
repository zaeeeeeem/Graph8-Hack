// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { Env } from '../contracts';
const notYet = (): never => { throw new Error('env not implemented yet (stub)'); };
export const env: Env = new Proxy({} as Env, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
