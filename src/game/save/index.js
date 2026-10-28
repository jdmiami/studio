// Phluph save system: 3 manual slots + an autosave slot, versioned envelopes with checksums, crash-safe
// writes (temp -> verify -> rotate current to backup -> commit), recovery from backup, and global settings.
// See README.md in this folder for the format.
import { EVENTS, SAVE_VERSION } from '../core/contracts.js';
import { SaveError } from './errors.js';
import { decodeEnvelope, encodeEnvelope, fromBase64, toBase64 } from './envelope.js';
import { upgradeSave } from './migrations.js';
import { mergeSettings } from './settings.js';
import { browserStorage } from './storage.js';

export { SaveError, isSaveError, SAVE_ERROR_CODES } from './errors.js';
export { MAGIC, crc32, checksumOf, encodeEnvelope, decodeEnvelope, toBase64, fromBase64 } from './envelope.js';
export { MIGRATIONS, migrate, repairState, upgradeSave } from './migrations.js';
export { mergeSettings } from './settings.js';
export { browserStorage, memoryStorage } from './storage.js';

export const SLOTS = Object.freeze([1, 2, 3, 'auto']);
export const AUTOSAVE_MIN_INTERVAL = 10_000;
export const IMMEDIATE_AUTOSAVE_REASONS = Object.freeze(['quest', 'area', 'quit']);
const SETTINGS_MAGIC = 'phluph-settings';

const NO_EVENTS = { on: () => () => {}, emit: () => {} };
const asSaveError = (e, code = 'STORAGE') => (e instanceof SaveError ? e : new SaveError(code, String(e?.message ?? e), { cause: e }));

function normalizeSlot(slot) {
  if (slot === 'auto') return 'auto';
  const n = typeof slot === 'string' && /^[1-3]$/.test(slot) ? Number(slot) : slot;
  if (n === 1 || n === 2 || n === 3) return n;
  throw new SaveError('BAD_SLOT', `unknown save slot ${JSON.stringify(slot)}`, { slot });
}

/**
 * @param {{
 *   storage?: { getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem(k: string): void },
 *   events?: { on: Function, emit: Function },
 *   now?: () => number,
 *   keyPrefix?: string,
 *   getState?: () => object,            // used when SAVE_REQUESTED carries no state
 *   autosaveInterval?: number,          // ms between throttled autosaves (default 10 s)
 *   immediateReasons?: string[],        // autosave reasons that skip the throttle
 *   schedule?: (fn: () => void, ms: number) => () => void, // timer for the trailing autosave; returns cancel
 *   persistSettingsOnChange?: boolean,  // save settings when SETTINGS_CHANGED is emitted (default true)
 * }} [opts]
 */
