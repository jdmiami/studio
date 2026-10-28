// Pure mixing helpers for the audio system: no Web Audio, no DOM, so node:test can cover them.
// Volume curves (work in dB, convert at the edges), SFX variation (pitch/gain jitter, no-repeat
// picks), voice-limiter bookkeeping (caps, cooldowns, steal-oldest), the sound table, the
// ambience presets per area, and the event -> sound routing used by createAudio.
import { EVENTS } from '../core/contracts.js';

// ---------------------------------------------------------------------------------------------
// Gain and volume curves

export const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Decibels -> linear amplitude. -Infinity -> 0. */
export const dbToGain = (db) => (db === -Infinity ? 0 : 10 ** (db / 20));

/** Linear amplitude -> decibels. 0 -> -Infinity. */
export const gainToDb = (g) => (g <= 0 ? -Infinity : 20 * Math.log10(g));

/**
 * Settings slider (0..1) -> dB. A 60·log10 taper (identical to cubing the slider): 1 -> 0 dB,
 * 0.8 -> -5.8 dB, 0.5 -> -18 dB, 0.1 -> -60 dB, 0 -> -Infinity (true silence). The audible change
 * is spread over the whole travel instead of piling into the bottom fifth like a raw linear slider.
 */
export const volumeToDb = (v) => {
  const x = clamp01(v);
  return x <= 0 ? -Infinity : 60 * Math.log10(x);
};

/** Settings slider (0..1) -> linear gain for a GainNode. */
export const volumeToGain = (v) => dbToGain(volumeToDb(v));

/** Bus defaults (same as defaultSettings().volume). */
export const DEFAULT_VOLUMES = Object.freeze({ master: 0.8, sfx: 0.8, ambience: 0.6, ui: 0.7 });

/** Merges a partial volume object onto the current one, clamping to 0..1 and ignoring junk. */
export function mergeVolumes(current, next = {}) {
  const out = { ...current };
  for (const bus of Object.keys(DEFAULT_VOLUMES)) {
    if (next && Number.isFinite(next[bus])) out[bus] = clamp01(next[bus]);
  }
  return out;
}

/** How far ambience and sfx dip while the game is paused (ui is never ducked). */
export const PAUSE_DUCK_DB = -9;
/** Seconds for setAmbience to (nearly) reach its new targets. */
export const AMBIENCE_FADE_SECONDS = 1.5;
/** setTargetAtTime reaches ~95% of the way after 3 time constants. */
export const timeConstantFor = (seconds) => Math.max(0.001, seconds / 3);

/** Distance attenuation for positioned one-shots: 1 inside `ref` metres, then a soft rolloff. */
export function distanceGain(distance, { ref = 2, rolloff = 1, max = 40 } = {}) {
  if (!Number.isFinite(distance) || distance <= ref) return 1;
  if (distance >= max) return 0;
  const g = ref / (ref + rolloff * (distance - ref));
  // Fade the last 25% of the range to 0 so far sounds do not stop abruptly.
  const edge = Math.min(1, (max - distance) / (max * 0.25));
  return g * edge;
}

export function distance3(a, b) {
  if (!a || !b) return NaN;
  const ax = a.x ?? a[0], ay = a.y ?? a[1], az = a.z ?? a[2];
  const bx = b.x ?? b[0], by = b.y ?? b[1], bz = b.z ?? b[2];
  return Math.hypot(ax - bx, ay - by, az - bz);
}

// ---------------------------------------------------------------------------------------------
// Variation

/** Uniform in [-1, 1). */
const bipolar = (random) => random() * 2 - 1;

/**
 * Per-play variation: a playback-rate multiplier within ±pitch (fraction, e.g. 0.05 = ±5%) and a
 * linear gain multiplier within ±gainDb decibels.
 */
export function jitter(random, { pitch = 0.05, gainDb = 1.5 } = {}) {
  return {
    rate: 1 + bipolar(random) * pitch,
    gain: dbToGain(bipolar(random) * gainDb),
  };
}

/**
 * Picks indices 0..count-1, never the same one twice in a row (round-robin feel without the
 * predictability of a fixed cycle). count 1 always returns 0.
 */
export function createNoRepeatPicker(count, random = Math.random) {
  let last = -1;
  return {
    next() {
      if (count <= 1) return (last = 0);
      // Draw from the count-1 others, then skip over `last`.
      let i = Math.floor(random() * (last < 0 ? count : count - 1));
      if (i >= count) i = count - 1;
      if (last >= 0 && i >= last) i++;
      return (last = i);
    },
    get last() { return last; },
  };
}

// ---------------------------------------------------------------------------------------------
// Voice limiting

