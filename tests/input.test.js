import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, EVENTS, defaultSettings } from '../src/game/core/contracts.js';
import { createEvents } from '../src/game/core/events.js';
import {
  defaultBindings, resolveBindings, findConflicts, setBindingSlot, clearBindingSlot, familySlots,
  ALL_ACTIONS, MAX_PER_FAMILY, PAD,
} from '../src/game/input/bindings.js';
import { radialDeadzone, responseCurve, shapeStick, createRepeat, clampLength } from '../src/game/input/analog.js';
import { keyLabel, bindingLabel, labelForAction, padAxisLabel } from '../src/game/input/labels.js';
import { createInputCore, MOUSE_LOOK_SCALE, PAD_LOOK_SPEED, PAD_PITCH_SCALE, TOUCH_LOOK_SCALE } from '../src/game/input/core.js';
import { createInput } from '../src/game/input/index.js';

const A = ACTIONS;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

/** A fake standard-mapping gamepad snapshot, shaped like navigator.getGamepads()[i]. */
function fakePad({ buttons = {}, axes = [0, 0, 0, 0], index = 0 } = {}) {
  const list = Array.from({ length: 17 }, (_, i) => {
    const v = buttons[i] ?? 0;
    return { pressed: v > 0.5, value: v };
  });
  return { index, id: 'Fake Pad (STANDARD GAMEPAD)', mapping: 'standard', connected: true, buttons: list, axes };
}

// ---- bindings ----------------------------------------------------------------------------------

test('defaults: every action bound on keyboard and gamepad, within limits, no conflicts', () => {
  const b = defaultBindings();
  for (const a of ALL_ACTIONS) {
    assert.ok(familySlots(b, a, 'keyboard').length >= 1, `${a} has no keyboard binding`);
    assert.ok(familySlots(b, a, 'gamepad').length >= 1, `${a} has no gamepad binding`);
    for (const fam of ['keyboard', 'gamepad']) assert.ok(familySlots(b, a, fam).length <= MAX_PER_FAMILY, `${a} ${fam}`);
  }
  assert.deepEqual(findConflicts(b), []);
  assert.deepEqual(resolveBindings(null), b);
});

test('resolveBindings fills missing actions, drops junk, duplicates and over-limit entries', () => {
  const stored = {
    [A.JUMP]: [{ device: 'key', code: 'KeyK' }, { device: 'key', code: 'KeyK' }, { device: 'bogus' },
      { device: 'key', code: 'KeyL' }, { device: 'mouse', button: 1 }, { device: 'pad', button: 0 }],
    notAnAction: [{ device: 'key', code: 'KeyZ' }],
  };
  const r = resolveBindings(stored);
  assert.deepEqual(r[A.JUMP], [{ device: 'key', code: 'KeyK' }, { device: 'key', code: 'KeyL' }, { device: 'pad', button: 0 }]);
  assert.deepEqual(r[A.THROW], defaultBindings()[A.THROW]);
  assert.equal(r.notAnAction, undefined);
});

test('setBindingSlot replaces within a family, appends, and dedupes; clearBindingSlot removes', () => {
  let b = defaultBindings();
  b = setBindingSlot(b, A.JUMP, 0, { device: 'key', code: 'KeyK' });
  assert.deepEqual(b[A.JUMP], [{ device: 'key', code: 'KeyK' }, { device: 'pad', button: 0 }]);
  b = setBindingSlot(b, A.JUMP, 1, { device: 'mouse', button: 3 });
  assert.deepEqual(familySlots(b, A.JUMP, 'keyboard'), [{ device: 'key', code: 'KeyK' }, { device: 'mouse', button: 3 }]);
  b = setBindingSlot(b, A.JUMP, 5, { device: 'key', code: 'KeyJ' }); // past the end of a full family: replaces the last
  assert.deepEqual(familySlots(b, A.JUMP, 'keyboard').map((x) => x.code ?? x.button), ['KeyK', 'KeyJ']);
  b = setBindingSlot(b, A.JUMP, 1, { device: 'key', code: 'KeyK' }); // same key into slot 1: the slot-0 copy goes
  assert.deepEqual(familySlots(b, A.JUMP, 'keyboard'), [{ device: 'key', code: 'KeyK' }]);
  b = setBindingSlot(b, A.JUMP, 1, { device: 'pad-axis', axis: 3, sign: -1 });
  assert.deepEqual(familySlots(b, A.JUMP, 'gamepad'), [{ device: 'pad', button: 0 }, { device: 'pad-axis', axis: 3, sign: -1 }]);
  b = clearBindingSlot(b, A.JUMP, 'gamepad', 0);
  assert.deepEqual(familySlots(b, A.JUMP, 'gamepad'), [{ device: 'pad-axis', axis: 3, sign: -1 }]);
  assert.throws(() => setBindingSlot(b, A.JUMP, 0, { device: 'key' }));
});

