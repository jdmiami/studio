# Stickerwild

A procedural survival RPG on one huge island where everything is a sticker. Every tree, rock, creature and campfire is flat vector art with a die-cut white border and a drop shadow. The ground is built from stacked cardboard layers (sea, land, highlands), and the whole world is bent onto a rolling drum. Ground in the distance curves away to a hazy horizon under the sky, and ground near the camera swells toward you, so the 2.5D depth is there on every screen.

You play **Ene in Pink**, with her companion **Star**.

The first time you open the game, an animated action-manga intro tells the story: ink panels, speed lines, halftone screentone, impact frames and katakana sound effects. The world starts in colour. When the Ink spills, the pages turn to ink and tone, and only Ene and Star keep their colour. Ene's rainbow cry peels her free from the page, and Star tumbles after her to Stickerwild. Watch it again from **Watch the story** on the title screen. Tap to turn pages, or press Skip.

## Ene and Star

The characters come from the original hand-drawn character sheets. The drawings themselves are used for close-ups: the pop-up portraits, the intro and the moon. Star in the world is a vector sticker redrawn from its sheet: a floating star with a face, no legs. The cut-out drawings are in `art/`, inlined into `js/assets.js`.

**Ene is a puppet made from her own drawing**, everywhere she appears: the 2.5D and third-person views, the parallax view, the caves, the intro panels and the HUD icon. Her head, hair, streaks and dress are cut straight from the four views of the character sheet (front, three-quarter, side, back). The joy and rainbow-cry faces are transplanted from the close-ups onto the front view. The drawn arms and legs were removed and the gaps filled from the surrounding drawing; where an arm crossed her hair, the hair is filled in behind it.

Her limbs are **traced off the sheet**, not redrawn: the upper arm, forearm and open hand come from the side view's hanging arm, the fist from the front view, and each view's own thighs, shins and feet (toes, ankle bones and all) from that view. Each traced piece keeps the drawing's pink, magenta shading and pen line, and is laid along the rig's bones every frame. Elbows and knees get round joints in the same ink, so a bend shows a smooth corner. Her **shoulders** are round and bare above the tube dress, at the edges of her chest where the drawing is widest; they sit behind the drawn chest and neck, so only their outer line shows, running on into the arm. Every frame she is posed from what she is doing:

- **Which way she faces** comes from where she is heading on screen. Walking across, she is side-on (mirrored for the other way). Coming toward you at an angle, she is three-quarter; straight toward you, front; going away, you see her back. She turns to face you when she stops, and side-on when she swings or fishes.
- **Walking and running**: thighs swing, knees bend as each foot lifts, feet roll off the toes, the lowest foot stays planted on the ground (so she bobs naturally), and the arms swing against the legs, into fists when she runs. Her hair and the lower dress trail behind her and swing back when she stops.
- **Standing**: her right hand pressed to her chest, as on the sheet. The other hand hangs, fingers curling and uncurling. Her weight shifts from foot to foot, she breathes, and she blinks.
- **Swinging**: the tool is in her near hand. The arm winds back over the shoulder, then slashes forward and down.
- **Hurt** ("AY!!"): one hand clutches her chest, the other flies out with fingers spread, and her knees buckle.
- **Joy**: arms up in a V, and a hop. **Rainbow cry**: fists clenched, a little tremble.
- **Fishing**: both fists on the rod. **Gliding**: arms up, holding the leaf by its stems, legs dangling. **Climbing ladders** in caves: hand over hand. Jumping, sliding and sailing have their own poses.

The rig data and the cut-out body pieces are in `js/ene-rig.js`, and the skeleton, poses and drawing are in `js/ene.js`.

The rest of the world is drawn in the same cartoon style: near-black, slightly uneven pen ink, puffy cloud-shaped trees with pen curls and bark lines, lumpy boulders, toadstools, sunflowers, daisies and a worried little rock. Every creature has a cartoon face with big eyes, brows and a mouth that shows its mood: Thornbacks and Pebblors scowl, Gloops grin, Puffs smile, grubs worry and Scribbles glare.