/**
 * Bookkeeping for one-shot voices (the Web Audio nodes live elsewhere). Rules, in order:
 *  1. cooldown: a sound re-triggered sooner than its cooldown is rejected (spam does not stack);
 *  2. per-sound cap: at the cap, the oldest voice of that sound is stolen;
 *  3. global cap: at the cap, the oldest voice overall is stolen.
 * admit() returns { ok: false, reason } or { ok: true, id, steal: [voice, ...] }; the caller fades
 * out the stolen voices. prune(now) drops (and returns) voices whose end time has passed.
 */
export function createVoiceLimiter({ maxVoices = 24 } = {}) {
  let voices = []; // { id, name, start, end }, oldest first
  const lastStart = new Map();
  let nextId = 1;
  return {
    admit(name, now, { cooldown = 0, maxPerSound = Infinity, duration = 1 } = {}) {
      const prev = lastStart.get(name);
      if (prev !== undefined && now - prev < cooldown) return { ok: false, reason: 'cooldown' };
      const steal = [];
      const same = voices.filter((v) => v.name === name);
      for (let i = 0; same.length - i >= maxPerSound && i < same.length; i++) steal.push(same[i]);
      let remaining = voices.filter((v) => !steal.includes(v));
      while (remaining.length >= maxVoices && remaining.length > 0) {
        steal.push(remaining[0]);
        remaining = remaining.slice(1);
      }
      const voice = { id: nextId++, name, start: now, end: now + Math.max(0, duration) };
      voices = [...remaining, voice];
      lastStart.set(name, now);
      return { ok: true, id: voice.id, steal };
    },
    /** Updates a voice's end time once its real length is known. */
    setEnd(id, end) {
      const v = voices.find((x) => x.id === id);
      if (v) v.end = end;
    },
    remove(id) { voices = voices.filter((v) => v.id !== id); },
    prune(now) {
      const done = voices.filter((v) => v.end <= now);
      if (done.length) voices = voices.filter((v) => v.end > now);
      return done;
    },
    count(name) { return name ? voices.filter((v) => v.name === name).length : voices.length; },
    get voices() { return voices.slice(); },
    clear() { voices = []; lastStart.clear(); },
  };
}

// ---------------------------------------------------------------------------------------------
// The sound table

/**
 * Every one-shot: bus, base level (dB), variation (pitch fraction, gain dB), how many takes
 * (variants) its recipe has, cooldown (s), per-sound voice cap, approximate length (s) for the
 * limiter until the recipe reports its real one, and reverb send (0..1).
 */
const S = (bus, levelDb, o = {}) => Object.freeze({
  bus, levelDb,
  pitch: o.pitch ?? 0.05, gainDb: o.gainDb ?? 1.5, variants: o.variants ?? 1,
  cooldown: o.cooldown ?? 0.05, maxVoices: o.maxVoices ?? 3, duration: o.duration ?? 0.5,
  reverb: o.reverb ?? 0.15,
});

