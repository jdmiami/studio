// Cube trees fitted from their painted cut-outs (src/assets/cubetree-fits.json,
// scripts/assets/fit_cubetrees.py): a canopy of puffy felt cubes, one per covered cell of the
// painted silhouette's grid, each row as deep as it is wide, on a felt trunk. Local frame: x across
// as the painter sees it, y up, +z toward the painter. Colours come from projection painting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bulge, lumpy, softBox } from '../kit/style.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';

let canopyMaterial = null;
let trunkMaterial = null;

function painted(g, color) {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g.index ? g.toNonIndexed() : g;
}

/** A cube tree from its fit: base at the origin. */
export function buildCubeTree(fit) {
  const s = fit.cube;
  const cubes = [];
  let seed = 1;
  for (const row of fit.canopy.rows) {
    // Round-ish from above, a cube shallower than wide (the outer front cubes are the sides seen in
    // perspective); deeper canopies stand nearer the painter and draw too big.
    const depth = Math.max(2, row.cols.length - 1);
    for (const i of row.cols) {
      for (let k = 0; k < depth; k++) {
        const g = softBox(s * 1.02, s * 0.98, s * 1.02, { radius: s * 0.4, res: 10 });
        bulge(g, 0.12);
        lumpy(g, { amount: s * 0.025, scale: 5, seed: seed++ });
        g.translate(fit.canopy.x0 + (i + 0.5) * s, fit.canopy.y0 + (row.row + 0.5) * s, (k - (depth - 1) / 2) * s);
        cubes.push(painted(g, '#b3bea4'));
      }
    }
  }
  const t = fit.trunk;
  const trunk = softBox(t.width, t.height, t.width * 0.9, { radius: t.width * 0.18, res: 10 });
  trunk.translate(t.x, t.height / 2, 0);
  canopyMaterial ??= createTextile('felt', { fuzz: 0.5, grain: 1.8 });
  trunkMaterial ??= createTextile('felt', { fuzz: 0.2, grain: 1.2 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(prepareTextileGeometry(mergeGeometries(cubes)), canopyMaterial));
  group.add(new THREE.Mesh(prepareTextileGeometry(painted(trunk, '#8f6c55')), trunkMaterial));
  return group;
}
