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

## URL flags

`?seed=CODE` the next trip; `?autostart=1` skip the title (new game, slot 1); `?fps=1` the
performance overlay; `?quality=low|medium|high`. The cave viewer and reference-matching tools are
still at `?view=cave` (and the old `?eye=`, `?look=`, `?scene=island` flags).

## Architecture

```
src/boot.js            the game, or the cave viewer (src/main.js) for the matching tools
src/game/main.js       the orchestrator: renderer, frame loop, flow, areas, interactions
  core/                events bus, seeded rng and share codes, contracts (actions, events, state)
  data/                items (finds), quests, dialogue graphs
  play/                pure rules: quests, dialogue runner, collection, puzzles, decor, session
  save/                slots + autosave, crash-safe envelopes with checksums, migrations
  input/               actions over keyboard, mouse and gamepad; rebinding; contexts
  audio/               procedural Web Audio ambience and SFX, buses, variation, voice limits
  ui/                  title, slots, pause, settings, journal, collection, dialogue, toasts
  ai/                  behaviour trees + utility moods; dog, critter and Mira brains
  proc/                trip generator: noise terrain, WFC kit tiles, Poisson finds, reachability
  world/               block world (chunk streaming), painted models, finds, trip, creatures, fluff, ball, light
  player/              the first-person controller (fixed timestep, coyote, buffer, juice)
  hud.js lock-ui.js    the HUD and the felt lock overlay
```

Systems never import each other; they talk on the event bus with the names in
`core/contracts.js`. Everything below `main.js` except `world/`, `ui/`, `hud.js` and `lock-ui.js` is
plain JavaScript that runs in Node, so the rules are tested without a browser (`npm test`), and
`scripts/game/playtest.mjs` plays the whole story in headless Chromium.

### Performance budgets

The perf overlay (`?fps=1` or Settings, Video) shows frame time (mean and 95th percentile), draw
calls and triangles against the budgets in `main.js` (`BUDGET`: 16.7 ms, 600 draws), red when over.
Trip terrain is instanced per kit design and chunk (16x16 cells) and streamed nearest-first within a
per-frame time budget; finds are pooled between trips; painted assets are clones sharing geometry
and materials.
