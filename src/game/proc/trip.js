// generateTrip: the whole pipeline from a seed to a trip's plain-JSON description.
//
//  1. biome (given, or drawn from the seed) and name
//  2. noise terrain (terrain.js): warped fBm, terraced, shaped per biome (the lake's water body)
//  3. rooms: wave function collapse over a 6x6 grid of 6x6-cell kit tiles (tiles.js, wfc.js),
//     whose deltas (paths, terraces, stairs, ponds) and props are laid over the terrain
//  4. a soft boundary of tall walls; the spawn and the return gate where the entry path meets it
//  5. repair: lift pits the player could fall into but not climb out of, and carve ramps or
//     stepping stones to stranded plateaus and islands (reach.js graphs, BFS)
//  6. props: the tiles' props, then a Poisson-disc scatter, each kept only if it blocks nothing
//  7. finds (Poisson-disc spots, rarity-weighted items, rarest on the hardest spots) and critters
//  8. validate (validate.js); on failure re-roll with a calmer terrain (bounded attempts)
//
// Each stage draws from its own labelled fork of the seed's Rng, so tuning one stage does not
// reshuffle the others. No transcendental Math (see noise.js): output is byte-identical per seed
// in every JS engine.

import { codeToSeed, createRng, seedToCode } from '../core/rng.js';
import { ITEM_BY_ID, findTable } from '../data/items.js';
import { BIOMES, WATER_TOP, baseTerrain } from './terrain.js';
import { PATH_SOCKET, PLAIN_SOCKET, TEMPLATES, TILE, VARIANTS, rotatePoint } from './tiles.js';
import { DIRS, solveWfc } from './wfc.js';
import { DX, DZ, METRICS, analyse, designReach, escapeReach, isWater } from './reach.js';
import { poissonDisc } from './poisson.js';
import { landmarkCells, makeFence, makeLandmark, round3 } from './landmarks.js';
import { createWarpedField } from './noise.js';
import { tripName } from './names.js';
import { validateTrip } from './validate.js';

export const BIOME_IDS = ['meadow', 'grotto', 'lake'];
export const LAYOUT = Object.freeze({ tiles: 6, tile: TILE, ring: 2, chunk: 16 });
const N = LAYOUT.tiles;
const RING = LAYOUT.ring;
const W = RING * 2 + N * TILE; // 40
const D = W;
const X0 = -W / 2;
const Z0 = -D / 2;
export const FIND_COUNT = [12, 18];
export const FIND_SPACING = 3;
export const CRITTER_COUNT = [3, 6];
const MAX_ATTEMPTS = 6;
const MAX_TOP = 5;
const SIDE_DIR = { N: 0, E: 1, S: 2, W: 3 };
const SIDE_YAW = { S: 0, N: round3(Math.PI), E: round3(Math.PI / 2), W: round3(-Math.PI / 2) };
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
const PATH_TILES = new Set(['path', 'path-corner', 'path-tee', 'path-cross', 'plaza']);
const TERRACE_TILES = new Set(['terrace-edge', 'terrace-outer', 'terrace-inner', 'plateau']);

/** A seed as a 32-bit integer: numbers as they are, strings as share codes (or hashed words). */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === 'string') return codeToSeed(seed);
  throw new TypeError(`generateTrip: seed must be a number or a code string, got ${seed}`);
}

/** The biome a seed makes when none is asked for. */
export function biomeForSeed(seed) {
  return createRng(normalizeSeed(seed)).fork('biome').pick(BIOME_IDS);
}

/**
 * Generate a trip.
 * @param {{ seed: number | string, biome?: 'meadow' | 'grotto' | 'lake' }} options
 * @returns the trip as plain JSON (see README.md for the schema)
 */
export function generateTrip({ seed, biome } = {}) {
  const s = normalizeSeed(seed);
  const b = biome ?? biomeForSeed(s);
  if (!BIOMES[b]) throw new RangeError(`generateTrip: unknown biome "${b}" (use ${BIOME_IDS.join(', ')})`);
  const name = tripName(createRng(s).fork(`name:${b}`), b);
  let problems = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Re-rolls calm the terrain step by step; the last is nearly flat and always plays.
    const calm = attempt < 2 ? 0 : Math.min(1, (attempt - 1) / (MAX_ATTEMPTS - 2));
    const trip = buildTrip({ seed: s, biome: b, name, attempt, calm });
    const report = validateTrip(trip);
    if (report.ok) return trip;
    problems = report.problems;
  }
  throw new Error(`generateTrip(${s}, ${b}): no valid layout in ${MAX_ATTEMPTS} attempts: ${problems.slice(0, 5).join('; ')}`);
}

