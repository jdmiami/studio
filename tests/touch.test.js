import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STICK, stickVector, followBase, clampBase, isTap, touchWanted } from '../src/game/input/touch-math.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('stick: deadzone, direction (screen up is forward), full tilt at the rim, run past it', () => {
  const R = STICK.radius;
  assert.deepEqual([stickVector(2, 3, R).x, stickVector(2, 3, R).y], [0, 0]);
  const up = stickVector(0, -R, R);
  assert.ok(near(up.x, 0) && near(up.y, 1) && !up.run);
  const right = stickVector(R / 2, 0, R);
  assert.ok(right.x > 0.3 && right.x < 0.6 && near(right.y, 0));
  const past = stickVector(0, -R * 1.3, R);
  assert.ok(near(past.y, 1) && past.run);
  const far = stickVector(0, -R * 3, R);
  assert.ok(near(Math.hypot(far.knob.x, far.knob.y), R * STICK.maxPull), 'the knob stops at its pull limit');
  assert.ok(Math.hypot(stickVector(R, -R, R).x, stickVector(R, -R, R).y) <= 1 + 1e-9);
});

test('stick: the base follows a thumb dragged past the pull limit', () => {
  const R = 50;
  assert.deepEqual(followBase({ x: 0, y: 0 }, { x: 30, y: 0 }, R), { x: 0, y: 0 });
  const b = followBase({ x: 0, y: 0 }, { x: 200, y: 0 }, R, 1.4);
  assert.ok(near(b.x, 200 - 70) && near(b.y, 0));
});

test('stick base stays on screen, clear of the safe area', () => {
  const view = { width: 400, height: 800 };
  const b = clampBase(2, 799, 56, view, { left: 20, right: 0, top: 0, bottom: 34 });
  assert.equal(b.x, 20 + 66);
  assert.equal(b.y, 800 - 34 - 66);
});

test('taps and the auto setting', () => {
  assert.equal(isTap(120, 4), true);
  assert.equal(isTap(600, 4), false);
  assert.equal(isTap(120, 40), false);
  assert.equal(touchWanted('auto', { coarse: true }), true);
  assert.equal(touchWanted('auto', { coarse: false, touched: false }), false);
  assert.equal(touchWanted('auto', { touched: true }), true);
  assert.equal(touchWanted('off', { coarse: true }), false);
  assert.equal(touchWanted('on'), true);
});

test('portrait widens the field of view (capped), landscape keeps the setting', async () => {
  const { fovFor } = await import('../src/game/player/controller.js');
  assert.equal(fovFor(70, 16 / 9), 70);
  assert.equal(fovFor(70, 1), 70);
  const tall = fovFor(70, 0.46);
  assert.ok(tall > 85 && tall < 95, String(tall));
  assert.equal(fovFor(100, 0.2), 100);
});
