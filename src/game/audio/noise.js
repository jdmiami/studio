// Pure sample generators for the procedural audio (they fill Float32Arrays; no Web Audio), so the
// noise colours, seamless loops and the reverb impulse can be checked under node:test.

/** White noise in [-1, 1). */
export function fillWhite(out, random = Math.random) {
  for (let i = 0; i < out.length; i++) out[i] = random() * 2 - 1;
  return out;
}

/** Pink noise (-3 dB/octave, Paul Kellet's filter): soft and even, good for water and wind. */
export function fillPink(out, random = Math.random) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return normalize(out, 0.9);
}

/** Brown(ian) noise (-6 dB/octave, leaky integrator): a deep rumble for room tone and thuds. */
export function fillBrown(out, random = Math.random) {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    out[i] = last;
  }
  // Remove the DC drift so the bed does not push the speaker cone.
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i];
  mean /= out.length || 1;
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  return normalize(out, 0.9);
}

/** Scales so the absolute peak equals `peak` (silence stays silence). */
export function normalize(out, peak = 1) {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return out;
}

/**
 * Makes a buffer loop without a click: the last `fade` samples are equal-power crossfaded into the
 * first `fade`, and the buffer is shortened by `fade`, so sample[n-1] flows into sample[0].
 * Returns a new (shorter) Float32Array.
 */
export function makeSeamless(data, fade) {
  const n = data.length;
  fade = Math.max(1, Math.min(Math.floor(fade), Math.floor(n / 2)));
  const len = n - fade;
  const out = new Float32Array(len);
  out.set(data.subarray(0, len));
  for (let i = 0; i < fade; i++) {
    const t = (i + 0.5) / fade;
    const a = Math.sin(t * Math.PI / 2); // in: the buffer's head
    const b = Math.cos(t * Math.PI / 2); // out: the tail that used to follow sample len-1
    out[i] = data[i] * a + data[len + i] * b;
  }
  return out;
}

/**
 * A soft room impulse: exponentially decaying noise that also darkens over time (a one-pole
 * low-pass whose cutoff falls), like sound soaking into felt. `channels` is an array of
 * Float32Arrays (one per channel, decorrelated).
 */
export function fillImpulse(channels, sampleRate, { decay = 1.6, predelay = 0.012, random = Math.random } = {}) {
  for (const ch of channels) {
    let lp = 0;
    const pre = Math.floor(predelay * sampleRate);
    for (let i = 0; i < ch.length; i++) {
      if (i < pre) { ch[i] = 0; continue; }
      const t = (i - pre) / sampleRate;
      const env = Math.exp((-6.9 * t) / decay); // -60 dB at `decay` seconds
      // Cutoff coefficient: bright at the start, dark at the end.
      const k = 0.55 * Math.exp(-t * 2.2) + 0.04;
      lp += k * ((random() * 2 - 1) - lp);
      ch[i] = lp * env;
    }
    // Fade the very end to zero.
    const tail = Math.min(ch.length, Math.floor(0.05 * sampleRate));
    for (let i = 0; i < tail; i++) ch[ch.length - 1 - i] *= i / tail;
    normalize(ch, 0.5);
  }
  return channels;
}
