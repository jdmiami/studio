// "The Great Cave Door" level: a terraced felt canyon on a 1-unit block grid, laid out to match
// docs/reference/cave-door.jpg (see docs/fp-reference-analysis.md).
//
// Coordinates: the player starts near z = 1 looking down -Z toward the door at z = -16.
// A block at integer cell (x, y, z) fills [x-0.5, x+0.5] x [y, y+1] x [z-0.5, z+0.5].
import * as THREE from 'three';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { puffyTuft, rng, pick } from '../world/util.js';

export const CAVE_PALETTE = {
  wall: ['#e6b9b0', '#ddb0a6', '#e9c3bb', '#d9a9a0', '#e2b6ad'],
  cap: ['#b3cf98', '#a8c78d', '#bdd6a4'],
  floor: ['#e9d3c8', '#e3c6bb', '#ecdcd2', '#d9c0d6', '#c9d9d0'],
  water: ['#8db5e8', '#9fc2ef', '#7ea9e0'],
  foam: '#f4f8ff',
  frame: ['#c8c3bb', '#d2cdc5', '#bfb9b0'],
  pedestal: ['#cdbfb4', '#d6c9be'],
};

export const DOOR = { z: -16, xMin: -2, xMax: 2, height: 5 };

const WIDTH = 8; // cells from the center line to the outer wall
const Z_FRONT = 4;
const Z_BACK = -17;

/** Column heights (top surface y) and material for every walkable or solid cell. */
function layoutColumn(x, z) {
  // Back wall with the door opening.
  if (z <= DOOR.z) return { top: 10, kind: 'wall' };
  // Outer walls.
  if (Math.abs(x) >= 7) return { top: 8 + ((x * 3 + z) & 1), kind: 'wall' };

  if (x <= -4) {
    // Left: the stepped water cascade, rising toward the back.
    const step = Math.max(0, Math.min(3, Math.floor((-z - 1) / 4)));
    return { top: step + (x === -6 ? 1 : 0), kind: 'water' };
  }
  if (x === -3) return { top: -0.25, kind: 'stream' };

  if (x >= 3) {
    // Right: terraces, higher toward the outer wall.
    const tier = { 3: 1, 4: 2, 5: 3, 6: 5 }[x];
    const notch = x === 4 && z > -5 ? -1 : 0; // a lower shelf near the front
    return { top: tier + notch, kind: 'wall' };
  }

  // Center path, with two pedestals for the cube tree and the willow.
  if (x === -2 && z >= -10 && z <= -8) return { top: 2, kind: 'pedestal' };
  if (x === 2 && z >= -12 && z <= -11) return { top: 1, kind: 'pedestal' };
  return { top: 0, kind: 'floor' };
}

// Ceiling slabs over the back half, with openings for the light shafts.
function ceilingAt(x, z) {
  if (z > -8 || z <= DOOR.z) return false;
  const leftGap = x >= -6 && x <= -3 && z <= -7 && z >= -10;
  const centerGap = x >= -1 && x <= 1 && z <= -12 && z >= -14;
  const ragged = z === -8 && (x * 7) % 3 === 0;
  return !(leftGap || centerGap || ragged);
}

