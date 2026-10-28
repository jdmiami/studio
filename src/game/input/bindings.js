// Binding tables: pure data and pure functions (no DOM), so they run and test in Node.
//
// A binding is one of:
//   { device: 'key', code }               KeyboardEvent.code (physical key, layout independent)
//   { device: 'mouse', button }           MouseEvent.button (0 left, 1 middle, 2 right, 3 back, 4 forward)
//   { device: 'pad', button }             standard-mapping gamepad button index
//   { device: 'pad-axis', axis, sign }    standard-mapping gamepad axis index, sign -1 | 1
// Bindings: { [action]: binding[] }, at most MAX_PER_FAMILY per family per action, where the families
// are 'keyboard' (key + mouse) and 'gamepad' (pad + pad-axis). A family's slots are its bindings in
// array order, so slot 0 of 'gamepad' is the first pad/pad-axis entry of the action's list.
import { ACTIONS } from '../core/contracts.js';

export const MAX_PER_FAMILY = 2;
export const FAMILIES = ['keyboard', 'gamepad'];

/** Standard mapping (https://w3c.github.io/gamepad/#remapping) button indices. */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
};
/** Standard mapping axes: left stick x/y, right stick x/y (y is +1 when pushed down). */
export const PAD_AXIS = { LX: 0, LY: 1, RX: 2, RY: 3 };

export const UI_ACTIONS = [
  ACTIONS.UI_UP, ACTIONS.UI_DOWN, ACTIONS.UI_LEFT, ACTIONS.UI_RIGHT, ACTIONS.UI_CONFIRM, ACTIONS.UI_BACK,
  ACTIONS.UI_TAB_PREV, ACTIONS.UI_TAB_NEXT,
];
/** UI moves that auto-repeat while held (pressed() pulses after a delay, like a key repeat). */
export const UI_NAV_ACTIONS = [ACTIONS.UI_UP, ACTIONS.UI_DOWN, ACTIONS.UI_LEFT, ACTIONS.UI_RIGHT];
export const MOVE_ACTIONS = [ACTIONS.MOVE_FORWARD, ACTIONS.MOVE_BACK, ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT];
export const ALL_ACTIONS = Object.values(ACTIONS);
export const GAMEPLAY_ACTIONS = ALL_ACTIONS.filter((a) => !UI_ACTIONS.includes(a));

/** 'gameplay' or 'ui': which context group an action belongs to (conflicts only matter within one). */
export const groupOf = (action) => (UI_ACTIONS.includes(action) ? 'ui' : 'gameplay');

/**
 * Inputs that always work and can never be captured by a rebind, so the player can always get back
 * out: Escape (keyboard) and Start (gamepad) are always PAUSE in gameplay and UI_BACK in menus, and
 * cancel a rebind in progress.
 */
export const RESERVED = [
  { device: 'key', code: 'Escape' },
  { device: 'pad', button: PAD.START },
];
export const RESERVED_ACTIONS = [ACTIONS.PAUSE, ACTIONS.UI_BACK];
export const isReserved = (b) => RESERVED.some((r) => sameBinding(r, b));

const key = (code) => ({ device: 'key', code });
const mouse = (button) => ({ device: 'mouse', button });
const pad = (button) => ({ device: 'pad', button });
const axis = (a, sign) => ({ device: 'pad-axis', axis: a, sign });

/** The default table (also documented in README.md). A fresh object each call. */
export function defaultBindings() {
  const A = ACTIONS;
  return {
    // Gameplay
    [A.MOVE_FORWARD]: [key('KeyW'), key('ArrowUp'), axis(PAD_AXIS.LY, -1)],
    [A.MOVE_BACK]: [key('KeyS'), key('ArrowDown'), axis(PAD_AXIS.LY, 1)],
    [A.MOVE_LEFT]: [key('KeyA'), key('ArrowLeft'), axis(PAD_AXIS.LX, -1)],
    [A.MOVE_RIGHT]: [key('KeyD'), key('ArrowRight'), axis(PAD_AXIS.LX, 1)],
    [A.JUMP]: [key('Space'), pad(PAD.A)],
    [A.RUN]: [key('ShiftLeft'), key('ShiftRight'), pad(PAD.LB), pad(PAD.L3)],
    [A.INTERACT]: [key('KeyE'), mouse(0), pad(PAD.X), pad(PAD.RT)],
    [A.THROW]: [key('KeyF'), pad(PAD.Y)],
    [A.DECORATE]: [key('KeyB'), pad(PAD.LT), pad(PAD.DOWN)],
    [A.ROTATE]: [key('KeyR'), pad(PAD.RB)],
    [A.PICK_UP]: [key('KeyX'), mouse(2), pad(PAD.B)],
    [A.JOURNAL]: [key('KeyJ'), pad(PAD.SELECT)],
    [A.COLLECTION]: [key('KeyC'), pad(PAD.UP)],
    [A.PAUSE]: [key('Escape'), key('KeyP'), pad(PAD.START)],
    // Menus
    [A.UI_UP]: [key('ArrowUp'), key('KeyW'), pad(PAD.UP), axis(PAD_AXIS.LY, -1)],
    [A.UI_DOWN]: [key('ArrowDown'), key('KeyS'), pad(PAD.DOWN), axis(PAD_AXIS.LY, 1)],
    [A.UI_LEFT]: [key('ArrowLeft'), key('KeyA'), pad(PAD.LEFT), axis(PAD_AXIS.LX, -1)],
    [A.UI_RIGHT]: [key('ArrowRight'), key('KeyD'), pad(PAD.RIGHT), axis(PAD_AXIS.LX, 1)],
    [A.UI_CONFIRM]: [key('Enter'), key('Space'), pad(PAD.A)],
    [A.UI_BACK]: [key('Escape'), key('Backspace'), pad(PAD.B), pad(PAD.START)],
    [A.UI_TAB_PREV]: [key('KeyQ'), pad(PAD.LB)],
    [A.UI_TAB_NEXT]: [key('KeyE'), pad(PAD.RB)],
  };
}

