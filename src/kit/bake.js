// Baked finish (img2threejs "projection-first fidelity"): give each element's felt surfaces the
// reference sheet's own colors, de-lit, as vertex colors.
//
// For every vertex of a felt mesh: project it through the kit camera onto the sheet, keep it only
// if it is the frontmost surface there (depth pass) and well inside the reference element's
// silhouette (so outline and halo pixels are not baked in), sample the reference, and invert the
// kit's shading model (textile.js) to recover the albedo that renders to that pixel. Hidden
// vertices copy the albedo of their mirror image across the element's own x and z planes, then
// keep the procedural color if no mirror was baked. The meshes carry about one vertex per
// reference pixel (the blocks two to three, sampled nearest, which keeps the felt's pixel-level
// grain), so this captures the sheet at its own resolution, and the element still renders
// correctly from any angle (the albedo is lighting-free).
import * as THREE from 'three';
import { KIT_STAGE } from './style.js';

const SHEET_URL = '/kit/asset-kit.jpg';
const BG = [220, 220, 220];

let sheetPromise = null;

/** The reference sheet's pixels (sRGB bytes) and a per-pixel "well inside an element" mask. */
export function loadSheet() {
  sheetPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
      // Foreground as scripts/kit/pixel_test.py sees it: everything the backdrop can't reach by
      // flooding in from the sheet's border through backdrop-coloured pixels, stopped by strong
      // edges (the outlines). White fur and pale highlights are backdrop-coloured but enclosed, so
      // they count. Then eroded by 2 px so silhouette-edge pixels (outline, halo, anti-aliasing)
      // never become albedo.
      const lum = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      const passable = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2];
          const gx = x > 0 && x < width - 1 ? lum[i + 1] - lum[i - 1] : 0;
          const gy = y > 0 && y < height - 1 ? lum[i + width] - lum[i - width] : 0;
          const bgLike = Math.hypot(r - BG[0], g - BG[1], b - BG[2]) <= 20 && Math.max(r, g, b) - Math.min(r, g, b) <= 14;
          passable[i] = bgLike && Math.hypot(gx, gy) <= 28 ? 1 : 0;
        }
      }
      const reached = new Uint8Array(width * height);
      const stack = [];
      const seed = (i) => { if (passable[i] && !reached[i]) { reached[i] = 1; stack.push(i); } };
      for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
      for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
      while (stack.length) {
        const i = stack.pop();
        const x = i % width;
        if (x > 0) seed(i - 1);
        if (x < width - 1) seed(i + 1);
        if (i >= width) seed(i - width);
        if (i < (height - 1) * width) seed(i + width);
      }
      const fg = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) fg[i] = reached[i] ? 0 : 1;
      // inner: 2 px in (the default); inner1: 1 px in, for thin parts (fence rails, sticks) whose
      // 2 px margin would leave only their lit centre line to bake.
      const erode = (r) => {
        const out = new Uint8Array(width * height);
        for (let y = r; y < height - r; y++) {
          for (let x = r; x < width - r; x++) {
            let all = 1;
            for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r; dx++) if (!fg[(y + dy) * width + x + dx]) { all = 0; break; }
            out[y * width + x] = all;
          }
        }
        return out;
      };
      resolve({ data, width, height, inner: erode(2), inner1: erode(1) });
    };
    img.onerror = () => reject(new Error(`could not load ${SHEET_URL}`));
    img.src = SHEET_URL;
  });
  return sheetPromise;
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function sampleSheet(sheet, u, v, nearest = false) {
  if (nearest) {
    // The pixel itself: on a dense mesh (two or more vertices per reference pixel) bilinear would
    // blur the felt's pixel-level grain a second time, on top of the interpolation between vertices.
    const i = (Math.floor(v) * sheet.width + Math.floor(u)) * 4;
    return [0, 1, 2].map((c) => srgbToLinear(sheet.data[i + c] / 255));
  }
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

function isShadowLike(sheet, pi) {
  const r = sheet.data[pi * 4]; const g = sheet.data[pi * 4 + 1]; const b = sheet.data[pi * 4 + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return lum < 214 && sat < 12 && b >= r - 6;
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
  // The shadow side's saturation depends on base itself: iterate to the fixed point. It converges
  // slowly on shaded faces of strong hues (a few iterations left the water's shaded face a full
  // 10 levels too blue), so run until it settles.
  let base = target.map((t, c) => t / (ambArr[c] * 0.7 + sunArr[c] * wrap * 0.8));
  for (let it = 0; it < 60; it++) {
    const luma = Math.max(0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2], 0.02);
    const next = target.map((t, c) => {
      const shadeTint = 1 + (base[c] / luma - 1) * shadeSat * (1 - wrap);
      return t / Math.max(ambArr[c] * 0.7 * shadeTint + sunArr[c] * wrap * 0.8, 1e-3);
    });
    const change = Math.abs(next[0] - base[0]) + Math.abs(next[1] - base[1]) + Math.abs(next[2] - base[2]);
    base = next;
    if (change < 1e-5) break;
  }
  return base.map((b, c) => THREE.MathUtils.clamp(b / Math.max(tintArr[c], 1e-3), 0, 1.5));
}

/**
 * Bakes the reference's de-lit colors into every felt mesh of the given elements.
 * `toSheet(x, y)` converts a window pixel to a sheet pixel. Returns per-element coverage.
 */
export async function bakeFinish(elements, { renderer, scene, camera, toSheet, options = {} }) {
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
    // Neutral-grey elements (white fur, grey stone) opt out with { skipNeutral: false }; thin ones
    // bake closer to their outline with { margin: 1 }; dense meshes take each vertex's own sheet
    // pixel with { sample: 'nearest' }.
    const skipNeutral = options[element.name]?.skipNeutral ?? true;
    const inner = options[element.name]?.margin === 1 ? sheet.inner1 : sheet.inner;
    const nearest = options[element.name]?.sample === 'nearest';
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
      const proc = col.array.slice(); // procedural colours, for the fill's shading transfer
      const lum = (a, i) => 0.2126 * a[i * 3] + 0.7152 * a[i * 3 + 1] + 0.0722 * a[i * 3 + 2];
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
        if (!inner[pi]) continue;
        const sample = sampleSheet(sheet, su, sv, nearest);
        // Skip cast-shadow / background samples (neutral to blue grey, darker than the backdrop):
        // they land where this element's geometry overhangs a gap in the reference (between
        // willow drips, beside a trunk) and would paint it grey. Neighbor fill covers them.
        if (skipNeutral && isShadowLike(sheet, pi)) continue;
        const albedo = delight(sample, n, mesh.material);
        col.setXYZ(i, albedo[0], albedo[1], albedo[2]);
        done[i] = 1;
        baked++;
      }
      // Neighbor fill: an unbaked vertex close to baked ones (a rim the depth or facing test
      // rejected, a crease between puffs) takes the normal-weighted average of baked vertices
      // within 0.07 units, so baked and procedural colors never meet at a visible seam.
      const nearCell = 0.07;
      const nearGrid = new Map();
      // Numeric cell keys (string keys dominate the bake time on dense meshes).
      const cellKey = (cx, cy, cz) => ((cx + 1024) * 2048 + cy + 1024) * 2048 + cz + 1024;
      const nearKey = (x, y, z) => cellKey(Math.floor(x / nearCell), Math.floor(y / nearCell), Math.floor(z / nearCell));
      const wpos = new Float32Array(pos.count * 3);
      const wnrm = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
        wpos.set([v.x, v.y, v.z], i * 3);
        wnrm.set([n.x, n.y, n.z], i * 3);
        if (!done[i]) continue;
        const k = nearKey(v.x, v.y, v.z);
        if (!nearGrid.has(k)) nearGrid.set(k, []);
        nearGrid.get(k).push(i);
      }
      // Two rounds: close neighbors with similar normals first, then (for silhouette rims, which
      // face sideways and are too close to the outline to bake) anything baked within twice the
      // radius whose normal isn't opposite, so no rim keeps the procedural colour.
      for (const [radius, minFacing] of [[nearCell, 0.3], [nearCell * 2, -0.1]]) {
        const filled = new Uint8Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
          if (done[i]) continue;
          const x = wpos[i * 3]; const y = wpos[i * 3 + 1]; const z = wpos[i * 3 + 2];
          const cx = Math.floor(x / nearCell); const cy = Math.floor(y / nearCell); const cz = Math.floor(z / nearCell);
          const reach = Math.ceil(radius / nearCell);
          let wsum = 0; let r = 0; let g = 0; let b = 0; let pl = 0;
          for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
            const list = nearGrid.get(cellKey(cx + dx, cy + dy, cz + dz));
            if (!list) continue;
            for (const j of list) {
              const ddx = wpos[j * 3] - x; const ddy = wpos[j * 3 + 1] - y; const ddz = wpos[j * 3 + 2] - z;
              const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d2 > radius * radius) continue;
              const facing = wnrm[i * 3] * wnrm[j * 3] + wnrm[i * 3 + 1] * wnrm[j * 3 + 1] + wnrm[i * 3 + 2] * wnrm[j * 3 + 2];
              if (facing < minFacing) continue;
              const w = (facing - minFacing + 0.05) * (1 - Math.sqrt(d2) / radius);
              wsum += w; r += col.array[j * 3] * w; g += col.array[j * 3 + 1] * w; b += col.array[j * 3 + 2] * w;
              pl += lum(proc, j) * w;
            }
          }
          if (wsum > 0) {
            // Keep this vertex's procedural shading relative to its sources (contact darkening on
            // a bottom rim), in the reference's colour.
            const k = Math.min(1.2, Math.max(0.5, lum(proc, i) / Math.max(pl / wsum, 1e-4)));
            col.setXYZ(i, (r / wsum) * k, (g / wsum) * k, (b / wsum) * k);
            filled[i] = 1;
          }
        }
        for (let i = 0; i < pos.count; i++) if (filled[i]) done[i] = 1;
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
