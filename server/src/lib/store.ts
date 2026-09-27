// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { Store } from '../contracts';
const notYet = (): never => { throw new Error('store not implemented yet (stub)'); };
export const store: Store = new Proxy({} as Store, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
