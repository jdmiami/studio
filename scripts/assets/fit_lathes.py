#!/usr/bin/env python3
"""Round assets turned from their painted outline: one lathe profile per reference.

For the round families (mushrooms, knit domes, the pom, the critters), the painted cut-out of each
(docs/reference/assets/<id>.png, scripts/assets/reference_sheet.py) is its silhouette seen from the
side, so its half-width per row is the radius of the solid at that height. Per reference:
- the profile, bottom up, in world units: heights with the vertical px per unit at its spot, radii
  with the horizontal px per unit across the viewing ray (off the optical axis perspective
  stretches a round object sideways), median-smoothed, resampled to at most POINTS rows;
- lift: how far the outline's bottom sits above the base pixel (zero when it stands on it);
- place: the world spot, its axis shifted across the viewing ray onto the silhouette's centre
  (a vertical axis leans in the frame, so the base pixel is not the centre higher up);
- paint: the cut-out to projection-paint it from.
Writes src/assets/lathe-fits.json, read by src/assets/library.js.

Usage: fit_lathes.py
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fp'))
from trace_blocks import Camera  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'docs/reference/assets'
FAMILIES = {'mushroom', 'knit-shrub', 'knit-bush', 'pom', 'critter', 'stone', 'bush'}
POINTS = 48


def main():
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    eye = np.array(cam.eye)
    fits = {}
    for r in json.load(open(REF / 'index.json'))['assets']:
        if r['family'] not in FAMILIES or 'position' not in r:
            continue
        alpha = np.asarray(Image.open(REF / r['file']))[..., 3] > 127
        rows = [i for i in range(alpha.shape[0]) if alpha[i].any()]
        if len(rows) < 4:
            continue
        x0, y0 = r['crop']
        P = np.array(r['position'], float)
        ppu = r['ppu']
        ray = P - eye
        right = np.array([-ray[2], 0.0, ray[0]]) / np.hypot(ray[0], ray[2])
        top, bottom = rows[0], rows[-1]
        half, centre = [], []
        for i in range(top, bottom + 1):
            xs = np.nonzero(alpha[i])[0]
            if len(xs):
                half.append((xs[-1] + 1 - xs[0]) / 2)
                centre.append(x0 + (xs[0] + xs[-1] + 1) / 2)
            else:
                half.append(half[-1] if half else 0)
                centre.append(centre[-1] if centre else x0)
        # Median over 5 rows (drops single-row jags of the cut-out), then a 3-row mean: lathes of a
        # jagged outline show rings all round.
        half = np.array([np.median(half[max(0, i - 2):i + 3]) for i in range(len(half))])
        half = np.array([np.mean(half[max(0, i - 1):i + 2]) for i in range(len(half))])
        ys = (bottom + 1 - np.arange(top, bottom + 1) - 0.5) / ppu
        # Lift: the outline's bottom above the base pixel.
        lift = max(0.0, (r['base'][1] - (y0 + bottom + 1)) / ppu)
        # Axis on the silhouette's centre at mid height.
        mid = len(half) // 2
        C = P + np.array([0, lift + ys[mid], 0])
        ppu_w = float(np.linalg.norm(cam.project(C + right * 0.5) - cam.project(C - right * 0.5)))
        shift_px = float(np.median(centre)) - cam.project(C)[0]
        place = P + right * shift_px / ppu_w
        pick = np.unique(np.linspace(0, len(half) - 1, min(POINTS, len(half))).round().astype(int))[::-1]
        profile = [[round(float(ys[i]), 4), round(float(half[i] / ppu_w), 4)] for i in pick]  # bottom first
        fits[r['id']] = {'family': r['family'], 'profile': profile, 'lift': round(lift, 3),
                         'place': [round(float(v), 3) for v in place],
                         'paint': {'src': r['src'], 'x': x0, 'y': y0}}
    (ROOT / 'src/assets/lathe-fits.json').write_text(json.dumps({
        '_': 'Round assets turned from their painted outline (scripts/assets/fit_lathes.py): per reference the '
             'lathe profile [height, radius] bottom up (world units), the lift above its base, its world spot '
             '(axis on the painted silhouette) and the cut-out it is painted from.',
        'fits': fits}, indent=1))
    print(f'{len(fits)} lathe fits -> src/assets/lathe-fits.json: ' + ', '.join(fits))


if __name__ == '__main__':
    main()
