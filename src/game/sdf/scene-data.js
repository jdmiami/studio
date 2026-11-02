// The SDF renderer's scene data, as plain arrays (no three.js; tested in Node):
//
// - terrain: one RGBA float texel per column over the area's bounding box: R the column's top
//   (-100 for no column), G its kind code, B the bottom of a ceiling slab over it (1e4 for none),
//   A a stable per-column random in 0..1 (per-block tone jitter). The shader stacks rounded felt
//   cubes from y = -2 to the top (and from the ceiling bottom up to CEILING_TOP), exactly the
//   blocks the mesh renderer builds, so the physics (heightAt) and the picture agree.
// - props: the placed scenery as distance-field shapes, 4 texels each (packProps).

export const KIND_CODES = { wall: 0, floor: 1, step: 2, water: 3, stream: 4 };
export const CEILING_TOP = 10;
export const NO_TOP = -100;
export const NO_CEILING = 1e4;
export const PROP_TEXELS = 4;

/** Prop shape codes (the shader's switch). */
export const PROP = { CUBE_TREE: 1, WILLOW: 2, BROOM: 3, DOME: 4, MUSHROOM: 5, FENCE: 6, POM: 7, STONE: 8, KNIT: 9 };

const hash = (x, z) => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * @param {Map<string,{top:number,kind:string}>|Record<string,{top:number,kind:string}>} columns
 * @param {{ ceilingAt?: (x, z) => number|null }} [opts]
 */
export function packTerrain(columns, { ceilingAt = null } = {}) {
  const entries = columns instanceof Map ? [...columns.entries()] : Object.entries(columns);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [k] of entries) {
    const [x, z] = k.split(',').map(Number);
    x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
  }
  const width = x1 - x0 + 1;
  const depth = z1 - z0 + 1;
  const data = new Float32Array(width * depth * 4);
  for (let i = 0; i < width * depth; i++) data.set([NO_TOP, 0, NO_CEILING, 0], i * 4);
  let maxTop = -2;
  for (const [k, c] of entries) {
    const [x, z] = k.split(',').map(Number);
    const i = ((z - z0) * width + (x - x0)) * 4;
    const ceil = ceilingAt?.(x, z);
    data[i] = c.top;
    data[i + 1] = KIND_CODES[c.kind] ?? 0;
    data[i + 2] = ceil === null || ceil === undefined ? NO_CEILING : Math.max(ceil, Math.ceil(c.top));
    data[i + 3] = hash(x, z);
    maxTop = Math.max(maxTop, c.top, ceil === null || ceil === undefined ? -2 : CEILING_TOP);
  }
  return { x0, z0, width, depth, data, maxTop };
}

// Palettes: the cave painting's felt tones; trips tint them by biome.
const C = {
  sage: '#a9c49a', sageDeep: '#93b183', olive: '#9fbf86', teal: '#8fc4b8', moss: '#9cc48d', leaf: '#b7d3a0',
  bark: '#a07c66', barkLight: '#b48d74', stone: '#d9cbbd', stoneWarm: '#e0cfc0', cream: '#f3e6d6',
  pink: '#e8a9a4', tan: '#d9b48f', lilac: '#c4b0dc', wood: '#c79f86', rose: '#f0b9c4', butter: '#f2d79a',
};
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

/** Normalised props from the cave's placements (src/cave/props-placement.json build entries). */
export function propsFromPlacement(placements) {
  const out = [];
  for (const p of placements) {
    const r = hash(p.x * 3.1, p.z * 1.7);
    const base = { x: p.x, y: p.y, z: p.z, height: p.height ?? 1, yaw: p.yaw ?? 0, seed: r };
    switch (p.name) {
      case 'cube-tree': out.push({ ...base, type: PROP.CUBE_TREE, c1: C.sage, c2: C.bark }); break;
      case 'willow': out.push({ ...base, type: PROP.WILLOW, c1: C.leaf, c2: C.bark }); break;
      case 'broom-tree': out.push({ ...base, type: PROP.BROOM, c1: C.olive, c2: C.bark }); break;
      case 'bush': out.push({ ...base, type: PROP.DOME, c1: pick([C.sage, C.moss, C.sageDeep, C.stoneWarm], r), c2: C.cream }); break;
      case 'knit-shrub': out.push({ ...base, type: PROP.KNIT, c1: C.teal, c2: C.cream }); break;
      case 'knit-bush': out.push({ ...base, type: PROP.KNIT, c1: C.moss, c2: C.cream }); break;
      case 'mushroom': out.push({ ...base, type: PROP.MUSHROOM, c1: pick([C.pink, C.tan, C.lilac], r), c2: C.cream }); break;
      case 'stone': out.push({ ...base, type: PROP.STONE, c1: pick([C.stone, C.stoneWarm, '#cfc3d6'], r), c2: C.cream }); break;
      case 'fence': {
        const [a, b] = p.ends ?? [[p.x - 0.4, p.y, p.z], [p.x + 0.4, p.y, p.z]];
        const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
        out.push({ ...base, x: (a[0] + b[0]) / 2, y: Math.min(a[1], b[1]), z: (a[2] + b[2]) / 2, yaw: -Math.atan2(b[2] - a[2], b[0] - a[0]), length, type: PROP.FENCE, c1: C.wood, c2: C.barkLight });
        break;
      }
      default: break; // creatures, Mira and her railing are meshes
    }
  }
  return out;
}