const idx = (x, z) => z * W + x;
const interior = (x, z) => x >= RING && z >= RING && x < W - RING && z < D - RING;

/** One attempt of the pipeline, unvalidated (exported for tests and the preview). */
export function buildTrip({ seed, biome, name = '', attempt = 0, calm = 0 }) {
  const B = BIOMES[biome];
  const rng = createRng(seed).fork(`attempt:${attempt}`);

  // Where the player arrives: a side of the area and a tile along it (never a corner tile).
  const sr = rng.fork('spawn');
  const side = sr.pick(['S', 'N', 'E', 'W']);
  const along = sr.int(1, N - 2);
  const spawnTile = side === 'S' ? [along, N - 1] : side === 'N' ? [along, 0] : side === 'E' ? [N - 1, along] : [0, along];

  // 2. Terrain.
  const terr = baseTerrain(rng.fork('terrain'), biome, { w: W, d: D, ring: RING, calm, spawnSide: side });
  const { top, kind } = terr;
  const path = new Uint8Array(W * D);
  const reserved = new Uint8Array(W * D);
  const hot = new Uint8Array(W * D);

  // 3. Rooms by wave function collapse.
  const wfc = solveRooms(rng.fork('wfc'), biome, kind, spawnTile, side, calm);
  const lr = rng.fork('tile-props');
  const rooms = [];
  const candidates = [];
  const tileCounts = {};
  for (let tz = 0; tz < N; tz++) {
    for (let tx = 0; tx < N; tx++) {
      const v = VARIANTS[wfc.grid[tz * N + tx]];
      const t = TEMPLATES[v.template];
      tileCounts[v.name] = (tileCounts[v.name] ?? 0) + 1;
      const ox = RING + tx * TILE;
      const oz = RING + tz * TILE;
      rooms.push({ tx, tz, tile: v.name, rot: v.rot, x0: X0 + ox, z0: Z0 + oz, size: TILE });
      const pond = [];
      for (let lz = 0; lz < TILE; lz++) {
        for (let lx = 0; lx < TILE; lx++) {
          const x = ox + lx;
          const z = oz + lz;
          const i = idx(x, z);
          const c = v.grid[lz][lx];
          const wet = isWater(kind[i]);
          if (c === '#') {
            path[i] = 1;
            if (wet) {
              // A path over water becomes stepping stones (a checkerboard: each stone a hop apart).
              if ((x + z) % 2 === 0) { kind[i] = 'floor'; top[i] = 0; }
            } else kind[i] = 'floor';
          } else if (c === '^' && !wet) top[i] += 1;
          else if (c === 's' && !wet) { top[i] += 0.5; kind[i] = 'step'; }
          else if (c === '~') pond.push(i);
        }
      }
      if (pond.length) sinkPond(pond, top, kind);
      for (const p of t.props) {
        if (p.chance !== undefined && !lr.chance(p.chance)) continue;
        if (p.kind === 'fence') {
          const a = rotatePoint(p.from, v.rot);
          const b = rotatePoint(p.to, v.rot);
          candidates.push(makeFence(lr, [X0 + ox + a[0], Z0 + oz + a[1]], [X0 + ox + b[0], Z0 + oz + b[1]], { tile: v.name }));
          continue;
        }
        const [px, pz] = rotatePoint([p.x, p.z], v.rot);
        const k = p.kind === 'tree' ? lr.weighted(B.trees) : p.kind;
        const jx = lr.range(-0.1, 0.1);
        const jz = lr.range(-0.1, 0.1);
        candidates.push(makeLandmark(lr, k, X0 + ox + px + jx, Z0 + oz + pz + jz, { height: p.height ?? null, source: 'tile', tile: v.name }));
      }
      for (const h of t.hotspots ?? []) {
        const [hx, hz] = rotatePoint(h, v.rot);
        hot[idx(ox + hx, oz + hz)] = 1;
      }
    }
  }

  // Kinds and limits after the tiles: grotto canyon floors, lake shores, no column above MAX_TOP.
  for (let z = RING; z < D - RING; z++) {
    for (let x = RING; x < W - RING; x++) {
      const i = idx(x, z);
      if (isWater(kind[i])) continue;
      top[i] = Math.min(MAX_TOP, top[i]);
      if (kind[i] === 'wall' && top[i] <= B.floorBelow) kind[i] = 'floor';
      else if (kind[i] === 'floor' && !path[i] && top[i] > B.floorBelow) kind[i] = 'wall'; // a terrace raised over canyon floor
      if (biome === 'lake' && kind[i] === 'wall' && top[i] <= 0.5 && hasWaterNeighbour(kind, x, z)) kind[i] = 'floor';
    }
  }
  softenPaths(top, kind, path);

  // 4. Boundary: tall felt walls, 6 to 9 blocks, always 2+ above the ground beside them.
  const bf = createWarpedField(rng.fork('boundary'), { freq: 1 / 6, octaves: 2, warp: 0.6 });
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (interior(x, z)) continue;
      top[idx(x, z)] = 6 + Math.floor(bf(x, z) * 3.999);
      kind[idx(x, z)] = 'wall';
    }
  }
  raiseBoundary(top);

  // The arrival: the entry path's last cells flattened into a little stone landing; the gate stands
  // against the boundary wall, the spawn two cells in front of it, facing into the trip.
  const zoneCell = (depth, off) => {
    const a = RING + along * TILE + 2 + off;
    if (side === 'S') return [a, D - RING - depth];
    if (side === 'N') return [a, RING - 1 + depth];
    if (side === 'E') return [W - RING - depth, a];
    return [RING - 1 + depth, a];
  };
  const [ex, ez] = zoneCell(1, 0);
  const landing = Math.max(0, isWater(kind[idx(ex, ez)]) ? 0 : top[idx(ex, ez)]);
  for (let depth = 1; depth <= 3; depth++) {
    for (let off = 0; off <= 1; off++) {
      const [x, z] = zoneCell(depth, off);
      const i = idx(x, z);
      top[i] = landing;
      kind[i] = 'floor';
      path[i] = 1;
      reserved[i] = 1;
    }
  }
  // No props right around the landing either.
  for (let depth = 1; depth <= 4; depth++) {
    for (let off = -1; off <= 2; off++) {
      const [x, z] = zoneCell(depth, off);
      if (interior(x, z)) reserved[idx(x, z)] = 1;
    }
  }
  const [gx, gz] = zoneCell(1, 0);
  const [sx, sz] = zoneCell(3, 0);
  const gateI = idx(gx, gz);
  const spawnI = idx(sx, sz);

  // 5. Repair.
  const solid = new Uint8Array(W * D);
  const grid = { w: W, d: D, top, kind, solid };
  const repairs = repair(grid, spawnI, gateI, reserved, path);
  raiseBoundary(top); // lifted pits may now stand beside the edge

  // 6. Props: the tiles' first, then a Poisson-disc scatter; each is kept only if it covers no
  // path, landing or other prop and, if it blocks, cuts nobody off.
  const covered = new Uint8Array(W * D);
  const landmarks = [];
  let rejected = 0;
  let base = analyse(grid, spawnI, gateI);
  const tryPlace = (lm) => {
    const cells = landmarkCells(lm).cells.map(([cx, cz]) => [cx - X0, cz - Z0]);
    for (const [x, z] of cells) {
      if (!interior(x, z)) return false;
      const i = idx(x, z);
      if (path[i] || reserved[i] || covered[i] || solid[i] || isWater(kind[i])) return false;
    }
    if (lm.blocking) {
      for (const [x, z] of cells) solid[idx(x, z)] = 1;
      // Blocking only shrinks physical reach, so checking the earlier physical set against the new
      // escape set is conservative (and saves a search).
      const design = designReach(grid, [spawnI]);
      const escape = escapeReach(grid, [gateI]);
      let designCount = 0;
      let trapped = false;
      for (let i = 0; i < W * D; i++) {
        if (design[i] >= 0) designCount++;
        if (base.physical[i] >= 0 && !solid[i] && escape[i] < 0) trapped = true;
      }
      const lost = cells.filter(([x, z]) => base.design[idx(x, z)] >= 0).length;
      if (trapped || design[gateI] < 0 || designCount < base.designCount - lost) {
        for (const [x, z] of cells) solid[idx(x, z)] = 0;
        return false;
      }
      base = { ...base, design, escape, designCount };
    }
    for (const [x, z] of cells) covered[idx(x, z)] = 1;
    const [bx, bz] = [Math.round(lm.x) - X0, Math.round(lm.z) - Z0];
    landmarks.push({ ...lm, y: top[idx(bx, bz)] });
    return true;
  };
  for (const lm of candidates) if (!tryPlace(lm)) rejected++;

  const sc = rng.fork('scatter');
  const scatterPts = poissonDisc(sc, {
    w: W, d: D, r: B.scatter.r, snap: true,
    accept: (x, z) => {
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      if (!interior(cx, cz)) return false;
      const i = idx(cx, cz);
      return !path[i] && !reserved[i] && !covered[i] && !isWater(kind[i]);
    },
  });
  for (const p of scatterPts) {
    if (!sc.chance(B.scatter.chance)) continue;
    const i = idx(Math.floor(p.x), Math.floor(p.z));
    const grassy = kind[i] === 'wall';
    const k = grassy ? sc.weighted(B.scatter.kinds) : sc.pick(['stone', 'mushroom']);
    const lm = makeLandmark(sc, k, X0 + p.x - 0.5 + sc.range(-0.1, 0.1), Z0 + p.z - 0.5 + sc.range(-0.1, 0.1));
    if (!tryPlace(lm)) rejected++;
  }

  // 7. Finds and critters on design-reachable dry ground nothing covers.
  const reach = analyse(grid, spawnI, gateI);
  const eligible = (i) => reach.design[i] >= 0 && !isWater(kind[i]) && !solid[i] && !covered[i] && !reserved[i];
  const finds = placeFinds(rng.fork('finds'), biome, { top, kind, hot, reach, eligible, spawnI, landing });
  const findCells = new Set(finds.map((f) => idx(f.x - X0, f.z - Z0)));
  const critters = placeCritters(rng.fork('critters'), biome, { kind, reach, eligible, findCells, spawnI, top });

  // 8. Assemble the JSON.
  const columns = {};
  const chunkKeys = new Set();
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, z);
      columns[`${X0 + x},${Z0 + z}`] = { top: top[i], kind: kind[i] };
      chunkKeys.add(`${Math.floor((X0 + x) / LAYOUT.chunk)},${Math.floor((Z0 + z) / LAYOUT.chunk)}`);
    }
  }
  const paths = [];
  for (let i = 0; i < W * D; i++) if (path[i]) paths.push(`${X0 + (i % W)},${Z0 + Math.floor(i / W)}`);
  let walkable = 0;
  let water = 0;
  let minTop = Infinity;
  let maxTop = -Infinity;
  for (let z = RING; z < D - RING; z++) {
    for (let x = RING; x < W - RING; x++) {
      const i = idx(x, z);
      if (isWater(kind[i])) water++;
      else if (!solid[i]) walkable++;
      minTop = Math.min(minTop, top[i]);
      maxTop = Math.max(maxTop, top[i]);
    }
  }
  const sortedChunks = [...chunkKeys].map((k) => k.split(',').map(Number))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([cx, cz]) => `${cx},${cz}`);
  const yaw = SIDE_YAW[side];

  return {
    seed,
    code: seedToCode(seed),
    biome,
    name,
    size: { w: W, d: D },
    origin: { x0: X0, z0: Z0 },
    ring: RING,
    columns,
    spawn: { x: X0 + sx, z: Z0 + sz, y: top[spawnI], yaw, side },
    gate: { x: X0 + gx, z: Z0 + gz, y: top[gateI], yaw },
    finds,
    critters,
    landmarks,
    paths,
    rooms,
    chunks: { size: LAYOUT.chunk, keys: sortedChunks },
    stats: {
      attempt,
      calm: round3(calm),
      walkableCells: walkable,
      reachableCells: reach.designCount,
      physicallyReachableCells: reach.physicalCount,
      trapCells: reach.traps.length,
      waterCells: water,
      reachableFinds: finds.filter((f) => reach.design[idx(f.x - X0, f.z - Z0)] >= 0).length,
      finds: finds.length,
      critters: critters.length,
      landmarks: landmarks.length,
      rejectedLandmarks: rejected,
      wfcAttempts: wfc.attempts,
      wfcContradictions: wfc.contradictions,
      repairs,
      tiles: Object.fromEntries(Object.entries(tileCounts).sort(([a], [b]) => (a < b ? -1 : 1))),
      heights: { min: minTop, max: maxTop },
      lake: terr.lake ? { x: round3(X0 + terr.lake.x), z: round3(Z0 + terr.lake.z), radius: round3(terr.lake.radius), islands: terr.lake.islands.length } : null,
    },
  };
}

