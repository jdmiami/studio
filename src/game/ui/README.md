# src/game/ui — menus and overlays

All of Phluph's menu and overlay screens, as plain DOM (no framework, no dependencies), styled as
cozy felt: stitched panels (dashed inner border), soft shadows, the cave's pastel palette, big
rounded type. Everything is sized in `em` off one root unit that scales with the viewport
(`clamp(14px, min(2.55vh, 1.5vw), 80px)` × the player's *Menu text size*), so the same layout reads
the same from 1024×572 to 4K; screen edges are padded by `max(2.4vh/vw, env(safe-area-inset-*))`.
`prefers-reduced-motion` turns animations off.

```js
import { createUI } from './game/ui/index.js';

const ui = createUI({
  root: document.body,         // where it mounts
  events,                      // the game's bus (src/game/core/events.js)
  getState: () => save.state,  // current save state, or null on the title screen
  getSettings: () => settings, // see defaultSettings()
  questCatalogue,              // optional; or ui.setQuestCatalogue(list) later
  actions: {
    newGame(slot, name), continueGame(), loadSlot(slot), deleteSlot(slot),
    exportSlot(slot) /* → string */, importSlot(slot, text) /* throws on bad code */,
    saveNow(), quitToTitle(), resume(), pause() /* optional */,
    applySettings(settings), startRebind(action, index) /* → Promise, reject = cancelled */,
    resetBindings(), listSlots() /* → [...] */, labelFor(action) /* → 'W / Up' or ['W', 'Up'] */,
  },
});
ui.open('title');
input.onAction((action, device) => ui.handleAction(action, { device })); // true = consumed
```

Every action may be sync or return a Promise; a thrown error / rejection becomes an error toast.

## API

| Member | What it does |
| --- | --- |
| `open(screen, params?)` | Push a screen. Returns its instance. |
| `back()` | What *Back* does: the top screen may handle it (`onBack`), otherwise pop. |
| `close()` | Close every screen (back to gameplay). |
| `reset(screen?, params?)` | Replace the whole stack (e.g. `reset('title')`) without calling `resume`. |
| `top()`, `isOpen()`, `stack()` | Name of the top screen, whether any screen is open, all names. |
| `handleAction(action, { device }?)` | Feed one `ACTIONS.*` value. Returns `true` if consumed. |
| `dialogue.show({ speaker, text, choices?, color?, cps? })` | `Promise<choiceIndex \| null>`. `dialogue.hide()`, `dialogue.active`. |
| `toast(text, kind?, { itemId?, duration?, title? })` | Kinds: `info`, `find`, `quest`, `error`. Also fired by `EVENTS.TOAST`. |
| `showDecorate({ item, count, prompts? })` / `hideDecorate()` | Decorate hint bar. |
| `confirm(o)` / `prompt(o)` / `showCode(o)` | Modal helpers → `Promise<bool>` / `Promise<string \| null>` / `Promise<void>`. |
| `setQuestCatalogue(list)` | `[{ id, title, giver, description, steps: [{ id, text }] }]`. |
| `refresh()` | Re-render the top screen from `getState()` (e.g. a find while the book is open). |
| `setHud(el)` | Hide this HUD element while a menu screen is open. |
| `update(dt)` | Advance the typewriter and toasts. Until the game first calls it, an internal rAF ticker does. |
| `destroy()` | Remove everything. |

### Flow rules

- **Stack.** A full screen hides the one below; a modal (`confirm` / `prompt` / `showCode`) dims
  it and makes it `inert`. Popping restores the screen below with the same control focused.
- **Gameplay ↔ menus.** With no screen open and a state loaded, `PAUSE`, `JOURNAL` and
  `COLLECTION` open `pause`, `journal` and `collection` (and call `actions.pause?.()`). When the
  stack empties again, `actions.resume()` is called. Quit to title calls `actions.quitToTitle()`
  and then `reset('title')`. After `newGame` / `continueGame` / `loadSlot` resolve, the menus that
  were open are removed without calling `resume`. The game is expected to start play itself.
- **Input while menus are open.** Every action is consumed so gameplay doesn't move. `UI_UP/DOWN/LEFT/RIGHT`
  move focus spatially (left/right adjust sliders, toggles and steppers instead), `UI_CONFIRM`
  activates, `UI_BACK` / `PAUSE` go back, `JOURNAL` / `COLLECTION` close their own screen,
  `UI_TAB_PREV` / `UI_TAB_NEXT` (Q/E, LB/RB) switch tabs. If one key maps to two of the toggle
  actions (Esc → `PAUSE` + `UI_BACK`), the second within 120 ms of a stack change is ignored.
- **Text fields** (slot name, import paste box) get real DOM focus. Keyboard-sourced actions are
  ignored while one is focused (typing "w" must not move focus), and the field handles Enter
  (submit), Esc (back), Up/Down/Tab (leave). Pass `{ device: 'gamepad' }` so a pad can still navigate.
- **While rebinding** (`startRebind` pending) every action is swallowed.
- **Dialogue** (no screen open): `UI_CONFIRM` / `INTERACT` / `JUMP` skip the typewriter, then advance or
  pick; `UI_UP/DOWN` move between choices; `UI_BACK` cancels a choice (resolves `null`). The panel
  hides by itself shortly after the last line resolves unless `show()` is called again.
- **Mouse** works everywhere: hovering moves the same focus highlight, clicks activate, sliders drag.
  Buttons never take DOM focus, so a native Enter/Space can't activate them twice.

### Events emitted

`UI_OPEN` / `UI_CLOSE` `{ screen }` (also for `dialogue`), `UI_MOVE` `{ screen, source }`
(nav / pointer / adjust), `UI_CONFIRM` `{ screen }`, `UI_BACK` `{ screen }`, and
`SETTINGS_CHANGED` `{ settings }` on every settings change (after `actions.applySettings`).
Listens to `TOAST`.

## Screens (`screens/`)

| Screen | Contents |
| --- | --- |
| `title` | Felt "Phluph" logo (stitched letter patches), tagline, Continue (only enabled when `listSlots()` has a save), New Game, Load, Settings, Credits; drifting fluff motes; translucent so the 3D backdrop shows. |
| `slots` | Autosave card + slots 1–3: name, play time `h:mm`, location, finds `n / total`, quests done, "Saved 5 min ago". Action row: Load, New game (name prompt, default "Cosy Nest" etc.; replace confirm), Delete (confirm), Export (copyable code), Import (paste box, overwrite confirm). `params.mode`: `'new'` or `'load'`. `listSlots()` entries: `{ slot: 1\|2\|3\|'auto', empty? , name, playTime (s), location \| area, finds, total, questsDone, savedAt \| updatedAt }` or `{ slot, state }` with a full save state. |
| `pause` | Resume, Journal, Collection, Settings, Save, Quit to title (confirm), beside a card about the nest. |
| `settings` | Tabs Audio (master / sfx / ambience / ui), Controls (mouse sensitivity, invert Y, pad look sensitivity, deadzone, two bindings per action with "Press a key…" capture, reset), Video (FOV 60–100, quality, head bob, camera shake, show FPS, menu text size → `settings.uiScale`). `params.tab`. |
| `journal` | Book: Active / Completed tabs, quest list, the selected quest's giver, description and checked steps. `params.catalogue`, `params.questId`, `params.tab`. Quest state `step` may be an index or a step id. |
| `collection` | Book: Finds / Sightings tabs, a grid of every ITEM (unfound = "???" silhouette, found = coloured glyph, rarity border, count), detail page (name, rarity, text, count, first found), progress bar. Page-turn animation. `params.tab`, `params.itemId`. |
| `credits` | A short roll. |
| `modal` | Used by `confirm` / `prompt` / `showCode`. |

Extra or replacement screens can be passed as `createUI({ screens: { name: { create(ctx, params), modal?, scrim? } } })`;
`create` returns `{ el, onAction?, onBack?, tab?, refresh?, onFocus?, initialFocus?, update?, destroy? }`.
Focusable controls carry `data-focus` and a stable `data-key` (focus survives re-renders);
`data-focus-group` / `data-focus-wrap="x|y|both|none"` on a container keep navigation inside it
first and set which way it wraps (grids wrap along rows, then leave upward/downward).

## Files

- `index.js`: `createUI`, the screen stack, focus manager, input routing, ticker.
- `logic.js`: pure helpers, unit-tested in `tests/ui.test.js`: spatial `navigate` (groups,
  wrap), `listStep`, `formatPlayTime`, `formatRelativeTime`, `formatDate`, `collectionProgress`,
  `collectionEntries`, `summarizeSlot`, `questView`, `stepValue`, `cycleOption`, `typewriterCount`…
- `glyphs.js`: inline SVG felt glyph per `look.kind` (mushroom, stone, dome, pom, puff, leaf, spool,
  button, thimble, crown, critter), tinted by `look.color` / `accent`, plus silhouettes.
- `dom.js`: `h()` and the felt controls (button, slider, toggle, stepper, tabs, header).
- `styles.js`: the stylesheet (injected once).
- `dialogue.js`, `toasts.js`, `decorate.js`: the overlays.
- `input-bridge.js`: `attachInputBridge(ui)`, a minimal keyboard + gamepad → actions bridge for
  pages without the game's input layer (the demo).
- `demo.html` / `demo.js`: every screen against fake data. Run `npx vite`, open
  `/src/game/ui/demo.html`; `?screen=<state>&shot=1` opens one state without the demo chrome
  (`title, slots, slots-new, pause, settings, settings-controls, settings-video, journal,
  journal-done, collection, collection-sightings, credits, dialogue, dialogue-choices, toasts,
  decorate, confirm, prompt, code`).
