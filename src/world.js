// The showcase biome: a floating island of candy Tufts over a sea of cloud fluff.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint, sharedFurUniforms } from './fur.js';

const TUFT_PALETTE = ['#7dffcf', '#ff7ac8', '#c79bff', '#ffb38a', '#fff27a', '#79d8ff'];

// Deterministic pseudo-random so screenshots are repeatable.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function withSeed(geometry, seed) {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(count).fill(seed), 1));
  return geometry;
}

// A Tuft: a rounded cube bulged partway toward a sphere so it reads as a pillow, not a block.
function puffyTuft() {
  const g = new RoundedBoxGeometry(0.92, 0.92, 0.92, 4, 0.34);
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const sphere = v.clone().normalize().multiplyScalar(0.56);
    v.lerp(sphere, 0.35);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// The Dew pond sits in a basin at the front-right of the island.
const POND = { x: 4.5, z: 4.5, radius: 1.9 };
const inPond = (x, z) => Math.hypot(x - POND.x, z - POND.z) < POND.radius;

function islandHeight(x, z) {
  if (inPond(x, z)) return -1;
  const r = Math.hypot(x, z);
  const falloff = Math.max(0, 1 - r / 8.5);
  const bumps = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.8 + Math.sin(x * 0.23 + z * 0.41) * 1.1;
  return Math.round((bumps + 1.6) * falloff * 1.6);
}

function buildTufts(random) {
  const pieces = [];
  const tops = [];
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      if (Math.hypot(x, z) > 8.6) continue;
      const height = islandHeight(x, z);
      const colorIndex = Math.min(TUFT_PALETTE.length - 1, Math.max(0, height + Math.floor(random() * 2)));
      for (let y = -2; y <= height; y++) {
        // Only the outer shell of the island is visible, so skip buried Tufts.
        const buried = y < height && Math.hypot(x, z) < 7.5 && y > -2;
        if (buried) continue;
        const g = puffyTuft();
        g.translate(x, y, z);
        paint(g, y === height ? TUFT_PALETTE[colorIndex] : '#e08cff');
        withSeed(g, random());
        pieces.push(g);
      }
      tops.push(new THREE.Vector3(x, height + 0.5, z));
    }
  }
  const merged = mergeGeometries(pieces);
  return {
    mesh: createFur(merged, {
      shells: 36, length: 0.32, density: 34, gravity: 0.22, curl: 0.25, clump: 0.45,
      tipTint: '#fff4e6', rim: 1.1, glitter: 0.15,
    }),
    tops,
  };
}

function buildTree(position, random) {
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 14, 6);
  trunk.translate(0, 1.2, 0);
  paint(trunk, '#ffb38a');
  withSeed(trunk, random());

  const canopyColor = random() > 0.5 ? '#ff5fb8' : '#6dffc4';
  const blobs = [
    [0, 3.0, 0, 1.25],
    [0.75, 2.6, 0.3, 0.85],
    [-0.65, 2.7, -0.35, 0.9],
    [0.15, 3.7, -0.15, 0.8],
  ].map(([x, y, z, r]) => {
    const s = new THREE.SphereGeometry(r, 28, 20);
    s.translate(x, y, z);
    paint(s, canopyColor);
    return withSeed(s, random());
  });

  const group = new THREE.Group();
  group.add(createFur(trunk, { shells: 16, length: 0.08, density: 40, gravity: 0.05, curl: 0.05, clump: 0.2 }));
  group.add(createFur(mergeGeometries(blobs), {
    shells: 32, length: 0.42, density: 22, gravity: 0.35, curl: 0.35, clump: 0.55,
    tipTint: '#fff6fd', rim: 1.3, glitter: 0.3,
  }));
  group.position.copy(position);
  return group;
}

function buildFluffalo(random) {
  const parts = [];
  const add = (geometry, color) => {
    paint(geometry, color);
    parts.push(withSeed(geometry, random()));
  };
  const body = new THREE.SphereGeometry(1, 32, 24);
  body.scale(1.35, 1.0, 1.0);
  body.translate(0, 1.25, 0);
  add(body, '#fff0fa');
  const head = new THREE.SphereGeometry(0.62, 28, 20);
  head.translate(1.35, 1.5, 0);
  add(head, '#ffd9f1');
  for (const [x, z] of [[0.7, 0.5], [0.7, -0.5], [-0.7, 0.5], [-0.7, -0.5]]) {
    const leg = new THREE.CylinderGeometry(0.2, 0.22, 0.7, 12, 3);
    leg.translate(x, 0.35, z);
    add(leg, '#e7b8ff');
  }
  for (const side of [1, -1]) {
    const horn = new THREE.SphereGeometry(0.2, 16, 12);
    horn.scale(1, 1.6, 1);
    horn.translate(1.45, 2.1, side * 0.42);
    add(horn, '#fff27a');
  }

  const group = new THREE.Group();
  group.add(createFur(mergeGeometries(parts), {
    shells: 36, length: 0.34, density: 34, gravity: 0.3, curl: 0.45, clump: 0.6,
    tipTint: '#ffffff', rim: 1.4, glitter: 0.5, iridescence: 0.55,
  }));

  // Glossy button eyes and a nose: the only hard surfaces, like a real plush toy.
  const button = new THREE.MeshPhysicalMaterial({ color: '#1a0f2e', roughness: 0.15, clearcoat: 1 });
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), button);
    eye.position.set(1.88, 1.62, side * 0.26);
    group.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshPhysicalMaterial({
    color: '#ff4fa3', roughness: 0.2, clearcoat: 1,
  }));
  nose.position.set(1.98, 1.42, 0);
  group.add(nose);
  return group;
}