test('conflicts: same input on two actions of one group; cross-group overlaps are fine', () => {
  let b = setBindingSlot(defaultBindings(), A.THROW, 0, { device: 'key', code: 'KeyE' }); // E is INTERACT too
  const c = findConflicts(b);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].binding, { device: 'key', code: 'KeyE' });
  assert.deepEqual(c[0].actions.sort(), [A.INTERACT, A.THROW].sort());
  assert.equal(c[0].group, 'gameplay');
  // E is also UI_TAB_NEXT, and W is MOVE_FORWARD and UI_UP: different groups, not conflicts.
  assert.ok(!c.some((x) => x.group === 'ui'));
});

// ---- analog ------------------------------------------------------------------------------------

test('radial deadzone: zero inside, rescaled outside, capped at 1, diagonals not clipped', () => {
  assert.deepEqual(radialDeadzone(0.1, 0.1, 0.2), { x: 0, y: 0 });
  const edge = radialDeadzone(0.2001, 0, 0.2);
  assert.ok(edge.x > 0 && edge.x < 0.001);
  close(radialDeadzone(0.6, 0, 0.2).x, 0.5);
  const full = radialDeadzone(1, 1, 0.2); // pads overshoot on diagonals
  close(Math.hypot(full.x, full.y), 1);
  close(full.x, full.y);
  // A diagonal whose components are each under the deadzone still counts (a per-axis zone would drop it).
  const diag = radialDeadzone(0.17, 0.17, 0.18);
  assert.ok(diag.x > 0 && diag.y > 0);
});

test('response curve and shaped stick keep direction, bend magnitude', () => {
  close(responseCurve(0.5, 2), 0.25);
  close(responseCurve(1, 2), 1);
  close(responseCurve(2, 2), 1);
  const s = shapeStick(0.6, 0, { deadzone: 0.2, exponent: 2 });
  close(s.x, 0.25);
  close(s.y, 0);
  const d = shapeStick(-0.6, 0.6, { deadzone: 0, exponent: 2 });
  close(d.x, -d.y);
  const c = clampLength(1, 1);
  close(Math.hypot(c.x, c.y), 1);
});

test('repeat timer: first frame, then delay, then interval; release resets', () => {
  const r = createRepeat({ delay: 0.35, interval: 0.09 });
  const fires = [];
  for (let i = 0; i < 60; i++) if (r.step(true, 1 / 100)) fires.push(i); // 0.6 s at 100 fps
  assert.equal(fires[0], 0);
  assert.ok(fires[1] >= 34 && fires[1] <= 36, `second at ${fires[1]}`);
  assert.ok(fires[2] - fires[1] >= 8 && fires[2] - fires[1] <= 10, `gap ${fires[2] - fires[1]}`);
  assert.equal(r.step(false, 0.01), false);
  assert.equal(r.step(true, 0.01), true);
  assert.equal(r.step(true, 1), true); // a long frame pulses once, not many times
  assert.equal(r.step(true, 0.001), false);
});

// ---- labels ------------------------------------------------------------------------------------