/** WFC over the tile grid with this biome's weights, border and spawn constraints. */
export function solveRooms(rng, biome, kind, spawnTile, side, calm) {
  const outDir = SIDE_DIR[side];
  const flat = calm >= 1;
  const weightsAt = (cell) => {
    const tx = cell % N;
    const tz = Math.floor(cell / N);
    const isSpawn = tx === spawnTile[0] && tz === spawnTile[1];
    // Lake tiles: how much of the tile is water already.
    let wet = 0;
    for (let lz = 0; lz < TILE; lz++) {
      for (let lx = 0; lx < TILE; lx++) if (isWater(kind[idx(RING + tx * TILE + lx, RING + tz * TILE + lz)])) wet++;
    }
    const wetFrac = wet / (TILE * TILE);
    return VARIANTS.map((v) => {
      let w = v.weights[biome] ?? 0;
      // Border: every outward socket is plain ground, except the entry path at the spawn tile.
      for (let d = 0; d < 4; d++) {
        const atBorder = (d === 0 && tz === 0) || (d === 1 && tx === N - 1) || (d === 2 && tz === N - 1) || (d === 3 && tx === 0);
        if (!atBorder) continue;
        const want = isSpawn && d === outDir ? PATH_SOCKET : PLAIN_SOCKET;
        if (v.sockets[d] !== want) w = 0;
      }
      if (wetFrac > 0.3) {
        // Mostly water: open water, paths (they turn into stepping stones) and the odd plaza island.
        if (PATH_TILES.has(v.name)) w *= v.name === 'plaza' ? 0.3 : 1.6;
        else if (v.name !== 'plain') w = 0;
      } else if (wetFrac > 0) {
        if (v.name === 'pond') w = 0;
        if (TERRACE_TILES.has(v.name)) w *= 0.3;
      }
      if (TERRACE_TILES.has(v.name)) w *= 1 - calm;
      if (flat && !PATH_TILES.has(v.name) && v.name !== 'plain') w = 0;
      return w;
    });
  };
  const result = solveWfc({
    width: N, height: N, count: VARIANTS.length,
    compatible: (d, a, b) => VARIANTS[a].sockets[d] === VARIANTS[b].sockets[(d + 2) & 3],
    weightsAt, rng, maxAttempts: 80,
  });
  if (result.grid) return result;
  // Never seen in testing; a safe fallback keeps generation total: plain ground, a straight path in.
  const plain = VARIANTS.findIndex((v) => v.name === 'plain');
  const grid = new Array(N * N).fill(plain);
  const straight = VARIANTS.findIndex((v) => v.name === 'path' && v.sockets[SIDE_DIR[side]] === PATH_SOCKET);
  grid[spawnTile[1] * N + spawnTile[0]] = straight;
  return { grid, attempts: result.attempts, contradictions: result.contradictions, fallback: true };
}

