// A world of kit blocks from a column map (the procedural trips; the hub keeps its hand-fitted
// src/cave/level.js). Columns follow the hub's conventions: "x,z" -> { top, kind } with kind
// 'wall' (earth with a felt grass top), 'floor'/'step' (stone), 'water'/'stream'; a block (x, y, z)
// fills [x-0.5, x+0.5] x [y, y+1] x [z-0.5, z+0.5]; columns are solid from y = -2 to their top.
//
// Chunk streaming: blocks are grouped into CHUNK x CHUNK cell chunks, each its own group of
// instanced meshes (one per kit design and variant) with a bounding sphere, so the renderer culls
// whole chunks; chunks are built lazily, nearest the player first, within a per-frame time budget
// (update(position)), so entering a big area never stalls a frame. Grass blankets are built over
// the whole area at once (a blanket split at a chunk edge would hang a hem there).
import * as THREE from 'three';
import { blockParts } from '../../cave/level.js';
import { buildGrassBlankets } from '../../cave/grass.js';

export const CHUNK = 16;
const VARIANTS = 3;

/** Per-biome tints of the kit designs (instance colour multipliers). */
export const BIOME_TINTS = {
  meadow: { wall: [1.02, 0.96, 0.9], floor: [1.02, 1.0, 0.95], water: [0.95, 1.0, 1.05], grass: 1.0 },
  grotto: { wall: [1.06, 0.94, 0.94], floor: [1.04, 0.97, 1.0], water: [1.0, 0.95, 1.05], grass: 0.95 },
  lake: { wall: [1.0, 0.98, 0.94], floor: [1.0, 1.0, 1.02], water: [0.92, 1.0, 1.08], grass: 1.02 },
  hub: { wall: [1, 1, 1], floor: [1, 1, 1], water: [1, 1, 1], grass: 1 },
};

const designFor = (kind) => (kind === 'water' || kind === 'stream' ? 'water' : kind === 'floor' || kind === 'step' ? 'stone' : 'pink');
const tintKey = (kind) => (kind === 'water' || kind === 'stream' ? 'water' : kind === 'floor' || kind === 'step' ? 'floor' : 'wall');

/** A small deterministic hash in [-0.5, 0.5) for per-block tone jitter. */
function jitter(x, y, z, k) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453;
  return v - Math.floor(v) - 0.5;
}

/**
 * @param {{ columns: Record<string, {top: number, kind: string}>, biome?: string, bottom?: number, buildRadius?: number, blockRes?: number }} opts
 */
