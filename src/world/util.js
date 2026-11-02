// Shared helpers for the textile world: palettes, deterministic random, biome map, heights.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Real-world colors in textile form: grass-green felt, earth-brown cliffs, green knit and
// shag, brown wool trunks, true flower colors, white clouds (see docs/materials-plan.md).
export const PALETTE = {
  felt: ['#7fb85a', '#8cc063', '#76b052', '#93c56a', '#86bb5d'],
  flowerBed: ['#86bd5e', '#7bb455', '#8fc265'],
  hillFelt: ['#74ad4f', '#7fb758'],
  shag: ['#79b04e', '#8fc25e', '#6fa646', '#9ccb6b'],
  cliff: '#9a7652',
  knitStripes: ['#6fa84a', '#86bc5e', '#5f9a40', '#97c96d'],
  velvet: ['#d64545', '#f2c230', '#8a5cc2', '#e86fa0', '#f58a3c'],
  velvetStem: '#4f8a3a',
  wool: '#8a6644',
  canopy: ['#5f9e3f', '#73ad4a', '#56963a', '#82b852'],
  cloud: ['#ffffff', '#f6f9fc', '#f1f5fa'],
  rock: ['#9e9c97', '#aaa69e', '#918f8b'],
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

/**
 * A rounded cube bulged partway toward a sphere, so it reads as a pillow, not a block.
 * Keep `segments` low: every Tuft in the world is one of these, and segments 4 costs
 * about 2,500 vertices each.
 */
export function puffyTuft(bulge = 0.35, size = 0.92, radius = 0.34, segments = 2) {
  const g = new RoundedBoxGeometry(size, size, size, segments, radius);
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
