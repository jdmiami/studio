// Velvet flora for the flower beds: tulips, berry clusters, and mushrooms with felt spots.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { paint } from '../fur.js';
import { PALETTE, pick } from './util.js';

function painted(geometry, color) {
  paint(geometry, color);
  return prepareTextileGeometry(geometry);
}

// Tulip cup profile (radius, height), revolved into a slightly open bloom.
const TULIP_PROFILE = [
  [0.0, 0.0], [0.09, 0.015], [0.16, 0.07], [0.2, 0.16], [0.2, 0.26], [0.17, 0.34], [0.12, 0.38],
].map(([x, y]) => new THREE.Vector2(x, y));

export function buildFlora(spots, random) {
  const blooms = [];
  const stems = [];
  const caps = [];
  const feltParts = [];

  for (const spot of spots) {
    const kind = random();
    const ox = spot.x + (random() - 0.5) * 0.5;
    const oz = spot.z + (random() - 0.5) * 0.5;
    const y = spot.y;

    if (kind < 0.55) {
      // Tulip: velvet cup on a sage stem with two leaves.
      const stemHeight = 0.5 + random() * 0.35;
      const stem = new THREE.CylinderGeometry(0.025, 0.03, stemHeight, 6, 3);
      stem.translate(ox, y + stemHeight / 2, oz);
      stems.push(painted(stem, PALETTE.velvetStem));
      for (const side of [1, -1]) {
        const leaf = new THREE.SphereGeometry(0.16, 10, 8);
        leaf.scale(0.35, 1.3, 0.12);
        leaf.rotateZ(side * 0.45);
        leaf.translate(ox + side * 0.08, y + 0.18, oz);
        stems.push(painted(leaf, PALETTE.velvetStem));
      }
      const cup = new THREE.LatheGeometry(TULIP_PROFILE, 20);
      cup.scale(1.1, 1.1, 1.1);
      cup.translate(ox, y + stemHeight - 0.02, oz);
      blooms.push(painted(cup, pick(random, PALETTE.velvet)));
    } else if (kind < 0.78) {
      // Berry cluster: plump velvet spheres.
      const color = pick(random, PALETTE.velvet);
      const count = 3 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const berry = new THREE.SphereGeometry(0.09 + random() * 0.04, 14, 10);
        berry.translate(ox + (random() - 0.5) * 0.25, y + 0.08 + random() * 0.12, oz + (random() - 0.5) * 0.25);
        blooms.push(painted(berry, color));
      }
    } else {
      // Mushroom: velvet cap, felt stem, felt spots on top.
      const capRadius = 0.28 + random() * 0.12;
      const stemHeight = 0.28 + random() * 0.15;
      const stem = new THREE.CylinderGeometry(0.07, 0.09, stemHeight, 12, 2);
      stem.translate(ox, y + stemHeight / 2, oz);
      feltParts.push(painted(stem, '#f3ece0'));
      const cap = new THREE.SphereGeometry(capRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.scale(1, 0.6, 1);
      cap.translate(ox, y + stemHeight - 0.02, oz);
      caps.push(painted(cap, pick(random, ['#d6453a', '#c93b30', '#b8862f'])));
      for (let i = 0; i < 5; i++) {
        const a = random() * Math.PI * 2;
        const rr = random() * capRadius * 0.7;
        const spot2 = new THREE.SphereGeometry(0.045, 8, 6);
        spot2.scale(1, 0.35, 1);
        const lift = Math.sqrt(Math.max(0, 1 - (rr / capRadius) ** 2)) * capRadius * 0.6;
        spot2.translate(ox + Math.cos(a) * rr, y + stemHeight - 0.02 + lift, oz + Math.sin(a) * rr);
        feltParts.push(painted(spot2, '#ffffff'));
      }
    }
  }

  const group = new THREE.Group();
  const velvet = (geoms, sheen) => new THREE.Mesh(
    mergeGeometries(geoms),
    createTextile('velvet', { sheen, side: THREE.DoubleSide }),
  );
  if (blooms.length) group.add(velvet(blooms, '#fff6f0'));
  if (stems.length) group.add(velvet(stems, '#dff0cf'));
  if (caps.length) group.add(velvet(caps, '#ffe9e2'));
  if (feltParts.length) group.add(new THREE.Mesh(mergeGeometries(feltParts), createTextile('felt', { fuzz: 0.4 })));
  return group;
}
