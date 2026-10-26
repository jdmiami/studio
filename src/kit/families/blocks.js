// Blocks: the kit's 1 x 1 x 1 building cubes. Grass (pink earth under a scalloped green felt
// cap), pink earth, marbled water, plain stone, and stone built from three seamed slabs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepareTextileGeometry } from '../../textile.js';
import { PASTEL, bulge, felt, lumpy, mottle, shadeBottom, softBox } from '../style.js';

const SIZE = 1;
// Mesh density (subdivisions per unit): two to three vertices per reference pixel on screen (a
// block edge is 39.5 px), so the baked finish keeps the felt's pixel-level grain and seams.
const RES = 80;

// Where each element's base center stands on the sheet (reference px), registered with
// scripts/kit/register.py so the baked finish samples the reference exactly where the element is.
export const ANCHORS = {
  'block-grass-a': [48.00, 61.90], // anchor
  'block-grass-b': [111.00, 61.62], // anchor
  'block-pink': [173.50, 61.62], // anchor
  'block-water': [236.50, 61.34], // anchor
  'block-stone-plain': [340.50, 61.06], // anchor
  'block-stone-seam-a': [403.00, 61.34], // anchor
  'block-stone-seam-b': [466.00, 61.06], // anchor
};

// The dense meshes bake each vertex from its own sheet pixel (bilinear would smooth the grain
// again) and up to 1 px from the outline, so the darker rim inside the outline is baked too.
export const BAKE = Object.fromEntries(Object.keys(ANCHORS).map((id) => [id, { margin: 1, sample: 'nearest' }]));

// The warp also moves each block's base onto the sheet's dark bottom contour and places its
// outline to a fraction of a pixel (src/kit/warp.js).
export const WARP = Object.fromEntries(Object.keys(ANCHORS).map((id) => [id, { base: true, fine: true }]));

// Per-element scale and turn [sx, sy, sz, ry] found by scripts/kit/fit.py and the pixel test:
// the reference draws each block a little differently.
export const FIT = {
  'block-grass-a': [1.017, 1, 1.017, 0],
  'block-grass-b': [1.01, 0.97, 1.01, 0],
  'block-pink': [0.999, 1.052, 1.04, 0],
  'block-water': [0.994, 1.037, 1.055, 0],
  'block-stone-plain': [1.025, 1.003, 1.116, 0.03],
  'block-stone-seam-a': [0.98, 0.97, 1.01, 0],
  'block-stone-seam-b': [0.997, 0.962, 1.047, 0],
};

// Fitted ground shadows (scripts/kit/shadowfit.py, written by scripts/kit/apply_shadows.py): the
// sheet's block shadows are a soft blue-grey patch to the right plus a dark band under the
// bottom-right edge, which the global cast shadow doesn't shape well. The contact decal is a thin
// strong line hugging the base (the sheet's dark contact line), not the default wide band.
export const SHADOWS = {
  'block-grass-a': { cast: false, color: '#727687', blobs: [[0.671, -0.164, 1.494, 0.532, 0.645, -0.343, 0.408], [0.433, 0.31, 0.595, 0.242, 0.79, -0.476, 0.172], [1.272, -0.046, 1.821, 0.422, 0.39, 0.348, 0.124]], contact: { strength: 0.6, softness: 0.025, bias: [0.03, -0.05] } },
  'block-grass-b': { cast: false, color: '#727687', blobs: [[1.006, -0.207, 1.916, 0.497, 0.744, 0.301, 0.207], [0.385, 0.335, 0.734, 0.2, 0.759, -0.513, 0.33], [0.668, 0.055, 2.105, 0.294, 0.349, -0.31, 0.0]], contact: { strength: 0.6, softness: 0.025, bias: [0.03, -0.05] } },
  'block-pink': { cast: false, color: '#727687', blobs: [[0.863, -0.247, 1.652, 0.397, 0.554, -0.586, 0.434], [0.361, 0.353, 0.659, 0.203, 0.792, -0.548, 0.291], [0.889, -0.153, 0.743, 0.321, 0.452, 0.699, 0.219]], contact: { strength: 0.6, softness: 0.025, bias: [0.03, -0.05] } },
  'block-water': { cast: false, color: '#727687', blobs: [[0.584, -0.136, 0.597, 0.45, 0.526, -0.338, 0.57], [0.353, 0.359, 0.672, 0.216, 0.802, -0.519, 0.15], [0.717, -0.254, 0.631, 0.258, 0.171, 0.387, 0.565]], contact: { strength: 0.6, softness: 0.025, bias: [0.03, -0.05] } },
  'block-stone-plain': { cast: false, color: '#727687', blobs: [[0.648, -0.124, 1.581, 0.572, 0.668, -0.354, 0.218], [0.34, 0.344, 0.658, 0.263, 0.949, -0.556, 0.311], [1.796, 0.411, 0.849, 2.182, 0.098, -1.521, 0.174]], contact: { strength: 0.6, softness: 0.025, bias: [0.03, -0.05] } },
  'block-stone-seam-a': { cast: false, color: '#727687', blobs: [[0.47, -0.191, 1.732, 0.536, 0.733, 0.005, 0.312], [0.382, 0.353, 0.632, 0.216, 0.872, -0.523, 0.415], [1.382, -0.176, 0.616, 0.249, 0.557, -0.403, 0.833]], contact: { strength: 0.6, softness: 0.025, bias: [0.03, -0.05] } },
  'block-stone-seam-b': { cast: false, color: '#727687', blobs: [[0.53, 0.033, 0.806, 0.454, 0.473, -0.8, 0.518], [0.319, 0.365, 0.547, 0.239, 0.715, -0.547, 0.485], [1.011, -0.014, 2.226, 0.333, 0.282, 0.683, 0.214]], contact: { strength: 0.6, softness: 0.025, bias: [0.03, -0.05] } },
};

