// Phluph audio: procedural ambience + SFX on the Web Audio API (no files, no music system).
//
//   const audio = createAudio({ events, settings });
//   addEventListener('pointerdown', () => audio.unlock(), { once: true }); // autoplay rules
//   audio.update(dt, { listenerPos, running });                          // every frame
//
// Graph:  voice -> bus.in ─┬──────────────── duck -> vol ─┐
//              └ wet send ─┴ convolver -> return ┘          ├─> master -> trim -> warm LPF
//         ambience layers ─> amb.in -> duck -> vol ─────────┤      -> glue comp -> limiter -> out
//         ui voices ───────> ui.in (+ reverb) -> vol ───────┘
// Volumes are 0..1 sliders mapped through a dB taper (mix.js) and glided with setTargetAtTime.
// Pause ducks sfx + ambience by PAUSE_DUCK_DB on their own duck gains, so it never fights a slider.
import { EVENTS } from '../core/contracts.js';
import {
  AMBIENCE_FADE_SECONDS, AMBIENCE_PRESETS, DEFAULT_VOLUMES, MAX_VOICES, PAUSE_DUCK_DB, REVERB_PRESETS,
  SOUNDS, SOUND_EVENTS, VOICE_MAKEUP_DB, areaPresetKey, createNoRepeatPicker, createVoiceLimiter, dbToGain, distance3,
  distanceGain, jitter, mergeVolumes, normalizeAmbience, routeEvent, timeConstantFor, volumeToGain,
} from './mix.js';
import { fillBrown, fillImpulse, fillPink, fillWhite, makeSeamless } from './noise.js';
import { RECIPES } from './synth.js';
import { createAmbience } from './ambience.js';

const VOLUME_TC = 0.05; // s: slider moves glide in ~150 ms, no zipper noise or clicks
const DUCK_TC = 0.15; // s: pause duck glides in ~0.45 s
const RUN_STEP_DB = 2; // running footsteps are a touch louder (and brighter, in the recipe)
const STEAL_TC = 0.012; // s: stolen voices fade out over ~40 ms instead of cutting

function defaultContext() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
}

/**
 * @param {{ events?: ReturnType<import('../core/events.js').createEvents>, settings?: object,
 *   contextFactory?: () => BaseAudioContext, random?: () => number }} opts
 *   contextFactory and random exist for tests and offline rendering; the game passes neither.
 */
