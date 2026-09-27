// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { LayerRegistry } from './contracts';
const notYet = (): never => { throw new Error('layers not implemented yet (stub)'); };
export const layers: LayerRegistry = new Proxy({} as LayerRegistry, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
