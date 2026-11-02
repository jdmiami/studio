// The noise terrain under a trip: a domain-warped fBm heightfield, snapped to the block grid and
// terraced into plateaus (integer tops, a half step where a slope is about to rise), shaped per
// biome. Pure arithmetic (see noise.js): bit-identical in every JS engine.

import { createWarpedField, smoothstep } from './noise.js';

export const WATER_TOP = -0.25; // the hub's pool sits a quarter block under the floor

/**
 * Per-biome look.
 *  scale: relief in blocks; freq: noise frequency (1 / cells); octaves, gain: fBm detail (few
 *  octaves keep terraces broad); warp: domain warp strength;
 *  half: width of the half-step band below each terrace rise (0 = none); floorBelow: tops at or
 *  below this become stone 'floor' (grotto canyon floors); maxTop: highest interior top.
 */
export const BIOMES = {
  meadow: {
    label: 'Meadow', scale: 3.2, bias: 0, contrast: 1, freq: 1 / 34, octaves: 3, gain: 0.4, warp: 0.9, half: 0.34, floorBelow: -1, maxTop: 4,
    trees: [['cube-tree', 3], ['willow', 1]],
    scatter: { r: 4.2, chance: 0.42, kinds: [['cube-tree', 3], ['stone', 3], ['mushroom', 2], ['pom', 1.5], ['willow', 0.6]] },
    critters: [['cream', 5], ['mint', 4], ['blush', 1]],
    rarity: { common: 1, uncommon: 1, rare: 1, legendary: 1 },
  },
  grotto: {
    label: 'Grotto', scale: 5.4, bias: -0.7, contrast: 1.5, freq: 1 / 30, octaves: 3, gain: 0.38, warp: 1.2, half: 0.16, floorBelow: 0, maxTop: 5,
    trees: [['cube-tree', 1], ['willow', 1]],
    scatter: { r: 3.8, chance: 0.48, kinds: [['mushroom', 5], ['dome', 1.5], ['stone', 2.5], ['cube-tree', 1]] },
    critters: [['cream', 4], ['mint', 1], ['blush', 4]],
    rarity: { common: 0.9, uncommon: 1, rare: 1.3, legendary: 1.5 },
  },
  lake: {
    label: 'Lake', scale: 2.4, bias: 0.6, contrast: 1, freq: 1 / 32, octaves: 3, gain: 0.4, warp: 1, half: 0.3, floorBelow: -1, maxTop: 4,
    trees: [['willow', 3], ['cube-tree', 1]],
    scatter: { r: 4.4, chance: 0.4, kinds: [['willow', 2.5], ['stone', 3], ['pom', 1.5], ['mushroom', 1]] },
    critters: [['cream', 1], ['mint', 5], ['blush', 3]],
    rarity: { common: 1, uncommon: 1.2, rare: 1.1, legendary: 1 },
  },
};

/** Snap a continuous height to the terrace grid: plateaus at integers, a half step before a rise. */
export function terrace(h, half) {
  const level = Math.floor(h);
  const fr = h - level;
  return half > 0 && fr >= 1 - half ? level + 0.5 : level;
}

/**
 * The base terrain for the interior of a trip.
 * @param rng an Rng fork for the terrain
 * @param biome 'meadow' | 'grotto' | 'lake'
 * @param o.w, o.d: area size in cells; o.ring: boundary width; o.calm: 0..1 flattening (rerolls)
 * @param o.spawnSide: 'N' | 'E' | 'S' | 'W' (the lake keeps away from it)
 * @returns {{ top: Float64Array, kind: string[], lake: object | null }}
 */
export function baseTerrain(rng, biome, { w, d, ring, calm = 0, spawnSide = 'S' }) {
  const B = BIOMES[biome];
  const field = createWarpedField(rng.fork('height'), { freq: B.freq, octaves: B.octaves, gain: B.gain, warp: B.warp });
  const top = new Float64Array(w * d);
  const kind = new Array(w * d).fill('wall');
  const scale = B.scale * (1 - 0.65 * calm);

  let lake = null;
  let shoreField = null;
  if (biome === 'lake') {
    const lr = rng.fork('lake');
    const away = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] }[spawnSide];
    const cx = w / 2 + lr.range(-3, 3) + away[0] * 3;
    const cz = d / 2 + lr.range(-3, 3) + away[1] * 3;
    const radius = lr.range(8, 11);
    const islands = [];
    const nIslands = lr.int(1, 3);
    for (let i = 0; i < nIslands; i++) {
      // Islands sit well inside the water: a point within 0.55 radii of the centre.
      let ix, iz;
      do { ix = lr.range(-1, 1); iz = lr.range(-1, 1); } while (ix * ix + iz * iz > 1);
      islands.push({ x: cx + ix * radius * 0.55, z: cz + iz * radius * 0.55, r: lr.range(1.6, 2.8) });
    }
    lake = { x: cx, z: cz, radius, islands };
    shoreField = createWarpedField(lr.fork('shore'), { freq: 1 / 7, octaves: 3, warp: 0.8 });
  }

  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      let u = field(x, z);
      if (B.contrast !== 1) u = smoothstep(0, 1, u * B.contrast - (B.contrast - 1) / 2);
      let h = B.bias + u * scale;
      if (lake) {
        const dx = x - lake.x;
        const dz = z - lake.z;
        const dist = Math.sqrt(dx * dx + dz * dz) / lake.radius + (shoreField(x, z) - 0.5) * 0.45;
        const shore = smoothstep(0.7, 1.15, dist);
        h = -1.2 + (h + 1.2) * shore;
        for (const isl of lake.islands) {
          const ex = x - isl.x;
          const ez = z - isl.z;
          const q = (ex * ex + ez * ez) / (isl.r * isl.r);
          if (q < 1) h = Math.max(h, -0.3 + (1 - q) * (1 - q) * 1.6);
        }
      }
      const interior = x >= ring && z >= ring && x < w - ring && z < d - ring;
      if (!interior) { top[i] = 0; continue; }
      if (lake && h < 0) {
        top[i] = WATER_TOP;
        kind[i] = 'water';
        continue;
      }
      let t = terrace(Math.max(0, h), B.half);
      t = Math.min(B.maxTop, Math.max(0, t));
      top[i] = t;
      kind[i] = t <= B.floorBelow ? 'floor' : 'wall';
    }
  }
  return { top, kind, lake };
}
