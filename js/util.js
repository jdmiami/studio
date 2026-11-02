// Stickerwild — shared helpers: math, seeded randomness, value noise.
'use strict';
const SW = (window.SW = window.SW || {});

SW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
SW.lerp = (a, b, t) => a + (b - a) * t;
SW.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
SW.TAU = Math.PI * 2;

// Integer hash -> [0, 1). Deterministic for (x, y, seed).
SW.hash = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 0x9e3779b9, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// Small seeded PRNG for one-off sequences.
SW.rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Smooth 2D value noise in [0, 1].
SW.makeNoise = (seed) => {
  const H = SW.hash;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = H(xi, yi, seed), b = H(xi + 1, yi, seed);
    const c = H(xi, yi + 1, seed), d = H(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
};

// Fractal sum of noise octaves, normalised to [0, 1].
SW.fbm = (noise, x, y, oct) => {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += noise(x * f + i * 17.3, y * f - i * 9.1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
};

SW.seedFromString = (str) => {
  const s = String(str).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10) % 1000000;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000000;
};

SW.store = {
  get(k, d) { try { const v = localStorage.getItem('stickerwild:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('stickerwild:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
