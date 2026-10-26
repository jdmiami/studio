// Trees: cube trees (a short barked trunk under a canopy of rounded felt puffs) and willows
// (four domed lobes, each draped in hanging felt strands, around a short trunk).
//
// Observed on the reference sheet (img2threejs image-analysis layers):
// - Cube tree canopy: puffs read as rounded cubes, not spheres; very pale mint felt, fuzzy rim.
//   Large: ~12 visible puffs, about 1.25 wide x 1.3 tall, bottom at ~0.5. Small: 3 big front puffs
//   plus hidden ones. Trunk: ~0.43 wide, stubby, vertical bark grooves, warm brown.
// - Willow: a big back lobe, a smaller back-right lobe, two lower front lobes; strands fused into
//   vertical ridges near the top, separating into rounded drips of uneven length near the ground.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepareTextileGeometry } from '../../textile.js';
import { PASTEL, bulge, felt, lumpy, mottle, shadeBottom, softBox } from '../style.js';

// Where each tree's base center stands on the sheet (reference px), from scripts/kit/register.py.
export const ANCHORS = {
  'tree-cube-large': [49.00, 151.92], // anchor
  'tree-cube-small': [115.50, 148.62], // anchor
  'tree-willow-a': [178.00, 143.68], // anchor
  'tree-willow-b': [244.50, 142.40], // anchor
};

// Per-element scale and turn [sx, sy, sz, ry] found by scripts/kit/fit.py.
export const FIT = {
  'tree-cube-large': [1, 0.99, 0.94, 0],
};

// Extra soft shadow under the canopy (screen-aligned [s, d, rs, rd, strength]): the reference
// darkens the ground beneath the canopy's right half, which the global shadow light misses.
export const SHADOWS = {
  'tree-cube-large': { blobs: [[0.45, 0, 0.5, 0.32, 0.55]] },
};

/** Merge geometries that may differ in indexing/uv into one felt-ready geometry. */
function merge(parts) {
  return mergeGeometries(parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    if (q.getAttribute('uv')) q.deleteAttribute('uv');
    prepareTextileGeometry(q);
    return q;
  }));
}

function trunk(radius, height, seed) {
  const g = prepareTextileGeometry(new THREE.CylinderGeometry(radius * 0.95, radius, height, 28, 12));
  g.translate(0, height / 2, 0);
  lumpy(g, { amount: 0.012, scale: 9, seed });
  mottle(g, PASTEL.bark, '#6e5038', { scale: 7, seed, stretch: [3, 0.4, 3], ridged: true, bias: 0.15 });
  shadeBottom(g, { from: 0, to: 0.12, dark: 0.7 });
  return g;
}

/**
 * Screen-aligned layout helper: s runs along screen-right, d toward the camera (both horizontal),
 * y up. The kit camera looks from +x +z, so screen-right is (1, 0, -1)/sqrt2 and toward-camera is
 * (1, 0, 1)/sqrt2. Laying parts out this way keeps widths measured on the sheet meaningful.
 */
const SQRT1_2 = Math.SQRT1_2;
const worldOf = (s, y, d) => [(s + d) * SQRT1_2, y, (d - s) * SQRT1_2];

// Cube-tree puffs as [s, y (bottom of the puff), d, size], measured against the sheet: the large
// canopy is three puffs wide on its front face (bottom and middle rows) with two on top; the small
// one has a front-left puff, a bigger front-right puff and a top puff behind them.
const CUBE_TREES = {
  large: {
    trunk: { radius: 0.215, height: 0.85 },
    // Fitted to the reference silhouette with scripts/kit/silfit.py.
    puffs: [
      [-0.474, 0.815, 0.220, 0.694],
      [-0.174, 0.638, 0.320, 0.665],
      [0.423, 0.781, 0.220, 0.584],
      [-0.176, 1.404, -0.300, 0.520],
      [0.320, 0.650, -0.300, 0.500],
      [-0.540, 1.404, 0.120, 0.440],
      [0.000, 0.940, 0.220, 0.520],
      [0.525, 1.059, 0.120, 0.555],
      [-0.200, 1.280, -0.020, 0.500],
      [0.299, 1.479, -0.060, 0.464],
      [0.088, 1.312, -0.360, 0.526],
      [0.150, 0.800, -0.050, 0.620],
      [0.208, 0.520, 0.120, 0.436],
      [0.078, 0.420, 0.180, 0.360],
    ],
  },
  small: {
    trunk: { radius: 0.21, height: 0.7 },
    puffs: [
      [-0.32, 0.5, 0.2, 0.56], [0.3, 0.48, 0.18, 0.62], [0.0, 0.52, -0.3, 0.56],
      [-0.04, 0.88, -0.1, 0.6],
    ],
  },
};

