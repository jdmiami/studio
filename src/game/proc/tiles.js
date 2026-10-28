// The kit chunks: hand-authored 6x6 tile templates that wave function collapse assembles into a
// trip's rooms. Each template is a grid of cell codes (deltas over the noise terrain) plus props.
// Rotations are generated automatically (identical rotations are merged), and every variant's edge
// sockets are read straight off its border cells, so two tiles fit side by side exactly when the
// cells along their shared seam carry the same codes: paths continue, terraces line up.
//
// Cell codes (row 0 is north, -z; column 0 is west, -x):
//   '.'  ground: the noise terrain as it is              socket class 'o'
//   '#'  path: pale stone floor ('floor'), noise height  socket class 'p'
//   '^'  raised: +1 block (terrace / plateau)            socket class 'h'
//   's'  stair: +0.5, stone ('step')                     socket class 's'
//   '~'  pond: water sunk below its rim                  socket class 'w'
//
// Props are in local cell units (cell centres at 0..5; 2.5 is the tile's middle). `tree` resolves
// to the biome's tree family; `chance` makes a prop optional. Fences run between cell centres and
// block both end cells.
//
// To add a tile: append a template below with a name, a 6-row grid, its props and a weight per
// biome (0 leaves it out of that biome), then run `npm test` (the tile-set test checks the grid is
// 6x6, the codes are known and every border-facing socket can still be satisfied).

export const TILE = 6;

const ring8 = (cx, cz, r) => [
  [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071],
].map(([dx, dz]) => [cx + dx * r, cz + dz * r]);

