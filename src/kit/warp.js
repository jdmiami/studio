// Silhouette warp (img2threejs: "align the mesh's shape precisely with the photo"): nudge each
// element's vertices, perpendicular to the view, so its outline lands exactly on the reference
// element's outline. The procedural model keeps its structure; only vertices near the silhouette
// move, by at most a few reference pixels (a few hundredths of a unit), so the element still looks
// right from every other angle.
//
// The outline is measured the way scripts/kit/pixel_test.py measures it, on both images: the kit's
// own final render (box-downsampled to sheet pixels) and the reference sheet go through the same
// mask operator, so the operator's bias (where on a soft dark edge it puts the boundary) cancels.
// That operator also takes in cast shadows, so a vertex only moves where, in both images, the mask
// boundary is the element's own outline: within a pixel of the element-only silhouette (the render's
// depth coverage of just this element; on the reference, the test mask with its ground shadow
// peeled off).
//
// Per pass: a vertex projecting to sheet pixel p moves along the reference mask's distance gradient
// by -(dRef(p) - dOurs(p)), faded by its distance from the element's silhouette. A couple of passes
// (render, measure, move) converge where one linear step would over- or under-shoot.
import * as THREE from 'three';
import { KIT_STAGE } from './style.js';

const PAD = 6;
const SIGMA = 2.5; // px: how far inside the outline the correction fades out
const MAX_SHIFT = 3; // px per pass
const EDGE_AGREE = 1.25; // px: the test mask boundary must be this close to the element's own outline
const BASE_SIGMA = 2; // px: how far above the base the base-contour correction fades out
const BASE_LINE_HALF = 0.65; // px from the contour line's centre to the silhouette's edge (swept 0.5-1)
const BG = [220, 220, 220];

/** Signed distance (px, positive outside) to the boundary of a w x h boolean mask. */
function signedDistance(mask, w, h) {
  // Edge pixels of each class (those with a 4-neighbour of the other class); a pixel's distance is
  // to the nearest edge pixel of the other class, less half a pixel, so the boundary sits between
  // pixel centres and the field is continuous across it.
  const edges = [[], []];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = mask[y * w + x];
      const edge = (x > 0 && mask[y * w + x - 1] !== m) || (x < w - 1 && mask[y * w + x + 1] !== m)
        || (y > 0 && mask[(y - 1) * w + x] !== m) || (y < h - 1 && mask[(y + 1) * w + x] !== m);
      if (edge) edges[m ? 1 : 0].push(x, y);
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = mask[y * w + x];
      const other = edges[inside ? 0 : 1];
      let best = 1e9;
      for (let i = 0; i < other.length; i += 2) {
        const dx = other[i] - x; const dy = other[i + 1] - y;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      const d = Math.sqrt(best) - 0.5;
      out[y * w + x] = inside ? -d : d;
    }
  }
  return out;
}

function sample(field, w, h, x, y) {
  const fx = Math.min(Math.max(x - 0.5, 0), w - 1.001);
  const fy = Math.min(Math.max(y - 0.5, 0), h - 1.001);
  const x0 = Math.floor(fx); const y0 = Math.floor(fy);
  const ax = fx - x0; const ay = fy - y0;
  const i = y0 * w + x0;
  return (field[i] * (1 - ax) + field[i + 1] * ax) * (1 - ay) + (field[i + w] * (1 - ax) + field[i + w + 1] * ax) * ay;
}

/** Luminance edge strength (central differences, as numpy's gx[:, 1:-1] / gy[1:-1, :]). */
function edges(rgb, w, h) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x > 0 && x < w - 1 ? lum[y * w + x + 1] - lum[y * w + x - 1] : 0;
      const gy = y > 0 && y < h - 1 ? lum[(y + 1) * w + x] - lum[(y - 1) * w + x] : 0;
      g[y * w + x] = Math.hypot(gx, gy);
    }
  }
  return g;
}