- **Ene's faces.** "AY!!" pops up, with a close-up of her shocked face, when she gets hurt or surprised. Her joy face shows on level-ups, finished quests, Lost Pages and cave treasure.
- **Rainbow cry** (R, the rainbow bar under XP, or the Rainbow button on phones). The bar fills as you fight, a little as you get hurt, and slowly over time. When it's full, two rainbows pour from Ene's eyes for about two seconds. They knock back and hurt everything around her and wash Scribbles away completely. It works in caves too.
- **Star** floats beside Ene and wears its feelings on its face: happy, surprised, worried when Ene is badly hurt, cross when enemies are near, laughing when things go well.
  - **Guide:** Star flies ahead toward your next goal (the next settlement, cave, side-quest person or Lost Page), so it replaces the old arrows.
  - **Light:** Star glows, lighting up nights and dark caves even without a lantern.
  - **Helper:** every few seconds it zaps a nearby enemy with starlight, which also stuns it briefly.
- **The moon** is the cartoon moon from the drawings. At full moon it looks straight at you, and it turns away as it wanes: three-quarter for gibbous, profile at the quarters, and the cratered back for crescents and the new moon. Waning phases face the other way. On the Ink Moon and in thunderstorms it's the crying moon instead.

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
| V, eye button | Switch view: 2.5D, third person, first person, parallax |
| G, Glide button | Take off or land with the Glider |
| F, Eat button | Eat the best food you have |
| R, rainbow bar, Rainbow button | Rainbow cry, once the rainbow bar is full |
| C | Crafting |
| M | Island map (click a campfire on it to fast-travel there) |
| L | Show or hide quests |
| 1–9 | Use or place the item in that hotbar slot |
| Mouse wheel, pinch, + / − | Zoom |
| Esc / P | Pause menu (saves, map, sound, fullscreen) |
| Gamepad | Left stick moves. Right stick or LB/RB turns the view. A acts, B eats, X crafts, Y opens the map, RT glides, Start pauses |

If you stand still and something attacks you, your character fights back on its own.

## Views

Press **V** or tap the eye button to switch between four cameras. Zoom works in all of them, and your choice is remembered.

- **2.5D** (the default): the camera looks down at Ene on the curved planet, and you can turn it to any angle.
- **Third person**: the camera drops low behind Ene and follows them, so you see Ene's back and the world stretching out ahead. Left and right turn Ene, up and down walk forward and back, and clicking or tapping still walks you there.
- **First person**: the camera is at Ene's eyes, with your tool or weapon held low in view. It bobs as you walk and swings when you act. Same controls as third person.

- **Parallax**: the island seen side-on as rows of rolling hills, like a cartoon backdrop, with snow-capped mountains on the horizon. The world is cut into rows 300 units deep. The row you stand in is the stage: A/D walk along it and W/S walk up and down its hill. Walk over the crest and the camera glides forward into the next row, whose trees, rocks, crystals and creatures pop up as you arrive. Back rows are smaller and hazier and lie flat until you get there. Each row shows only a few things (a tree or two, a rock, some crystals, a bush or chest), chosen from the seed so the same ones always appear. Click or tap something to walk to it and use it, or tap the hill to walk there.

The first three use the same sticker world and planet projection; the lower cameras flatten the ground more and push the horizon further out. Parallax has its own renderer. Caves are always 2D side view.

Ene's walk is fully animated, with knees, feet and arms (see above). Tools are carried on her back, with the blade over the shoulder, and move into her hand to swing or fish.

## The HUD

The HUD sits in the corners and edges so the middle of the screen, where your character is, stays clear. It works in portrait and landscape on phones.

- **Top left:** health, food and XP (plus glider energy once you have one), and your tools. Quests fold into a small tab: tap it to open the list.
- **Top right:** day and moon dial, weather, minimap with region name and danger, then the map, turn, compass, zoom and menu buttons.
- **Bottom:** one row of inventory that scrolls sideways, and Craft. On phones the Use, Eat and Glide buttons sit in the bottom-right corner.
- **Tips and banners** are placed by the game where there's room: in the gap between the top corners on wide screens, under the top HUD on tall phones, and above the hotbar on short screens. They never cover your character. When a banner and a tip arrive together they stack. Trees and rocks between you and the camera fade so you can always see yourself.

## The RPG