function buildComb(random) {
  const pieces = [];
  const spine = new RoundedBoxGeometry(1.6, 0.35, 0.18, 2, 0.08);
  spine.translate(0, 0.5, 0);
  pieces.push(spine);
  for (let i = 0; i < 9; i++) {
    const tooth = new RoundedBoxGeometry(0.1, 0.7, 0.12, 1, 0.04);
    tooth.translate(-0.7 + i * 0.175, 0, 0);
    pieces.push(tooth);
  }
  const handle = new RoundedBoxGeometry(0.28, 1.4, 0.2, 2, 0.1);
  handle.translate(0, 1.35, 0);
  pieces.push(handle);
  for (const piece of pieces) {
    paint(piece, '#ffe066');
    withSeed(piece, random());
  }
  return createFur(mergeGeometries(pieces), {
    shells: 18, length: 0.06, density: 70, gravity: 0.02, curl: 0, clump: 0.1,
    tipTint: '#fffbe0', rim: 1.6, sheen: 1.6, glitter: 1, iridescence: 0.9,
  });
}

// A sea of fluffy cloud puffs drifting below the island.
function buildCloudSea(random) {
  const puffs = [];
  const tints = ['#fff0fb', '#ffc8ee', '#f0d0ff', '#ffe2cc'];
  for (let i = 0; i < 140; i++) {
    const r = 14 + random() * 90;
    const a = random() * Math.PI * 2;
    const size = 3 + random() * 6;
    const s = new THREE.SphereGeometry(size, 20, 14);
    s.scale(1.4, 0.7, 1.2);
    s.translate(Math.cos(a) * r, -16 + random() * 4 - size * 0.2, Math.sin(a) * r);
    paint(s, tints[Math.floor(random() * tints.length)]);
    puffs.push(withSeed(s, random()));
  }
  return createFur(mergeGeometries(puffs), {
    shells: 28, length: 0.7, density: 5, gravity: 0.05, curl: 0.3, clump: 0.5,
    tipTint: '#fff6e8', rim: 1.8, sheen: 0.6,
  });
}