/** Everything the flood from the crop border cannot reach through `passable` pixels. */
function unreached(passable, w, h) {
  const reached = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => { const k = y * w + x; if (passable[k] && !reached[k]) { reached[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % w; const y = (k - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = reached[i] ? 0 : 1;
  return mask;
}

/** pixel_test.py's mask_of: non-background (element plus cast shadow), enclosed holes filled. */
function testMask(rgb, w, h) {
  const g = edges(rgb, w, h);
  const passable = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3]; const gg = rgb[i * 3 + 1]; const b = rgb[i * 3 + 2];
    const d = Math.hypot(r - BG[0], gg - BG[1], b - BG[2]);
    const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
    passable[i] = d <= 20 && sat <= 14 && g[i] <= 28 ? 1 : 0;
  }
  return unreached(passable, w, h);
}

/** Separable Gaussian blur of a w x h field. */
function blur(src, w, h, sigma) {
  const r = Math.ceil(sigma * 2.5);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < w) s += src[y * w + xx] * k[i + r]; }
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < h) s += tmp[yy * w + x] * k[i + r]; }
      out[y * w + x] = s;
    }
  }
  return out;
}

/**
 * Where an outline lies along the outward normal (nx, ny) from pixel (x, y)'s centre, to a fraction
 * of a pixel: the outermost point where the colour's distance from the background falls to half its
 * strongest value just inside (the contour line, or the element's own colour). Measured the same
 * way on the reference and on our render, so the operator's bias cancels; a binary mask can't place
 * an edge within its pixel, least of all a straight vertical one. NaN unless there is clean
 * background just outside.
 */
function crossing(rgb, w, h, x, y, nx, ny, outside = null) {
  const at = (s) => {
    const fx = Math.min(Math.max(x + s * nx, 0), w - 1.001);
    const fy = Math.min(Math.max(y + s * ny, 0), h - 1.001);
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const ax = fx - x0; const ay = fy - y0;
    const k = y0 * w + x0;
    return [0, 1, 2].map((c) => (rgb[k * 3 + c] * (1 - ax) + rgb[(k + 1) * 3 + c] * ax) * (1 - ay)
      + (rgb[(k + w) * 3 + c] * (1 - ax) + rgb[(k + w + 1) * 3 + c] * ax) * ay);
  };
  // Distances are from the background grey, or (outside = true) from whatever lies just outside
  // the outline, so an edge against a cast shadow is placed too; that shadow must be even there.
  const level = outside ? at(3) : BG;
  const dev = (s) => Math.hypot(...at(s).map((v, c) => v - level[c]));
  if (outside ? dev(2.25) > 8 : dev(3) > 14 || dev(2.5) > 14) return NaN;
  let peak = 0;
  for (let s = -3; s <= 0.5; s += 0.25) peak = Math.max(peak, dev(s));
  if (peak < (outside ? 15 : 30)) return NaN;
  const half = peak / 2;
  for (let s = 2.5; s > -3; s -= 0.25) {
    const a = dev(s); const b = dev(s - 0.25);
    if (a < half && b >= half) return s - 0.25 * ((half - a) / (b - a));
  }
  return NaN;
}

/**
 * Smooth screen-space displacement (sheet px) toward the reference outline. Measured on the pixels
 * of our element's outline where both test masks end at an element outline, then spread by
 * normalized convolution, so the per-pixel staircase of the masks (and JPEG noise on the
 * reference) averages out instead of making straight edges ragged. Sub-pixel disagreements count
 * as zero: a mask boundary can't resolve them, unless `fine` (our render's colours) is given: then
 * both images' outlines are placed to a fraction of a pixel where they cross clean background.
 */