export const SOUNDS = Object.freeze({
  // Footsteps: four takes each, no immediate repeat, ±6-8% pitch.
  'step-felt': S('sfx', -3, { pitch: 0.07, gainDb: 2, variants: 4, cooldown: 0.07, maxVoices: 3, duration: 0.2, reverb: 0.08 }),
  'step-stone': S('sfx', -5, { pitch: 0.06, gainDb: 2, variants: 4, cooldown: 0.07, maxVoices: 3, duration: 0.2, reverb: 0.12 }),
  'step-grass': S('sfx', -5, { pitch: 0.08, gainDb: 2, variants: 4, cooldown: 0.07, maxVoices: 3, duration: 0.25, reverb: 0.05 }),
  'step-water': S('sfx', -2, { pitch: 0.08, gainDb: 2, variants: 4, cooldown: 0.07, maxVoices: 3, duration: 0.35, reverb: 0.08 }),
  jump: S('sfx', -2, { pitch: 0.05, cooldown: 0.15, maxVoices: 2, duration: 0.3, reverb: 0.08 }),
  land: S('sfx', -2, { pitch: 0.05, cooldown: 0.12, maxVoices: 2, duration: 0.35, reverb: 0.1 }),
  pickup: S('sfx', -8, { pitch: 0.03, gainDb: 1, cooldown: 0.06, maxVoices: 3, duration: 0.6, reverb: 0.25 }),
  'pickup-rare': S('sfx', -7, { pitch: 0.03, gainDb: 0.5, cooldown: 0.4, maxVoices: 2, duration: 2.2, reverb: 0.45 }),
  sighting: S('sfx', -8, { pitch: 0.04, cooldown: 0.5, maxVoices: 2, duration: 0.5, reverb: 0.3 }),
  'door-open': S('sfx', -20, { pitch: 0.03, gainDb: 1, cooldown: 1.5, maxVoices: 1, duration: 3, reverb: 0.4 }),
  'puzzle-turn': S('sfx', -3, { pitch: 0.06, gainDb: 1.5, variants: 3, cooldown: 0.08, maxVoices: 3, duration: 0.25, reverb: 0.2 }),
  'puzzle-solve': S('sfx', -12, { pitch: 0.03, gainDb: 0.5, cooldown: 1, maxVoices: 1, duration: 3, reverb: 0.5 }),
  'dog-bark': S('sfx', -6, { pitch: 0.06, gainDb: 1.5, variants: 3, cooldown: 0.3, maxVoices: 2, duration: 0.4, reverb: 0.2 }),
  'dog-pant': S('sfx', -5, { pitch: 0.05, cooldown: 0.8, maxVoices: 1, duration: 1.4, reverb: 0.1 }),
  'critter-squeak': S('sfx', -9, { pitch: 0.08, gainDb: 2, variants: 3, cooldown: 0.2, maxVoices: 2, duration: 0.3, reverb: 0.2 }),
  pet: S('sfx', -4, { pitch: 0.06, cooldown: 0.25, maxVoices: 2, duration: 0.6, reverb: 0.08 }),
  throw: S('sfx', -5, { pitch: 0.06, cooldown: 0.15, maxVoices: 2, duration: 0.5, reverb: 0.1 }),
  place: S('sfx', -2, { pitch: 0.05, cooldown: 0.1, maxVoices: 2, duration: 0.3, reverb: 0.15 }),
  'pickup-decor': S('sfx', -5, { pitch: 0.05, cooldown: 0.1, maxVoices: 2, duration: 0.4, reverb: 0.15 }),
  splash: S('sfx', 0, { pitch: 0.07, gainDb: 2, variants: 3, cooldown: 0.15, maxVoices: 2, duration: 0.9, reverb: 0.15 }),
  // UI bus: never ducked by pause.
  'ui-move': S('ui', -6, { pitch: 0.03, gainDb: 1, cooldown: 0.035, maxVoices: 2, duration: 0.12, reverb: 0.05 }),
  'ui-confirm': S('ui', -7, { pitch: 0.03, gainDb: 1, cooldown: 0.06, maxVoices: 2, duration: 0.35, reverb: 0.15 }),
  'ui-back': S('ui', -8, { pitch: 0.03, gainDb: 1, cooldown: 0.06, maxVoices: 2, duration: 0.3, reverb: 0.12 }),
  'ui-open': S('ui', -7, { pitch: 0.03, gainDb: 1, cooldown: 0.1, maxVoices: 2, duration: 0.4, reverb: 0.15 }),
  'ui-close': S('ui', -7, { pitch: 0.03, gainDb: 1, cooldown: 0.1, maxVoices: 2, duration: 0.35, reverb: 0.12 }),
  'page-turn': S('ui', -3, { pitch: 0.07, gainDb: 1.5, variants: 3, cooldown: 0.12, maxVoices: 2, duration: 0.45, reverb: 0.08 }),
  'quest-step': S('ui', -3, { pitch: 0.03, gainDb: 0.5, cooldown: 0.3, maxVoices: 1, duration: 1.4, reverb: 0.35 }),
  'quest-done': S('ui', -5, { pitch: 0.03, gainDb: 0.5, cooldown: 0.8, maxVoices: 1, duration: 2.8, reverb: 0.45 }),
  save: S('ui', -5, { pitch: 0.03, gainDb: 0.5, cooldown: 0.6, maxVoices: 1, duration: 1, reverb: 0.3 }),
  error: S('ui', -1, { pitch: 0.03, gainDb: 1, cooldown: 0.2, maxVoices: 1, duration: 0.4, reverb: 0.1 }),
});

export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));

/**
 * Recipes are built with plenty of internal headroom (peaks well below 0 dBFS); this makeup gain
 * brings every one-shot up to mix level. levelDb in SOUNDS is relative to it. Balanced in an
 * OfflineAudioContext render at default settings: steps peak around -25 dBFS, pickups -18,
 * rare finds and fanfares -14, ui ticks -28..-22, ambience beds about -38 dBFS RMS.
 */
export const VOICE_MAKEUP_DB = 12;

/** Hard ceiling on simultaneous one-shot voices across all buses. */
export const MAX_VOICES = 24;

// ---------------------------------------------------------------------------------------------
// Ambience

export const AMBIENCE_LAYERS = Object.freeze(['water', 'wind', 'cave', 'birds']);

const preset = (o) => Object.freeze({ water: 0, wind: 0, cave: 0, birds: 0, ...o });

/** Ambience targets (0..1 per layer) and the sfx reverb amount for each area. */
export const AMBIENCE_PRESETS = Object.freeze({
  hub: preset({ cave: 0.7, water: 0.5 }),
  meadow: preset({ wind: 0.6, birds: 0.5 }),
  grotto: preset({ cave: 0.5, wind: 0.3 }),
  lake: preset({ water: 0.8, birds: 0.3 }),
  silent: preset({}),
});

