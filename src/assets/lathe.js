// Round assets turned from their painted outline (src/assets/lathe-fits.json, fitted by
// scripts/assets/fit_lathes.py): the profile is the silhouette's half-width per row, so the solid's
// side view is the painted one; each family has its own textile (knit ribs for the knit domes,
// fuzzy felt for the pom and the critters). Colours come from projection painting (the studio and
// the scene paint each instance from its cut-out); until then a neutral white.
import * as THREE from 'three';
import { createTextile, prepareTextileGeometry } from '../textile.js';

const MATERIALS = {
  mushroom: () => createTextile('felt', { fuzz: 0.25, grain: 1.2 }),
  // Vertical cable columns of stacked chevrons, as painted: about ten across the visible half.
  'knit-shrub': () => createTextile('knit', { knit: [20, 8], fuzz: 0.2 }),
  // The small green cushion is smooth felt in the painting, not knit.
  'knit-bush': () => createTextile('felt', { fuzz: 0.3, grain: 1.2 }),
  pom: () => createTextile('felt', { fuzz: 0.75, grain: 2.2 }),
  critter: () => createTextile('felt', { fuzz: 0.7, grain: 2 }),
  // The tiered felt domes and stones (their tier lines come from the projection paint).
  stone: () => createTextile('felt', { fuzz: 0.4, grain: 1.5 }),
  bush: () => createTextile('felt', { fuzz: 0.4, grain: 1.5 }),
};
const cache = new Map();
const materialFor = (family) => {
  if (!cache.has(family)) cache.set(family, (MATERIALS[family] ?? MATERIALS.mushroom)());
  return cache.get(family);
};

/**
 * A lathe asset from its fit: base at the origin (lifted by fit.lift), 64 segments round. `grooves`
 * (heights above the outline's bottom: the tier lines traced inside a stepped dome) pinch the
 * profile in, so the tiers read in the light from every side, not only in the painted view.
 */
export function buildLathe(fit, { grooves = [] } = {}) {
  const prof = fit.profile;
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
  const pinch = (y) => grooves.reduce((k, g) => k * (1 - 0.08 * Math.exp(-(((y - g) / 0.03) ** 2))), 1);
  const points = [new THREE.Vector2(0.001, prof[0][0])];
  if (grooves.length) {
    const [y0, y1] = [prof[0][0], prof.at(-1)[0]];
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const y = y0 + ((y1 - y0) * i) / N;
      points.push(new THREE.Vector2(Math.max(0.004, radiusAt(y) * pinch(y)), y));
    }
  } else {
    for (const [y, r] of prof) points.push(new THREE.Vector2(Math.max(0.004, r), y));
  }
  // Close the top over a soft crown (the outline's top row is already narrow).
  const [yTop, rTop] = prof.at(-1);
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.max(0.001, rTop * Math.cos(a)), yTop + rTop * 0.25 * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(points, 64);
  g.translate(0, fit.lift, 0);
  g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.85), 3));
  const mesh = new THREE.Mesh(prepareTextileGeometry(g), materialFor(fit.family));
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