function displacementField(ref, oursTest, oursElem, w, h, fine = null) {
  const du = new Float32Array(w * h);
  const dv = new Float32Array(w * h);
  const wt = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (Math.abs(oursElem[k]) > 1.5) continue;
      const ot = oursTest[k];
      const rt = ref.dTest[k];
      // Only where both test masks end at the element's own outline (not at a cast shadow)...
      if (Math.abs(ot - oursElem[k]) > EDGE_AGREE || Math.abs(rt - ref.dElem[k]) > EDGE_AGREE) {
        // ...unless placing outlines finely: then an outline against a cast shadow is placed by
        // its colour against the shadow, along our own outline's normal.
        if (!fine || Math.abs(ref.dElem[k]) > 2.5) continue;
        const ex = oursElem[k + 1] - oursElem[k - 1];
        const ey = oursElem[k + w] - oursElem[k - w];
        const el = Math.hypot(ex, ey);
        if (el < 1e-3) continue;
        const tRef = crossing(ref.rgb, w, h, x, y, ex / el, ey / el, true);
        const tOurs = crossing(fine, w, h, x, y, ex / el, ey / el, true);
        if (Number.isNaN(tRef) || Number.isNaN(tOurs) || Math.abs(tRef - tOurs) >= 2.5) continue;
        wt[k] = 1;
        du[k] = (ex / el) * (tRef - tOurs);
        dv[k] = (ey / el) * (tRef - tOurs);
        continue;
      }
      const gx = ref.dTest[k + 1] - ref.dTest[k - 1];
      const gy = ref.dTest[k + w] - ref.dTest[k - w];
      const gl = Math.hypot(gx, gy);
      wt[k] = 1;
      if (gl < 1e-3) continue;
      let amount = -(rt - ot); // px along the reference field's gradient
      if (Math.abs(amount) < 0.6) amount = 0;
      if (fine) {
        // Sub-pixel: where each image's outline crosses the normal, when both are found.
        const tRef = crossing(ref.rgb, w, h, x, y, gx / gl, gy / gl);
        const tOurs = crossing(fine, w, h, x, y, gx / gl, gy / gl);
        if (!Number.isNaN(tRef) && !Number.isNaN(tOurs) && Math.abs(tRef - tOurs) < 2.5) amount = tRef - tOurs;
      }
      amount = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, amount));
      du[k] = (gx / gl) * amount;
      dv[k] = (gy / gl) * amount;
    }
  }
  const bw = blur(wt, w, h, 2);
  const bu = blur(du, w, h, 2);
  const bv = blur(dv, w, h, 2);
  for (let i = 0; i < w * h; i++) {
    const confidence = Math.min(1, bw[i] / 0.25);
    du[i] = bw[i] > 1e-3 ? (bu[i] / bw[i]) * confidence : 0;
    dv[i] = bw[i] > 1e-3 ? (bv[i] / bw[i]) * confidence : 0;
  }
  return { u: du, v: dv };
}

/**
 * The element alone: pixel_test's mask with the ground shadow (a low-saturation blue-grey) peeled
 * off its edges, ring by ring. Unlike an outline-enclosed region this holds for small elements,
 * whose faint outlines leak.
 */
function elementMask(rgb, w, h) {
  const mask = testMask(rgb, w, h);
  const shadow = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3]; const g = rgb[i * 3 + 1]; const b = rgb[i * 3 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    shadow[i] = b >= g - 1 && b >= r - 1 && lum < 205 && Math.max(r, g, b) - Math.min(r, g, b) < 24 ? 1 : 0;
  }
  for (let ring = 0; ring < 16; ring++) {
    const peel = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!mask[k] || !shadow[k]) continue;
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
          || !mask[k - 1] || !mask[k + 1] || !mask[k - w] || !mask[k + w];
        if (edge) peel.push(k);
      }
    }
    if (!peel.length) break;
    for (const k of peel) mask[k] = 0;
  }
  return mask;
}

/** Crop of the reference sheet as float RGB. */
function sheetCrop(sheet, x0, y0, w, h) {
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * sheet.width + x0 + x) * 4;
      rgb.set([sheet.data[i], sheet.data[i + 1], sheet.data[i + 2]], (y * w + x) * 3);
    }
  }
  return rgb;
}

/** Reads the canvas (top row first) right after a render. */
function readCanvas(renderer) {
  const gl = renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return { width, height, at: (x, y) => ((height - 1 - y) * width + x) * 4, pixels };
}

/** Window-pixel coverage of one element (an element-only render), as a predicate. */
function elementCoverage(renderer, scene, camera, element, width, height) {
  const target = new THREE.WebGLRenderTarget(width, height);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hidden = [];
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible) return;
    let inside = false;
    for (let p = o; p; p = p.parent) if (p === element) { inside = true; break; }
    if (!inside) { hidden.push(o); o.visible = false; }
  });
  const background = scene.background;
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  scene.background = null;
  scene.overrideMaterial = material;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clearColor, clearAlpha);
  scene.overrideMaterial = null;
  scene.background = background;
  for (const o of hidden) o.visible = true;
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  target.dispose();
  material.dispose();
  return (x, y) => pixels[((height - 1 - y) * width + x) * 4] > 127;
}

/**
 * The base contour, column by column (sheet px, continuous: a pixel spans [y, y + 1]): where our
 * element's lowest covered pixel ends (exact, from its depth coverage at window resolution) and
 * where the reference's ends. The masks can't place the reference's base: there the element runs
 * into its contact shadow. But every base on the sheet carries the style's dark contour line just
 * inside the silhouette, so the reference's base is found from that line: its darkest pixel near
 * our base, refined to sub-pixel with a parabola, plus half the line's width (BASE_LINE_HALF).
 * (Our own render can't be measured the same way: its line is the reference's, baked onto
 * whichever vertices land there.) Returns { ours, dv } per column (dv: sheet px to move the base
 * down; NaN where not measured), dv smoothed along the contour.
 */
