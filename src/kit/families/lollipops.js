// Lollipops: a thick swirl candy disc with a rounded rim on a thin cream stick. The pink one faces
// the camera; the purple one is turned to the right so its rim shows.
//
// Each lollipop's disc (radius, thickness, height, yaw and pitch) and stick radius were fitted to
// the reference silhouette with scripts/kit/lollipopfit.py; the swirl comes from the baked finish.
import * as THREE from 'three';
import { prepareTextileGeometry } from '../../textile.js';
import { PASTEL, felt, lumpy, mottle, shadeBottom } from '../style.js';

// Where each stick meets the ground on the sheet (reference px).
export const ANCHORS = {
  'lollipop-pink': [317.7, 211.07], // anchor
  'lollipop-purple': [347.3, 211.5], // anchor
};

const FITS = {
  'lollipop-pink': { height: 0.82, radius: 0.23, thick: 0.1177, yaw: 0.0, pitch: 0.5, stick: 0.05 },
  'lollipop-purple': { height: 0.83, radius: 0.255, thick: 0.038, yaw: 1.0, pitch: 0.65, stick: 0.05 }, // stick as the pink one's (its fit counted shadow specks)
};

// Ground shadows: blobs and colour fitted to the reference by scripts/kit/shadowfit.py.
export const SHADOWS = {
  'lollipop-pink': { cast: false, color: '#5c6a8f', blobs: [[0.444, -0.274, 0.407, 0.225, 0.51, 0.006, 0.202], [0.31, -0.258, 0.213, 0.155, 0.169, -0.879, 0.641]], contact: 0 },
  'lollipop-purple': { cast: false, color: '#5c6a8f', blobs: [[0.413, -0.284, 0.365, 0.258, 0.518, -0.073, 0.315], [1.13, -0.004, 0.841, 0.299, 0.146, -0.069, 0.159]], contact: 0 },
};

// Sticks and swirls are thin: bake to within a pixel of the outline.
export const BAKE = { 'lollipop-pink': { margin: 1 }, 'lollipop-purple': { margin: 1 } };

const CANDY = { pink: [PASTEL.candyPink, '#e29a9e'], purple: [PASTEL.candyPurple, '#ad8fcb'] };

/** The disc's axis: toward the camera's horizontal direction, turned by yaw, tilted up by pitch. */
function discAxis(yaw, pitch) {
  const toward = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
  const right = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const h = toward.multiplyScalar(Math.cos(yaw)).addScaledVector(right, Math.sin(yaw));
  return h.multiplyScalar(Math.cos(pitch)).add(new THREE.Vector3(0, Math.sin(pitch), 0)).normalize();
}

/** A thick disc with a fully rounded rim (lathe of a stadium cross-section), axis along +y. */
function candyDisc(radius, thick) {
  const half = thick / 2;
  const inner = Math.max(radius - half, 0.001);
  // Rings across both faces (not just a fan from the centre), so the baked swirl has vertices.
  const pts = [];
  for (let k = 0; k <= 14; k++) pts.push(new THREE.Vector2((inner * k) / 14, -half));
  for (let k = 1; k < 12; k++) {
    const a = -Math.PI / 2 + (k / 12) * Math.PI;
    pts.push(new THREE.Vector2(inner + half * Math.cos(a), half * Math.sin(a)));
  }
  for (let k = 14; k >= 0; k--) pts.push(new THREE.Vector2((inner * k) / 14, half));
  return prepareTextileGeometry(new THREE.LatheGeometry(pts, 72));
}

function lollipop(id, variant, seed) {
  const f = FITS[id];
  const [color, deep] = CANDY[variant.color];
  const group = new THREE.Group();
  const stick = prepareTextileGeometry(new THREE.CylinderGeometry(f.stick, f.stick, f.height, 16, 8));
  stick.translate(0, f.height / 2, 0);
  mottle(stick, PASTEL.cream, '#e2d6c4', { scale: 9, seed, stretch: [3, 0.4, 3] });
  shadeBottom(stick, { from: 0, to: 0.12, dark: 0.75 });
  group.add(new THREE.Mesh(stick, felt('#ffffff', { fuzz: 0.08 })));
  const disc = candyDisc(f.radius, f.thick);
  disc.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), discAxis(f.yaw, f.pitch)));
  disc.translate(0, f.height, 0);
  lumpy(disc, { amount: 0.003, scale: 12, seed });
  mottle(disc, color, deep, { scale: 7, seed });
  group.add(new THREE.Mesh(disc, felt('#ffffff', { fuzz: 0.12 })));
  return group;
}

export function build(variant, random, item) {
  return lollipop(item.id, variant, variant.seed ?? 1);
}
