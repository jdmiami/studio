---
name: pastel-cubism
description: Build procedural Three.js game elements in Phluph's "pastel cubism" style (soft rounded cubes, matte felt, plush fur and chunky knit in chalky pastels, three-tone light, thin dark outline) and verify each element against the reference sheet docs/reference/asset-kit.jpg with a scored loop. Use when adding or changing a kit element (block, tree, bush, mushroom, fence, prop, creature) or anything under src/kit/.
---

# Pastel cubism

The game's elements are built in code, not modeled or downloaded, and every one follows the
same look, measured from the reference sheet `docs/reference/asset-kit.jpg` (512 x 286, 31
elements). The kit page `kit.html` shows them all on one sheet, posed and lit like the
reference, so each element can be scored against its own crop.

## The look

1. **Everything is a soft cube, pillow, or ball.** Rounded boxes (radius about 0.13 of the size),
   faces bulged slightly toward a sphere, surfaces pressed by gentle lumps. Nothing is sharp,
   glossy, or thin unless the reference shows it (fence rails, lollipop sticks).
2. **Hand-made materials.** Matte felt with visible fiber mottling (most things), plush shell
   fur (tree canopies, the dog, critters, pom-poms), chunky knit (domes). No specular shine.
3. **Chalky pastels.** Colors are measured, not invented; see `PASTEL` in `src/kit/style.js`.
   Use the measured hex values and a deeper partner color for mottling.
4. **Three-tone light from the upper left.** Top faces brightest, left faces (+z) about 0.87 of
   the top's light, right faces (+x) about 0.47. Do not add lights: the shared shader uniforms
   (`applyKitLighting`) already give this. Bake contact darkening with `shadeBottom`.
5. **Outline and shadow come from the stage.** A thin dark line inside each silhouette, a faint
   light halo outside it, a softer crease where parts overlap. Do not model outlines. Shadows are
   per element: the sheet's are not one light (blocks cast short ones; trees, fences and props
   long soft ones thrown back and to the right, in a blue-grey), so most elements drop the global
   cast shadow for fitted ones (see the loop).
6. **Composition over detail.** Build elements from a few readable primitives (a cube tree is a
   trunk plus a cluster of fuzzy cubes; a grass cap is a slab plus a ring of felt drops). Detail
   below about 2 reference pixels does not survive the sheet's resolution.

## The stage (fixed; shared by every element)

- Orthographic camera at azimuth 45° (looking from +x +z) and elevation 35°, 39.5 reference
  pixels per world unit. One block is 1 x 1 x 1.
- Background `#dcdcdc`, linear rendering with an sRGB encode in the final pass (no tone curve).
- `src/kit/render.js` draws the outline and halo from the depth buffer; the ground writes no
  depth, so only elements get outlines.

## Building an element

Each family lives in `src/kit/families/<family>.js` and exports
`build(variant, random, item) -> THREE.Object3D`, with the element's base center at the origin
on the ground (y = 0). It may export `ANCHORS = { id: [u, v] }` to move where an item stands on
the sheet. Items and their reference boxes are listed in `src/kit/manifest.js`.

Helpers in `src/kit/style.js`:

| Helper | Use |
|---|---|
| `softBox(w, h, d, { radius, res })` | evenly subdivided, welded rounded box (lumps and mottling need the subdivision) |
| `bulge(geometry, amount)` | push faces toward a sphere: pillow, not brick |
| `lumpy(geometry, { amount, scale, seed })` | hand-pressed surface; keep `amount` small (about 0.01) or the silhouette wobbles |
| `mottle(geometry, colorA, colorB, { scale, stretch, ridged })` | vertex-color fiber clouds; `ridged` makes thin fold creases |
| `shadeBottom(geometry, { from, to, dark })` | soft contact darkening toward the base |
| `felt(color, { fuzz, grain })` | matte felt material (grain 3.4 by default) |
| `knit(color, { rows, stripes })` | chunky knit material (needs geometry uv) |
| `plush(geometry, color, options)` | shell fur (`createFur`) |
| `noise3(x, y, z, seed)` | smooth noise for your own shaping |
| `PASTEL` | measured albedo colors |

Rules that keep elements correct:

- Weld or use `softBox` before deforming; deforming an unwelded box opens seam cracks, which
  the outline pass then draws as dark dots.
- Don't call `computeVertexNormals` on unwelded geometry before displacement.
- Merged geometries must share attributes: drop `uv` (or keep it everywhere) before
  `mergeGeometries`.
