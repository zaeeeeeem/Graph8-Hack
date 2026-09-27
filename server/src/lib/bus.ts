import { EventEmitter } from 'node:events';
import type { Bus, BusEvents } from '../contracts';

const ee = new EventEmitter();
ee.setMaxListeners(100);

/** Typed in-process event bus. Handlers run async; errors are caught so one bad handler never kills the process. */
export const bus: Bus = {
  on(event, fn) {
    ee.on(event, (e) => {
      Promise.resolve()
        .then(() => fn(e))
        .catch((err) => console.error(`[bus] handler for ${String(event)} failed:`, err));
    });
  },
  emit<K extends keyof BusEvents>(event: K, e: BusEvents[K]) {
    ee.emit(event, e);
  },
};
