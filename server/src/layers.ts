/**
 * layers — registry for optional features (voice, linkedin, intent, ai_research, intelligence…).
 * Each `src/layers/*.ts` file calls `layers.register(...)` at import; `autoloadLayers()` imports them all at boot.
 * `all()` hides layers named in LAYERS_DISABLED. Layer 0 never imports a layer directly.
 */
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Layer, LayerRegistry } from './contracts';
import { env } from './lib/env';
import { log as rootLog } from './lib/log';

const log = rootLog.child('layers');
const registry = new Map<string, Layer>();

export const layers: LayerRegistry = {
  register(layer) {
    if (registry.has(layer.name)) log.warn(`layer ${layer.name} registered twice; keeping the latest`);
    registry.set(layer.name, layer);
    log.info(`registered layer ${layer.name}${env.layersDisabled.includes(layer.name) ? ' (disabled by LAYERS_DISABLED)' : ''}`);
  },
  all() {
    return [...registry.values()].filter((l) => !env.layersDisabled.includes(l.name));
  },
};

/** Import every src/layers/*.ts (or .js when built). Missing dir = no layers. One bad file never stops boot. */
export async function autoloadLayers(dir = join(dirname(fileURLToPath(import.meta.url)), 'layers')): Promise<string[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith('.d.ts') && !/\.test\./.test(f)).sort();
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
  const loaded: string[] = [];
  for (const f of files) {
    try {
      await import(pathToFileURL(join(dir, f)).href);
      loaded.push(f);
    } catch (err) {
      log.error(`failed to load layer file ${f}; continuing without it`, { err });
    }
  }
  return loaded;
}

/** Start background loops of enabled layers; failures are logged, never thrown. */
export async function startLayers(): Promise<void> {
  for (const l of layers.all()) {
    if (!l.start) continue;
    try { await l.start(); } catch (err) { log.error(`layer ${l.name} start failed`, { err }); }
  }
}
