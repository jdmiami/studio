# Stickerwild

A procedural survival RPG on one huge island where everything is a sticker. Every tree, rock, creature and campfire is flat vector art with a die-cut white border and a drop shadow. The ground is built from stacked cardboard layers (sea, land, highlands), and the whole world is bent onto a rolling drum. Ground in the distance curves away to a hazy horizon under the sky, and ground near the camera swells toward you, so the 2.5D depth is there on every screen.

The first time you open the game, an animated action-manga intro tells the story: ink panels, speed lines, halftone screentone, impact frames and katakana sound effects. The world starts in colour. When the Ink spills the pages turn to ink and tone, and only Pip keeps their colour. Watch it again from **Watch the story** on the title screen. Tap to turn pages, or press Skip.

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
| Click / tap water | Walk to the shore and cast a line (needs a Fishing Rod), or sail there on a Raft |
| Space / Use button | Act on what's in front of you, or reel in when the "!" pops up |
| WASD / arrows, drag on phones | Move directly. Shift to run |
| Q / E, right-drag, two-finger twist | Turn the view to any angle |
| ↺ ↻ buttons | Tap to turn 45°, hold to spin |
| N, compass button | Turn back to north |
| G, Glide button | Take off or land with the Glider |
| F, Eat button | Eat the best food you have |
| C | Crafting |
| M | Island map (click a campfire on it to fast-travel there) |
| L | Show or hide quests |
| 1–9 | Use or place the item in that hotbar slot |
| Mouse wheel, pinch, + / − | Zoom |
| Esc / P | Pause menu (saves, map, sound, fullscreen) |
| Gamepad | Left stick moves. Right stick or LB/RB turns the view. A acts, B eats, X crafts, Y opens the map, RT glides, Start pauses |

If you stand still and something attacks you, your character fights back on its own.

## The HUD

The HUD sits in the corners and edges so the middle of the screen, where your character is, stays clear. It works in portrait and landscape on phones.

- **Top left:** health, food and XP (plus glider energy once you have one), and your tools. Quests fold into a small tab: tap it to open the list.
- **Top right:** day and moon dial, weather, minimap with region name and danger, then the map, turn, compass, zoom and menu buttons.
- **Bottom:** one row of inventory that scrolls sideways, and Craft. On phones the Use, Eat and Glide buttons sit in the bottom-right corner.
- **Tips and banners** are placed by the game where there's room: in the gap between the top corners on wide screens, under the top HUD on tall phones, and above the hotbar on short screens. They never cover your character. When a banner and a tip arrive together they stack. Trees and rocks between you and the camera fade so you can always see yourself.

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

## Weather, wind and the moon

Each region has a climate (temperate, cold or hot) and its own weather, which changes every few minutes. You get a short note when it turns.

| Weather | What it does |
| --- | --- |
| Wind | Grass, flowers, bushes and trees sway with the wind and bend harder in gusts. Fire flames lean with it, clouds drift with it, and the waves pick up |
| Rain | Plants droop, rocks get wet tops, puddles form, fires burn out faster, fish bite sooner, and rain washes Scribbles away. Things regrow faster once the ground is wet |
| Thunderstorm | Heavy rain plus lightning flashes. Fires drown quickly and Scribbles melt |
| Snow | Snow caps build on trees, rocks and cliff tops. The ground gets slippery (you slide when you stop or turn), you get hungry faster away from a fire, and shallow water freezes so you can walk on it. Fish don't bite through ice |
| Blizzard | Heavier snow and even less grip |
| Fog | A white haze closes in. You can barely see, but creatures notice you later |
| Sandstorm | Desert only. Blowing sand slows you down and makes you hungrier |

**Chopping.** A felled tree topples over in the direction you hit it, lands with a thud and leaves a stump that regrows into a tree later. Rocks break apart for good.

**The moon** runs on an 8-night cycle, from new moon to full moon and back. A fuller moon makes nights brighter. The new moon after the first week is the **Ink Moon**, when Scribbles come out everywhere.

## Biomes and density

The island has 13 land and water biomes. Temperature falls toward the north and with height, and moisture comes from its own noise layer:

