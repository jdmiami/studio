# The target shot: breakdown and plan

The reference is `docs/reference/target-shot.jpg` (1125 x 1979, portrait 9:16). It replaces the cave
painting as the art target. This page describes it piece by piece, records what was measured, and
sets out the plan to rebuild it in the game.

The maps and numbers come from `scripts/shot/` (analyze, boxes, perobj, depth). Their outputs are in
`docs/reference/target-shot/`.

## 1. The shot as a whole

**What it is:**
- A third-person, over-the-shoulder view of the explorer in the Nest cave, framed for a phone held
  upright.
- The explorer stands at the edge of an icy pool, compass raised, looking into a sunlit cave
  plaza: Biscuit (a white Pomeranian) and two puff critters; a sage cube tree and a mint willow on
  a raised terrace; Mira waving from a balcony; the great door on the right.
- A game HUD frames it.

**Camera:**
- Behind and above the explorer, pitched down about 20 to 30 degrees, looking almost square-on at
  the back wall. That gives near one-point perspective: the back wall and the door have
  horizontal lines, and the floor lines converge toward the centre.
- The vertical field of view is wide: roughly 60 to 70 degrees across the tall frame.
- The explorer stands on the left third. Their head is at about 46% of the frame height and their
  boots about 85%; the figure fills about 40% of the frame height.
- The estimated horizon is at about 28% from the top.

**Scale:**
- From the floor contact points, Biscuit stands about 2.25 times farther away than the explorer's
  boots.
- The explorer is roughly 4 floor tiles tall, and Biscuit about 0.42 of the explorer's height.
- The world is built at a finer block scale than the game's current one (blocks about half the
  player's height today). This is the biggest structural change.

**Mood and light:**
- A calm, warm, hushed cave lit from above-behind by two daylight openings (top left, top right).
- Light falls softly through haze onto a pale plaza. Everything near the camera sits in soft,
  gently coloured shade.
- The style is a high-end stylized PBR render of plush clay and felt. Every edge is heavily
  rounded, every surface has a fine matte micro-texture, and crevices are deep in ambient
  occlusion.
- Bloom appears only at the openings. There are no ink outlines: shapes read through shading
  alone.

**Composition:**
- The frame stacks in vertical layers: ceiling mass (top 28%), back wall and terrace (28 to 50%),
  plaza and pool (50 to 75%), foreground ledges and floor (75 to 100%).
- Leading lines (the stair edges, the pool edge, the floor seams) run from the explorer toward
  Biscuit and the door.
- The saliency map puts the eye on the explorer's back and compass, then Biscuit, then Mira and
  the HUD.

## 2. What was measured

**Tone and colour (Lab, HUD masked):**