export function familyOf(b) {
  if (!b) return null;
  if (b.device === 'key' || b.device === 'mouse') return 'keyboard';
  if (b.device === 'pad' || b.device === 'pad-axis') return 'gamepad';
  return null;
}

/** A well-formed binding, or null. Drops unknown fields so stored data stays tidy. */
export function cleanBinding(b) {
  if (!b || typeof b !== 'object') return null;
  if (b.device === 'key' && typeof b.code === 'string' && b.code) return { device: 'key', code: b.code };
  const int = (n) => Number.isInteger(n) && n >= 0 && n < 64;
  if (b.device === 'mouse' && int(b.button)) return { device: 'mouse', button: b.button };
  if (b.device === 'pad' && int(b.button)) return { device: 'pad', button: b.button };
  if (b.device === 'pad-axis' && int(b.axis) && (b.sign === 1 || b.sign === -1)) {
    return { device: 'pad-axis', axis: b.axis, sign: b.sign };
  }
  return null;
}

/** A stable string id for a binding ('key:KeyE', 'mouse:0', 'pad:3', 'pad-axis:1-'). */
export function bindingId(b) {
  switch (b?.device) {
    case 'key': return `key:${b.code}`;
    case 'mouse': return `mouse:${b.button}`;
    case 'pad': return `pad:${b.button}`;
    case 'pad-axis': return `pad-axis:${b.axis}${b.sign < 0 ? '-' : '+'}`;
    default: return 'none';
  }
}

export const sameBinding = (a, b) => !!a && !!b && bindingId(a) === bindingId(b);

/**
 * The effective table from stored settings.bindings: null/undefined -> defaults; actions missing
 * from the stored object take their defaults; malformed entries, duplicates and over-limit entries
 * are dropped; unknown actions are ignored.
 */
export function resolveBindings(stored) {
  const defaults = defaultBindings();
  if (!stored || typeof stored !== 'object') return defaults;
  const out = {};
  for (const action of ALL_ACTIONS) {
    const list = Array.isArray(stored[action]) ? stored[action] : defaults[action];
    out[action] = sanitizeList(list);
  }
  return out;
}

function sanitizeList(list) {
  const out = [];
  const seen = new Set();
  const perFamily = { keyboard: 0, gamepad: 0 };
  for (const raw of list) {
    const b = cleanBinding(raw);
    if (!b) continue;
    const id = bindingId(b);
    const fam = familyOf(b);
    if (seen.has(id) || perFamily[fam] >= MAX_PER_FAMILY) continue;
    seen.add(id);
    perFamily[fam]++;
    out.push(b);
  }
  return out;
}

export function cloneBindings(bindings) {
  const out = {};
  for (const [action, list] of Object.entries(bindings)) out[action] = list.map((b) => ({ ...b }));
  return out;
}

/** The action's bindings of one family, in slot order. */
export const familySlots = (bindings, action, family) => (bindings[action] ?? []).filter((b) => familyOf(b) === family);

/**
 * A new table with `binding` in slot `slot` of its family for `action`. Slots past the end append
 * (clamped to MAX_PER_FAMILY - 1, which replaces the last). If the action already had the same
 * binding in another slot, that copy is removed.
 */
export function setBindingSlot(bindings, action, slot, binding) {
  const b = cleanBinding(binding);
  if (!b) throw new Error(`invalid binding ${JSON.stringify(binding)}`);
  const fam = familyOf(b);
  const out = cloneBindings(bindings);
  let list = out[action] ?? [];
  const slots = list.filter((x) => familyOf(x) === fam);
  const s = Math.max(0, Math.min(slot | 0, MAX_PER_FAMILY - 1));
  const target = s < slots.length ? slots[s] : slots.length >= MAX_PER_FAMILY ? slots[slots.length - 1] : null;
  list = target ? list.map((x) => (x === target ? b : x)) : [...list, b];
  out[action] = sanitizeList(list.filter((x) => x === b || !sameBinding(x, b)));
  return out;
}

/** A new table with slot `slot` of `family` removed from `action`. */
export function clearBindingSlot(bindings, action, family, slot) {
  const out = cloneBindings(bindings);
  const target = familySlots(out, action, family)[slot];
  if (target) out[action] = out[action].filter((x) => x !== target);
  return out;
}

/**
 * Inputs bound to two or more actions in the same context group (gameplay or ui). Overlaps across
 * groups are intended (arrows move in gameplay and navigate menus) and are not conflicts.
 * @returns {{ binding, actions: string[], group: 'gameplay' | 'ui' }[]}
 */
export function findConflicts(bindings) {
  const byKey = new Map();
  for (const [action, list] of Object.entries(bindings)) {
    if (!ALL_ACTIONS.includes(action)) continue;
    for (const b of list) {
      const k = `${groupOf(action)}|${bindingId(b)}`;
      if (!byKey.has(k)) byKey.set(k, { binding: { ...b }, actions: [], group: groupOf(action) });
      const entry = byKey.get(k);
      if (!entry.actions.includes(action)) entry.actions.push(action);
    }
  }
  return [...byKey.values()].filter((e) => e.actions.length > 1);
}
