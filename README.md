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

`?shot=<seconds>` in the URL freezes time for a repeatable frame. The script uses software
WebGL (SwiftShader), so it works without a GPU but takes about 30 seconds per frame.

## Build

```bash
npm run build      # static site in dist/
```

## Code

- `src/fur.js`: shell fur shader used by every fluffy object (wind, gravity, translucency, rim light)
- `src/sky.js`: candy sky with raymarched volumetric clouds
- `src/world.js`: the showcase island: Tufts, plush trees, a Fluffalo, a floating Comb, the cloud sea, glow motes
- `src/main.js`: renderer, camera, bloom, and the oversaturated color grade
