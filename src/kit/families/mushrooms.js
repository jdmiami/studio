// Mushrooms: a felt cap on a short pale stem. Big pink (a wide dome with white spots), small tan
// (a flatter cap), lilac (a pointed cap that leans a little to the left, with spots) and a pair (a
// tan mushroom with a small pink one tucked against its stem).
//
// Each mushroom is a solid of revolution whose profile (stem, then the cap's underside step, then
// the cap) was fitted to the reference silhouette with scripts/kit/lathefit.py; the pair is two.
// The cap is its own mesh from the step up (its underside is the flat gill disc), the stem the rest.
// Spots and the caps' soft shading come from the baked finish.
import * as THREE from 'three';
import { PASTEL, felt, lumpy, mottle, profileLathe, shadeBottom } from '../style.js';

// Where each mushroom's base center stands on the sheet (reference px).
export const ANCHORS = {
  'mushroom-pink': [39.83, 205.33], // anchor
  'mushroom-tan': [72.92, 204.79], // anchor
  'mushroom-lilac': [105.15, 205.99], // anchor
  'mushroom-pair': [129.10, 204.97], // anchor
};

// Ground shadows: blobs and colour fitted to the reference by scripts/kit/shadowfit.py.
export const SHADOWS = {
  'mushroom-pink': { cast: false, color: '#555879', blobs: [[0.305, -0.115, 0.498, 0.414, 0.438, -0.698, 0.376], [0.431, -0.2, 0.903, 0.434, 0.369, -0.372, 0.309]], contact: 0 },
  'mushroom-tan': { cast: false, color: '#555879', blobs: [[0.857, -0.218, 0.282, 0.678, 0.451, -0.571, 0.15], [0.124, -0.08, 0.426, 0.392, 0.691, 0.02, 0.291]], contact: 0 },
  'mushroom-lilac': { cast: false, color: '#555879', blobs: [[0.329, -0.12, 0.702, 0.242, 0.493, -0.399, 0.15]], contact: 0 },
  'mushroom-pair': { cast: false, color: '#555879', blobs: [[0.18, -0.077, 0.267, 0.381, 0.796, -0.407, 0.178]], contact: 0 },
};

// Fitted profiles (radius at heights height * i / (n - 1)); `cap` is where the cap begins.
const PROFILES = {
  'mushroom-pink': { height: 0.843, cap: 0.3, radii: [0.1206, 0.1462, 0.1462, 0.1462, 0.1222, 0.1606, 0.1462, 0.2102, 0.2768, 0.3352, 0.4043, 0.374, 0.3406, 0.2946, 0.2426, 0.1942, 0.164, 0.1136] },
  'mushroom-tan': { height: 0.469, cap: 0.19, radii: [0.1036, 0.0956, 0.1196, 0.1488, 0.1196, 0.1196, 0.1196, 0.1436, 0.2134, 0.2535, 0.2735, 0.2935, 0.2705, 0.2403, 0.2109, 0.1873, 0.1938, 0.12] },
  'mushroom-lilac': { height: 0.715, cap: 0.21, lean: -0.06, radii: [0.104, 0.0726, 0.0886, 0.0886, 0.0886, 0.1126, 0.1446, 0.2042, 0.2451, 0.2458, 0.2481, 0.2124, 0.1841, 0.1692, 0.1298, 0.1165, 0.1299, 0.064] },
  'mushroom-pair': { height: 0.5078, cap: 0.2, radii: [0.0844, 0.11, 0.126, 0.126, 0.1202, 0.11, 0.07, 0.075, 0.138, 0.1544, 0.1856, 0.2146, 0.205, 0.2, 0.2104, 0.1988, 0.14, 0.05] },
};

// The pair's small pink mushroom: its own profile and where it stands relative to the big one
// (sheet px, from the same fit).
const PAIR_SMALL = {
  offset: [133.0 - 129.6, 205.84 - 205.47],
  profile: { height: 0.296, cap: 0.1, radii: [0.04, 0.04, 0.05, 0.08, 0.105, 0.1682, 0.185, 0.13, 0.06, 0.02] },
};

const CAPS = {
  pink: [PASTEL.mushroomPink, '#dea29c'],
  tan: [PASTEL.mushroomTan, '#d4ae8c'],
  lilac: [PASTEL.lilac, '#c09ccb'],
};
const STEM = ['#ece2d2', '#d8c9b3'];

function mushroom(profile, capColors, seed) {
  const group = new THREE.Group();
  const stem = profileLathe(profile, profile.cap + 0.02, { steps: 16, segments: 48 });
  lumpy(stem, { amount: 0.004, scale: 12, seed });
  mottle(stem, STEM[0], STEM[1], { scale: 8, seed, stretch: [3, 0.6, 3] });
  shadeBottom(stem, { from: 0, to: profile.cap * 0.5, dark: 0.7 });
  group.add(new THREE.Mesh(stem, felt('#ffffff', { fuzz: 0.15 })));
  const cap = profileLathe(profile, profile.height, { bottom: profile.cap, steps: 40, segments: 72 });
  lumpy(cap, { amount: 0.004, scale: 9, seed: seed + 1 });
  mottle(cap, capColors[0], capColors[1], { scale: 5, seed, bias: -0.1 });
  group.add(new THREE.Mesh(cap, felt('#ffffff', { fuzz: 0.2 })));
  return group;
}

export function build(variant, random, item) {
  const seed = variant.seed ?? 1;
  const group = mushroom(PROFILES[item.id], CAPS[variant.color], seed);
  if (variant.kind === 'pair') {
    const small = mushroom(PAIR_SMALL.profile, CAPS.pink, seed + 7);
    // Sheet px -> ground offset: u along screen-right, v toward the camera (v / sin 35 deg).
    const s = PAIR_SMALL.offset[0] / 39.5;
    const d = PAIR_SMALL.offset[1] / (39.5 * Math.sin(THREE.MathUtils.degToRad(35)));
    small.position.set((s + d) * Math.SQRT1_2, 0, (d - s) * Math.SQRT1_2);
    group.add(small);
  }
  return group;
}
