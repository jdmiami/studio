// Props traced from the reference (scripts/fp/trace_props.py -> src/cave/traced-props.json), for the
// ones no kit model matches: the stepped felt domes the painting scatters over the terraces, and
// the broom tree. Each instance is its family's generator fitted to the painted outline: a dome is
// a stack of rounded felt tiers (widths, heights and colours from the tiers traced inside its
// silhouette), the broom a lathe of its traced radius bands on a felt handle. The domes are now
// turned from the traced silhouette itself (depth-seeded masks, scripts/fp/trace_props.py).
import * as THREE from 'three';
import { sharedFurUniforms } from '../fur.js';
import { bulge, lumpy, softBox } from '../kit/style.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import traced from './traced-props.json';

/** The painting's colours are lit; divide out the scene light's response on a side face. */
function albedo(hex) {
  const u = sharedFurUniforms;
  const wrap = THREE.MathUtils.clamp((new THREE.Vector3(0.5, 0.3, 0.8).normalize().dot(u.uSunDir.value) + 0.4) / 1.4, 0, 1);
  const response = u.uSkyColor.value.clone().lerp(u.uGroundColor.value, 0.5).multiplyScalar(0.7)
    .add(u.uSunColor.value.clone().multiplyScalar(0.8 * wrap));
  const c = new THREE.Color(hex);
  return new THREE.Color(c.r / response.r, c.g / response.g, c.b / response.b);
}

function paint(g, color) {
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}

/**
 * A stepped dome, turned from its painted outline: the traced silhouette's half-width per row is
 * the lathe profile (the painting's beehive, not stacked slabs), pinched into grooves at the tier
 * lines traced across it, each tier band in its painted colour. Instances traced before the profile
 * existed fall back to the slab stack.
 */
function dome(p, seed, material) {
  if (!p.profile?.length) return slabDome(p, seed, material);
  const prof = p.profile;
  const top = prof.at(-1)[0];
  // Resample finely so the grooves have rows to pinch, then close the top in a soft cap.
  const pts = [new THREE.Vector2(0.001, 0)];
  const N = 48;
  const radiusAt = (y) => {
    if (y <= prof[0][0]) return prof[0][1];
    for (let i = 1; i < prof.length; i++) {
      if (y <= prof[i][0]) {
        const t = (y - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]);
        return prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * t;
      }
    }
    return prof.at(-1)[1];
  };
  const groove = (y) => (p.grooves ?? []).reduce((k, g) => k * (1 - 0.09 * Math.exp(-(((y - g) / 0.035) ** 2))), 1);
  for (let i = 0; i <= N; i++) {
    const y = (top * i) / N;
    pts.push(new THREE.Vector2(Math.max(0.002, radiusAt(y) * groove(y)), y));
  }
  // The painted top is a rounded crown: arc from the last row's radius into the axis.
  const r0 = pts.at(-1).x;
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, r0 * Math.cos(a)), top + r0 * 0.55 * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, 36);
  lumpy(g, { amount: 0.008, scale: 9, seed });
  g.computeVertexNormals();
  // Tier colours: bands between grooves, bottom up (parts are bottom first, grooves their tops).
  const cuts = [0, ...(p.grooves ?? []), Infinity];
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const tierColors = p.parts.map((t) => albedo(t.color));
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let k = 0;
    while (k < cuts.length - 2 && y > cuts[k + 1]) k++;
    const c = tierColors[Math.min(k, tierColors.length - 1)];
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(prepareTextileGeometry(g), material));
  return group;
}

/** The older slab stack: rounded tiers from the bottom up, each no wider than the one below. */
function slabDome(p, seed, material) {
  const group = new THREE.Group();
  const widest = Math.max(...p.parts.map((t) => t.w));
  let y = 0;
  let below = Infinity;
  for (const [i, t] of p.parts.entries()) {
    if (t.w < widest * 0.25) continue; // side knobs and slivers of a neighbour, not tiers
    const w = Math.min(t.w, below);
    below = w;
    const g = softBox(w, t.h, w, { radius: Math.min(w, t.h) * 0.49, res: 10 });
    bulge(g, 0.16);
    g.translate(0, y + t.h / 2, 0);
    lumpy(g, { amount: 0.01, scale: 9, seed: seed + i });
    paint(g, albedo(t.color));
    group.add(new THREE.Mesh(prepareTextileGeometry(g), material));
    y += t.h * 0.82;
  }
  return group;
}

/** The broom tree: a felt handle up to its head, the head a lathe of the traced radius bands. */
function broom(p, material) {
  const group = new THREE.Group();
  const handle = new THREE.CylinderGeometry(0.07, 0.08, p.lift + 0.1, 14, 4);
  handle.translate(0, (p.lift + 0.1) / 2, 0);
  group.add(new THREE.Mesh(prepareTextileGeometry(paint(handle, albedo('#8ea489'))), material));
  const points = [new THREE.Vector2(0.001, 0)];
  for (const b of p.parts) points.push(new THREE.Vector2(b.r, b.y0), new THREE.Vector2(b.r, b.y1));
  points.push(new THREE.Vector2(0.001, p.parts.at(-1).y1));
  const head = new THREE.LatheGeometry(points, 40);
  // Bristle grooves: the painting's head is fluted top to bottom.
  const pos = head.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + 0.035 * Math.sin(a * 22);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  head.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const band = p.parts.find((b) => y >= b.y0 - 1e-3 && y <= b.y1 + 1e-3) ?? p.parts.at(-1);
    const c = albedo(band.color);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  head.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  head.translate(0, p.lift, 0);
  group.add(new THREE.Mesh(prepareTextileGeometry(head), material));
  return group;
}

/** Builds every traced prop at its placed position. */
export function buildTracedProps() {
  const group = new THREE.Group();
  const material = createTextile('felt', { fuzz: 0.4, grain: 1.5 });
  traced.props.forEach((p, i) => {
    const object = p.family === 'lathe' ? broom(p, material) : dome(p, 100 + i * 7, material);
    object.position.set(p.x, p.y, p.z);
    group.add(object);
  });
  return group;
}