- **Levels.** You earn XP for gathering, fishing, fights, chests, quests, new regions and surviving nights. Each level gives +10 max health and stronger hits.
- **Regions and danger.** The island is split into named regions (for example "Thistle Thicket"). Danger starts at 1 where you wash ashore and rises in wide rings toward the coasts. Creatures match their region's danger, and about 6% are tougher Elites that drop better loot.
- **Creatures.** Thornbacks charge at you. Snapjaws scuttle sideways on beaches. Gloops split in two when they die. Pebblors are slow rock golems that hit hard. Scribbles come out at night and avoid firelight. Puffs are harmless and drop meat.
- **Gear.** Weapons go Stone Sword (3), Crystal Blade (6), Ink Edge (10). Armour goes Bark Vest (15%), Stone Mail (30%), Crystal Plate (45%). Tools are an axe, pickaxe, fishing rod, lantern and the Warm Cloak. Only the starter recipes are known at first; the rest you learn (see **Know-how** below).
- **Fishing.** Cast into any water and wait for the "!", then reel in quickly. Deep water holds trout, and rare Crystal Koi get more common in dangerous regions.
- **Quests.** You always have three procedural quests (gather, hunt, fish, explore a named region). They come from the seed, so the same island gives the same quest line.
- **Treasure chests** are scattered across the island. Their loot scales with danger, and some hold rare gems or a mod.
- **Death** isn't the end. You wake at your nearest campfire and drop half your materials.

## Zones

The island is five rings around where you wash ashore. Each ring is wide, so there's a lot to explore at every stage. An ink barrier stops you crossing into the next ring until you reach its level, on foot, by raft or by glider.

| Zone | Level to enter | Danger | Settlement | Cave |
| --- | --- | --- | --- | --- |
| Sunny Shallows | 1 | 1–2 | Reedwick, a reed-hut fishing village | Mossmouth Burrow |
| Bramble Reach | 3 | 3–4 | Stonebrook, a town of stone masons | Echo Mine |
| Lantern Wilds | 6 | 5–6 | Lumenport, the city of lamps | Sunken Grotto |
| Frost Heights | 9 | 7–8 | Hearthhold, a clan of igloos around a great hearth | Frostfang Hollow |
| Ink Rim | 12 | 9+ | Quillspire, a monastery of scribes | The Inkwell |

The barrier shows as a wobbly line of ink posts, and the island map shows the rings with the level each one needs. One Lost Page waits in each ring (two on the Ink Rim). The island is now 60,000 units across.

## Settlements and side quests

Every settlement has an elder and a trader. A yellow arrow by your feet points to the next settlement you haven't met, or to the cave or person your current side quest needs.

- **Elders** give side quests in a chain: hunt something, bring materials, carry a letter to another settlement and back, or fetch a cave's relic. Finishing one teaches you **know-how**, plus XP and shells. Elders also tell you about the next zone, where to find things, and the island's overall story. Tap **Ask about the island**.
- **Traders** buy and sell for **shells**. You can sell almost anything you gather, and rare gems (Amber, Ruby, Moon Opal, Star Shard) are worth the most. Each trader stocks food, supplies and mods that suit their settlement.

## Know-how and relics

Past the starter recipes, crafting needs more than materials: you also have to learn how, and some recipes need a relic from a cave. The Craft panel says what's missing ("Learn Windcraft from the elder of Reedwick", "Needs the Sunstone from Mossmouth Burrow").

| Know-how | Taught in | Unlocks |
| --- | --- | --- |
| Lantern-making | Reedwick | Lantern |
| Windcraft | Reedwick (bring the Sunstone) | Leaf Glider (needs the Sunstone), Feather Charm |
| Masonry | Stonebrook | Stone Mail |
| Runecraft | Stonebrook (bring the Echo Crystal) | Crystal Blade (needs the Echo Crystal), Keen Rune, fitting mods |
| Tidecraft | Lumenport (deliver a letter) | Crystal Plate, Pot of Tar |
| Frostcraft | Lumenport (bring the Tide Pearl) | Warm Cloak (needs the Tide Pearl) |
| Inkcraft | Hearthhold | Ink Edge (needs the Frost Heart) |
| Bookbinding | Quillspire (bring the Ink Crown) | The Great Sticker Book |

Relics are never used up. The Sunstone also melts ice and the Tide Pearl washes away living ink in later caves.

**The goal:** find all six Lost Pages, take the Ink Crown from the Inkwell, learn Bookbinding, and craft the Great Sticker Book. That ends the Ink: Scribbles stop coming at night.

## Mods

Mods upgrade your gear. Fit up to three to each piece from the **Mods** tab in Crafting once you know Runecraft. They come from caves, chests, traders and a few recipes.

