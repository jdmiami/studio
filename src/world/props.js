// Smaller pieces: the floating Comb, distant felt islets, dandelion seeds, and glow motes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint } from '../fur.js';
import { createTextile } from '../textile.js';
import { PALETTE, pick, puffyTuft, withLocal, withSeed } from './util.js';

export function buildComb(random) {
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
    paint(piece, '#c9a24a');
    withSeed(piece, random());
  }
  return createFur(mergeGeometries(pieces), {
    shells: 18, length: 0.06, density: 70, gravity: 0.02, curl: 0, clump: 0.1,
    tipTint: '#f2dd9c', rim: 1.2, sheen: 1.4, glitter: 0.3, iridescence: 0,
  });
}

// Distant felt islets for scale; the aerial haze tints them into the sunset.
export function buildIslets(random) {
  const pieces = [];
  for (let i = 0; i < 6; i++) {
    const a = random() * Math.PI * 2;
    const r = 38 + random() * 30;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = -3 + random() * 9;
    const color = pick(random, PALETTE.felt);
    const count = 6 + Math.floor(random() * 8);
    for (let k = 0; k < count; k++) {
      const g = withLocal(puffyTuft(0.12, 0.96, 0.16));
      const s = 1.2 + random() * 1.4;
      g.scale(s, s, s);
      g.translate(cx + (random() - 0.5) * 5, cy + (random() - 0.5) * 1.5, cz + (random() - 0.5) * 5);
      paint(g, k % 3 === 0 ? PALETTE.cliff : color);
      pieces.push(withSeed(g, random()));
    }
  }
  return new THREE.Mesh(mergeGeometries(pieces), createTextile('felt', { fuzz: 0.4 }));
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
export function buildSeeds(random, count = 60) {
  const base = Array.from({ length: count }, () => ({
    x: (random() - 0.5) * 30,
    y: random() * 10,
    z: (random() - 0.5) * 30,
    phase: random() * Math.PI * 2,
    speed: 0.3 + random() * 0.5,
  }));
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.5,
    map: dandelionTexture(),
    color: new THREE.Color('#ffffff').multiplyScalar(1.3),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  points.frustumCulled = false;
  points.userData.update = (time) => {
    base.forEach((s, i) => {
      // Drift downwind and wrap around so the breeze never runs dry.
      positions[i * 3] = ((s.x + time * s.speed + 15) % 30 + 30) % 30 - 15;
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

// Glowing lint motes: a soft, sparse shimmer in the air.
export function buildGlowMotes(random, count = 120) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = ['#fff4d6', '#ffe3ee', '#e6f2ff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    const r = 2 + random() * 12;
    const a = random() * Math.PI * 2;
    positions.set([Math.cos(a) * r, random() * 9, Math.sin(a) * r], i * 3);
    const c = palette[Math.floor(random() * palette.length)];
    colors.set([c.r * 1.8, c.g * 1.8, c.b * 1.8], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.22,
    map: softDotTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
}
