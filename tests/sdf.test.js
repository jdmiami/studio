import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packTerrain, packProps, propsFromPlacement, propsFromLandmarks, propBounds, PROP, KIND_CODES, NO_TOP, NO_CEILING, PROP_TEXELS } from '../src/game/sdf/scene-data.js';

test('terrain packs every column into its texel, with kinds, ceilings and empty cells', () => {
  const cols = new Map([['0,0', { top: 2, kind: 'wall' }], ['2,1', { top: 0.5, kind: 'water' }]]);
  const t = packTerrain(cols, { ceilingAt: (x, z) => (x === 0 && z === 0 ? 7 : null) });
  assert.deepEqual([t.x0, t.z0, t.width, t.depth], [0, 0, 3, 2]);
  const at = (x, z) => [...t.data.slice(((z - t.z0) * t.width + (x - t.x0)) * 4, ((z - t.z0) * t.width + (x - t.x0)) * 4 + 4)];
  assert.deepEqual(at(0, 0).slice(0, 3), [2, KIND_CODES.wall, 7]);
  assert.deepEqual(at(2, 1).slice(0, 3), [0.5, KIND_CODES.water, NO_CEILING]);
  assert.equal(at(1, 0)[0], NO_TOP, 'a cell with no column is empty');
  assert.ok(at(0, 0)[3] >= 0 && at(0, 0)[3] < 1);
  assert.equal(t.maxTop, 10, 'a ceiling raises the bound to the ceiling top');
  // Records work as well as Maps (the trip generator's columns are a plain object).
  assert.equal(packTerrain({ '5,5': { top: 3, kind: 'floor' } }).maxTop, 3);
});

test('props: placements and landmarks become shapes; creatures stay meshes', () => {
  const props = propsFromPlacement([
    { name: 'cube-tree', x: 1, y: 2, z: 3, height: 3 },
    { name: 'fence', x: 0, y: 2, z: 0, height: 0.5, ends: [[-1, 2, 0], [1, 2, 0]] },
    { name: 'dog', x: 0, y: 0, z: 0, height: 0.9 },
    { name: 'critter', x: 0, y: 0, z: 0, height: 0.4 },
  ]);
  assert.deepEqual(props.map((p) => p.type), [PROP.CUBE_TREE, PROP.FENCE]);
  assert.ok(Math.abs(props[1].length - 2) < 1e-9);
  const lm = propsFromLandmarks([{ kind: 'willow', x: 0, z: 0, y: 1, height: 3 }, { kind: 'pom', x: 2, z: 2, y: 0, height: 1 }], 'grotto');
  assert.deepEqual(lm.map((p) => p.type), [PROP.WILLOW, PROP.POM]);
  assert.ok(propBounds(lm[0]).r > 2, 'a tall willow has a big bounding sphere');
});

test('packProps keeps the nearest props, packed 4 texels each', () => {
  const props = Array.from({ length: 10 }, (_, i) => ({ type: PROP.STONE, x: i * 10, y: 0, z: 0, height: 1, yaw: 0, seed: 0.5, c1: '#ffffff', c2: '#000000' }));
  const { data, count } = packProps(props, { x: 95, z: 0 }, 3);
  assert.equal(count, 3);
  const xs = [0, 1, 2].map((i) => data[i * PROP_TEXELS * 4 + 1]).sort((a, b) => a - b);
  assert.deepEqual(xs, [70, 80, 90]);
  assert.equal(data[0], PROP.STONE);
  assert.ok(Math.abs(data[8] - 1) < 1e-6, 'white is linear 1');
});