test('labels for keys, mouse, pad, and per device', () => {
  assert.equal(keyLabel('KeyE'), 'E');
  assert.equal(keyLabel('Digit3'), '3');
  assert.equal(keyLabel('Space'), 'Space');
  assert.equal(keyLabel('ShiftLeft'), 'Shift');
  assert.equal(keyLabel('Escape'), 'Esc');
  assert.equal(keyLabel('ArrowUp'), '↑');
  assert.equal(keyLabel('KeyW', new Map([['KeyW', 'z']])), 'Z'); // AZERTY layout map
  assert.equal(bindingLabel({ device: 'mouse', button: 0 }), 'Click');
  assert.equal(bindingLabel({ device: 'pad', button: PAD.A }), '(A)');
  assert.equal(bindingLabel({ device: 'pad', button: PAD.RT }), 'RT');
  assert.equal(padAxisLabel(1, -1), 'L-Stick ↑');
  const b = defaultBindings();
  assert.equal(labelForAction(b, A.INTERACT, 'keyboard'), 'E');
  assert.equal(labelForAction(b, A.INTERACT, 'gamepad'), '(X)');
  assert.equal(labelForAction(b, A.UI_UP, 'gamepad'), 'D-pad ↑'); // a button beats the stick
  const noPad = { ...b, [A.THROW]: [{ device: 'key', code: 'KeyF' }] };
  assert.equal(labelForAction(noPad, A.THROW, 'gamepad'), 'F'); // falls back to the other family
  assert.equal(labelForAction({ ...b, [A.THROW]: [] }, A.THROW, 'gamepad'), '—');
});

// ---- core: keyboard ----------------------------------------------------------------------------

test('edges: pressed one frame, held while down, released one frame; OS repeats ignored', () => {
  const inp = createInputCore();
  inp.keyDown('Space');
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.JUMP), true);
  assert.equal(inp.held(A.JUMP), true);
  inp.keyDown('Space', true); // auto-repeat
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.JUMP), false);
  assert.equal(inp.held(A.JUMP), true);
  inp.keyUp('Space');
  inp.update(1 / 60);
  assert.equal(inp.held(A.JUMP), false);
  assert.equal(inp.released(A.JUMP), true);
  inp.update(1 / 60);
  assert.equal(inp.released(A.JUMP), false);
});

test('a tap inside one frame still counts as a press', () => {
  const inp = createInputCore();
  inp.keyDown('KeyE');
  inp.keyUp('KeyE');
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.INTERACT), true);
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.INTERACT), false);
  assert.equal(inp.released(A.INTERACT), true);
});

test('blur clears held keys', () => {
  const inp = createInputCore();
  inp.keyDown('KeyW');
  inp.keyDown('ShiftLeft');
  inp.update(1 / 60);
  assert.equal(inp.held(A.RUN), true);
  close(inp.axis2('move').y, 1);
  inp.clearHeld();
  inp.update(1 / 60);
  assert.equal(inp.held(A.RUN), false);
  assert.equal(inp.released(A.RUN), true);
  assert.deepEqual(inp.axis2('move'), { x: 0, y: 0 });
});

test('move axis: WASD diagonals normalized; arrows too', () => {
  const inp = createInputCore();
  inp.keyDown('KeyW');
  inp.keyDown('KeyD');
  inp.update(1 / 60);
  const m = inp.axis2('move');
  close(m.x, Math.SQRT1_2);
  close(m.y, Math.SQRT1_2);
  inp.keyUp('KeyW'); inp.keyUp('KeyD');
  inp.keyDown('ArrowLeft');
  inp.update(1 / 60);
  assert.deepEqual(inp.axis2('move'), { x: -1, y: 0 });
});

test('mouse look: scaled by sensitivity, not by dt; invertY flips pitch', () => {
  const settings = { ...defaultSettings(), mouseSensitivity: 2 };
  const inp = createInputCore({ settings });
  inp.mouseMove(10, 5);
  inp.mouseMove(10, 5);
  inp.update(1 / 30);
  const l = inp.axis2('look');
  close(l.x, 20 * MOUSE_LOOK_SCALE * 2);
  close(l.y, -10 * MOUSE_LOOK_SCALE * 2);
  inp.update(1 / 30);
  assert.deepEqual(inp.axis2('look'), { x: 0, y: 0 }); // deltas are per frame
  inp.setSettings({ ...settings, invertY: true });
  inp.mouseMove(0, 5);
  inp.update(1 / 144);
  close(inp.axis2('look').y, 5 * MOUSE_LOOK_SCALE * 2);
  inp.mouseMove(9000, 0); // a browser glitch spike is dropped
  inp.update(1 / 60);
  assert.equal(inp.axis2('look').x, 0);
});

test('jump buffer: consumed once, expires after the window', () => {
  const inp = createInputCore();
  inp.keyDown('Space');
  inp.update(1 / 60);
  inp.keyUp('Space');
  inp.update(0.05);
  inp.update(0.05); // 0.1 s after the press
  assert.equal(inp.consumeBuffered(A.JUMP, 0.15), true);
  assert.equal(inp.consumeBuffered(A.JUMP, 0.15), false);
  inp.keyDown('Space');
  inp.update(1 / 60);
  inp.keyUp('Space');
  for (let i = 0; i < 12; i++) inp.update(1 / 60); // 0.2 s later
  assert.equal(inp.consumeBuffered(A.JUMP, 0.15), false);
});

