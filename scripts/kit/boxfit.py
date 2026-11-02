#!/usr/bin/env python3
"""Fit a cluster of world-aligned rounded boxes (stone arches) to an element's reference
silhouette, without a browser.

Each box is [s, y, d, w, h, dp]: its bottom-centre at screen-aligned (s, y, d) from the element's
anchor (s: screen-right, d: toward the camera, y up) and its size along world x, y and z. Boxes are
volume-sampled shells of a rounded box (corner radius 0.18 of the smallest side), projected through
the kit camera and splatted at 4x. The target is the stone itself: pixel_test's mask less the ground
shadow (lathefit.test_target) and less the opening under the arch.
Coordinate descent on every box parameter maximizes IoU.

Usage: boxfit.py <id> --init layout.json [--iters 6] [--out fit.json]
  layout.json: {"anchor": [u, v], "boxes": [[s, y, d, w, h, dp], ...]}
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from lathefit import PAD, test_target  # noqa: E402
from pixel_test import load_items  # noqa: E402
from silfit import PX, R as RIGHT, U as UP, rounded_box_points, splat  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SS = 4
K = math.sqrt(0.5)


def box_points(w, h, dp):
    m = min(w, h, dp)
    base = rounded_box_points(1.0, 1.0, 0.18 * m / max(w, h, dp), n=10)
    pts = np.concatenate([base * k for k in (1.0, 0.7, 0.4)])
    return pts * np.array([w, h, dp])


def silhouette(anchor, boxes, origin, shape):
    m = np.zeros((shape[0] * SS, shape[1] * SS), bool)
    for s, y, d, w, h, dp in boxes:
        pts = box_points(w, h, dp) + np.array([(s + d) * K, y + h / 2, (d - s) * K])
        u = anchor[0] + PX * (pts @ RIGHT)
        v = anchor[1] - PX * (pts @ UP)
        splat(m, (u - origin[0]) * SS, (v - origin[1]) * SS, 3)
    return m.reshape(shape[0], SS, shape[1], SS).mean(axis=(1, 3)) > 0.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--init', required=True)
    ap.add_argument('--iters', type=int, default=6)
    ap.add_argument('--out')
    args = ap.parse_args()
    item = next(it for it in load_items() if it['id'] == args.id)
    box = item['box']
    origin = (box[0] - PAD, box[1] - PAD)
    # The opening under the arch is enclosed by the arch and the shadow between its pillars, so the
    # test mask fills it in: take out every large background-coloured region (the opening), but not
    # the scattered pale pixels of the blocks' top faces.
    from collections import deque
    ref = np.asarray(Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB'), dtype=np.float64)
    crop = ref[box[1] - PAD:box[3] + PAD, box[0] - PAD:box[2] + PAD]
    bglike = (np.linalg.norm(crop - 220.0, axis=-1) <= 20) & (crop.max(-1) - crop.min(-1) <= 14)
    target = test_target(box, erode=1)
    seen = np.zeros_like(bglike)
    for y0, x0 in zip(*np.nonzero(bglike & target)):
        if seen[y0, x0]:
            continue
        comp, q = [], deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < bglike.shape[0] and 0 <= nx < bglike.shape[1] and bglike[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(comp) >= 25:
            for y, x in comp:
                target[y, x] = False
    state = json.loads(Path(args.init).read_text())
    anchor, boxes = list(state['anchor']), [list(b) for b in state['boxes']]

    def score(a, bs):
        sil = silhouette(a, bs, origin, target.shape)
        return (sil & target).sum() / max((sil | target).sum(), 1)

    best = score(anchor, boxes)
    print(f'start IoU {best:.4f}')
    steps = [0.04, 0.04, 0.04, 0.03, 0.03, 0.03]
    for it in range(args.iters):
        for k in (0, 1):
            for sign in (1, -1):
                while True:
                    a = list(anchor)
                    a[k] += sign * 0.5 * 0.6 ** it
                    c = score(a, boxes)
                    if c > best + 1e-5:
                        anchor, best = a, c
                    else:
                        break
        for i in range(len(boxes)):
            for k in range(6):
                for sign in (1, -1):
                    while True:
                        bs = [list(b) for b in boxes]
                        bs[i][k] += sign * steps[k]
                        if k >= 3 and bs[i][k] < 0.1:
                            break
                        if k == 1 and bs[i][k] < 0:  # a block sunk below the (depth-less) ground would show
                            break
                        c = score(anchor, bs)
                        if c > best + 1e-5:
                            boxes, best = bs, c
                        else:
                            break
        print(f'iter {it}: IoU {best:.4f}')
        steps = [s * 0.6 for s in steps]
    out = {'anchor': [round(anchor[0], 2), round(anchor[1], 2)], 'boxes': [[round(v, 3) for v in b] for b in boxes]}
    print(json.dumps(out))
    if args.out:
        Path(args.out).write_text(json.dumps(out))
    sil = silhouette(anchor, boxes, origin, target.shape)
    img = np.full(target.shape + (3,), 235, np.uint8)
    img[target & sil] = (120, 190, 120)
    img[target & ~sil] = (220, 40, 40)
    img[~target & sil] = (40, 80, 220)
    path = ROOT / f'screenshots/kit/progress/boxfit-{args.id}.png'
    Image.fromarray(img).resize((img.shape[1] * 6, img.shape[0] * 6), Image.Resampling.NEAREST).save(path)
    print(f'mask: {path}')


if __name__ == '__main__':
    main()
