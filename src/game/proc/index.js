// Procedural trips: small open-air felt landscapes visited through the hub's great door.
// Pure data (no three.js), deterministic per seed, runs in Node and the browser. See README.md.

export { generateTrip, biomeForSeed, normalizeSeed, BIOME_IDS, LAYOUT, FIND_COUNT, FIND_SPACING, CRITTER_COUNT } from './trip.js';
export { validateTrip } from './validate.js';
export { BIOMES, WATER_TOP, terrace } from './terrain.js';
export { TEMPLATES, VARIANTS, TILE, socketsOf } from './tiles.js';
export { LANDMARK_KINDS, landmarkCells } from './landmarks.js';
export { METRICS, PLAYER, analyse } from './reach.js';
export { solveWfc } from './wfc.js';
export { poissonDisc } from './poisson.js';
export { createSimplex2D, createWarpedField, fbm } from './noise.js';

/** The column under world point (x, z) of a trip, or null outside it (cells are centred on integers). */
export function columnAt(trip, x, z) {
  return trip.columns[`${Math.round(x)},${Math.round(z)}`] ?? null;
}

/** The walkable height at world (x, z), like the hub's heightAt: very tall outside the trip. */
export function heightAt(trip, x, z) {
  return columnAt(trip, x, z)?.top ?? 99;
}