// Glossy candy-syrup water: rippled normals, fresnel sky reflection, and an HDR sun glint.
function buildPond() {
  const radius = POND.radius + 0.1;
  const geometry = new THREE.CircleGeometry(radius, 64);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uRadius: { value: radius },
      uTime: sharedFurUniforms.uTime,
      uSunDir: sharedFurUniforms.uSunDir,
      uSunColor: sharedFurUniforms.uSunColor,
      uDeep: { value: new THREE.Color('#06607e') },
      uShallow: { value: new THREE.Color('#46e6d4') },
      uZenith: { value: new THREE.Color('#5a3df0') },
      uHorizon: { value: new THREE.Color('#ffb0c8') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec2 vLocal;
      void main() {
        vLocal = position.xz;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform float uRadius;
      varying vec3 vWorld;
      varying vec2 vLocal;
      void main() {
        vec2 p = vLocal;
        float t = uTime;
        vec2 slope = vec2(
          cos(p.x * 4.0 + t * 1.3) * 0.5 + cos((p.x + p.y) * 7.0 - t * 1.9) * 0.3 + cos(length(p) * 9.0 - t * 2.4) * p.x,
          cos(p.y * 4.6 - t * 1.1) * 0.5 + cos((p.y - p.x) * 6.0 + t * 1.7) * 0.3 + cos(length(p) * 9.0 - t * 2.4) * p.y
        ) * 0.06;
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 r = reflect(-v, n);
        float fresnel = 0.08 + 0.92 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 skyRefl = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.6));
        float glint = pow(max(dot(r, normalize(uSunDir)), 0.0), 300.0) * 25.0;
        float radial = length(p) / uRadius;
        vec3 body = mix(uDeep, uShallow, smoothstep(0.2, 0.95, radial));
        vec3 col = mix(body, skyRefl, fresnel * 0.8) + uSunColor * glint;
        // Soft foamy shoreline that breathes with the ripples, fading into the fluff.
        float foam = smoothstep(0.78, 0.95, radial) * (0.6 + 0.4 * sin(radial * 40.0 - t * 2.0));
        col = mix(col, vec3(1.0, 0.93, 0.97), foam * 0.7);
        float alpha = 1.0 - smoothstep(0.93, 1.0, radial);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const pond = new THREE.Mesh(geometry, material);
  pond.position.set(POND.x, -0.3, POND.z);
  return pond;
}

// Floating islets far away for scale; the aerial haze tints them into the sunset.
function buildIslets(random) {
  const pieces = [];
  for (let i = 0; i < 6; i++) {
    const a = random() * Math.PI * 2;
    const r = 38 + random() * 30;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = -3 + random() * 9;
    const color = TUFT_PALETTE[Math.floor(random() * TUFT_PALETTE.length)];
    const count = 6 + Math.floor(random() * 8);
    for (let k = 0; k < count; k++) {
      const g = puffyTuft();
      const s = 1.2 + random() * 1.4;
      g.scale(s, s, s);
      g.translate(cx + (random() - 0.5) * 5, cy + (random() - 0.5) * 1.5, cz + (random() - 0.5) * 5);
      paint(g, k % 3 === 0 ? '#e08cff' : color);
      pieces.push(withSeed(g, random()));
    }
  }
  return createFur(mergeGeometries(pieces), {
    shells: 18, length: 0.45, density: 14, gravity: 0.2, curl: 0.3, clump: 0.5, tipTint: '#fff4e6',
  });
}

function dandelionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.translate(64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.25, 'rgba(255,240,250,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-64, -64, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// Dandelion seed puffs drifting on the breeze.
function buildSeeds(random, count = 70) {
  const base = [];
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    base.push({
      x: (random() - 0.5) * 30,
      y: random() * 10,
      z: (random() - 0.5) * 30,
      phase: random() * Math.PI * 2,
      speed: 0.3 + random() * 0.5,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 0.55,
    map: dandelionTexture(),
    color: new THREE.Color('#fff3fb').multiplyScalar(1.6),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.update = (time) => {
    base.forEach((s, i) => {
      // Drift downwind and wrap around so the breeze never runs dry.
      const x = ((s.x + time * s.speed + 15) % 30 + 30) % 30 - 15;
      positions[i * 3] = x;
      positions[i * 3 + 1] = s.y + Math.sin(time * 0.7 + s.phase) * 0.6;
      positions[i * 3 + 2] = s.z + Math.cos(time * 0.5 + s.phase) * 0.8;
    });
    geometry.getAttribute('position').needsUpdate = true;
  };
  return points;
}

function softDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function buildGlowMotes(random, count = 220) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = ['#fff27a', '#ff9ad5', '#9dfcff', '#ffffff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    const r = 2 + random() * 12;
    const a = random() * Math.PI * 2;
    positions.set([Math.cos(a) * r, random() * 9, Math.sin(a) * r], i * 3);
    const c = palette[Math.floor(random() * palette.length)];
    colors.set([c.r * 3, c.g * 3, c.b * 3], i * 3); // HDR so bloom picks them up
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.32,
    map: softDotTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return new THREE.Points(geometry, material);
}

export function buildWorld(scene) {
  const random = rng(20261025);
  const { mesh: tufts, tops } = buildTufts(random);
  scene.add(tufts);

  const topAt = (x, z) => tops.find((t) => t.x === x && t.z === z) ?? new THREE.Vector3(x, 0.5, z);
  // Trees sit toward the back and sides so the creature and tool stay in view.
  for (const [x, z] of [[-4, -3], [3, -5], [6, -2], [-5, 4]]) scene.add(buildTree(topAt(x, z), random));

  const fluffalo = buildFluffalo(random);
  fluffalo.scale.setScalar(1.3);
  fluffalo.position.copy(topAt(-1, 1));
  fluffalo.rotation.y = -0.5;
  scene.add(fluffalo);

  const comb = buildComb(random);
  const combBase = topAt(3, 2).clone().add(new THREE.Vector3(0, 1.2, 0));
  comb.position.copy(combBase);
  scene.add(comb);

  scene.add(buildCloudSea(random));
  scene.add(buildPond());
  scene.add(buildIslets(random));
  const seeds = buildSeeds(random);
  scene.add(seeds);
  const motes = buildGlowMotes(random);
  scene.add(motes);

  // Lights only affect the glossy button eyes; fur is lit in its own shader.
  scene.add(new THREE.HemisphereLight('#bcd4ff', '#ff9ad5', 1.2));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.5);
  sun.position.set(10, 16, 8);
  scene.add(sun);

  return {
    update(time) {
      fluffalo.position.y = topAt(-1, 1).y + Math.abs(Math.sin(time * 1.6)) * 0.08;
      comb.position.y = combBase.y + Math.sin(time * 1.2) * 0.25;
      comb.rotation.y = time * 0.8;
      motes.rotation.y = time * 0.03;
      motes.position.y = Math.sin(time * 0.4) * 0.3;
      seeds.userData.update(time);
    },
  };
}
