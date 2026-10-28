# src/game/input — actions, not keys

Gameplay and UI read **actions** (`ACTIONS` in `src/game/core/contracts.js`); this module maps
keyboard, mouse and gamepad onto them. Bindings are plain data in `settings.bindings`, so they can be
rebound, saved and reset.

| File | What | DOM? |
|---|---|---|
| `index.js` | `createInput()`: DOM listeners, Gamepad API polling, pointer lock, bus events | yes |
| `core.js` | `createInputCore()`: the per-frame state machine (edges, contexts, buffer, repeat, look/move, capture) | no |
| `bindings.js` | default table, resolve/validate stored tables, slots, conflicts, reserved inputs | no |
| `analog.js` | radial deadzone + rescale, response curve, repeat timer | no |
| `labels.js` | prompt labels (`'E'`, `'(A)'`, `'L-Stick ↑'`) | no |

Tests: `tests/input.test.js` (`npm test`), using fake key events and fake gamepad snapshots.

## Usage

```js
import { createInput } from './game/input/index.js';
import { ACTIONS } from './game/core/contracts.js';

const input = createInput({ dom: renderer.domElement, events, settings });

function frame(dt) {
  input.update(dt);                                  // once per frame, before anything reads input
  const move = input.axis2('move');                  // {x: right, y: forward}, length <= 1
  const look = input.axis2('look');                  // radians this frame: yaw -= look.x; pitch += look.y
  const running = input.held(ACTIONS.RUN);
  if (grounded && input.consumeBuffered(ACTIONS.JUMP, 0.15)) jump();   // early presses still land
  if (input.pressed(ACTIONS.INTERACT)) interact();
  if (input.pressed(ACTIONS.PAUSE)) { openPauseMenu(); input.setContext('menu'); }
  hint.textContent = `${input.labelFor(ACTIONS.INTERACT)} to pet`;   // 'E' or '(X)' by last device
}
```

## API

`createInput({ dom, events, settings, target = window, doc = dom.ownerDocument, getGamepads, autoLock = true, pauseOnUnlock = true })`

| Member | |
|---|---|
| `update(dt)` | Polls gamepads, turns the frame's events into edges. Call once per frame. |
| `pressed(a)` / `held(a)` / `released(a)` | Per-frame action state. `pressed` ignores OS key repeat; a tap inside one frame still counts. UI moves (`uiUp/Down/Left/Right`) also pulse `pressed` while held: first press, then after 0.35 s, then every 0.09 s. Pass `{ anyContext: true }` to read an action outside its context (e.g. J closing the journal it opened). |
| `axis2('move')` | `{x, y}`: x right, y forward, -1..1, length capped at 1. Keys (digital) + the stick bound to the move actions (radial deadzone `settings.gamepadDeadzone`, rescaled, linear). |
| `axis2('look')` | `{x, y}` in radians for this frame: x = turn right, y = look up. Mouse: `movement × 0.0022 × mouseSensitivity` (never × dt). Stick: deadzone, curve exponent 2, `× 3.0 rad/s × lookSensitivityPad × dt` (pitch × 0.75). `invertY` flips y. Look uses the stick the move actions do not (right by default). |
| `consumeBuffered(a, windowSec)` | True once if `a` was pressed in the last `windowSec` s (jump buffer: `consumeBuffered(ACTIONS.JUMP, 0.15)`). |
| `lastDevice` | `'keyboard'` (keys and mouse) or `'gamepad'`, whichever sent input last. |
| `labelFor(a, device?)` | Prompt for the first binding on `lastDevice` (or `device`), e.g. `'E'`, `'Space'`, `'Click'`, `'(A)'`, `'LB'`; falls back to the other device, then `'—'`. Letter keys follow the player's layout where the browser exposes it (`navigator.keyboard.getLayoutMap`). |
| `setSettings(s)` | New settings object (sensitivity, deadzone, invertY, bindings). Does not emit. |
| `startRebind(a, slot, { device }?)` | Promise: captures the next key, mouse button, gamepad button or stick direction into slot 0/1 of that input's family; resolves the binding, or `null` on cancel. See below. |
| `cancelRebind()`, `rebinding` | Cancel; the capture in progress (`{ action, slot, device }`) or `null`. |
| `setBinding(a, slot, binding)` / `clearBinding(a, family, slot)` | Direct edits (same rules and events as a rebind). |
| `resetBindings()` | `settings.bindings = null` (defaults); emits. |
| `getBindings()` | A copy of the effective table (defaults resolved). |
| `conflicts()` | `[{ binding, actions, group }]`: one input on two actions of the same group. |
| `lockPointer()` / `unlockPointer()` / `pointerLocked` | Pointer lock on `dom`. |
| `setContext('gameplay' \| 'menu' \| 'dialogue')`, `context` | See Contexts. |
| `dispose()` | Removes listeners, cancels a rebind. |

