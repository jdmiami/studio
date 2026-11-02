// Playability checks on a finished trip, from its JSON alone (the generator runs them before it
// returns a trip, and re-rolls on failure; tests run them on many seeds).

import { findTable } from '../data/items.js';
import { analyse, isWater } from './reach.js';
import { LANDMARK_KINDS, landmarkCells } from './landmarks.js';

const KINDS = new Set(['wall', 'floor', 'step', 'water', 'stream']);
const CRITTER_KINDS = new Set(['cream', 'mint', 'blush']);

/**
 * @returns {{ ok: boolean, problems: string[], reach: object | null }}
 */
export function validateTrip(trip, { findCount = [12, 18], findSpacing = 3, critterCount = [3, 6] } = {}) {
  const problems = [];
  const { w, d } = trip.size;
  const { x0, z0 } = trip.origin;
  const ring = trip.ring ?? 2;
  const n = w * d;
  const top = new Float64Array(n);
  const kind = new Array(n);
  const solid = new Uint8Array(n);
  const local = (x, z) => {
    const lx = x - x0;
    const lz = z - z0;
    return lx < 0 || lz < 0 || lx >= w || lz >= d ? -1 : lz * w + lx;
  };
  const inInterior = (x, z) => {
    const lx = x - x0;
    const lz = z - z0;
    return lx >= ring && lz >= ring && lx < w - ring && lz < d - ring;
  };

  // Columns: every cell present, sane tops and kinds; the edge a tall wall.
  let count = 0;
  for (let lz = 0; lz < d; lz++) {
    for (let lx = 0; lx < w; lx++) {
      const c = trip.columns[`${x0 + lx},${z0 + lz}`];
      if (!c) { problems.push(`missing column ${x0 + lx},${z0 + lz}`); continue; }
      count++;
      const i = lz * w + lx;
      top[i] = c.top;
      kind[i] = c.kind;
      if (!KINDS.has(c.kind)) problems.push(`bad kind ${c.kind} at ${x0 + lx},${z0 + lz}`);
      if (!Number.isFinite(c.top) || (Math.round(c.top * 4) !== c.top * 4)) problems.push(`bad top ${c.top} at ${x0 + lx},${z0 + lz}`);
      if (!isWater(c.kind) && c.top * 2 !== Math.round(c.top * 2)) problems.push(`dry top not on the half grid at ${x0 + lx},${z0 + lz}`);
      const edge = lx < ring || lz < ring || lx >= w - ring || lz >= d - ring;
      if (edge && (c.top < 6 || c.top > 9)) problems.push(`edge column ${x0 + lx},${z0 + lz} top ${c.top} not in 6..9`);
    }
  }
  if (count !== Object.keys(trip.columns).length) problems.push('columns outside the area');
  // The edge stays out of reach: 2+ blocks above any interior neighbour.
  for (let lz = 0; lz < d; lz++) {
    for (let lx = 0; lx < w; lx++) {
      const edge = lx < ring || lz < ring || lx >= w - ring || lz >= d - ring;
      if (edge) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ex = lx + dx;
        const ez = lz + dz;
        const isEdge = ex < ring || ez < ring || ex >= w - ring || ez >= d - ring;
        if (isEdge && top[ez * w + ex] - top[lz * w + lx] < 2) problems.push(`edge too low beside ${x0 + lx},${z0 + lz}`);
      }
    }
  }

  // Props: valid kinds, inside, on dry ground; blocking ones make their cells solid.
  const covered = new Map(); // local index -> landmark index
  const pathSet = new Set(trip.paths ?? []);
  trip.landmarks.forEach((lm, li) => {
    if (!LANDMARK_KINDS[lm.kind]) problems.push(`landmark ${li}: unknown kind ${lm.kind}`);
    if (!(lm.height > 0) || !(lm.scale > 0)) problems.push(`landmark ${li}: no size`);
    const { cells, blocks } = landmarkCells(lm);
    for (const [cx, cz] of cells) {
      const i = local(cx, cz);
      if (i < 0 || !inInterior(cx, cz)) { problems.push(`landmark ${li} (${lm.kind}) outside the interior`); continue; }
      if (isWater(kind[i])) problems.push(`landmark ${li} (${lm.kind}) in water at ${cx},${cz}`);
      if (pathSet.has(`${cx},${cz}`)) problems.push(`landmark ${li} (${lm.kind}) on a path cell ${cx},${cz}`);
      if (covered.has(i)) problems.push(`landmarks ${covered.get(i)} and ${li} overlap at ${cx},${cz}`);
      covered.set(i, li);
      if (blocks) solid[i] = 1;
    }
  });

  const grid = { w, d, top, kind, solid };
  const at = (p, what) => {
    const i = local(p.x, p.z);
    if (i < 0 || !inInterior(p.x, p.z)) { problems.push(`${what} outside the interior`); return -1; }
    if (isWater(kind[i])) problems.push(`${what} in water at ${p.x},${p.z}`);
    if (solid[i]) problems.push(`${what} inside a blocking prop at ${p.x},${p.z}`);
    if (covered.has(i)) problems.push(`${what} covered by landmark ${covered.get(i)} at ${p.x},${p.z}`);
    return i;
  };
  const spawnI = at(trip.spawn, 'spawn');
  const gateI = at(trip.gate, 'gate');
  if (spawnI < 0 || gateI < 0) return { ok: false, problems, reach: null };
  const gap = Math.abs(trip.spawn.x - trip.gate.x) + Math.abs(trip.spawn.z - trip.gate.z);
  if (gap === 0 || gap > 4) problems.push(`gate ${gap} cells from the spawn`);

  const reach = analyse(grid, spawnI, gateI);
  if (reach.design[gateI] < 0) problems.push('gate not reachable from the spawn');
  if (reach.traps.length) problems.push(`${reach.traps.length} trap cells (reachable, no way back to the gate)`);

  // Finds: count, spacing, items from this biome's table, every one reachable.
  const table = new Set(findTable(trip.biome).map((e) => e.item));
  if (trip.finds.length < findCount[0] || trip.finds.length > findCount[1]) problems.push(`${trip.finds.length} finds`);
  trip.finds.forEach((f, k) => {
    const i = at(f, `find ${f.id}`);
    if (i >= 0 && reach.design[i] < 0) problems.push(`find ${f.id} unreachable at ${f.x},${f.z}`);
    if (!table.has(f.itemId)) problems.push(`find ${f.id}: ${f.itemId} not a ${trip.biome} find`);
    for (let j = 0; j < k; j++) {
      const g = trip.finds[j];
      const dd = Math.sqrt((f.x - g.x) * (f.x - g.x) + (f.z - g.z) * (f.z - g.z));
      if (dd < findSpacing) problems.push(`finds ${g.id} and ${f.id} only ${dd.toFixed(2)} apart`);
    }
  });

  // Critters: count, kinds, on reachable ground, home where they stand.
  if (trip.critters.length < critterCount[0] || trip.critters.length > critterCount[1]) problems.push(`${trip.critters.length} critters`);
  for (const c of trip.critters) {
    const i = at(c, `critter ${c.id}`);
    if (i >= 0 && reach.design[i] < 0) problems.push(`critter ${c.id} unreachable`);
    if (!CRITTER_KINDS.has(c.kind) || c.itemId !== `critter-${c.kind}`) problems.push(`critter ${c.id}: bad kind ${c.kind}/${c.itemId}`);
    if (!c.home || at(c.home, `critter ${c.id} home`) < 0) problems.push(`critter ${c.id}: no home`);
  }

  // Chunks cover every column.
  const keys = new Set(trip.chunks.keys);
  for (const k of Object.keys(trip.columns)) {
    const [x, z] = k.split(',').map(Number);
    const ck = `${Math.floor(x / trip.chunks.size)},${Math.floor(z / trip.chunks.size)}`;
    if (!keys.has(ck)) { problems.push(`chunk ${ck} missing`); break; }
  }

  return { ok: problems.length === 0, problems, reach };
}