// ---- core: gamepad -----------------------------------------------------------------------------

test('gamepad: buttons map to actions, last device switches, labels follow', () => {
  const inp = createInputCore();
  inp.keyDown('KeyE');
  inp.update(1 / 60, []);
  assert.equal(inp.lastDevice, 'keyboard');
  assert.equal(inp.labelFor(A.INTERACT), 'E');
  inp.keyUp('KeyE');
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.A]: 1 } })]);
  assert.equal(inp.lastDevice, 'gamepad');
  assert.equal(inp.pressed(A.JUMP), true);
  assert.equal(inp.labelFor(A.INTERACT), '(X)');
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.A]: 1 } })]);
  assert.equal(inp.pressed(A.JUMP), false);
  assert.equal(inp.held(A.JUMP), true);
  inp.update(1 / 60, [fakePad()]);
  assert.equal(inp.released(A.JUMP), true);
  // analog trigger past half counts as a press
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.RT]: 0.8 } })]);
  assert.equal(inp.pressed(A.INTERACT), true);
});

test('gamepad move: radial deadzone with rescale from the left stick', () => {
  const settings = { ...defaultSettings(), gamepadDeadzone: 0.2 };
  const inp = createInputCore({ settings });
  inp.update(1 / 60, [fakePad({ axes: [0.1, -0.1, 0, 0] })]); // drift
  assert.deepEqual(inp.axis2('move'), { x: 0, y: 0 });
  inp.update(1 / 60, [fakePad({ axes: [0, -0.6, 0, 0] })]); // half way up (after rescale)
  const m = inp.axis2('move');
  close(m.x, 0);
  close(m.y, 0.5);
  inp.update(1 / 60, [fakePad({ axes: [1, 1, 0, 0] })]);
  const d = inp.axis2('move');
  close(Math.hypot(d.x, d.y), 1);
  assert.ok(d.x > 0 && d.y < 0); // right and back
  assert.equal(inp.held(A.MOVE_RIGHT), true); // sticks also drive the digital actions
});

test('gamepad look: curve, dt, lookSensitivityPad, pitch scale, invertY', () => {
  const settings = { ...defaultSettings(), gamepadDeadzone: 0, lookSensitivityPad: 1.5 };
  const inp = createInputCore({ settings });
  inp.update(0.02, [fakePad({ axes: [0, 0, 0.5, 0] })]);
  close(inp.axis2('look').x, 0.25 * PAD_LOOK_SPEED * 1.5 * 0.02); // 0.5^2
  inp.update(0.04, [fakePad({ axes: [0, 0, 0, -1] })]); // stick up = look up
  close(inp.axis2('look').y, PAD_LOOK_SPEED * PAD_PITCH_SCALE * 1.5 * 0.04);
  inp.setSettings({ ...settings, invertY: true });
  inp.update(0.04, [fakePad({ axes: [0, 0, 0, -1] })]);
  close(inp.axis2('look').y, -PAD_LOOK_SPEED * PAD_PITCH_SCALE * 1.5 * 0.04);
});

test('menu repeat: held d-pad pulses after 0.35 s then every 0.09 s', () => {
  const inp = createInputCore();
  inp.setContext('menu');
  const down = [fakePad({ buttons: { [PAD.DOWN]: 1 } })];
  let pulses = 0;
  const times = [];
  for (let i = 0; i < 60; i++) { // 0.6 s at 100 fps
    inp.update(0.01, down);
    if (inp.pressed(A.UI_DOWN)) { pulses++; times.push(i); }
  }
  assert.equal(times[0], 0);
  assert.ok(times[1] >= 34 && times[1] <= 36, `${times}`);
  assert.ok(pulses >= 4 && pulses <= 5, `${pulses} pulses`);
});

