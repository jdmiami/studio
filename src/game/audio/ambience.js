// Procedural ambience loops, all built from looping noise buffers plus sparse synthesized events:
//   water  brook: two band-passed pink-noise bands whose centres wander (gurgles) + soft bloops
//   wind   low-passed brown/pink noise under two slow LFOs plus random swells
//   cave   very low room tone (brown noise, low-pass ~150 Hz, faint 49 Hz hum) + rare soft drips
//   birds  no bed: occasional short chirp phrases, panned around the listener
// Each layer has its own level GainNode; setTargets() glides them with setTargetAtTime so area
// changes crossfade over ~AMBIENCE_FADE_SECONDS. update(dt) schedules the sparse events.
import { AMBIENCE_FADE_SECONDS, AMBIENCE_LAYERS, normalizeAmbience, timeConstantFor } from './mix.js';
import { primitives } from './synth.js';

const { tone, noise } = primitives;

// Per-layer loudness trims so a target of 1.0 is "full but comfortable" for that layer.
const LAYER_TRIM = { water: 0.55, wind: 0.6, cave: 0.9, birds: 0.7 };
// Below this target a layer is treated as off: no events are scheduled for it.
const ACTIVE = 0.02;

const between = (random, a, b) => a + random() * (b - a);

export function createAmbience({ ctx, buffers, output, random = Math.random }) {
  const now = () => ctx.currentTime;
  const nodes = []; // everything to disconnect on dispose
  const sources = []; // looping sources to stop on dispose
  const mk = (n) => (nodes.push(n), n);

  const loop = (buffer, rate = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(now(), random() * Math.max(0, buffer.duration - 0.1));
    sources.push(s);
    return mk(s);
  };
  const gain = (v = 1) => { const g = mk(ctx.createGain()); g.gain.value = v; return g; };
  const filter = (type, f, q = 0.7) => {
    const b = mk(ctx.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  };
  const lfo = (rate, depth, target) => {
    const o = mk(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.value = rate;
    const d = gain(depth);
    o.connect(d).connect(target);
    o.start(now());
    sources.push(o);
    return o;
  };

  // A soft echo shared by the sparse events (drips, chirps, bloops) so they sit in a space.
  const echoIn = gain(1);
  const echo = mk(ctx.createDelay(1));
  echo.delayTime.value = 0.23;
  const echoFb = gain(0.32);
  const echoTone = filter('lowpass', 2200, 0.5);
  const echoOut = gain(0.45);
  echoIn.connect(echo).connect(echoTone).connect(echoFb).connect(echo);
  echoTone.connect(echoOut).connect(output);

  const layers = {};
  for (const name of AMBIENCE_LAYERS) {
    const level = gain(0);
    level.connect(output);
    layers[name] = { level, target: 0, timer: between(random, 0.5, 2) };
  }

  // water: two wandering bands of pink noise.
  const water = {
    lo: filter('bandpass', 650, 0.9),
    hi: filter('bandpass', 1900, 1.6),
  };
  {
    const src = loop(buffers.pink, 1);
    const loG = gain(0.9), hiG = gain(0.35);
    src.connect(water.lo).connect(loG).connect(layers.water.level);
    src.connect(water.hi).connect(hiG).connect(layers.water.level);
    const src2 = loop(buffers.pink, 0.83); // a second, slower stream for depth
    const deep = filter('lowpass', 420, 0.5);
    src2.connect(deep).connect(gain(0.5)).connect(layers.water.level);
  }

  // wind: low-passed noise with slow LFO swells.
  const wind = { lp: filter('lowpass', 420, 0.6), swell: gain(0.65) };
  {
    const src = loop(buffers.brown, 1);
    const air = loop(buffers.pink, 0.7);
    const airBand = filter('bandpass', 900, 0.6);
    src.connect(wind.lp);
    air.connect(airBand).connect(gain(0.22)).connect(wind.lp);
    wind.lp.connect(wind.swell).connect(layers.wind.level);
    lfo(0.07, 0.22, wind.swell.gain);
    lfo(0.023, 0.13, wind.swell.gain);
    lfo(0.05, 160, wind.lp.frequency);
  }

  // cave: a very low room tone.
  {
    const src = loop(buffers.brown, 0.9);
    const lp = filter('lowpass', 150, 0.5);
    const hp = filter('highpass', 28, 0.5);
    const breath = gain(0.85); // the room breathes a little (inside the layer, so level 0 is silent)
    src.connect(lp).connect(hp).connect(breath).connect(layers.cave.level);
    lfo(0.04, 0.12, breath.gain);
    const hum = mk(ctx.createOscillator());
    hum.type = 'sine';
    hum.frequency.value = 49;
    hum.connect(gain(0.035)).connect(layers.cave.level);
    hum.start(now());
    sources.push(hum);
  }

  // ---- sparse events -------------------------------------------------------------------------

  const voice = (dest, at = 0) => ({ ctx, t: now() + at, out: dest, rate: 1, random, buffers, sources: [], end: 0 });
  // A per-event send (not tracked in `nodes`: it frees itself when the event's last source ends).
  const eventSend = (layer) => {
    const send = ctx.createGain();
    send.connect(layers[layer].level);
    send.connect(echoIn);
    return send;
  };
  const freeAfter = (v, send) => {
    const last = v.sources[v.sources.length - 1];
    if (last) last.onended = () => { try { send.disconnect(); } catch { /* already gone */ } };
  };

  function gurgle() {
    const t = now();
    const tc = between(random, 0.08, 0.3);
    water.lo.frequency.setTargetAtTime(between(random, 450, 950), t, tc);
    water.hi.frequency.setTargetAtTime(between(random, 1400, 2600), t, tc);
    water.lo.Q.setTargetAtTime(between(random, 0.7, 1.6), t, tc);
    if (random() < 0.45) {
      // A soft bloop: a sine that rises fast, like a bubble popping under the surface.
      const v = voice(layers.water.level);
      const f = between(random, 280, 520);
      tone(v, { f, f1: f * between(random, 1.6, 2.3), gain: 0.06, attack: 0.004, decay: 0.06, glideTime: 0.04, lp: 1800, pan: between(random, -0.6, 0.6) });
    }
  }

  function gust() {
    const t = now();
    wind.swell.gain.setTargetAtTime(between(random, 0.45, 0.95), t, between(random, 0.8, 2));
    wind.lp.frequency.setTargetAtTime(between(random, 260, 720), t, between(random, 1, 2.5));
  }

  function drip() {
    const send = eventSend('cave');
    const v = voice(send);
    const f = between(random, 900, 1400);
    tone(v, { f, f1: f * 1.9, gain: 0.08, attack: 0.002, decay: 0.07, glideTime: 0.025, lp: 3200, pan: between(random, -0.7, 0.7) });
    freeAfter(v, send);
  }

  function chirp() {
    const send = eventSend('birds');
    const pan = between(random, -0.85, 0.85);
    const base = between(random, 2300, 3400);
    const notes = 2 + Math.floor(random() * 3);
    const v = voice(send);
    for (let i = 0; i < notes; i++) {
      const up = random() < 0.5;
      const f = base * between(random, 0.92, 1.1);
      tone(v, { f, f1: up ? f * 1.25 : f * 0.8, at: i * between(random, 0.09, 0.14), gain: 0.05, attack: 0.008, decay: 0.05, glideTime: 0.05, lp: 4800, pan });
    }
    let lastVoice = v;
    if (random() < 0.3) {
      // A softer answer from somewhere else.
      const v2 = voice(send, (notes - 1) * 0.14 + between(random, 0.35, 0.9));
      const f = base * 0.85;
      tone(v2, { f, f1: f * 1.15, gain: 0.03, attack: 0.01, decay: 0.07, glideTime: 0.05, lp: 4200, pan: -pan * 0.7 });
      lastVoice = v2;
    }
    freeAfter(lastVoice, send);
  }

  // Event schedules: [fire, min interval s, max interval s].
  const EVENTS = { water: [gurgle, 0.35, 1.8], wind: [gust, 2.5, 7], cave: [drip, 3.5, 11], birds: [chirp, 1.6, 6.5] };

  let disposed = false;
  return {
    /** Glide every layer to its new 0..1 target over `seconds`. Missing layers fade to 0. */
    setTargets(targets, seconds = AMBIENCE_FADE_SECONDS) {
      if (disposed) return;
      const t = now();
      const norm = normalizeAmbience(targets);
      for (const name of AMBIENCE_LAYERS) {
        const L = layers[name];
        L.target = norm[name];
        L.level.gain.cancelScheduledValues(t);
        L.level.gain.setTargetAtTime(norm[name] * LAYER_TRIM[name], t, timeConstantFor(seconds));
      }
    },
    get targets() { return Object.fromEntries(AMBIENCE_LAYERS.map((n) => [n, layers[n].target])); },
    update(dt) {
      if (disposed || !(dt > 0)) return;
      dt = Math.min(dt, 0.25); // a long frame (tab switch) must not fire a burst of events
      for (const name of AMBIENCE_LAYERS) {
        const L = layers[name];
        L.timer -= dt;
        if (L.timer > 0) continue;
        const [fire, lo, hi] = EVENTS[name];
        // Busier layers fire a little more often.
        L.timer = between(random, lo, hi) / (0.6 + 0.6 * L.target);
        if (L.target > ACTIVE) fire();
      }
    },
    dispose() {
      disposed = true;
      for (const s of sources) { try { s.stop(); } catch { /* not started */ } }
      for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } }
    },
  };
}
