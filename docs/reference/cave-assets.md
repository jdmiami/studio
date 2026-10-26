# Cave assets: manifest and provenance

Following `.claude/skills/create-game-assets` (inspect, lock the frame, manifest, hero first,
families, validate in context, provenance). Every cave asset comes from one of three sources:
the pastel-cubism kit (matched to `docs/reference/asset-kit.jpg`), a trace of the cave reference
(`docs/reference/cave-door.jpg`, camera `cave-door-camera.json`), or a procedural builder. No
image generation is used. One third-party model assists the tracing: Depth Anything V2 Small
(Apache-2.0), run locally on the CPU (see "Acceleration toolkit" below).

Frame: three.js, first person, 1024x572 reference view, 1 unit = 1 block, felt/knit textile
shader, colours from the references with the scene light divided out.

| Asset | Source | Method | Files | Status |
|---|---|---|---|---|
| Blocks (grass, earth, water, stone, seamed stone) | kit | kit cube designs at game density | `src/kit/families/blocks.js`, `src/cave/level.js` | in game |
| Grass blankets | procedural | one draped felt blanket per terrace, scalloped hem | `src/cave/grass.js` | in game |
| Layout | trace | layout fitted to the reference's surface classes under the solved camera, hand corrections | `src/cave/layout.json`, `scripts/fp/fit_layout.py`, `layout_edits.py` | in game; open items in `fit-notes.md` |
| Cube tree, willow, knit domes, mushrooms, fence, dog, critters | kit | kit page export: warped + baked models as glTF (meshopt) | `public/kit/kit-props.glb`, `scripts/kit/export_glb.mjs`, `src/cave/kit-assets.js` | in game |
| Great door (hero) | trace | door rectified by homography; seams traced (black-hat lines) into a relief map; painting as colour | `public/cave/door-*.png`, `scripts/fp/trace_door.py`, `src/cave/door.js` | in game; door region edge recall 0.92 |
| Stepped domes (13 instances) | trace | silhouette by GrabCut seeded with the segmentation and monocular depth; turned as a lathe of the silhouette's half-width per row, grooved at the tier lines traced inside it, painted colour per tier | `src/cave/traced-props.json`, `scripts/fp/trace_props.py`, `src/cave/traced-props.js` | second pass: beehive outlines; the terraces they stand on sit nearer than painted (layout) |
| Broom tree | trace | lathe of the traced radius bands, painted colour per band, fluted; felt handle | same | first pass: no green collar band |
| Scaffold, light shafts | procedural | old builders | `src/cave/props.js` | to trace |
| NPC on the scaffold | — | needs the img2threejs character track | — | not built |

Regenerate after a layout change: `python3 scripts/fp/place_props.py`, `python3 scripts/fp/trace_props.py`
(the door does not depend on the layout).

## Acceleration toolkit

What speeds up turning the reference into assets, and what was tried (October 2026):

- **Monocular depth, local.** Depth Anything V2 Small as ONNX (from the fabio-sim/Depth-Anything-ONNX
  GitHub release; cached in `~/.cache/phluph/`) runs in under a second per 518 px tile on the CPU.
  `scripts/fp/depth_ref.py` runs the whole painting in overlapping tiles, calibrates the relative
  depth to the solved camera against the layout's own render, back-projects every pixel and lists
  the layout cells whose painted top or ceiling disagrees (`cave-door-depth-check.json`,
  `screenshots/fp/depth-check.png`). The calibration's median error is about 8%, roughly a block at
  the back of the cave, so it flags large mistakes only and is not a layout solver.
- **Depth-seeded silhouettes.** `trace_props.py` runs the model on a square crop around each prop
  at its full input size, so a 30 px prop gets sharp edges. The prop stands nearer than the
  terrace behind it, which separates a dome from felt of the same colour. By eye on
  `screenshots/fp/props-trace.png`, the pink, beige, peach and green domes that leaked now hug their
  outlines. The one that still leaked (the dog's fur caught in a bush box) is rejected
  automatically. Two small green domes on green terraces are still under-segmented.
- **Silhouette lathes.** A round prop's outline is its profile: turning the traced half-width per
  row gives the painted shape in one step, with no per-asset modelling.
- **Projection-first colour** (img2threejs `likeness_maximization.md`): the door already takes the
  painting's own pixels. Extending this to every surface the reference camera sees is the next
  lever. Project the de-lit painting onto the meshes and bake it into vertex colours, keeping the
  procedural colour on faces the painting does not show.
- **Image-to-3D models** (TRELLIS.2, Hunyuan3D 2.1, TripoSR, Stable Fast 3D) are not reachable from
  this environment. The model weights are on Hugging Face, which the network policy blocks. Their
  Spaces are not exposed as MCP tools, so the Hugging Face connector cannot call them. Their
  output is also photoreal PBR, not this felt style, so they would give blockouts at best.
- **Hosted depth and segmentation Spaces** (Depth Pro, SAM3) can be called through the Hugging Face
  connector, but they need a public image URL. The repo is private and the Vercel deploys are
  protected, so using them would mean publishing the reference image.
