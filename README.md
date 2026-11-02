# Stickerwild

A procedural survival game where the whole world is made of stickers. Every tree, rock, bush, creature and campfire is flat vector art with a die-cut white border and a drop shadow. The ground is built from stacked cardboard layers (sea, land, highlands) and seen from a tilted camera, which gives the 2.5D look.

## Play

No build step and no dependencies. Serve the folder and open it:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

For a single shareable file, run `node tools/bundle.mjs`. It writes `dist/stickerwild.html`, which also works opened straight from disk.

## How to survive

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Space or click | Gather and attack (click aims toward the cursor) |
| E | Eat the best food you have |
| C | Open crafting |
| 1–9 | Use or place the item in that hotbar slot |
| Esc / P | Pause |
| M | Mute |

On phones, drag on the left half of the screen to move. The Use and Eat buttons sit on the right.

- **Food** drains over time. Berries come from bushes. Puffs (the fluffy hoppers) drop meat, which you grill at a campfire.
- **Night** arrives about two minutes into each day. Scribbles, living ink blots, come out and hunt you. They will not step into campfire light.
- **Campfires** burn about one night. Hit one while carrying wood to add fuel.
- **Highlands** have rock. **Crystal peaks** have crystals, which need a pickaxe and make the best gear.
- Your score is how many days you survive. The game autosaves, so you can continue after closing the tab.

## The world

Each island comes from a seed. Type any word or number on the title screen to get the same island again.

- Terrain uses layered value noise for elevation and moisture, which picks among nine biomes: deep sea, sea, shallows, beach, meadow, grassland, forest, highlands and crystal peaks.
- The world is infinite and generated in 256-unit chunks. Each chunk's ground is drawn once to an offscreen canvas.
- Objects are placed on a jittered grid using a seeded hash, so they are identical every time you visit. Harvested trees leave stumps and regrow; bushes refill with berries.

## Code layout

| File | Contents |
| --- | --- |
| `js/util.js` | Seeded hash, PRNG, value noise, fBm, storage helpers |
| `js/sprites.js` | All art, drawn with canvas paths, and the sticker builder (border, shadow, gloss, white back for peel flips) |
| `js/world.js` | Biomes, object placement, chunk ground rendering with layered cliffs |
| `js/audio.js` | Synthesised sound effects (no audio files) |
| `js/game.js` | Game loop, player, creatures, crafting, day/night lighting, HUD, save/load |
| `css/style.css` | Sticker-styled HUD and menus |

For automated checks, `window.SW.game` exposes the live state (`G`) and helpers such as `setPhase(0.7)` to jump to night.
