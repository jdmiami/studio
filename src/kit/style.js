// Pastel cubism: the shared look of every kit element (see .claude/skills/pastel-cubism/SKILL.md).
//
// - Soft rounded cubes and pillows, matte felt, plush fur, chunky knit: hand-made, never glossy.
// - Chalky pastel colors measured from docs/reference/asset-kit.jpg.
// - Three-tone light from the upper left: top faces brightest, left faces a step down, right
//   faces in soft shade (about 0.87 and 0.47 of the top's light).
// - A thin dark outline with a faint light halo, and a soft shadow falling to the right.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint, sharedFurUniforms } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { withSeed } from '../world/util.js';

/** Camera and light shared by every element (the reference sheet's isometric view). */
export const KIT_STAGE = {
  azimuth: Math.PI / 4, // camera looks from +x +z, so +z faces read as "left" and +x as "right"
  elevation: THREE.MathUtils.degToRad(35),
  pxPerUnit: 39.5, // one block edge is about 39.5 reference pixels
  background: '#dcdcdc',
  // Toward the light: from the upper left and slightly in front, so shadows fall right.
  sunDir: new THREE.Vector3(-0.27, 0.8, 0.53).normalize(),
  sunColor: new THREE.Color(1.0, 0.97, 0.93).multiplyScalar(0.9),
  ambient: new THREE.Color(0.54, 0.52, 0.52),
  shadowOpacity: 0.36,
  // The cast shadow has its own, higher light: a short shadow to the right and slightly back,
  // about half a block long (the shading light above would throw it long and up-right).
  shadowDir: new THREE.Vector3(-0.28, 1, 0.47).normalize(),
  // Shadow sides deepen and saturate toward the albedo's own hue (measured on the grass and pink
  // blocks' right faces).
  shadeSat: 0.85,
};

/** Albedo colors (sRGB hex) for pastel materials, measured from the reference sheet. */
export const PASTEL = {
  grass: '#a9c98a',
  grassDeep: '#8fb571',
  pink: '#e6c3bc',
  pinkDeep: '#d9a79e',
  water: '#8fc3dd',
  waterDeep: '#5b9cc4',
  stone: '#ddd1c6',
  stoneDeep: '#c9b9aa',
  sage: '#cfdcc8',
  willow: '#b8d39a',
  bark: '#8a6a52',
  teal: '#a9c4c6',
  moss: '#5f9150',
  bushLight: '#a9c26e',
  bushDark: '#7fa04c',
  mushroomPink: '#ecb9b4',
  mushroomTan: '#e3c3a6',
  lilac: '#d3b6dc',
  cream: '#f3ece2',
  wood: '#d9a882',
  candyPink: '#efb3b6',
  candyPurple: '#c3a6dc',
  scarf: '#d8615e',
  white: '#f6f3ef',
  ink: '#3a3030',
};

/** Points the shared shader uniforms at the kit's studio light (call once per page). */
export function applyKitLighting() {
  const u = sharedFurUniforms;
  u.uSunDir.value.copy(KIT_STAGE.sunDir);
  u.uSunColor.value.copy(KIT_STAGE.sunColor);
  u.uSkyColor.value.copy(KIT_STAGE.ambient);
  u.uGroundColor.value.copy(KIT_STAGE.ambient);
  u.uFogDensity.value = 0;
  u.uWind.value.set(0, 0, 0);
}

/**
 * Merges duplicated seam vertices into one closed, smooth-shaded surface, so later deformation
 * (bulge, lumpy) can never open cracks along the seams. Drops uv (felt doesn't use it).
 */
export function weld(geometry) {
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  const welded = mergeVertices(geometry, 1e-4);
  welded.computeVertexNormals();
  return welded;
}

/**
 * A rounded box with evenly subdivided faces (RoundedBoxGeometry leaves each flat face as one
 * big quad, which leaves nothing for lumps and mottling to work with). `res` is subdivisions
 * per unit of length. Welded, so deformation never cracks it; ready for the felt shader.
 */