test('menu stick: a diagonal picks the stronger axis; hysteresis keeps it held', () => {
  const inp = createInputCore();
  inp.setContext('menu');
  inp.update(0.01, [fakePad({ axes: [0.55, 0.8, 0, 0] })]);
  assert.equal(inp.pressed(A.UI_DOWN), true);
  assert.equal(inp.pressed(A.UI_RIGHT), false);
  inp.update(0.01, [fakePad({ axes: [0, 0.4, 0, 0] })]); // below press, above release
  assert.equal(inp.held(A.UI_DOWN), true);
  inp.update(0.01, [fakePad({ axes: [0, 0.3, 0, 0] })]);
  assert.equal(inp.held(A.UI_DOWN), false);
});

// ---- core: contexts ----------------------------------------------------------------------------

test('contexts: menu blocks gameplay actions and axes, allows UI; held inputs swallowed across switches', () => {
  const inp = createInputCore();
  inp.keyDown('Escape');
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.PAUSE), true);
  assert.equal(inp.pressed(A.UI_BACK), false); // UI actions are off in gameplay
  inp.setContext('menu');
  // Same frame, after the switch: the Escape that opened the menu must not also close it.
  assert.equal(inp.pressed(A.UI_BACK), false);
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.UI_BACK), false);
  assert.equal(inp.held(A.UI_BACK), false); // still physically held: swallowed until released
  inp.keyUp('Escape');
  inp.update(1 / 60);
  assert.equal(inp.released(A.UI_BACK), false);
  inp.keyDown('KeyW');
  inp.mouseMove(30, 0);
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.UI_UP), true);
  assert.equal(inp.held(A.MOVE_FORWARD), false);
  assert.deepEqual(inp.axis2('move'), { x: 0, y: 0 });
  assert.deepEqual(inp.axis2('look'), { x: 0, y: 0 });
  assert.equal(inp.held(A.MOVE_FORWARD, { anyContext: true }), true); // toggle keys can opt in
  inp.setContext('gameplay');
  inp.update(1 / 60);
  assert.equal(inp.held(A.MOVE_FORWARD), false); // W from the menu does not walk until re-pressed
  inp.keyUp('KeyW');
  inp.keyDown('KeyW');
  inp.update(1 / 60);
  assert.equal(inp.held(A.MOVE_FORWARD), true);
  assert.equal(inp.consumeBuffered(A.JUMP), false);
});

test('Escape and Start always pause/back even when rebound away', () => {
  const inp = createInputCore();
  inp.setBinding(A.PAUSE, 0, { device: 'key', code: 'KeyO' });
  inp.setBinding(A.PAUSE, 1, { device: 'key', code: 'KeyP' });
  assert.ok(!inp.getBindings()[A.PAUSE].some((b) => b.code === 'Escape'));
  inp.keyDown('Escape');
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.PAUSE), true);
  inp.keyUp('Escape');
  inp.setContext('menu');
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.START]: 1 } })]);
  assert.equal(inp.pressed(A.UI_BACK), true);
});

// ---- core: rebinding ---------------------------------------------------------------------------

test('rebind: captures the next key into the slot, emits settings, Escape cancels', async () => {
  const changed = [];
  const settings = defaultSettings();
  const inp = createInputCore({ settings, onBindingsChanged: (s) => changed.push(structuredClone(s.bindings)) });
  const p = inp.startCapture(A.JUMP, 0);
  inp.keyDown('KeyK', true); // repeats are not captured
  assert.ok(inp.capturing);
  inp.keyDown('KeyK');
  assert.deepEqual(await p, { device: 'key', code: 'KeyK' });
  assert.equal(inp.capturing, null);
  assert.deepEqual(settings.bindings[A.JUMP][0], { device: 'key', code: 'KeyK' });
  assert.equal(changed.length, 1);
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.JUMP), false); // the captured press does not also jump
  inp.keyUp('KeyK');
  inp.keyDown('KeyK');
  inp.update(1 / 60);
  assert.equal(inp.pressed(A.JUMP), true);
  inp.keyUp('KeyK');

  const q = inp.startCapture(A.THROW, 0);
  inp.keyDown('Escape');
  assert.equal(await q, null);
  assert.equal(changed.length, 1);
  assert.deepEqual(inp.getBindings()[A.THROW], defaultBindings()[A.THROW]);
});

