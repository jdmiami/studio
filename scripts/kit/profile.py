#!/usr/bin/env python3
"""Column profiles of a colour boundary in an element crop: reference vs render, aligned.

For each column of the element's box, reports the lowest (or highest) row where a colour test
holds, so a drip line, cap edge or rim can be compared as a curve instead of by eye.
Usage: profile.py <render.png> <id> <test: green|notgreen|dark> [--top]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pixel_test import PAD, REFERENCE, evaluate, load_items, render_window, window  # noqa: E402

TESTS = {
    'green': lambda a: (a[..., 1] > a[..., 0] + 8) & (a[..., 1] > a[..., 2] + 8),
    'dark': lambda a: a.mean(-1) < 120,
}

render, item_id, test = sys.argv[1], sys.argv[2], sys.argv[3]
top = '--top' in sys.argv
item = next(it for it in load_items() if it['id'] == item_id)
ref_img = np.asarray(Image.open(REFERENCE).convert('RGB'), dtype=np.float64)
ren2x = np.asarray(Image.open(render).convert('RGB'), dtype=np.float64)
r, ref, ren, _, _ = evaluate(ref_img, ren2x, item)
f = TESTS[test]
def prof(a):
    m = f(a)
    out = []
    for x in range(m.shape[1]):
        ys = np.nonzero(m[:, x])[0]
        out.append((ys.min() if top else ys.max()) if len(ys) else -1)
    return out
pr, pn = prof(ref), prof(ren)
print('col  ref  render  diff')
for x, (a, b) in enumerate(zip(pr, pn)):
    if a >= 0 or b >= 0:
        print(f'{x:3d}  {a:3d}  {b:4d}  {b - a:+d}' if a >= 0 and b >= 0 else f'{x:3d}  {a:3d}  {b:4d}')
valid = [(a, b) for a, b in zip(pr, pn) if a >= 0 and b >= 0]
print('mean diff (render - ref, px; + means lower):', round(float(np.mean([b - a for a, b in valid])), 2))
