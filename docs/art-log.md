# Art log: the Soft (SDF) renderer, against the cave painting

`scripts/game/sdf-compare.mjs` renders four fixed views with no overlays:
- the Nest from the painting's own solved camera (fov 58.3, 1024 x 572);
- a Nest close-up;
- Biscuit;
- the meadow trip P6ZJAM2.

`scripts/fp/compare_frame.py` scores the first view against `docs/reference/cave-door.jpg`, with
the HUD and hands masked. Its columns: mean and 90th-percentile CIEDE2000 (lower is better),
luma SSIM, and edge recall and precision (higher is better). `scripts/game/art_sheet.py` builds
the before/after sheets.

| Milestone | Commit | mean dE | p90 dE | SSIM | edge recall | edge precision | Notes |
|---|---|---|---|---|---|---|---|
| M0 baseline | 8e6ab60 | 16.32 | 28.97 | 0.552 | 0.397 | 0.507 | first SDF renderer |
| M1 light | 969f7da | 16.37 | 29.41 | 0.547 | 0.406 | 0.497 | fill + bounce, warm terminator, AO, raymarched shafts, motes, bloom, diorama blur |
| M1b grade | 8a53dd5 | 16.22 | 28.84 | 0.548 | 0.409 | 0.495 | chalkier, crisper grade; icy water edges |
| M2 plush | 0a94287 | 15.82 | 28.22 | 0.545 | 0.404 | 0.508 | pillow blocks, running stitches, fur canopies, straw broom, knit dome, spotted toadstools, soft shadows without rings |
| M3 + M4 faces, motion | 20e0716 | 15.87 | 28.26 | 0.544 | 0.411 | 0.499 | faces and bubbles on the creatures; sway, breathing, boops, water flow, butterflies (the score holds: the motion and the faces barely touch the painting frame) |

## Notes

- **Lab statistics of the painting frame** (masked), against the raw SDF:
  - lightness: L mean 58.1 vs 56.8; 10th / 90th percentile 39 / 79 vs 43 / 72;
  - chroma: C 16.4 vs 19.4.

  The painting is chalkier and wider in value, so the SDF grade uses saturation 0.74 and
  contrast 0.95.
- **Worst cells after M2:** the right edge (the broom tree's trunk and the fence), bottom left (the
  water, still bluer and flatter than the painting's icy cascade), and the centre (the door).
- **Worst cells after M1b:**
  - the right-hand column (the broom tree and the knit dome: shapes, for M2);
  - the centre (the door and the dog);
  - bottom left (the water).
