// Reachability over the cell grid, from the player's own metrics (src/fp/controls.js: STEP_HEIGHT
// 0.55 walk-up, jump 6.8 under gravity 20 -> apex 1.156, radius 0.28). Moves are 4-neighbour steps
// between cell centres (a 0.28 radius fits inside a cell, so a centred player never straddles a
// diagonal).
//
// Three graphs:
//  design   - where content may go: dry ground only, up <= 1.0 (an easy jump), down <= 3, plus a
//             running hop over one water cell onto a stone no more than half a block higher.
//  physical - everywhere the player could possibly get: up <= 1.7 (walk-up + jump apex), any drop,
//             water too (the hub's water is wadeable: heightAt returns its surface).
//  escape   - cells from which the gate can be walked back to: up <= 1.0, any drop, water too.
// A trip is safe when physical(spawn) is inside escape(gate): no fall strands the player.

export const PLAYER = { STEP_HEIGHT: 0.55, JUMP: 6.8, GRAVITY: 20, RADIUS: 0.28 };
const APEX = (PLAYER.JUMP * PLAYER.JUMP) / (2 * PLAYER.GRAVITY);
export const METRICS = {
  STEP_UP: 1.0, // design: highest rise between neighbours
  MAX_DROP: 3.0, // design: deepest step down
  PHYS_UP: Math.ceil((PLAYER.STEP_HEIGHT + APEX) * 10) / 10, // 1.8: the most a perfect jump can climb
  HOP_RISE: 0.5, // design: a hop over one water cell may land this much higher
};

const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];

/**
 * @typedef {{ w: number, d: number, top: Float64Array, kind: string[], solid: Uint8Array }} Grid
 * solid[i] = 1: cannot be entered at all (blocking props, outside the area).
 */

const isWater = (k) => k === 'water' || k === 'stream';

// One breadth-first search for all three graphs (inlined neighbour loops: this runs a few hundred
// times per trip). mode 0 = design, 1 = physical, 2 = escape (reverse edges).
function search(grid, starts, mode) {
  const { w, d, top, kind, solid } = grid;
  const n = w * d;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const s of starts) {
    if (s < 0 || s >= n || dist[s] >= 0 || solid[s]) continue;
    if (mode === 0 && isWater(kind[s])) continue;
    dist[s] = 0;
    queue[tail++] = s;
  }
  while (head < tail) {
    const c = queue[head++];
    const x = c % w;
    const z = (c - x) / w;
    const dc = dist[c] + 1;
    const tc = top[c];
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const nz = z + DZ[k];
      if (nx < 0 || nz < 0 || nx >= w || nz >= d) continue;
      const nb = nz * w + nx;
      if (solid[nb]) continue;
      if (mode === 1) {
        if (dist[nb] < 0 && top[nb] - tc <= METRICS.PHYS_UP) { dist[nb] = dc; queue[tail++] = nb; }
      } else if (mode === 2) {
        // Reverse: nb may step to c if c is at most STEP_UP above it (any drop is fine).
        if (dist[nb] < 0 && tc - top[nb] <= METRICS.STEP_UP) { dist[nb] = dc; queue[tail++] = nb; }
      } else if (!isWater(kind[nb])) {
        const rise = top[nb] - tc;
        if (dist[nb] < 0 && rise <= METRICS.STEP_UP && -rise <= METRICS.MAX_DROP) { dist[nb] = dc; queue[tail++] = nb; }
      } else {
        // A hop over one water cell onto dry ground no more than HOP_RISE higher.
        const fx = nx + DX[k];
        const fz = nz + DZ[k];
        if (fx < 0 || fz < 0 || fx >= w || fz >= d) continue;
        const far = fz * w + fx;
        if (dist[far] >= 0 || solid[far] || isWater(kind[far])) continue;
        const rise = top[far] - tc;
        if (rise <= METRICS.HOP_RISE && -rise <= METRICS.MAX_DROP && top[nb] < Math.min(tc, top[far])) {
          dist[far] = dc;
          queue[tail++] = far;
        }
      }
    }
  }
  return dist;
}

/** Design reach from `starts`: BFS distances in moves (-1 = unreachable). */
export const designReach = (grid, starts) => search(grid, starts, 0);
/** Physical reach from `starts` (generous: everything a player might manage). */
export const physicalReach = (grid, starts) => search(grid, starts, 1);
/** Cells that can walk back to `targets` (reverse search: a may step to b if b - a <= STEP_UP). */
export const escapeReach = (grid, targets) => search(grid, targets, 2);

/** Everything the validator and the generator need to know about a layout. */
export function analyse(grid, spawn, gate) {
  const design = designReach(grid, [spawn]);
  const physical = physicalReach(grid, [spawn]);
  const escape = escapeReach(grid, [gate]);
  const traps = [];
  let designCount = 0;
  let physicalCount = 0;
  for (let i = 0; i < design.length; i++) {
    if (design[i] >= 0) designCount++;
    if (physical[i] >= 0) {
      physicalCount++;
      if (escape[i] < 0) traps.push(i);
    }
  }
  return { design, physical, escape, traps, designCount, physicalCount };
}

export { isWater, DX, DZ };
