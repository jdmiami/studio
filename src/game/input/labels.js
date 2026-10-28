// Prompt labels for bindings: pure functions, testable in Node.
import { familySlots } from './bindings.js';

const KEY_NAMES = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Num Enter', Escape: 'Esc', Backspace: 'Backspace', Tab: 'Tab',
  ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'Alt', AltRight: 'R-Alt', MetaLeft: 'Meta', MetaRight: 'R-Meta', CapsLock: 'Caps',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .', ContextMenu: 'Menu',
};

/**
 * Label for a KeyboardEvent.code. `layoutMap` (optional, from navigator.keyboard.getLayoutMap())
 * gives the player's layout letter for a physical key, so AZERTY players see 'Z' for KeyW.
 */
export function keyLabel(code, layoutMap = null) {
  if (!code) return '?';
  const fromLayout = layoutMap?.get?.(code);
  if (fromLayout && /^(Key|Digit)/.test(code)) return fromLayout.toUpperCase();
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return `Num ${m[1]}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

const MOUSE_NAMES = ['Click', 'Middle Click', 'Right Click', 'Mouse 4', 'Mouse 5'];
export const mouseLabel = (button) => MOUSE_NAMES[button] ?? `Mouse ${button + 1}`;

// Xbox-style names for the standard mapping (the web Gamepad API does not report the family reliably).
const PAD_NAMES = ['(A)', '(B)', '(X)', '(Y)', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3',
  'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];
export const padButtonLabel = (button) => PAD_NAMES[button] ?? `Button ${button}`;

export function padAxisLabel(axis, sign) {
  const stick = axis === 0 || axis === 1 ? 'L-Stick' : axis === 2 || axis === 3 ? 'R-Stick' : `Axis ${axis}`;
  if (axis > 3) return `${stick}${sign < 0 ? '-' : '+'}`;
  const dir = axis % 2 === 0 ? (sign < 0 ? '←' : '→') : (sign < 0 ? '↑' : '↓');
  return `${stick} ${dir}`;
}

export function bindingLabel(b, layoutMap = null) {
  switch (b?.device) {
    case 'key': return keyLabel(b.code, layoutMap);
    case 'mouse': return mouseLabel(b.button);
    case 'pad': return padButtonLabel(b.button);
    case 'pad-axis': return padAxisLabel(b.axis, b.sign);
    default: return '—';
  }
}

/**
 * The prompt for an action on a device family ('keyboard' | 'gamepad'): its first binding of that
 * family; falls back to the other family, then '—'. For the gamepad a button beats a stick
 * direction (a prompt of '(A)' reads better than 'L-Stick ↑').
 */
export function labelForAction(bindings, action, family = 'keyboard', layoutMap = null) {
  const pick = (fam) => {
    const slots = familySlots(bindings, action, fam);
    return slots.find((b) => b.device !== 'pad-axis') ?? slots[0];
  };
  const b = pick(family) ?? pick(family === 'gamepad' ? 'keyboard' : 'gamepad');
  return b ? bindingLabel(b, layoutMap) : '—';
}