| Mod | Fits | Effect |
| --- | --- | --- |
| Keen Rune | Weapon | +2 damage |
| Swift Rune | Axe or Pickaxe | Chops or mines 50% faster |
| Lucky Rune | Pickaxe or Fishing Rod | Bonus crystals and amber, or rare fish and quicker bites |
| Ward Rune | Armour | Blocks 10% more damage |
| Feather Charm | Leaf Glider | Sinks 30% slower |
| Pot of Tar | Raft | Soaks up water half as fast |
| Fire Pepper | Cooking | All food fills and heals 50% more |

## Caves

Each zone has one hand-placed cave mountain that pops up as you get close. Walk up to its door (or tap it) to see what you'll need inside, then enter. Inside, the game becomes a **2D side view**:

| Input | In a cave |
| --- | --- |
| A / D, ← / →, stick | Walk |
| Space, W, ↑, Jump button | Jump |
| W / S, ↑ / ↓, stick up or down | Climb ladders; down drops you through planks |
| E, J, Enter, click, Use button | Swing, strike a rune, open the chest, read the mural, break a wall |
| The glowing door | Go back outside |

- **Ladders** go up and down. **Slides** are one-way: you shoot down them to the floor below. **Planks** can be stood on or dropped through. **Spikes** hurt.
- **Underground creatures:** Bats wake up and swoop at you, grubs crawl along the floors, and deeper caves add Gloops, Pebblors and Scribbles.
- **Walls that need something:** vines need an axe, rubble needs a pickaxe, ice needs the Sunstone, and living ink needs the Tide Pearl. The Sunken Grotto and the Inkwell are pitch dark without a lantern. If you aren't ready, walk out and come back later. The cave remembers what you broke and picked up.
- **The puzzle:** a mural near the door shows the rune switches in a coloured order. Strike them in that order (hitting one out of turn resets them all) to open the vault gate. The relic chest behind it finishes the cave and also gives a rare gem, shells and XP. Side tunnels hide extra gems, a mod and bags of shells.

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

Weather moves across the island instead of switching on everywhere at once:

- **Wind is a field.** Gusts are blobs of fast air (two octaves of noise) carried downwind at the wind's speed. A plant bends only when a gust is over it, so you see gust fronts roll across meadows, one patch after another. White wind curls ride the strongest gusts. The arrow next to the weather name shows which way the wind blows on your screen and how hard it is where you stand.
- **Showers pass over.** Rain and snow fall from cells (larger, slower noise) that drift downwind. Rain only falls inside a cell, and its cloud shadow darkens the ground beneath it.
- **The ground remembers.** A soak map around you records where it has rained or snowed. Puddles, wet plants and snow caps follow it, and it dries out or melts afterwards (faster in wind).

| Weather | What it does |
| --- | --- |
| Wind | Plants bend as each gust passes over them. Flames lean with the local gust, clouds drift with the wind, and the waves pick up. The glider and raft get pushed along |
| Rain | Where a shower has passed, trees and plants fold over a little at the top like damp paper (never all the way), rocks get wet tops, and puddles form. Fires under the shower burn out faster, fish bite sooner, and rain washes Scribbles away. Things regrow faster once the ground is wet |
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

- **Raft** (Travel tab: 10 wood, 6 fiber). Walk or tap onto water and you sail. Click far out on the water to sail there. Wind behind you speeds you up, and gusts push you along. The raft soaks up water while you sail, faster in rain and choppy gusts, and its bar in the top-left drains. When it is soggy it folds up and you swim ashore. It dries out on land, and you can't launch it again until it has dried a bit.
- **Leaf glider** (Travel tab: 6 wood, 10 fiber, 6 petals). Press G or tap Glide. You hop up (higher from a cliff top), then sink steadily, so it's a glide, not free flight. Gusts give lift, and flying with the wind gives more, so a good flier can ride the wind a long way. The wind also drifts you sideways whether you steer or not. Rain soaks the leaf: a wet leaf droops and sinks faster, and you have to let it dry on the ground before the next launch. Its bar shows your height while gliding and the leaf's dryness on the ground.

## Adventures

- **The six Lost Pages.** Pages of the Great Sticker Book are hidden across the island, each further from where you start. Your first quest always points to the next page, with its distance and direction, and a yellow arrow by your feet points the way. Each page tells part of the story and gives XP, gems and supplies.
- **Treasure maps.** Some chests hold a treasure map. It puts a red X on your island map. Stand on the X to dig up the treasure.

