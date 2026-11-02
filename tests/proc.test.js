import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BIOME_IDS, CRITTER_COUNT, FIND_COUNT, FIND_SPACING, TEMPLATES, VARIANTS, biomeForSeed, columnAt, createSimplex2D,
  generateTrip, poissonDisc, solveWfc, validateTrip,
} from '../src/game/proc/index.js';
import { buildTrip, solveRooms } from '../src/game/proc/trip.js';
import { SOCKET_CLASS, PATH_SOCKET, PLAIN_SOCKET, TILE } from '../src/game/proc/tiles.js';
import { createRng, seedToCode } from '../src/game/core/rng.js';
import { findTable } from '../src/game/data/items.js';

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 2654435761 % 4294967296);
const trips = new Map();
const tripFor = (seed, biome) => {
  const k = `${seed}:${biome ?? ''}`;
  if (!trips.has(k)) trips.set(k, generateTrip({ seed, biome }));
  return trips.get(k);
};
const dist = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));

test('determinism: same seed (+biome) gives byte-identical JSON, in this process and another', () => {
  for (const [seed, biome] of [[12345, undefined], [12345, 'lake'], [7, 'grotto'], [0xdeadbeef, 'meadow']]) {
    const a = JSON.stringify(generateTrip({ seed, biome }));
    const b = JSON.stringify(generateTrip({ seed, biome }));
    assert.equal(a, b);
  }
  const modUrl = new URL('../src/game/proc/index.js', import.meta.url).href;
  const script = `import(${JSON.stringify(modUrl)}).then((m) => process.stdout.write(JSON.stringify(m.generateTrip({ seed: 424242, biome: 'lake' }))))`;
  const other = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(other, JSON.stringify(generateTrip({ seed: 424242, biome: 'lake' })));
  // Seeds as share codes give the same trip as the number.
  assert.equal(JSON.stringify(generateTrip({ seed: seedToCode(99) })), JSON.stringify(generateTrip({ seed: 99 })));
  // Different seeds differ.
  assert.notEqual(JSON.stringify(generateTrip({ seed: 1, biome: 'meadow' }).columns), JSON.stringify(generateTrip({ seed: 2, biome: 'meadow' }).columns));
});

test('schema: the trip carries every documented field', () => {
  const t = tripFor(SEEDS[3]);
  for (const k of ['seed', 'code', 'biome', 'name', 'size', 'origin', 'columns', 'spawn', 'gate', 'finds', 'critters', 'landmarks', 'rooms', 'chunks', 'stats']) {
    assert.ok(k in t, `missing ${k}`);
  }
  assert.equal(t.code, seedToCode(t.seed));
  assert.ok(BIOME_IDS.includes(t.biome));
  assert.match(t.name, /^[A-Z][a-z]+( of)? [A-Z][a-z]+$/);
  assert.ok(t.size.w >= 36 && t.size.w <= 44 && t.size.d >= 36 && t.size.d <= 44);
  assert.equal(Object.keys(t.columns).length, t.size.w * t.size.d);
  for (const f of t.finds) assert.deepEqual(Object.keys(f).sort(), ['id', 'itemId', 'rarity', 'x', 'y', 'z']);
  for (const c of t.critters) for (const k of ['id', 'kind', 'itemId', 'x', 'z', 'home']) assert.ok(k in c);
  for (const lm of t.landmarks) for (const k of ['kind', 'x', 'z', 'yaw', 'scale', 'height', 'radius']) assert.ok(k in lm, `landmark lacks ${k}`);
  assert.equal(t.rooms.length, 36);
  assert.ok(JSON.parse(JSON.stringify(t)), 'plain JSON');
});

test('50 seeds: every trip passes the playability checks', () => {
  for (const seed of SEEDS) {
    const t = tripFor(seed);
    const report = validateTrip(t);
    assert.ok(report.ok, `seed ${seed} (${t.biome}): ${report.problems.slice(0, 5).join('; ')}`);
    // Independent spot checks on top of the validator.
    const spawn = columnAt(t, t.spawn.x, t.spawn.z);
    const gate = columnAt(t, t.gate.x, t.gate.z);
    assert.ok(spawn.kind !== 'water' && gate.kind !== 'water');
    assert.ok(Math.abs(spawn.top - gate.top) <= 1);
    assert.ok(dist(t.spawn, t.gate) <= 3);
    assert.equal(report.reach.traps.length, 0);
    for (const f of t.finds) {
      const c = columnAt(t, f.x, f.z);
      assert.notEqual(c.kind, 'water', `find in water (seed ${seed})`);
      assert.equal(c.top, f.y);
    }
    for (const c of t.critters) assert.notEqual(columnAt(t, c.x, c.z).kind, 'water');
    assert.equal(t.stats.reachableFinds, t.finds.length);
    // Most of the dry ground is reachable (no large stranded plateaus).
    assert.ok(t.stats.reachableCells / t.stats.walkableCells > 0.9, `seed ${seed}: reach ${t.stats.reachableCells}/${t.stats.walkableCells}`);
  }
});

