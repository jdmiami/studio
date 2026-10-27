// Projection painting: a traced prop takes the painting's own pixels. Each vertex is projected
// through the reference camera (the solved pose of docs/reference/cave-door.jpg) into the prop's
// painted crop (public/cave/props/prop-<i>.png, alpha = its traced silhouette); where it lands on the
// silhouette and faces the camera, its colour is that pixel with the scene's light divided out (so
// the textile shader's own light brings the painted value back). Vertices the painting does not
// show (the back, the underside, a sliver past the silhouette) take the mean painted colour of their
// height band, so the hidden side continues the visible one.
import * as THREE from 'three';
import { sharedFurUniforms } from '../fur.js';
import layout from './layout.json';

const W = 1024;
const H = 572;
const BANDS = 12;

let referenceCamera = null;
function camera() {
  if (referenceCamera) return referenceCamera;
  const c = layout.camera;
  referenceCamera = new THREE.PerspectiveCamera(c.fov, W / H, 0.05, 200);
  referenceCamera.position.fromArray(c.eye);
  referenceCamera.rotation.set(THREE.MathUtils.degToRad(c.pitch), THREE.MathUtils.degToRad(c.yaw), THREE.MathUtils.degToRad(c.roll), 'YXZ');
  referenceCamera.updateMatrixWorld(true);
  return referenceCamera;
}

function celRamp(x, cel) {
  const s = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
  const stepped = 0.3 * s(0.13, 0.23, x) + 0.7 * s(0.45, 0.55, x);
  return x + (stepped - x) * cel;
}

/** The scene light's response on a surface with world normal n (the textile shader's terms). */
function response(n, out) {
  const u = sharedFurUniforms;
  const l = u.uSunDir.value.clone().normalize();
  const wrap = celRamp(THREE.MathUtils.clamp((n.dot(l) + 0.4) / 1.4, 0, 1), u.uCel.value);
  const ambient = u.uGroundColor.value.clone().lerp(u.uSkyColor.value, n.y * 0.5 + 0.5).multiplyScalar(0.7);
  return out.copy(ambient).add(u.uSunColor.value.clone().multiplyScalar(0.8 * wrap));
}

const crops = new Map();
async function loadCrop(src) {
  if (!crops.has(src)) {
    crops.set(src, (async () => {
      const bitmap = await createImageBitmap(await (await fetch(src)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    })());
  }
  return crops.get(src);
}

/**
 * Paints every mesh under `object` (already placed in the world, vertex colours present) from the
 * painted crop `paint` = { src, x, y } (the crop's top-left in reference pixels). Returns the
 * fraction of vertices the painting covered.
 */
export async function projectPaint(object, paint) {
  const img = await loadCrop(paint.src);
  const cam = camera();
  object.updateWorldMatrix(true, true);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const resp = new THREE.Color();
  const c = new THREE.Color();
  const normalMatrix = new THREE.Matrix3();
  let painted = 0;
  let total = 0;
  object.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData.noPaint) return;
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const col = g.getAttribute('color');
    if (!pos || !nor || !col) return;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    // World heights, to band the fallback colours.
    let yMin = Infinity;
    let yMax = -Infinity;
    const ys = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      ys[i] = p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).y;
      yMin = Math.min(yMin, ys[i]);
      yMax = Math.max(yMax, ys[i]);
    }
    const band = (y) => Math.min(BANDS - 1, Math.floor(((y - yMin) / Math.max(yMax - yMin, 1e-6)) * BANDS));
    const sums = Array.from({ length: BANDS }, () => [0, 0, 0, 0]);
    const got = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      total++;
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      if (n.dot(toEye.subVectors(cam.position, p)) <= 0) continue; // faces away from the painter
      const ndc = p.clone().project(cam);
      const u = Math.floor(((ndc.x + 1) / 2) * W) - paint.x;
      const v = Math.floor(((1 - ndc.y) / 2) * H) - paint.y;
      if (u < 0 || v < 0 || u >= img.width || v >= img.height) continue;
      const k = (v * img.width + u) * 4;
      if (img.data[k + 3] < 128) continue; // off the traced silhouette
      c.setRGB(img.data[k] / 255, img.data[k + 1] / 255, img.data[k + 2] / 255, THREE.SRGBColorSpace);
      response(n, resp);
      col.setXYZ(i, c.r / resp.r, c.g / resp.g, c.b / resp.b);
      got[i] = 1;
      painted++;
      const s = sums[band(ys[i])];
      s[0] += col.getX(i); s[1] += col.getY(i); s[2] += col.getZ(i); s[3]++;
    }
    // Hidden vertices: the band's mean painted colour, else the nearest band that has one.
    const mean = sums.map((s) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : null));
    for (let b = 0; b < BANDS; b++) {
      if (mean[b]) continue;
      for (let d = 1; d < BANDS; d++) {
        const m = mean[b - d] ?? mean[b + d];
        if (m) { mean[b] = m; break; }
      }
    }
    if (mean.some(Boolean)) {
      for (let i = 0; i < pos.count; i++) if (!got[i] && mean[band(ys[i])]) col.setXYZ(i, ...mean[band(ys[i])]);
    }
    col.needsUpdate = true;
  });
  return total ? painted / total : 0;
}
