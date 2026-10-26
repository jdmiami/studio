// Baked finish (img2threejs "projection-first fidelity"): give each element's felt surfaces the
// reference sheet's own colors, de-lit, as vertex colors.
//
// For every vertex of a felt mesh: project it through the kit camera onto the sheet, keep it only
// if it is the frontmost surface there (depth pass) and well inside the reference element's
// silhouette (so outline and halo pixels are not baked in), sample the reference, and invert the
// kit's shading model (textile.js) to recover the albedo that renders to that pixel. Hidden
// vertices copy the albedo of their mirror image across the element's own x and z planes, then
// keep the procedural color if no mirror was baked. The meshes carry about one vertex per
// reference pixel, so this captures the sheet at its own resolution, and the element still renders
// correctly from any angle (the albedo is lighting-free).
import * as THREE from 'three';
import { KIT_STAGE } from './style.js';

const SHEET_URL = '/kit/asset-kit.jpg';
const BG = [220, 220, 220];

let sheetPromise = null;

/** The reference sheet's pixels (sRGB bytes) and a per-pixel "well inside an element" mask. */
function loadSheet() {
  sheetPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
      // Foreground (differs from the grey background), then eroded by 2 px so silhouette-edge
      // pixels (outline, halo, anti-aliasing) never become albedo.
      const fg = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2];
        const d = Math.hypot(r - BG[0], g - BG[1], b - BG[2]);
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        fg[i] = d > 20 || sat > 14 ? 1 : 0;
      }
      const inner = new Uint8Array(width * height);
      for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
          let all = 1;
          for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) if (!fg[(y + dy) * width + x + dx]) { all = 0; break; }
          inner[y * width + x] = all;
        }
      }
      resolve({ data, width, height, inner });
    };
    img.onerror = () => reject(new Error(`could not load ${SHEET_URL}`));
    img.src = SHEET_URL;
  });
  return sheetPromise;
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function sampleSheet(sheet, u, v) {
  // Bilinear, in linear light.
  const x = Math.min(Math.max(u - 0.5, 0), sheet.width - 1.001);
  const y = Math.min(Math.max(v - 0.5, 0), sheet.height - 1.001);
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const fx = x - x0; const fy = y - y0;
  const out = [0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const i = ((y0 + dy) * sheet.width + x0 + dx) * 4;
    for (let c = 0; c < 3; c++) out[c] += srgbToLinear(sheet.data[i + c] / 255) * w;
  }
  return out;
}

const isFelt = (m) => m.isMesh && !m.isInstancedMesh && m.material?.uniforms?.uMode?.value === 0;

/** Depth of the frontmost felt surface per window pixel, from the kit camera. */
function depthPass(renderer, scene, camera, width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType });
  const material = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }',
  });
  const hidden = [];
  scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && !isFelt(o) && o.visible) { hidden.push(o); o.visible = false; } });
  const background = scene.background;
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  scene.background = null;
  scene.overrideMaterial = material;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clearColor, clearAlpha);
  scene.overrideMaterial = null;
  scene.background = background;
  for (const o of hidden) o.visible = true;
  const pixels = new Float32Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  target.dispose();
  material.dispose();
  return (x, y) => pixels[((height - 1 - y) * width + x) * 4]; // flip: GL rows start at the bottom
}

/** Albedo (vertex color, linear) that the kit's felt shading turns into `obs` for normal n. */
function delight(obs, n, material) {
  const l = KIT_STAGE.sunDir;
  const sun = KIT_STAGE.sunColor;
  const amb = KIT_STAGE.ambient;
  const u = material.uniforms;
  const shadeSat = u.uShadeSat?.value ?? 0;
  const fuzz = u.uFuzz.value;
  const sheen = u.uSheenColor.value;
  const tint = u.uColor.value;
  const wrap = THREE.MathUtils.clamp((n.dot(l) + 0.4) / 1.4, 0, 1);
  const viewDir = new THREE.Vector3(Math.sin(KIT_STAGE.azimuth) * Math.cos(KIT_STAGE.elevation), Math.sin(KIT_STAGE.elevation),
    Math.cos(KIT_STAGE.azimuth) * Math.cos(KIT_STAGE.elevation));
  const ndv = THREE.MathUtils.clamp(n.dot(viewDir), 0, 1);
  const rimW = Math.pow(1 - ndv, 2.5) * fuzz * (0.4 + 0.6 * wrap);
  const target = [obs[0] - sheen.r * rimW, obs[1] - sheen.g * rimW, obs[2] - sheen.b * rimW].map((v) => Math.max(v, 0));
  const ambArr = [amb.r, amb.g, amb.b];
  const sunArr = [sun.r, sun.g, sun.b];
  const tintArr = [tint.r, tint.g, tint.b];
  // base = vertexColor * uColor; solve for base, then divide out uColor.
  let base = target.map((t, c) => t / (ambArr[c] * 0.7 + sunArr[c] * wrap * 0.8));
  for (let it = 0; it < 4; it++) {
    const luma = Math.max(0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2], 0.02);
    base = target.map((t, c) => {
      const shadeTint = 1 + (base[c] / luma - 1) * shadeSat * (1 - wrap);
      return t / (ambArr[c] * 0.7 * shadeTint + sunArr[c] * wrap * 0.8);
    });
  }
  return base.map((b, c) => THREE.MathUtils.clamp(b / Math.max(tintArr[c], 1e-3), 0, 1.5));
}

