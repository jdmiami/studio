# Phluph: the game

A cozy first-person exploration game in a felt world. You live in **the Nest**, the painted felt
cave; behind its great door lie the **Wander Lands**, a new small landscape every trip, generated
from a seed you can share. There is no combat, hunger or death: you wander, collect, help Mira, play
with Biscuit the dog and make the Nest your own.

## How to play

| | Keyboard and mouse | Gamepad |
|---|---|---|
| Move / look | WASD or arrows / mouse | left stick / right stick |
| Jump / run | Space / hold Shift | (A) / hold LB |
| Interact (talk, pet, ring, step through) | E or left click | (X) |
| Throw Biscuit's ball | F | (Y) |
| Decorate mode (in the Nest) | B; E places, R turns, wheel or Q/Tab picks, X picks up | LT; RT places, RB turns |
| Journal / collection book | J / C | Select / D-pad up |
| Pause, settings, save | Esc or P | Start |

Every binding can be changed in Settings, Controls. Finds are collected by walking over them.

### On a phone or tablet

The on-screen controls appear on touch screens (Settings, Controls, Touch: Auto / On / Off).

| | Touch |
|---|---|
| Move | put a thumb anywhere on the lower left: a stick appears under it; push past its rim to run |
| Look | drag anywhere else on the screen |
| Jump | the big pink button |
| Interact | the green ✋ button; the bubble above it says what it will do ("Talk to Mira") |
| Throw / decorate | ◍ and ✿ appear when you can; in decorate mode: ✓ place, ↻ turn, › next, ⇡ pick up |
| Pause, journal, collection | the three small buttons under the area name |
| Menus, dialogue, the felt lock | tap |

Portrait and landscape both work; in portrait the view widens so you still see to the sides.
Touch look speed and button size are in Settings, Controls. On a first visit from a phone the
game starts on the Low quality preset; Android goes fullscreen when you start playing.

### The story

1. **Welcome.** Talk to Mira on her terrace. Find a fluff stone, a button mushroom and get close
   to a puffball critter (stand still and it comes to you). Tell Mira.
2. **The felt lock.** The great door has three wool dials. Mira's grandmother's note: *"the one who
   wags, the one who is knitted, and the one who hums."* (After three wrong tries the door repeats
   the hint.)
3. **The first trip.** Step through the Wander Gate in the open doorway. Collect five finds, then
   come home through the trip's gate and tell Mira. She gives you a basket for decorating.
4. **Nest maker.** Place three finds in the Nest (press B).
5. **The curator.** Catalogue twelve kinds of finds. The reward is legendary.
6. **Biscuit's friend.** Pet Biscuit three times and have him fetch the ball twice.
7. **Mira's wishes.** After each trip Mira may wish for a particular find; bring her one.

Every trip has a ring of **chiming mushrooms**: watch the glow, then ring them in the same order
(the sequence grows each round). Solving it leaves a rare find in the ring.

Trips are seeded: the HUD shows the trip's seven-letter code. Open the game with `?seed=CODE` to
make the next trip that exact place (share it with a friend).

### Saving

The game autosaves on quest steps, area changes, finds and every few seconds of play, into the
autosave slot; Save in the pause menu writes your slot. Three slots plus the autosave; slots can be
exported as a code and imported (Load). Saves are versioned and migrate forward; a damaged save
recovers from its backup.

## Two renderers

Before anything loads, the game asks how to draw the world:

- **Painted (three.js)**: the meshes matched to the artwork.
- **Soft (SDF)**: the whole static world raymarched from signed distance fields, with pillowy
  blocks, blended felt shapes and real soft shadows. Creatures, finds and particles stay meshes
  and sit inside it.

Tick "Remember my choice" to skip the question, or change it later in Settings, Video, Renderer.
`?renderer=threejs|sdf` picks one from the address. How it works: `src/game/sdf/README.md`.

## URL flags

`?seed=CODE` the next trip; `?autostart=1` skip the title (new game, slot 1); `?fps=1` the
performance overlay; `?quality=low|medium|high`; `?touch=1` force the on-screen controls (to try
them with a mouse); `?nofs=1` no fullscreen request on touch screens; `?renderer=threejs|sdf` skip the renderer
question. The cave viewer and reference-matching tools are
still at `?view=cave` (and the old `?eye=`, `?look=`, `?scene=island` flags).

## Architecture

```
src/boot.js            the game, or the cave viewer (src/main.js) for the matching tools
src/game/main.js       the orchestrator: renderer, frame loop, flow, areas, interactions
  core/                events bus, seeded rng and share codes, contracts (actions, events, state)
  data/                items (finds), quests, dialogue graphs
  play/                pure rules: quests, dialogue runner, collection, puzzles, decor, session
  save/                slots + autosave, crash-safe envelopes with checksums, migrations
  input/               actions over keyboard, mouse, gamepad and touch (touch.js: on-screen stick,
                       look drag, buttons); rebinding; contexts
  audio/               procedural Web Audio ambience and SFX, buses, variation, voice limits
  ui/                  title, slots, pause, settings, journal, collection, dialogue, toasts
  ai/                  behaviour trees + utility moods; dog, critter and Mira brains
  proc/                trip generator: noise terrain, WFC kit tiles, Poisson finds, reachability
  world/               block world (chunk streaming), painted models, finds, trip, creatures, fluff, ball, light
  sdf/                 the SDF renderer: scene data, the raymarching shader, the full-screen pass
  player/              the first-person controller (fixed timestep, coyote, buffer, juice)
  hud.js lock-ui.js    the HUD and the felt lock overlay
```

Systems never import each other; they talk on the event bus with the names in
`core/contracts.js`. Everything below `main.js` except `world/`, `ui/`, `hud.js` and `lock-ui.js` is
plain JavaScript that runs in Node, so the rules are tested without a browser (`npm test`), and
`scripts/game/playtest.mjs` plays the whole story in headless Chromium;
`scripts/game/mobile-check.mjs` checks the touch controls and phone layouts (portrait and
landscape) with real touch events.

### Performance budgets

The perf overlay (`?fps=1` or Settings, Video) shows frame time (mean and 95th percentile), draw
calls and triangles against the budgets in `main.js` (`BUDGET`: 16.7 ms, 600 draws), red when over.
Trip terrain is instanced per kit design and chunk (16x16 cells) and streamed nearest-first within a
per-frame time budget; finds are pooled between trips; painted assets are clones sharing geometry
and materials.
