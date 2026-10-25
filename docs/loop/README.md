# Reference-matching loop

The first-person cave is tuned against `docs/reference/cave-door.jpg` by a scored loop instead of
by eye. Each round renders the opening frame, scores it against the reference, and keeps the
change only if the score goes up.

## Score

`scripts/loop/score.py` combines two signals:

- **fidelity**: the img2threejs Divine Eye ensemble (SSIM, edge overlap, perceptual hash, tonal
  parity, flat-region score).
- **colorLayout**: both images are cut into a 16 x 9 grid of regions, and the mean CIE76 color
  difference (ΔE) between matching regions is scaled so ΔE 40 scores 0.

`composite = 0.5 * fidelity + 0.5 * colorLayout`. The reference scores 1.0 against itself, and a
flat grey frame scores 0.41.

## Running a round

With the dev server up (`npm run dev`):

```bash
scripts/loop/iterate.sh i23-label "what changed"
python3 scripts/loop/diff.py docs/reference/cave-door.jpg screenshots/loop/i23-label.png
```

`iterate.sh` renders the frame at 1024 x 572 (the reference size), appends the score to
`history.json`, and writes a side-by-side sheet to `screenshots/loop/`. `diff.py` prints the
per-region lightness and color error grid, which shows where to look next.

Rules: one correction group per round (camera, then silhouette/layout, then materials, then
lighting); revert any change that lowers the composite; stop when three rounds in a row gain less
than 0.005.

## Result

| | composite | fidelity | colorLayout | mean ΔE |
|---|---|---|---|---|
| Baseline (round 0) | 0.552 | 0.624 | 0.481 | 20.8 |
| Final (round 21) | **0.678** | 0.738 | 0.618 | 15.3 |

The loop stopped on the plateau rule after round 21, short of the 0.75 target.

What helped most:

- **Layout (rounds 3–4).** The player now starts left of the door's axis on a raised landing,
  so the door sits right of center. Water fills the lower left and terraces climb between the
  water and the floor. Round 3 scored below the baseline, but it was kept as the base for the
  rebuild, and round 4 beat the baseline.
- **Lighting (round 10).** A daylight opening high in the left wall and a lighter ceiling: +0.045.
- **Hands and HUD (rounds 5–6, 14).** Larger gloves placed like the reference, and a dark pixel
  minimap.
- **Palette and grade (rounds 7, 21).** Lower-chroma beige walls, sage grass, and saturation 0.9.

Rejected: rounds 1–2 (camera moves alone), 15 (window glow card), 16 (lighter gloves), 18–19
(skylight glow card), and 20 (saturation 0.8). Every round is in `history.json`.

Where the frame still differs most:

- **Hands.** The reference sleeves show at the bottom corners.
- **Upper left.** The reference has a warm light patch there.
- **Ceiling and walls.** The reference has large irregular rock slabs where the level has a
  regular block grid.
- **Skylight glow.** The reference has a bright skylight above the door.

Before and after: `baseline-compare.jpg`, `final-compare.jpg` (reference on the left, render on
the right; the sheet crops both to a square).
