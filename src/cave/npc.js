// The girl on the upper-left terrace of the cave painting: a chibi felt figure with a brown bob and
// bangs, a slate sailor top with a white collar and a pale blue scarf, waving, behind a small wooden
// railing. Built in felt like everything else (the cel shading and ink outlines style her), one unit
// tall before scaling; `update(time)` animates the wave and a small idle bob.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';

const COLORS = {
  skin: '#f1cdb6',
  blush: '#f2a9a0',
  hair: '#8c6b57',
  top: '#5d5862',
  collar: '#f4eee8',
  scarf: '#a9c6da',
  legs: '#4f4a52',
  shoes: '#6e5547',
  ink: '#3d2f2c',
  wood: '#b48d74',
  woodDark: '#9c7863',
};

function painted(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  if (g.getAttribute('uv') === undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

function felt(parts) {
  const merged = mergeGeometries(parts.map((g) => {
    // mergeGeometries needs the same attributes everywhere.
    for (const name of [...Object.keys(g.attributes)]) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    return g;
  }));
  return new THREE.Mesh(prepareTextileGeometry(merged), createTextile('felt', { fuzz: 0.3, grain: 1.2 }));
}

/** The head: skin sphere, the hair (a bob with bangs), eyes, smile and blush. Origin at the neck. */
function head() {
  const parts = [];
  const skull = new THREE.SphereGeometry(0.2, 32, 20);
  skull.scale(1, 0.95, 0.95);
  skull.translate(0, 0.19, 0);
  parts.push(painted(skull, COLORS.skin));
  // Hair: a slightly larger sphere; in front, below the bangs line, it folds inside the head (the face
  // shows); everywhere it stops at the bob's straight hem.
  const hair = new THREE.SphereGeometry(0.222, 40, 24);
  const p = hair.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const front = z > 0.06 && Math.abs(x) < 0.17;
    if (front && y < 0.06) { x *= 0.7; y *= 0.7; z *= 0.6; } // the face's opening, tucked in
    if (y < -0.13) y = -0.13 + (y + 0.13) * 0.15; // the bob's hem, flat
    // The bob flares a little at the hem.
    if (y < 0) { const k = 1 + (-y) * 0.5; x *= k; z *= front ? 1 : k; }
    p.setXYZ(i, x, y, z);
  }
  hair.computeVertexNormals();
  hair.translate(0, 0.2, -0.005);
  parts.push(painted(hair, COLORS.hair));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.022, 12, 8);
    eye.scale(0.8, 1.15, 0.5);
    eye.translate(s * 0.075, 0.17, 0.185);
    parts.push(painted(eye, COLORS.ink));
    const blush = new THREE.CircleGeometry(0.03, 16);
    blush.translate(s * 0.12, 0.12, 0.172);
    blush.rotateY(s * 0.55);
    parts.push(painted(blush, COLORS.blush));
  }
  const smile = new THREE.TorusGeometry(0.03, 0.007, 6, 16, Math.PI);
  smile.rotateZ(Math.PI);
  smile.translate(0, 0.115, 0.19);
  parts.push(painted(smile, COLORS.ink));
  return parts;
}

/** An arm hanging from the shoulder pivot: sleeve and hand. */
function arm() {
  const sleeve = new THREE.CapsuleGeometry(0.055, 0.2, 6, 12);
  sleeve.translate(0, -0.13, 0);
  const hand = new THREE.SphereGeometry(0.055, 14, 10);
  hand.translate(0, -0.29, 0);
  return felt([painted(sleeve, COLORS.top), painted(hand, COLORS.skin)]);
}

/** A small wooden railing (posts and three rails), `width` wide, `height` tall, front along +z. */
export function buildRailing(width = 1.1, height = 0.75) {
  const parts = [];
  const posts = 3;
  for (let i = 0; i < posts; i++) {
    const x = -width / 2 + (i * width) / (posts - 1);
    const post = new RoundedBoxGeometry(0.09, height + 0.08, 0.09, 2, 0.025);
    post.translate(x, (height + 0.08) / 2, 0);
    parts.push(painted(post, COLORS.wood));
  }
  for (const [y, c] of [[height * 0.35, COLORS.woodDark], [height * 0.65, COLORS.wood], [height, COLORS.wood]]) {
    const rail = new RoundedBoxGeometry(width + 0.1, 0.07, 0.07, 2, 0.02);
    rail.translate(0, y, 0.02);
    parts.push(painted(rail, c));
  }
  const railing = felt(parts);
  railing.name = 'railing';
  return railing;
}

/**
 * The girl, one unit tall (feet at y 0), facing +z. Returns { group, update(time) }.
 */
export function buildNpc() {
  const group = new THREE.Group();
  group.name = 'npc';
  const body = new THREE.Group();
  group.add(body);

  // Legs and shoes.
  const lower = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.CapsuleGeometry(0.05, 0.14, 4, 10);
    leg.translate(s * 0.07, 0.12, 0);
    lower.push(painted(leg, COLORS.legs));
    const shoe = new RoundedBoxGeometry(0.1, 0.06, 0.15, 2, 0.025);
    shoe.translate(s * 0.07, 0.03, 0.02);
    lower.push(painted(shoe, COLORS.shoes));
  }
  // The sailor top: a soft bell, the collar (a flat wedge over the shoulders), the scarf knot.
  const top = new THREE.CylinderGeometry(0.15, 0.21, 0.3, 24, 3);
  top.translate(0, 0.37, 0);
  lower.push(painted(top, COLORS.top));
  const collar = new THREE.CylinderGeometry(0.11, 0.17, 0.05, 24, 1, false, -Math.PI * 0.6, Math.PI * 1.2);
  collar.translate(0, 0.505, 0.01);
  lower.push(painted(collar, COLORS.collar));
  const knot = new THREE.SphereGeometry(0.035, 12, 8);
  knot.scale(1.3, 0.8, 0.6);
  knot.translate(0, 0.46, 0.15);
  lower.push(painted(knot, COLORS.scarf));
  for (const s of [-1, 1]) {
    const tail = new THREE.ConeGeometry(0.025, 0.08, 8);
    tail.rotateZ(Math.PI + s * 0.35);
    tail.translate(s * 0.02, 0.41, 0.155);
    lower.push(painted(tail, COLORS.scarf));
  }
  body.add(felt(lower));

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.52, 0);
  headGroup.add(felt(head()));
  body.add(headGroup);

  // Arms: her right one (on the viewer's left when she faces them, local -x) raised in a wave.
  const waving = new THREE.Group();
  waving.position.set(-0.17, 0.48, 0);
  waving.add(arm());
  body.add(waving);
  const resting = new THREE.Group();
  resting.position.set(0.17, 0.48, 0);
  resting.rotation.z = 0.12;
  resting.add(arm());
  body.add(resting);

  return {
    group,
    update(time) {
      waving.rotation.z = -2.8 + Math.sin(time * 6.5) * 0.22; // hand up by her head, waving
      waving.rotation.x = -0.15;
      headGroup.rotation.z = Math.sin(time * 1.6) * 0.06;
      body.position.y = Math.abs(Math.sin(time * 3.25)) * 0.015;
    },
  };
}
