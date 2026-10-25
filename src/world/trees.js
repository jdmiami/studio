// Tassel willows: a yarn-wrapped trunk, a pom-pom crown, and tassels of hanging yarn
// that sway in the breeze. All strands of all trees share one instanced draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { PALETTE, pick, withSeed } from './util.js';

const STRANDS_PER_TASSEL = 9;

export function buildTasselTrees(positions, random) {
  const group = new THREE.Group();
  const trunks = [];
  const crowns = [];
  const strands = []; // { matrix, color }
  const knots = [];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tilt = new THREE.Euler();

  for (const base of positions) {
    const height = 2.4 + random() * 0.8;
    const crownColor = new THREE.Color(pick(random, PALETTE.canopy));

    const trunk = new THREE.CylinderGeometry(0.18, 0.3, height, 18, 16);
    trunk.translate(base.x, base.y + height / 2, base.z);
    trunks.push(prepareTextileGeometry(trunk, PALETTE.wool));

    const crownY = base.y + height + 0.2;
    const crown = new THREE.SphereGeometry(1.3, 32, 18);
    crown.scale(1.25, 0.62, 1.25);
    crown.translate(base.x, crownY, base.z);
    paint(crown, `#${crownColor.getHexString()}`);
    crowns.push(withSeed(crown, random()));

    // Tassels hang from a ring under the crown's rim and a few from beneath it.
    const tassels = 30;
    for (let t = 0; t < tassels; t++) {
      const angle = (t / tassels) * Math.PI * 2 + random() * 0.2;
      const ring = t % 3 === 0 ? 0.6 + random() * 0.4 : 1.3 + random() * 0.25;
      const ax = base.x + Math.cos(angle) * ring * 1.15;
      const az = base.z + Math.sin(angle) * ring * 1.15;
      const ay = crownY - 0.25 - (ring < 1.2 ? 0.25 : 0);
      const length = 1.4 + random() * 1.2;
      const tint = crownColor.clone().offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.1);

      knots.push({ x: ax, y: ay, z: az, color: tint });
      for (let k = 0; k < STRANDS_PER_TASSEL; k++) {
        const spread = 0.09;
        p.set(ax + (random() - 0.5) * spread, ay, az + (random() - 0.5) * spread);
        // Strands splay slightly outward from the tassel center.
        tilt.set((random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12);
        q.setFromEuler(tilt);
        s.set(1, length * (0.92 + random() * 0.16), 1);
        m.compose(p, q, s);
        strands.push({ matrix: m.clone(), color: tint.clone().offsetHSL(0, 0, (random() - 0.5) * 0.06) });
      }
    }
  }

  group.add(new THREE.Mesh(mergeGeometries(trunks), createTextile('yarn', { wraps: 34, fuzz: 0.3 })));
  group.add(createFur(mergeGeometries(crowns), {
    shells: 26, length: 0.28, density: 26, gravity: 0.3, curl: 0.35, clump: 0.5, tipTint: '#c6e3a0', rim: 0.9,
  }));

  // One strand: a thin plied cylinder modeled from y = 0 down to y = -1 so the shader can sway it.
  const strandGeometry = new THREE.CylinderGeometry(0.024, 0.018, 1, 5, 10, true);
  strandGeometry.translate(0, -0.5, 0);
  prepareTextileGeometry(strandGeometry);
  const strandMesh = new THREE.InstancedMesh(
    strandGeometry,
    createTextile('yarn', { wraps: 40, sway: 0.32, fuzz: 0.4, side: THREE.DoubleSide }),
    strands.length,
  );
  strands.forEach((strand, i) => {
    strandMesh.setMatrixAt(i, strand.matrix);
    strandMesh.setColorAt(i, strand.color);
  });
  strandMesh.frustumCulled = false;
  group.add(strandMesh);

  // A wrapped knot caps each tassel where it hangs from the crown.
  const knotGeometry = prepareTextileGeometry(new THREE.SphereGeometry(0.075, 10, 8));
  const knotMesh = new THREE.InstancedMesh(knotGeometry, createTextile('yarn', { wraps: 8 }), knots.length);
  knots.forEach((k, i) => {
    knotMesh.setMatrixAt(i, m.makeTranslation(k.x, k.y, k.z));
    knotMesh.setColorAt(i, k.color);
  });
  group.add(knotMesh);

  return group;
}
