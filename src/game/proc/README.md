# src/game/proc: procedural trips

`generateTrip({ seed, biome? })` turns a seed into a **trip**: a small open-air felt landscape
(about 40 x 40 blocks) that the player visits through the hub's great door. It is pure data. There
are no three.js imports and no dependencies beyond `src/game/core/rng.js` and
`src/game/data/items.js`, and it runs unchanged in Node and the browser.

```js
import { generateTrip, validateTrip, heightAt } from './src/game/proc/index.js';
const trip = generateTrip({ seed: 123456 });            // biome drawn from the seed
const lake = generateTrip({ seed: 'K7QX2MA', biome: 'lake' }); // a share code works as a seed
heightAt(trip, trip.spawn.x, trip.spawn.z);              // like the hub's heightAt
```

Preview a trip with `node scripts/proc/preview.mjs <seed|code> out.svg [--biome lake] [--sheet 9]`,
which writes an SVG map (or a contact sheet of consecutive seeds). Run
`node scripts/proc/preview.mjs <seed> --ascii` to print an ASCII map instead.

## Conventions

The trip uses the hub's conventions (`src/cave/layout.json`, `src/cave/level.js`):

- **Blocks.** A column `"x,z"` is solid from y = -2 up to `top`. A block (x, y, z) fills
  [x-0.5, x+0.5] x [y, y+1] x [z-0.5, z+0.5], so cell centres sit on integers.
- **Tops.** Dry tops are whole or half blocks. Water sits a quarter block under a floor: the lake
  and ponds on flat ground are at -0.25, and a pond on a hill is at `k - 0.25`.
- **Kinds.**
  - `wall`: earth with a felt grass top. Meadow and lake show it green, grotto pink; the renderer
    picks the colour by `biome`.
  - `floor`: pale stone, used for paths, grotto canyon floors, lake shores and stepping stones.
  - `step`: stone stairs and lifted cells.
  - `water`.
- **Yaw.** Radians, in the three.js / `src/fp/controls.js` convention: yaw 0 looks toward -z, and
  positive yaw turns toward -x.
- **Player metrics** (`reach.js`, taken from `controls.js`): walk-up 0.55, jump 6.8 under gravity 20
  (apex 1.16), radius 0.28.

## Output schema

```js
{
  seed, code,                 // code = seedToCode(seed), 7 characters
  biome: 'meadow' | 'grotto' | 'lake',
  name,                       // 'Whispering Meadow', 'Thimble Mere', 'Grotto of Buttons'...
  size: { w: 40, d: 40 }, origin: { x0: -20, z0: -20 }, ring: 2,   // world x in [x0, x0+w)
  columns: { "x,z": { top, kind } },  // every cell; the outer `ring` cells are walls 6..9 high
  spawn: { x, z, y, yaw, side },      // on the entry landing, facing into the trip
  gate:  { x, z, y, yaw },            // the return gate, 2 cells behind the spawn, against the edge wall
  finds: [{ id, itemId, rarity, x, z, y }],          // 12..18, at cell centres, >= 3 apart
  critters: [{ id, kind: 'cream'|'mint'|'blush', itemId: 'critter-<kind>', x, z, y, home: { x, z }, wander }],  // 3..6
  landmarks: [{ kind, x, z, y, yaw, height, scale, radius, blocking, source, tile?,
                length?, from?, to? }],   // props; height/radius in world units, scale = height / native
  paths: ["x,z", ...],        // path and landing cells (no props stand on them)
  rooms: [{ tx, tz, tile, rot, x0, z0, size: 6 }],  // debug: the WFC tile grid
  chunks: { size: 16, keys: ["cx,cz", ...] },        // floor(x / 16), floor(z / 16), covering every column
  stats: { attempt, calm, walkableCells, reachableCells, physicallyReachableCells, trapCells,
           waterCells, reachableFinds, finds, critters, landmarks, rejectedLandmarks,
           wfcAttempts, wfcContradictions, repairs: { pitsLifted, ramps, steppingStones, rampCells },
           tiles: { name: count }, heights: { min, max }, lake: { x, z, radius, islands } | null }
}
```

