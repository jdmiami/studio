// Props for "The Great Cave Door": the mosaic door, cube tree, willows, broom tree, knitted
// shrub, fence, mushrooms, pastel stones, the fluffy dog and critters, scaffold, light shafts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint, sharedFurUniforms } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { buildTasselTrees } from '../world/trees.js';
import { buildKnitHills } from '../world/hills.js';
import { pick, puffyTuft, withSeed } from '../world/util.js';
import { DOOR } from './level.js';

const painted = (geometry, color) => prepareTextileGeometry(paint(geometry, color));

// The great door: two leaves of rounded mosaic panels in grey, tan and dusty pink.
export function buildDoor(random) {
  const panels = [];
  const width = DOOR.xMax - DOOR.xMin + 1; // 5
  const leafWidth = width / 2;
  const colors = ['#9c9a98', '#8f8b88', '#b5aea6', '#c79e8a', '#a8a29b', '#bdb4ab'];
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? DOOR.xMin - 0.5 : 0;
    let y = 0.05;
    while (y < DOOR.height - 0.2) {
      const h = Math.min(0.45 + random() * 0.45, DOOR.height - 0.05 - y);
      let x = 0.06;
      while (x < leafWidth - 0.1) {
        const w = Math.min(0.35 + random() * 0.6, leafWidth - 0.06 - x);
        const g = new RoundedBoxGeometry(w - 0.06, h - 0.06, 0.28 + random() * 0.08, 2, 0.04);
        g.translate(x0 + x + w / 2, y + h / 2, 0);
        panels.push(painted(g, pick(random, colors)));
        x += w;
      }
      y += h;
    }
  }
  const backing = new RoundedBoxGeometry(width - 0.05, DOOR.height - 0.05, 0.2, 2, 0.04);
  backing.translate(0, DOOR.height / 2, -0.15);
  panels.push(painted(backing, '#6f6a66'));
  const mesh = new THREE.Mesh(mergeGeometries(panels), createTextile('felt', { fuzz: 0.25 }));
  mesh.position.set(0, 0, DOOR.z + 0.25);
  return mesh;
}

// Cube tree: a felt trunk carrying a canopy of fuzzy sage cubes.
export function buildCubeTree(base, random) {
  const group = new THREE.Group();
  const trunk = painted(new RoundedBoxGeometry(0.5, 1.9, 0.5, 2, 0.08), '#a07a5c');
  trunk.translate(0, 0.95, 0);
  group.add(new THREE.Mesh(trunk, createTextile('felt', { fuzz: 0.3 })));
  const cubes = [];
  const spots = [
    [0, 2.3, 0], [0.75, 2.2, 0.2], [-0.7, 2.25, -0.1], [0.1, 2.25, 0.75], [-0.1, 2.3, -0.75],
    [0.45, 2.95, 0.3], [-0.4, 2.95, -0.3], [0.35, 2.9, -0.45], [-0.35, 2.9, 0.4], [0, 3.55, 0],
  ];
  for (const [x, y, z] of spots) {
    const g = puffyTuft(0.18, 0.86, 0.2, 2);
    g.rotateY(random() * 0.6);
    g.translate(x, y, z);
    paint(g, pick(random, ['#b7c4ad', '#aebba3', '#c2cdb8']));
    cubes.push(withSeed(g, random()));
  }
  group.add(createFur(mergeGeometries(cubes), {
    shells: 22, length: 0.06, density: 140, gravity: 0.02, curl: 0.1, clump: 0.2, tipTint: '#eef2e8', rim: 0.9,
  }));
  group.position.copy(base);
  return group;
}

// Broom tree: a wooden handle crowned with a flared bundle of tan bristles.
export function buildBroomTree(base, random) {
  const group = new THREE.Group();
  const handle = painted(new THREE.CylinderGeometry(0.09, 0.11, 2.6, 12, 8), '#9a6f4c');
  handle.translate(0, 1.3, 0);
  group.add(new THREE.Mesh(handle, createTextile('yarn', { wraps: 24, fuzz: 0.2 })));
  const band = painted(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 24, 2), '#7d5a3e');
  band.translate(0, 2.45, 0);
  group.add(new THREE.Mesh(band, createTextile('yarn', { wraps: 10 })));
  const bristles = new THREE.CylinderGeometry(0.75, 0.4, 1.3, 32, 10);
  bristles.translate(0, 3.15, 0);
  paint(bristles, '#c9a77c');
  withSeed(bristles, random());
  group.add(createFur(bristles, {
    shells: 26, length: 0.22, density: 30, gravity: 0.5, curl: 0.05, clump: 0.2, tipTint: '#e8d2ad', rim: 0.6,
  }));
  group.position.copy(base);
  return group;
}

