// STUB (coordinator). Replaced by the owning worker's implementation at merge. Do not edit.
import type { SlackPort } from '../contracts';
const notYet = (): never => { throw new Error('slack not implemented yet (stub)'); };
export const slack: SlackPort = new Proxy({} as SlackPort, { get: (_t, p) => (p === 'then' ? undefined : notYet) });