The pure parts are exported too (`defaultBindings`, `resolveBindings`, `findConflicts`,
`setBindingSlot`, `radialDeadzone`, `shapeStick`, `createRepeat`, `bindingLabel`, `createInputCore`, ...).

## Default bindings

Gamepad names are the W3C standard mapping in Xbox terms: (A) bottom, (B) right, (X) left, (Y) top.

### Gameplay

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| `moveForward` / `moveBack` | W, ↑ / S, ↓ | left stick up / down |
| `moveLeft` / `moveRight` | A, ← / D, → | left stick left / right |
| *(look)* | mouse (pointer locked) | right stick |
| `jump` | Space | (A) |
| `run` (hold) | Shift, R-Shift | LB, L3 |
| `interact` (also: place decor) | E, left click | (X), RT |
| `throw` | F | (Y) |
| `decorate` (toggle mode) | B | LT, D-pad ↓ |
| `rotate` | R | RB |
| `pickUp` (also: lift decor) | X, right click | (B) |
| `journal` | J | Select / View |
| `collection` | C | D-pad ↑ |
| `pause` | Esc, P | Start / Menu |

### Menus and dialogue

| Action | Keyboard | Gamepad |
|---|---|---|
| `uiUp` / `uiDown` | ↑, W / ↓, S | D-pad ↑ / ↓, left stick |
| `uiLeft` / `uiRight` | ←, A / →, D | D-pad ← / →, left stick |
| `uiConfirm` | Enter, Space | (A) |
| `uiBack` | Esc, Backspace | (B), Start |
| `uiTabPrev` / `uiTabNext` | Q / E | LB / RB |

Mouse buttons are game input only while the pointer is locked; menus are DOM and take clicks
directly. In menus the stick picks its stronger axis (no diagonal double moves) and has hysteresis
(press at 0.5, release at 0.35).

**Reserved:** Esc and Start always mean `pause` in gameplay and `uiBack` in menus, even if rebound
away, and cannot be captured (they cancel a rebind), so the player can never lock themselves out.

## Contexts

- `gameplay`: gameplay actions report; UI actions read false. The pointer locks (clicking the canvas
  locks it; returning from a menu re-locks it, retrying on the next key/click if the browser refused).
- `menu` / `dialogue`: UI actions report; gameplay actions read false, `move`/`look` are zero, and
  the pointer is released.
- Switching swallows everything held at that moment until it is released, and clears the jump buffer:
  the Esc that opened the pause menu does not also close it, the E that opened a dialogue does not
  also tab, and W held in a menu does not walk you off after it closes.
- If the browser drops pointer lock during gameplay (the player pressed Esc), `pause` is pressed for
  that frame (`pauseOnUnlock`).
- Window blur / tab hidden releases every held key and button.

## Bindings data and rebinding

```js
settings.bindings = {
  jump: [{ device: 'key', code: 'Space' }, { device: 'pad', button: 0 }],
  moveForward: [{ device: 'key', code: 'KeyW' }, { device: 'pad-axis', axis: 1, sign: -1 }],
  interact: [{ device: 'key', code: 'KeyE' }, { device: 'mouse', button: 0 }, { device: 'pad', button: 2 }],
  // ...
};
```

- Keys are stored by physical position (`KeyboardEvent.code`), so WASD stays put on AZERTY.
- Each action has up to two slots per family: **keyboard** (`key` + `mouse`) and **gamepad**
  (`pad` + `pad-axis`). A family's slots are its entries in array order.
- `settings.bindings = null` means defaults. Actions missing from a stored table take their
  defaults; malformed, duplicate and over-limit entries are dropped on load.
- `startRebind(action, slot, { device })`: the next fresh press is captured (OS repeats, and buttons
  already held when the capture started, are ignored). It goes into `slot` of the captured input's
  family, replacing what was there (or appending). `{ device: 'keyboard' | 'gamepad' }` restricts
  it to one family. Esc / Start cancel and resolve `null`. The captured press does not also fire its
  new action.
- Conflicts are allowed and reported: after a rebind, call `conflicts()` and show a warning (or
  offer a swap). Only same-group overlaps count; arrows being both `moveForward` and `uiUp` is fine.
- Every change writes `settings.bindings` (in place on the settings object) and emits
  `EVENTS.SETTINGS_CHANGED` with `{ settings }`; saving is the settings/save system's job.
