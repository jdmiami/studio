# Phluph

A procedurally generated sandbox survival world where everything is real 3D fluff.
Built with Three.js; every Tuft, creature, tool, and cloud is rendered with shell fur.

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
tilt-shift for weaker GPUs. The script uses software WebGL (SwiftShader), so it works without
a GPU but takes about 30 seconds per frame.

## Build

```bash
npm run build      # static site in dist/
```

## Code

- `src/fur.js`: "Living Plush" shell fur used by every fluffy object: clumped curly strands, hand-dyed two-tone color, anisotropic sheen, glitter, iridescence, backlit glow, aerial haze
- `src/sky.js`: sunset candy sky with raymarched volumetric clouds
- `src/world.js`: the showcase island: Tufts, plush trees, a Fluffalo, a floating Comb, the Dew pond, distant islets, the cloud sea, dandelion seeds, glow motes
- `src/post.js`: god rays, bloom, tilt-shift, and the filmic grade
- `src/main.js`: renderer, camera, and URL flags

The visual plan and its status are in `docs/graphics-plan.md`.
