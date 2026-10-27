#!/usr/bin/env python3
"""Willows fitted from their painted cut-outs: a top dome and drippy caps round it, on a trunk.

The painted willow is a small top dome with four caps round it, each hung with fat felt drips, on
a trunk. From the cut-out, cast onto the vertical plane through the tree's spot facing the painter
(world units, x across, y up):
- the trunk: the narrow rows at the bottom (width, centre, top);
- the canopy: its top, its widest half-width and the height of that row (the caps' rims);
- the drips: the lowest canopy point at DRIP_SAMPLES positions across the rim (the drips' ends).
Writes src/assets/willow-fits.json, read by src/assets/willow.js.

Usage: fit_willows.py
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
FAMILIES = {'willow'}
TRUNK = 0.35
DRIP_SAMPLES = 16


def main():
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    eye = np.array(cam.eye)
    fits = {}
    for r in json.load(open(REF / 'index.json'))['assets']:
        if r['family'] not in FAMILIES or 'position' not in r:
            continue
        rgba = np.asarray(Image.open(REF / r['file']))
        alpha = rgba[..., 3] > 127
        x0, y0 = r['crop']
        P = np.array(r['position'], float)
        n = eye - P
        n[1] = 0
        n /= np.linalg.norm(n)
        right = np.array([n[2], 0.0, -n[0]])
        vs, us = np.nonzero(alpha)
        pts = []
        for v, u in zip(vs, us):
            d = cam.ray(x0 + u + 0.5, y0 + v + 0.5)
            t = np.dot(P - eye, n) / np.dot(d, n)
            Q = eye + t * d - P
            pts.append((float(np.dot(Q, right)), float(Q[1])))
        pts = np.array(pts)
        ymax = pts[:, 1].max()
        bins = np.linspace(pts[:, 1].min(), ymax, 70)
        rows = []
        for a, b in zip(bins[:-1], bins[1:]):
            sel = pts[(pts[:, 1] >= a) & (pts[:, 1] < b)]
            if len(sel):
                rows.append(((a + b) / 2, sel[:, 0].min(), sel[:, 0].max()))
        wmax = max(x1 - x0_ for _, x0_, x1 in rows)
        trunk = [(y, a, b) for y, a, b in rows if b - a < TRUNK * wmax and y < ymax * 0.5]
        trunk_top = max((y for y, _, _ in trunk), default=0.0)
        cx = float(np.median([(a + b) / 2 for _, a, b in trunk])) if trunk else 0.0
        tw = float(np.median([b - a for _, a, b in trunk])) if trunk else wmax * 0.2
        canopy = [(y, a, b) for y, a, b in rows if y > trunk_top]
        y_w, a_w, b_w = max(canopy, key=lambda row: row[2] - row[1])
        W = (b_w - a_w) / 2
        ccx = (a_w + b_w) / 2
        # Drips' ends: the lowest canopy point per column band across the rim.
        cp = pts[pts[:, 1] > trunk_top]
        edges = np.linspace(ccx - W, ccx + W, DRIP_SAMPLES + 1)
        drips = []
        for a, b in zip(edges[:-1], edges[1:]):
            sel = cp[(cp[:, 0] >= a) & (cp[:, 0] < b)]
            drips.append(round(float(sel[:, 1].min()), 3) if len(sel) else round(float(y_w), 3))
        fits[r['id']] = {
            'family': r['family'], 'top': round(float(ymax), 3), 'rimY': round(float(y_w), 3),
            'halfWidth': round(float(W), 3), 'canopyX': round(float(ccx), 3),
            'drips': drips, 'trunk': {'x': round(cx, 3), 'width': round(tw, 3), 'top': round(float(trunk_top), 3)},
            'place': [round(float(v), 3) for v in P], 'facing': [round(float(n[0]), 4), round(float(n[2]), 4)],
            'paint': {'src': r['src'], 'x': x0, 'y': y0},
        }
        print(f"{r['id']}: top {ymax:.2f}, rim {y_w:.2f} half-width {W:.2f}, drips {min(drips):.2f}..{max(drips):.2f}, "
              f"trunk {tw:.2f} wide to {trunk_top:.2f}")
    (ROOT / 'src/assets/willow-fits.json').write_text(json.dumps({
        '_': 'Willows fitted from their painted cut-outs (scripts/assets/fit_willows.py): canopy top, the caps\' rim '
             'height and half-width, the drips\' ends across the rim (left to right as the painter sees it), the '
             'trunk; world units in the tree\'s frame (x across, y up).', 'fits': fits}, indent=1))


if __name__ == '__main__':
    main()
