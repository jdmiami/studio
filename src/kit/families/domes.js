// Domes: knit beanie domes (a cable-knit felt dome with a rolled brim and a white pom-pom on top)
// and round fuzzy bushes (a felt ball squashed onto the ground).
//
// Observed on the reference sheet: both kinds are round, so each is a solid of revolution whose
// profile (radius at evenly spaced heights) was fitted to the reference silhouette with
// scripts/kit/lathefit.py. The knit domes' cables run in vertical columns (about seven across the
// front), the brim is a thicker band at the bottom, and the pom-pom is a lumpy white ball about
// 0.2 in radius whose center stands 1.1 above the ground. The bushes are matte felt with a fine
// fuzzy rim, lighter where the light hits.
import * as THREE from 'three';
import { prepareTextileGeometry } from '../../textile.js';
import { PASTEL, felt, lumpy, mottle, profileLathe, shadeBottom } from '../style.js';

// Where each element's base center stands on the sheet (reference px).
export const ANCHORS = {
  'dome-knit-teal': [311.22, 147.54], // anchor
  'dome-knit-green': [368.52, 147.64], // anchor
  'bush-round-light': [423.21, 141.62], // anchor
  'bush-round-dark': [472.33, 143.45], // anchor
};

// Ground shadows: blobs [s, d, rs, rd, strength, turn] and a colour fitted to the reference by
// scripts/kit/shadowfit.py (the sheet shows light ground right under these round elements, and a
// soft blue-grey shadow off to the right), and a light contact line.
export const SHADOWS = {
  'dome-knit-teal': { cast: false, color: '#3b516e', blobs: [[2.262, 0.034, 2.459, 0.991, 0.028, -0.024], [0.441, -0.187, 0.601, 0.339, 0.945, -1.149], [0.245, -0.485, 0.494, 0.862, 0.949, -0.16]], contact: 0.1 },
  'dome-knit-green': { cast: false, color: '#3b516e', blobs: [[1.522, -0.397, 0.557, 0.74, 0.949, -0.35], [0.375, -0.263, 0.555, 0.419, 0.949, -1.018], [0.385, -0.557, 0.513, 0.398, 0.157, 0.548]], contact: 0.1 },
  'bush-round-light': { cast: false, color: '#3b516e', blobs: [[1.441, -0.08, 0.561, 0.676, 0.924, 0.052], [0.492, -0.131, 0.342, 0.436, 0.459, 0.07], [0.928, -0.133, 0.842, 1.162, 0.034, -0.19]], contact: 0.1 },
  'bush-round-dark': { cast: false, color: '#3b516e', blobs: [[-1.145, -2.998, 0.456, 2.499, 0.126, -1.579], [0.593, -0.155, 0.176, 0.402, 0.397, 0.282], [0.558, -1.427, 2.5, 1.345, 0.015, 0.381]], contact: 0.1 },
};

// Fitted profiles: radius at heights height * i / (n - 1), from the ground up.
export const PROFILES = {
  'dome-knit-teal': { height: 1.13, radii: [0.2526, 0.3524, 0.4556, 0.5527, 0.551, 0.5193, 0.5089, 0.51, 0.457, 0.4385, 0.3937, 0.3276, 0.2762, 0.2228, 0.2067, 0.1926] },
  'dome-knit-green': { height: 1.25, radii: [0.2192, 0.3371, 0.4444, 0.5289, 0.5542, 0.5581, 0.4929, 0.4783, 0.4945, 0.4317, 0.3729, 0.3091, 0.2126, 0.1543, 0.1861, 0.1194] },
  'bush-round-light': { height: 0.88, radii: [0.2955, 0.3535, 0.3859, 0.4397, 0.4431, 0.4756, 0.4592, 0.4083, 0.3844, 0.3123, 0.2109, 0.1024] },
  'bush-round-dark': { height: 0.964, radii: [0.1868, 0.3226, 0.3855, 0.4233, 0.4518, 0.4735, 0.4507, 0.4096, 0.3781, 0.2664, 0.1676, 0.056] },
};

// Pom-poms, measured on the sheet: center height and radius.
const POMPOMS = {
  'dome-knit-teal': { y: 1.1, r: 0.2 },
  'dome-knit-green': { y: 1.11, r: 0.19 },
};

const COLORS = {
  teal: [PASTEL.teal, '#8fb0b3'],
  green: ['#79a865', '#5f9150'],
  light: [PASTEL.bushLight, '#93ad5a'],
  dark: [PASTEL.bushDark, '#6a8c3c'],
};

/** Pushes vertices out along their radius in vertical ribs (the knit's cable columns). */
function cables(geometry, { count = 14, amount = 0.016, from = 0.12, to = 0.95 } = {}) {
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4 || y < from || y > to) continue;
    const a = Math.atan2(z, x);
    const rib = Math.pow(0.5 + 0.5 * Math.cos(a * count), 0.6);
    const fade = Math.min(1, (y - from) / 0.08, (to - y) / 0.15);
    const k = 1 + (amount * rib * fade) / r;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function knitDome(id, variant, seed) {
  const profile = PROFILES[id];
  const pom = POMPOMS[id];
  const [color, deep] = COLORS[variant.color];
  const group = new THREE.Group();
  // The body stops just under the pom-pom, which covers its crown.
  const body = cables(profileLathe(profile, pom.y - pom.r * 0.35), { to: pom.y - pom.r * 0.6 });
  lumpy(body, { amount: 0.006, scale: 10, seed });
  mottle(body, color, deep, { scale: 6, seed, stretch: [1, 3, 1], bias: -0.1 });
  // The sheet darkens round elements' undersides hard (a 2-3 px dark band along the bottom edge);
  // those rim vertices are too close to the outline to bake, so their fill keeps this shading.
  shadeBottom(body, { from: 0, to: 0.22, dark: 0.55 });
  group.add(new THREE.Mesh(body, felt('#ffffff', { fuzz: 0.25 })));
  const ball = prepareTextileGeometry(new THREE.SphereGeometry(pom.r, 40, 28));
  lumpy(ball, { amount: 0.014, scale: 14, seed: seed + 1 });
  ball.translate(0, pom.y, 0);
  mottle(ball, PASTEL.white, '#e4e0da', { scale: 9, seed });
  group.add(new THREE.Mesh(ball, felt('#ffffff', { fuzz: 0.5 })));
  return group;
}

function bush(id, variant, seed) {
  const profile = PROFILES[id];
  const [color, deep] = COLORS[variant.color];
  const g = profileLathe(profile, profile.height, { steps: 40 });
  lumpy(g, { amount: 0.008, scale: 7, seed });
  mottle(g, color, deep, { scale: 4, seed, bias: -0.1 });
  shadeBottom(g, { from: 0, to: 0.25, dark: 0.5 }); // dark underside band, as on the knit domes
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, felt('#ffffff', { fuzz: 0.15 })));
  return group;
}

export function build(variant, random, item) {
  const seed = variant.seed ?? 1;
  if (variant.kind === 'knit') return knitDome(item.id, variant, seed);
  if (variant.kind === 'bush') return bush(item.id, variant, seed);
  throw new Error(`unknown dome kind "${variant.kind}"`);
}
