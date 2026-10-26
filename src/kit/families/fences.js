// Fences: two round wooden posts with domed tops and two round rails between them, in matte
// wood-tan felt. Fence a runs back to the right (its left post in front); b and c run forward to
// the right; c is a little lower.
//
// Every part is a capsule, so each fence's layout (post positions, height and radius, rail
// heights and radius) was fitted to the reference silhouette with scripts/kit/fencefit.py.
import * as THREE from 'three';
import { prepareTextileGeometry } from '../../textile.js';
import { PASTEL, felt, lumpy, mottle, shadeBottom } from '../style.js';

// Where each fence's center (midway between its posts) stands on the sheet (reference px).
export const ANCHORS = {
  'fence-a': [177.87, 204.36], // anchor
  'fence-b': [226.59, 205.13], // anchor
  'fence-c': [271.25, 207.19], // anchor
};

// Ground shadows: each fence's own shape thrown back onto the ground (planar soft shadows), the
// sheet's back-and-right shadow direction rather than the blocks' short one; direction, strength,
// softness and colour fitted to the reference by scripts/kit/planarfit.py.
export const SHADOWS = {
  'fence-a': { cast: false, color: '#77798d', planar: { dir: [0.2752, -0.3192], strength: 0.615, soft: 0.0237 }, contact: 0.3 },
  'fence-b': { cast: false, color: '#77798d', planar: { dir: [0.4174, -0.451], strength: 0.6158, soft: 0.0236 }, contact: 0.3 },
  'fence-c': { cast: false, color: '#77798d', planar: { dir: [0.42, -0.52], strength: 0.4126, soft: 0.0294 }, contact: 0.3 },
};

// Rails are only 5-6 px tall on the sheet: bake to within a pixel of their outline.
export const BAKE = { 'fence-a': { margin: 1 }, 'fence-b': { margin: 1 }, 'fence-c': { margin: 1 } };

// Fitted layouts: post bases a and b (screen-aligned s, d from the anchor), post height and
// radius, rail heights, rail radius and how far rails reach past the posts.
const LAYOUTS = {
  'fence-a': { a: [-0.3909, 0.3655], b: [0.394, -0.2452], height: 0.8468, post: 0.1122, rails: [0.3409, 0.6301], rail: 0.0903, over: 0.0 },
  'fence-b': { a: [-0.38, -0.2833], b: [0.3692, 0.3368], height: 0.8394, post: 0.1171, rails: [0.3439, 0.6301], rail: 0.0874, over: 0.016 },
  'fence-c': { a: [-0.358, -0.189], b: [0.4195, 0.405], height: 0.7492, post: 0.1, rails: [0.27, 0.5439], rail: 0.0928, over: -0.02 },
};

const worldOf = (s, y, d) => new THREE.Vector3((s + d) * Math.SQRT1_2, y, (d - s) * Math.SQRT1_2);

/** A capsule from p0 to p1 (world), radius r. */
function capsule(p0, p1, r) {
  const length = p0.distanceTo(p1);
  const g = new THREE.CapsuleGeometry(r, length, 10, 28);
  g.rotateX(Math.PI / 2); // along +z
  const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
  g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  return prepareTextileGeometry(g);
}

function fence(id, seed) {
  const L = LAYOUTS[id];
  const group = new THREE.Group();
  const material = felt('#ffffff', { fuzz: 0.12 });
  for (const [k, [s, d]] of [L.a, L.b].entries()) {
    const g = capsule(worldOf(s, L.post, d), worldOf(s, L.height - L.post, d), L.post);
    // Flatten the bottom onto the ground so the post stands (the capsule's lower dome is buried).
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.02) pos.setY(i, Math.max(pos.getY(i), 0));
    g.computeVertexNormals();
    lumpy(g, { amount: 0.004, scale: 10, seed: seed + k });
    mottle(g, PASTEL.wood, '#c99572', { scale: 6, seed: seed + k, stretch: [3, 0.4, 3] });
    shadeBottom(g, { from: 0, to: 0.15, dark: 0.7 });
    group.add(new THREE.Mesh(g, material));
  }
  const da = worldOf(...[L.b[0] - L.a[0], 0, L.b[1] - L.a[1]]).normalize().multiplyScalar(L.over);
  for (const [k, y] of L.rails.entries()) {
    const p0 = worldOf(L.a[0], y, L.a[1]).sub(da);
    const p1 = worldOf(L.b[0], y, L.b[1]).add(da);
    const g = capsule(p0, p1, L.rail);
    lumpy(g, { amount: 0.004, scale: 10, seed: seed + 5 + k });
    mottle(g, PASTEL.wood, '#c99572', { scale: 6, seed: seed + 5 + k, stretch: [0.6, 3, 0.6] });
    group.add(new THREE.Mesh(g, material));
  }
  return group;
}

export function build(variant, random, item) {
  return fence(item.id, variant.seed ?? 1);
}