## The world

- One island about 60,000 units across. Layered value noise makes the coastline, lakes, mountain ranges, moisture and temperature.
- Ground is generated in 256-unit chunks. Each chunk is painted once, from above, into flat textures (ground, cliff sides, cliff tops, ice). The camera turns these with an affine transform, so the view can rotate to any angle. Cliffs are built by stacking copies of each raised layer, like cardboard.
- The composed ground is cached in a padded offscreen buffer. While you only walk, each frame copies that buffer once. It's redrawn when the view turns or zooms, when you walk past its edge, or when snow or ice changes.
- Objects are placed on a jittered grid with a seeded hash, so they're identical every visit. Trees leave stumps and regrow, and bushes refill.
- Stickers are pre-rendered at the exact on-screen scale and copied pixel-for-pixel each frame. They re-render when you zoom.
- **The planet.** The flat scene is drawn into an offscreen buffer, and a WebGL fragment shader wraps it onto a small planet. For each screen pixel it works out which flat-world point lands there. Rows above the hero roll away over the horizon (`y = yA + R·sin(d/R)`) and rows below swell toward the camera. Columns wrap round a second radius (`x = W/2 + Rs·sin(t)`, `y += Dk·Rs·(1 − cos t)`), so the sides fall away and the horizon is an arc. Zooming in makes the planet rounder and zooming out flattens it, like changing a lens. Clicks go through the same mapping in reverse. The planet canvas is its own layer between the sky and a thin effects layer, so it's never copied back into a 2D canvas. Without WebGL, the game bends the scene in horizontal strips instead (no side curve).
- **Pop-up book.** Stickers in a zone around the hero stand up, and those farther out fold back flat onto the page. Each one hangs on a damped spring, so when it crosses the edge of the zone (because you walked, or turned the view) it flaps up or flips down with a small bounce.
- **Device features.** Adaptive resolution lowers the world's render resolution when frames run slow and raises it when there's headroom. Gamepads work through the Gamepad API. Phones vibrate when you chop, hit or get hurt, the screen stays awake while you play (Wake Lock), and the pause menu has a fullscreen toggle.

## Code layout

| File | Contents |
| --- | --- |
| `js/util.js` | Seeded hash, PRNG, value noise, fBm, storage helpers |
| `js/assets.js` | The original drawings of Ene, Star and the moon, cut out of their backgrounds and inlined |
| `js/ene-rig.js` | Ene's body pieces cut from the four views of her character sheet, with the measured skeleton |
| `js/ene.js` | Ene's puppet rig: the jointed arms and legs, every pose, which way she faces, and the sticker drawing |
| `js/sprites.js` | All art (canvas paths) and the sticker builder (border, shadow, gloss, white back for peel flips) |
| `js/world.js` | Island shape, biomes, temperature, regions and danger, object placement and density, chunk textures |
| `js/rpg.js` | Items, gear, recipes, creatures, fish, XP curve, quest generator, region names, chest loot, Lost Pages and treasure maps |
| `js/realm.js` | Zones, settlements and their quests, lore and stock, know-how, relics, rare items, mods, cave list, and where they're placed |
| `js/cave.js` | The 2D cave mode: physics, ladders, slides, creatures, breakable walls, the rune puzzle, drawing, and the five cave maps |
| `js/audio.js` | Synthesised sound effects (no audio files) |
| `js/weather.js` | Weather by climate, travelling gust field, drifting rain and snow cells, soak map, particles and cloud shadows, weather effects, moon phases |
| `js/globe.js` | The WebGL planet projection (fragment shader) |
| `js/save.js` | Save files, save codes, cloud save |
| `js/intro.js` | The animated manga story intro (panels, speed lines, screentone, SFX) |
| `js/game.js` | Game loop, rotating camera, click-to-act orders, fishing, combat, AI, transport, day/night and moon lighting, HUD layout, map, input (touch, mouse, keyboard, gamepad) |
| `css/style.css` | Sticker-styled HUD and menus |

For automated checks, `window.SW.game` exposes the live state (`G`) and helpers such as `setPhase(0.7)` to jump to night, `setAngle(a)` to turn the view, and `toScreen(x, y, level)` to find where a world point is drawn. `window.SW.weather` holds the current weather.
