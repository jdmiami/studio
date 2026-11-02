// Sound recipes: every one-shot is built on the fly from oscillators, noise buffers, filters and
// envelopes (no audio files). Recipes stay soft on purpose: low-passed noise instead of raw white,
// sine/triangle instead of saw/square, millisecond attacks instead of zero-time clicks, and every
// pitch is multiplied by the voice's random `rate` so repeats never sound identical.
//
// A recipe is `(v, o) => void`. `v` is the voice: { ctx, t, out, rate, random, buffers, variant,
// wet, end, sources }. Primitives connect into `v.out` (or `dest`) and push `v.end` forward.

const MIN = 0.0001;
const nyq = (v, f) => Math.min(Math.max(f, 20), v.ctx.sampleRate * 0.45);

/** Attack/decay gain envelope on `param`: 0 -> peak in `attack`, then exponential to silence. */
function envelope(param, t, peak, attack, decay, hold = 0) {
  peak = Math.max(peak, MIN * 2);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) param.setValueAtTime(peak, t + attack + hold);
  param.exponentialRampToValueAtTime(MIN, t + attack + hold + decay);
  param.setValueAtTime(0, t + attack + hold + decay + 0.005);
  return t + attack + hold + decay + 0.01;
}

function track(v, src, start, stop) {
  src.start(start);
  src.stop(stop);
  v.sources.push(src);
  v.end = Math.max(v.end, stop);
}

function glide(param, t, f0, f1, dur, curve = 'exp') {
  param.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) {
    if (curve === 'exp') param.exponentialRampToValueAtTime(f1, t + dur);
    else param.linearRampToValueAtTime(f1, t + dur);
  }
}

/**
 * An oscillator note. f/f1 in Hz (pre-rate), gain is the envelope peak, decay its tail (s).
 * Options: type, at (offset s), attack, hold, glideTime, lp (low-pass Hz), vibrato { rate, depth }.
 */
function tone(v, { f, f1, type = 'sine', at = 0, gain = 0.3, attack = 0.006, hold = 0, decay = 0.2,
  glideTime, lp, detune = 0, vibrato, dest = v.out, pan } = {}) {
  const { ctx } = v;
  const t = v.t + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  const fa = nyq(v, f * v.rate);
  const fb = f1 ? nyq(v, f1 * v.rate) : fa;
  glide(osc.frequency, t, fa, fb, glideTime ?? attack + hold + decay * 0.5);
  if (detune) osc.detune.setValueAtTime(detune, t);
  const g = ctx.createGain();
  const stop = envelope(g.gain, t, gain, attack, decay, hold);
  let head = osc;
  if (lp) {
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.setValueAtTime(nyq(v, lp), t);
    f2.Q.setValueAtTime(0.5, t);
    head.connect(f2);
    head = f2;
  }
  head.connect(g);
  connectPanned(v, g, dest, pan, t);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(vibrato.rate, t);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(fa * vibrato.depth, t);
    lfo.connect(depth).connect(osc.frequency);
    track(v, lfo, t, stop);
  }
  track(v, osc, t, stop);
  return g;
}

/**
 * A filtered noise burst. color: 'white' | 'pink' | 'brown'. filter: biquad type; f/f1 sweep the
 * cutoff (pre-rate), q its resonance. playbackRate follows the voice rate.
 */
function noise(v, { color = 'pink', filter = 'lowpass', f = 800, f1, q = 0.7, at = 0, gain = 0.3,
  attack = 0.008, hold = 0, decay = 0.12, sweep, dest = v.out, pan, highpass } = {}) {
  const { ctx } = v;
  const t = v.t + at;
  const buf = v.buffers[color];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.setValueAtTime(v.rate, t);
  const bq = ctx.createBiquadFilter();
  bq.type = filter;
  const fa = nyq(v, f * v.rate);
  const fb = f1 ? nyq(v, f1 * v.rate) : fa;
  glide(bq.frequency, t, fa, fb, sweep ?? attack + hold + decay);
  bq.Q.setValueAtTime(q, t);
  const g = ctx.createGain();
  const stop = envelope(g.gain, t, gain, attack, decay, hold);
  src.connect(bq);
  let head = bq;
  if (highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(nyq(v, highpass), t);
    hp.Q.setValueAtTime(0.5, t);
    head.connect(hp);
    head = hp;
  }
  head.connect(g);
  connectPanned(v, g, dest, pan, t);
  // Start somewhere random inside the buffer so bursts never share a waveform.
  const offset = v.random() * Math.max(0, buf.duration - 1);
  src.start(t, offset);
  src.stop(stop);
  v.sources.push(src);
  v.end = Math.max(v.end, stop);
  return g;
}

