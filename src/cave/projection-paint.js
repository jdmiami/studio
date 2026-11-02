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
const REVOLVE_LIMIT = THREE.MathUtils.degToRad(62); // how far round from the view a revolved vertex samples

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

/**
 * The scene light's response on a surface with world normal n (the textile shader's terms; velvet,
 * mode 2, lights its core at (ambient 0.45 + sun 0.55) x 0.85 instead of felt's 0.7 + 0.8).
 */
function response(n, out, mode = 0) {
  const u = sharedFurUniforms;
  const l = u.uSunDir.value.clone().normalize();
  const wrap = celRamp(THREE.MathUtils.clamp((n.dot(l) + 0.4) / 1.4, 0, 1), u.uCel.value);
  const velvet = mode === 2;
  // Knit (mode 1) shades each stitch (lobes 0.38..1, ply 0.88..1): about 0.74 on average.
  const stitch = mode === 1 ? 0.74 : 1;
  const ambient = u.uGroundColor.value.clone().lerp(u.uSkyColor.value, n.y * 0.5 + 0.5).multiplyScalar(velvet ? 0.45 * 0.85 : 0.7);
  return out.copy(ambient).add(u.uSunColor.value.clone().multiplyScalar((velvet ? 0.55 * 0.85 : 0.8) * wrap)).multiplyScalar(stitch);
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
 *
 * `revolve` (round assets, turned about the object's vertical axis): every vertex is first rotated
 * about that axis into the painted front, a back vertex to its mirror point (the side away from the
 * painter repeats the side toward it), a vertex near the outline to within REVOLVE_LIMIT of the
 * view, where the painting's own outline ink and grazing compression begin. So the asset is painted
 * all round, without the seams and streaks of per-band fallback colours. `faced`: the back takes the
 * painted side's edge colour instead of the mirrored front (a face would repeat behind).
 *
 * `mirror` (a flat asset, a fence: its world plane normal through the object's origin): a vertex
 * facing away from the painter is reflected through that plane and painted from its front twin.
 */
export async function projectPaint(object, paint, { revolve = false, faced = false, mirror = null } = {}) {
  const img = await loadCrop(paint.src);
  const cam = camera();
  object.updateWorldMatrix(true, true);
  const axis = object.getWorldPosition(new THREE.Vector3());
  const toCam = Math.atan2(cam.position.x - axis.x, cam.position.z - axis.z);
  const up = new THREE.Vector3(0, 1, 0);
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const cAcc = new THREE.Color();
  const q = new THREE.Vector3();
  const m = new THREE.Vector3();
  /**
   * The de-lit painted colour at world point p0 with normal n0, turned by `turn` about the asset's
   * axis first; false when that point faces away from the painter or misses the silhouette.
   */
  const sampleAt = (p0, n0, turn, mode, out) => {
    q.copy(p0);
    m.copy(n0);
    if (turn) {
      q.sub(axis).applyAxisAngle(up, turn).add(axis);
      m.applyAxisAngle(up, turn);
    }
    if (m.dot(toEye.subVectors(cam.position, q)) <= 0) return false;
    const ndc = q.clone().project(cam);
    const u = Math.floor(((ndc.x + 1) / 2) * W) - paint.x;
    const v = Math.floor(((1 - ndc.y) / 2) * H) - paint.y;
    if (u < 0 || v < 0 || u >= img.width || v >= img.height) return false;
    const k = (v * img.width + u) * 4;
    if (img.data[k + 3] < 128) return false; // off the traced silhouette
    c.setRGB(img.data[k] / 255, img.data[k + 1] / 255, img.data[k + 2] / 255, THREE.SRGBColorSpace);
    response(m, resp, mode);
    out.setRGB(c.r / resp.r, c.g / resp.g, c.b / resp.b);
    return true;
  };
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
      const mode = mesh.material?.uniforms?.uMode?.value ?? 0;
      let ok;
      if (revolve) {
        const a = Math.atan2(p.x - axis.x, p.z - axis.z);
        const d = Math.atan2(Math.sin(a - toCam), Math.cos(a - toCam)); // -pi..pi from the view
        if (Math.abs(d) <= Math.PI / 2 || !faced) {
          // The back mirrors the front; near the outline, clamp inside it.
          let f = Math.abs(d) > Math.PI / 2 ? Math.sign(d) * (Math.PI - Math.abs(d)) : d;
          f = THREE.MathUtils.clamp(f, -REVOLVE_LIMIT, REVOLVE_LIMIT);
          ok = sampleAt(p, n, f - d, mode, cAcc);
        } else {
          // A face's back: the painted side's two edge colours, blended across the back (a face
          // would repeat if mirrored, and one edge alone leaves a seam behind).
          const own = Math.sign(d) * REVOLVE_LIMIT;
          const w = 0.5 + 0.5 * ((Math.PI - Math.abs(d)) / (Math.PI / 2));
          const okA = sampleAt(p, n, own - d, mode, cA);
          const okB = sampleAt(p, n, -own - d, mode, cB);
          ok = okA || okB;
          if (okA && okB) cAcc.setRGB(cA.r * w + cB.r * (1 - w), cA.g * w + cB.g * (1 - w), cA.b * w + cB.b * (1 - w));
          else if (okA) cAcc.copy(cA);
          else if (okB) cAcc.copy(cB);
        }
      } else {
        ok = sampleAt(p, n, 0, mode, cAcc);
        if (!ok && mirror) {
          // The back of a flat asset: its twin through the asset's plane.
          const off = toEye.subVectors(p, axis).dot(mirror);
          const nOff = n.dot(mirror);
          const pr = p.clone().addScaledVector(mirror, -2 * off);
          const nr = n.clone().addScaledVector(mirror, -2 * nOff);
          ok = sampleAt(pr, nr, 0, mode, cAcc);
        }
      }
      if (!ok) continue;
      col.setXYZ(i, cAcc.r, cAcc.g, cAcc.b);
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
