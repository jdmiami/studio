# First-Person Reference Analysis: "The Great Cave Door"

Reference: `docs/reference/cave-door.jpg` (1024x572, JPEG; `probe_image.py`: technicalSuitability
`pass`). Analysis follows the img2threejs image-analysis protocol
(`.claude/skills/img2threejs/grimoire/intake/image_analysis.md`), adapted from a single object to
a whole scene. Observations are stated first; inferences are marked *(inference)*.

The img2threejs forge pipeline (state file, sculpt spec, locked passes) targets one object or
character per run. This reference is a full game scene plus HUD, so the protocol drives the
analysis and the build here, and the pipeline remains available for individual hero objects
(the dog, the door) if they need a gated rebuild later.

## Layer 1: Identification

- Work type: first-person game frame in a stylized block world. Domain: `hybrid` (environment,
  creatures, an NPC, first-person viewmodel, HUD). Confidence 0.9.
- Setting: a terraced canyon/cave interior ending at a large carved double door.

## Layer 2: Form and silhouette

- Camera: eye height about 1.6 blocks, looking roughly level down a corridor toward the door;
  wide field of view (*inference*: about 70 degrees vertical).
- Everything is built from rounded cuboid blocks on a 1-unit grid: stepped terraces on both
  sides, a stepped water cascade at left, a ceiling overhang above with openings.
- Bilateral framing: tall walls left and right, door centered at the back.

## Layer 3: Macro → meso → micro

| Macro | Meso | Micro |
|---|---|---|
| Canyon walls | Terraces of rounded blocks, 1-2 units per step | Grass caps draped over top edges; soft bevels |
| Water cascade (left foreground to mid) | Stepped blue blocks descending toward the camera, stream at the bottom | White foam caps on each step |
| Floor | Path of pale stone tiles; low steps up toward the door | Pastel tile color variation; grass tufts between tiles |
| Great door (back) | Two leaves in a pale stone block frame | Mosaic of grey, tan, and pink rectangular panels with seams |
| Ceiling | Overhanging block slabs | Gaps letting in warm light shafts (upper left) |
| Flora | Cube tree (trunk + canopy of fuzzy cubes), willow with green tassels, broom-bristle tree, knitted dome shrub with pom-pom | Pink-capped mushrooms, small grass sprigs |
| Creatures | White fluffy dog (pomeranian-like) center; small white fluff critters | Black button eyes, pointed ears, curled tail |
| NPC | Small character waving from a wooden scaffold, upper left | Dark hair, white top |
| Props | Low rounded fence (pink rails), small pastel stone cubes | |
| Viewmodel | Two hands in green Fair Isle fingerless gloves, cream cuffs | Left hand holds a pink fluff stone; right holds a grey compass with a teal radar face |
| HUD | Hearts (10), LEVEL bar, ring gauge with a green flame icon (top left); compass strip, QUEST TRACKER, timer (top right); minimap (bottom left); key prompts (bottom center) | |

## Layer 4: Spatial relationships

- `<grass cap, drapes-over, block top edge>`; `<water steps, descend-toward, camera>`;
  `<door, embedded-in, back wall frame>`; `<ceiling slab, overhangs, corridor>`;
  `<light shaft, passes-through, ceiling gap>`; `<dog, stands-on, floor tiles>`;
  `<shrub, sits-on, right terrace>`; `<fence, runs-along, right terrace edge>`;
  `<hands, attached-to, camera>`.

## Layer 5: Materials

| Surface | Material |
|---|---|
| Wall and terrace blocks | Matte felt/flocked clay: roughness ~0.9, soft fuzz at silhouettes, rounded edges |
| Grass caps | Felt, slightly fuzzier than walls |
| Water steps | Soft fleece-like felt, light blue, white foam |
| Floor tiles | Matte stone-felt |
| Canopies, dog, critters | Fur (shell fur) |
| Willow tassels | Yarn strands |
| Shrub, gloves | Knit (stockinette with a Fair Isle band on the gloves) |
| Broom handle, scaffold | Wood |
| Compass | Satin grey plastic/metal body, glass face with emissive teal display |

## Layer 6: Color and finish

Warm, soft, slightly muted natural palette; matte finish throughout.

| Region | Approximate colors |
|---|---|
| Walls | dusty rose / terracotta `#d7a08e`, `#cf9482`, `#dcae9c`, `#c88b7b` |
| Grass caps | sage greens `#a9c98f`, `#9cc083`, `#b6d39b` |
| Floor | cream-pink `#e9d3c8`, `#e3c6bb`, lavender `#d9c0d6`, mint `#c9d9d0` |
| Water | soft blue `#8db5e8`, `#9fc2ef`, `#7ea9e0`; foam `#f4f8ff` |
| Door | greys `#9c9a98`, `#8f8b88`, tan `#b5aea6`, pink `#c79e8a`; frame `#c8c3bb` |
| Light | warm white-gold sun shafts from upper left; warm bounce |

## Layer 7: Identity-defining features

1. Rounded felt blocks with draped grass caps (the world's core look).
2. The stepped blue water cascade.
3. The great mosaic double door, centered and lit.
4. Warm light shafts through ceiling gaps.
5. Fluffy white dog and critters.
6. First-person hands in knitted gloves holding a compass.
7. HUD layout: hearts and level top left, quest tracker and compass top right, minimap bottom
   left, prompts bottom center.

## Layer 8: Uncertainty

- Hidden: everything behind the camera and above the frame; the depth of the cave beyond the
  door; the far sides of all props.
- Uncertain: the exact ceiling layout, and whether the water flows (*inference*: animated).
- Not reproduced in this pass: the NPC character, which needs the img2threejs character track.

## Build mapping

| Feature | Implementation |
|---|---|
| Blocks, caps, floor, water | `src/cave/level.js`: instanced felt cushions on a grid, plus collision heights |
| Door, trees, shrub, broom, fence, mushrooms, dog, critters, light shafts | `src/cave/props.js` |
| First-person movement | `src/fp/controls.js`: pointer lock, WASD, Shift to run, gravity, step-up collision |
| Hands and compass | `src/fp/hands.js` |
| HUD | `src/fp/hud.js`: hearts, level, gauge, compass strip, quest, timer, minimap, prompts |
