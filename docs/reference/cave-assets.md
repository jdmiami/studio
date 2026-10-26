# Cave assets: manifest and provenance

Following `.claude/skills/create-game-assets` (inspect, lock the frame, manifest, hero first,
families, validate in context, provenance). Every cave asset comes from one of three sources:
the pastel-cubism kit (matched to `docs/reference/asset-kit.jpg`), a trace of the cave reference
(`docs/reference/cave-door.jpg`, camera `cave-door-camera.json`), or a procedural builder. No
image generation is used; nothing third-party.

Frame: three.js, first person, 1024x572 reference view, 1 unit = 1 block, felt/knit textile
shader, colours from the references with the scene light divided out.

| Asset | Source | Method | Files | Status |
|---|---|---|---|---|
| Blocks (grass, earth, water, stone, seamed stone) | kit | kit cube designs at game density | `src/kit/families/blocks.js`, `src/cave/level.js` | in game |
| Grass blankets | procedural | one draped felt blanket per terrace, scalloped hem | `src/cave/grass.js` | in game |
| Layout | trace | layout fitted to the reference's surface classes under the solved camera, hand corrections | `src/cave/layout.json`, `scripts/fp/fit_layout.py`, `layout_edits.py` | in game; open items in `fit-notes.md` |
| Cube tree, willow, knit domes, mushrooms, fence, dog, critters | kit | kit page export: warped + baked models as glTF (meshopt) | `public/kit/kit-props.glb`, `scripts/kit/export_glb.mjs`, `src/cave/kit-assets.js` | in game |
| Great door (hero) | trace | door rectified by homography; seams traced (black-hat lines) into a relief map; painting as colour | `public/cave/door-*.png`, `scripts/fp/trace_door.py`, `src/cave/door.js` | in game; door region edge recall 0.92 |
| Stepped domes (14 instances) | trace | GrabCut silhouette; tiers from the lines traced inside it; per-tier width, height, painted colour; stacked felt tiers | `src/cave/traced-props.json`, `scripts/fp/trace_props.py`, `src/cave/traced-props.js` | first pass: tiers read flatter than the painting's beehives |
| Broom tree | trace | lathe of the traced radius bands, painted colour per band, fluted; felt handle | same | first pass: no green collar band |
| Scaffold, light shafts | procedural | old builders | `src/cave/props.js` | to trace |
| NPC on the scaffold | — | needs the img2threejs character track | — | not built |

Regenerate after a layout change: `python3 scripts/fp/place_props.py`, `python3 scripts/fp/trace_props.py`
(the door does not depend on the layout).
