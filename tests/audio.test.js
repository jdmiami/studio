import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, defaultSettings } from '../src/game/core/contracts.js';
import { createEvents } from '../src/game/core/events.js';
import {
  AMBIENCE_PRESETS, PAUSE_DUCK_DB, SOUNDS, SOUND_EVENTS, SOUND_NAMES, areaPresetKey, createNoRepeatPicker,
  createVoiceLimiter, dbToGain, distanceGain, gainToDb, jitter, mergeVolumes, normalizeAmbience, routeEvent,
  volumeToDb, volumeToGain,
} from '../src/game/audio/mix.js';
import { fillBrown, fillImpulse, fillPink, fillWhite, makeSeamless } from '../src/game/audio/noise.js';
import { RECIPES } from '../src/game/audio/synth.js';
import { createAudio } from '../src/game/audio/index.js';

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- a strict fake Web Audio context -----------------------------------------------------------
// Throws where browsers throw (or would silently misbehave), so recipe mistakes fail here.

class FakeParam {
  constructor(value = 0) { this._value = value; this.events = []; }
  get value() { return this._value; }
  set value(v) { this._check(v, 'value'); this._value = v; }
  _check(v, what) { if (!Number.isFinite(v)) throw new RangeError(`non-finite ${what}: ${v}`); }
  _t(t) { if (!Number.isFinite(t) || t < 0) throw new RangeError(`bad time ${t}`); }
  setValueAtTime(v, t) { this._check(v, 'setValueAtTime'); this._t(t); this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this._check(v, 'linearRamp'); this._t(t); this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) {
    this._check(v, 'expRamp'); this._t(t);
    if (v <= 0) throw new RangeError(`exponential ramp to ${v}`);
    this.events.push(['exp', v, t]); return this;
  }
  setTargetAtTime(v, t, tc) {
    this._check(v, 'setTarget'); this._t(t);
    if (!(tc > 0)) throw new RangeError(`timeConstant ${tc}`);
    this.events.push(['target', v, t, tc]); return this;
  }
  cancelScheduledValues(t) { this._t(t); this.events.push(['cancel', t]); return this; }
  get lastTarget() { return [...this.events].reverse().find((e) => e[0] === 'target')?.[1]; }
}

class FakeNode {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outputs = new Set(); ctx.created[kind] = (ctx.created[kind] ?? 0) + 1; }
  connect(dest) {
    if (!dest || !(dest instanceof FakeNode || dest instanceof FakeParam)) throw new TypeError(`${this.kind}.connect(${dest})`);
    this.outputs.add(dest);
    return dest instanceof FakeNode ? dest : undefined;
  }
  disconnect() { this.outputs.clear(); }
}

class FakeSource extends FakeNode {
  constructor(ctx, kind) { super(ctx, kind); this.started = false; this.onended = null; }
  start(t = 0, offset = 0) {
    if (this.started) throw new Error(`${this.kind} started twice`);
    if (!Number.isFinite(t) || !Number.isFinite(offset) || offset < 0) throw new RangeError('bad start');
    this.started = true; this.ctx.starts++;
  }
  stop(t = 0) {
    if (!this.started) throw new Error(`${this.kind}.stop before start`);
    if (!Number.isFinite(t)) throw new RangeError('bad stop');
  }
}

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    if (!(length > 0)) throw new RangeError('buffer length');
    this.numberOfChannels = channels; this.length = length; this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(c) { return this._data[c]; }
}