/** A two-operator FM bell: warm when ratio is 2..3.5 and the index decays fast. */
function bell(v, { f, at = 0, gain = 0.2, ratio = 2.76, index = 1.6, attack = 0.004, decay = 1.2,
  dest = v.out, pan, lp = 4500 } = {}) {
  const { ctx } = v;
  const t = v.t + at;
  const fc = nyq(v, f * v.rate);
  const car = ctx.createOscillator();
  car.type = 'sine';
  car.frequency.setValueAtTime(fc, t);
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(nyq(v, fc * ratio), t);
  const modGain = ctx.createGain();
  // Modulation depth in Hz: starts bright, settles quickly into a pure-ish tone.
  modGain.gain.setValueAtTime(fc * index, t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(fc * index * 0.04, MIN), t + Math.min(decay * 0.35, 0.5));
  mod.connect(modGain).connect(car.frequency);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(nyq(v, lp), t);
  filt.Q.setValueAtTime(0.4, t);
  const g = ctx.createGain();
  const stop = envelope(g.gain, t, gain, attack, decay);
  car.connect(filt).connect(g);
  connectPanned(v, g, dest, pan, t);
  track(v, car, t, stop);
  track(v, mod, t, stop);
  return g;
}

function connectPanned(v, node, dest, pan, t) {
  if (pan && v.ctx.createStereoPanner) {
    const p = v.ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
    node.connect(p).connect(dest);
  } else {
    node.connect(dest);
  }
}

/** A soft low "thump" (sine falling in pitch) — the body of steps, landings and placing things. */
const thump = (v, { f = 110, f1 = 55, gain = 0.4, decay = 0.12, at = 0 } = {}) =>
  tone(v, { f, f1, gain, attack: 0.004, decay, at, glideTime: decay * 0.8, lp: 400 });

// Note frequencies (equal temperament, A4 = 440).
const N = (semis) => 440 * 2 ** (semis / 12);
const C4 = N(-9), D4 = N(-7), E4 = N(-5), G4 = N(-2), A4 = N(0), B4 = N(2);
const C5 = N(3), D5 = N(5), E5 = N(7), G5 = N(10), A5 = N(12), B5 = N(14);
const C6 = N(15), D6 = N(17), E6 = N(19), G6 = N(22), A6 = N(24);

// Footstep takes: [noise centre Hz, thump Hz, decay s] per variant.
const STEP_TAKES = {
  felt: [[520, 95, 0.08], [460, 88, 0.09], [600, 102, 0.075], [540, 92, 0.085]],
  stone: [[1500, 150, 0.05], [1300, 140, 0.055], [1750, 160, 0.045], [1400, 145, 0.05]],
  grass: [[3000, 0, 0.1], [2600, 0, 0.11], [3400, 0, 0.09], [2800, 0, 0.12]],
  water: [[900, 0, 0.14], [780, 0, 0.16], [1050, 0, 0.13], [850, 0, 0.15]],
};

function step(surface) {
  return (v, o) => {
    const [fc, fth, dec] = STEP_TAKES[surface][(o.variant ?? 0) % 4];
    const run = o.running ? 1 : 0;
    const bright = 1 + 0.25 * run; // running: brighter, shorter, a touch louder (gain set in index.js)
    const d = dec * (1 - 0.15 * run);
    if (surface === 'felt') {
      noise(v, { color: 'pink', filter: 'lowpass', f: fc * bright, f1: fc * 0.6, gain: 0.5, attack: 0.01, decay: d });
      thump(v, { f: fth, f1: fth * 0.6, gain: 0.35, decay: d * 0.9 });
    } else if (surface === 'stone') {
      noise(v, { color: 'white', filter: 'bandpass', f: fc * bright, q: 1.4, gain: 0.4, attack: 0.003, decay: d });
      tone(v, { f: fth * 2.2, f1: fth * 1.8, type: 'triangle', gain: 0.12, attack: 0.002, decay: 0.04, lp: 1200 });
      thump(v, { f: fth, f1: fth * 0.7, gain: 0.25, decay: 0.06 });
    } else if (surface === 'grass') {
      // Two quick brushes: the blades bending, then springing back.
      noise(v, { color: 'white', filter: 'bandpass', f: fc * bright, f1: fc * 0.8, q: 0.9, gain: 0.25, attack: 0.012, decay: d * 0.6, highpass: 900 });
      noise(v, { color: 'pink', filter: 'bandpass', f: fc * 0.75 * bright, q: 0.8, gain: 0.18, at: 0.035, attack: 0.015, decay: d, highpass: 700 });
      thump(v, { f: 85, f1: 60, gain: 0.15, decay: 0.06 });
    } else {
      noise(v, { color: 'pink', filter: 'bandpass', f: fc * 0.8, f1: fc * 1.6 * bright, q: 1.2, gain: 0.4, attack: 0.008, decay: d });
      tone(v, { f: 260 + (o.variant ?? 0) * 30, f1: 520 + (o.variant ?? 0) * 40, gain: 0.12, attack: 0.004, decay: 0.07, at: 0.02, lp: 1800 });
      noise(v, { color: 'white', filter: 'bandpass', f: 2400, q: 2, gain: 0.08, at: 0.05, attack: 0.01, decay: 0.12 });
    }
  };
}