export function createAudio({ events, settings, contextFactory = defaultContext, random = Math.random } = {}) {
  let volumes = mergeVolumes(DEFAULT_VOLUMES, settings?.volume);
  let ambience = normalizeAmbience(AMBIENCE_PRESETS.hub);
  let reverb = REVERB_PRESETS.hub;
  let paused = false;
  let listenerPos = null;
  let playerRunning = false;
  let disposed = false;

  let ctx = null;
  let graph = null;
  let amb = null;
  const limiter = createVoiceLimiter({ maxVoices: MAX_VOICES });
  const pickers = new Map();
  const live = new Map(); // voice id -> { out, wet, sources }
  let dying = []; // stolen voices fading out: { voice, at }

  // ---- graph ---------------------------------------------------------------------------------

  function makeBuffer(seconds, fill, channels = 1, seamless = false) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    let data = fill(new Float32Array(len), random);
    if (seamless) data = makeSeamless(data, Math.floor(0.25 * rate));
    const buf = ctx.createBuffer(channels, data.length, rate);
    for (let c = 0; c < channels; c++) buf.getChannelData(c).set(data);
    return buf;
  }

  function build() {
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };

    const buffers = {
      white: makeBuffer(2, fillWhite),
      pink: makeBuffer(8, fillPink, 1, true),
      brown: makeBuffer(8, fillBrown, 1, true),
    };
    const irLen = Math.floor(1.8 * ctx.sampleRate);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    fillImpulse([ir.getChannelData(0), ir.getChannelData(1)], ctx.sampleRate, { decay: 1.6, random });

    // Master chain: user volume -> headroom trim -> warm low-pass -> gentle glue -> safety limiter.
    const master = g(volumeToGain(volumes.master));
    const trim = g(dbToGain(-3));
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass'; warm.frequency.value = 9500; warm.Q.value = 0.5;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 2.5;
    glue.attack.value = 0.012; glue.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20;
    limit.attack.value = 0.002; limit.release.value = 0.12;
    master.connect(trim).connect(warm).connect(glue).connect(limit).connect(ctx.destination);

    const bus = (name, { duck, verb, soften }) => {
      const b = { in: g(1), vol: g(volumeToGain(volumes[name])), duck: duck ? g(paused ? dbToGain(PAUSE_DUCK_DB) : 1) : null };
      const tail = b.duck ?? b.vol;
      if (b.duck) b.duck.connect(b.vol);
      b.vol.connect(master);
      let head = b.in;
      if (soften) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = soften; lp.Q.value = 0.5;
        head.connect(lp);
        head = lp;
      }
      head.connect(tail);
      if (verb !== undefined) {
        b.verbIn = g(1);
        const conv = ctx.createConvolver();
        conv.normalize = true;
        conv.buffer = ir;
        b.verbReturn = g(verb);
        b.verbIn.connect(conv).connect(b.verbReturn).connect(tail);
      }
      return b;
    };

    graph = {
      master,
      buses: {
        sfx: bus('sfx', { duck: true, verb: reverb, soften: 8000 }),
        ambience: bus('ambience', { duck: true, soften: 7000 }),
        ui: bus('ui', { duck: false, verb: 0.5, soften: 9000 }),
      },
      buffers,
    };
    amb = createAmbience({ ctx, buffers, output: graph.buses.ambience.in, random });
    amb.setTargets(ambience, AMBIENCE_FADE_SECONDS + 1); // first fade-in from silence: a bit slower
  }

  const glideTo = (param, value, tc) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, tc);
  };

  // ---- voices ----------------------------------------------------------------------------------

  function freeVoice(voice) {
    for (const n of [voice.out, voice.wet]) { if (n) { try { n.disconnect(); } catch { /* already gone */ } } }
  }

  function reap(now) {
    for (const v of limiter.prune(now)) {
      const voice = live.get(v.id);
      if (voice) { freeVoice(voice); live.delete(v.id); }
    }
    if (dying.length) {
      const still = [];
      for (const d of dying) (d.at <= now ? freeVoice(d.voice) : still.push(d));
      dying = still;
    }
  }

  function steal(id) {
    const voice = live.get(id);
    live.delete(id);
    limiter.remove(id);
    if (!voice) return;
    const t = ctx.currentTime;
    voice.out.gain.cancelScheduledValues(t);
    voice.out.gain.setTargetAtTime(0, t, STEAL_TC);
    for (const s of voice.sources) { try { s.stop(t + STEAL_TC * 6); } catch { /* not started */ } }
    dying.push({ voice, at: t + STEAL_TC * 8 });
  }

  function pickerFor(name, count) {
    let p = pickers.get(name);
    if (!p) pickers.set(name, (p = createNoRepeatPicker(count, random)));
    return p;
  }

  /**
   * Plays a one-shot. opts: { gain (linear multiplier), pitch (rate multiplier), delay (s),
   * position ({x,y,z} | [x,y,z], attenuated against listenerPos), impact (land), surface (land),
   * running (steps), variant (force a take), reverb (send multiplier) }.
   * Returns the voice id, or false when silent (locked, unknown, cooled down, or inaudible).
   */
  function play(name, opts = {}) {
    if (disposed || !ctx || !graph || ctx.state === 'closed') return false;
    const def = SOUNDS[name];
    const recipe = RECIPES[name];
    if (!def || !recipe) return false;
    opts = opts ?? {};
    const now = ctx.currentTime;
    reap(now);

    const isStep = name.startsWith('step-');
    const running = Boolean(opts.running ?? (isStep ? playerRunning : false));
    const j = jitter(random, def);
    let gain = dbToGain(VOICE_MAKEUP_DB + def.levelDb + (isStep && running ? RUN_STEP_DB : 0)) * j.gain;
    if (Number.isFinite(opts.gain)) gain *= Math.max(0, opts.gain);
    if (opts.position && listenerPos) {
      const d = distance3(opts.position, listenerPos);
      if (Number.isFinite(d)) gain *= distanceGain(d);
    }
    if (!(gain > 1e-4)) return false;

    const res = limiter.admit(name, now, { cooldown: def.cooldown, maxPerSound: def.maxVoices, duration: def.duration });
    if (!res.ok) return false;
    for (const v of res.steal) steal(v.id);

    const bus = graph.buses[def.bus];
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(bus.in);
    let wet = null;
    if (bus.verbIn) {
      wet = ctx.createGain();
      wet.gain.value = Math.max(0, def.reverb * (Number.isFinite(opts.reverb) ? opts.reverb : 1));
      out.connect(wet).connect(bus.verbIn);
    }
    const variant = Number.isInteger(opts.variant) ? opts.variant : def.variants > 1 ? pickerFor(name, def.variants).next() : 0;
    const t = now + 0.005 + (Number.isFinite(opts.delay) ? Math.max(0, opts.delay) : 0);
    const pitch = Number.isFinite(opts.pitch) && opts.pitch > 0 ? opts.pitch : 1;
    const v = { ctx, t, out, rate: j.rate * pitch, random, buffers: graph.buffers, variant, sources: [], end: t };
    try {
      recipe(v, { ...opts, variant, running });
    } catch (e) {
      console.error(`[audio] ${name} failed`, e);
      for (const s of v.sources) { try { s.stop(); } catch { /* not started */ } }
      freeVoice({ out, wet });
      limiter.remove(res.id);
      return false;
    }
    limiter.setEnd(res.id, v.end + 0.05);
    live.set(res.id, { out, wet, sources: v.sources });
    return res.id;
  }

  // ---- public controls -----------------------------------------------------------------------

  function setVolumes(next) {
    volumes = mergeVolumes(volumes, next);
    if (!graph) return;
    glideTo(graph.master.gain, volumeToGain(volumes.master), VOLUME_TC);
    for (const name of ['sfx', 'ambience', 'ui']) glideTo(graph.buses[name].vol.gain, volumeToGain(volumes[name]), VOLUME_TC);
  }

  /** The whole ambience scene: layers not given fade to 0. Crossfades over ~1.5 s. */
  function setAmbience(targets) {
    ambience = normalizeAmbience(targets);
    amb?.setTargets(ambience, AMBIENCE_FADE_SECONDS);
  }

  function setReverb(amount) {
    reverb = Math.max(0, amount);
    if (graph) glideTo(graph.buses.sfx.verbReturn.gain, reverb, timeConstantFor(AMBIENCE_FADE_SECONDS));
  }

  function setPaused(p) {
    paused = Boolean(p);
    if (!graph) return;
    const target = paused ? dbToGain(PAUSE_DUCK_DB) : 1;
    glideTo(graph.buses.sfx.duck.gain, target, DUCK_TC);
    glideTo(graph.buses.ambience.duck.gain, target, DUCK_TC);
  }

  /** Creates (first call) or resumes the AudioContext. Call from a user gesture. */
  function unlock() {
    if (disposed) return false;
    if (!ctx) {
      try {
        ctx = contextFactory();
      } catch (e) {
        console.warn('[audio] no AudioContext', e);
        ctx = null;
      }
      if (!ctx) return false;
      try {
        build();
      } catch (e) {
        console.error('[audio] graph build failed', e);
        try { ctx.close?.(); } catch { /* ignore */ }
        ctx = null; graph = null; amb = null;
        return false;
      }
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    return true;
  }

  function update(dt, { listenerPos: lp, running } = {}) {
    if (lp !== undefined) listenerPos = lp;
    if (running !== undefined) playerRunning = Boolean(running);
    if (!ctx || disposed) return;
    reap(ctx.currentTime);
    amb?.update(dt);
  }

  // ---- event bus -----------------------------------------------------------------------------

  const offs = [];
  if (events?.on) {
    for (const type of SOUND_EVENTS) {
      offs.push(events.on(type, (payload) => {
        for (const { name, opts } of routeEvent(type, payload)) play(name, opts);
      }));
    }
    offs.push(events.on(EVENTS.SETTINGS_CHANGED, (p) => {
      const vol = p?.settings?.volume ?? p?.volume;
      if (vol) setVolumes(vol);
    }));
    offs.push(events.on(EVENTS.AREA_ENTERED, (p) => {
      const key = areaPresetKey(p);
      setAmbience(AMBIENCE_PRESETS[key]);
      setReverb(REVERB_PRESETS[key]);
    }));
    offs.push(events.on(EVENTS.PAUSED, () => setPaused(true)));
    offs.push(events.on(EVENTS.RESUMED, () => setPaused(false)));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const off of offs) { try { off(); } catch { /* ignore */ } }
    offs.length = 0;
    for (const id of [...live.keys()]) steal(id);
    amb?.dispose();
    limiter.clear();
    if (ctx) { try { ctx.close?.()?.catch?.(() => {}); } catch { /* ignore */ } }
    ctx = null; graph = null; amb = null;
  }

  return {
    unlock, setVolumes, play, setAmbience, update, dispose,
    /** Debug/test snapshot (not part of the game contract). */
    getState: () => ({
      unlocked: Boolean(ctx), contextState: ctx?.state ?? null, volumes: { ...volumes },
      ambience: { ...ambience }, reverb, paused, voices: limiter.count(), disposed,
    }),
  };
}

export { SOUND_NAMES, AMBIENCE_PRESETS } from './mix.js';