export function softBox(w, h, d, { radius = 0.14, res = 28, color = '#ffffff' } = {}) {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const seg = (len) => Math.max(4, Math.ceil(len * res));
  const g = new THREE.BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const lower = inner.clone().negate();
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.copy(v).clamp(lower, inner);
    v.sub(c).normalize().multiplyScalar(r).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return prepareTextileGeometry(weld(g), color);
}

/** Matte felt with visible fiber mottling; color multiplies the geometry's vertex colors. */
export function felt(color = '#ffffff', { fuzz = 0.12, grain = 3.4, shadeSat = KIT_STAGE.shadeSat, side } = {}) {
  return createTextile('felt', { color, fuzz, grain, shadeSat, sheen: '#ffffff', side });
}

/** Pushes a rounded box's faces outward toward a sphere: a pillow, not a brick. */
export function bulge(geometry, amount = 0.1) {
  const pos = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const c = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.62;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c);
    const sphere = v.clone().normalize().multiplyScalar(r);
    v.lerp(sphere, amount).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Chunky knit with optional stripes (up to four colors). */
export function knit(color = '#ffffff', { rows = [18, 10], stripes = null, fuzz = 0.3 } = {}) {
  return createTextile('knit', { color, knit: rows, stripes, fuzz });
}

/** Plush fur over a geometry painted in one color (or keep its vertex colors with color = null). */
export function plush(geometry, color, options = {}) {
  if (color) paint(geometry, color);
  withSeed(geometry, options.seed ?? 0.5);
  return createFur(geometry, {
    shells: 22, length: 0.05, density: 120, gravity: 0, curl: 0.15, clump: 0.3, rim: 0.4, sheen: 0.4,
    tipTint: '#ffffff', ...options,
  });
}

/** Multiplies vertex colors by a vertical gradient: darker toward the bottom (soft contact AO). */
export function shadeBottom(geometry, { from = 0, to = 1, dark = 0.8 } = {}) {
  const pos = geometry.getAttribute('position');
  const col = geometry.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - from) / (to - from), 0, 1);
    const k = THREE.MathUtils.lerp(dark, 1, t);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return geometry;
}

/** Cheap smooth 3D value noise in [0, 1] for hand-made lumps and color variation. */
export function noise3(x, y, z, seed = 0) {
  const h = (i, j, k) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.19) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const xf = x - xi; const yf = y - yi; const zf = z - zi;
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(xf); const v = f(yf); const w = f(zf);
  const lerp = THREE.MathUtils.lerp;
  const x00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u);
  const x10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u);
  const x01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u);
  const x11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/**
 * Pushes vertices along their normals by smooth noise: a hand-pressed, not machined, surface.
 * Uses the geometry's own normals (rounded boxes have matching normals on duplicated seam
 * vertices, so the surface stays closed).
 */
export function lumpy(geometry, { amount = 0.02, scale = 3, seed = 0 } = {}) {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const n = (noise3(x * scale, y * scale, z * scale, seed) - 0.5) * 2 * amount;
    pos.setXYZ(i, x + nrm.getX(i) * n, y + nrm.getY(i) * n, z + nrm.getZ(i) * n);
  }
  return geometry;
}

/**
 * Mottles vertex colors with smooth noise (felt fiber clouds, marbled water). `ridged` folds the
 * noise into thin dark creases instead of soft blotches (pressed fabric, wrinkled water felt).
 */
export function mottle(geometry, colorA, colorB, { scale = 3, seed = 0, stretch = [1, 1, 1], bias = 0, ridged = false } = {}) {
  const pos = geometry.getAttribute('position');
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  const c = new THREE.Color();
  const data = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let t = noise3(pos.getX(i) * scale * stretch[0], pos.getY(i) * scale * stretch[1], pos.getZ(i) * scale * stretch[2], seed);
    if (ridged) t = Math.pow(1 - Math.abs(2 * t - 1), 6); // 1 on the crease lines, 0 between them
    c.copy(a).lerp(b, THREE.MathUtils.clamp(t + bias, 0, 1));
    data.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

/** Marks every mesh in an element as a shadow caster. */
export function castShadows(object) {
  object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return object;
}