Landmark kinds are the hub's asset families. The table gives each family's height at scale 1, the
height range drawn, the footprint radius, and whether it blocks movement:

| kind | native height | height range | footprint radius | blocks |
| --- | --- | --- | --- | --- |
| `cube-tree` | 3.2 | 2.6-3.6 | 0.3 | yes |
| `willow` | 3.6 | 3.0-4.2 | 0.3 | yes |
| `dome` | 1.4 | 1.0-1.8 | 0.6 | yes |
| `mushroom` | 0.42 | 0.25-0.55 | 0.2 | no |
| `pom` | 0.34 | 0.3-0.7 | 0.4 | if taller than 0.45 |
| `stone` | 0.32 | 0.25-0.8 | 0.25 | if taller than 0.5 |
| `fence` | 0.7 | 0.5-0.6 | piece between two cell centres | yes |

A fence piece runs between two cell centres and blocks both end cells.

## Pipeline

Each stage draws from its own labelled fork of the seed's Rng, so changing one stage does not
reshuffle the others.

1. **Biome and name.** The biome is the one passed in, or `fork('biome')` of the seed. The name
   comes from word lists in `names.js`.
2. **Terrain** (`terrain.js`, `noise.js`).
   - The heightfield is a seeded 2D simplex fBm, domain-warped by two further fBm fields.
   - It is terraced onto the block grid: plateaus sit at whole blocks, with a half step in the band
     just below each rise, which gives gentle slopes like the cave's stepped terraces.
   - Per biome:
     - **meadow:** low rolling relief (0 to about 3), all grass.
     - **grotto:** about twice the relief with a contrast curve. Ground at 0 becomes stone canyon
       floor.
     - **lake:** a warped radial bowl around a centre kept away from the spawn side. Ground below 0
       becomes water at -0.25. Islands are added as polynomial bumps, and shore cells beside the
       water become stone.
3. **Rooms by wave function collapse** (`tiles.js`, `wfc.js`).
   - The grid is 6 x 6 tiles of 6 x 6 cells, inside a 2-cell boundary ring.
   - Allowed tiles per cell come from the biome's weights:
     - every border-facing socket must be plain;
     - the spawn tile's outward socket must be the path socket, so a path always leads in from the
       gate;
     - mostly-water lake tiles take only plain ground and paths.
   - The solver collapses the lowest-entropy cell (Rényi-2, see determinism), propagates (AC-3 on
     bitsets) and restarts on contradiction (80 attempts at most; 300-seed tests never need more
     than a few).
   - The chosen tiles' cell codes are then applied over the terrain:
     - paths become stone, and over water they become checkerboard stepping stones;
     - terraces add +1, stairs add +0.5;
     - ponds sink below their rim;
     - the tiles' props become landmark candidates.
4. **Boundary and arrival.**
   - The edge ring is a felt wall 6 to 9 blocks high, always at least 2 above the ground beside it,
     so it can't be climbed.
   - The entry path's last 2 x 3 cells become a flat stone landing. The gate stands on it against
     the wall, and the spawn is two cells in, facing into the trip.
5. **Repair** (`reach.js` graphs, BFS).
   - **Pits.** Any cell the player could physically reach but not walk back to the gate from is
     lifted to one block below its safe neighbour, and this repeats until none are left.
   - **Stranded regions.** Dry regions of 5+ cells outside design reach (plateaus, islands) are
     joined to reachable ground by the shortest chain whose height fits half-block steps. The chain
     is set on a straight-line ramp of stone steps; over water it becomes stepping stones, with
     every other cell left as water where a hop crosses it.
   - A ramp is kept only if it strictly grows reach and creates no trap.