/** Keep every edge column 2+ blocks above the interior ground beside it (and within 6..9). */
function raiseBoundary(top) {
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (interior(x, z)) continue;
      let t = top[idx(x, z)];
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const nz = z + DZ[k];
        if (nx >= 0 && nz >= 0 && nx < W && nz < D && interior(nx, nz)) t = Math.max(t, top[idx(nx, nz)] + 2);
      }
      top[idx(x, z)] = Math.min(9, Math.ceil(t));
    }
  }
}

/** Sink a pond: its water a quarter block under the floor of its lowest rim cell. */
function sinkPond(cells, top, kind) {
  const inPond = new Set(cells);
  let rim = Infinity;
  for (const i of cells) {
    const x = i % W;
    const z = (i - x) / W;
    for (let k = 0; k < 4; k++) {
      const j = idx(x + DX[k], z + DZ[k]);
      if (!inPond.has(j) && !isWater(kind[j])) rim = Math.min(rim, top[j]);
    }
  }
  const level = Math.floor(rim === Infinity ? 0 : rim) + WATER_TOP;
  for (const i of cells) { top[i] = level; kind[i] = 'water'; }
}

function hasWaterNeighbour(kind, x, z) {
  for (let k = 0; k < 4; k++) if (isWater(kind[idx(x + DX[k], z + DZ[k])])) return true;
  return false;
}