function cubeTree(size, seed, random) {
  const spec = CUBE_TREES[size];
  const group = new THREE.Group();
  group.add(new THREE.Mesh(trunk(spec.trunk.radius, spec.trunk.height, seed), felt('#ffffff', { fuzz: 0.1 })));
  const puffs = spec.puffs.map(([ps, py, pd, sz], i) => {
    const g = softBox(sz, sz * 0.92, sz, { radius: sz * 0.4, res: 40 });
    bulge(g, 0.12);
    g.rotateY(Math.PI / 4 + (random() - 0.5) * 0.4); // faces roughly toward the camera, like the sheet
    const [x, y, z] = worldOf(ps, py + (sz * 0.92) / 2, pd);
    g.translate(x, y, z);
    lumpy(g, { amount: 0.012, scale: 8, seed: seed + i });
    return g;
  });
  const canopy = merge(puffs);
  mottle(canopy, PASTEL.sage, '#b9cbb3', { scale: 5, seed, bias: -0.2 });
  group.add(new THREE.Mesh(canopy, felt('#ffffff', { fuzz: 0.35 })));
  return group;
}

// Willow lobes in screen-aligned coordinates: a big back lobe, a back-right lobe, two front lobes.
const WILLOW_LOBES = [
  { s: -0.1, d: -0.25, top: 1.55, r: 0.4 },
  { s: 0.42, d: -0.2, top: 1.32, r: 0.3 },
  { s: -0.34, d: 0.22, top: 1.18, r: 0.34 },
  { s: 0.28, d: 0.2, top: 1.22, r: 0.34 },
];

/** One lobe: a squashed dome with a ring of fused felt strands of uneven length hanging from its rim. */
function lobe({ s, d, top, r }, seed, random) {
  const parts = [];
  const [x, , z] = worldOf(s, 0, d);
  const dome = prepareTextileGeometry(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  dome.scale(1, 0.85, 1);
  const rimY = top - r * 0.85;
  dome.translate(x, rimY, z);
  parts.push(dome);
  const strands = Math.round(r * 46);
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2 + random() * 0.15;
    // Strands end at uneven heights; the longest reach close to the ground.
    const length = Math.max(0.2, (rimY - 0.12) * (0.55 + random() * 0.45));
    const thick = 0.05 + random() * 0.02;
    const g = prepareTextileGeometry(new THREE.CapsuleGeometry(thick, length, 4, 8));
    g.translate(0, -length / 2, 0);
    g.rotateZ(0.05);
    g.rotateY(-a);
    g.translate(x + Math.cos(a) * r * 0.92, rimY + 0.03, z + Math.sin(a) * r * 0.92);
    parts.push(g);
  }
  return parts;
}

function willow(seed, random) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(trunk(0.15, 0.75, seed), felt('#ffffff', { fuzz: 0.1 })));
  const parts = WILLOW_LOBES.flatMap((l) => lobe(l, seed, random));
  const canopy = merge(parts);
  lumpy(canopy, { amount: 0.006, scale: 10, seed });
  mottle(canopy, PASTEL.willow, '#9fbd80', { scale: 6, seed, stretch: [3, 0.5, 3], bias: -0.1 });
  group.add(new THREE.Mesh(canopy, felt('#ffffff', { fuzz: 0.3 })));
  return group;
}

export function build(variant, random) {
  const seed = variant.seed ?? 1;
  if (variant.kind === 'cube') return cubeTree(variant.size, seed, random);
  if (variant.kind === 'willow') return willow(seed, random);
  throw new Error(`unknown tree kind "${variant.kind}"`);
}