class FakeContext {
  constructor({ sampleRate = 48000 } = {}) {
    this.sampleRate = sampleRate; this.currentTime = 0; this.state = 'running';
    this.created = {}; this.starts = 0;
    this.destination = new FakeNode(this, 'destination');
  }
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new FakeParam(1); return n; }
  createOscillator() {
    const n = new FakeSource(this, 'osc'); n.type = 'sine';
    n.frequency = new FakeParam(440); n.detune = new FakeParam(0); return n;
  }
  createBufferSource() {
    const n = new FakeSource(this, 'bufferSource'); n.buffer = null; n.loop = false;
    n.playbackRate = new FakeParam(1); return n;
  }
  createBiquadFilter() {
    const n = new FakeNode(this, 'biquad'); n.type = 'lowpass';
    n.frequency = new FakeParam(350); n.Q = new FakeParam(1); n.gain = new FakeParam(0); return n;
  }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'compressor');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(0);
    return n;
  }
  createConvolver() { const n = new FakeNode(this, 'convolver'); n.buffer = null; n.normalize = true; return n; }
  createDelay() { const n = new FakeNode(this, 'delay'); n.delayTime = new FakeParam(0); return n; }
  createStereoPanner() { const n = new FakeNode(this, 'panner'); n.pan = new FakeParam(0); return n; }
  createBuffer(ch, len, rate) { return new FakeBuffer(ch, len, rate); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

function rig({ settings = defaultSettings(), sampleRate } = {}) {
  const events = createEvents();
  let ctx = null;
  let made = 0;
  const audio = createAudio({ events, settings, random: seeded(42), contextFactory: () => { made++; return (ctx = new FakeContext({ sampleRate })); } });
  return { events, audio, get ctx() { return ctx; }, get made() { return made; } };
}

// ---- mix.js ------------------------------------------------------------------------------------

test('volume curve: dB taper, endpoints, monotonic', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToDb(0), -Infinity);
  assert.equal(volumeToGain(1), 1);
  assert.ok(close(volumeToDb(0.5), -18.06, 0.01));
  assert.ok(close(volumeToGain(0.5), 0.125)); // == 0.5³
  let prev = -Infinity;
  for (let v = 0.01; v <= 1; v += 0.01) {
    const db = volumeToDb(v);
    assert.ok(db > prev, `monotonic at ${v}`);
    prev = db;
  }
  assert.equal(volumeToGain(-1), 0);
  assert.equal(volumeToGain(5), 1);
  assert.equal(volumeToGain(NaN), 0);
  assert.ok(close(gainToDb(dbToGain(-9)), -9));
  assert.ok(close(dbToGain(PAUSE_DUCK_DB), 0.3548, 1e-3));
});

test('mergeVolumes clamps, keeps unknown buses out, ignores junk', () => {
  const v = mergeVolumes(defaultSettings().volume, { master: 2, sfx: -1, ui: 'loud', extra: 1 });
  assert.deepEqual(v, { master: 1, sfx: 0, ambience: 0.6, ui: 0.7 });
});

test('jitter stays within ±pitch and ±gainDb', () => {
  const r = seeded(3);
  for (let i = 0; i < 2000; i++) {
    const j = jitter(r, { pitch: 0.06, gainDb: 2 });
    assert.ok(j.rate >= 0.94 && j.rate <= 1.06, `rate ${j.rate}`);
    const db = gainToDb(j.gain);
    assert.ok(db >= -2 && db <= 2, `gain ${db} dB`);
  }
});

test('no-repeat picker never repeats and covers every take', () => {
  const p = createNoRepeatPicker(4, seeded(9));
  const seen = new Set();
  let last = -1;
  for (let i = 0; i < 1000; i++) {
    const n = p.next();
    assert.ok(n >= 0 && n < 4);
    assert.notEqual(n, last);
    seen.add(n);
    last = n;
  }
  assert.equal(seen.size, 4);
  const one = createNoRepeatPicker(1, seeded(1));
  assert.deepEqual([one.next(), one.next()], [0, 0]);
  // Even a random() that returns 0.9999... stays in range.
  const edge = createNoRepeatPicker(3, () => 0.999999999);
  for (let i = 0; i < 10; i++) assert.ok(edge.next() < 3);
});

test('voice limiter: cooldown, per-sound cap, global cap steal oldest, prune', () => {
  const L = createVoiceLimiter({ maxVoices: 4 });
  const a = L.admit('step', 0, { cooldown: 0.1, maxPerSound: 2, duration: 1 });
  assert.ok(a.ok);
  assert.deepEqual(L.admit('step', 0.05, { cooldown: 0.1 }), { ok: false, reason: 'cooldown' });
  const b = L.admit('step', 0.2, { cooldown: 0.1, maxPerSound: 2, duration: 1 });
  assert.equal(b.steal.length, 0);
  const c = L.admit('step', 0.4, { cooldown: 0.1, maxPerSound: 2, duration: 1 });
  assert.deepEqual(c.steal.map((v) => v.id), [a.id]); // oldest step stolen
  assert.equal(L.count('step'), 2);
  L.admit('x', 0.5, { duration: 1 });
  L.admit('y', 0.5, { duration: 1 });
  const z = L.admit('z', 0.6, { duration: 1 });
  assert.deepEqual(z.steal.map((v) => v.id), [b.id]); // global cap 4: oldest overall
  assert.equal(L.count(), 4);
  const done = L.prune(1.45);
  assert.deepEqual(done.map((v) => v.id), [c.id]);
  assert.equal(L.count(), 3);
  L.setEnd(z.id, 10);
  assert.equal(L.prune(5).length, 2);
  assert.equal(L.count(), 1);
});