/** Where a path climbs a whole block, its lower cell becomes a half step (if that hurts no one). */
function softenPaths(top, kind, path) {
  for (let z = RING; z < D - RING; z++) {
    for (let x = RING; x < W - RING; x++) {
      const i = idx(x, z);
      if (!path[i] || isWater(kind[i])) continue;
      let climbs = false;
      for (let k = 0; k < 4; k++) {
        const j = idx(x + DX[k], z + DZ[k]);
        if (path[j] && !isWater(kind[j]) && top[j] - top[i] === 1) climbs = true;
      }
      if (!climbs) continue;
      const raised = top[i] + 0.5;
      let fine = true;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const nz = z + DZ[k];
        if (!interior(nx, nz)) continue;
        if (raised - top[idx(nx, nz)] > METRICS.STEP_UP) fine = false;
      }
      if (fine) { top[i] = raised; kind[i] = 'step'; }
    }
  }
}

/**
 * Make the layout safe and open: lift every pit cell the player could reach but not climb out of
 * (so it can always walk back to the gate), then connect stranded dry regions (plateaus, islands)
 * to the reachable ground with a half-step ramp or stepping stones.
 */
function repair(grid, spawnI, gateI, reserved, path) {
  const { top, kind } = grid;
  const out = { pitsLifted: 0, ramps: 0, steppingStones: 0, rampCells: 0 };
  const givenUp = new Set();
  for (let iter = 0; iter < 160; iter++) {
    const a = analyse(grid, spawnI, gateI);
    if (a.traps.length) {
      let fixed = 0;
      for (const t of a.traps) {
        let best = Infinity;
        const x = t % W;
        const z = (t - x) / W;
        for (let k = 0; k < 4; k++) {
          if (!interior(x + DX[k], z + DZ[k])) continue; // never measure against the edge walls
          const j = idx(x + DX[k], z + DZ[k]);
          if (!grid.solid[j] && a.escape[j] >= 0) best = Math.min(best, top[j]);
        }
        if (best === Infinity || best - top[t] <= METRICS.STEP_UP) continue;
        top[t] = Math.ceil((best - METRICS.STEP_UP) * 2) / 2;
        if (isWater(kind[t])) kind[t] = 'step'; // a filled pool cell becomes a stone step
        fixed++;
      }
      out.pitsLifted += fixed;
      if (fixed) continue;
      break; // nothing adjacent to safe ground (cannot happen: spawn is safe); validation re-rolls
    }
    if (out.ramps >= 14) break;
    const comp = strandedRegion(grid, a.design, givenUp);
    if (!comp) break;
    const res = connectRegion(grid, comp, a.design, reserved, path);
    if (!res) { givenUp.add(comp[0]); continue; }
    // Keep a ramp only if it opens ground up and strands no one (it may cut across a corridor).
    const after = analyse(grid, spawnI, gateI);
    if (after.traps.length || after.designCount <= a.designCount) {
      res.undo();
      givenUp.add(comp[0]);
      continue;
    }
    out.ramps++;
    out.rampCells += res.cells;
    out.steppingStones += res.stones;
  }
  return out;
}