/** A soft two-note "pluck" (triangle through a closing low-pass). */
function pluck(v, f, at, gain = 0.25, decay = 0.35) {
  tone(v, { f, type: 'triangle', at, gain, attack: 0.004, decay, lp: Math.min(f * 3.5, 4500) });
  tone(v, { f: f * 2, type: 'sine', at, gain: gain * 0.18, attack: 0.004, decay: decay * 0.6 });
}

/** A short breathy whoosh: band-passed noise sweeping up then down. */
function whoosh(v, { f0 = 300, f1 = 1400, dur = 0.3, gain = 0.3, at = 0 } = {}) {
  noise(v, { color: 'pink', filter: 'bandpass', f: f0, f1, q: 1.1, gain, attack: dur * 0.45, decay: dur * 0.55, sweep: dur * 0.6, at });
}

/** Small cluster of fluffy noise grains (fur, felt, wool being handled). */
function rustle(v, { grains = 7, spread = 0.4, gain = 0.18, f = 2000, at = 0 } = {}) {
  for (let i = 0; i < grains; i++) {
    const t = at + (i / grains) * spread + v.random() * 0.03;
    noise(v, { color: 'pink', filter: 'bandpass', f: f * (0.75 + v.random() * 0.6), q: 0.9, gain: gain * (0.6 + v.random() * 0.4), at: t, attack: 0.012, decay: 0.05 + v.random() * 0.04, highpass: 500 });
  }
}

