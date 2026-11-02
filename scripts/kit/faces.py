#!/usr/bin/env python3
"""Mean colour of named regions of an element, reference vs render (aligned crops).

Regions are given as fractions of the crop: name=x0,y0,x1,y1. Prints sRGB means and the dE2000
between them, so per-face colour corrections can be made with numbers instead of guesses.
Usage: faces.py <render.png> <id> top=0.4,0.15,0.6,0.3 left=0.2,0.5,0.35,0.7 ...
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pixel_test import REFERENCE, ciede2000, evaluate, load_items, srgb_to_lab  # noqa: E402

render, item_id, *regions = sys.argv[1:]
item = next(it for it in load_items() if it['id'] == item_id)
ref_img = np.asarray(Image.open(REFERENCE).convert('RGB'), dtype=np.float64)
ren2x = np.asarray(Image.open(render).convert('RGB'), dtype=np.float64)
_, ref, ren, _, _ = evaluate(ref_img, ren2x, item)
h, w = ref.shape[:2]
for spec in regions:
    name, box = spec.split('=')
    x0, y0, x1, y1 = [float(v) for v in box.split(',')]
    sl = (slice(int(y0 * h), max(int(y0 * h) + 1, int(y1 * h))), slice(int(x0 * w), max(int(x0 * w) + 1, int(x1 * w))))
    a, b = ref[sl].reshape(-1, 3).mean(0), ren[sl].reshape(-1, 3).mean(0)
    de = float(ciede2000(srgb_to_lab(a[None]), srgb_to_lab(b[None]))[0])
    ratio = (b + 1) / (a + 1)
    print(f'{name:10s} ref {tuple(a.round().astype(int))}  render {tuple(b.round().astype(int))}  '
          f'dE {de:5.1f}  render/ref {ratio.round(3)}')