test('rebind: gamepad buttons and stick directions; held buttons ignored; family filter; Start cancels', async () => {
  const inp = createInputCore();
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.A]: 1 } })]); // A held (it pressed the menu button)
  const p = inp.startCapture(A.THROW, 0, { device: 'gamepad' });
  inp.keyDown('KeyG'); // keyboard ignored for a gamepad slot
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.A]: 1 } })]);
  assert.ok(inp.capturing, 'still-held A is not captured');
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.A]: 1, [PAD.R3]: 1 } })]);
  assert.deepEqual(await p, { device: 'pad', button: PAD.R3 });
  assert.deepEqual(inp.getBindings()[A.THROW], [{ device: 'key', code: 'KeyF' }, { device: 'pad', button: PAD.R3 }]);
  assert.equal(inp.pressed(A.THROW), false); // the capturing press does not throw
  inp.keyUp('KeyG');

  const q = inp.startCapture(A.THROW, 1);
  inp.update(1 / 60, [fakePad({ axes: [0, 0, 0, 0.9] })]);
  assert.deepEqual(await q, { device: 'pad-axis', axis: 3, sign: 1 });

  inp.update(1 / 60, [fakePad()]);
  const r = inp.startCapture(A.THROW, 0);
  inp.update(1 / 60, [fakePad({ buttons: { [PAD.START]: 1 } })]);
  assert.equal(await r, null);
});

test('rebind into a conflict is allowed and reported; reset restores defaults', async () => {
  const events = [];
  const settings = defaultSettings();
  const inp = createInputCore({ settings, onBindingsChanged: (s) => events.push(s.bindings) });
  const p = inp.startCapture(A.THROW, 0, { device: 'keyboard' });
  inp.keyDown('KeyE');
  await p;
  const c = inp.conflicts();
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].actions.sort(), [A.INTERACT, A.THROW].sort());
  inp.resetBindings();
  assert.equal(settings.bindings, null);
  assert.deepEqual(inp.conflicts(), []);
  assert.deepEqual(inp.getBindings(), defaultBindings());
  assert.equal(events.length, 2);
});

test('settings.bindings round-trip: stored table is honoured by a new input', () => {
  const settings = defaultSettings();
  const a = createInputCore({ settings });
  a.setBinding(A.JUMP, 0, { device: 'key', code: 'KeyH' });
  const saved = JSON.parse(JSON.stringify(settings));
  const b = createInputCore({ settings: saved });
  b.keyDown('KeyH');
  b.update(1 / 60);
  assert.equal(b.pressed(A.JUMP), true);
  b.keyUp('KeyH');
  b.keyDown('Space');
  b.update(1 / 60);
  assert.equal(b.pressed(A.JUMP), false);
});

// ---- browser shell with fake DOM ---------------------------------------------------------------

function fakeBrowser() {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null, visibilityState: 'visible',
    exitPointerLock() { this.pointerLockElement = null; this.dispatchEvent(new Event('pointerlockchange')); },
  });
  const dom = Object.assign(new EventTarget(), {
    requestPointerLock() { doc.pointerLockElement = dom; doc.dispatchEvent(new Event('pointerlockchange')); },
  });
  const ev = (type, props = {}) => Object.assign(new Event(type, { cancelable: true }), props);
  const key = (type, code, extra = {}) => { const e = ev(type, { code, repeat: false, ...extra }); target.dispatchEvent(e); return e; };
  return { target, doc, dom, ev, key };
}

test('createInput: DOM keys, e.repeat, preventDefault, blur, SETTINGS_CHANGED', async () => {
  const b = fakeBrowser();
  const bus = createEvents();
  const got = [];
  bus.on(EVENTS.SETTINGS_CHANGED, (p) => got.push(p));
  let pads = [];
  const input = createInput({ dom: b.dom, events: bus, settings: defaultSettings(), target: b.target, doc: b.doc, getGamepads: () => pads });
  const e = b.key('keydown', 'Space');
  assert.equal(e.defaultPrevented, true); // Space would scroll the page
  input.update(1 / 60);
  assert.equal(input.pressed(A.JUMP), true);
  b.key('keydown', 'Space', { repeat: true });
  input.update(1 / 60);
  assert.equal(input.pressed(A.JUMP), false);
  assert.equal(b.key('keydown', 'KeyR', { ctrlKey: true }).defaultPrevented, false); // Ctrl+R still reloads
  b.target.dispatchEvent(new Event('blur'));
  input.update(1 / 60);
  assert.equal(input.held(A.JUMP), false);

  pads = [fakePad({ buttons: { [PAD.X]: 1 } })];
  input.update(1 / 60);
  assert.equal(input.lastDevice, 'gamepad');
  assert.equal(input.labelFor(A.INTERACT), '(X)');
  assert.equal(input.labelFor(A.INTERACT, 'keyboard'), 'E');
  pads = [];

  input.setContext('menu');
  const p = input.startRebind(A.JOURNAL, 0);
  b.key('keydown', 'KeyN');
  assert.deepEqual(await p, { device: 'key', code: 'KeyN' });
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].settings.bindings[A.JOURNAL][0], { device: 'key', code: 'KeyN' });
  input.resetBindings();
  assert.equal(got.length, 2);
  assert.equal(got[1].settings.bindings, null);
  input.dispose();
  b.key('keydown', 'KeyE');
  input.update(1 / 60);
  assert.equal(input.held(A.UI_TAB_NEXT), false);
});

