#!/usr/bin/env python3
"""Cube trees fitted from their painted cut-outs: a canopy of puffy cubes on a trunk.

The painted cube tree is a cluster of rounded felt cubes (two on top, a wider row below) on a
thick trunk. From its cut-out (docs/reference/assets/<id>.png):
1. every outline pixel is cast onto the vertical plane through the tree's spot that faces the
   painter: the silhouette in world units (x across, y up);
2. the rows narrower than TRUNK of the widest are the trunk (its width and height), the rest is
   canopy;
3. the canopy is gridded at its width / CUBES_ACROSS: every cell the silhouette covers at least
   FILL of is a cube; each row is as deep as it is wide (the canopy is round from above).
Writes src/assets/cubetree-fits.json, read by src/assets/cubetree.js.

Usage: fit_cubetrees.py
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
FAMILIES = {'cube-tree'}
TRUNK = 0.4
CUBES_ACROSS = 3.8  # the front row: four cubes, the outer two the canopy's sides in perspective
FILL = 0.45


def main():
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    eye = np.array(cam.eye)
    fits = {}
    for r in json.load(open(REF / 'index.json'))['assets']:
        if r['family'] not in FAMILIES or 'position' not in r:
            continue
        alpha = np.asarray(Image.open(REF / r['file']))[..., 3] > 127
        x0, y0 = r['crop']
        P = np.array(r['position'], float)
        n = eye - P
        n[1] = 0
        n /= np.linalg.norm(n)
        right = np.array([n[2], 0.0, -n[0]])  # across, as the painter sees it (left to right)
        # World (across, up) of every outline pixel on the plane through P facing the painter.
        vs, us = np.nonzero(alpha)
        pts = []
        for v, u in zip(vs, us):
            d = cam.ray(x0 + u + 0.5, y0 + v + 0.5)
            t = np.dot(P - eye, n) / np.dot(d, n)
            Q = eye + t * d - P
            pts.append((float(np.dot(Q, right)), float(Q[1])))
        pts = np.array(pts)
        # Rows (in world height bins) and their widths.
        ymax = pts[:, 1].max()
        bins = np.linspace(0, ymax, 60)
        widths = []
        for a, b in zip(bins[:-1], bins[1:]):
            sel = pts[(pts[:, 1] >= a) & (pts[:, 1] < b)]
            widths.append((a, b, sel[:, 0].min() if len(sel) else 0, sel[:, 0].max() if len(sel) else 0))
        wmax = max(w[3] - w[2] for w in widths)
        trunk_rows = [w for w in widths if 0 < w[3] - w[2] < TRUNK * wmax]
        canopy_y0 = max((w[1] for w in trunk_rows if w[1] < ymax * 0.6), default=0.0)
        trunk = trunk_rows and [w for w in trunk_rows if w[1] <= canopy_y0 + 1e-6]
        tw = float(np.median([w[3] - w[2] for w in trunk])) if trunk else wmax * 0.2
        tx = float(np.median([(w[3] + w[2]) / 2 for w in trunk])) if trunk else 0.0
        # Canopy grid.
        cp = pts[pts[:, 1] >= canopy_y0]
        cx0, cx1 = cp[:, 0].min(), cp[:, 0].max()
        s = (cx1 - cx0) / CUBES_ACROSS
        nx = int(np.ceil((cx1 - cx0) / s))
        ny = int(np.ceil((ymax - canopy_y0) / s))
        # Coverage per cell: rasterise the canopy points at a fine step.
        fine = 24
        grid = np.zeros((ny * fine, nx * fine), bool)
        gi = np.clip(((cp[:, 1] - canopy_y0) / s * fine).astype(int), 0, ny * fine - 1)
        gj = np.clip(((cp[:, 0] - cx0) / s * fine).astype(int), 0, nx * fine - 1)
        grid[gi, gj] = True
        from scipy.ndimage import binary_closing  # noqa: PLC0415
        grid = binary_closing(grid, np.ones((3, 3)), iterations=2)
        cells = []
        for j in range(ny):
            row = []
            for i in range(nx):
                cov = grid[j * fine:(j + 1) * fine, i * fine:(i + 1) * fine].mean()
                if cov >= FILL:
                    row.append(i)
            if row:
                cells.append({'row': j, 'cols': row})
        fits[r['id']] = {
            'family': r['family'], 'cube': round(float(s), 3),
            'canopy': {'x0': round(float(cx0), 3), 'y0': round(float(canopy_y0), 3), 'rows': cells},
            'trunk': {'x': round(tx, 3), 'width': round(tw, 3), 'height': round(float(canopy_y0) + s * 0.3, 3)},
            'place': [round(float(v), 3) for v in P], 'facing': [round(float(n[0]), 4), round(float(n[2]), 4)],
            'paint': {'src': r['src'], 'x': x0, 'y': y0},
        }
        print(f"{r['id']}: cube {s:.2f}, canopy from {canopy_y0:.2f}, rows " +
              ' | '.join(f"{c['row']}:{c['cols']}" for c in cells) + f", trunk {tw:.2f} wide at {tx:.2f}")
    (ROOT / 'src/assets/cubetree-fits.json').write_text(json.dumps({
        '_': 'Cube trees fitted from their painted cut-outs (scripts/assets/fit_cubetrees.py): canopy cube size, '
             'the cells per row (front view, x from canopy.x0 in cubes, rows up from canopy.y0), the trunk; world '
             'units in the tree\'s frame (x across as the painter sees it, y up).', 'fits': fits}, indent=1))


if __name__ == '__main__':
    main()