/**
 * Bakes the reference's de-lit colors into every felt mesh of the given elements.
 * `toSheet(x, y)` converts a window pixel to a sheet pixel. Returns per-element coverage.
 */
export async function bakeFinish(elements, { renderer, scene, camera, toSheet }) {
  const sheet = await loadSheet();
  scene.updateMatrixWorld(true);
  const size = renderer.getSize(new THREE.Vector2());
  const width = Math.floor(size.x);
  const height = Math.floor(size.y);
  const depthAt = depthPass(renderer, scene, camera, width, height);
  const stats = {};
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const element of elements) {
    const rootInverse = element.matrixWorld.clone().invert();
    let baked = 0;
    let total = 0;
    element.traverse((mesh) => {
      if (!isFelt(mesh)) return;
      mesh.material.uniforms.uGrain.value = 0; // the baked colors already carry the felt's texture
      const geometry = mesh.geometry;
      const pos = geometry.getAttribute('position');
      const nrm = geometry.getAttribute('normal');
      const col = geometry.getAttribute('color');
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      const done = new Uint8Array(pos.count);
      const local = new Float32Array(pos.count * 3); // element-space positions, for mirror fill
      for (let i = 0; i < pos.count; i++) {
        total++;
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const lp = v.clone().applyMatrix4(rootInverse);
        local.set([lp.x, lp.y, lp.z], i * 3);
        n.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
        const ndc = v.clone().project(camera);
        const x = (ndc.x * 0.5 + 0.5) * width;
        const y = (1 - (ndc.y * 0.5 + 0.5)) * height;
        const xi = Math.floor(x); const yi = Math.floor(y);
        if (xi < 0 || yi < 0 || xi >= width || yi >= height) continue;
        const toCam = new THREE.Vector3().subVectors(camera.position, v).normalize();
        if (n.dot(toCam) < 0.1) continue;
        if (ndc.z * 0.5 + 0.5 > depthAt(xi, yi) + 0.0003) continue; // something nearer covers it
        const [su, sv] = toSheet(x, y);
        const pi = Math.floor(sv) * sheet.width + Math.floor(su);
        if (!sheet.inner[pi]) continue;
        const albedo = delight(sampleSheet(sheet, su, sv), n, mesh.material);
        col.setXYZ(i, albedo[0], albedo[1], albedo[2]);
        done[i] = 1;
        baked++;
      }
      // Mirror fill: a hidden vertex takes the albedo of the nearest baked vertex at its mirror
      // image across the element's x = 0 and z = 0 planes.
      const cell = 0.04;
      const grid = new Map();
      const key = (x, y, z) => `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
      for (let i = 0; i < pos.count; i++) {
        if (!done[i]) continue;
        const k = key(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
        if (!grid.has(k)) grid.set(k, i);
      }
      for (let i = 0; i < pos.count; i++) {
        if (done[i]) continue;
        const x = local[i * 3]; const y = local[i * 3 + 1]; const z = local[i * 3 + 2];
        for (const [mx, mz] of [[-x, z], [x, -z], [-x, -z]]) {
          const j = grid.get(key(mx, y, mz));
          if (j !== undefined) {
            col.setXYZ(i, col.getX(j), col.getY(j), col.getZ(j));
            break;
          }
        }
      }
      col.needsUpdate = true;
    });
    stats[element.name] = { baked, total, coverage: total ? +(baked / total).toFixed(3) : 0 };
  }
  return stats;
}
