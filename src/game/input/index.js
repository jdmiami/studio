// Action-based input for keyboard + mouse + gamepad, with contexts, buffering, menu repeat and
// rebinding. Gameplay reads actions (ACTIONS in src/game/core/contracts.js), never raw keys.
// This file is the browser shell: it listens to DOM events, polls the Gamepad API and manages
// pointer lock; the state machine is ./core.js and the tables are ./bindings.js (README.md).
import { ACTIONS, EVENTS } from '../core/contracts.js';
import { createInputCore } from './core.js';

export { createInputCore, normalizePads, CONTEXTS } from './core.js';
export {
  defaultBindings, resolveBindings, findConflicts, setBindingSlot, clearBindingSlot, familyOf, bindingId,
  sameBinding, groupOf, PAD, PAD_AXIS, RESERVED, UI_ACTIONS, GAMEPLAY_ACTIONS, MAX_PER_FAMILY,
} from './bindings.js';
export { radialDeadzone, responseCurve, shapeStick, createRepeat } from './analog.js';
export { bindingLabel, keyLabel, padButtonLabel, labelForAction } from './labels.js';

function defaultGetGamepads() {
  try { return globalThis.navigator?.getGamepads?.() ?? []; } catch { return []; }
}

const isEditable = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? ''));

/**
 * @param {object} o
 * @param {HTMLElement} o.dom          the canvas (pointer-lock target; clicking it locks in gameplay)
 * @param {object} [o.events]          the bus (src/game/core/events.js); gets SETTINGS_CHANGED on rebinds
 * @param {object} [o.settings]        settings object (defaultSettings() shape); bindings are read from
 *                                     and written to settings.bindings
 * @param {EventTarget} [o.target]     where keyboard/mouse listeners go (window)
 * @param {Document} [o.doc]           for pointer lock and visibility (dom.ownerDocument)
 * @param {Function} [o.getGamepads]   () => Gamepad[] (navigator.getGamepads)
 * @param {boolean} [o.autoLock=true]  click the canvas in gameplay to lock the pointer
 * @param {boolean} [o.pauseOnUnlock=true]  losing pointer lock in gameplay (browser Escape) presses PAUSE
 */
