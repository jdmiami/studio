// Blocks: the kit's 1 x 1 x 1 building cubes. Grass (pink earth under a scalloped green felt
// cap), pink earth, marbled water, plain stone, and stone built from three seamed slabs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepareTextileGeometry } from '../../textile.js';
import { PASTEL, bulge, felt, lumpy, mottle, shadeBottom, softBox } from '../style.js';

const SIZE = 1;

function block(color, { radius = 0.13, lump = 0.014, seed = 0, deep = null, scale = 2.2, puff = 0.04, stretch, crease = null } = {}) {
  const g = softBox(SIZE, SIZE, SIZE, { radius, res: 32 });
  if (puff) bulge(g, puff);
  g.translate(0, SIZE / 2, 0);
  lumpy(g, { amount: lump, scale: 4, seed });
  mottle(g, color, deep ?? color, { scale, seed, bias: stretch ? -0.1 : -0.25, stretch });
  if (crease) {
    // Darken thin fold lines on top of the mottling.
    const folds = mottle(g.clone(), '#ffffff', crease, { scale: scale * 1.4, seed: seed + 9, stretch, ridged: true }).getAttribute('color');
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * folds.getX(i), col.getY(i) * folds.getY(i), col.getZ(i) * folds.getZ(i));
  }
  shadeBottom(g, { from: 0, to: 0.6, dark: 0.86 });
  return g;
}

/**
 * Green felt cap: a soft slab over the top plus a ring of round felt drops hanging just below
 * its edge, four per side, which reads as the reference's scalloped drip line.
 */
function grassCap(seed, random) {
  const parts = [];
  const slab = softBox(1.06, 0.32, 1.06, { radius: 0.15, res: 32 });
  bulge(slab, 0.04);
  slab.translate(0, SIZE - 0.14, 0);
  parts.push(slab);
  const half = 0.5;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < 4; k++) {
      const along = -0.375 + k * 0.25 + (random() - 0.5) * 0.03;
      const drop = prepareTextileGeometry(new THREE.SphereGeometry(1, 16, 10));
      const tall = 0.11 + random() * 0.03;
      drop.scale(0.135 + random() * 0.02, tall, 0.038);
      // Face +z, then rotate the drop around the block to the other three faces.
      drop.translate(along, SIZE - 0.29, half);
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
    const g = softBox(p.w, p.h, p.d, { radius: r, res: 32 });
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
      group.add(new THREE.Mesh(block(PASTEL.pink, { seed, deep: PASTEL.pinkDeep }), felt('#ffffff')));
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