// Low fence: rounded pink posts and two rails.
export function buildFence(from, to, y) {
  const parts = [];
  const length = Math.abs(to - from);
  const posts = Math.round(length / 0.9) + 1;
  for (let i = 0; i < posts; i++) {
    const z = from + ((to - from) * i) / (posts - 1);
    const post = new RoundedBoxGeometry(0.16, 0.7, 0.16, 2, 0.05);
    post.translate(0, y + 0.35, z);
    parts.push(painted(post, '#e7b8c0'));
  }
  for (const h of [0.28, 0.55]) {
    const rail = new RoundedBoxGeometry(0.1, 0.12, length, 2, 0.04);
    rail.translate(0, y + h, (from + to) / 2);
    parts.push(painted(rail, '#efc6cc'));
  }
  return new THREE.Mesh(mergeGeometries(parts), createTextile('felt', { fuzz: 0.35 }));
}

// Pink-capped mushrooms with felt stems and white spots.
export function buildMushrooms(spots, random) {
  const caps = [];
  const felt = [];
  for (const s of spots) {
    const r = 0.16 + random() * 0.12;
    const stemH = 0.16 + random() * 0.14;
    const stem = new THREE.CylinderGeometry(r * 0.32, r * 0.4, stemH, 10, 2);
    stem.translate(s.x, s.y + stemH / 2, s.z);
    felt.push(painted(stem, '#f3ece0'));
    const cap = new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.62, 1);
    cap.translate(s.x, s.y + stemH - 0.01, s.z);
    caps.push(painted(cap, pick(random, ['#e6a3a3', '#df9a96', '#eab0a8'])));
    for (let i = 0; i < 4; i++) {
      const a = random() * Math.PI * 2;
      const rr = random() * r * 0.6;
      const dot = new THREE.SphereGeometry(r * 0.13, 8, 6);
      dot.scale(1, 0.35, 1);
      const lift = Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)) * r * 0.62;
      dot.translate(s.x + Math.cos(a) * rr, s.y + stemH + lift, s.z + Math.sin(a) * rr);
      felt.push(painted(dot, '#fff8f2'));
    }
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeGeometries(caps), createTextile('velvet', { sheen: '#fff0ec', side: THREE.DoubleSide })));
  group.add(new THREE.Mesh(mergeGeometries(felt), createTextile('felt', { fuzz: 0.4 })));
  return group;
}

// Small pastel stone cubes scattered on the floor and terraces.
export function buildStones(spots, random) {
  const parts = spots.map((s) => {
    const size = 0.22 + random() * 0.2;
    const g = puffyTuft(0.15, size, size * 0.3, 2);
    g.rotateY(random() * Math.PI);
    g.translate(s.x, s.y + size / 2, s.z);
    return painted(g, pick(random, ['#cbbbe0', '#b9dccf', '#d9c9e6', '#c4e0d4']));
  });
  return new THREE.Mesh(mergeGeometries(parts), createTextile('felt', { fuzz: 0.4 }));
}

// The fluffy dog: a pomeranian-like puff with pointed ears and a curled tail.
export function buildFluffDog(random) {
  const parts = [];
  const add = (g, color = '#fbf8f3') => parts.push(withSeed(paint(g, color), random()));
  const body = new THREE.SphereGeometry(0.42, 28, 20);
  body.scale(1.25, 1, 1);
  body.translate(0, 0.55, 0);
  add(body);
  const chest = new THREE.SphereGeometry(0.36, 24, 18);
  chest.translate(0.32, 0.62, 0);
  add(chest);
  const head = new THREE.SphereGeometry(0.3, 24, 18);
  head.translate(0.55, 0.92, 0);
  add(head);
  for (const side of [1, -1]) {
    const ear = new THREE.ConeGeometry(0.1, 0.22, 12);
    ear.translate(0.5, 1.2, side * 0.14);
    add(ear, '#f6efe6');
  }
  for (const [x, z] of [[0.3, 0.18], [0.3, -0.18], [-0.32, 0.18], [-0.32, -0.18]]) {
    const leg = new THREE.CylinderGeometry(0.08, 0.09, 0.32, 10, 2);
    leg.translate(x, 0.16, z);
    add(leg);
  }
  const tail = new THREE.SphereGeometry(0.24, 20, 14);
  tail.translate(-0.48, 0.92, 0);
  add(tail);

  const group = new THREE.Group();
  group.add(createFur(mergeGeometries(parts), {
    shells: 34, length: 0.13, density: 150, gravity: 0.2, curl: 0.2, clump: 0.3, tipTint: '#ffffff', rim: 1.2,
  }));
  const button = new THREE.MeshPhysicalMaterial({ color: '#1d1820', roughness: 0.15, clearcoat: 1 });
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), button);
    eye.position.set(0.8, 0.98, side * 0.11);
    group.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), button);
  nose.position.set(0.86, 0.88, 0);
  group.add(nose);
  return group;
}