/** The largest dry region (4-connected, any heights) outside design reach, at least 5 cells. */
function strandedRegion(grid, design, givenUp) {
  const { kind, solid } = grid;
  const seen = new Uint8Array(W * D);
  let best = null;
  for (let z = RING; z < D - RING; z++) {
    for (let x = RING; x < W - RING; x++) {
      const s = idx(x, z);
      if (seen[s] || design[s] >= 0 || solid[s] || isWater(kind[s])) continue;
      const comp = [s];
      seen[s] = 1;
      for (let h = 0; h < comp.length; h++) {
        const c = comp[h];
        const cx = c % W;
        const cz = (c - cx) / W;
        for (let k = 0; k < 4; k++) {
          const nx = cx + DX[k];
          const nz = cz + DZ[k];
          if (!interior(nx, nz)) continue;
          const j = idx(nx, nz);
          if (seen[j] || design[j] >= 0 || solid[j] || isWater(kind[j])) continue;
          seen[j] = 1;
          comp.push(j);
        }
      }
      if (comp.length >= 5 && !givenUp.has(comp[0]) && (!best || comp.length > best.length)) best = comp;
    }
  }
  return best;
}

/**
 * Connect a stranded region: the shortest chain of cells from it to reachable ground whose height
 * difference fits half-block steps; its cells are set on a straight-line ramp (stone steps), and
 * water cells on it become stepping stones (every other one left as water where a hop crosses it).
 */