export function createInput({
  dom = null, events = null, settings = null,
  target = globalThis.window ?? null,
  doc = dom?.ownerDocument ?? globalThis.document ?? null,
  getGamepads = defaultGetGamepads,
  autoLock = true, pauseOnUnlock = true,
} = {}) {
  const core = createInputCore({
    settings,
    onBindingsChanged: (s) => events?.emit?.(EVENTS.SETTINGS_CHANGED, { settings: s }),
  });

  let layoutMap = null;
  try {
    globalThis.navigator?.keyboard?.getLayoutMap?.().then((m) => { layoutMap = m; }, () => {});
  } catch { /* not supported */ }

  const isLocked = () => !!doc && !!dom && doc.pointerLockElement === dom;
  let locked = isLocked();
  let selfUnlock = false;
  let wantLock = false;
  let disposed = false;

  function lockPointer() {
    if (!dom?.requestPointerLock || isLocked()) return;
    try {
      const p = dom.requestPointerLock();
      p?.catch?.(() => {}); // refused outside a user gesture / right after an Escape exit; next click retries
    } catch { /* ignore */ }
  }
  function unlockPointer() {
    if (!isLocked()) return;
    selfUnlock = true;
    try { doc.exitPointerLock?.(); } catch { /* ignore */ }
  }
  // A key or click is a user gesture: the best moment to retry a lock the browser refused.
  const retryLock = () => {
    if (wantLock && core.context === 'gameplay' && !core.capturing && autoLock) { if (isLocked()) wantLock = false; else lockPointer(); }
  };

  // ---- listeners -----------------------------------------------------------------------------
  const onKeyDown = (e) => {
    if (isEditable(e.target) && !core.capturing) return;
    const capturing = !!core.capturing;
    const bound = core.keyDown(e.code, !!e.repeat);
    if ((capturing || bound) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault?.();
    if (!e.repeat) retryLock();
  };
  const onKeyUp = (e) => core.keyUp(e.code);
  const onMouseDown = (e) => {
    if (core.capturing) { core.mouseDown(e.button); e.preventDefault?.(); return; }
    // Mouse buttons are game input only while the pointer is locked; otherwise clicks belong to
    // the page (menus are DOM, and the click that locks the pointer is not an INTERACT).
    if (isLocked()) core.mouseDown(e.button);
  };
  const onDomMouseDown = (e) => {
    if (core.capturing || core.context !== 'gameplay' || !autoLock || isLocked()) return;
    e.preventDefault?.();
    lockPointer();
  };
  const onMouseUp = (e) => core.mouseUp(e.button);
  const onMouseMove = (e) => { if (isLocked()) core.mouseMove(e.movementX ?? 0, e.movementY ?? 0); };
  const onContextMenu = (e) => { if (isLocked() || core.capturing) e.preventDefault?.(); };
  const onBlur = () => core.clearHeld();
  const onVisibility = () => { if (doc?.visibilityState === 'hidden') core.clearHeld(); };
  const onLockChange = () => {
    const now = isLocked();
    if (locked && !now) {
      core.clearHeld();
      if (selfUnlock) selfUnlock = false;
      else if (pauseOnUnlock && core.context === 'gameplay') core.virtualPress(ACTIONS.PAUSE);
    }
    if (now) wantLock = false;
    locked = now;
  };
  const onPadDisconnected = () => {
    const pads = [...(getGamepads() ?? [])].filter((p) => p && p.connected !== false);
    if (!pads.length) core.setLastDevice('keyboard');
  };

  const listen = [
    [target, 'keydown', onKeyDown], [target, 'keyup', onKeyUp],
    [target, 'mousedown', onMouseDown], [target, 'mouseup', onMouseUp], [target, 'mousemove', onMouseMove],
    [target, 'contextmenu', onContextMenu], [target, 'blur', onBlur],
    [target, 'gamepaddisconnected', onPadDisconnected],
    [dom, 'mousedown', onDomMouseDown],
    [doc, 'visibilitychange', onVisibility], [doc, 'pointerlockchange', onLockChange],
  ];
  for (const [t, type, fn] of listen) t?.addEventListener?.(type, fn);

  // ---- API -----------------------------------------------------------------------------------
  return {
    /** Call once per frame before gameplay reads input. Polls gamepads and computes edges. */
    update(dt) {
      if (disposed) return;
      let pads = [];
      try { pads = getGamepads() ?? []; } catch { /* ignore */ }
      core.update(dt, pads);
    },
    /** True on the frame the action went down (UI moves also pulse while held: 0.35 s, then 0.09 s). */
    pressed: (action, opts) => core.pressed(action, opts),
    held: (action, opts) => core.held(action, opts),
    released: (action, opts) => core.released(action, opts),
    /** 'move' -> {x: right, y: forward} in -1..1, length <= 1. 'look' -> {x: yaw right, y: pitch up} in radians this frame. */
    axis2: (name) => core.axis2(name),
    /** True (once) if the action was pressed within the last windowSec seconds. */
    consumeBuffered: (action, windowSec = 0.15) => core.consumeBuffered(action, windowSec),
    get lastDevice() { return core.lastDevice; },
    labelFor: (action, device) => core.labelFor(action, { device: device ?? core.lastDevice, layoutMap }),
    setSettings: (s) => core.setSettings(s),
    get settings() { return core.settings; },
    /**
     * Captures the next key / mouse button / gamepad button or stick direction into the action's
     * slot (0 or 1) of that input's family. Escape or Start cancels (resolves null). Pass
     * { device: 'keyboard' | 'gamepad' } to accept only that family.
     */
    startRebind: (action, slotIndex = 0, opts) => core.startCapture(action, slotIndex, opts),
    cancelRebind: () => core.cancelCapture(),
    get rebinding() { return core.capturing; },
    setBinding: (action, slotIndex, binding) => core.setBinding(action, slotIndex, binding),
    clearBinding: (action, family, slotIndex) => core.clearBinding(action, family, slotIndex),
    resetBindings: () => core.resetBindings(),
    getBindings: () => core.getBindings(),
    conflicts: () => core.conflicts(),
    lockPointer() { wantLock = true; lockPointer(); },
    unlockPointer() { wantLock = false; unlockPointer(); },
    get pointerLocked() { return isLocked(); },
    get context() { return core.context; },
    /** 'gameplay' | 'menu' | 'dialogue'. Leaving gameplay frees the pointer; returning re-locks it. */
    setContext(ctx) {
      const changed = core.setContext(ctx);
      if (ctx === 'gameplay') {
        if (changed && autoLock) { wantLock = true; lockPointer(); }
      } else {
        wantLock = false;
        unlockPointer();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      core.cancelCapture();
      for (const [t, type, fn] of listen) t?.removeEventListener?.(type, fn);
    },
  };
}
