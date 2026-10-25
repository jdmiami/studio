# Phluph

A procedurally generated sandbox survival world where everything is real 3D fluff.
Built with Three.js as a textile world in natural colors: stitched grass-green felt ground,
knitted hills, velvet flowers, tassel-yarn willows, shag grass, felt cutout clouds in a blue sky,
and a cotton-wool waterfall.

The gameplay design lives in `.claude/skills/phluph-world/SKILL.md`.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

The default scene is **The Great Cave Door**, a first-person level built to match
`docs/reference/cave-door.jpg`. Click to look around, WASD to move, Shift to run, Space to jump,
E to interact (inspect the door, pet the dog). Add `?scene=island` for the orbiting island
showcase (drag to orbit, scroll to zoom).

## Screenshot

With the dev server running:

```bash
npm run screenshot              # saves screenshots/phluph.png
node scripts/screenshot.mjs out.png --shot=6 --size=1920x1080
```

`?shot=<seconds>` in the URL freezes time for a repeatable frame, and `?cam=x,y,z` sets the
island's starting camera (the screenshot script takes `--cam=x,y,z`). `?lowfx=1` skips god rays and
tilt-shift for weaker GPUs, `?bloom=<strength>` overrides bloom, and `?only=terrain` renders
the island grid alone (for debugging). The screenshot script passes
extra flags with `--query=lowfx=1&bloom=0`. The script uses software WebGL (SwiftShader), so it works without
a GPU but takes about 30 seconds per frame.

## Test

With the dev server running, `npm run test:walk` drives the first-person controls in headless
Chromium: it holds W and checks the player moved forward on the ground, then strafes into the
right-hand terrace and checks collision stopped them.

## Build

```bash
npm run build      # static site in dist/
```

## Code

- `src/textile.js`: felt, knit, velvet, and yarn-wrap surface shader (stitches, plied yarn, velvet sheen)
- `src/fur.js`: shell fur for shag, pom-poms, fleece, and cotton wool (clumps, curls, sheen, flow)
- `src/sky.js`: blue sky (the volumetric cloud layer is switched off in favor of felt clouds)
- `src/world/`: the island, one module per feature: `terrain.js` (biomes), `trees.js` (tassel willows), `hills.js` (knitted hills and rocks), `flora.js` (velvet flowers), `clouds.js` (felt clouds and sun), `water.js` (pond and waterfall), `creatures.js` (Fluffalo), `props.js` (Comb, islets, seeds, motes), `util.js` (palettes, biome map, heights)
- `src/post.js`: god rays, bloom, tilt-shift, and the color grade
- `src/cave/`: the first-person level: `level.js` (block grid, grass and foam caps, collision heights), `props.js` (door, trees, shrub, fence, mushrooms, dog, critters, scaffold, light shafts), `index.js` (placement and interactions)
- `src/fp/`: first-person systems: `controls.js` (mouse look, movement, gravity, step-up collision), `hands.js` (gloved hands, fluff stone, radar compass), `hud.js` (hearts, level, stamina ring, compass strip, quest tracker, timer, minimap, prompts)
- `src/main.js`: renderer, scene selection, and URL flags

Design docs: `docs/fp-reference-analysis.md` (the first-person reference broken down with the
img2threejs image-analysis protocol), `docs/materials-plan.md` (the textile world), and
`docs/graphics-plan.md` (the earlier lighting and lens pass).

The `img2threejs` skill (image to procedural Three.js) is vendored under
`.claude/skills/img2threejs`; see its `VENDORED.md`.