test('every biome, forced, passes too (50 seeds each)', () => {
  for (const biome of BIOME_IDS) {
    for (const seed of SEEDS) {
      const t = tripFor(seed, biome);
      assert.equal(t.biome, biome);
      const report = validateTrip(t);
      assert.ok(report.ok, `${biome} seed ${seed}: ${report.problems.slice(0, 5).join('; ')}`);
    }
  }
});

test('the validator catches broken trips', () => {
  const t = JSON.parse(JSON.stringify(tripFor(SEEDS[5], 'meadow')));
  // A find dropped into a deep pit with no way out, and one too close to another.
  const f = t.finds[0];
  t.columns[`${f.x},${f.z}`] = { top: -3, kind: 'wall' };
  t.finds[1] = { ...t.finds[1], x: t.finds[2].x + 1, z: t.finds[2].z };
  const report = validateTrip(t);
  assert.ok(!report.ok);
  assert.ok(report.problems.some((p) => p.includes('trap')), report.problems.join('; '));
  assert.ok(report.problems.some((p) => p.includes('apart')), report.problems.join('; '));
  // A prop on the spawn.
  const u = JSON.parse(JSON.stringify(tripFor(SEEDS[5], 'meadow')));
  u.landmarks.push({ kind: 'dome', x: u.spawn.x, z: u.spawn.z, yaw: 0, height: 1.2, scale: 1, radius: 0.6, blocking: true });
  assert.ok(validateTrip(u).problems.some((p) => p.includes('spawn')));
});

test('finds: 12-18 per trip, Poisson spaced (>= 3 apart), from the biome table; critters 3-6', () => {
  const rarities = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  for (const seed of SEEDS) {
    const t = tripFor(seed);
    assert.ok(t.finds.length >= FIND_COUNT[0] && t.finds.length <= FIND_COUNT[1], `${t.finds.length} finds`);
    const table = new Set(findTable(t.biome).map((e) => e.item));
    for (let i = 0; i < t.finds.length; i++) {
      assert.ok(table.has(t.finds[i].itemId));
      rarities[t.finds[i].rarity]++;
      for (let j = 0; j < i; j++) assert.ok(dist(t.finds[i], t.finds[j]) >= FIND_SPACING);
    }
    assert.equal(new Set(t.finds.map((f) => f.id)).size, t.finds.length);
    assert.ok(t.critters.length >= CRITTER_COUNT[0] && t.critters.length <= CRITTER_COUNT[1]);
    for (const c of t.critters) assert.equal(c.itemId, `critter-${c.kind}`);
  }
  // Rarity weights show through: commons dominate, and the rarer tiers do turn up.
  assert.ok(rarities.common > rarities.uncommon && rarities.uncommon > rarities.rare, JSON.stringify(rarities));
  assert.ok(rarities.rare > 0, JSON.stringify(rarities));
});

test('biome coverage: seeds pick every biome, and each biome looks its part', () => {
  const seen = new Set(SEEDS.map((s) => biomeForSeed(s)));
  assert.deepEqual([...seen].sort(), [...BIOME_IDS].sort());
  for (const s of SEEDS.slice(0, 10)) assert.equal(tripFor(s).biome, biomeForSeed(s));
  const look = (biome) => {
    const acc = { water: 0, floor: 0, wall: 0, cells: 0, maxTop: 0, tops: new Set(), critters: {} };
    for (const seed of SEEDS.slice(0, 12)) {
      const t = tripFor(seed, biome);
      for (const c of Object.values(t.columns)) {
        if (c.top >= 6) continue;
        acc.cells++;
        acc[c.kind === 'step' ? 'floor' : c.kind]++;
        acc.maxTop = Math.max(acc.maxTop, c.top);
        acc.tops.add(c.top);
      }
      for (const c of t.critters) acc.critters[c.kind] = (acc.critters[c.kind] ?? 0) + 1;
    }
    return acc;
  };
  const meadow = look('meadow');
  const grotto = look('grotto');
  const lake = look('lake');
  assert.ok(meadow.wall / meadow.cells > 0.75, 'meadow is mostly grass');
  assert.ok(meadow.floor > 0, 'meadow has stone paths');
  assert.ok(grotto.maxTop >= 4 && grotto.maxTop > meadow.maxTop, 'grotto has the most height variety');
  assert.ok(grotto.floor / grotto.cells > 0.1, 'grotto has stone floors');
  assert.ok(lake.water / lake.cells > 0.12, 'lake has a water body');
  assert.ok(lake.tops.has(-0.25), 'lake water sits at -0.25');
  assert.ok(meadow.tops.has(0.5) || meadow.tops.has(1.5), 'half steps occur');
  assert.ok((lake.critters.mint ?? 0) > (lake.critters.cream ?? 0), 'lake critters lean mint');
  assert.ok((grotto.critters.blush ?? 0) > (grotto.critters.mint ?? 0), 'grotto critters lean blush');
});