function baseOffsets(refRgb, covered, x0, y0, w, h, toWindow, n) {
  const ours = new Float32Array(w).fill(NaN);
  const raw = new Float32Array(w).fill(NaN);
  const lum = (x, y) => 0.299 * refRgb[(y * w + x) * 3] + 0.587 * refRgb[(y * w + x) * 3 + 1] + 0.114 * refRgb[(y * w + x) * 3 + 2];
  for (let x = 0; x < w; x++) {
    const [wx, wy0] = toWindow(x0 + x, y0);
    let bottom = 0; let cols = 0;
    for (let dx = 0; dx < n; dx++) {
      for (let py = Math.floor(wy0) + h * n - 1; py >= Math.floor(wy0); py--) {
        if (covered(Math.floor(wx) + dx, py)) { bottom += (py + 1 - wy0) / n; cols++; break; }
      }
    }
    if (cols < n) continue;
    ours[x] = bottom / cols;
    // The reference's contour line: the darkest pixel within 5 rows of our base, if it is a line
    // (clearly darker than the pixels two rows above and below it), not a gradient.
    const guess = Math.floor(ours[x] - 0.5);
    let best = -1; let bestL = 1e9;
    for (let y = Math.max(2, guess - 5); y <= Math.min(h - 3, guess + 5); y++) {
      const l = lum(x, y);
      if (l < bestL) { bestL = l; best = y; }
    }
    if (best < 0 || bestL > 130 || bestL > Math.min(lum(x, best - 2), lum(x, best + 2)) - 15) continue;
    const a = lum(x, best - 1); const c = lum(x, best + 1);
    const curve = a - 2 * bestL + c;
    const off = curve > 1e-3 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * curve))) : 0;
    const refBase = best + 0.5 + off + BASE_LINE_HALF;
    const d = refBase - ours[x];
    if (Math.abs(d) <= 4) raw[x] = d;
  }
  // Smooth along the contour (normalized convolution), so JPEG noise in single columns averages out.
  const dv = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) {
    if (Number.isNaN(ours[x])) continue;
    let s = 0; let k = 0;
    for (let i = -4; i <= 4; i++) {
      const v = raw[x + i];
      if (v === undefined || Number.isNaN(v)) continue;
      const g = Math.exp(-(i * i) / 8);
      s += v * g; k += g;
    }
    if (k > 1) dv[x] = s / k;
  }
  return { ours, dv };
}

/**
 * Warps each element toward its reference silhouette. `items` gives each element's sheet box;
 * `renderFrame()` draws the kit's final image to the canvas; `toWindow(u, v)` maps a sheet pixel
 * to a window pixel; `pxPerRef` is window px per sheet px. `options[id].base` also moves the
 * element's base contour onto the reference's (see baseOffsets); `options[id].fine` places its
 * outline to a fraction of a pixel (see crossing).
 */
