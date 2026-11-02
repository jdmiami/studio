# Stickerwild

A procedural survival RPG on one huge island where everything is a sticker. Every tree, rock, creature and campfire is flat vector art with a die-cut white border and a drop shadow. The ground is built from stacked cardboard layers (sea, land, highlands) seen from a tilted camera, which gives the 2.5D look.

## Play

No build step and no dependencies. Serve the folder and open it:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

For a single shareable file, run `node tools/bundle.mjs`. It writes `dist/stickerwild.html`, which also works opened straight from disk.

## Controls

| Input | Action |
| --- | --- |
| Click / tap the ground | Walk there (hold the mouse to keep steering; long walks turn into a run) |
| Click / tap a tree, rock, bush, chest | Walk over and chop, mine, pick or open it |
| Click / tap a creature | Walk over and fight it |
| Click / tap water | Walk to the shore and cast a line (needs a Fishing Rod) |
| Space / Use button | Act on what's in front of you, or reel in when the "!" pops up |
| WASD / arrows, drag on phones | Move directly. Shift to run |
| E | Eat the best food you have |
| C | Crafting |
| M | Island map (click a campfire on it to fast-travel there) |
| Q | Show or hide quests |
| 1–9 | Use or place the item in that hotbar slot |
| Mouse wheel, + / − | Zoom |
| Esc / P | Pause menu (saves, map) |

If you stand still and something attacks you, your character fights back on its own.

## The RPG

- **Levels.** You earn XP for gathering, fishing, fights, chests, quests, new regions and surviving nights. Each level gives +10 max health and stronger hits.
- **Regions and danger.** The island is split into named regions (for example "Thistle Thicket"). Danger starts at 1 where you wash ashore and rises toward the coasts, up to 13 or more. Creatures match their region's danger, and about 6% are tougher Elites that drop better loot.
- **Creatures.** Thornbacks charge at you. Snapjaws scuttle sideways on beaches. Gloops split in two when they die. Pebblors are slow rock golems that hit hard. Scribbles come out at night and avoid firelight. Puffs are harmless and drop meat.
- **Gear.** Weapons go Stone Sword (3), Crystal Blade (6), Ink Edge (10). Armour goes Bark Vest (15%), Stone Mail (30%), Crystal Plate (45%). Tools are an axe, pickaxe, fishing rod and lantern.
- **Fishing.** Cast into any water and wait for the "!", then reel in quickly. Deep water holds trout, and rare Crystal Koi get more common in dangerous regions.
- **Quests.** You always have three procedural quests (gather, hunt, fish, explore a named region). They come from the seed, so the same island gives the same quest line.
- **Treasure chests** are scattered across the island. Their loot scales with danger.
- **Death** isn't the end. You wake at your nearest campfire and drop half your materials.

## Saving and resuming

Open **Save & load** from the title screen or the pause menu.

- **Download save file.** A small `.json` file holding the island seed and all your progress: level, items, gear, quests, structures, what you've harvested, and time of day.
- **Load save file.** Pick that file on any device to carry on where you left off.
- **Save codes.** Copy your whole save as text and paste it on another device.
- **Cloud save.** When the game runs as a claude.ai artifact, signed-in players get a private cloud slot that saves every minute and when you quit. Only that player can read their slot. People you share the artifact with need Contributor access or above to cloud-save. View-only players can still use save files and codes.
- The game also autosaves to this browser every few seconds (**Continue** on the title screen).

The seed alone (shown in the save panel, with a copy button) recreates the same island for anyone.

## The world

- One island about 40,000 units across, with nine land and water biomes plus swamps. Layered value noise makes the coastline, lakes, mountain ranges and moisture.
- Ground is generated in 256-unit chunks. Each chunk is drawn once to an offscreen canvas.
- Objects are placed on a jittered grid with a seeded hash, so they're identical every visit. Trees leave stumps and regrow, and bushes refill.
- Stickers are pre-rendered at the exact on-screen scale and copied pixel-for-pixel each frame. They re-render when you zoom.

## Code layout

| File | Contents |
| --- | --- |
| `js/util.js` | Seeded hash, PRNG, value noise, fBm, storage helpers |
| `js/sprites.js` | All art (canvas paths) and the sticker builder (border, shadow, gloss, white back for peel flips) |
| `js/world.js` | Island shape, biomes, regions and danger, object placement, layered chunk rendering |
| `js/rpg.js` | Items, gear, recipes, creatures, fish, XP curve, quest generator, region names, chest loot |
| `js/audio.js` | Synthesised sound effects (no audio files) |
| `js/save.js` | Save files, save codes, cloud save |
| `js/game.js` | Game loop, click-to-act orders, fishing, combat, AI, day/night lighting, HUD, map |
| `css/style.css` | Sticker-styled HUD and menus |

For automated checks, `window.SW.game` exposes the live state (`G`) and helpers such as `setPhase(0.7)` to jump to night.