| Measure | Value |
|---|---|
| Lightness (L), mean | **51.3** |
| L, 5th / median / 95th percentile | 21 / 52 / 80 |
| Chroma (colourfulness), mean | **11.2** |
| Chroma, 90th percentile | 16.6 |
| Pixels that are near-white highlights | 1.4% (only the openings and Biscuit's lit top) |

The image is muted. For comparison, the Soft renderer's frames average a chroma of about 19.

**Palette:** 14 clusters, ordered by share of the frame (`palette.png`).

| Hex | Share | L | Chroma | Where |
|---|---|---|---|---|
| `#8e7a71` | 12.8% | 53 | 11 | rose-taupe walls and ceiling in mid light |
| `#9e8e7d` | 11.7% | 60 | 12 | warm sand blocks |
| `#7c6a64` | 11.3% | 46 | 9 | wall shade |
| `#625850` | 10.4% | 38 | 7 | deep wall and floor shade |
| `#aea191` | 9.7% | 67 | 11 | lit stone, the plaza |
| `#4d4641` | 7.2% | 30 | 5 | crevices, the explorer's trousers |
| `#c1b7a8` | 7.0% | 75 | 10 | sunlit cream |
| `#7b826c` | 5.6% | 54 | 13 | sage grass in light |
| `#373230` | 5.2% | 22 | 4 | ambient occlusion |
| `#656e5c` | 4.9% | 45 | 12 | grass in shade |
| `#e2d9cd` | 4.7% | 87 | 8 | bloom, Biscuit's highlight, the openings |
| `#7b8da5` | 4.1% | 58 | 14 | ice water |
| `#211b1d` | 2.6% | 11 | 3 | deepest occlusion |
| `#566481` | 2.6% | 43 | 18 | water in shade (the most saturated colour) |

**Colour temperature:**
- Warm (orange) across the ceiling, the back wall and the lit plaza.
- Cool (blue) in the waterfall and the pool, and the cool spills onto the explorer's left side.
- Neutral-green on the right-hand grass ledges.

**Values (five-step study):** the brightest band is the plaza behind Biscuit and the two openings.
The ceiling and the foreground are mid to dark. The explorer reads as the darkest mass, a dark
silhouette against a light ground, which is why the figure pops.

**Detail and edges:**
- Fine detail clusters on the explorer (knit, backpack, compass), Biscuit's fur, Mira and the HUD.
- The world blocks are deliberately low in detail: smooth, soft shapes.
- Edge lines are mostly horizontal (the back wall, the door) and vertical (pillars, trunks), plus
  one family of floor diagonals.

**Depth and layers:**
- **Learned depth** (`learned-depth.jpg`; regenerate the raw array with the script): Depth Anything V2 (small, ONNX, run
  on CPU here by `scripts/shot/learned_depth.py`).
  - It resolves the explorer, every floor slab, the ceiling blocks, both trees, Biscuit and the
    critters.
  - The surface normals derived from it show the rounded bevel on every block.
  - Its depth is relative (bigger means nearer). It is aligned to our engine depth with scale and
    shift before comparing.
  - The HUD panels read as near objects and are masked out.
- **Geometric estimate** (`depth-masks.jpg`):
  - floor and ceiling planes from the estimated horizon;
  - each object placed at the depth of its floor contact;
  - silhouettes from GrabCut inside hand-placed boxes. It was the first pass and is kept for the
    masks.
- Layers from front to back: foreground floor and right ledges; the explorer; the pool and
  waterfall base; the mint jars and lavender pom; the critters; Biscuit; the stairs and plaza;
  the cube tree, willow, mushrooms and Mira's balcony; the door and back wall; the ceiling.

**Per-element colours:** three dominant clusters inside each box, from `perobj.json`.

| Element | Colours |
|---|---|
| Biscuit | `#e0d5ca` lit, `#b9aea3` mid, `#8e8073` shade |
| Critters | `#dfd2c9` and `#ada199` |
| Cube tree | `#bdb6a2` lit, `#898376` mid, `#584f44` shade |
| Willow | `#d4cfba`, `#a4a288`, `#786b59` |
| Mint jars | `#c5c6b2`, `#8e9584`, `#676c62` |
| Lavender pom | `#b4abb5` |
| Door | `#b09a8b`, `#907d6f`, `#756458` |
| Water | `#8c9199` lit, `#5f616c` shade |
| Grass ledges | `#9f9e8b` lit, `#717465` mid, `#45443c` shade |

Even "white" Biscuit is a warm cream, never pure white.

## 3. Piece by piece

### Characters

**The explorer (player avatar, seen from behind, three-quarter view):**
- *Proportions:* chibi, about 3 heads tall, with a big head and hair mass, a compact torso and
  short legs on chunky boots.
- *Hat:* a dark forest-green ribbed knit beanie. It has vertical ribs, a folded cuff and a small
  knob on top, and the knit texture shows in the light.
- *Hair:* dark brown, thick and wavy, in chunky locks curling out from under the beanie over the
  ears and the nape. It is stylized clumps, not strands.
- *Sweater:* a cream turtleneck collar shows above a green Fair Isle sweater. A cream nordic
  pattern band (geometric snowflake and diamond motifs) runs across the shoulders and upper back,
  and there are cream stripes near the cuffs. The sweater has a ribbed cream hem and visible
  stitch texture.
- *Backpack:*
  - a brown leather pack with a rounded top flap and two buckled straps down the front;
  - a front pocket with a stud, side pockets, a top carry loop and shoulder straps;
  - soft leather shading with a slight sheen on the edges.
- *Lower body:* charcoal leggings or trousers.
- *Boots:* brown leather lace-up boots with thick cream shearling cuffs and chunky soles.
- *Pose:* weight on both feet, standing at the pool's edge. The right forearm is raised to chest
  height, holding a silver compass (a round case with a dark face, like a pocket watch) and
  angled toward the view. The left arm hangs relaxed. The head turns slightly right toward the
  compass and the plaza.
- *Light:* a back-lit silhouette with soft rim light from the openings on the beanie and the
  shoulders, a cool bounce from the pool on the left side, and a warm bounce from the floor
  underneath.

**Biscuit (the dog):**
- *Breed and shape:* a white Pomeranian or Samoyed puff. The body is nearly a sphere of fur, with
  a big fluffy ruff, a small fox-like muzzle and upright triangular ears with fur inside.
- *Face:* small black bead eyes, a black button nose and a slight smile.
- *Body:* short stubby legs and a plumed tail curled over the back.
- *Fur:* long soft clumped fur with visible strand tufts at the silhouette. The silhouette is
  fuzzy and broken, never smooth.
- *Colour:* warm cream with faint grey-brown shading in the fur's depth.
- *Placement:* stands on the lit plaza in three-quarter view facing the camera's left, with a soft
  contact shadow.

**Critters (three: two in full view, a third peeking in at the right edge):** round puff balls, slightly flattened, of the same cream fur. Each has two tiny
black dot eyes and a tiny mouth, and sits on the plaza floor in front of and to the right of
Biscuit. They read as dust bunnies with faces.

**Mira (the NPC):**
- a small chibi girl with a dark brown bob and bangs and a pale face;
- a dark navy outfit with a mint scarf or neckerchief;
- she stands behind the wooden balcony railing on the upper-left terrace, waving her right hand
  high;
- she sits in the hazy light near the left opening, so she is lower in contrast.

**The lavender pom:** a fuzzy lavender-grey ball on the ledge just above the pool, beside the
explorer's head. It is probably a collectible find or a sleeping critter.

### World

**Ceiling:**
- Huge overhanging block masses of rose-taupe and sand, stepped in terraces toward the viewer.
- Each block is very rounded (a bevel of about 15 to 20% of the block size) and slightly
  irregular, as if hand-shaped.
- Deep ambient occlusion lies in every seam.
- The surface is matte with a fine mottled suede or sandstone texture.
- The undersides are lit by soft bounce, and the edges near the openings catch warm light.

**Back wall and terraces:**
- Stacked blocks in the same family, stepping up into terraces on the left (to Mira's balcony and
  the left opening) and rising to the ceiling on the right.
- Their values rise toward the openings.

**Light openings:**
- Top left is a bright daylight passage: near-white, blooming, with haze washing out the area
  around Mira.
- Top right is a smaller skylight.
- The light is soft and diffuse rather than hard-edged god rays.

**The plaza:**
- A flat pale floor of cream and blush stone tiles behind the stairs, the brightest ground in the
  frame.
- Biscuit and the critters stand on it.

**Foreground floor:**
- Irregular pillowy flagstones in lilac, mauve, blush, warm grey and taupe, each slab individually
  puffed with rounded edges.
- Darker seams between them.
- Sizes vary, laid in a loose grid.

**Grass ledges:**
- Chunky blocks along the right and the foreground, each capped with a velvety sage felt layer.
- The cap wraps over the top edge with a soft rounded lip.
- The side faces are warm taupe.
- They step down toward the camera in big terraces.

**Stairs:** cream stone steps rising from the foreground floor up to the plaza in the middle right,
with rounded nosings and pale lit treads.

**The waterfall:**
- A stepped cascade of rounded ice-blue blocks coming down the left from the upper terrace.
- Each block is pillowy, with frosted near-white highlights along its top edges, like soft frozen
  water or blue felt.
- It is opaque, with no visible transparency or reflection.

**The pool:** a calm blue surface in front of the explorer, mottled with soft white cloud-like foam
patterns, bordered by the flagstones.

**The great door:**
- A tall double door on the right edge.
- It is inlaid with a maze-like geometric pattern of slate-grey stone and warm wood plank panels.
- It is set in a column of grey-brown stone blocks (pillar and lintel).

### Props

**Cube tree (middle top):**
- A crown of about 8 puffy rounded cubes in a 3 x 2 cluster with a top tier, in pale sage-grey.
- The crown has a flocked velvet texture, lighter on the tops and darker in the gaps.
- It stands on a thick square trunk of pale warm stone or wood, which grows from the upper
  terrace.

**Willow (right of the cube tree):**
- A domed mint crown of 3 or 4 lobes.
- Long hanging felt drips end in rounded tips and get lighter toward the ends.
- A straight beige trunk, and a tiny wooden fence or bench at its base.

**Mushrooms:** three small toadstools with tan caps and cream stems on the upper ledge, left of
centre.

**Stone jars (mint):**
- Four or five stacked rounded cylinders, like little stone lanterns or beehives.
- They have two or three tiers and a knob cap, in celadon and sage.
- They sit between the pool and the stairs.
- Cream versions sit on the terrace behind them.

**Balcony railing:** a light honey-wood railing with vertical slats around Mira's balcony.

### Atmosphere and finish

- **Haze:** a warm volumetric haze near the openings that lifts and softens the background.
- **Bloom:** at the openings only.
- **Contrast and tonemap:** the shadows are dark but never black (the 5th percentile is L 21), the
  highlights roll off softly, and the tonemap looks filmic.
- **Lens:** a mild vignette in the lower corners, a very slight overall softness, and no
  chromatic effects.

### HUD

**Top left panel (dark warm translucent, rounded):**
- 8 hearts: three full coral, one half, four empty dark.
- A "LEVEL" label with a pale blue-to-white XP bar at about 40%.
- A circular ring gauge with a green leaf or flame icon (stamina or spirit).

**Top right:**
- A compass strip with tick marks, cardinal letters and a white triangle marker at the centre.
- Below it, "QUEST TRACKER" in warm gold capitals.
- The quest line "INVESTIGATE THE GREAT CAVE DOOR (0/1)" in light capitals with a small animal
  icon.
- A clock pill with an icon and "14:57".

**Bottom left:** a square pixel-art minimap: a blue river, green land, black unexplored cave, a
pale view cone and a cyan player arrow, in a dark rounded frame.

**Bottom centre:** two dark translucent key prompts, "Press [E] to Inspect" and "L-SHIFT to Run".

**Type and style:** clean rounded sans capitals with light letter-spacing, on dark translucent
panels with thin light borders and soft corners.

The image has AI-generation artefacts ("SREAT" for "GREAT", garbled compass letters). We match
the intent, not the typos.

## 4. Gap to today's game

1. **Camera:** the game is first-person (hands and compass); the target is third-person with a
   full avatar.
2. **Scale:** the game's blocks are about half the player's height; the target's are about a
   quarter.
3. **Layout:** the Nest is laid out from the old painting. The target shows a different
   arrangement: the waterfall on the left, the pool in front, the plaza with stairs, Mira's
   balcony and the door on the right.
4. **Palette:** the target is far more muted (chroma 11 against about 19) and darker on average.
5. **Materials:** the target's blocks are larger-bevelled and individually irregular, with
   matte micro-texture. Our blocks have stitches and scalloped grass hems that the target does
   not have.
6. **Characters:** Biscuit and the critters need real fur volumes. The avatar and Mira need
   proper stylized models.
7. **Lighting:** the target relies on soft global illumination and deep ambient occlusion with
   only two light sources.
8. **HUD:** the layout and widgets differ.

## 5. The plan

### Principle: a shot-match harness

Every step is judged against the target from the same camera.
- `?shot=target` loads the Nest, places the explorer, Biscuit, the critters and Mira at their
  measured spots, sets the solved camera, and renders at 1125 x 1979 with the HUD.
- A comparison page shows the two frames side by side, with an onion-skin slider and per-pixel
  difference heat maps.

### S0 status: the target kit

- **Camera solve** (`docs/reference/target-shot/camera.json`):
  - from line-segment vanishing points: two floor directions at about -39 and +52 degrees from
    the view, and the verticals;
  - focal length about 950 px, so the field of view is about 92 degrees vertical and 61
    horizontal;
  - tilt about 11 degrees down, horizon at y 822;
  - the camera sits about 1.1 explorer-heights up and 1 explorer-height behind the boots.
- **Framing mode:** `?frame=target` in the game (`src/game/shot.js`) puts the camera there every
  frame and stands a placeholder explorer at the player's feet.
  `scripts/shot/capture.mjs` renders it at 1125 x 1979 with no HUD.
- **Scoring:** `scripts/shot/score.py` measures:
  - colour (CIEDE2000, lightness, chroma, warmth);
  - SSIM and edges;
  - detail and attention (saliency) map correlation;
  - learned-depth layout (Depth Anything V2 on both frames);
  - colour difference per element mask.

  `scripts/shot/report.py` builds the comparison page (an onion-skin wipe, the heat maps and the
  scores). `scripts/shot/fetch_models.sh` downloads the models into `.cache/models`.
- **Baseline** (today's Nest at spawn, Soft renderer, medium quality):

  | Metric | Score |
  |---|---|
  | Colour difference (mean / 90th percentile) | 21.3 / 35.3 |
  | Lightness | 57.9 (target 51.3) |
  | Chroma | 14.2 (target 11.2) |
  | SSIM | 0.41 |
  | Edge recall / precision | 0.24 / 0.36 |
  | Detail match | 0.10 |
  | Attention match | 0.19 |
  | Depth layout match | 0.79 |

### Techniques

1. **Camera solve:**
   - vanishing points from the floor, door and wall lines give the focal length, pitch and height
     (`solve_camera_pose.py` in the img2threejs skill);
   - then refine by projecting our block grid and minimising chamfer distance to the target's
     edge map.
2. **Layout reconstruction:** a block map of the cave authored from the shot. Floor contact
   points, the depth layers and the camera solve fix each block's position. A top-down tracing of
   the visible floor regions becomes the level data.
3. **Depth (done):** Depth Anything V2, run locally from its GitHub release. Our engine's depth
   buffer is compared with it using scale-invariant error, after a scale-and-shift fit.
4. **Segmentation (done):** `masks.png` is a label map, with one value per element listed in
   `masks.json`; `masks-overlay.jpg` shows it over the shot.
   - SAM3, through the Hugging Face Space, found the explorer, Biscuit, both trees, three critters
     and the lavender pom ("white fluffy ball"), the pool and the door.
   - The other elements come from Segment Anything ViT-B, run locally from box prompts
     (`scripts/shot/sam_boxes.py`).
   - `mask-colors.json` holds each element's shade, mid and light colour, measured inside its
     mask.
   - A third critter sits at the right edge of the frame, cut off by it.
   - the masks drive per-element metrics, so each object is scored separately.
5. **De-lighting and albedo:**
   - estimate each material's base colour with the shading removed (`delight_albedo.py`);
   - estimate its roughness and sheen from crops (`extract_pbr_evidence.py`).
6. **Colour heat maps:**
   - a per-pixel colour-difference map (CIEDE2000), our frame against the target, shows where
     colour is wrong;
   - matching maps for value (L), colourfulness (chroma) and warm-to-cool temperature;
   - the global grade is fitted first, then each material.
7. **Detail heat map:** match the amount of fine texture per region (Laplacian energy): smooth
   world, rich characters.
8. **Saliency match:** the eye must land in the same places. This is a correlation between the
   two saliency maps.
9. **Silhouettes and edges:** edge recall and precision, plus chamfer distance per mask, for the
   shapes of trees, blocks and characters.
10. **Light estimation:**
    - the highlight map and shading directions place two area lights at the openings plus sky
      fill;
    - global illumination is baked into light probes or lightmaps (the cave is static).
11. **Hidden sides:**
    - the front of the explorer and the back of Biscuit are designed from canon (the earlier
      painting shows the gloves and compass);
    - an image-edit model can propose turnarounds now that the reference is public in the repo.
12. **Procedural assets in code:**
    - *Block kit:* instanced rounded blocks, each with its own bevel, slight scale and rotation
      jitter, and a puffed top face.
    - *Surface texture:* triplanar matte micro-texture.
    - *Characters:* sculpted as signed-distance shapes, converted to meshes with marching cubes,
      and baked to GLB.
    - *Fur:* shells plus strand cards for Biscuit and the critters.
    - *Knit:* procedural knit normal maps (beanie ribs, sweater stitch) and a Fair Isle pattern
      texture generated in code.
13. **Rendering (high-end):**
    - three.js WebGPU;
    - physically based materials with sheen (felt and fur) and clearcoat (the compass);
    - baked bounce light, ground-truth ambient occlusion (GTAO), soft shadows;
    - bloom at the openings, a filmic tonemap (AgX), temporal anti-aliasing, mild depth of field,
      vignette and fine grain;
    - a third-person camera with collision.
14. **Animation:** a simple skeleton and procedural walk, idle and compass raise for the explorer.
    Fur jiggle and hops for Biscuit and the critters. A wave for Mira.

### Milestones

Each milestone ends with a side-by-side sheet, the scores, the playtests and a live deploy.

| Stage | Work | Pass mark at the matched camera |
|---|---|---|
| S0 Target kit | Camera solve, masks, depth, metric suite, `?shot=target`, comparison page | The harness renders and scores |
| S1 Blockout | Third-person camera, the new block scale, the shot's cave layout in grey, placeholder figures at measured spots | Depth error and edge chamfer within targets; silhouettes of the layout line up |
| S2 World look | Block kit, floor slabs, grass caps, ceiling, ice cascade and pool, door, the two openings, baked light, ambient occlusion, haze, grade | Mean colour difference ≤ 10; value and temperature maps match |
| S3 Props | Cube tree, willow, mushrooms, stone jars, railing, stairs, little fence, lavender pom | Per-mask colour difference ≤ 8; silhouette chamfer within targets |
| S4 Characters | The explorer (animated), Biscuit, critters, Mira | Saliency correlation ≥ 0.7; per-mask colour and detail match |
| S5 HUD | Hearts, level bar, ring gauge, compass strip, quest tracker, clock, minimap, prompts; portrait and landscape layouts | Layout overlay within a few pixels |
| S6 Finish | WebGPU renderer: temporal anti-aliasing, GTAO, depth of field, bloom; performance on strong GPUs; final side-by-side and a capture | Mean colour difference ≤ 9, SSIM ≥ 0.65, edge recall ≥ 0.55 |

The pass marks are first goals. They tighten once S0 shows what a matched blockout scores.

## 6. Decisions (settled 2026-10-31)

1. **Camera:** third-person over the shoulder by default. The first-person view with gloves and
   compass stays as a setting.
2. **Orientation:** both. The portrait frame matches the shot exactly; landscape adapts the same
   look and HUD.
3. **Outside tools:** the repo is public, so the reference has a public URL. Models whose weights
   are on GitHub (Depth Anything V2) run here. Hugging Face itself is still blocked from the
   container.
4. **Renderer:** a new WebGPU mesh renderer for strong GPUs. The current renderers stay as
   fallbacks until it is ready.
