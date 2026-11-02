// Creatures: two fluffy white dogs (a round body, a big round head with pointed ears, a curled tail
// at the back, short legs, and a red-and-white striped scarf) and three white fluff-ball critters
// with dot eyes (the third asleep).
//
// The dogs are clusters of ellipsoids fitted to the reference silhouette with
// scripts/kit/ellipsefit.py (ears become cones, the scarf a ring); each critter is one fitted
// ellipsoid. Faces, the scarf's stripes and the fur's shading come from the baked
// finish.
import * as THREE from 'three';
import { prepareTextileGeometry } from '../../textile.js';
import { PASTEL, felt, lumpy, mottle, shadeBottom } from '../style.js';

// Where each creature's base centre stands on the sheet (reference px).
export const ANCHORS = {
  'dog-a': [45.0, 267.0], // anchor
  'dog-b': [107.0, 267.0], // anchor
  'critter-a': [157.04, 264.18], // anchor
  'critter-b': [194.78, 263.72], // anchor
  'critter-c': [232.23, 263.90], // anchor
};

// Ground shadows: blobs and colour fitted to the reference by scripts/kit/shadowfit.py.
export const SHADOWS = {
  'dog-a': { cast: false, color: '#686f86', blobs: [[0.485, -0.18, 0.954, 0.582, 0.726, -0.259, 0.133], [0.23, 0.051, 0.283, 0.494, 0.912, -1.284, 0.103]], contact: 0.3 },
  'dog-b': { cast: false, color: '#686f86', blobs: [[0.461, -0.18, 0.942, 0.568, 0.719, -0.229, 0.112], [0.213, 0.082, 0.513, 0.231, 0.948, 0.097, 0.112]], contact: 0.3 },
  'critter-a': { cast: false, color: '#686f86', blobs: [[0.16, 0.017, 0.374, 0.267, 0.835, -0.57, 0.169], [0.15, -0.003, 0.101, 0.332, 0.949, 0.489, 0.326]], contact: 0.3 },
  'critter-b': { cast: false, color: '#686f86', blobs: [[0.088, 0.052, 0.306, 0.295, 0.949, -0.325, 0.269], [0.27, -0.112, 0.152, 0.274, 0.556, -0.68, 0.162]], contact: 0.3 },
  'critter-c': { cast: false, color: '#686f86', blobs: [[0.208, -0.043, 0.314, 0.324, 0.711, -0.955, 0.05], [0.103, 0.12, 0.3, 0.133, 0.948, -0.212, 0.043]], contact: 0.3 },
};

// White fur and dark eyes read as "neutral" to the bake's shadow test: bake them anyway.
export const BAKE = Object.fromEntries(Object.keys(ANCHORS).map((id) => [id, { skipNeutral: false }]));

// Dog parts [s, y, d, rs, ry, rd] (centre, screen-aligned; radii along s, y, d), in this order:
// body, head, tail, four legs, two ears, scarf.
const DOGS = {
  'dog-a': [[-0.03, 0.376, 0.0, 0.356, 0.32, 0.357], [0.2, 0.81, 0.082, 0.364, 0.342, 0.34], [-0.3, 0.72, -0.239, 0.243, 0.287, 0.26], [0.084, 0.158, 0.31, 0.11, 0.04, 0.07], [0.104, 0.128, 0.22, 0.07, 0.08, 0.07], [-0.27, 0.098, -0.1, 0.07, 0.08, 0.07], [0.1, 0.08, -0.25, 0.07, 0.08, 0.07], [-0.05, 1.03, -0.01, 0.1, 0.09, 0.05], [0.41, 1.132, 0.05, 0.056, 0.11, 0.05], [0.21, 0.43, 0.09, 0.34, 0.16, 0.36]],
  'dog-b': [[-0.036, 0.447, 0.0, 0.416, 0.318, 0.36], [0.2, 0.828, 0.111, 0.36, 0.33, 0.34], [-0.289, 0.696, -0.27, 0.264, 0.284, 0.24], [0.072, 0.158, 0.298, 0.09, 0.078, 0.07], [0.098, 0.11, 0.22, 0.07, 0.08, 0.07], [-0.289, 0.098, -0.1, 0.07, 0.08, 0.07], [0.1, 0.08, -0.25, 0.07, 0.08, 0.07], [-0.039, 1.078, 0.05, 0.06, 0.09, 0.05], [0.38, 1.15, 0.05, 0.06, 0.11, 0.05], [0.21, 0.49, 0.15, 0.337, 0.228, 0.348]],
};
// Critters: one fitted ellipsoid each [s, y, d, rs, ry, rd] (a fur ball, its fuzz noise aside).
const CRITTERS = {
  'critter-a': [0.004, 0.2, 0.0, 0.217, 0.183, 0.233],
  'critter-b': [0.0, 0.2, 0.0, 0.22, 0.176, 0.252],
  'critter-c': [0.019, 0.2, 0.0, 0.228, 0.168, 0.272],
};;

