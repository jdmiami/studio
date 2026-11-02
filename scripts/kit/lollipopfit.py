#!/usr/bin/env python3
"""Fit a lollipop (a thick candy disc on a thin stick) to its reference silhouette, without a browser.

The disc is a cylinder of radius R and thickness T centred at height H above the stick's base;
its axis is turned by yaw (about the vertical, 0 = facing the camera's horizontal direction) and
pitched back by pitch (toward facing the camera along its view). The stick is a capsule of radius r
from the ground to the disc centre. The disc is splatted from points sampled over its faces and rim
(4x supersampled), the stick is a stadium, and coordinate descent maximizes IoU with the test's mask
less the ground shadow (lathefit.test_target); --union adds what the outline encloses.

Usage: lollipopfit.py <id> --init init.json [--iters 8] [--out fit.json]
  params: {"anchor": [u, v], "height": H, "radius": R, "thick": T, "yaw": a, "pitch": b, "stick": r}
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from lathefit import PAD, target_mask, test_target  # noqa: E402
from pixel_test import load_items  # noqa: E402
from silfit import PX, R as RIGHT, U as UP  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SS = 4
KEYS = ['anchor_u', 'anchor_v', 'height', 'radius', 'thick', 'yaw', 'pitch', 'stick']
STEPS = [0.5, 0.5, 0.04, 0.02, 0.02, 0.1, 0.1, 0.008]


def disc_axis(yaw, pitch):
    """Unit axis of the disc in world space: toward the camera's horizontal direction, turned by yaw
    about the vertical, then tilted up by pitch."""
    toward = np.array([math.sqrt(0.5), 0.0, math.sqrt(0.5)])  # camera's horizontal direction
    right = np.array([math.sqrt(0.5), 0.0, -math.sqrt(0.5)])
    h = math.cos(yaw) * toward + math.sin(yaw) * right
    return math.cos(pitch) * h + math.sin(pitch) * np.array([0.0, 1.0, 0.0])


def disc_points(p, n=24):
    ax = disc_axis(p['yaw'], p['pitch'])
    a = np.cross(ax, [0.0, 1.0, 0.0])
    if np.linalg.norm(a) < 1e-6:
        a = np.array([1.0, 0.0, 0.0])
    a /= np.linalg.norm(a)
    b = np.cross(ax, a)
    pts = []
    for rr in np.linspace(0, 1, 8):
        for t in np.linspace(0, 2 * math.pi, n * 2, endpoint=False):
            for z in np.linspace(-0.5, 0.5, 5):
                pts.append(ax * z * p['thick'] + (a * math.cos(t) + b * math.sin(t)) * rr * p['radius'])
    return np.array(pts) + np.array([0.0, p['height'], 0.0])


def silhouette(p, origin, shape):
    h, w = shape
    m = np.zeros((h * SS, w * SS), bool)
    pts = disc_points(p)
    u = p['anchor_u'] + PX * (pts @ RIGHT)
    v = p['anchor_v'] - PX * (pts @ UP)
    xs = np.round((u - origin[0]) * SS).astype(int)
    ys = np.round((v - origin[1]) * SS).astype(int)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            ok = (xs + dx >= 0) & (ys + dy >= 0) & (xs + dx < w * SS) & (ys + dy < h * SS)
            m[ys[ok] + dy, xs[ok] + dx] = True
    gy, gx = np.mgrid[0:h * SS, 0:w * SS]
    gx = (gx + 0.5) / SS + origin[0]
    gy = (gy + 0.5) / SS + origin[1]
    x0, y0 = p['anchor_u'], p['anchor_v'] - PX * p['stick'] * UP[1]
    x1, y1 = p['anchor_u'], p['anchor_v'] - PX * p['height'] * UP[1]
    t = np.clip((gy - y0) / (y1 - y0 or 1e-9), 0, 1)
    m |= (gx - x0) ** 2 + (gy - (y0 + t * (y1 - y0))) ** 2 <= (PX * p['stick']) ** 2
    return m.reshape(h, SS, w, SS).mean(axis=(1, 3)) > 0.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--init', required=True)
    ap.add_argument('--iters', type=int, default=8)
    ap.add_argument('--out')
    ap.add_argument('--union', action='store_true', help='add what the outline encloses (pale candy)')
    args = ap.parse_args()
    item = next(it for it in load_items() if it['id'] == args.id)
    box = item['box']
    # Pale candy (lavender) is close enough to the backdrop that the test mask's flood leaks into
    # it; what the outline encloses fills it back in.
    target = test_target(box) | target_mask(box, erode=1) if args.union else test_target(box)
    origin = (box[0] - PAD, box[1] - PAD)
    init = json.loads(Path(args.init).read_text())
    p = {'anchor_u': init['anchor'][0], 'anchor_v': init['anchor'][1], **{k: init[k] for k in KEYS[2:]}}

    def score(q):
        sil = silhouette(q, origin, target.shape)
        return (sil & target).sum() / max((sil | target).sum(), 1)

    best = score(p)
    print(f'start IoU {best:.4f}')
    steps = list(STEPS)
    for it in range(args.iters):
        for k, key in enumerate(KEYS):
            for sign in (1, -1):
                while True:
                    q = dict(p)
                    q[key] += sign * steps[k]
                    if key in ('radius', 'thick', 'stick') and q[key] < 0.01:
                        break
                    c = score(q)
                    if c > best + 1e-5:
                        p, best = q, c
                    else:
                        break
        print(f'iter {it}: IoU {best:.4f}')
        steps = [s * 0.6 for s in steps]
    out = {'anchor': [round(p['anchor_u'], 2), round(p['anchor_v'], 2)], **{k: round(p[k], 4) for k in KEYS[2:]}}
    print(json.dumps(out))
    if args.out:
        Path(args.out).write_text(json.dumps(out))
    sil = silhouette(p, origin, target.shape)
    img = np.full(target.shape + (3,), 235, np.uint8)
    img[target & sil] = (120, 190, 120)
    img[target & ~sil] = (220, 40, 40)
    img[~target & sil] = (40, 80, 220)
    path = ROOT / f'screenshots/kit/progress/lollipopfit-{args.id}.png'
    Image.fromarray(img).resize((img.shape[1] * 10, img.shape[0] * 10), Image.Resampling.NEAREST).save(path)
    print(f'mask: {path}')


if __name__ == '__main__':
    main()