export function buildCaveLevel() {
  const random = rng(4242);
  const solid = new Set();
  const blocks = []; // { x, y, z, kind }
  const columns = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;

  for (let x = -WIDTH; x <= WIDTH; x++) {
    for (let z = Z_BACK; z <= Z_FRONT; z++) {
      const col = layoutColumn(x, z);
      columns.set(`${x},${z}`, col);
      const top = Math.ceil(col.top);
      const doorGap = z === DOOR.z && x >= DOOR.xMin && x <= DOOR.xMax;
      for (let y = -2; y < top; y++) {
        if (doorGap && y >= 0 && y < DOOR.height) continue;
        const kind = col.kind === 'floor' || col.kind === 'stream'
          ? (y === top - 1 ? col.kind : 'wall')
          : col.kind;
        const isFrame = z === DOOR.z && (x === DOOR.xMin - 1 || x === DOOR.xMax + 1 || y === DOOR.height)
          && x >= DOOR.xMin - 1 && x <= DOOR.xMax + 1 && y <= DOOR.height;
        blocks.push({ x, y, z, kind: isFrame ? 'frame' : kind });
        solid.add(key(x, y, z));
      }
      if (ceilingAt(x, z)) {
        blocks.push({ x, y: 9, z, kind: 'wall' });
        solid.add(key(x, 9, z));
      }
    }
  }

  // Only blocks with at least one open face can ever be seen.
  const exposed = (b) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
    .some(([dx, dy, dz]) => !solid.has(key(b.x + dx, b.y + dy, b.z + dz)));
  const visible = blocks.filter((b) => exposed(b) && b.y >= -1);

  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const c = new THREE.Color();

  // Clay-felt blocks: rounded, barely bulged.
  const blockGeometry = prepareTextileGeometry(puffyTuft(0.08, 1.0, 0.22, 2));
  const colorFor = (b) => {
    if (b.kind === 'water') return pick(random, CAVE_PALETTE.water);
    if (b.kind === 'floor') return pick(random, CAVE_PALETTE.floor);
    if (b.kind === 'stream') return CAVE_PALETTE.water[0];
    if (b.kind === 'frame') return pick(random, CAVE_PALETTE.frame);
    if (b.kind === 'pedestal') return pick(random, CAVE_PALETTE.pedestal);
    return pick(random, CAVE_PALETTE.wall);
  };
  const blockMesh = new THREE.InstancedMesh(blockGeometry, createTextile('felt', { fuzz: 0.35 }), visible.length);
  visible.forEach((b, i) => {
    const y = b.kind === 'stream' ? b.y - 0.25 : b.y;
    blockMesh.setMatrixAt(i, m.makeTranslation(b.x, y + 0.5, b.z));
    // Soft depth shading: blocks lower in a stack sit in more shadow (no shadow maps needed).
    const top = Math.ceil(columns.get(`${b.x},${b.z}`).top);
    const depth = Math.max(0, Math.min(4, top - 1 - b.y));
    const ao = b.y >= 9 ? 0.82 : 1 - depth * 0.06;
    blockMesh.setColorAt(i, c.set(colorFor(b)).multiplyScalar(ao));
  });
  blockMesh.frustumCulled = false;
  group.add(blockMesh);

  // Grass caps on every exposed wall/pedestal top; foam caps on the water steps.
  const capGeometry = prepareTextileGeometry(puffyTuft(0.0, 1, 0.12, 2));
  capGeometry.scale(1.1, 0.16, 1.1); // a soft felt layer draped slightly past the block edge
  const caps = visible.filter((b) => !solid.has(key(b.x, b.y + 1, b.z)) && b.y < 9
    && (b.kind === 'wall' || b.kind === 'water' || b.kind === 'pedestal'));
  const capMesh = new THREE.InstancedMesh(capGeometry, createTextile('felt', { fuzz: 0.5 }), caps.length);
  caps.forEach((b, i) => {
    capMesh.setMatrixAt(i, m.makeTranslation(b.x, b.y + 1.02, b.z));
    capMesh.setColorAt(i, c.set(b.kind === 'water' ? CAVE_PALETTE.foam : pick(random, CAVE_PALETTE.cap)));
  });
  capMesh.frustumCulled = false;
  group.add(capMesh);

  /** Highest walkable surface under (x, z); the door and walls report as very tall. */
  function heightAt(x, z) {
    const cx = Math.round(x);
    const cz = Math.round(z);
    if (cz === DOOR.z && cx >= DOOR.xMin && cx <= DOOR.xMax) return 99; // the closed door
    const col = columns.get(`${cx},${cz}`);
    if (!col) return 99;
    return col.top;
  }

  return { group, heightAt, columns, ceilingAt, blockCount: visible.length, capCount: caps.length };
}
