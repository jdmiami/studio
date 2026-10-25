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
   light halo outside it, a softer crease where parts overlap, and a soft shadow falling right.
   Do not model outlines.
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

## The loop

With the dev server running (`npm run dev`):

```bash
scripts/kit/iterate.sh <family> <label> "<what changed>"
```

It renders only that family on the kit sheet (about 5 s), scores each element against its
reference crop, logs to `docs/kit/history/<family>.json`, and writes
`screenshots/kit/<label>-sheet.png` (reference | render, enlarged) to read back.

Per element: the render crop is aligned to the reference crop (within 6 px), then
`composite = 0.4 * fidelity + 0.3 * iou + 0.3 * color`:

- **iou**: silhouette overlap, for shape and size.
- **fidelity**: Divine Eye soft ensemble (pHash, SSIM, edges, tone, objectness) on the
  isolated crops, for structure and texture.
- **color**: region color match (ΔE on a 4 x 4 grid).

Change one thing per round, keep it only if the family mean rises, and read the sheet every few
rounds: the score is a guide, the reference is the judge.

`kit.html?family=trees`, `?only=id1,id2`, and `?overlay=0.5` (the reference drawn over the
render) help when looking by eye.
