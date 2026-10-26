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
  'tree-cube-small': [116.50, 154.92], // anchor
  'tree-willow-a': [181.00, 149.18], // anchor
  'tree-willow-b': [247.50, 148.40], // anchor
};

// Per-element scale and turn [sx, sy, sz, ry] found by scripts/kit/fit.py.
export const FIT = {
  'tree-cube-large': [1, 0.99, 0.94, 0],
};

// Extra soft shadow under the canopy (screen-aligned [s, d, rs, rd, strength]): the reference
// darkens the ground beneath the canopy's right half, which the global shadow light misses.
export const SHADOWS = {
  'tree-cube-large': { blobs: [[0.45, 0, 0.5, 0.32, 0.55]] },
  'tree-cube-small': { contact: 0.15 },
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
    trunk: { radius: 0.205, height: 0.91 },
    // Fitted to the reference silhouette with scripts/kit/silfit.py.
    puffs: [
      [-0.349, 0.727, 0.200, 0.804],
      [0.254, 0.784, 0.180, 0.824],
      [0.269, 0.788, -0.300, 0.560],
      [-0.124, 1.128, -0.100, 0.662],
      [0.199, 0.621, 0.200, 0.360],
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

// Per-willow strand lengths, one array per lobe, fitted by scripts/kit/dripfit.py.
export const WILLOW_DRIPS = {
  'tree-willow-a': [[0.879, 0.91, 1.153, 0.551, 0.814, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153, 1.153], [0.12, 0.788, 0.529, 0.75, 0.793, 0.986, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.12], [0.695, 0.12, 0.123, 0.452, 0.263, 0.12, 0.263, 0.263, 0.263, 0.263, 0.263, 0.263, 0.263, 0.263, 0.263, 0.288], [0.409, 0.12, 0.517, 0.259, 0.255, 0.836, 0.259, 0.259, 0.259, 0.259, 0.259, 0.259, 0.259, 0.259, 0.259, 0.187]],
  'tree-willow-b': [[0.873, 0.78, 1.092, 0.421, 0.683, 1.038, 1.136, 0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 1.147], [0.312, 0.72, 0.492, 0.928, 0.725, 0.855, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.12], [0.565, 0.12, 0.24, 0.322, 0.225, 0.12, 0.24, 0.24, 0.24, 0.24, 0.24, 0.24, 0.24, 0.24, 0.24, 0.343], [0.341, 0.19, 0.417, 0.19, 0.31, 0.706, 0.31, 0.31, 0.31, 0.31, 0.31, 0.31, 0.31, 0.31, 0.31, 0.12]],
};

// Willow lobes in screen-aligned coordinates: a big back lobe, a back-right lobe, two front lobes.
// `drop` is how far the strands hang below the dome's rim (longest strands), as a fraction of the
// rim's height above the ground.
const WILLOW_LOBES = [
  { s: -0.1, d: -0.25, top: 1.55, r: 0.42, drop: 0.7 },
  { s: 0.42, d: -0.2, top: 1.32, r: 0.32, drop: 0.75 },
  { s: -0.34, d: 0.22, top: 1.18, r: 0.36, drop: 0.85 },
  { s: 0.28, d: 0.2, top: 1.22, r: 0.36, drop: 0.85 },
];

/**
 * One lobe: an inner dome plus strands that start near the apex, follow the dome over its rim and
 * hang down as rounded drips of uneven length. Neighbouring strands overlap, so together they read
 * as one ridged, draped felt surface that separates into drips at the bottom (as on the sheet).
 */
function lobe({ s, d, top, r, drop }, random, lengths) {
  const parts = [];
  const [x, , z] = worldOf(s, 0, d);
  const squash = 0.85;
  const rimY = top - r * squash;
  const inner = prepareTextileGeometry(new THREE.SphereGeometry(r * 0.94, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2));
  inner.scale(1, squash, 1);
  inner.translate(x, rimY, z);
  parts.push(inner);
  const strands = Math.round(r * 44);
  const thick = r * 0.15;
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2;
    // Fitted lengths (scripts/kit/dripfit.py) put each visible drip's tip where the sheet's is.
    const length = lengths?.[i] ?? Math.max(0.12, rimY * drop * (0.55 + random() * 0.45));
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const phi = 0.25 + (k / 8) * (Math.PI / 2 - 0.25);
      const rr = r * Math.sin(phi);
      pts.push(new THREE.Vector3(x + Math.cos(a) * rr, rimY + r * squash * Math.cos(phi), z + Math.sin(a) * rr));
    }
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const rr = r * (1 + 0.06 * t);
      pts.push(new THREE.Vector3(x + Math.cos(a) * rr, rimY - length * t, z + Math.sin(a) * rr));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = prepareTextileGeometry(new THREE.TubeGeometry(curve, 28, thick, 8, false));
    parts.push(tube);
    const tip = prepareTextileGeometry(new THREE.SphereGeometry(thick, 8, 6));
    const end = pts[pts.length - 1];
    tip.translate(end.x, end.y, end.z);
    parts.push(tip);
  }
  return parts;
}

function willow(seed, random, id) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(trunk(0.15, 0.75, seed), felt('#ffffff', { fuzz: 0.1 })));
  const parts = WILLOW_LOBES.flatMap((l, i) => lobe(l, random, WILLOW_DRIPS[id]?.[i]));
  const canopy = merge(parts);
  mottle(canopy, PASTEL.willow, '#9fbd80', { scale: 6, seed, stretch: [3, 0.5, 3], bias: -0.1 });
  shadeBottom(canopy, { from: 0.2, to: 1.1, dark: 0.85 });
  group.add(new THREE.Mesh(canopy, felt('#ffffff', { fuzz: 0.3 })));
  return group;
}

export function build(variant, random, item) {
  const seed = variant.seed ?? 1;
  if (variant.kind === 'cube') return cubeTree(variant.size, seed, random);
  if (variant.kind === 'willow') return willow(seed, random, item.id);
  throw new Error(`unknown tree kind "${variant.kind}"`);
}
