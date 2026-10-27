// "The Great Cave Door" level: a terraced felt canyon on a 1-unit block grid, laid out to match
// docs/reference/cave-door.jpg (see docs/fp-reference-analysis.md).
//
// The per-cell layout is src/cave/layout.json: the block layout fitted to the reference frame under
// its solved camera (scripts/fp/fit_layout.py; hand corrections in docs/reference/fit-notes.md).
// The player spawns at the reference camera's pose, the room's front-right corner, looking 40
// degrees left of the door's axis (the door is at z = -16).
// A block at integer cell (x, y, z) fills [x-0.5, x+0.5] x [y, y+1] x [z-0.5, z+0.5].
import * as THREE from 'three';
import layout from './layout.json';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { build as buildKitBlock } from '../kit/families/blocks.js';
import { rng } from '../world/util.js';
import { buildGrassBlankets } from './grass.js';
import { createTextile } from '../textile.js';

export const CAVE_PALETTE = {
  wall: ['#d6b4a8', '#cfab9f', '#dcbcb1', '#c9a59a', '#d3b0a4'],
  cap: ['#94ad80', '#8ba477', '#9cb588'],
  floor: ['#d8c3bb', '#d2bbb4', '#dccac2', '#cdb9c6', '#d5c4bf'],
  water: ['#7f9fd4', '#8aa9dc', '#7596cc'],
  foam: '#c4d5ee',
  frame: ['#bdb8b1', '#c7c2ba', '#b3aea6'],
  step: ['#bfb1bd', '#b8a9b6', '#c7bac4'],
  ceiling: ['#e2c6b6', '#dbbcab', '#e8cfc0'],
};

export const DOOR = layout.door ?? { z: -16, xMin: -2, xMax: 2, height: 6 };

// The level's extent: the fitted layout's cells (every cell inside it that the layout does not
// list falls back to layoutColumn below).
const CELLS = layout.cells ?? {};
const CEILING = layout.ceiling ?? null;
const cellKeys = Object.keys(CELLS).map((k) => k.split(',').map(Number));
const X_MIN = cellKeys.length ? Math.min(...cellKeys.map(([x]) => x)) : -15;
const X_MAX = cellKeys.length ? Math.max(...cellKeys.map(([x]) => x)) : 7;
const Z_BACK = cellKeys.length ? Math.min(...cellKeys.map(([, z]) => z)) : -17;
const Z_FRONT = cellKeys.length ? Math.max(...cellKeys.map(([, z]) => z)) : 3;
export const EXTENT = { xMin: X_MIN, xMax: X_MAX, zBack: Z_BACK, zFront: Z_FRONT };

/** Column top and kind at (x, z): the fitted layout, else the procedural fallback (enclosure walls). */
function columnAt(x, z) {
  const c = CELLS[`${x},${z}`];
  if (c) return { top: c.top, kind: c.kind };
  if (cellKeys.length) return { top: 10, kind: 'wall' };
  return layoutColumn(x, z);
}

/** Ceiling slab bottom at (x, z) or null: the fitted layout's, else the procedural fallback. */
function ceilingAt(x, z) {
  if (CEILING) {
    const b = CEILING[`${x},${z}`];
    return b === undefined || b === null ? null : b;
  }
  return ceilingAtProcedural(x, z);
}

/** Left edge of the right-hand terrace at depth z (the floor narrows toward the player). */
const rightEdge = (z) => (z > -5 ? -3 : -3 + (-z - 5) * 0.6);