function connectRegion(grid, comp, design, reserved, path) {
  const { top, kind, solid } = grid;
  const n = W * D;
  const prev = new Int32Array(n).fill(-2);
  const src = new Int32Array(n);
  const dist = new Int32Array(n);
  const queue = [];
  for (const c of comp) { prev[c] = -1; src[c] = c; dist[c] = 0; queue.push(c); }
  let goal = -1;
  for (let h = 0; h < queue.length && goal < 0; h++) {
    const c = queue[h];
    if (dist[c] >= 14) continue;
    const cx = c % W;
    const cz = (c - cx) / W;
    for (let k = 0; k < 4 && goal < 0; k++) {
      const nx = cx + DX[k];
      const nz = cz + DZ[k];
      if (!interior(nx, nz)) continue;
      const j = idx(nx, nz);
      if (prev[j] !== -2 || solid[j]) continue;
      prev[j] = c;
      src[j] = src[c];
      dist[j] = dist[c] + 1;
      if (design[j] >= 0 && !isWater(kind[j]) && Math.abs(top[src[j]] - top[j]) <= 0.5 * dist[j]) {
        goal = j;
        continue;
      }
      if (reserved[j] || path[j]) continue; // chains never reshape the landing or the paths
      queue.push(j);
    }
  }
  if (goal < 0) return null;
  const chain = [];
  for (let c = goal; c !== -1; c = prev[c]) chain.push(c); // goal ... region cell
  chain.reverse(); // region cell (0) ... goal (k)
  const k = chain.length - 1;
  const h0 = top[chain[0]];
  const hk = top[chain[k]];
  const wasWater = chain.map((c) => isWater(kind[c]));
  const saved = chain.map((c) => [top[c], kind[c]]);
  const undo = () => chain.forEach((c, i) => { [top[c], kind[c]] = saved[i]; });
  let stones = 0;
  for (let i = 1; i < k; i++) {
    const c = chain[i];
    const g = Math.round((hk + ((h0 - hk) * (k - i)) / k) * 2) / 2;
    if (wasWater[i]) { kind[c] = 'floor'; stones++; } else if (top[c] !== g) kind[c] = 'step';
    top[c] = g;
  }
  // Stepping stones: reopen every other water cell where the chain runs straight and a hop fits.
  for (let i = 1; i < k; i += 2) {
    if (!wasWater[i]) continue;
    const a = chain[i - 1];
    const b = chain[i + 1];
    const c = chain[i];
    const straight = c - a === b - c;
    if (straight && Math.abs(top[a] - top[b]) <= METRICS.HOP_RISE && !isWater(kind[a]) && !isWater(kind[b])) {
      kind[c] = 'water';
      top[c] = WATER_TOP;
      stones--;
    }
  }
  return { cells: k - 1, stones, undo };
}

