// The input state machine, with no DOM: raw device events and gamepad snapshots in, per-frame action
// state out. src/game/input/index.js feeds it from the browser; tests feed it fake events directly.
//
// Frame model: device events between frames are latched (a key pressed and released inside one frame
// still counts as one press); update(dt, pads) turns them into pressed/held/released per action, so
// every system reading input during a frame sees the same answer.
import { defaultSettings } from '../core/contracts.js';
import {
  ALL_ACTIONS, MOVE_ACTIONS, UI_NAV_ACTIONS, RESERVED, RESERVED_ACTIONS, groupOf, isReserved,
  resolveBindings, cloneBindings, setBindingSlot, clearBindingSlot, findConflicts, sameBinding,
  defaultBindings, PAD,
} from './bindings.js';
import { radialDeadzone, shapeStick, clampLength, createRepeat } from './analog.js';
import { labelForAction, touchLabel } from './labels.js';

export const CONTEXTS = ['gameplay', 'menu', 'dialogue'];
/** Radians of turn per pixel of mouse movement at mouseSensitivity 1 (never scaled by dt). */
export const MOUSE_LOOK_SCALE = 0.0022;
/** Radians per CSS pixel of a touch look drag (a swipe across a phone turns about half round). */
export const TOUCH_LOOK_SCALE = 0.0045;
/** Gamepad look: radians per second at full deflection, lookSensitivityPad 1 (scaled by dt). */
export const PAD_LOOK_SPEED = 3.0;
/** Pitch turns slower than yaw on a stick (comfortable; the screen is wider than tall). */
export const PAD_PITCH_SCALE = 0.75;
/** Look response curve exponent (finer aim near the centre). Movement stays linear. */
export const LOOK_EXPONENT = 2;
/** Stick-as-button thresholds, with hysteresis so a stick resting near the line does not chatter. */
export const AXIS_PRESS = 0.5;
export const AXIS_RELEASE = 0.35;
export const BUTTON_PRESS = 0.5;
/** How far an axis must move from rest to be captured by a rebind. */
export const CAPTURE_AXIS = 0.6;
/** Mouse deltas this large in one event are browser glitches (seen right after pointer lock). */
export const MOUSE_SPIKE = 500;
/** UI repeat timing (seconds). */
export const UI_REPEAT = { delay: 0.35, interval: 0.09 };

/** Plain snapshots from navigator.getGamepads() (or test fakes): buttons as 0..1 values. */
export function normalizePads(list) {
  const out = [];
  for (const p of list ?? []) {
    if (!p || p.connected === false) continue;
    const buttons = Array.from(p.buttons ?? [], (b) => {
      if (typeof b === 'number') return b;
      const v = typeof b?.value === 'number' ? b.value : 0;
      return b?.pressed && v < BUTTON_PRESS ? 1 : v;
    });
    out.push({ index: p.index ?? out.length, id: p.id ?? '', mapping: p.mapping ?? '', buttons, axes: Array.from(p.axes ?? [], Number) });
  }
  return out;
}

const padActivity = (p) => p.buttons.some((v) => v > BUTTON_PRESS)
  || Math.hypot(p.axes[0] ?? 0, p.axes[1] ?? 0) > AXIS_PRESS || Math.hypot(p.axes[2] ?? 0, p.axes[3] ?? 0) > AXIS_PRESS;