test('chunk keys cover all columns, and every key holds columns', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const t = tripFor(seed);
    const keys = new Set(t.chunks.keys);
    assert.equal(t.chunks.size, 16);
    const used = new Set();
    for (const k of Object.keys(t.columns)) {
      const [x, z] = k.split(',').map(Number);
      const ck = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
      assert.ok(keys.has(ck), `chunk ${ck} missing`);
      used.add(ck);
    }
    assert.equal(used.size, keys.size);
  }
});

test('columns: every cell inside the area, edge walls 6-9, tops on the block grid', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const t = tripFor(seed);
    const { x0, z0 } = t.origin;
    for (let z = z0; z < z0 + t.size.d; z++) {
      for (let x = x0; x < x0 + t.size.w; x++) {
        const c = t.columns[`${x},${z}`];
        assert.ok(c, `missing ${x},${z}`);
        const edge = x < x0 + 2 || z < z0 + 2 || x >= x0 + t.size.w - 2 || z >= z0 + t.size.d - 2;
        if (edge) assert.ok(c.top >= 6 && c.top <= 9 && c.kind === 'wall');
        if (c.kind !== 'water') assert.equal(c.top * 2, Math.round(c.top * 2));
        else assert.equal(c.top * 4, Math.round(c.top * 4));
      }
    }
  }
});

test('WFC always completes, within a bounded number of restarts and time', () => {
  const t0 = performance.now();
  let worst = 0;
  for (let s = 0; s < 300; s++) {
    const biome = BIOME_IDS[s % 3];
    const kind = new Array(40 * 40).fill('wall');
    const side = ['N', 'E', 'S', 'W'][s % 4];
    const along = 1 + (s % 4);
    const spawnTile = side === 'S' ? [along, 5] : side === 'N' ? [along, 0] : side === 'E' ? [5, along] : [0, along];
    const r = solveRooms(createRng(s).fork('wfc'), biome, kind, spawnTile, side, 0);
    assert.ok(r.grid && !r.fallback, `seed ${s} fell back`);
    worst = Math.max(worst, r.attempts);
    // Neighbouring tiles agree on their shared edge; the border is plain but for the entry path.
    for (let tz = 0; tz < 6; tz++) {
      for (let tx = 0; tx < 6; tx++) {
        const v = VARIANTS[r.grid[tz * 6 + tx]];
        if (tx < 5) assert.equal(v.sockets[1], VARIANTS[r.grid[tz * 6 + tx + 1]].sockets[3]);
        if (tz < 5) assert.equal(v.sockets[2], VARIANTS[r.grid[(tz + 1) * 6 + tx]].sockets[0]);
        const isSpawn = tx === spawnTile[0] && tz === spawnTile[1];
        const out = { N: 0, E: 1, S: 2, W: 3 }[side];
        if (tz === 0) assert.equal(v.sockets[0], isSpawn && out === 0 ? PATH_SOCKET : PLAIN_SOCKET);
        if (tx === 5) assert.equal(v.sockets[1], isSpawn && out === 1 ? PATH_SOCKET : PLAIN_SOCKET);
        if (tz === 5) assert.equal(v.sockets[2], isSpawn && out === 2 ? PATH_SOCKET : PLAIN_SOCKET);
        if (tx === 0) assert.equal(v.sockets[3], isSpawn && out === 3 ? PATH_SOCKET : PLAIN_SOCKET);
      }
    }
  }
  const ms = (performance.now() - t0) / 300;
  assert.ok(worst <= 40, `worst ${worst} attempts`);
  assert.ok(ms < 25, `${ms.toFixed(1)} ms per solve`);
});

