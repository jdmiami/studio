// A minimal keyboard + gamepad → ACTIONS bridge for pages without the game's input layer (the demo,
// tests, a boot screen). The game proper feeds ui.handleAction from src/game/input/ instead.
import { ACTIONS } from '../core/contracts.js';

const KEYS = {
  ArrowUp: ACTIONS.UI_UP, KeyW: ACTIONS.UI_UP, ArrowDown: ACTIONS.UI_DOWN, KeyS: ACTIONS.UI_DOWN,
  ArrowLeft: ACTIONS.UI_LEFT, KeyA: ACTIONS.UI_LEFT, ArrowRight: ACTIONS.UI_RIGHT, KeyD: ACTIONS.UI_RIGHT,
  Enter: ACTIONS.UI_CONFIRM, Space: ACTIONS.UI_CONFIRM, NumpadEnter: ACTIONS.UI_CONFIRM,
  Escape: ACTIONS.UI_BACK, Backspace: ACTIONS.UI_BACK,
  KeyQ: ACTIONS.UI_TAB_PREV, KeyE: ACTIONS.UI_TAB_NEXT, KeyJ: ACTIONS.JOURNAL, KeyC: ACTIONS.COLLECTION, KeyP: ACTIONS.PAUSE,
};
// Standard gamepad mapping.
const PAD = { 0: ACTIONS.UI_CONFIRM, 1: ACTIONS.UI_BACK, 4: ACTIONS.UI_TAB_PREV, 5: ACTIONS.UI_TAB_NEXT, 9: ACTIONS.PAUSE,
  12: ACTIONS.UI_UP, 13: ACTIONS.UI_DOWN, 14: ACTIONS.UI_LEFT, 15: ACTIONS.UI_RIGHT };
const REPEATABLE = new Set([ACTIONS.UI_UP, ACTIONS.UI_DOWN, ACTIONS.UI_LEFT, ACTIONS.UI_RIGHT]);
const REPEAT_DELAY = 0.38;
const REPEAT_RATE = 0.11;

/** Wires keys and the first gamepad to ui.handleAction. Returns detach(). */
export function attachInputBridge(ui, { target = window, deadzone = 0.5 } = {}) {
  const onKey = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // the UI handles text fields itself
    const action = KEYS[e.code];
    if (!action) return;
    if (ui.handleAction(action, { device: 'keyboard' })) e.preventDefault();
  };
  target.addEventListener('keydown', onKey);

  const held = new Map(); // action -> seconds held
  let raf = 0;
  let last = performance.now();
  function poll(t) {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    const down = new Set();
    if (pad) {
      pad.buttons.forEach((b, i) => { if (b.pressed && PAD[i]) down.add(PAD[i]); });
      const [x = 0, y = 0] = pad.axes;
      if (y < -deadzone) down.add(ACTIONS.UI_UP);
      if (y > deadzone) down.add(ACTIONS.UI_DOWN);
      if (x < -deadzone) down.add(ACTIONS.UI_LEFT);
      if (x > deadzone) down.add(ACTIONS.UI_RIGHT);
    }
    for (const a of [...held.keys()]) if (!down.has(a)) held.delete(a);
    for (const a of down) {
      if (!held.has(a)) { held.set(a, 0); ui.handleAction(a, { device: 'gamepad' }); continue; }
      const before = held.get(a);
      const after = before + dt;
      held.set(a, after);
      if (REPEATABLE.has(a) && after > REPEAT_DELAY
        && Math.floor((after - REPEAT_DELAY) / REPEAT_RATE) > Math.floor(Math.max(0, before - REPEAT_DELAY) / REPEAT_RATE)) {
        ui.handleAction(a, { device: 'gamepad', repeat: true });
      }
    }
    raf = requestAnimationFrame(poll);
  }
  raf = requestAnimationFrame(poll);

  return () => { target.removeEventListener('keydown', onKey); cancelAnimationFrame(raf); };
}