export function warpToReference(elements, items, sheet, { renderer, scene, camera, renderFrame, toWindow, pxPerRef, passes = 2, options = {} }) {
  const size = renderer.getSize(new THREE.Vector2());
  const width = Math.floor(size.x);
  const height = Math.floor(size.y);
  const right = new THREE.Vector3(Math.cos(KIT_STAGE.azimuth), 0, -Math.sin(KIT_STAGE.azimuth));
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const toward = new THREE.Vector3(Math.sin(KIT_STAGE.azimuth), 0, Math.cos(KIT_STAGE.azimuth)); // horizontal, toward the camera
  const n = Math.round(pxPerRef);
  const stats = {};
  const refCache = {};
  for (let pass = 0; pass < passes; pass++) {
    scene.updateMatrixWorld(true);
    renderFrame();
    const canvas = readCanvas(renderer);
    for (const element of elements) {
      const item = items.find((it) => it.id === element.name);
      const [bx0, by0, bx1, by1] = item.box;
      const x0 = bx0 - PAD; const y0 = by0 - PAD;
      const w = bx1 - bx0 + 2 * PAD; const h = by1 - by0 + 2 * PAD;
      if (!refCache[element.name]) {
        const rgb = sheetCrop(sheet, x0, y0, w, h);
        if (window.__kitWarpProbe === element.name) window.__kitWarpRef = { w, h, rgb: [...rgb] };
        refCache[element.name] = {
          rgb,
          dTest: signedDistance(testMask(rgb, w, h), w, h),
          dElem: signedDistance(elementMask(rgb, w, h), w, h),
        };
      }
      const ref = refCache[element.name];
      // Our render, box-downsampled to sheet pixels (as the test does), and this element's coverage.
      const covered = elementCoverage(renderer, scene, camera, element, width, height);
      const rgb = new Float32Array(w * h * 3);
      const elem = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const [wx, wy] = toWindow(x0 + x, y0 + y);
          let r = 0; let g = 0; let b = 0; let hits = 0; let total = 0;
          for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
            const px = Math.floor(wx) + dx; const py = Math.floor(wy) + dy;
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
            const i = canvas.at(px, py);
            r += canvas.pixels[i]; g += canvas.pixels[i + 1]; b += canvas.pixels[i + 2];
            total++;
            if (covered(px, py)) hits++;
          }
          if (total) rgb.set([r / total, g / total, b / total], (y * w + x) * 3);
          elem[y * w + x] = total && hits * 2 >= total ? 1 : 0;
        }
      }
      const oursTest = signedDistance(testMask(rgb, w, h), w, h);
      const oursElem = signedDistance(elem, w, h);
      const field = displacementField(ref, oursTest, oursElem, w, h, options[element.name]?.fine ? rgb : null);
      const base = options[element.name]?.base ? baseOffsets(ref.rgb, covered, x0, y0, w, h, toWindow, n) : null;
      if (window.__kitWarpProbe === element.name) {
        (window.__kitWarpDebug ??= []).push({ w, h, oursTest: [...oursTest], oursElem: [...oursElem], refTest: [...ref.dTest], refElem: [...ref.dElem], u: [...field.u], v: [...field.v], base: base && { ours: [...base.ours], dv: [...base.dv] } });
      }
      let moved = 0;
      let sum = 0;
      const v = new THREE.Vector3();
      const shift = new THREE.Vector3();
      element.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const pos = mesh.geometry.getAttribute('position');
        const inverse = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          const ndc = v.clone().project(camera);
          const wxp = (ndc.x * 0.5 + 0.5) * width;
          const wyp = (1 - (ndc.y * 0.5 + 0.5)) * height;
          const su = (wxp - width / 2) / pxPerRef + sheet.width / 2 - x0;
          const sv = (wyp - height / 2) / pxPerRef + sheet.height / 2 - y0;
          if (su < 1 || sv < 1 || su > w - 2 || sv > h - 2) continue;
          const oe = sample(oursElem, w, h, su, sv);
          // Fade out toward the ground: there the reference's outline runs into its dark contact
          // shadow, which no mask can tell from the element.
          const ground = Math.min(1, Math.max(0, (v.y - 0.02) / 0.1));
          const weight = Math.exp(-(oe * oe) / (SIGMA * SIGMA)) * ground * ground * (3 - 2 * ground);
          const du = weight >= 0.02 ? sample(field.u, w, h, su, sv) * weight : 0;
          const dv = weight >= 0.02 ? sample(field.v, w, h, su, sv) * weight : 0;
          // The base contour instead follows the reference's contour line (no ground fade): a
          // vertex moves down by the column's offset, faded by its height above our base.
          const col = Math.floor(su);
          let db = 0;
          if (base && !Number.isNaN(base.dv[col])) {
            const above = base.ours[col] - sv;
            if (above > -1) db = base.dv[col] * Math.exp(-(above * above) / (BASE_SIGMA * BASE_SIGMA));
          }
          const amount = Math.hypot(du, dv + db);
          if (amount < 0.05) continue;
          // Sheet px -> world: right is +u, screen-down (+v) is -up. The base moves horizontally
          // toward the camera instead (which only moves it down the screen), so it never sinks
          // below the ground, where the ground's shadow decals would paint over it.
          shift.copy(right).multiplyScalar(du / KIT_STAGE.pxPerUnit).addScaledVector(up, -dv / KIT_STAGE.pxPerUnit)
            .addScaledVector(toward, db / (Math.sin(KIT_STAGE.elevation) * KIT_STAGE.pxPerUnit));
          v.add(shift).applyMatrix4(inverse);
          pos.setXYZ(i, v.x, v.y, v.z);
          moved++;
          sum += Math.abs(amount);
        }
        pos.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
      });
      (stats[element.name] ??= []).push({ moved, meanShift: moved ? +(sum / moved).toFixed(2) : 0 });
    }
  }
  return stats;
}
