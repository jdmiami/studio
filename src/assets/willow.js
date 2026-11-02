// Willows fitted from their painted cut-outs (src/assets/willow-fits.json, scripts/assets/fit_willows.py):
// a small top dome with four caps round it, each hung with fat felt drips reaching the painted drips'
// ends, on a trunk. Local frame: x across as the painter sees it, y up, +z toward the painter.
// Colours come from projection painting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lumpy, softBox } from '../kit/style.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';

let leafMaterial = null;
let barkMaterial = null;

function painted(g, color) {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  return g.index ? g.toNonIndexed() : g;
}

/** A dome: a half spheroid of radius r and height h, base at y = 0. */
function dome(r, h) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, r * Math.cos(a)), h * Math.sin(a)));
  }
  pts.unshift(new THREE.Vector2(0.001, 0));
  return new THREE.LatheGeometry(pts.reverse().reverse(), 32);
}

/** A willow from its fit: base at the origin. */
export function buildWillow(fit) {
  const W = fit.halfWidth;
  const rc = W * 0.46; // the caps: rounded bells, five round the top dome (three face the painter)
  const hc = rc * 1.1;
  const ring = W - rc;
  const leaves = [];
  const dripAt = (x) => {
    const t = THREE.MathUtils.clamp((x - (fit.canopyX - W)) / (2 * W), 0, 0.999) * fit.drips.length;
    const i = Math.floor(t);
    const f = t - i;
    const a = fit.drips[i];
    const b = fit.drips[Math.min(i + 1, fit.drips.length - 1)];
    return a + (b - a) * f;
  };
  let seed = 1;
  for (let k = 0; k < 5; k++) {
    const ang = (k * Math.PI * 2) / 5;
    const cx = fit.canopyX + ring * Math.sin(ang);
    const cz = ring * Math.cos(ang);
    const cap = dome(rc, hc);
    lumpy(cap, { amount: rc * 0.03, scale: 6, seed: seed++ });
    cap.translate(cx, fit.rimY, cz);
    leaves.push(painted(cap, '#b9cc98'));
    // Drips round the cap's rim, each reaching the painted drips' end at its place across.
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2 + k * 0.3;
      const x = cx + rc * 0.88 * Math.sin(a);
      const z = cz + rc * 0.88 * Math.cos(a);
      // Uneven, puffy drips: lengths jittered round the painted ends.
      const bottom = Math.min(fit.rimY - 0.12, dripAt(x) + 0.09 * Math.sin(j * 7.1 + k * 2.3));
      const len = fit.rimY + 0.06 - bottom;
      const rad = rc * (0.2 + 0.04 * Math.sin(j * 3.7 + k));
      const strand = new THREE.CapsuleGeometry(rad, Math.max(0.02, len - 2 * rad), 4, 10);
      strand.translate(x, bottom + len / 2, z);
      leaves.push(painted(strand, '#b9cc98'));
    }
  }
  // The top dome, above the caps.
  const topBase = fit.rimY + hc * 0.55;
  const top = dome(W * 0.45, Math.max(0.1, fit.top - topBase));
  lumpy(top, { amount: W * 0.02, scale: 6, seed: 9 });
  top.translate(fit.canopyX, topBase, 0);
  leaves.push(painted(top, '#b9cc98'));
  const t = fit.trunk;
  const trunkH = fit.rimY + 0.1;
  const trunk = softBox(t.width, trunkH, t.width * 0.85, { radius: t.width * 0.18, res: 10 });
  trunk.translate(t.x, trunkH / 2, 0);
  leafMaterial ??= createTextile('felt', { fuzz: 0.45, grain: 1.6 });
  barkMaterial ??= createTextile('felt', { fuzz: 0.2, grain: 1.2 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(prepareTextileGeometry(mergeGeometries(leaves)), leafMaterial));
  group.add(new THREE.Mesh(prepareTextileGeometry(painted(trunk, '#9b7a62')), barkMaterial));
  return group;
}
