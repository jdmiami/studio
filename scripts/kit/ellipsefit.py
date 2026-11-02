#!/usr/bin/env python3
"""Fit a cluster of ellipsoids (a fluffy dog: body, head, tail, legs, ears, scarf) to an element's
reference silhouette, without a browser.

Each part is [s, y, d, rs, ry, rd]: its centre at screen-aligned (s, y, d) from the element's anchor
(s: screen-right, d: toward the camera, y up) and its radii along those axes. Parts are volume-
sampled ellipsoid shells, projected through the kit camera and splatted at 4x. The target is
pixel_test's mask less the ground shadow (lathefit.test_target). Coordinate descent on every part
parameter maximizes IoU.

Usage: ellipsefit.py <id> --init layout.json [--iters 6] [--out fit.json]
  layout.json: {"anchor": [u, v], "parts": [[s, y, d, rs, ry, rd], ...]}
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
from silfit import PX, R as RIGHT, U as UP, splat  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SS = 4
K = math.sqrt(0.5)


def unit_sphere(n=18):
    t = np.linspace(0, math.pi, n)
    p = np.linspace(0, 2 * math.pi, 2 * n, endpoint=False)
    T, P = np.meshgrid(t, p)
    pts = np.stack([np.sin(T) * np.cos(P), np.cos(T), np.sin(T) * np.sin(P)], -1).reshape(-1, 3)
    return np.concatenate([pts * k for k in (1.0, 0.7, 0.4)])


SPHERE = unit_sphere()
S_AXIS = np.array([K, 0.0, -K])
D_AXIS = np.array([K, 0.0, K])


def silhouette(anchor, boxes, origin, shape):
    m = np.zeros((shape[0] * SS, shape[1] * SS), bool)
    for s, y, d, rs, ry, rd in boxes:
        local = SPHERE * np.array([rs, ry, rd])
        pts = np.outer(local[:, 0], S_AXIS) + np.outer(local[:, 1], [0.0, 1.0, 0.0]) + np.outer(local[:, 2], D_AXIS)
        pts = pts + np.array([(s + d) * K, y, (d - s) * K])
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
    target = test_target(box, erode=1)
    state = json.loads(Path(args.init).read_text())
    anchor, boxes = list(state['anchor']), [list(b) for b in state['parts']]

    def score(a, bs):
        sil = silhouette(a, bs, origin, target.shape)
        return (sil & target).sum() / max((sil | target).sum(), 1)

    best = score(anchor, boxes)
    print(f'start IoU {best:.4f}')
    steps = [0.03, 0.03, 0.03, 0.02, 0.02, 0.02]
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
                        if k >= 3 and bs[i][k] < 0.03:
                            break
                        if k == 1 and bs[i][1] - bs[i][4] < -0.01:  # nothing below the (depth-less) ground
                            break
                        c = score(anchor, bs)
                        if c > best + 1e-5:
                            boxes, best = bs, c
                        else:
                            break
        print(f'iter {it}: IoU {best:.4f}')
        steps = [s * 0.6 for s in steps]
    out = {'anchor': [round(anchor[0], 2), round(anchor[1], 2)], 'parts': [[round(v, 3) for v in b] for b in boxes]}
    print(json.dumps(out))
    if args.out:
        Path(args.out).write_text(json.dumps(out))
    sil = silhouette(anchor, boxes, origin, target.shape)
    img = np.full(target.shape + (3,), 235, np.uint8)
    img[target & sil] = (120, 190, 120)
    img[target & ~sil] = (220, 40, 40)
    img[~target & sil] = (40, 80, 220)
    path = ROOT / f'screenshots/kit/progress/ellipsefit-{args.id}.png'
    Image.fromarray(img).resize((img.shape[1] * 6, img.shape[0] * 6), Image.Resampling.NEAREST).save(path)
    print(f'mask: {path}')


if __name__ == '__main__':
    main()