function block(color, { radius = 0.13, lump = 0.014, seed = 0, deep = null, scale = 2.2, puff = 0.04, stretch, crease = null, height = SIZE } = {}) {
  const g = softBox(SIZE, height, SIZE, { radius, res: RES });
  if (puff) bulge(g, puff);
  g.translate(0, height / 2, 0);
  lumpy(g, { amount: lump, scale: 4, seed });
  mottle(g, color, deep ?? color, { scale, seed, bias: stretch ? -0.1 : -0.25, stretch });
  if (crease) {
    // Darken thin fold lines on top of the mottling.
    const folds = mottle(g.clone(), '#ffffff', crease, { scale: scale * 1.4, seed: seed + 9, stretch, ridged: true }).getAttribute('color');
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * folds.getX(i), col.getY(i) * folds.getY(i), col.getZ(i) * folds.getZ(i));
  }
  shadeBottom(g, { from: 0, to: 0.6, dark: 0.86 });
  shadeBottom(g, { from: 0, to: 0.08, dark: 0.66 }); // contact darkening where the block meets the ground
  return g;
}

/**
 * Green felt cap: a soft slab over the top plus a ring of round felt drops hanging just below
 * its edge, three per side, which reads as the reference's scalloped drip line.
 */
// Grass cap proportions, fitted to the reference's drip line (heights are fractions of the block).
// The drops wrap around the earth's rounded vertical edges (`wrap`, its corner radius).
const CAP = { bottom: 0.86, top: 1.0, dropY: 0.86, dropDepth: 0.04, dropRoot: 0.03, wrap: 0.13, overhang: 1.045, puff: 0.015 };
// Drip lobes on each face as [centre, half-width, bottom], the centre measured toward the face's
// front corner, fitted to the reference's green/pink boundary on both grass blocks (their edges sit
// half a pixel above it, so the dark drip line bakes onto the earth instead of a lobe's grazing
// rim): three lobes a face, notched about 0.3 and 0.65 from the front corner, the right face's
// hanging a little lower. The +z (left on the sheet) and -z faces use `left`, +x and -x `right`.
const LOBES = {
  left: [[0.36, 0.14, 0.795], [0.03, 0.145, 0.76], [-0.295, 0.16, 0.755]],
  right: [[0.305, 0.13, 0.77], [-0.015, 0.17, 0.735], [-0.345, 0.17, 0.73]],
};

/**
 * Bends a drop built on the +z face (x along the face, z out of it) around the block's rounded
 * vertical edges, so a lobe near a corner hugs the earth instead of jutting into the air.
 */
function wrapCorners(g, rc) {
  const pos = g.getAttribute('position');
  const flat = 0.5 - rc;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i);
    const n = pos.getZ(i);
    if (Math.abs(a) <= flat) {
      pos.setZ(i, 0.5 + n);
      continue;
    }
    const phi = (Math.abs(a) - flat) / rc; // arc length around the corner, as an angle
    pos.setX(i, Math.sign(a) * (flat + (rc + n) * Math.sin(phi)));
    pos.setZ(i, flat + (rc + n) * Math.cos(phi));
  }
  g.computeVertexNormals();
  return g;
}