- Stay within the element's box: the score compares silhouettes.

## The loop (per-pixel, until the element passes)

With the dev server running (`npm run dev`). Every element must pass `scripts/kit/pixel_test.py`:
the render's crop aligned to the reference's (half-pixel steps) and compared at the sheet's own
resolution, IoU >= 0.95 (hole-filled non-background masks: **the masks include cast shadows**),
mean CIEDE2000 <= 6, p90 <= 12, worst 6x6 patch <= 14, SSIM >= 0.70, whole-crop dE <= 5. It writes
`screenshots/kit/progress/<id>.png` (reference | render | dE heat map) and `--board` sheets.

```bash
node scripts/screenshot.mjs out.png --page=kit.html --size=1024x572 --query="family=trees,domes"
python3 scripts/kit/pixel_test.py out.png --family domes --board board.png
```

Render a family **with its neighbours** (`family=a,b`): shadows reach into each other's crops.

### 1. Shape: fit the silhouette, then build it

Pick the fitter that matches the element's construction; each projects its parts through the
kit camera in Python and maximizes IoU against the reference silhouette, printing parameters the
family file stores (with `ANCHORS`):

| Fitter | For |
|---|---|
| `silfit.py` | clusters of rounded-cube puffs (cube-tree canopies) |
| `lathefit.py` | solids of revolution: domes, bushes, mushrooms (`--lean`, `--fixed` for a second part, `--target test` for small elements) |
| `fencefit.py` | posts and rails (capsules); fits the wood itself, not the hole-filled mask |
| `lollipopfit.py` | a disc on a stick (`--union` for pale candy whose outline leaks) |
| `boxfit.py` | world-aligned rounded boxes (arches); removes the enclosed opening; nothing below y = 0 |
| `ellipsefit.py` | ellipsoid clusters (dog: body, head, tail, legs, ears, scarf; critters) |
| `dripfit.py` | willow strand lengths per column |

Targets: the test's mask less the ground shadow (`lathefit.test_target`), eroded by about a pixel,
because the kit's render reads about a pixel wider than its geometry. The ground writes no depth,
so geometry below y = 0 shows: keep parts above it.

### 2. Finish: bake the reference's colours

The page bakes the reference's de-lit colours into the felt as vertex colours (`src/kit/bake.js`),
so build enough vertices (about one per sheet pixel where there is detail: faces, swirls, knit),
and faces as rings, not fans. Per element `BAKE = { id: { skipNeutral: false } }` (white fur,
dark eyes) or `{ margin: 1 }` (thin rails and sticks). Only felt meshes bake.

### 3. Outline: the warp

`src/kit/warp.js` nudges silhouette vertices (3 passes, at most a few pixels) onto the reference
outline, measured with the test's own masks on the actual render. It fades out near the ground.

### 4. Shadows: fit them

- `shadowfit.py ids... --mask test --margin 1 --core [--open fences] [--through willows]`
  fits soft blobs and their colour to the reference ground, jointly (neighbours' fitted blobs are
  held fixed); `apply_shadows.py <family> fit.json` writes `SHADOWS` (cast: false, colour,
  blobs). Fit the whole row at once when crops share shadows (`--region-margin 24`).
- `planarfit.py` fits planar soft shadows (an element's own shape flattened along its own
  direction: fences) for `SHADOWS[id].planar`.
- Contact decals are one per part standing on the ground; set `contact` low or 0 where the
  reference shows light ground under an element, and `userData.noContact` on parts that only brush
  the ground (willow drips).

### 5. Register, then read the board

`register.py <family> --write --with <neighbours>` moves anchors until the test's offset is 0
(the bake samples where the element stands). Registering after the warp can oscillate by half a
pixel; keep the anchor that scored best. Then read the board: the heat map says where, the zoomed
crops (`maskdiff.py`, `edgeprofile.py`, `--dump=__kitWarp|__kitBake` on screenshot.mjs) say why.

Global settings (line strength and width in `render.js`, warp passes) are chosen by a sweep over
every built family, never by one element.

URL flags (`kit.html?...`): `family=a,b`, `only=`, `overlay=0.5`, `finish=procedural`, `warp=N`,
`line=side,up,width,down`, `fit=`, `anchor=`, `blobs=`, `planar=`, `contact=`, `shadow=`,
`warpprobe=id`.