/** Normalised props from a trip's landmarks (src/game/proc/ output). */
export function propsFromLandmarks(landmarks, biome = 'meadow') {
  const leaf = { meadow: [C.sage, C.leaf, C.moss], grotto: [C.rose, C.lilac, C.sage], lake: [C.teal, C.leaf, '#b5d6e0'] }[biome] ?? [C.sage];
  const out = [];
  for (const l of landmarks) {
    const r = hash(l.x * 1.3, l.z * 2.9);
    const height = l.height ?? l.scale ?? 1;
    const base = { x: l.x, y: l.y ?? 0, z: l.z, height, yaw: l.yaw ?? 0, seed: r };
    switch (l.kind) {
      case 'cube-tree': out.push({ ...base, type: PROP.CUBE_TREE, c1: pick(leaf, r), c2: C.bark }); break;
      case 'willow': out.push({ ...base, type: PROP.WILLOW, c1: pick(leaf, r + 0.3), c2: C.bark }); break;
      case 'broom': case 'broom-tree': out.push({ ...base, type: PROP.BROOM, c1: pick(leaf, r + 0.6), c2: C.bark }); break;
      case 'dome': out.push({ ...base, type: PROP.DOME, c1: pick([...leaf, C.stoneWarm], r), c2: C.cream }); break;
      case 'mushroom': out.push({ ...base, type: PROP.MUSHROOM, c1: pick([C.pink, C.tan, C.lilac, C.rose], r), c2: C.cream }); break;
      case 'pom': out.push({ ...base, type: PROP.POM, c1: pick([C.rose, C.butter, C.lilac, C.teal], r), c2: C.cream }); break;
      case 'stone': out.push({ ...base, type: PROP.STONE, c1: pick([C.stone, C.stoneWarm, '#cfc3d6'], r), c2: C.cream }); break;
      case 'fence': {
        const length = l.length ?? 2;
        out.push({ ...base, type: PROP.FENCE, length, c1: C.wood, c2: C.barkLight });
        break;
      }
      default: out.push({ ...base, type: PROP.DOME, c1: pick(leaf, r), c2: C.cream });
    }
  }
  return out;
}

/** A prop's bounding sphere: centre and radius (world units). */
export function propBounds(p) {
  const h = p.height;
  const reach = p.type === PROP.FENCE ? Math.hypot((p.length ?? 1) / 2 + 0.1, h) : h * 0.75 + 0.05;
  return { x: p.x, y: p.y + h * 0.5, z: p.z, r: reach };
}

const rgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  // sRGB to linear (the shader lights in linear space).
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)];
};

/**
 * The props nearest the viewer (up to max), packed 4 texels each:
 * [type, x, y, z] [height, yaw, seed, length] [c1 rgb, boundsR] [c2 rgb, 0].
 */
export function packProps(props, viewer, max = 48, out = new Float32Array(max * PROP_TEXELS * 4)) {
  const ranked = props.map((p) => ({ p, d: Math.hypot(p.x - viewer.x, p.z - viewer.z) - propBounds(p).r }))
    .sort((a, b) => a.d - b.d).slice(0, max);
  out.fill(0);
  ranked.forEach(({ p }, i) => {
    const o = i * PROP_TEXELS * 4;
    const b = propBounds(p);
    out.set([p.type, p.x, p.y, p.z, p.height, p.yaw, p.seed, p.length ?? 0, ...rgb(p.c1), b.r, ...rgb(p.c2), p.boop ?? 0], o);
  });
  return { data: out, count: ranked.length, order: ranked.map(({ p }) => p) };
}

/** Props that squash when you walk into them (mushrooms, poms, cushion and knit domes). */
export const BOOPABLE = new Set([PROP.MUSHROOM, PROP.POM, PROP.DOME, PROP.KNIT]);
/** Texel offset (in floats) of a packed prop's boop squash, in its fourth texel's alpha. */
export const BOOP_OFFSET = PROP_TEXELS * 4 - 1;

/**
 * One step of a prop's boop spring: a kick when the viewer first comes within reach, then a
 * wobble back to rest. State lives on the prop ({ boop, boopV, near }); returns true while moving.
 */
export function stepBoop(p, viewer, dt) {
  const reach = propBounds(p).r * 0.7 + 0.35;
  const near = Math.hypot(p.x - viewer.x, p.z - viewer.z) < reach;
  if (near && !p.near) p.boopV = (p.boopV ?? 0) + 2.4;
  p.near = near;
  const b = p.boop ?? 0;
  let v = p.boopV ?? 0;
  v += (-180 * b - 9 * v) * dt;
  p.boop = Math.max(-0.25, Math.min(0.3, b + v * dt));
  p.boopV = v;
  if (Math.abs(p.boop) < 1e-4 && Math.abs(v) < 1e-3) { p.boop = 0; p.boopV = 0; return false; }
  return true;
}