test('distance gain: 1 up close, falls off, 0 beyond max', () => {
  assert.equal(distanceGain(0), 1);
  assert.equal(distanceGain(2), 1);
  assert.ok(distanceGain(10) < distanceGain(5));
  assert.equal(distanceGain(40), 0);
  assert.equal(distanceGain(NaN), 1);
});

test('ambience presets per area', () => {
  assert.deepEqual(AMBIENCE_PRESETS.hub, { water: 0.5, wind: 0, cave: 0.7, birds: 0 });
  assert.deepEqual(AMBIENCE_PRESETS.meadow, { water: 0, wind: 0.6, cave: 0, birds: 0.5 });
  assert.deepEqual(AMBIENCE_PRESETS.grotto, { water: 0, wind: 0.3, cave: 0.5, birds: 0 });
  assert.deepEqual(AMBIENCE_PRESETS.lake, { water: 0.8, wind: 0, cave: 0, birds: 0.3 });
  assert.equal(areaPresetKey({ area: 'hub' }), 'hub');
  assert.equal(areaPresetKey({ area: 'trip', biome: 'lake' }), 'lake');
  assert.equal(areaPresetKey({ area: 'trip', biome: 'grotto' }), 'grotto');
  assert.equal(areaPresetKey({ area: 'trip', biome: 'nowhere' }), 'meadow');
  assert.equal(areaPresetKey({ area: 'trip' }), 'meadow');
  assert.deepEqual(normalizeAmbience({ water: 2, cave: -1, junk: 1 }), { water: 1, wind: 0, cave: 0, birds: 0 });
});

test('event routing', () => {
  assert.deepEqual(routeEvent(EVENTS.STEP, { surface: 'stone', running: true }), [{ name: 'step-stone', opts: { running: true } }]);
  assert.equal(routeEvent(EVENTS.STEP, { surface: 'lava' })[0].name, 'step-felt');
  assert.equal(routeEvent(EVENTS.STEP)[0].name, 'step-felt');
  assert.deepEqual(routeEvent(EVENTS.LANDED, { impact: 0.8, surface: 'grass' })[0], { name: 'land', opts: { impact: 0.8, surface: 'grass' } });
  assert.equal(routeEvent(EVENTS.LANDED, { impact: 7 })[0].opts.impact, 1);
  for (const rarity of ['rare', 'legendary']) assert.equal(routeEvent(EVENTS.FIND_COLLECTED, { rarity })[0].name, 'pickup-rare');
  for (const rarity of ['common', 'uncommon', undefined]) assert.equal(routeEvent(EVENTS.FIND_COLLECTED, { rarity })[0].name, 'pickup');
  const pairs = {
    [EVENTS.JUMPED]: 'jump', [EVENTS.CRITTER_SIGHTED]: 'sighting', [EVENTS.UI_MOVE]: 'ui-move',
    [EVENTS.UI_CONFIRM]: 'ui-confirm', [EVENTS.UI_BACK]: 'ui-back', [EVENTS.UI_OPEN]: 'ui-open',
    [EVENTS.UI_CLOSE]: 'ui-close', [EVENTS.QUEST_STEP]: 'quest-step', [EVENTS.QUEST_DONE]: 'quest-done',
    [EVENTS.PUZZLE_TURN]: 'puzzle-turn', [EVENTS.PUZZLE_SOLVED]: 'puzzle-solve', [EVENTS.DOOR_OPENED]: 'door-open',
    [EVENTS.DECOR_PLACED]: 'place', [EVENTS.DECOR_REMOVED]: 'pickup-decor', [EVENTS.DOG_BARK]: 'dog-bark',
    [EVENTS.PETTED]: 'pet', [EVENTS.CRITTER_SQUEAK]: 'critter-squeak', [EVENTS.SAVED]: 'save',
  };
  for (const [type, name] of Object.entries(pairs)) assert.equal(routeEvent(type, null)[0].name, name, type);
  assert.equal(routeEvent(EVENTS.UI_OPEN, { screen: 'journal' })[0].name, 'page-turn');
  assert.deepEqual(routeEvent(EVENTS.SETTINGS_CHANGED, {}), []);
  for (const type of SOUND_EVENTS) assert.ok(routeEvent(type, {}).every(({ name }) => SOUNDS[name]), type);
});

