// Storage adapters. The save system only needs getItem / setItem / removeItem with string values
// (the Web Storage subset), so tests inject memoryStorage() and the game uses browserStorage().
import { SaveError } from './errors.js';

const isQuotaError = (e) =>
  !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

/**
 * localStorage adapter. Write failures become SaveError('QUOTA') when storage is full, else 'STORAGE'.
 * If localStorage is unavailable (blocked cookies, some private modes, Node), it falls back to memory and
 * reports `persistent: false` so the UI can warn that progress will not survive a reload.
 */
export function browserStorage(ls) {
  let store = ls;
  if (store === undefined) {
    try {
      store = globalThis.localStorage;
      // Some browsers expose localStorage but throw on first use.
      const probe = '__phluph_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
    } catch {
      store = null;
    }
  }
  if (!store) return { ...memoryStorage(), persistent: false };
  return {
    persistent: true,
    getItem(key) {
      try {
        return store.getItem(key);
      } catch (cause) {
        throw new SaveError('STORAGE', `could not read ${key}`, { cause });
      }
    },
    setItem(key, value) {
      try {
        store.setItem(key, value);
      } catch (cause) {
        if (isQuotaError(cause)) throw new SaveError('QUOTA', 'browser storage is full', { cause });
        throw new SaveError('STORAGE', `could not write ${key}`, { cause });
      }
    },
    removeItem(key) {
      try {
        store.removeItem(key);
      } catch {
        // Removing is best-effort (temp cleanup); a failure here never loses data.
      }
    },
  };
}

/**
 * In-memory adapter for tests (and the fallback when localStorage is missing).
 * `quota` (in UTF-16 code units, like localStorage) makes setItem throw SaveError('QUOTA') when exceeded.
 */
export function memoryStorage({ initial = {}, quota = Infinity } = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  const used = () => {
    let n = 0;
    for (const [k, v] of map) n += k.length + v.length;
    return n;
  };
  return {
    persistent: false,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem(key, value) {
      const v = String(value);
      const prev = map.get(key);
      const next = used() - (prev === undefined ? 0 : key.length + prev.length) + key.length + v.length;
      if (next > quota) throw new SaveError('QUOTA', 'memory storage quota exceeded');
      map.set(key, v);
    },
    removeItem: (key) => void map.delete(key),
    /** Test helpers. */
    keys: () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  };
}
