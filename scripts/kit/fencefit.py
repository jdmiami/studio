#!/usr/bin/env python3
"""Fit a two-post, two-rail fence to its reference silhouette, without a browser.

Every part of a fence is a capsule (a cylinder with rounded ends), and a capsule's orthographic
projection is a 2D stadium: all pixels within PX*r of the projected axis segment. The fence is
two vertical posts standing at screen-aligned ground points (s, d) relative to the element's
anchor, and two horizontal rails between them at heights y1 and y2, overhanging each post by e.
Coordinate descent on every parameter maximizes IoU with the wood itself: pixel_test's own mask with
the ground shadow peeled off (lathefit.test_target), less the light gap between the rails (the
test mask fills enclosed holes, which would fatten the rails until they close it).

Usage: fencefit.py <id> --init init.json [--iters 8] [--out fit.json]
  params: {"anchor": [u, v], "a": [s, d], "b": [s, d], "height": h, "post": r,
           "rails": [y1, y2], "rail": r, "over": e}
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
from silfit import EL, PX  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SS = 4


def screen(anchor, s, y, d):
    """Screen-aligned world point -> sheet pixel."""
    return anchor[0] + PX * s, anchor[1] + PX * d * math.sin(EL) - PX * y * math.cos(EL)


def capsules(p):
    a, b = p['a'], p['b']
    h, rp = p['height'], p['post']
    out = [((a[0], rp, a[1]), (a[0], h - rp, a[1]), rp), ((b[0], rp, b[1]), (b[0], h - rp, b[1]), rp)]
    ds, dd = b[0] - a[0], b[1] - a[1]
    n = math.hypot(ds, dd) or 1.0
    es, ed = ds / n * p['over'], dd / n * p['over']
    for y in p['rails']:
        out.append(((a[0] - es, y, a[1] - ed), (b[0] + es, y, b[1] + ed), p['rail']))
    return out


def silhouette(p, origin, shape):
    h, w = shape
    gy, gx = np.mgrid[0:h * SS, 0:w * SS]
    gx = (gx + 0.5) / SS + origin[0]
    gy = (gy + 0.5) / SS + origin[1]
    m = np.zeros(gx.shape, bool)
    for p0, p1, r in capsules(p):
        x0, y0 = screen(p['anchor'], *p0)
        x1, y1 = screen(p['anchor'], *p1)
        vx, vy = x1 - x0, y1 - y0
        l2 = vx * vx + vy * vy or 1e-9
        t = np.clip(((gx - x0) * vx + (gy - y0) * vy) / l2, 0, 1)
        m |= (gx - x0 - t * vx) ** 2 + (gy - y0 - t * vy) ** 2 <= (PX * r) ** 2
    return m.reshape(h, SS, w, SS).mean(axis=(1, 3)) > 0.5


def flat(p):
    return [*p['anchor'], *p['a'], *p['b'], p['height'], p['post'], *p['rails'], p['rail'], p['over']]


def unflat(v):
    return {'anchor': v[0:2], 'a': v[2:4], 'b': v[4:6], 'height': v[6], 'post': v[7], 'rails': v[8:10],
            'rail': v[10], 'over': v[11]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--init', required=True)
    ap.add_argument('--iters', type=int, default=8)
    ap.add_argument('--out')
    ap.add_argument('--max-rail', type=float, default=0.075, help='rails fatter than this close the gap between them')
    args = ap.parse_args()
    item = next(it for it in load_items() if it['id'] == args.id)
    box = item['box']
    origin = (box[0] - PAD, box[1] - PAD)
    ref = np.asarray(Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB'), dtype=np.float64)
    crop = ref[box[1] - PAD:box[3] + PAD, box[0] - PAD:box[2] + PAD]
    lum = crop @ np.array([0.299, 0.587, 0.114])
    target = test_target(box, erode=0) & (crop[..., 0] - crop[..., 2] > 8) & (lum < 212)
    v = flat(json.loads(Path(args.init).read_text()))
    steps = [1.0, 1.0, 0.05, 0.05, 0.05, 0.05, 0.04, 0.01, 0.03, 0.03, 0.01, 0.02]

    def score(vec):
        sil = silhouette(unflat(vec), origin, target.shape)
        return (sil & target).sum() / max((sil | target).sum(), 1)

    best = score(v)
    print(f'start IoU {best:.4f}')
    for it in range(args.iters):
        for k in range(len(v)):
            for sign in (1, -1):
                while True:
                    cand = list(v)
                    cand[k] += sign * steps[k]
                    if k in (7, 10) and cand[k] < 0.02:
                        break
                    if k == 10 and cand[k] > args.max_rail:
                        break
                    c = score(cand)
                    if c > best + 1e-5:
                        v, best = cand, c
                    else:
                        break
        print(f'iter {it}: IoU {best:.4f}')
        steps = [s * 0.6 for s in steps]
    fit = unflat([round(x, 4) for x in v])
    print(json.dumps(fit))
    if args.out:
        Path(args.out).write_text(json.dumps(fit))
    sil = silhouette(unflat(v), origin, target.shape)
    img = np.full(target.shape + (3,), 235, np.uint8)
    img[target & sil] = (120, 190, 120)
    img[target & ~sil] = (220, 40, 40)
    img[~target & sil] = (40, 80, 220)
    path = ROOT / f'screenshots/kit/progress/fencefit-{args.id}.png'
    Image.fromarray(img).resize((img.shape[1] * 8, img.shape[0] * 8), Image.Resampling.NEAREST).save(path)
    print(f'mask: {path}')


if __name__ == '__main__':
    main()