- Beach, Meadow, Grassland, Forest, Highlands, Crystal Peaks, Swamp
- **Desert** (hot and dry): cacti, dead bushes, sandstorms
- **Tundra** (cold): snowy rocks and pines, snow and blizzards
- **Autumn Woods**: orange and red trees
- **Mushroom Grove** (damp): giant mushrooms, toadstools, fog

Pick a **World density** on the title screen: Sparse, Normal or Lush. It sets how many plants, rocks and trees grow per square unit of ground, and it's saved with your game.

## Getting around

- **Raft** (Travel tab: 10 wood, 6 fiber). Walk or tap onto water and you sail. Click far out on the water to sail there. Wind speeds you up when it's behind you.
- **Glider** (Travel tab: 6 wood, 10 fiber, 6 petals). Press G or tap Glide to take off. You fly over water, cliffs and creatures until the blue energy bar runs out, then land. Energy refills on the ground.

## Adventures

- **The six Lost Pages.** Pages of the Great Sticker Book are hidden across the island, each further from where you start. Your first quest always points to the next page, with its distance and direction, and a yellow arrow by your feet points the way. Each page tells part of the story and gives XP, gems and supplies.
- **Treasure maps.** Some chests hold a treasure map. It puts a red X on your island map. Stand on the X to dig up the treasure.

## The world

- One island about 40,000 units across. Layered value noise makes the coastline, lakes, mountain ranges, moisture and temperature.
- Ground is generated in 256-unit chunks. Each chunk is painted once, from above, into flat textures (ground, cliff sides, cliff tops, ice). The camera turns these with an affine transform, so the view can rotate to any angle. Cliffs are built by stacking copies of each raised layer, like cardboard.
- The composed ground is cached in a padded offscreen buffer. While you only walk, each frame copies that buffer once. It's redrawn when the view turns or zooms, when you walk past its edge, or when snow or ice changes.
- Objects are placed on a jittered grid with a seeded hash, so they're identical every visit. Trees leave stumps and regrow, and bushes refill.
- Stickers are pre-rendered at the exact on-screen scale and copied pixel-for-pixel each frame. They re-render when you zoom.
- **The round world.** The flat scene is drawn into an offscreen buffer, then bent onto the screen in thin horizontal strips. Above the player, rows follow `y = yA + R·sin(d/R)` and shrink horizontally, rolling away to the horizon. Below the player they swell slightly (`y = yA + d + a·d²`). Taps and clicks go through the inverse mapping and the camera rotation, so they land on what's under your finger.
- **Device features.** Adaptive resolution lowers the world's render resolution when frames run slow and raises it when there's headroom. Gamepads work through the Gamepad API. Phones vibrate when you chop, hit or get hurt, the screen stays awake while you play (Wake Lock), and the pause menu has a fullscreen toggle.

## Code layout

| File | Contents |
| --- | --- |
| `js/util.js` | Seeded hash, PRNG, value noise, fBm, storage helpers |
| `js/sprites.js` | All art (canvas paths) and the sticker builder (border, shadow, gloss, white back for peel flips) |
| `js/world.js` | Island shape, biomes, temperature, regions and danger, object placement and density, chunk textures |
| `js/rpg.js` | Items, gear, recipes, creatures, fish, XP curve, quest generator, region names, chest loot, Lost Pages and treasure maps |
| `js/audio.js` | Synthesised sound effects (no audio files) |
| `js/weather.js` | Weather by climate, wind and gusts, rain, snow, fog and sand particles, weather effects, moon phases |
| `js/save.js` | Save files, save codes, cloud save |
| `js/intro.js` | The animated manga story intro (panels, speed lines, screentone, SFX) |
| `js/game.js` | Game loop, rotating camera, click-to-act orders, fishing, combat, AI, transport, day/night and moon lighting, HUD layout, map, input (touch, mouse, keyboard, gamepad) |
| `css/style.css` | Sticker-styled HUD and menus |

For automated checks, `window.SW.game` exposes the live state (`G`) and helpers such as `setPhase(0.7)` to jump to night, `setAngle(a)` to turn the view, and `toScreen(x, y, level)` to find where a world point is drawn. `window.SW.weather` holds the current weather.
