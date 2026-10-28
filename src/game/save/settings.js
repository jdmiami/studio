// Global settings: merged over defaultSettings() so unknown keys are dropped, missing ones filled and
// mistyped ones reset. Pure; the save system handles storage.
import { defaultSettings } from '../core/contracts.js';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const QUALITY = new Set(['low', 'medium', 'high']);

function mergeOver(defaults, input) {
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    const v = input?.[key];
    if (isPlainObject(def)) out[key] = mergeOver(def, isPlainObject(v) ? v : {});
    else if (def === null) out[key] = isPlainObject(v) ? JSON.parse(JSON.stringify(v)) : null; // e.g. bindings
    else if (typeof def === 'number') out[key] = typeof v === 'number' && Number.isFinite(v) ? v : def;
    else out[key] = typeof v === typeof def ? v : def;
  }
  return out;
}

/** Returns a complete, valid settings object built from `input` (anything) over the defaults. */
export function mergeSettings(input) {
  const s = mergeOver(defaultSettings(), isPlainObject(input) ? input : {});
  for (const k of Object.keys(s.volume)) s.volume[k] = Math.min(1, Math.max(0, s.volume[k]));
  if (!QUALITY.has(s.quality)) s.quality = defaultSettings().quality;
  return s;
}