export const RECIPES = {
  'step-felt': step('felt'),
  'step-stone': step('stone'),
  'step-grass': step('grass'),
  'step-water': step('water'),

  jump(v) {
    whoosh(v, { f0: 380, f1: 1300, dur: 0.18, gain: 0.25 });
    tone(v, { f: 280, f1: 420, type: 'triangle', gain: 0.08, attack: 0.01, decay: 0.1, lp: 1500 });
    noise(v, { color: 'pink', filter: 'lowpass', f: 500, gain: 0.25, attack: 0.005, decay: 0.06 });
  },

  land(v, o) {
    const k = 0.3 + 0.7 * (Number.isFinite(o.impact) ? Math.min(1, Math.max(0, o.impact)) : 0.5);
    thump(v, { f: 120 - 30 * k, f1: 48, gain: 0.55 * k, decay: 0.1 + 0.12 * k });
    noise(v, { color: 'brown', filter: 'lowpass', f: 380 + 200 * k, gain: 0.5 * k, attack: 0.004, decay: 0.08 + 0.1 * k });
    if (o.surface === 'water') {
      noise(v, { color: 'pink', filter: 'bandpass', f: 700, f1: 1800, q: 1, gain: 0.35 * k, at: 0.01, attack: 0.01, decay: 0.25 });
    } else if (o.surface === 'grass') {
      noise(v, { color: 'white', filter: 'bandpass', f: 2800, q: 0.8, gain: 0.15 * k, attack: 0.01, decay: 0.1, highpass: 900 });
    } else if (o.surface === 'stone') {
      noise(v, { color: 'white', filter: 'bandpass', f: 1400, q: 1.4, gain: 0.2 * k, attack: 0.003, decay: 0.06 });
    }
  },

  pickup(v) {
    pluck(v, E5, 0, 0.25, 0.3);
    pluck(v, B5, 0.07, 0.22, 0.45);
    tone(v, { f: E6 * 2, at: 0.07, gain: 0.02, attack: 0.01, decay: 0.25 });
  },

  'pickup-rare'(v) {
    // A sparkly pentatonic bell arpeggio rising to a held top note.
    const notes = [G5, B5, D6, G6, B5 * 2];
    notes.forEach((f, i) => bell(v, { f, at: i * 0.085, gain: 0.16 - i * 0.012, decay: 0.9 + i * 0.2, ratio: 3.01, index: 1.2, pan: (i - 2) * 0.18 }));
    for (let i = 0; i < 6; i++) {
      tone(v, { f: 3200 + v.random() * 1800, at: 0.1 + i * 0.07 + v.random() * 0.03, gain: 0.015, attack: 0.003, decay: 0.12, pan: v.random() * 1.4 - 0.7 });
    }
    tone(v, { f: G4, type: 'triangle', at: 0, gain: 0.08, attack: 0.03, decay: 1.2, lp: 1200 });
  },

  sighting(v) {
    // A soft two-note chirp, like a tiny "oh!".
    tone(v, { f: 1250, f1: 1500, gain: 0.14, attack: 0.012, decay: 0.09, glideTime: 0.06, lp: 3000 });
    tone(v, { f: 1700, f1: 1580, gain: 0.12, at: 0.13, attack: 0.012, decay: 0.16, glideTime: 0.08, lp: 3000 });
  },

  'ui-move'(v) {
    tone(v, { f: 880, gain: 0.3, attack: 0.003, decay: 0.05, lp: 2500 });
    tone(v, { f: 440, type: 'triangle', gain: 0.12, attack: 0.003, decay: 0.04, lp: 1500 });
    noise(v, { color: 'pink', filter: 'bandpass', f: 1800, q: 1.2, gain: 0.1, attack: 0.002, decay: 0.025 });
  },

  'ui-confirm'(v) {
    pluck(v, A5 * 0.75, 0, 0.22, 0.15);
    pluck(v, A5 * 1.125, 0.06, 0.22, 0.25);
  },

  'ui-back'(v) {
    pluck(v, A5 * 0.75, 0, 0.2, 0.12);
    pluck(v, A5 * 0.5625, 0.06, 0.2, 0.2);
  },

  'ui-open'(v) {
    whoosh(v, { f0: 600, f1: 2200, dur: 0.16, gain: 0.12 });
    pluck(v, D5, 0.05, 0.16, 0.18);
    pluck(v, A5, 0.1, 0.14, 0.25);
  },

  'ui-close'(v) {
    whoosh(v, { f0: 2000, f1: 600, dur: 0.16, gain: 0.1 });
    pluck(v, A5, 0.02, 0.14, 0.14);
    pluck(v, D5, 0.07, 0.15, 0.22);
  },

  'page-turn'(v, o) {
    // A felt page lifting, sliding over, settling: fluttering band-passed noise.
    const k = [1, 0.88, 1.12][(o.variant ?? 0) % 3];
    noise(v, { color: 'pink', filter: 'bandpass', f: 1800 * k, f1: 3800 * k, q: 0.9, gain: 0.14, attack: 0.06, decay: 0.12, sweep: 0.15 });
    noise(v, { color: 'white', filter: 'bandpass', f: 3200 * k, f1: 2200 * k, q: 1, gain: 0.09, at: 0.12, attack: 0.03, decay: 0.15, highpass: 1200 });
    noise(v, { color: 'pink', filter: 'lowpass', f: 700, gain: 0.12, at: 0.24, attack: 0.008, decay: 0.07 });
  },

  'door-open'(v) {
    // Deep soft rumble (brown noise + a low sine) under a slow, wobbly creak of wood and felt.
    noise(v, { color: 'brown', filter: 'lowpass', f: 140, f1: 90, q: 0.6, gain: 0.8, attack: 0.4, hold: 0.8, decay: 1.4, sweep: 2.4 });
    tone(v, { f: 46, f1: 40, gain: 0.3, attack: 0.5, hold: 0.6, decay: 1.2, lp: 200 });
    const creak = (at, f, f1, dur, gain) => {
      tone(v, { f, f1, type: 'triangle', at, gain, attack: 0.08, hold: dur * 0.4, decay: dur * 0.6, glideTime: dur, lp: 900, vibrato: { rate: 11 + v.random() * 5, depth: 0.04 } });
      noise(v, { color: 'pink', filter: 'bandpass', f: f * 4, q: 3, gain: gain * 0.6, at, attack: 0.08, hold: dur * 0.3, decay: dur * 0.6 });
    };
    creak(0.25, 150, 185, 0.7, 0.07);
    creak(1.05, 175, 140, 0.9, 0.06);
    // The door settling against felt.
    thump(v, { f: 80, f1: 45, gain: 0.3, decay: 0.25, at: 2.1 });
    noise(v, { color: 'pink', filter: 'lowpass', f: 400, gain: 0.2, at: 2.1, attack: 0.01, decay: 0.15 });
  },

  'puzzle-turn'(v, o) {
    // A wooden click: two resonant ticks and a tiny hollow tock.
    const k = [1, 0.92, 1.08][(o.variant ?? 0) % 3];
    noise(v, { color: 'white', filter: 'bandpass', f: 1900 * k, q: 6, gain: 0.5, attack: 0.001, decay: 0.025 });
    tone(v, { f: 520 * k, f1: 480 * k, type: 'triangle', gain: 0.14, attack: 0.002, decay: 0.05, lp: 1500 });
    noise(v, { color: 'white', filter: 'bandpass', f: 1500 * k, q: 6, gain: 0.35, at: 0.055, attack: 0.001, decay: 0.03 });
    tone(v, { f: 390 * k, type: 'triangle', at: 0.055, gain: 0.1, attack: 0.002, decay: 0.06, lp: 1200 });
  },

  'puzzle-solve'(v) {
    // A warm strummed major-9 chord with a bell on top.
    [C4, G4, B4, D5, E5].forEach((f, i) => {
      tone(v, { f, type: 'triangle', at: i * 0.045, gain: 0.11, attack: 0.02, decay: 2.2, lp: 1600, pan: (i - 2) * 0.2 });
      tone(v, { f: f * 1.003, type: 'sine', at: i * 0.045, gain: 0.05, attack: 0.03, decay: 2, pan: (2 - i) * 0.15 });
    });
    bell(v, { f: G5, at: 0.25, gain: 0.1, decay: 1.6, ratio: 3.5, index: 1 });
    tone(v, { f: C4 / 2, type: 'sine', gain: 0.12, attack: 0.05, decay: 2.2 });
  },

  'quest-step'(v) {
    bell(v, { f: E5, gain: 0.14, decay: 0.9, ratio: 2, index: 1.2 });
    bell(v, { f: A5, at: 0.12, gain: 0.13, decay: 1.2, ratio: 2, index: 1.2 });
  },

  'quest-done'(v) {
    // Small fanfare chime: a rising arpeggio landing on a ringing chord.
    [C5, E5, G5].forEach((f, i) => bell(v, { f, at: i * 0.1, gain: 0.12, decay: 0.7, ratio: 2, index: 1.4, pan: (i - 1) * 0.25 }));
    [C6, E6, G5].forEach((f) => bell(v, { f, at: 0.32, gain: 0.1, decay: 2, ratio: 3.01, index: 1 }));
    [C4, G4].forEach((f) => tone(v, { f, type: 'triangle', at: 0.32, gain: 0.08, attack: 0.03, decay: 1.8, lp: 1200 }));
    for (let i = 0; i < 5; i++) {
      tone(v, { f: 3000 + v.random() * 2000, at: 0.36 + i * 0.09, gain: 0.012, attack: 0.003, decay: 0.14, pan: v.random() * 1.2 - 0.6 });
    }
  },

  'dog-bark'(v, o) {
    // A soft "boof": a short voiced glide through a mouth-like band-pass, plus a puff of breath.
    const k = [1, 0.9, 1.1][(o.variant ?? 0) % 3];
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(1, v.t);
    const formant = v.ctx.createBiquadFilter();
    formant.type = 'lowpass';
    formant.frequency.setValueAtTime(nyq(v, 900 * k), v.t);
    formant.frequency.exponentialRampToValueAtTime(nyq(v, 420 * k), v.t + 0.16);
    formant.Q.setValueAtTime(1.5, v.t);
    g.connect(formant).connect(v.out);
    tone(v, { f: 240 * k, f1: 150 * k, type: 'triangle', gain: 0.5, attack: 0.012, decay: 0.15, glideTime: 0.14, dest: g });
    tone(v, { f: 120 * k, f1: 85 * k, type: 'sine', gain: 0.35, attack: 0.012, decay: 0.14, dest: g });
    noise(v, { color: 'pink', filter: 'bandpass', f: 600 * k, q: 1.2, gain: 0.25, attack: 0.01, decay: 0.12 });
  },

  'dog-pant'(v) {
    // Happy panting: alternating breathy in/out puffs.
    for (let i = 0; i < 6; i++) {
      const out = i % 2 === 0;
      noise(v, { color: 'pink', filter: 'bandpass', f: out ? 1300 : 1000, q: 1.5, gain: out ? 0.22 : 0.14, at: i * 0.17 + v.random() * 0.02, attack: 0.03, decay: 0.09, highpass: 400 });
    }
  },

  'critter-squeak'(v, o) {
    const k = [1, 1.12, 0.9][(o.variant ?? 0) % 3];
    tone(v, { f: 1700 * k, f1: 2500 * k, gain: 0.14, attack: 0.015, decay: 0.08, glideTime: 0.05, lp: 3500, vibrato: { rate: 28, depth: 0.03 } });
    tone(v, { f: 2300 * k, f1: 1900 * k, gain: 0.08, at: 0.07, attack: 0.01, decay: 0.07, glideTime: 0.05, lp: 3500 });
  },

  pet(v) {
    rustle(v, { grains: 8, spread: 0.42, gain: 0.2, f: 1700 });
    noise(v, { color: 'pink', filter: 'lowpass', f: 500, gain: 0.12, attack: 0.1, decay: 0.3 });
  },

  throw(v) {
    whoosh(v, { f0: 250, f1: 1500, dur: 0.38, gain: 0.32 });
    whoosh(v, { f0: 500, f1: 2400, dur: 0.3, gain: 0.08, at: 0.04 });
  },

  place(v) {
    thump(v, { f: 150, f1: 70, gain: 0.45, decay: 0.1 });
    noise(v, { color: 'pink', filter: 'lowpass', f: 420, gain: 0.35, attack: 0.004, decay: 0.08 });
    rustle(v, { grains: 3, spread: 0.08, gain: 0.08, f: 1600, at: 0.02 });
  },

  'pickup-decor'(v) {
    rustle(v, { grains: 4, spread: 0.12, gain: 0.12, f: 1600 });
    tone(v, { f: 300, f1: 520, type: 'triangle', gain: 0.14, attack: 0.02, decay: 0.15, glideTime: 0.12, lp: 1400, at: 0.04 });
    pluck(v, D5, 0.12, 0.1, 0.18);
  },

  splash(v, o) {
    const k = [1, 0.9, 1.1][(o.variant ?? 0) % 3];
    noise(v, { color: 'pink', filter: 'bandpass', f: 700 * k, f1: 2000 * k, q: 0.9, gain: 0.45, attack: 0.01, decay: 0.3, sweep: 0.1 });
    noise(v, { color: 'white', filter: 'bandpass', f: 2600 * k, f1: 1800 * k, q: 1.2, gain: 0.12, at: 0.05, attack: 0.02, decay: 0.4, highpass: 900 });
    thump(v, { f: 130, f1: 60, gain: 0.25, decay: 0.12 });
    const drops = 3 + Math.floor(v.random() * 3);
    for (let i = 0; i < drops; i++) {
      const f = 500 + v.random() * 500;
      tone(v, { f, f1: f * 1.9, at: 0.15 + v.random() * 0.45, gain: 0.05, attack: 0.003, decay: 0.05, glideTime: 0.025, lp: 2500, pan: v.random() * 1.2 - 0.6 });
    }
  },

  save(v) {
    bell(v, { f: G6 * 0.75, gain: 0.12, decay: 0.6, ratio: 2, index: 0.9 });
    bell(v, { f: G6, at: 0.08, gain: 0.08, decay: 0.8, ratio: 2, index: 0.8 });
  },

  error(v) {
    // A muted "bonk": soft, low, short.
    tone(v, { f: 190, f1: 150, type: 'sine', gain: 0.35, attack: 0.006, decay: 0.16, lp: 600 });
    tone(v, { f: 95, type: 'triangle', gain: 0.15, attack: 0.006, decay: 0.12, lp: 400 });
    noise(v, { color: 'pink', filter: 'lowpass', f: 350, gain: 0.15, attack: 0.003, decay: 0.05 });
  },
};

// Exported for the ambience module (drips, gurgles, chirps reuse the same primitives).
export const primitives = { tone, noise, bell, envelope, thump };
export const NOTES = { C4, D4, E4, G4, A4, B4, C5, D5, E5, G5, A5, B5, C6, D6, E6, G6, A6 };