6. **Props.**
   - The tiles' props are placed first. A Poisson-disc scatter (Bridson, biome radius and kinds)
     follows.
   - A prop is placed only on dry interior ground. It must not touch a path, the landing, water or
     another prop.
   - A blocking prop is kept only if blocking its cells cuts no reachable cell off and traps no one.
     This also opens a fence garden whose gap is blocked.
7. **Finds and critters.**
   - **Finds.** Bridson Poisson-disc samples (r = 3, snapped to cell centres) are taken on design-
     reachable dry cells that nothing covers.
   - 12 to 18 spots are picked greedily for interest (height, distance, mushroom-ring and garden
     hotspots) and spread.
   - Items are drawn from `findTable(biome)` by rarity weight, reweighted per biome (`BIOMES[b].rarity`
     and x1.4 for a biome's own specialities). The rarest go to the hardest-won spots.
   - **Critters.** 3 to 6, Poisson-spaced (r = 5) on reachable ground at least 4 from the spawn,
     preferring grass. Kinds are weighted by biome:
     - meadow leans cream;
     - grotto leans cream and blush;
     - lake leans mint.
8. **Validate** (`validate.js`, from the JSON alone). On failure the generator re-rolls with
   calmer terrain: attempt 2+ flattens relief and terraces, and the last attempt allows only plain
   ground and paths. If all 6 attempts fail it throws, which no tested seed does.

## Tile set

Cell codes: `.` ground (noise as is), `#` stone path, `^` +1 terrace, `s` +0.5 stone stair,
`~` pond. Sockets are the codes along each edge (read west to east, or north to south), so tiles
join exactly where their seams carry the same codes. All rotations are generated (identical ones
merged): 14 templates give 47 variants. Weights are listed as meadow / grotto / lake, before being
split across rotations.

| tile | grid (row 0 = north) | sockets N/E/S/W | weights m/g/l | props |
| --- | --- | --- | --- | --- |
| `plain` | all `.` | plain | 6 / 3 / 6 | none (the scatter fills it) |
| `path` | `..##..` x6 | path / plain / path / plain | 2.2 / 1.4 / 2.4 | stone, mushroom (maybe) |
| `path-corner` | path N, turning E | path / path / plain / plain | 1.5 / 1.1 / 1.6 | pom (maybe) |
| `path-tee` | N, E and S | path / path / path / plain | 0.8 / 0.6 / 0.8 | stone (maybe) |
| `path-cross` | four ways | path x4 | 0.6 / 0.6 / 0.6 | mushrooms (maybe) |
| `plaza` | paths ring a 2x2 grass island | path x4 | 0.6 / 0.6 / 0.5 | big pom on the island, stone |
| `pond` | round 12-cell pond | plain | 0.8 / 0.4 / 0.5 | rim stone, tree (maybe) |
| `grove` | all `.` | plain | 2 / 0.8 / 1.5 | 3-4 trees (biome's family), mushroom |
| `mushroom-ring` | all `.` | plain | 1 / 2 / 0.6 | 8 mushrooms in a ring; find hotspot inside |
| `fence-garden` | all `.` | plain | 1 / 0.5 / 0.6 | 9 fence pieces, open south; mushroom; find hotspot |
| `terrace-edge` | north half `^`, `..ss..` stair | high / split / plain / split | 1 / 3 / 0.6 | stone (maybe) |
| `terrace-outer` | NW quarter `^` | split / plain / plain / split | 0.8 / 2.5 / 0.5 | tree (maybe) |
| `terrace-inner` | all `^` but the SE quarter | high / split / split / high | 0.5 / 2 / 0.3 | mushroom (maybe) |
| `plateau` | all `^` | high x4 | 0.6 / 2 / 0.3 | tiered dome (maybe) |

Socket shorthand:

- plain = `oooooo`
- path = `oopp` + `oo`
- high = `hhhhhh`
- split = `hhhooo`, half high and half low, so terraces close into rectangles and L-shapes and
  never touch the border.

### Adding a tile

1. Append a template to `TEMPLATES` in `tiles.js`. It needs:
   - `name` and a one-line `doc`;
   - a 6-row `grid` using the codes above;
   - `props` in local cell units (centres 0..5; `tree` resolves to the biome's tree, and `chance`
     makes a prop optional);
   - optional `hotspots` (cells finds like);
   - `weights` for `meadow`, `grotto` and `lake` (0 leaves the tile out of that biome).
2. Its sockets come from its border cells. A new edge pattern needs at least one partner tile with
   the matching edge, or WFC will only ever place it where both sides fit, or never.
3. If it uses a new cell code, add it to `SOCKET_CLASS` and handle it in the tile application step
   of `trip.js`.
4. Run `npm test`. The tile-set test checks the grid shape, the codes, the weights, and that every
   side can still close the border. The playability tests sweep 50 seeds in each biome. Then look at
   a contact sheet: `node scripts/proc/preview.mjs 1 /tmp/sheet.svg --sheet 9 --biome grotto`.

## Guarantees (checked by `validateTrip`, enforced by re-rolls)

Reachability uses three BFS graphs over 4-neighbour cell moves:

- **design** (where content may go): dry ground; up at most 1.0, down at most 3. A hop over one
  water cell is allowed onto ground no more than 0.5 higher.
- **physical** (everything a player could manage): up at most 1.8 (walk-up plus jump apex), any
  drop, water included. The hub's water is wadeable.
- **escape**: cells that can walk back to the gate, with up at most 1.0 and any drop.

`validateTrip` checks the following:

- Every cell exists. Dry tops are on the half-block grid. Edge walls are 6..9 and at least 2 above
  the ground beside them.
- The spawn and the gate are on dry, uncovered interior ground, 2 cells apart. The gate is
  design-reachable from the spawn.
- **No traps:** physical reach is a subset of escape reach, so no fall strands the player.
- There are 12..18 finds. Each is on a dry cell, design-reachable, not covered by any prop, at
  least 3 from every other find, and its item comes from `findTable(biome)`.
- There are 3..6 critters, each on reachable dry ground, with `itemId = critter-<kind>`.
- Every landmark is a known kind with a size. It is inside the interior and on dry ground, never on
  a path, landing, spawn, gate, find or critter cell, and it doesn't overlap another prop.
  Blocking props count as solid for the graphs.
- The chunk keys cover every column.

Tests (`tests/proc.test.js`) cover:

- determinism, in-process and across processes;
- 50 seeds plus 50 per biome passing the checks;
- negative cases the validator must catch;
- WFC completion and timing over 300 seeds, with a restart case;
- find counts and spacing, biome looks, chunk keys, the tile set, Poisson spacing and noise bounds,
  and the preview script.

In sweeps of 200 seeds per biome there were no failures, 2 of 600 trips needed a re-roll, and on
average 99.6-100% of dry interior ground was design-reachable.

## Determinism

- The same seed and biome give byte-identical JSON.
- Every random draw comes from `createRng(seed)` forks. No global or time input is used, and the
  output carries no timing.
- The generator uses only + - * /, `Math.floor`, `Math.round` and `Math.sqrt`, which IEEE 754
  rounds exactly. It avoids `sin`/`cos`/`exp`/`log`/`pow`, whose last bits differ between JS
  engines. Concretely:
  - Poisson annulus samples use rejection sampling.
  - Ring props use tabulated unit vectors.
  - WFC entropy is Rényi-2, compared as sum(w^2) / (sum w)^2, so no logarithm is needed.
  - Island bumps are polynomial.
- Prop yaws are a seeded float times the constant `Math.PI`, rounded to 3 decimals: plain
  arithmetic too.
- The `procedural-gen` skill recommends a noise library. The brief forbids new dependencies, so
  `noise.js` implements seeded simplex noise itself, about 60 lines.

## Performance

Generation takes about 11-18 ms per trip in Node once warm, and 25-60 ms for a cold first call.
Re-rolls are rare. Most of the time goes to the BFS checks that keep blocking props honest.
