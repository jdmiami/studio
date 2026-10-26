#!/usr/bin/env python3
"""Fit a solid of revolution's profile to an element's reference silhouette, without a browser.

For round elements (knit domes with their pom-pom, round bushes, mushroom caps): the profile is
radius r(y) at N evenly spaced heights from the ground (y = 0) up to H, plus the axis base's sheet
position (the element's anchor). The silhouette of a solid of revolution is the union of its
horizontal slices' projections: each circle of radius r at height y projects through the kit
camera (orthographic, elevation 35 deg, 39.5 px per unit) to an ellipse centred PX*y*cos(35) above
the base, PX*r wide and PX*r*sin(35) tall (half-axes). Slices are splatted at 4x and compared with
the reference's outline-enclosed mask (eroded by its 1 px outline thickening, with blue-grey
shadow pixels trimmed off its edge, and one more pixel: see target_mask). Coordinate descent on the anchor, H and every radius
maximizes IoU, with a small smoothness penalty on the profile.

Usage: lathefit.py <id> [--n 14] [--height 1.2] [--iters 8] [--init profile.json] [--erode 2] [--out fit.json]
Prints {"anchor": [u, v], "height": H, "radii": [...]}.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pixel_test import load_items  # noqa: E402
from silfit import EL, PX, reference_object_mask  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SS = 4
PAD = 4


def target_mask(box, erode=2):
    m = reference_object_mask(box, PAD)
    # The mask's barrier was thickened by a pixel: erode it back, and by one more because the kit's
    # render reads about a pixel wider than its geometry (its edge pixels mix the outline in).
    for _ in range(erode):
        m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
    ref = np.asarray(Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB'), dtype=np.float64)
    x0, y0, x1, y1 = box
    crop = ref[y0 - PAD:y1 + PAD, x0 - PAD:x1 + PAD]
    r, g, b = crop[..., 0], crop[..., 1], crop[..., 2]
    lum = crop @ np.array([0.299, 0.587, 0.114])
    sat = crop.max(-1) - crop.min(-1)
    # Ground shadow is a low-saturation blue-grey; a teal element's shaded side is bluer than that.
    shadow = (b >= g - 1) & (b >= r - 1) & (lum < 200) & (sat < 24)
    # Peel shadow-coloured pixels off the mask's edge, a few rings deep.
    for _ in range(5):
        edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
        m = m & ~(edge & shadow)
    return m


def silhouette(anchor, height, radii, origin, shape, slices=160):
    h, w = shape
    gy, gx = np.mgrid[0:h * SS, 0:w * SS]
    gx = (gx + 0.5) / SS + origin[0]
    gy = (gy + 0.5) / SS + origin[1]
    m = np.zeros(gx.shape, bool)
    n = len(radii)
    for k in range(slices + 1):
        y = height * k / slices
        t = (n - 1) * k / slices
        i = min(int(t), n - 2)
        r = radii[i] + (radii[i + 1] - radii[i]) * (t - i)
        if r <= 1e-3:
            continue
        cu = anchor[0]
        cv = anchor[1] - PX * y * math.cos(EL)
        a = PX * r
        b = PX * r * math.sin(EL)
        m |= ((gx - cu) / a) ** 2 + ((gy - cv) / b) ** 2 <= 1
    return m.reshape(h, SS, w, SS).mean(axis=(1, 3)) > 0.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--n', type=int, default=14)
    ap.add_argument('--height', type=float, default=1.2)
    ap.add_argument('--iters', type=int, default=8)
    ap.add_argument('--smooth', type=float, default=0.002)
    ap.add_argument('--init')
    ap.add_argument('--out')
    ap.add_argument('--erode', type=int, default=2)
    args = ap.parse_args()
    item = next(it for it in load_items() if it['id'] == args.id)
    box = item['box']
    target = target_mask(box, args.erode)
    origin = (box[0] - PAD, box[1] - PAD)
    if args.init:
        state = json.loads(Path(args.init).read_text())
        anchor, height, radii = list(state['anchor']), state['height'], list(state['radii'])
    else:
        ys, xs = np.nonzero(target)
        anchor = [origin[0] + xs.mean(), origin[1] + ys.max() - 0.3 * (xs.max() - xs.min()) * math.sin(EL)]
        r0 = (xs.max() - xs.min()) / 2 / PX
        height = args.height
        radii = [r0 * math.sqrt(max(0.0, 1 - (i / (args.n - 1)) ** 2)) for i in range(args.n)]

    def cost(a, hgt, rr):
        sil = silhouette(a, hgt, rr, origin, target.shape)
        iou = (sil & target).sum() / max((sil | target).sum(), 1)
        bend = sum((rr[i + 1] - 2 * rr[i] + rr[i - 1]) ** 2 for i in range(1, len(rr) - 1))
        return -iou + args.smooth * bend, iou

    best, iou = cost(anchor, height, radii)
    print(f'start IoU {iou:.4f}')
    step_a, step_h, step_r = 1.0, 0.06, 0.04
    for it in range(args.iters):
        params = [('a', 0), ('a', 1), ('h', 0)] + [('r', i) for i in range(len(radii))]
        for kind, i in params:
            for sign in (1, -1):
                while True:
                    a, hgt, rr = list(anchor), height, list(radii)
                    if kind == 'a':
                        a[i] += sign * step_a
                    elif kind == 'h':
                        hgt += sign * step_h
                    else:
                        rr[i] = max(0.0, rr[i] + sign * step_r)
                    c, ciou = cost(a, hgt, rr)
                    if c < best - 1e-5:
                        anchor, height, radii, best, iou = a, hgt, rr, c, ciou
                    else:
                        break
        print(f'iter {it}: IoU {iou:.4f}')
        step_a, step_h, step_r = step_a * 0.6, step_h * 0.6, step_r * 0.6
    out = {'anchor': [round(anchor[0], 2), round(anchor[1], 2)], 'height': round(height, 4),
           'radii': [round(r, 4) for r in radii]}
    print(json.dumps(out))
    if args.out:
        Path(args.out).write_text(json.dumps(out))
    sil = silhouette(anchor, height, radii, origin, target.shape)
    img = np.full(target.shape + (3,), 235, np.uint8)
    img[target & sil] = (120, 190, 120)
    img[target & ~sil] = (220, 40, 40)
    img[~target & sil] = (40, 80, 220)
    path = ROOT / f'screenshots/kit/progress/lathefit-{args.id}.png'
    Image.fromarray(img).resize((img.shape[1] * 8, img.shape[0] * 8), Image.Resampling.NEAREST).save(path)
    print(f'mask: {path}')


if __name__ == '__main__':
    main()