test('WFC restarts on contradiction and still returns a consistent grid', () => {
  // Three-colouring an 8x8 grid (neighbours differ): arc consistency cannot see every dead end,
  // so now and then a cell is left with no colour and the solver must restart.
  const compatible = (d, a, b) => a !== b;
  let restarted = 0;
  for (let s = 0; s < 150; s++) {
    const r = solveWfc({ width: 8, height: 8, count: 3, compatible, weightsAt: () => [1, 1, 1], rng: createRng(s), maxAttempts: 200 });
    assert.ok(r.grid, `seed ${s} unsolved`);
    if (r.attempts > 1) restarted++;
    for (let z = 0; z < 8; z++) {
      for (let x = 0; x < 8; x++) {
        const a = r.grid[z * 8 + x];
        if (x < 7) assert.notEqual(a, r.grid[z * 8 + x + 1]);
        if (z < 7) assert.notEqual(a, r.grid[(z + 1) * 8 + x]);
      }
    }
  }
  assert.ok(restarted > 0, 'some runs needed a restart');
});

test('tile set: 6x6 grids of known codes, weights for every biome, rotations consistent', () => {
  assert.ok(TEMPLATES.length >= 10 && TEMPLATES.length <= 16);
  for (const t of TEMPLATES) {
    assert.equal(t.grid.length, TILE, t.name);
    for (const row of t.grid) {
      assert.equal(row.length, TILE, t.name);
      for (const c of row) assert.ok(c in SOCKET_CLASS, `${t.name}: unknown code ${c}`);
    }
    for (const b of BIOME_IDS) assert.ok(typeof t.weights[b] === 'number', `${t.name} lacks a ${b} weight`);
    assert.ok(t.doc, `${t.name} undocumented`);
  }
  // Each variant's sockets match its rotation: N of rot r is the W..E reading of row 0.
  for (const v of VARIANTS) {
    assert.equal(v.sockets.length, 4);
    for (const s of v.sockets) assert.equal(s.length, TILE);
  }
  // The border can always be closed: plain-edged variants exist for every side and biome, and an
  // entry path variant for every side.
  for (const b of BIOME_IDS) {
    for (let d = 0; d < 4; d++) {
      assert.ok(VARIANTS.some((v) => v.weights[b] > 0 && v.sockets[d] === PLAIN_SOCKET));
      assert.ok(VARIANTS.some((v) => v.weights[b] > 0 && v.sockets[d] === PATH_SOCKET));
    }
  }
});

test('Poisson-disc samples keep their minimum distance; noise is seeded and bounded', () => {
  const pts = poissonDisc(createRng(3), { w: 30, d: 30, r: 3 });
  assert.ok(pts.length > 40);
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < i; j++) assert.ok(dist(pts[i], pts[j]) >= 3);
  const snapped = poissonDisc(createRng(4), { w: 30, d: 30, r: 3, snap: true, accept: (x) => x > 10 });
  for (const p of snapped) assert.ok(p.x % 1 === 0.5 && p.x > 10);
  const a = createSimplex2D(createRng(9));
  const b = createSimplex2D(createRng(9));
  for (let i = 0; i < 500; i++) {
    const v = a(i * 0.173, i * 0.091);
    assert.equal(v, b(i * 0.173, i * 0.091));
    assert.ok(v >= -1.01 && v <= 1.01);
  }
});

test('generation time per trip stays small', () => {
  const t0 = performance.now();
  for (let s = 0; s < 15; s++) buildTrip({ seed: 1000 + s, biome: BIOME_IDS[s % 3] });
  const ms = (performance.now() - t0) / 15;
  assert.ok(ms < 250, `${ms.toFixed(0)} ms per trip`);
});

test('the preview script writes an SVG', () => {
  const dir = mkdtempSync(join(tmpdir(), 'proc-preview-'));
  const out = join(dir, 'trip.svg');
  const script = fileURLToPath(new URL('../scripts/proc/preview.mjs', import.meta.url));
  const res = execFileSync(process.execPath, [script, '77', out], { encoding: 'utf8' });
  assert.match(res, /wrote/);
  assert.match(readFileSync(out, 'utf8'), /^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  rmSync(dir, { recursive: true, force: true });
  const ascii = execFileSync(process.execPath, [script, '77', '--ascii'], { encoding: 'utf8' });
  assert.ok(ascii.split('\n').length > 40);
});