// Little white fluff critters with button eyes.
export function buildCritters(spots, random) {
  const parts = spots.map((s) => {
    const r = 0.13 + random() * 0.05;
    const g = new THREE.SphereGeometry(r, 18, 14);
    g.translate(s.x, s.y + r, s.z);
    return withSeed(paint(g, '#fbf8f3'), random());
  });
  const group = new THREE.Group();
  group.add(createFur(mergeGeometries(parts), {
    shells: 24, length: 0.06, density: 260, gravity: 0.1, curl: 0.15, clump: 0.25, tipTint: '#ffffff', rim: 1.2,
  }));
  const button = new THREE.MeshPhysicalMaterial({ color: '#1d1820', roughness: 0.2, clearcoat: 1 });
  for (const s of spots) {
    for (const side of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), button);
      eye.position.set(s.x + 0.06 * side, s.y + 0.2, s.z + 0.15);
      group.add(eye);
    }
  }
  return group;
}

// Wooden scaffold platform on the left, as in the reference (its NPC is not built yet).
export function buildScaffold(base) {
  const parts = [];
  for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) {
    const post = new RoundedBoxGeometry(0.12, 1.4, 0.12, 1, 0.03);
    post.translate(x, 0.7, z);
    parts.push(painted(post, '#a77d58'));
  }
  for (let i = 0; i < 5; i++) {
    const plank = new RoundedBoxGeometry(1.5, 0.08, 0.22, 1, 0.03);
    plank.translate(0, 1.42, -0.45 + i * 0.225);
    parts.push(painted(plank, i % 2 ? '#b8906a' : '#ad8460'));
  }
  const rail = new RoundedBoxGeometry(1.5, 0.08, 0.08, 1, 0.03);
  rail.translate(0, 1.95, 0.5);
  parts.push(painted(rail, '#a77d58'));
  for (const x of [-0.6, 0.6]) {
    const up = new RoundedBoxGeometry(0.08, 0.55, 0.08, 1, 0.03);
    up.translate(x, 1.7, 0.5);
    parts.push(painted(up, '#a77d58'));
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), createTextile('yarn', { wraps: 18, fuzz: 0.2 }));
  mesh.position.copy(base);
  return mesh;
}

// Soft warm light shafts falling through the ceiling openings.
export function buildLightShafts(sources) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: sharedFurUniforms.uTime, uColor: { value: new THREE.Color('#ffe2b8') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float across = sin(vUv.x * 3.14159);              // soft edges
        float along = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
        float dust = 0.85 + 0.15 * sin(vUv.y * 40.0 + uTime * 0.7 + vUv.x * 9.0);
        gl_FragColor = vec4(uColor * across * across * along * dust * 0.22, 1.0);
      }
    `,
  });
  const group = new THREE.Group();
  const dir = sharedFurUniforms.uSunDir.value.clone().normalize();
  for (const s of sources) {
    const length = s.length ?? 10;
    const plane = new THREE.PlaneGeometry(s.width ?? 2.6, length);
    plane.translate(0, -length / 2, 0); // hang from the opening
    const beam = new THREE.Mesh(plane, material);
    beam.position.set(s.x, s.y, s.z);
    // Point the beam's length along the incoming light, facing the camera's general direction.
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().negate());
    beam.rotateY(s.twist ?? 0.6);
    group.add(beam);
    // A crossed second plane so the shaft has volume from any angle.
    const cross = beam.clone();
    cross.rotateY(Math.PI / 2);
    group.add(cross);
  }
  return group;
}

// Pale sage willows, as in the reference.
export function buildWillows(positions, random) {
  return buildTasselTrees(positions, random, { canopy: ['#b5cc95', '#a9c48a', '#bfd3a0'] });
}

export function buildKnitShrub(base, random) {
  return buildKnitHills(
    [{ x: base.x, y: base.y, z: base.z, radius: 0.85, height: 0.75, stripes: ['#7fa86a', '#8fb879', '#6f9a5c', '#9cc387'] }],
    [],
    random,
  );
}
