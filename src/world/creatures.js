// The Fluffalo: cream fleece, button eyes, and a striped knitted scarf.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { withSeed } from './util.js';

export function buildFluffalo(random) {
  const parts = [];
  const add = (geometry, color) => {
    paint(geometry, color);
    parts.push(withSeed(geometry, random()));
  };
  const body = new THREE.SphereGeometry(1, 32, 24);
  body.scale(1.35, 1.0, 1.0);
  body.translate(0, 1.25, 0);
  add(body, '#f4efe6');
  const head = new THREE.SphereGeometry(0.62, 28, 20);
  head.translate(1.35, 1.5, 0);
  add(head, '#efe6da');
  for (const [x, z] of [[0.7, 0.5], [0.7, -0.5], [-0.7, 0.5], [-0.7, -0.5]]) {
    const leg = new THREE.CylinderGeometry(0.2, 0.22, 0.7, 12, 3);
    leg.translate(x, 0.35, z);
    add(leg, '#6b5646');
  }
  for (const side of [1, -1]) {
    const horn = new THREE.SphereGeometry(0.2, 16, 12);
    horn.scale(1, 1.6, 1);
    horn.translate(1.45, 2.1, side * 0.42);
    add(horn, '#d9c49a');
  }

  const group = new THREE.Group();
  group.add(createFur(mergeGeometries(parts), {
    shells: 36, length: 0.34, density: 34, gravity: 0.3, curl: 0.45, clump: 0.6,
    tipTint: '#ffffff', rim: 1.3, glitter: 0.15, iridescence: 0,
  }));

  // Knitted scarf around the neck, with two striped tails.
  const scarfStripes = ['#c8302f', '#f5f1ea', '#c8302f', '#f5f1ea'];
  const ring = prepareTextileGeometry(new THREE.TorusGeometry(0.52, 0.17, 18, 56));
  const scarf = new THREE.Mesh(ring, createTextile('knit', { knit: [44, 7], stripes: scarfStripes, fuzz: 0.5 }));
  scarf.rotation.y = Math.PI / 2;
  scarf.rotation.x = 0.25;
  scarf.position.set(1.0, 1.42, 0);
  group.add(scarf);
  for (const [z, angle] of [[0.32, 0.18], [0.12, -0.12]]) {
    const tail = prepareTextileGeometry(new RoundedBoxGeometry(0.3, 0.85, 0.1, 2, 0.04));
    const mesh = new THREE.Mesh(tail, createTextile('knit', { knit: [6, 12], stripes: scarfStripes, fuzz: 0.5 }));
    mesh.position.set(1.3, 0.95, z + 0.28);
    mesh.rotation.set(0.15, 0.3, angle);
    group.add(mesh);
  }

  // Glossy button eyes and a nose: the only hard surfaces, like a real plush toy.
  const button = new THREE.MeshPhysicalMaterial({ color: '#2a2036', roughness: 0.15, clearcoat: 1 });
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), button);
    eye.position.set(1.88, 1.62, side * 0.26);
    group.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshPhysicalMaterial({
    color: '#3a2a2a', roughness: 0.2, clearcoat: 1,
  }));
  nose.position.set(1.98, 1.42, 0);
  group.add(nose);
  return group;
}