/** The original hand layout, kept as the fallback for cells the fitted layout does not list. */
function layoutColumn(x, z) {
  // Back wall with the door opening; enclosure walls everywhere else.
  if (z <= DOOR.z) return { top: 10, kind: 'wall' };
  // A wide opening high in the left wall lets daylight in (the bright patch upper left).
  if (x <= X_MIN + 1 && z <= -9 && z >= -13) return { top: 4, kind: 'wall' };
  if (x <= X_MIN + 1 || x >= X_MAX - 1 || z >= Z_FRONT) return { top: 9 + ((x * 3 + z) & 1), kind: 'wall' };

  // A low grassy shelf beside the steps, between the pool and the floor.
  if ((x === -6 && (z === -5 || z === -6)) || (x === -7 && z === -6)) return { top: 0.5, kind: 'wall' };

  // Left: the stepped water cascade, rising toward the back-left, draining into a pool in front
  // of the landing (the lower-left of the opening view).
  if (x <= -9 || (x <= -6 && z >= -6 && z <= -4)) {
    if (z >= -7 || x > -9) return { top: -0.25, kind: 'stream' };
    const step = Math.floor((-z - 7) / 3) + Math.floor((-x - 9) / 3);
    return { top: Math.min(3, Math.max(0, step)), kind: 'water' };
  }

  // The landing the player starts on, and the steps down to the door floor.
  if (z >= -3) return { top: 1, kind: 'wall' };
  if (x >= -5 && x <= -3 && z >= -5) return { top: z === -4 ? 1 : 0.5, kind: 'step' };

  // Left terraces between the water and the floor, carrying the cube tree and the willow.
  if (x <= -6) {
    if (x === -6) return { top: z >= -9 ? 1 : 2, kind: 'wall' };
    if (x === -7) return { top: z >= -8 ? 1 : 2, kind: 'wall' };
    return { top: z >= -8 ? 2 : 3, kind: 'wall' };
  }

  // Right terrace, climbing toward the outer wall.
  const edge = rightEdge(z);
  if (x >= edge) {
    if (x >= X_MAX - 2) return { top: 3, kind: 'wall' };
    return { top: x >= edge + 3 ? 2 : 1, kind: 'wall' };
  }
  return { top: 0, kind: 'floor' };
}

// Ceiling slabs over the back of the cave, with a lower overhang on the left and two openings
// for the light shafts (a skylight left of the door and one high on the left).
function ceilingAtProcedural(x, z) {
  const skylight = x >= -1 && x <= 1 && z <= -12 && z >= -14;
  const leftLight = x >= -12 && x <= -10 && z <= -7 && z >= -9;
  if (skylight || leftLight) return null;
  if (z <= -6 && z > DOOR.z) return (x * 7 + z) % 4 === 0 && z === -6 ? null : 8;
  if (x <= -10 && z <= -2) return 7;
  return null;
}

// Each design is built in a few seeds, so neighbouring blocks don't share one mottle.
const VARIANTS = 3;
// Mesh density for the level's blocks (subdivisions per unit; the kit renders at 80).
const BLOCK_RES = 14;
const partCache = new Map();

/** A kit block design as instanceable parts: one merged geometry per material. */
function blockParts(design, variant) {
  const id = `${design}:${variant}`;
  if (partCache.has(id)) return partCache.get(id);
  const group = buildKitBlock({ kind: design, seed: 1 + variant * 7 }, rng(99 + variant), null, { res: BLOCK_RES });
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    // Seamed stone's three slabs each have their own (identical) felt: group them by settings.
    const k = `${o.material.uniforms.uFuzz.value}:${o.material.uniforms.uGrain?.value}`;
    if (!byMaterial.has(k)) byMaterial.set(k, { material: o.material, geometries: [] });
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    byMaterial.get(k).geometries.push(g.index ? g.toNonIndexed() : g);
  });
  const parts = [...byMaterial.values()].map(({ material, geometries }) => ({
    material,
    geometry: geometries.length === 1 ? geometries[0] : mergeGeometries(geometries),
  }));
  partCache.set(id, parts);
  return parts;
}

