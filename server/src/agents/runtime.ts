// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { Runtime } from '../contracts';
const notYet = (): never => { throw new Error('runtime not implemented yet (stub)'); };
export const runtime: Runtime = new Proxy({} as Runtime, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
