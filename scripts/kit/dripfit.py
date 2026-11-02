#!/usr/bin/env python3
"""Fit willow strand lengths so each visible drip ends where the reference sheet's drip ends.

Mirrors the strand construction in src/kit/families/trees.js (lobes, strand angles, rim, the 6%
outward flare): every strand on the camera side gets the length that projects its tip onto the
reference's lowest willow-green pixel in that screen column; strands over a gap in the reference
get the shortest length; hidden strands get the median. Prints a WILLOW_DRIPS entry.
Usage: dripfit.py <id>
"""
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PX = 39.5
EL = math.radians(35)
K = math.sqrt(0.5)
LOBES = [  # keep in sync with WILLOW_LOBES
    dict(s=-0.1, d=-0.25, top=1.55, r=0.42), dict(s=0.42, d=-0.2, top=1.32, r=0.32),
    dict(s=-0.34, d=0.22, top=1.18, r=0.36), dict(s=0.28, d=0.2, top=1.22, r=0.36),
]
SQUASH = 0.85

item_id = sys.argv[1]
manifest = (ROOT / 'src/kit/manifest.js').read_text()
box = [int(v) for v in re.search(r"id: '" + re.escape(item_id) + r"'.*?box: \[([^\]]+)\]", manifest).group(1).split(',')]
fam = (ROOT / 'src/kit/families/trees.js').read_text()
a = re.search(r"'" + re.escape(item_id) + r"': \[([-\d.]+), ([-\d.]+)\], // anchor", fam)
au, av = float(a.group(1)), float(a.group(2))
fit = re.search(r"'" + re.escape(item_id) + r"': \[([-\d.]+), ([-\d.]+), ([-\d.]+), ([-\d.]+)\],\n", fam.split('export const FIT')[1]) if 'export const FIT' in fam else None
img = np.asarray(Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB'), dtype=np.float64)
x0, y0, x1, y1 = box
green = (img[..., 1] > img[..., 0] + 6) & (img[..., 1] > img[..., 2] + 12)
bottom = {}
for u in range(x0 - 2, x1 + 3):
    ys = np.nonzero(green[y0 - 2:y1 + 4, u])[0]
    if len(ys):
        bottom[u] = y0 - 2 + ys.max() + 0.5


def screen(x, y, z):
    u = au + PX * (x * K - z * K)
    v = av - PX * (-math.sin(EL) * K * x + math.cos(EL) * y - math.sin(EL) * K * z)
    return u, v


result = []
for lobe in LOBES:
    lx, lz = (lobe['s'] + lobe['d']) * K, (lobe['d'] - lobe['s']) * K
    r = lobe['r']
    rim_y = lobe['top'] - r * SQUASH
    n = round(r * 44)
    lengths = [None] * n
    for i in range(n):
        ang = i / n * 2 * math.pi
        nx, nz = math.cos(ang), math.sin(ang)
        if nx * K + nz * K < 0.05:
            continue  # faces away from the camera: hidden behind the lobe
        rr = r * 1.06
        tx, tz = lx + nx * rr, lz + nz * rr
        u0, v0 = screen(tx, rim_y, tz)  # tip at length 0
        col = round(u0 - 0.5)
        target = bottom.get(col)
        if target is None:
            lengths[i] = 0.12
            continue
        length = (target - v0) / (PX * math.cos(EL))
        lengths[i] = round(min(max(length, 0.12), rim_y - 0.04), 3)
    known = [v for v in lengths if v is not None]
    med = float(np.median(known)) if known else 0.4
    result.append([v if v is not None else round(med, 3) for v in lengths])
print(f"  '{item_id}': {json.dumps(result)},")