test('every required sound exists in the table and has a recipe', () => {
  const required = ['step-felt', 'step-stone', 'step-grass', 'step-water', 'jump', 'land', 'pickup', 'pickup-rare',
    'sighting', 'ui-move', 'ui-confirm', 'ui-back', 'ui-open', 'ui-close', 'page-turn', 'door-open', 'puzzle-turn',
    'puzzle-solve', 'quest-step', 'quest-done', 'dog-bark', 'dog-pant', 'critter-squeak', 'pet', 'throw', 'place',
    'pickup-decor', 'splash', 'save', 'error'];
  assert.deepEqual([...SOUND_NAMES].sort(), [...required].sort());
  for (const name of required) {
    assert.equal(typeof RECIPES[name], 'function', name);
    const d = SOUNDS[name];
    assert.ok(['sfx', 'ui'].includes(d.bus), name);
    assert.ok(d.pitch >= 0.03 && d.pitch <= 0.08, `${name} pitch ±3-8%`);
    assert.ok(d.levelDb <= 0 && d.levelDb >= -30, `${name} level`);
  }
  for (const s of ['felt', 'stone', 'grass', 'water']) {
    const d = SOUNDS[`step-${s}`];
    assert.ok(d.variants >= 3 && d.pitch >= 0.03 && d.pitch <= 0.08 && d.cooldown > 0);
  }
});

// ---- noise.js ----------------------------------------------------------------------------------

test('noise generators: bounded, normalized, no DC on brown', () => {
  const r = seeded(5);
  for (const fill of [fillWhite, fillPink, fillBrown]) {
    const a = fill(new Float32Array(48000), r);
    let peak = 0, sum = 0;
    for (const x of a) { assert.ok(Number.isFinite(x)); peak = Math.max(peak, Math.abs(x)); sum += x; }
    assert.ok(peak <= 1 && peak > 0.3, `${fill.name} peak ${peak}`);
    if (fill === fillBrown) assert.ok(Math.abs(sum / a.length) < 0.01, 'brown DC');
  }
});

test('makeSeamless: the loop seam is continuous', () => {
  const a = fillBrown(new Float32Array(20000), seeded(11));
  const s = makeSeamless(a, 2000);
  assert.equal(s.length, 18000);
  const seam = Math.abs(s[s.length - 1] - s[0]);
  let maxStep = 0;
  for (let i = 1; i < s.length; i++) maxStep = Math.max(maxStep, Math.abs(s[i] - s[i - 1]));
  assert.ok(seam <= maxStep * 1.5, `seam jump ${seam} vs typical ${maxStep}`);
});

test('impulse response decays and ends at silence', () => {
  const ch = [new Float32Array(48000), new Float32Array(48000)];
  fillImpulse(ch, 48000, { decay: 0.8, random: seeded(2) });
  const rms = (a, from, to) => Math.sqrt(a.slice(from, to).reduce((s, x) => s + x * x, 0) / (to - from));
  assert.ok(rms(ch[0], 1000, 5000) > 10 * rms(ch[0], 40000, 47000));
  assert.equal(ch[0][ch[0].length - 1], 0);
  assert.notDeepEqual(ch[0].slice(2000, 2100), ch[1].slice(2000, 2100)); // decorrelated channels
});

// ---- createAudio -------------------------------------------------------------------------------

test('no AudioContext before unlock; play is a silent no-op', () => {
  const r = rig();
  assert.equal(r.audio.play('pickup'), false);
  r.events.emit(EVENTS.STEP, { surface: 'felt' });
  r.audio.update(0.016, { listenerPos: { x: 0, y: 0, z: 0 } });
  r.audio.setAmbience({ water: 1 });
  r.audio.setVolumes({ master: 0.5 });
  assert.equal(r.made, 0);
  assert.equal(r.audio.getState().unlocked, false);
  assert.equal(r.audio.unlock(), true);
  assert.equal(r.made, 1);
  r.audio.unlock();
  assert.equal(r.made, 1, 'unlock is idempotent');
  assert.equal(r.audio.getState().volumes.master, 0.5, 'volumes set while locked apply on unlock');
  r.audio.dispose();
});

test('no AudioContext available at all: unlock reports false, nothing throws', () => {
  const audio = createAudio({ events: createEvents(), contextFactory: () => null });
  assert.equal(audio.unlock(), false);
  assert.equal(audio.play('jump'), false);
  audio.update(0.1);
  audio.dispose();
});

test('every sound renders without Web Audio errors, at 44.1 and 48 kHz', () => {
  for (const sampleRate of [44100, 48000]) {
    const r = rig({ sampleRate });
    r.audio.unlock();
    for (const name of SOUND_NAMES) {
      r.ctx.currentTime += 5; // past every cooldown
      const id = r.audio.play(name, { impact: 1, surface: 'water', running: true });
      assert.ok(id, `${name} @${sampleRate}`);
    }
    r.audio.dispose();
  }
});