export const REVERB_PRESETS = Object.freeze({ hub: 0.9, meadow: 0.3, grotto: 0.75, lake: 0.45, silent: 0.5 });

/** Preset key for an AREA_ENTERED payload: the hub, or the trip's biome (unknown -> meadow). */
export function areaPresetKey(payload = {}) {
  if (!payload || payload.area === 'hub' || (!payload.area && !payload.biome)) return 'hub';
  return Object.hasOwn(AMBIENCE_PRESETS, payload.biome) && payload.biome !== 'silent' ? payload.biome : 'meadow';
}

/** Fills in missing layers with 0 and clamps the rest; non-layer keys are dropped. */
export function normalizeAmbience(targets = {}, base = AMBIENCE_PRESETS.silent) {
  const out = {};
  for (const k of AMBIENCE_LAYERS) out[k] = clamp01(Number.isFinite(targets?.[k]) ? targets[k] : base[k]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Event routing

const RARE = new Set(['rare', 'legendary']);
const SURFACES = new Set(['felt', 'stone', 'grass', 'water']);
const PAGE_SCREENS = new Set(['journal', 'collection', 'book']);

/**
 * Maps a bus event to the one-shots it should play: [{ name, opts }]. Events that are not
 * one-shots (settings, area, pause) return [] and are handled by createAudio itself.
 */
export function routeEvent(type, p = {}) {
  p = p ?? {};
  const one = (name, opts = {}) => [{ name, opts }];
  switch (type) {
    case EVENTS.STEP: {
      const surface = SURFACES.has(p.surface) ? p.surface : 'felt';
      return one(`step-${surface}`, { running: p.running });
    }
    case EVENTS.JUMPED: return one('jump');
    case EVENTS.LANDED: return one('land', { impact: Number.isFinite(p.impact) ? clamp01(p.impact) : 0.5, surface: p.surface });
    case EVENTS.FIND_COLLECTED: return one(RARE.has(p.rarity) ? 'pickup-rare' : 'pickup', { position: p.position });
    case EVENTS.CRITTER_SIGHTED: return one('sighting');
    case EVENTS.UI_MOVE: return one('ui-move');
    case EVENTS.UI_CONFIRM: return one('ui-confirm');
    case EVENTS.UI_BACK: return one('ui-back');
    case EVENTS.UI_OPEN: return one(PAGE_SCREENS.has(p.screen) ? 'page-turn' : 'ui-open');
    case EVENTS.UI_CLOSE: return one('ui-close');
    case EVENTS.QUEST_STARTED:
    case EVENTS.QUEST_STEP: return one('quest-step');
    case EVENTS.QUEST_DONE: return one('quest-done');
    case EVENTS.PUZZLE_TURN: return one('puzzle-turn');
    case EVENTS.PUZZLE_SOLVED: return one('puzzle-solve');
    case EVENTS.DOOR_OPENED: return one('door-open');
    case EVENTS.DECOR_PLACED: return one('place', { position: p.position });
    case EVENTS.DECOR_REMOVED: return one('pickup-decor', { position: p.position });
    case EVENTS.DOG_BARK: return one('dog-bark', { position: p.position });
    case EVENTS.DOG_FETCHED: return one('dog-pant', { position: p.position });
    case EVENTS.PETTED: return one('pet', { position: p.position });
    case EVENTS.CRITTER_SQUEAK: return one('critter-squeak', { position: p.position });
    case EVENTS.SAVED: return one('save');
    case EVENTS.SAVE_FAILED: return one('error');
    default: return [];
  }
}

/** Every event type routeEvent turns into a sound (createAudio subscribes to these). */
export const SOUND_EVENTS = Object.freeze([
  EVENTS.STEP, EVENTS.JUMPED, EVENTS.LANDED, EVENTS.FIND_COLLECTED, EVENTS.CRITTER_SIGHTED,
  EVENTS.UI_MOVE, EVENTS.UI_CONFIRM, EVENTS.UI_BACK, EVENTS.UI_OPEN, EVENTS.UI_CLOSE,
  EVENTS.QUEST_STARTED, EVENTS.QUEST_STEP, EVENTS.QUEST_DONE, EVENTS.PUZZLE_TURN, EVENTS.PUZZLE_SOLVED,
  EVENTS.DOOR_OPENED, EVENTS.DECOR_PLACED, EVENTS.DECOR_REMOVED, EVENTS.DOG_BARK, EVENTS.DOG_FETCHED,
  EVENTS.PETTED, EVENTS.CRITTER_SQUEAK, EVENTS.SAVED, EVENTS.SAVE_FAILED,
]);