const worldOf = (s, y, d) => [(s + d) * Math.SQRT1_2, y, (d - s) * Math.SQRT1_2];

/** An ellipsoid with radii along the screen-aligned axes (s, y, d), centred at (s, y, d). */
function ellipsoid([s, y, d, rs, ry, rd], segments = 40) {
  const g = prepareTextileGeometry(new THREE.SphereGeometry(1, segments, Math.round(segments * 0.7)));
  g.scale(rs, ry, rd);
  g.rotateY(Math.PI / 4); // local x -> screen-right, local z -> toward the camera
  g.translate(...worldOf(s, y, d));
  return g;
}

function fur(g, seed, { tint = PASTEL.white, deep = '#e6e1db' } = {}) {
  lumpy(g, { amount: 0.012, scale: 14, seed });
  mottle(g, tint, deep, { scale: 9, seed });
  return g;
}

function dog(id, seed) {
  const [body, head, tail, ...rest] = DOGS[id];
  const legs = rest.slice(0, 4);
  const ears = rest.slice(4, 6);
  const scarf = rest[6];
  const group = new THREE.Group();
  const furMaterial = felt('#ffffff', { fuzz: 0.6 });
  for (const [k, part] of [body, head, tail, ...legs].entries()) {
    // About one vertex per sheet pixel on the head and body, so the baked eyes and nose stay sharp.
    const g = fur(ellipsoid(part, k < 3 ? 128 : 20), seed + k);
    if (k === 0 || k >= 3) shadeBottom(g, { from: 0, to: 0.2, dark: 0.8 });
    group.add(new THREE.Mesh(g, furMaterial));
  }
  for (const [k, [s, y, d, rs, ry, rd]] of ears.entries()) {
    const g = prepareTextileGeometry(new THREE.ConeGeometry((rs + rd) * 0.75, ry * 2.4, 16, 4));
    g.translate(...worldOf(s, y, d));
    group.add(new THREE.Mesh(fur(g, seed + 10 + k, { tint: '#f4e4e2', deep: '#e8c6c4' }), furMaterial));
  }
  // The scarf: a ring around the neck as wide as the fitted band, as thick as it is tall.
  const [s, y, d, rs, ry, rd] = scarf;
  const ring = prepareTextileGeometry(new THREE.TorusGeometry((rs + rd) / 2 - ry * 0.6, ry * 0.75, 16, 48));
  ring.rotateX(Math.PI / 2);
  ring.translate(...worldOf(s, y, d));
  lumpy(ring, { amount: 0.006, scale: 10, seed: seed + 20 });
  mottle(ring, PASTEL.scarf, '#f3ece6', { scale: 6, seed });
  group.add(new THREE.Mesh(ring, felt('#ffffff', { fuzz: 0.2 })));
  return group;
}

function critter(id, seed) {
  const g = fur(ellipsoid(CRITTERS[id], 96), seed);
  shadeBottom(g, { from: 0, to: 0.12, dark: 0.75 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, felt('#ffffff', { fuzz: 0.6 })));
  return group;
}

export function build(variant, random, item) {
  const seed = variant.seed ?? 1;
  if (variant.kind === 'dog') return dog(item.id, seed);
  if (variant.kind === 'critter') return critter(item.id, seed);
  throw new Error(`unknown creature kind "${variant.kind}"`);
}