function grassCap(seed, random) {
  const parts = [];
  const slabH = CAP.top - CAP.bottom;
  const slab = softBox(CAP.overhang, slabH, CAP.overhang, { radius: 0.15, res: RES });
  bulge(slab, CAP.puff);
  slab.translate(0, CAP.bottom + slabH / 2, 0);
  parts.push(slab);
  for (let side = 0; side < 4; side++) {
    // The front corner is at +x on the +z face and at +z (local -x) on the +x face.
    const toFront = side % 2 === 0 ? 1 : -1;
    for (const [centre, wide, bottom] of side % 2 === 0 ? LOBES.left : LOBES.right) {
      const drop = prepareTextileGeometry(new THREE.SphereGeometry(1, 48, 28));
      const tall = CAP.dropY - bottom + (random() - 0.5) * 0.01;
      // Only the lower half hangs; the upper half is a short root tucked in under the slab.
      const pos = drop.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * (pos.getY(i) > 0 ? CAP.dropRoot : tall));
      drop.scale(wide, 1, CAP.dropDepth);
      // Face +z, then rotate the drop around the block to the other three faces.
      drop.translate(centre * toFront, CAP.dropY, 0);
      wrapCorners(drop, CAP.wrap);
      drop.rotateY((side * Math.PI) / 2);
      parts.push(drop);
    }
  }
  const g = mergeGeometries(parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    q.deleteAttribute('uv');
    return q;
  }));
  lumpy(g, { amount: 0.01, scale: 6, seed });
  mottle(g, PASTEL.grass, PASTEL.grassDeep, { scale: 5, seed, bias: -0.3 });
  return g;
}

/** Stone cube built from a top slab, a thin plate on the left face, and a block behind it. */
function seamStone(seed) {
  const gap = 0.012;
  const r = 0.09;
  const top = 0.34;
  const plate = 0.2;
  const parts = [
    { w: 1, h: top - gap, d: 1, x: 0, y: SIZE - top / 2 + gap / 2, z: 0 },
    { w: 1, h: SIZE - top - gap, d: plate - gap, x: 0, y: (SIZE - top) / 2 - gap / 2, z: 0.5 - plate / 2 + gap / 2 },
    { w: 1, h: SIZE - top - gap, d: 1 - plate - gap, x: 0, y: (SIZE - top) / 2 - gap / 2, z: -plate / 2 - gap / 2 },
  ];
  const group = new THREE.Group();
  parts.forEach((p, i) => {
    const g = softBox(p.w, p.h, p.d, { radius: r, res: RES });
    bulge(g, 0.03);
    lumpy(g, { amount: 0.008, scale: 4, seed: seed + i });
    mottle(g, PASTEL.stone, PASTEL.stoneDeep, { scale: 2.5, seed: seed + i, bias: -0.3 });
    g.translate(p.x, p.y, p.z);
    shadeBottom(g, { from: 0, to: 0.6, dark: 0.88 });
    group.add(new THREE.Mesh(g, felt('#ffffff', { fuzz: 0.08 })));
  });
  return group;
}

export function build(variant, random) {
  const seed = variant.seed ?? 1;
  const group = new THREE.Group();
  switch (variant.kind) {
    case 'grass':
      // The earth body stops inside the cap, so its bulged top can never poke through the felt.
      group.add(new THREE.Mesh(block(PASTEL.pink, { seed, deep: PASTEL.pinkDeep, height: 0.93 }), felt('#ffffff')));
      group.add(new THREE.Mesh(grassCap(seed, random), felt('#ffffff', { fuzz: 0.25 })));
      break;
    case 'pink':
      group.add(new THREE.Mesh(block(PASTEL.pink, { seed, deep: PASTEL.pinkDeep }), felt('#ffffff')));
      break;
    case 'water':
      group.add(new THREE.Mesh(
        block('#a2d0e9', { seed, deep: '#5596c4', lump: 0.012, scale: 2.4, stretch: [1, 2.6, 1], crease: '#9fb8cc' }),
        felt('#ffffff', { fuzz: 0.1, grain: 1.6 }),
      ));
      break;
    case 'stone':
      group.add(new THREE.Mesh(block(PASTEL.stone, { seed, deep: PASTEL.stoneDeep, radius: 0.2, puff: 0.08 }), felt('#ffffff', { fuzz: 0.08 })));
      break;
    case 'stone-seam':
      group.add(seamStone(seed));
      break;
    default:
      throw new Error(`unknown block kind "${variant.kind}"`);
  }
  return group;
}