export function createInputCore({ settings = null, onBindingsChanged = () => {} } = {}) {
  const DEFAULTS = defaultSettings();
  let settingsRef = settings ?? defaultSettings();
  let bindings = resolveBindings(settingsRef.bindings);
  let context = 'gameplay';
  let lastDevice = 'keyboard';
  let now = 0;

  // Device state (between frames).
  const keys = new Set();
  const keyDowns = new Set();
  const buttons = new Set();
  const buttonDowns = new Set();
  const virtual = new Set();
  // Touch (the on-screen controls, ./touch.js): a stick vector, a look drag in CSS pixels, and
  // actions held by on-screen buttons (a tap shorter than a frame still counts as a press).
  const touchHeld = new Set();
  const touchDowns = new Set();
  let touchMove = { x: 0, y: 0 };
  let touchDX = 0;
  let touchDY = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let pad = null;
  let activePadIndex = -1;
  let prevPadButtons = [];
  // Inputs ignored until they are released (after a context change or a rebind), by id.
  const latched = new Set();

  // Frame state.
  const raw = {};
  for (const a of ALL_ACTIONS) raw[a] = { held: false, pressed: false, released: false, digital: false };
  const repeats = Object.fromEntries(UI_NAV_ACTIONS.map((a) => [a, createRepeat(UI_REPEAT)]));
  const repeatFired = new Set();
  const lastPressedAt = {};
  let move = { x: 0, y: 0 };
  let look = { x: 0, y: 0 };
  let capture = null;

  const num = (k) => (typeof settingsRef?.[k] === 'number' && Number.isFinite(settingsRef[k]) ? settingsRef[k] : DEFAULTS[k]);
  const contextAllows = (a) => (context === 'gameplay' ? groupOf(a) === 'gameplay' : groupOf(a) === 'ui');
  const allowed = (a, anyContext = false) => !capture && (anyContext || contextAllows(a));

  // ---- device events -------------------------------------------------------------------------

  /** Returns true when the key is bound to something (the shell then calls preventDefault). */
  function keyDown(code, repeat = false) {
    if (!code) return false;
    lastDevice = 'keyboard';
    if (repeat) return isKeyBound(code); // OS auto-repeat never makes a new press
    if (capture) {
      if (code === 'Escape') finishCapture(null);
      else if (capture.family !== 'gamepad') finishCapture({ device: 'key', code });
      return true;
    }
    keys.add(code);
    keyDowns.add(code);
    return isKeyBound(code);
  }
  function keyUp(code) {
    keys.delete(code);
    latched.delete(`key:${code}`);
  }
  function mouseDown(button) {
    lastDevice = 'keyboard';
    if (capture) {
      if (capture.family !== 'gamepad') finishCapture({ device: 'mouse', button });
      return;
    }
    buttons.add(button);
    buttonDowns.add(button);
  }
  function mouseUp(button) {
    buttons.delete(button);
    latched.delete(`mouse:${button}`);
  }
  function mouseMove(dx, dy) {
    if (Math.abs(dx) > MOUSE_SPIKE || Math.abs(dy) > MOUSE_SPIKE) return;
    mouseDX += dx || 0;
    mouseDY += dy || 0;
    if (Math.abs(dx) + Math.abs(dy) > 2) lastDevice = 'keyboard';
  }
  /** Window blur / tab hidden: everything held is let go (released edges on the next update). */
  function clearHeld() {
    keys.clear(); buttons.clear(); keyDowns.clear(); buttonDowns.clear();
    touchHeld.clear(); touchDowns.clear(); touchMove = { x: 0, y: 0 }; touchDX = 0; touchDY = 0;
    mouseDX = 0; mouseDY = 0;
    for (const id of [...latched]) if (id.startsWith('key:') || id.startsWith('mouse:')) latched.delete(id);
  }
  /** A press that comes from no binding (e.g. PAUSE when the browser drops pointer lock). */
  const virtualPress = (action) => virtual.add(action);

  /** Touch: the on-screen stick, x right / y forward, length <= 1 (0, 0 when released). */
  function touchStick(x, y) {
    touchMove = clampLength(Number(x) || 0, Number(y) || 0);
    if (touchMove.x || touchMove.y) lastDevice = 'touch';
  }
  /** Touch: a look drag in CSS pixels (accumulated until the next update). */
  function touchLook(dx, dy) {
    touchDX += Number(dx) || 0;
    touchDY += Number(dy) || 0;
    lastDevice = 'touch';
  }
  /** Touch: an on-screen button holding (true) or letting go of (false) an action. */
  function touchAction(action, down) {
    if (!raw[action]) return;
    if (down) { touchHeld.add(action); touchDowns.add(action); lastDevice = 'touch'; } else touchHeld.delete(action);
  }

  const isKeyBound = (code) => code === 'Escape' || ALL_ACTIONS.some((a) => bindings[a].some((b) => b.device === 'key' && b.code === code));

  // ---- frame ---------------------------------------------------------------------------------

  const padButton = (i) => pad?.buttons[i] ?? 0;
  const padAxis = (i) => pad?.axes[i] ?? 0;
  const partnerAxis = (i) => (i % 2 === 0 ? i + 1 : i - 1);

  /** Is one binding active? Latched inputs read as inactive. */
  function bindingState(b, action, prevHeld) {
    switch (b.device) {
      case 'key':
        if (latched.has(`key:${b.code}`)) return 0;
        return keyDowns.has(b.code) ? 2 : keys.has(b.code) ? 1 : 0;
      case 'mouse':
        if (latched.has(`mouse:${b.button}`)) return 0;
        return buttonDowns.has(b.button) ? 2 : buttons.has(b.button) ? 1 : 0;
      case 'pad':
        if (latched.has(`pad:${b.button}`)) return 0;
        return padButton(b.button) > BUTTON_PRESS ? 1 : 0;
      case 'pad-axis': {
        if (latched.has(`pad-axis:${b.axis}`)) return 0;
        const v = padAxis(b.axis) * b.sign;
        if (v <= (prevHeld ? AXIS_RELEASE : AXIS_PRESS)) return 0;
        // Menus move one way at a time: a diagonal stick picks its stronger axis.
        if (groupOf(action) === 'ui' && Math.abs(padAxis(b.axis)) < Math.abs(padAxis(partnerAxis(b.axis)))) return 0;
        return 1;
      }
      default: return 0;
    }
  }

  const bindingsFor = (a) => (RESERVED_ACTIONS.includes(a)
    ? [...bindings[a], ...RESERVED.filter((r) => !bindings[a].some((b) => sameBinding(b, r)))]
    : bindings[a]);

  function update(dt = 0, pads = []) {
    dt = Math.max(0, Number(dt) || 0);
    now += dt;

    // Pick the pad: the one that last showed activity, else the first connected.
    const list = normalizePads(pads);
    for (const p of list) if (padActivity(p)) activePadIndex = p.index;
    pad = list.find((p) => p.index === activePadIndex) ?? list[0] ?? null;
    if (pad) {
      const newPress = pad.buttons.some((v, i) => v > BUTTON_PRESS && !((prevPadButtons[i] ?? 0) > BUTTON_PRESS));
      const stick = Math.max(Math.hypot(padAxis(0), padAxis(1)), Math.hypot(padAxis(2), padAxis(3)));
      if (newPress || stick > AXIS_PRESS) lastDevice = 'gamepad';
      if (capture) capturePad();
    }

    // Unlatch inputs that have been let go.
    for (const id of [...latched]) {
      const [kind, rest] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
      if (kind === 'pad' && !(padButton(+rest) > BUTTON_PRESS)) latched.delete(id);
      if (kind === 'pad-axis' && !(Math.abs(padAxis(+rest)) >= AXIS_RELEASE)) latched.delete(id);
    }

    // Raw action state (context is applied at query time, so edges stay true across switches).
    for (const a of ALL_ACTIONS) {
      const prev = raw[a].held;
      let held = false;
      let down = virtual.has(a) || touchDowns.has(a);
      let digital = down || touchHeld.has(a);
      let touching = touchHeld.has(a);
      for (const b of bindingsFor(a)) {
        const s = bindingState(b, a, prev);
        if (s > 0) { held = true; if (b.device !== 'pad-axis') digital = true; }
        if (s === 2) down = true;
      }
      held = held || down || touching;
      raw[a] = { held, pressed: down || (held && !prev), released: prev && !held, digital };
    }

    // Menu repeat pulses.
    repeatFired.clear();
    for (const a of UI_NAV_ACTIONS) {
      if (repeats[a].step(raw[a].held && allowed(a), dt) && !raw[a].pressed) repeatFired.add(a);
    }

    // Buffer timestamps.
    for (const a of ALL_ACTIONS) if (raw[a].pressed && allowed(a)) lastPressedAt[a] = now;

    computeAxes(dt);

    keyDowns.clear(); buttonDowns.clear(); virtual.clear(); touchDowns.clear();
    mouseDX = 0; mouseDY = 0; touchDX = 0; touchDY = 0;
    prevPadButtons = pad ? pad.buttons.slice() : [];
  }

  function computeAxes(dt) {
    move = { x: 0, y: 0 };
    look = { x: 0, y: 0 };
    if (capture || context !== 'gameplay') return;
    const [F, B, L, R] = MOVE_ACTIONS;
    const dig = (a) => (raw[a].digital ? 1 : 0);
    const analog = (a) => {
      let v = 0;
      for (const b of bindings[a]) {
        if (b.device !== 'pad-axis' || latched.has(`pad-axis:${b.axis}`)) continue;
        v = Math.max(v, padAxis(b.axis) * b.sign);
      }
      return v;
    };
    const stick = radialDeadzone(analog(R) - analog(L), analog(F) - analog(B), num('gamepadDeadzone'));
    const m = clampLength(dig(R) - dig(L) + stick.x + touchMove.x, dig(F) - dig(B) + stick.y + touchMove.y);
    move = { x: m.x + 0, y: m.y + 0 };

    const inv = settingsRef?.invertY ? -1 : 1;
    const mk = MOUSE_LOOK_SCALE * num('mouseSensitivity');
    const tk = TOUCH_LOOK_SCALE * num('touchLookSensitivity');
    let x = mouseDX * mk + touchDX * tk;
    let y = -mouseDY * mk - touchDY * tk;
    if (pad) {
      const [ax, ay] = lookAxes();
      if (!latched.has(`pad-axis:${ax}`) && !latched.has(`pad-axis:${ay}`)) {
        const s = shapeStick(padAxis(ax), padAxis(ay), { deadzone: num('gamepadDeadzone'), exponent: LOOK_EXPONENT });
        const k = PAD_LOOK_SPEED * num('lookSensitivityPad') * Math.min(dt, 0.1);
        x += s.x * k;
        y += -s.y * k * PAD_PITCH_SCALE;
      }
    }
    look = { x: x + 0, y: y * inv + 0 }; // + 0 turns -0 into 0
  }

  /** Look uses whichever stick movement does not (right stick by default). */
  function lookAxes() {
    const moveOnRight = MOVE_ACTIONS.some((a) => bindings[a].some((b) => b.device === 'pad-axis' && (b.axis === 2 || b.axis === 3)));
    return moveOnRight ? [0, 1] : [2, 3];
  }

  /** Ignore everything currently held until it is released, and drop this frame's edges. */
  function latchAll() {
    for (const k of keys) latched.add(`key:${k}`);
    for (const b of buttons) latched.add(`mouse:${b}`);
    if (pad) {
      pad.buttons.forEach((v, i) => { if (v > BUTTON_PRESS) latched.add(`pad:${i}`); });
      pad.axes.forEach((v, i) => { if (Math.abs(v) >= AXIS_RELEASE) latched.add(`pad-axis:${i}`); });
    }
    for (const a of ALL_ACTIONS) raw[a] = { held: false, pressed: false, released: false, digital: false };
    touchHeld.clear(); touchDowns.clear(); touchMove = { x: 0, y: 0 }; touchDX = 0; touchDY = 0;
    for (const r of Object.values(repeats)) r.reset();
    repeatFired.clear();
    for (const a of Object.keys(lastPressedAt)) delete lastPressedAt[a];
    move = { x: 0, y: 0 };
    look = { x: 0, y: 0 };
  }

  // ---- rebinding -----------------------------------------------------------------------------

  function startCapture(action, slot = 0, { device = null } = {}) {
    if (capture) finishCapture(null);
    if (!ALL_ACTIONS.includes(action)) return Promise.resolve(null);
    return new Promise((resolve) => {
      capture = { action, slot, family: device === 'keyboard' || device === 'gamepad' ? device : null, resolve,
        baseline: pad ? pad.axes.slice() : [] };
      for (const a of ALL_ACTIONS) raw[a] = { held: false, pressed: false, released: false, digital: false };
    });
  }
  const cancelCapture = () => { if (capture) finishCapture(null); };

  function capturePad() {
    for (let i = 0; i < pad.buttons.length; i++) {
      if (!(pad.buttons[i] > BUTTON_PRESS) || (prevPadButtons[i] ?? 0) > BUTTON_PRESS) continue;
      if (i === PAD.START) return finishCapture(null);
      if (capture.family === 'keyboard') return;
      return finishCapture({ device: 'pad', button: i });
    }
    if (capture.family === 'keyboard') return;
    for (let i = 0; i < pad.axes.length; i++) {
      const v = pad.axes[i];
      const rest = capture.baseline[i] ?? 0;
      if (Math.abs(v) > CAPTURE_AXIS && Math.abs(v - rest) > CAPTURE_AXIS) {
        return finishCapture({ device: 'pad-axis', axis: i, sign: v < 0 ? -1 : 1 });
      }
    }
  }

  function finishCapture(binding) {
    const c = capture;
    capture = null;
    let result = null;
    if (binding && !isReserved(binding)) {
      replaceBindings(setBindingSlot(bindings, c.action, c.slot, binding));
      result = { ...binding };
    }
    latchAll();
    c.resolve(result);
  }

  function replaceBindings(next) {
    bindings = next;
    settingsRef.bindings = cloneBindings(bindings);
    onBindingsChanged(settingsRef);
  }

  // ---- public --------------------------------------------------------------------------------

  return {
    // device events
    keyDown, keyUp, mouseDown, mouseUp, mouseMove, clearHeld, virtualPress, touchStick, touchLook, touchAction,
    update,
    // queries
    pressed: (a, { anyContext = false } = {}) => !!raw[a] && allowed(a, anyContext) && (raw[a].pressed || repeatFired.has(a)),
    held: (a, { anyContext = false } = {}) => !!raw[a] && allowed(a, anyContext) && raw[a].held,
    released: (a, { anyContext = false } = {}) => !!raw[a] && allowed(a, anyContext) && raw[a].released,
    axis2: (name) => (name === 'move' ? { ...move } : name === 'look' ? { ...look } : { x: 0, y: 0 }),
    consumeBuffered(a, windowSec = 0.15) {
      const t = lastPressedAt[a];
      if (t === undefined || !allowed(a) || now - t > windowSec + 1e-9) return false;
      delete lastPressedAt[a];
      return true;
    },
    get lastDevice() { return lastDevice; },
    setLastDevice(d) { if (d === 'keyboard' || d === 'gamepad' || d === 'touch') lastDevice = d; },
    labelFor: (a, { device = lastDevice, layoutMap = null } = {}) => (device === 'touch' ? touchLabel(a) : labelForAction(bindings, a, device, layoutMap)),
    // context
    get context() { return context; },
    setContext(next) {
      if (!CONTEXTS.includes(next)) throw new Error(`unknown input context '${next}'`);
      if (next === context) return false;
      context = next;
      latchAll();
      return true;
    },
    // settings + bindings
    get settings() { return settingsRef; },
    setSettings(s) {
      settingsRef = s ?? defaultSettings();
      bindings = resolveBindings(settingsRef.bindings);
    },
    getBindings: () => cloneBindings(bindings),
    setBinding(action, slot, binding) { replaceBindings(setBindingSlot(bindings, action, slot, binding)); },
    clearBinding(action, family, slot) { replaceBindings(clearBindingSlot(bindings, action, family, slot)); },
    resetBindings() {
      bindings = defaultBindings();
      settingsRef.bindings = null;
      onBindingsChanged(settingsRef);
    },
    conflicts: () => findConflicts(bindings),
    startCapture, cancelCapture,
    get capturing() { return capture ? { action: capture.action, slot: capture.slot, device: capture.family } : null; },
    get time() { return now; },
  };
}
