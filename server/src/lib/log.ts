// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { Logger } from '../contracts';
const notYet = (): never => { throw new Error('log not implemented yet (stub)'); };
export const log: Logger = new Proxy({} as Logger, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
