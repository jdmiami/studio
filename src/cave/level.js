// "The Great Cave Door" level: a terraced felt canyon on a 1-unit block grid, laid out to match
// docs/reference/cave-door.jpg (see docs/fp-reference-analysis.md).
//
// Coordinates: the player starts at (-5.5, -1.5) looking down -Z toward the door at z = -16.
// A block at integer cell (x, y, z) fills [x-0.5, x+0.5] x [y, y+1] x [z-0.5, z+0.5].
import * as THREE from 'three';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { puffyTuft, rng, pick } from '../world/util.js';

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

export const DOOR = { z: -16, xMin: -2, xMax: 2, height: 6 };

// The player starts on a raised landing at (-5.5, -1.5), left of the door's axis, so the door sits
// right of center like the reference. Water cascades down on the left, green terraces climb between
// the water and the floor, and a grassy terrace runs along the right toward the door.
const X_MIN = -15;
const X_MAX = 7;
const Z_FRONT = 3;
const Z_BACK = -17;

/** Left edge of the right-hand terrace at depth z (the floor narrows toward the player). */
const rightEdge = (z) => (z > -5 ? -3 : -3 + (-z - 5) * 0.6);

/** Column heights (top surface y) and material for every walkable or solid cell. */
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
function ceilingAt(x, z) {
  const skylight = x >= -1 && x <= 1 && z <= -12 && z >= -14;
  const leftLight = x >= -12 && x <= -10 && z <= -7 && z >= -9;
  if (skylight || leftLight) return null;
  if (z <= -6 && z > DOOR.z) return (x * 7 + z) % 4 === 0 && z === -6 ? null : 8;
  if (x <= -10 && z <= -2) return 7;
  return null;
}

export function buildCaveLevel() {
  const random = rng(4242);
  const solid = new Set();
  const blocks = []; // { x, y, z, kind }
  const columns = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;

  for (let x = X_MIN; x <= X_MAX; x++) {
    for (let z = Z_BACK; z <= Z_FRONT; z++) {
      const col = layoutColumn(x, z);
      columns.set(`${x},${z}`, col);
      const top = Math.ceil(col.top);
      const doorGap = z === DOOR.z && x >= DOOR.xMin && x <= DOOR.xMax;
      for (let y = -2; y < top; y++) {
        if (doorGap && y >= 0 && y < DOOR.height) continue;
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
          blocks.push({ x, y, z, kind: 'ceiling' });
          solid.add(key(x, y, z));
        }
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
    if (b.kind === 'step') return pick(random, CAVE_PALETTE.step);
    if (b.kind === 'ceiling') return pick(random, CAVE_PALETTE.ceiling);
    if (b.kind === 'frame') return pick(random, CAVE_PALETTE.frame);
    return pick(random, CAVE_PALETTE.wall);
  };
  // The right side of the cave sits in the overhang's shadow, darkening toward the outer wall.
  const sideShade = (x) => 1 - Math.min(0.45, Math.max(0, x + 2) * 0.06);
  const blockMesh = new THREE.InstancedMesh(blockGeometry, createTextile('felt', { fuzz: 0.35 }), visible.length);
  visible.forEach((b, i) => {
    // Fractional tops (the pool, the half step) sink the whole column.
    const col = columns.get(`${b.x},${b.z}`);
    const y = b.kind === 'ceiling' ? b.y : b.y + (col.top - Math.ceil(col.top));
    blockMesh.setMatrixAt(i, m.makeTranslation(b.x, y + 0.5, b.z));
    // Soft depth shading: blocks lower in a stack sit in more shadow (no shadow maps needed).
    const top = Math.ceil(col.top);
    const depth = Math.max(0, Math.min(4, top - 1 - b.y));
    const ao = b.kind === 'ceiling' ? 1 : 1 - depth * 0.06;
    blockMesh.setColorAt(i, c.set(colorFor(b)).multiplyScalar(ao * (b.kind === 'ceiling' ? 1 : sideShade(b.x))));
  });
  blockMesh.frustumCulled = false;
  group.add(blockMesh);

  // Grass caps on every exposed wall top; foam caps on the water steps.
  const capGeometry = prepareTextileGeometry(puffyTuft(0.0, 1, 0.12, 2));
  capGeometry.scale(1.1, 0.16, 1.1); // a soft felt layer draped slightly past the block edge
  const caps = visible.filter((b) => !solid.has(key(b.x, b.y + 1, b.z)) && b.y < 9
    && (b.kind === 'wall' || b.kind === 'water'));
  const capY = (b) => {
    const col = columns.get(`${b.x},${b.z}`);
    return b.y + 1.02 + (col.top - Math.ceil(col.top));
  };
  const capMesh = new THREE.InstancedMesh(capGeometry, createTextile('felt', { fuzz: 0.5 }), caps.length);
  caps.forEach((b, i) => {
    capMesh.setMatrixAt(i, m.makeTranslation(b.x, capY(b), b.z));
    capMesh.setColorAt(i, c.set(b.kind === 'water' ? CAVE_PALETTE.foam : pick(random, CAVE_PALETTE.cap)).multiplyScalar(sideShade(b.x)));
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