export function buildBlockWorld({ columns, biome = 'meadow', bottom = -2, buildRadius = 48, blockRes = 8, meshes = true }) {
  const group = new THREE.Group();
  group.name = 'blockworld';
  const tints = BIOME_TINTS[biome] ?? BIOME_TINTS.meadow;
  const cols = new Map(Object.entries(columns));
  const colAt = (x, z) => cols.get(`${x},${z}`);
  const topAt = (x, z) => colAt(x, z)?.top;
  // Data only (the SDF renderer draws the terrain from the columns itself).
  if (!meshes) {
    return {
      group, chunks: [], columns: cols,
      buildAll() {}, update: () => 0, progress: () => 1,
      heightAt: (x, z) => topAt(Math.round(x), Math.round(z)) ?? 99,
      kindAt: (x, z) => colAt(Math.round(x), Math.round(z))?.kind ?? null,
      stats: () => ({ chunks: 0, built: 0, blocks: 0, grassCells: 0 }),
      dispose() {},
    };
  }
  const solid = (x, y, z) => {
    const c = colAt(x, z);
    return c ? y >= bottom && y < Math.ceil(c.top) : false;
  };

  // Visible blocks, binned by chunk.
  const chunks = new Map(); // key -> { key, cx, cz, blocks: [], group, built, center }
  const grassCells = [];
  for (const [k, c] of cols) {
    const [x, z] = k.split(',').map(Number);
    const top = Math.ceil(c.top);
    for (let y = bottom; y < top; y++) {
      const exposed = !solid(x + 1, y, z) || !solid(x - 1, y, z) || !solid(x, y + 1, z) || !solid(x, y, z + 1) || !solid(x, y, z - 1);
      if (!exposed) continue;
      const kind = c.kind === 'floor' || c.kind === 'stream' || c.kind === 'step' ? (y === top - 1 ? c.kind : 'wall') : c.kind;
      const cx = Math.floor(x / CHUNK);
      const cz = Math.floor(z / CHUNK);
      const ck = `${cx},${cz}`;
      if (!chunks.has(ck)) chunks.set(ck, { key: ck, cx, cz, blocks: [], group: null, built: false });
      const depth = Math.max(0, Math.min(4, top - 1 - y));
      chunks.get(ck).blocks.push({ x, y: y + (c.top - top), z, kind, by: y, depth });
      if (kind === 'wall' && y === top - 1) grassCells.push({ x, z, y: c.top });
    }
  }
  for (const ch of chunks.values()) {
    ch.center = new THREE.Vector3((ch.cx + 0.5) * CHUNK, 0, (ch.cz + 0.5) * CHUNK);
    ch.group = new THREE.Group();
    ch.group.name = `chunk ${ch.key}`;
    group.add(ch.group);
  }

  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  function buildChunk(ch) {
    const byDesign = new Map();
    for (const b of ch.blocks) {
      const variant = Math.abs(Math.floor(jitter(b.x, b.by, b.z, 3) * 1000)) % VARIANTS;
      const id = `${designFor(b.kind)}:${variant}`;
      if (!byDesign.has(id)) byDesign.set(id, []);
      byDesign.get(id).push(b);
    }
    for (const [id, blocks] of byDesign) {
      const [design, variant] = id.split(':');
      for (const part of blockParts(design, Number(variant), blockRes)) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, blocks.length);
        blocks.forEach((b, i) => {
          m.makeTranslation(b.x, b.y, b.z);
          mesh.setMatrixAt(i, m);
          const t = tints[tintKey(b.kind)];
          const shade = (1 - b.depth * 0.06) * (1 + jitter(b.x, b.by, b.z, 1) * 0.12);
          const warm = jitter(b.x, b.by, b.z, 2) * 0.08;
          mesh.setColorAt(i, col.setRGB(shade * (1 + warm) * t[0], shade * t[1], shade * (1 - warm) * t[2]));
        });
        mesh.computeBoundingSphere();
        mesh.frustumCulled = true;
        ch.group.add(mesh);
      }
    }
    ch.built = true;
  }

  const blankets = buildGrassBlankets(grassCells, {
    heightAt: (x, z) => topAt(x, z) ?? null,
    shadeAt: () => tints.grass,
    seed: 7,
  });
  blankets.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingSphere(); o.frustumCulled = true; } });
  group.add(blankets);

  const ordered = [...chunks.values()];
  return {
    group,
    chunks: ordered,
    /** Builds every chunk now (for screenshots and small areas). */
    buildAll() { for (const ch of ordered) if (!ch.built) buildChunk(ch); },
    /**
     * Streams chunks: builds unbuilt chunks within buildRadius, nearest first, until the frame's
     * time budget (ms) is spent. Returns how many remain unbuilt.
     */
    update(position, budgetMs = 6) {
      const start = performance.now();
      const pending = ordered.filter((ch) => !ch.built && ch.center.distanceTo(new THREE.Vector3(position.x, 0, position.z)) < buildRadius)
        .sort((a, b) => a.center.distanceToSquared(position) - b.center.distanceToSquared(position));
      for (const ch of pending) {
        buildChunk(ch);
        if (performance.now() - start > budgetMs) break;
      }
      return ordered.filter((ch) => !ch.built).length;
    },
    progress: () => ordered.filter((ch) => ch.built).length / Math.max(1, ordered.length),
    /** Highest walkable surface under (x, z) (99 outside the area: a wall). */
    heightAt(x, z) { return topAt(Math.round(x), Math.round(z)) ?? 99; },
    kindAt(x, z) { return colAt(Math.round(x), Math.round(z))?.kind ?? null; },
    columns: cols,
    stats: () => ({ chunks: ordered.length, built: ordered.filter((c) => c.built).length,
      blocks: ordered.reduce((n, c) => n + c.blocks.length, 0), grassCells: grassCells.length }),
    dispose() {
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      blankets.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
}
