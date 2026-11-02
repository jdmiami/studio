// Seeded randomness: every procedural decision draws from an Rng built from the trip's seed, so a
// seed (shareable as a short code) always makes the same trip. Mulberry32 core, string hashing by
// FNV-1a, and labelled forks so independent systems (terrain, rooms, finds, critters) keep their
// own streams and adding a draw in one does not reshuffle the others.

/** FNV-1a 32-bit hash of a string. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a fast 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I: readable aloud

/** A short shareable seed code (6 characters) from a 32-bit seed, and back. */
export function seedToCode(seed) {
  let s = seed >>> 0;
  let out = '';
  for (let i = 0; i < 7; i++) { out += ALPHABET[s % 32]; s = Math.floor(s / 32); }
  return out;
}
export function codeToSeed(code) {
  const clean = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (clean.length === 7 && [...clean].every((c) => ALPHABET.includes(c))) {
    let s = 0;
    for (let i = clean.length - 1; i >= 0; i--) s = s * 32 + ALPHABET.indexOf(clean[i]);
    return s >>> 0;
  }
  return hashString(clean || 'phluph');
}

/** An Rng: float, range, int, chance, pick, shuffle, weighted pick, gaussian-ish, labelled fork. */
export function createRng(seed) {
  const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = mulberry32(s);
  const rng = {
    seed: s,
    float: () => next(),
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)), // inclusive
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /** Picks from [{ weight, ...}] or [[item, weight]]. */
    weighted(table) {
      const entries = table.map((e) => (Array.isArray(e) ? { item: e[0], weight: e[1] } : { item: e, weight: e.weight }));
      const total = entries.reduce((t, e) => t + Math.max(0, e.weight), 0);
      let r = next() * total;
      for (const e of entries) {
        r -= Math.max(0, e.weight);
        if (r < 0) return e.item;
      }
      return entries[entries.length - 1].item;
    },
    /** Approximately normal, mean 0, sd 1 (sum of 4 uniforms). */
    gauss: () => (next() + next() + next() + next() - 2) * 1.732,
    /** An independent stream for a named subsystem. */
    fork: (label) => createRng((s ^ hashString(label)) >>> 0),
  };
  return rng;
}