export const TEMPLATES = [
  {
    name: 'plain',
    doc: 'Open felt ground; the noise terrain shows through. Scatter props land here.',
    grid: ['......', '......', '......', '......', '......', '......'],
    props: [],
    weights: { meadow: 6, grotto: 3, lake: 6 },
  },
  {
    name: 'path',
    doc: 'A two-cell stone path, straight north-south (rotated: east-west).',
    grid: ['..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
    props: [{ kind: 'stone', x: 0.6, z: 1.4, chance: 0.35 }, { kind: 'mushroom', x: 4.6, z: 3.8, chance: 0.35 }],
    weights: { meadow: 2.2, grotto: 1.4, lake: 2.4 },
  },
  {
    name: 'path-corner',
    doc: 'The path turns from north to east.',
    grid: ['..##..', '..##..', '..####', '..####', '......', '......'],
    props: [{ kind: 'pom', x: 4.5, z: 0.8, chance: 0.4 }],
    weights: { meadow: 1.5, grotto: 1.1, lake: 1.6 },
  },
  {
    name: 'path-tee',
    doc: 'A path junction: north, east and south.',
    grid: ['..##..', '..##..', '..####', '..####', '..##..', '..##..'],
    props: [{ kind: 'stone', x: 0.8, z: 2.6, chance: 0.5 }],
    weights: { meadow: 0.8, grotto: 0.6, lake: 0.8 },
  },
  {
    name: 'path-cross',
    doc: 'A four-way path crossing.',
    grid: ['..##..', '..##..', '######', '######', '..##..', '..##..'],
    props: [{ kind: 'mushroom', x: 0.7, z: 0.7, chance: 0.5 }, { kind: 'mushroom', x: 4.4, z: 4.6, chance: 0.5 }],
    weights: { meadow: 0.6, grotto: 0.6, lake: 0.6 },
  },
  {
    name: 'plaza',
    doc: 'Four paths meet around a grass island carrying a big pom.',
    grid: ['..##..', '.####.', '##..##', '##..##', '.####.', '..##..'],
    props: [{ kind: 'pom', x: 2.5, z: 2.5, height: 0.6 }, { kind: 'stone', x: 0.3, z: 0.4, chance: 0.5 }],
    weights: { meadow: 0.6, grotto: 0.6, lake: 0.5 },
  },
  {
    name: 'pond',
    doc: 'A round pond sunk into the ground, a stone on its rim.',
    grid: ['......', '..~~..', '.~~~~.', '.~~~~.', '..~~..', '......'],
    props: [{ kind: 'stone', x: 0.6, z: 1.2 }, { kind: 'tree', x: 4.8, z: 4.8, chance: 0.5 }],
    weights: { meadow: 0.8, grotto: 0.4, lake: 0.5 },
  },
  {
    name: 'grove',
    doc: 'A cluster of the biome\'s trees (cube trees, willows).',
    grid: ['......', '......', '......', '......', '......', '......'],
    props: [
      { kind: 'tree', x: 1, z: 1 }, { kind: 'tree', x: 4, z: 1.4 }, { kind: 'tree', x: 1.4, z: 4 },
      { kind: 'tree', x: 4.2, z: 4.2, chance: 0.6 }, { kind: 'mushroom', x: 2.6, z: 2.4, chance: 0.5 },
    ],
    weights: { meadow: 2, grotto: 0.8, lake: 1.5 },
  },
  {
    name: 'mushroom-ring',
    doc: 'A fairy ring of eight mushrooms; its middle is a favourite hiding place for finds.',
    grid: ['......', '......', '......', '......', '......', '......'],
    props: ring8(2.5, 2.5, 1.9).map(([x, z]) => ({ kind: 'mushroom', x, z })),
    hotspots: [[2, 2], [3, 2], [2, 3], [3, 3]],
    weights: { meadow: 1, grotto: 2, lake: 0.6 },
  },
  {
    name: 'fence-garden',
    doc: 'A little fenced garden open to the south, a mushroom inside.',
    grid: ['......', '......', '......', '......', '......', '......'],
    props: [
      ...[[1, 1, 2, 1], [2, 1, 3, 1], [3, 1, 4, 1], [1, 1, 1, 2], [1, 2, 1, 3], [1, 3, 1, 4], [4, 1, 4, 2], [4, 2, 4, 3], [4, 3, 4, 4]]
        .map(([ax, az, bx, bz]) => ({ kind: 'fence', from: [ax, az], to: [bx, bz] })),
      { kind: 'mushroom', x: 3, z: 2 },
    ],
    hotspots: [[2, 2], [2, 3], [3, 3]],
    weights: { meadow: 1, grotto: 0.5, lake: 0.6 },
  },
  {
    name: 'terrace-edge',
    doc: 'A terrace edge: the north half one block up, with a half-step stair in the middle.',
    grid: ['^^^^^^', '^^^^^^', '^^^^^^', '..ss..', '......', '......'],
    props: [{ kind: 'stone', x: 0.6, z: 4.4, chance: 0.4 }],
    weights: { meadow: 1, grotto: 3, lake: 0.6 },
  },
  {
    name: 'terrace-outer',
    doc: 'A terrace\'s outer corner: the north-west quarter up.',
    grid: ['^^^...', '^^^...', '^^^...', '......', '......', '......'],
    props: [{ kind: 'tree', x: 1, z: 1, chance: 0.4 }],
    weights: { meadow: 0.8, grotto: 2.5, lake: 0.5 },
  },
  {
    name: 'terrace-inner',
    doc: 'A terrace\'s inner corner: all up but the south-east quarter.',
    grid: ['^^^^^^', '^^^^^^', '^^^^^^', '^^^...', '^^^...', '^^^...'],
    props: [{ kind: 'mushroom', x: 4.2, z: 4.4, chance: 0.5 }],
    weights: { meadow: 0.5, grotto: 2, lake: 0.3 },
  },
  {
    name: 'plateau',
    doc: 'Raised ground one block up, sometimes crowned with a tiered dome.',
    grid: ['^^^^^^', '^^^^^^', '^^^^^^', '^^^^^^', '^^^^^^', '^^^^^^'],
    props: [{ kind: 'dome', x: 2.5, z: 2.5, chance: 0.45 }],
    weights: { meadow: 0.6, grotto: 2, lake: 0.3 },
  },
];

export const SOCKET_CLASS = { '.': 'o', '#': 'p', '^': 'h', s: 's', '~': 'w' };
export const PLAIN_SOCKET = 'oooooo';
export const PATH_SOCKET = 'oopp' + 'oo';

/** Rotate a grid 90 degrees clockwise seen from above (north -> east). */
function rotateGrid(grid) {
  const out = [];
  for (let z = 0; z < TILE; z++) {
    let row = '';
    for (let x = 0; x < TILE; x++) row += grid[TILE - 1 - x][z];
    out.push(row);
  }
  return out;
}

/** Rotate a local point 90 degrees clockwise: (x, z) -> (5 - z, x); yaw turns by -pi/2. */
export function rotatePoint([x, z], rot) {
  let px = x;
  let pz = z;
  for (let i = 0; i < rot; i++) [px, pz] = [TILE - 1 - pz, px];
  return [px, pz];
}

/** Edge sockets [N, E, S, W], each read west->east (N, S) or north->south (E, W). */
export function socketsOf(grid) {
  const cls = (c) => SOCKET_CLASS[c];
  let n = '', s = '', e = '', w = '';
  for (let i = 0; i < TILE; i++) {
    n += cls(grid[0][i]);
    s += cls(grid[TILE - 1][i]);
    w += cls(grid[i][0]);
    e += cls(grid[i][TILE - 1]);
  }
  return [n, e, s, w];
}

/** Every distinct rotation of every template, with sockets and per-biome weights. */
export function buildVariants(templates = TEMPLATES) {
  const variants = [];
  templates.forEach((t, ti) => {
    const seen = new Set();
    const mine = [];
    let grid = t.grid;
    for (let rot = 0; rot < 4; rot++) {
      const key = grid.join('/');
      // Templates with props off-centre keep all four rotations (the props differ); pure grids merge.
      const propsMatter = t.props.length > 0 && t.name !== 'plaza' && t.name !== 'plateau';
      if (!seen.has(key) || propsMatter) {
        seen.add(key);
        mine.push({ template: ti, name: t.name, rot, grid, sockets: socketsOf(grid) });
      }
      grid = rotateGrid(grid);
    }
    for (const v of mine) {
      v.weights = Object.fromEntries(Object.entries(t.weights).map(([b, w]) => [b, w / mine.length]));
      v.id = `${t.name}@${v.rot}`;
      variants.push(v);
    }
  });
  return variants;
}

export const VARIANTS = buildVariants();
