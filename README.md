# Phluph

A procedurally generated sandbox survival world where everything is real 3D fluff.
Built with Three.js as a soft pastel textile world: stitched felt ground, knitted hills, velvet
flowers, tassel-yarn willows, shag fields, felt cutout clouds, and a cotton-wool waterfall.

The gameplay design lives in `.claude/skills/phluph-world/SKILL.md`.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173 - drag to orbit, scroll to zoom
```

## Screenshot

With the dev server running:

```bash
npm run screenshot              # saves screenshots/phluph.png
node scripts/screenshot.mjs out.png --shot=6 --size=1920x1080
```

`?shot=<seconds>` in the URL freezes time for a repeatable frame, and `?cam=x,y,z` sets the
starting camera (the screenshot script takes `--cam=x,y,z`). `?lowfx=1` skips god rays and
tilt-shift for weaker GPUs, and `?bloom=<strength>` overrides bloom. The screenshot script passes
extra flags with `--query=lowfx=1&bloom=0`. The script uses software WebGL (SwiftShader), so it works without
a GPU but takes about 30 seconds per frame.

## Build

```bash
npm run build      # static site in dist/
```

## Code

- `src/textile.js`: felt, knit, velvet, and yarn-wrap surface shader (stitches, plied yarn, velvet sheen)
- `src/fur.js`: shell fur for shag, pom-poms, fleece, and cotton wool (clumps, curls, sheen, flow)
- `src/sky.js`: pastel sky (the volumetric cloud layer is switched off in favor of felt clouds)
- `src/world/`: the island, one module per feature: `terrain.js` (biomes), `trees.js` (tassel willows), `hills.js` (knitted hills and rocks), `flora.js` (velvet flowers), `clouds.js` (felt clouds and sun), `water.js` (pond and waterfall), `creatures.js` (Fluffalo), `props.js` (Comb, islets, seeds, motes), `util.js` (palettes, biome map, heights)
- `src/post.js`: god rays, bloom, tilt-shift, and the pastel grade
- `src/main.js`: renderer, camera, and URL flags

Design docs: `docs/materials-plan.md` (the textile world and its status) and `docs/graphics-plan.md` (the earlier lighting and lens pass).