test('cooldowns stop spam; the global voice cap holds under a flood', () => {
  const r = rig();
  r.audio.unlock();
  r.ctx.currentTime = 1;
  assert.ok(r.audio.play('dog-bark'));
  assert.equal(r.audio.play('dog-bark'), false, 'within cooldown');
  r.ctx.currentTime += 0.5;
  assert.ok(r.audio.play('dog-bark'));
  // Hammer everything: the voice count never exceeds the global cap.
  for (let i = 0; i < 400; i++) {
    r.ctx.currentTime += 0.011;
    r.audio.play(SOUND_NAMES[i % SOUND_NAMES.length]);
    assert.ok(r.audio.getState().voices <= 24);
    assert.ok(r.audio.getState().voices > 0);
  }
  r.audio.dispose();
});

test('event bus drives sounds; SETTINGS_CHANGED, AREA_ENTERED, PAUSED/RESUMED', () => {
  const r = rig();
  r.audio.unlock();
  r.ctx.currentTime = 2;
  const before = r.ctx.starts;
  r.events.emit(EVENTS.FIND_COLLECTED, { itemId: 'x', rarity: 'legendary', first: true });
  assert.ok(r.ctx.starts > before, 'a find starts sources');
  assert.equal(r.audio.getState().voices, 1);

  r.events.emit(EVENTS.SETTINGS_CHANGED, { settings: { ...defaultSettings(), volume: { master: 1, sfx: 0.5, ambience: 0, ui: 1 } } });
  assert.deepEqual(r.audio.getState().volumes, { master: 1, sfx: 0.5, ambience: 0, ui: 1 });

  r.events.emit(EVENTS.AREA_ENTERED, { area: 'trip', biome: 'lake' });
  assert.deepEqual(r.audio.getState().ambience, AMBIENCE_PRESETS.lake);
  r.events.emit(EVENTS.AREA_ENTERED, { area: 'hub' });
  assert.deepEqual(r.audio.getState().ambience, AMBIENCE_PRESETS.hub);

  r.events.emit(EVENTS.PAUSED);
  assert.equal(r.audio.getState().paused, true);
  r.events.emit(EVENTS.RESUMED);
  assert.equal(r.audio.getState().paused, false);

  // Ambience events run in update without errors for a simulated minute in every area.
  for (const biome of ['meadow', 'grotto', 'lake']) {
    r.events.emit(EVENTS.AREA_ENTERED, { area: 'trip', biome });
    for (let i = 0; i < 600; i++) { r.ctx.currentTime += 0.1; r.audio.update(0.1, { listenerPos: [0, 0, 0] }); }
  }
  r.audio.dispose();
  const after = r.ctx.starts;
  r.events.emit(EVENTS.JUMPED);
  assert.equal(r.ctx.starts, after, 'dispose unsubscribes');
  assert.equal(r.audio.play('jump'), false);
});

test('pause ducks sfx + ambience by PAUSE_DUCK_DB, never ui; volumes glide (no jumps)', () => {
  // A context that records every GainNode it makes, so the duck and volume gains can be found.
  const events = createEvents();
  const all = [];
  let ctx;
  const audio = createAudio({ events, random: seeded(1), contextFactory: () => {
    ctx = new FakeContext();
    const og = ctx.createGain.bind(ctx);
    ctx.createGain = () => { const g = og(); all.push(g); return g; };
    return ctx;
  } });
  audio.unlock();
  ctx.currentTime = 3;
  const mark = new Map(all.map((g) => [g, g.gain.events.length]));
  events.emit(EVENTS.PAUSED);
  const ducked = all.filter((g) => g.gain.events.slice(mark.get(g)).some((e) => e[0] === 'target'));
  assert.equal(ducked.length, 2, 'exactly two duck gains (sfx, ambience)');
  for (const g of ducked) assert.ok(close(g.gain.lastTarget, dbToGain(PAUSE_DUCK_DB)));
  events.emit(EVENTS.RESUMED);
  for (const g of ducked) assert.equal(g.gain.lastTarget, 1);

  const mark2 = new Map(all.map((g) => [g, g.gain.events.length]));
  audio.setVolumes({ ui: 0.5 });
  const moved = all.filter((g) => g.gain.events.slice(mark2.get(g)).length);
  assert.equal(moved.length, 4, 'master + three buses re-targeted');
  for (const g of moved) {
    const evs = g.gain.events.slice(mark2.get(g));
    assert.ok(evs.every((e) => e[0] === 'cancel' || e[0] === 'target'), 'smoothed with setTargetAtTime');
  }
  assert.ok(moved.some((g) => close(g.gain.lastTarget, volumeToGain(0.5))));
  audio.dispose();
});