function placeFinds(rng, biome, { top, kind, hot, reach, eligible, spawnI, landing }) {
  const B = BIOMES[biome];
  const target = rng.int(FIND_COUNT[0], FIND_COUNT[1]);
  const pts = poissonDisc(rng, {
    w: W, d: D, r: FIND_SPACING, snap: true,
    accept: (x, z) => interior(Math.floor(x), Math.floor(z)) && eligible(idx(Math.floor(x), Math.floor(z))),
  });
  const sx = spawnI % W;
  const sz = (spawnI - sx) / W;
  const spots = pts.map((p) => {
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const i = idx(x, z);
    const rise = Math.max(0, Math.min(1, (top[i] - landing) / 4));
    const far = Math.min(1, reach.design[i] / 40);
    return { x, z, i, interest: 0.45 * rise + 0.35 * far + (hot[i] ? 0.6 : 0), rand: rng.float(), effort: reach.design[i] + 3 * (top[i] - landing) + (hot[i] ? 8 : 0) };
  });
  // Greedy: interesting, spread out (from each other and from the spawn), a little random.
  const chosen = [];
  const left = [...spots];
  while (chosen.length < target && left.length) {
    let bi = -1;
    let bs = -Infinity;
    for (let j = 0; j < left.length; j++) {
      const s = left[j];
      let md = (s.x - sx) * (s.x - sx) + (s.z - sz) * (s.z - sz);
      for (const c of chosen) md = Math.min(md, (s.x - c.x) * (s.x - c.x) + (s.z - c.z) * (s.z - c.z));
      const spread = Math.min(1, Math.sqrt(md) / 11);
      const score = 0.4 * s.interest + 0.4 * spread + 0.2 * s.rand;
      if (score > bs) { bs = score; bi = j; }
    }
    chosen.push(left.splice(bi, 1)[0]);
  }
  // Items by rarity weight, reweighted for the biome (its own specialities a little more often);
  // the rarest go to the hardest-won spots.
  const table = findTable(biome).map(({ item, weight }) => {
    const it = ITEM_BY_ID[item];
    const own = it.biomes.filter((b) => b !== 'hub').length === 1 ? 1.4 : 1;
    return [item, weight * (B.rarity[it.rarity] ?? 1) * own];
  });
  const items = chosen.map(() => rng.weighted(table));
  const byRarity = items.map((id, k) => ({ id, k })).sort((a, b) => RARITY_RANK[ITEM_BY_ID[b.id].rarity] - RARITY_RANK[ITEM_BY_ID[a.id].rarity] || a.k - b.k);
  const byEffort = chosen.map((s, k) => ({ s, k })).sort((a, b) => b.s.effort - a.s.effort || a.k - b.k);
  const assigned = new Array(chosen.length);
  byEffort.forEach(({ k }, r) => { assigned[k] = byRarity[r].id; });
  return chosen.map((s, k) => ({
    id: `find-${k}`,
    itemId: assigned[k],
    rarity: ITEM_BY_ID[assigned[k]].rarity,
    x: X0 + s.x,
    z: Z0 + s.z,
    y: top[s.i],
  }));
}

function placeCritters(rng, biome, { kind, reach, eligible, findCells, spawnI, top }) {
  const B = BIOMES[biome];
  const target = rng.int(CRITTER_COUNT[0], CRITTER_COUNT[1]);
  const sx = spawnI % W;
  const sz = (spawnI - sx) / W;
  const pts = poissonDisc(rng, {
    w: W, d: D, r: 5, snap: true,
    accept: (x, z) => {
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      if (!interior(cx, cz)) return false;
      const i = idx(cx, cz);
      return eligible(i) && !findCells.has(i) && (cx - sx) * (cx - sx) + (cz - sz) * (cz - sz) >= 16;
    },
  });
  const ranked = pts.map((p) => {
    const i = idx(Math.floor(p.x), Math.floor(p.z));
    return { x: Math.floor(p.x), z: Math.floor(p.z), i, score: (kind[i] === 'wall' ? 0.5 : 0) + rng.float() * 0.6 + Math.min(1, reach.design[i] / 30) * 0.2 };
  }).sort((a, b) => b.score - a.score || a.i - b.i);
  return ranked.slice(0, target).map((s, k) => {
    const ck = rng.weighted(B.critters);
    return {
      id: `critter-${k}`,
      kind: ck,
      itemId: `critter-${ck}`,
      x: X0 + s.x,
      z: Z0 + s.z,
      y: top[s.i],
      home: { x: X0 + s.x, z: Z0 + s.z },
      wander: 2.5,
    };
  });
}
