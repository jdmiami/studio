#!/usr/bin/env python3
"""Silhouette disagreement map for one element: green = both, red = reference only (render is
missing it), blue = render only (render has too much). Enlarged 8x.
Usage: maskdiff.py <render.png> <id> <out.png>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pixel_test import REFERENCE, evaluate, load_items, mask_of  # noqa: E402

render, item_id, out = sys.argv[1:4]
item = next(it for it in load_items() if it['id'] == item_id)
ref_img = np.asarray(Image.open(REFERENCE).convert('RGB'), dtype=np.float64)
ren2x = np.asarray(Image.open(render).convert('RGB'), dtype=np.float64)
r, ref, ren, _, _ = evaluate(ref_img, ren2x, item)
a, b = mask_of(ref), mask_of(ren)
img = np.full(a.shape + (3,), 235, dtype=np.uint8)
img[a & b] = (120, 190, 120)
img[a & ~b] = (220, 40, 40)
img[~a & b] = (40, 80, 220)
Image.fromarray(img).resize((img.shape[1] * 8, img.shape[0] * 8), Image.Resampling.NEAREST).save(out)
print(f"iou {r['iou']}  reference-only px {(a & ~b).sum()}  render-only px {(~a & b).sum()}")