test('createInput: pointer lock follows context; mouse buttons only while locked; lost lock pauses', () => {
  const b = fakeBrowser();
  const input = createInput({ dom: b.dom, settings: defaultSettings(), target: b.target, doc: b.doc, getGamepads: () => [] });
  b.target.dispatchEvent(b.ev('mousedown', { button: 0 }));
  input.update(1 / 60);
  assert.equal(input.pressed(A.INTERACT), false); // not locked: a click is the page's
  b.target.dispatchEvent(b.ev('mouseup', { button: 0 }));
  input.lockPointer();
  assert.equal(input.pointerLocked, true);
  b.target.dispatchEvent(b.ev('mousedown', { button: 0 }));
  b.target.dispatchEvent(b.ev('mousemove', { movementX: 10, movementY: 0 }));
  input.update(1 / 60);
  assert.equal(input.pressed(A.INTERACT), true);
  close(input.axis2('look').x, 10 * MOUSE_LOOK_SCALE);
  b.target.dispatchEvent(b.ev('mouseup', { button: 0 }));

  input.setContext('menu');
  assert.equal(input.pointerLocked, false);
  input.update(1 / 60);
  assert.equal(input.pressed(A.PAUSE, { anyContext: true }), false); // our own unlock is not a pause
  input.setContext('gameplay');
  assert.equal(input.pointerLocked, true);
  b.doc.pointerLockElement = null; // the browser drops the lock (player pressed Escape)
  b.doc.dispatchEvent(new Event('pointerlockchange'));
  input.update(1 / 60);
  assert.equal(input.pressed(A.PAUSE), true);
  input.dispose();
});

test('touch: stick moves, drag looks, buttons press and hold, all gated by context', () => {
  const core = createInputCore({ settings: defaultSettings() });
  core.update(0.016);
  core.touchStick(0, 1);
  core.touchLook(100, -50);
  core.touchAction(ACTIONS.JUMP, true);
  core.update(0.016);
  assert.deepEqual(core.axis2('move'), { x: 0, y: 1 });
  const look = core.axis2('look');
  assert.ok(Math.abs(look.x - 100 * TOUCH_LOOK_SCALE) < 1e-9);
  assert.ok(Math.abs(look.y - 50 * TOUCH_LOOK_SCALE) < 1e-9, 'dragging up looks up');
  assert.equal(core.pressed(ACTIONS.JUMP), true);
  assert.equal(core.lastDevice, 'touch');
  assert.equal(core.labelFor(ACTIONS.INTERACT), '✋');
  core.update(0.016);
  assert.equal(core.pressed(ACTIONS.JUMP), false);
  assert.equal(core.held(ACTIONS.JUMP), true, 'a held button stays held');
  assert.deepEqual(core.axis2('look'), { x: 0, y: 0 }, 'look drag is per frame');
  core.touchAction(ACTIONS.JUMP, false);
  core.update(0.016);
  assert.equal(core.released(ACTIONS.JUMP), true);
  // A tap shorter than a frame still presses.
  core.touchAction(ACTIONS.INTERACT, true);
  core.touchAction(ACTIONS.INTERACT, false);
  core.update(0.016);
  assert.equal(core.pressed(ACTIONS.INTERACT), true);
  // Menus: the stick does not move the player; leaving gameplay drops touch state.
  core.touchStick(1, 0);
  core.setContext('menu');
  core.update(0.016);
  assert.deepEqual(core.axis2('move'), { x: 0, y: 0 });
  core.setContext('gameplay');
  core.update(0.016);
  assert.deepEqual(core.axis2('move'), { x: 0, y: 0 }, 'the stick was released by the context change');
});