export function createSaveSystem({
  storage = browserStorage(),
  events = NO_EVENTS,
  now = Date.now,
  keyPrefix = 'phluph',
  getState = null,
  autosaveInterval = AUTOSAVE_MIN_INTERVAL,
  immediateReasons = IMMEDIATE_AUTOSAVE_REASONS,
  schedule = defaultSchedule,
  persistSettingsOnChange = true,
} = {}) {
  const keys = (slot) => {
    const base = `${keyPrefix}:save:${slot}`;
    return { current: base, backup: `${base}:bak`, temp: `${base}:tmp` };
  };
  const settingsKey = `${keyPrefix}:settings`;
  const immediate = new Set(immediateReasons);

  const fail = (error, extra = {}) => {
    events.emit(EVENTS.SAVE_FAILED, { error, code: error.code, recovered: false, ...extra });
    return error;
  };

  /**
   * Reads a slot without side effects. Tries current, then backup, then an uncommitted temp (only reached
   * when both others are unusable). Returns null for an empty slot, else
   * { state, source, recovered, storedVersion, savedAt, errors, text }; throws when nothing is recoverable.
   */
  function readSlot(slot) {
    const k = keys(slot);
    const errors = [];
    let sawAnything = false;
    for (const source of ['current', 'backup', 'temp']) {
      let text;
      try {
        text = storage.getItem(k[source]);
      } catch (e) {
        errors.push({ source, error: asSaveError(e) });
        continue;
      }
      if (text == null) continue;
      sawAnything = true;
      let env;
      try {
        env = decodeEnvelope(text);
      } catch (e) {
        errors.push({ source, error: asSaveError(e, 'CORRUPT') });
        continue;
      }
      // The newest readable copy is from a newer build: refuse rather than load an older backup silently.
      if (env.version > SAVE_VERSION) {
        throw new SaveError('NEWER_VERSION', `slot ${slot} was saved by a newer version (v${env.version})`, { slot, version: env.version });
      }
      let state;
      try {
        state = upgradeSave({ ...env.data, version: env.version }, { now: now() });
      } catch (e) {
        errors.push({ source, error: asSaveError(e, 'CORRUPT') });
        continue;
      }
      return { state, source, recovered: source !== 'current', storedVersion: env.version, savedAt: env.savedAt, errors, text };
    }
    if (!sawAnything && !errors.length) return null;
    const first = errors[0]?.error;
    throw new SaveError(first?.code === 'STORAGE' ? 'STORAGE' : 'CORRUPT', `slot ${slot} is unreadable and no backup could be recovered${first ? ` (${first.message})` : ''}`, { slot, cause: first });
  }

  function metaOf(state, storedVersion) {
    return {
      name: state.name,
      updatedAt: state.updatedAt,
      playTime: state.playTime,
      area: state.area.kind,
      biome: state.area.biome,
      finds: Object.keys(state.collection).length,
      questsDone: Object.values(state.quests).filter((q) => q.status === 'done').length,
      version: storedVersion,
    };
  }

  /** Like load() but also says where the data came from: { state, source, recovered, storedVersion, warning? }. */
  function loadDetailed(slotArg) {
    let slot;
    try {
      slot = normalizeSlot(slotArg);
      const r = readSlot(slot);
      if (!r) return { state: null, source: null, recovered: false, storedVersion: null };
      const out = { state: r.state, source: r.source, recovered: r.recovered, storedVersion: r.storedVersion };
      if (r.recovered) {
        const cause = r.errors[0]?.error;
        const error = new SaveError('CORRUPT', `slot ${slot}: latest save unreadable, recovered from ${r.source}`, { slot, cause });
        out.warning = error.message;
        events.emit(EVENTS.SAVE_FAILED, { error, code: error.code, slot, recovered: true, source: r.source });
      }
      return out;
    } catch (e) {
      throw fail(asSaveError(e), { slot: slot ?? slotArg });
    }
  }

  /** Writes one slot crash-safely. Throws SaveError (and emits SAVE_FAILED) on failure. */
  function save(slotArg, state, { reason = 'manual' } = {}) {
    let slot;
    try {
      slot = normalizeSlot(slotArg);
      if (!state || typeof state !== 'object') throw new SaveError('NO_STATE', 'nothing to save', { slot });
      const at = now();
      const data = JSON.parse(JSON.stringify(state));
      data.version = SAVE_VERSION;
      data.updatedAt = at;
      if (slot !== 'auto') data.slot = slot;
      writeEnvelope(slot, encodeEnvelope(data, { version: SAVE_VERSION, savedAt: at }));
      events.emit(EVENTS.SAVED, { slot, at, reason });
      return { slot, at };
    } catch (e) {
      throw fail(asSaveError(e), { slot: slot ?? slotArg, reason });
    }
  }

  function writeEnvelope(slot, text) {
    const k = keys(slot);
    // 1. Temp copy, read back and verified, before the real save is touched.
    try {
      storage.setItem(k.temp, text);
      const back = storage.getItem(k.temp);
      if (back !== text) throw new SaveError('STORAGE', 'save could not be verified after writing');
      decodeEnvelope(back);
    } catch (e) {
      storage.removeItem(k.temp);
      throw asSaveError(e);
    }
    // 2. Rotate current -> backup, but only a current that verifies: a corrupt current must never
    //    overwrite the last good backup.
    // 3. Commit temp -> current, then drop the temp. A crash anywhere here leaves current (or backup) intact;
    //    each setItem replaces its key whole, so no key is ever half-written.
    try {
      const cur = storage.getItem(k.current);
      if (cur != null && isValidEnvelope(cur)) storage.setItem(k.backup, cur);
      storage.setItem(k.current, text);
    } finally {
      storage.removeItem(k.temp); // on a thrown error too; only a real crash leaves a temp behind
    }
  }

  const isValidEnvelope = (text) => {
    try {
      decodeEnvelope(text);
      return true;
    } catch {
      return false;
    }
  };

  // ---- Autosave (throttled with a trailing write) ----------------------------------------------------
  let lastAutoAt = -Infinity;
  let pending = null;
  let cancelTimer = null;

  function writeAuto(state, reason) {
    lastAutoAt = now(); // counts failed attempts too, so a broken storage is not hammered
    try {
      const r = save('auto', state, { reason });
      return { saved: true, deferred: false, at: r.at };
    } catch (error) {
      return { saved: false, deferred: false, error }; // SAVE_FAILED already emitted
    }
  }

  function clearPending() {
    pending = null;
    cancelTimer?.();
    cancelTimer = null;
  }

  /**
   * Autosaves to the 'auto' slot. 'quest' / 'area' (and 'quit') write immediately; anything else is
   * throttled to one write per `autosaveInterval`, with the latest throttled state written when the
   * interval ends. Never throws; returns { saved, deferred, at?, dueAt?, error? }.
   */
  function autosave(state, reason = 'timer') {
    if (!state || typeof state !== 'object') {
      return { saved: false, deferred: false, error: fail(new SaveError('NO_STATE', 'nothing to autosave'), { slot: 'auto', reason }) };
    }
    const t = now();
    if (immediate.has(reason) || t - lastAutoAt >= autosaveInterval) {
      clearPending();
      return writeAuto(state, reason);
    }
    pending = { state, reason };
    const dueAt = lastAutoAt + autosaveInterval;
    if (!cancelTimer) {
      cancelTimer = schedule(() => {
        cancelTimer = null;
        flush();
      }, Math.max(0, dueAt - t));
    }
    return { saved: false, deferred: true, dueAt };
  }

  /** Writes a deferred autosave now (e.g. on page hide). Returns its result, or null if none was pending. */
  function flush() {
    if (!pending) return null;
    const { state, reason } = pending;
    clearPending();
    return writeAuto(state, reason);
  }

  // ---- Slots ---------------------------------------------------------------------------------------
  function listSlots() {
    return SLOTS.map((slot) => {
      try {
        const r = readSlot(slot);
        if (!r) return { slot, empty: true, meta: null };
        const entry = { slot, empty: false, meta: metaOf(r.state, r.storedVersion) };
        if (r.recovered) entry.recovered = true;
        return entry;
      } catch (e) {
        const error = asSaveError(e);
        return { slot, empty: false, meta: null, error: error.code, message: error.message };
      }
    });
  }

  function remove(slotArg) {
    const slot = normalizeSlot(slotArg);
    const k = keys(slot);
    for (const key of [k.temp, k.current, k.backup]) storage.removeItem(key);
    if (slot === 'auto') clearPending();
  }

  /** A portable save code: base64 of the slot's best verified envelope JSON. */
  function exportSlot(slotArg) {
    const slot = normalizeSlot(slotArg);
    const r = readSlot(slot);
    if (!r) throw new SaveError('MISSING', `slot ${slot} is empty`, { slot });
    return toBase64(r.text);
  }

  /** Validates a save code (magic, checksum, version <= current), migrates it and saves it into `slot`. */
  function importSlot(slotArg, text) {
    const slot = normalizeSlot(slotArg);
    if (typeof text !== 'string' || !text.trim()) throw new SaveError('CORRUPT', 'empty save code', { slot });
    const env = decodeEnvelope(fromBase64(text.trim()));
    if (env.version > SAVE_VERSION) {
      throw new SaveError('NEWER_VERSION', `save code is from a newer version (v${env.version})`, { slot, version: env.version });
    }
    const state = upgradeSave({ ...env.data, version: env.version }, { now: now() });
    if (slot !== 'auto') state.slot = slot;
    save(slot, state, { reason: 'import' });
    return readSlot(slot).state;
  }

  // ---- Settings --------------------------------------------------------------------------------------
  function loadSettings() {
    try {
      const text = storage.getItem(settingsKey);
      if (text == null) return mergeSettings({});
      return mergeSettings(decodeEnvelope(text, { magic: SETTINGS_MAGIC }).data);
    } catch {
      return mergeSettings({}); // unreadable settings are never worth blocking the game over
    }
  }

  function saveSettings(settings) {
    const merged = mergeSettings(settings);
    try {
      storage.setItem(settingsKey, encodeEnvelope(merged, { version: 1, savedAt: now(), magic: SETTINGS_MAGIC }));
    } catch (e) {
      throw fail(asSaveError(e), { slot: 'settings' });
    }
    return merged;
  }

  // ---- Event wiring --------------------------------------------------------------------------------
  const offs = [
    events.on(EVENTS.SAVE_REQUESTED, ({ reason = 'manual', state, slot } = {}) => {
      const s = state ?? getState?.();
      if (slot == null || slot === 'auto') {
        autosave(s, reason);
        return;
      }
      try {
        save(slot, s, { reason });
      } catch {
        // already reported through SAVE_FAILED
      }
    }),
  ];
  if (persistSettingsOnChange) {
    offs.push(
      events.on(EVENTS.SETTINGS_CHANGED, ({ settings } = {}) => {
        if (!settings) return;
        try {
          saveSettings(settings);
        } catch {
          // already reported through SAVE_FAILED
        }
      }),
    );
  }

  return {
    listSlots,
    load: (slot) => loadDetailed(slot).state,
    loadDetailed,
    save,
    autosave,
    flush,
    delete: remove,
    exportSlot,
    importSlot,
    loadSettings,
    saveSettings,
    /** True when saves survive a reload (false for memory storage / blocked localStorage). */
    get persistent() {
      return storage.persistent !== false;
    },
    /** Unsubscribes from the bus and cancels a pending autosave timer (the pending state is dropped). */
    dispose() {
      clearPending();
      for (const off of offs) off?.();
    },
  };
}

function defaultSchedule(fn, ms) {
  const id = setTimeout(fn, ms);
  id?.unref?.(); // never keep a Node process (tests, tools) alive for an autosave
  return () => clearTimeout(id);
}