/** @param {{ hide?: ((x: number, y: number, z: number) => boolean) | null }} options blocks to leave out */
export function buildCaveLevel({ hide = null } = {}) {
  const random = rng(4242);
  const solid = new Set();
  const blocks = []; // { x, y, z, kind }
  const columns = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;

  for (let x = X_MIN; x <= X_MAX; x++) {
    for (let z = Z_BACK; z <= Z_FRONT; z++) {
      const col = columnAt(x, z);
      columns.set(`${x},${z}`, col);
      const top = Math.ceil(col.top);
      const doorGap = z === DOOR.z && x >= DOOR.xMin && x <= DOOR.xMax;
      for (let y = -2; y < top; y++) {
        if (doorGap && y >= 0 && y < DOOR.height) continue;
        if (hide?.(x, y, z)) continue;
        const kind = col.kind === 'floor' || col.kind === 'stream' || col.kind === 'step'
          ? (y === top - 1 ? col.kind : 'wall')
          : col.kind;
        // Grey stone around the door: side posts, a lintel, and a pillar on the right.
        const isFrame = z === DOOR.z && ((x >= DOOR.xMin - 1 && x <= DOOR.xMax + 1 && y <= DOOR.height
          && (x === DOOR.xMin - 1 || x === DOOR.xMax + 1 || y === DOOR.height))
          || (x === DOOR.xMax + 2 && y <= DOOR.height + 2));
        blocks.push({ x, y, z, kind: isFrame ? 'frame' : kind });
        solid.add(key(x, y, z));
      }
      const ceiling = ceilingAt(x, z);
      if (ceiling !== null) {
        for (let y = Math.max(ceiling, top); y < 10; y++) {
          if (hide?.(x, y, z)) continue;
          blocks.push({ x, y, z, kind: 'ceiling' });
          solid.add(key(x, y, z));
        }
      }
    }
  }

  // Only blocks with at least one open face can ever be seen.
  const exposed = (b) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
    .some(([dx, dy, dz]) => !solid.has(key(b.x + dx, b.y + dy, b.z + dz)));
  const visible = blocks.filter((b) => exposed(b));

  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const c = new THREE.Color();

  // Each block is one of the kit's cube designs (src/kit/families/blocks.js, matched to the
  // reference sheet): pink earth for the walls and terraces, marbled water, plain stone on the
  // floor and steps, seamed stone around the door. Every open wall top is a grass cell: the earth
  // cube stays pink and one felt blanket per terrace (src/cave/grass.js) drapes over it, as in the
  // reference; the kit's per-block grass cap is for the asset sheet, not this scale.
  const designFor = (b) => {
    if (b.kind === 'water' || b.kind === 'stream') return 'water';
    if (b.kind === 'floor' || b.kind === 'step') return 'stone';
    if (b.kind === 'frame') return 'stone';
    return 'pink';
  };
  // The right side of the cave sits in the overhang's shadow, darkening toward the outer wall.
  const sideShade = (x) => 1 - Math.min(0.45, Math.max(0, x + 2) * 0.06);
  const placed = new Map(); // `${design}:${variant}` -> [{ x, y, z, shade }]
  const frameCells = []; // the door frame's stones: one mesh each, painted from the reference
  const grassCells = []; // { x, z, y: the column's top }
  visible.forEach((b) => {
    const open = !solid.has(key(b.x, b.y + 1, b.z));
    const design = designFor(b);
    const col = columns.get(`${b.x},${b.z}`);
    // Only a column's real top block carries grass (the door threshold's hidden blocks under the
    // leaves have open tops too, but they are never seen).
    if (b.kind === 'wall' && open && b.y < 9 && b.y + 1 === Math.ceil(col.top)) grassCells.push({ x: b.x, z: b.z, y: col.top });
    // Fractional tops (the pool, the half step) sink the whole column.
    const y = b.kind === 'ceiling' ? b.y : b.y + (col.top - Math.ceil(col.top));
    // Soft depth shading: blocks lower in a stack sit in more shadow (no shadow maps needed).
    const depth = Math.max(0, Math.min(4, Math.ceil(col.top) - 1 - b.y));
    // The slabs' undersides face away from the light; the reference paints them as bright as the walls.
    const shade = b.kind === 'ceiling' ? 1.3 : (1 - depth * 0.06) * sideShade(b.x);
    const variant = Math.floor(random() * VARIANTS);
    if (b.kind === 'frame') { // built one by one below, to be projection painted
      frameCells.push({ x: b.x, y, z: b.z, variant });
      return;
    }
    const id = `${design}:${variant}`;
    if (!placed.has(id)) placed.set(id, []);
    placed.get(id).push({ x: b.x, y, z: b.z, shade, ceiling: b.kind === 'ceiling' });
  });
  // Each cell its own tone, as the painting shades its blocks: a little lighter or darker and a
  // little warmer or cooler than its neighbours (measured: the painting's earth faces vary more in
  // value and warmth from block to block than one shade per stack depth gives). Keyed on the
  // cell's position, so it does not disturb the variant draw. The ceiling stays even, as painted.
  const cellTone = (cell, color) => {
    if (cell.ceiling) return color.setScalar(cell.shade);
    const h = (k) => {
      const v = Math.sin(cell.x * 127.1 + cell.y * 311.7 + cell.z * 74.7 + k * 19.19) * 43758.5453;
      return v - Math.floor(v) - 0.5;
    };
    const value = cell.shade * (1 + h(1) * 0.12);
    const warm = h(2) * 0.08;
    return color.setRGB(value * (1 + warm), value, value * (1 - warm));
  };
  for (const [id, cells] of placed) {
    const [design, variant] = id.split(':');
    for (const part of blockParts(design, Number(variant))) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, cells.length);
      cells.forEach((cell, i) => {
        mesh.setMatrixAt(i, m.makeTranslation(cell.x, cell.y, cell.z));
        mesh.setColorAt(i, cellTone(cell, c));
      });
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  // The door frame: plain stone blocks, each its own mesh with the design's colours baked into its
  // vertices and a white felt, so projection painting (src/cave/projection-paint.js, from
  // public/cave/paint-frame.png) can give each stone the painting's own tone.
  const paintable = [];
  const frameMaterial = createTextile('felt', { fuzz: 0.25, grain: 1 });
  for (const cell of frameCells) {
    for (const part of blockParts('stone', cell.variant)) {
      const g = part.geometry.clone();
      const base = part.material.uniforms.uColor.value;
      const col = g.getAttribute('color');
      for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * base.r, col.getY(i) * base.g, col.getZ(i) * base.b);
      g.translate(cell.x, cell.y, cell.z);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, frameMaterial);
      mesh.userData.paint = { src: '/cave/paint-frame.png', x: 0, y: 0 };
      group.add(mesh);
      paintable.push(mesh);
    }
  }

  // The grass: one draped felt blanket per terrace, shaded like the cubes under it (a grass cell
  // is always a column's top block, so only the side shade applies).
  const blankets = buildGrassBlankets(grassCells, {
    heightAt: (x, z) => columns.get(`${x},${z}`)?.top ?? null,
    shadeAt: (x) => sideShade(x),
    seed: 31,
  });
  group.add(blankets);

  /** Highest walkable surface under (x, z); the door and walls report as very tall. */
  function heightAt(x, z) {
    const cx = Math.round(x);
    const cz = Math.round(z);
    if (cz === DOOR.z && cx >= DOOR.xMin && cx <= DOOR.xMax) return 99; // the closed door
    const col = columns.get(`${cx},${cz}`);
    if (!col) return 99;
    return col.top;
  }

  return {
    group, heightAt, columns, ceilingAt,
    paintable, // meshes to projection paint (mesh.userData.paint)
    blockCount: visible.length,
    capCount: grassCells.length,
    blanketRegions: blankets.userData.regions,
    blanketVertices: blankets.userData.vertices,
  };
}
