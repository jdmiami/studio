// Shared helpers for the textile world: palettes, deterministic random, biome map, heights.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Light pastels close to real wool dyes (see docs/materials-plan.md).
export const PALETTE = {
  felt: ['#f2c9d4', '#cfe3d4', '#d9d0f0', '#f6dcc0', '#f3e9c6', '#c9dcef', '#efe6dc'],
  flowerBed: ['#f2c9d4', '#f6dcc0', '#f7d6dc', '#f3e9c6'],
  hillFelt: ['#cfe3d4', '#d8e8d0', '#e4eedc'],
  shag: ['#f7d4e2', '#e2d8f5', '#f9e3d3', '#d7e9f2'],
  cliff: '#e3d7e6',
  knitStripes: ['#f4e8da', '#c9d9ec', '#efc3cf', '#cfe2cf'],
  velvet: ['#d98fa6', '#f0b48c', '#a98bc9', '#e7a1b8'],
  velvetStem: '#9db89c',
  wool: '#d9c3a8',
  canopy: ['#cfe1c6', '#f0cbd6', '#d8cdee', '#f6d6bf'],
  cloud: ['#fff8f2', '#fbe6ec', '#ece6f7', '#e6eef8'],
};

// Deterministic pseudo-random so screenshots are repeatable.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const pick = (random, list) => list[Math.floor(random() * list.length)];

/** Sets the per-vertex fur seed attribute. */
export function withSeed(geometry, seed) {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(count).fill(seed), 1));
  return geometry;
}

/** Stores each vertex's position relative to its Tuft center (used for felt stitches). */
export function withLocal(geometry) {
  geometry.setAttribute('aLocal', geometry.getAttribute('position').clone());
  return geometry;
}

/** A rounded cube bulged partway toward a sphere, so it reads as a pillow, not a block. */
export function puffyTuft(bulge = 0.35, size = 0.92, radius = 0.34) {
  const g = new RoundedBoxGeometry(size, size, size, 4, radius);
  if (bulge > 0) {
    const pos = g.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const sphere = v.clone().normalize().multiplyScalar(size * 0.61);
      v.lerp(sphere, bulge);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
  }
  return g;
}

// --- Island layout ---------------------------------------------------------

export const ISLAND_RADIUS = 8.6;
export const POND = { x: 4.5, z: 4.5, radius: 1.9 };
// Cells the waterfall channel runs through, from the pond out to the island edge.
const CHANNEL = new Set(['6,6', '6,5', '5,6', '7,6', '6,7']);

export const inPond = (x, z) => Math.hypot(x - POND.x, z - POND.z) < POND.radius;
export const inChannel = (x, z) => CHANNEL.has(`${x},${z}`);

/** Biome for a column: meadow, flowers, hills, or shag. */
export function biomeAt(x, z) {
  const r = Math.hypot(x, z);
  if (r < 2.5) return 'meadow';
  let a = (Math.atan2(z, x) * 180) / Math.PI;
  a += Math.sin(r * 0.9) * 14; // wobble the borders so zones interlock
  a = (a + 360) % 360;
  if (a >= 10 && a < 80) return 'flowers';
  if (a >= 80 && a < 155) return 'shag';
  if (a >= 155 && a < 275) return 'hills';
  return 'meadow';
}

/** Top Tuft height for a column (integer grid), or -1 inside the pond basin and channel. */
export function islandHeight(x, z) {
  if (inPond(x, z) || inChannel(x, z)) return -1;
  const r = Math.hypot(x, z);
  const falloff = Math.max(0, 1 - r / 9.5);
  const rolling = Math.sin(x * 0.55) * Math.cos(z * 0.5) * 0.7 + Math.sin(x * 0.21 + z * 0.37) * 0.9;
  return Math.round((rolling + 1.2) * falloff * 1.3);
}
