#!/usr/bin/env python3
"""Fit planar soft shadows (contact.js addPlanarShadow) for fences, without a browser.

A fence is capsules (scripts/kit/fencefit.py). Its planar shadow is every part flattened onto the
ground along the shadow direction (ground offset per unit of height, screen-aligned [s, d]),
blurred, and blended over the backdrop in linear light with a strength and colour. Here each
capsule is sampled as spheres along its axis; a sphere of radius r at height y lands as a disc of
radius r around its ground point offset by y * dir, which projects to an ellipse (PX*r wide,
PX*r*sin 35 tall). The union is blurred with a Gaussian of the fitted softness and compared with the
reference over the ground around the fences (the fences themselves and their halo cut out, by
colour: shadow between the rails counts as ground). Coordinate descent on dir, strength and softness
per fence and one shared colour.

Usage: planarfit.py <family-file-ids...> --layouts fences [--iters 6] [--out fit.json]
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from lathefit import PAD, test_target  # noqa: E402
from pixel_test import load_items  # noqa: E402
from shadowfit import BACKDROP, anchors, to_linear, to_srgb  # noqa: E402
from silfit import EL, PX  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def layouts():
    text = (ROOT / 'src/kit/families/fences.js').read_text()
    out = {}
    for m in re.finditer(r"'(fence-\w)': \{ a: \[([-\d.]+), ([-\d.]+)\], b: \[([-\d.]+), ([-\d.]+)\], height: ([\d.]+), "
                         r"post: ([\d.]+), rails: \[([\d.]+), ([\d.]+)\], rail: ([\d.]+), over: ([-\d.]+) \}", text):
        v = [float(x) for x in m.groups()[1:]]
        out[m.group(1)] = {'a': v[0:2], 'b': v[2:4], 'height': v[4], 'post': v[5], 'rails': v[6:8], 'rail': v[8], 'over': v[9]}
    return out


def spheres(L):
    """(s, y, d, r) samples along every capsule of a fence layout."""
    out = []
    for s, d in (L['a'], L['b']):
        for y in np.linspace(L['post'], L['height'] - L['post'], 12):
            out.append((s, y, d, L['post']))
    for y in L['rails']:
        for t in np.linspace(0, 1, 16):
            out.append((L['a'][0] + (L['b'][0] - L['a'][0]) * t, y, L['a'][1] + (L['b'][1] - L['a'][1]) * t, L['rail']))
    return out


def blur(img, sigma):
    r = max(1, int(math.ceil(sigma * 2.5)))
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma * sigma))
    k /= k.sum()
    img = np.apply_along_axis(lambda row: np.convolve(row, k, mode='same'), 1, img)
    return np.apply_along_axis(lambda col: np.convolve(col, k, mode='same'), 0, img)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--iters', type=int, default=6)
    ap.add_argument('--init')
    ap.add_argument('--out')
    args = ap.parse_args()
    items = {it['id']: it for it in load_items()}
    anchor_of = anchors()
    L = layouts()
    ref = np.asarray(Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB'), dtype=np.float64)
    boxes = [items[i]['box'] for i in args.ids]
    x0 = min(b[0] for b in boxes) - 12; y0 = min(b[1] for b in boxes) - 8
    x1 = max(b[2] for b in boxes) + 12; y1 = max(b[3] for b in boxes) + 10
    keep = np.ones((y1 - y0, x1 - x0), bool)
    for i in args.ids:
        bx0, by0, bx1, by1 = items[i]['box']
        c = ref[by0 - PAD:by1 + PAD, bx0 - PAD:bx1 + PAD]
        sat = c.max(-1) - c.min(-1)
        groundish = ((c[..., 2] >= c[..., 1] - 1) & (c[..., 2] >= c[..., 0] - 1) & (sat < 24)) | \
                    ((np.linalg.norm(c - BACKDROP, axis=-1) <= 20) & (sat <= 14))
        wood = test_target(items[i]['box'], erode=0) & ~groundish
        for _ in range(1):
            wood = wood | np.roll(wood, 1, 0) | np.roll(wood, -1, 0) | np.roll(wood, 1, 1) | np.roll(wood, -1, 1)
        keep[by0 - PAD - y0:by1 + PAD - y0, bx0 - PAD - x0:bx1 + PAD - x0] &= ~wood
    target = ref[y0:y1, x0:x1]
    gy, gx = np.mgrid[y0:y1, x0:x1] + 0.5
    if args.init:
        state = json.loads(Path(args.init).read_text())
    else:
        state = {i: [0.1, -0.78, 0.5, 0.04] for i in args.ids}
        state['_color'] = [85, 88, 121]
    color = list(state.pop('_color'))
    params = {i: list(state[i]) for i in args.ids}

    def shadow(i, p):
        s_dir, d_dir, strength, soft = p
        au, av = anchor_of[i]
        m = np.zeros(gx.shape)
        for s, y, d, r in spheres(L[i]):
            gs, gd = s + y * s_dir, d + y * d_dir
            cu, cv = au + PX * gs, av + PX * gd * math.sin(EL)
            m = np.maximum(m, (((gx - cu) / (PX * r)) ** 2 + ((gy - cv) / (PX * r * math.sin(EL))) ** 2 <= 1).astype(float))
        return np.clip(blur(m, max(soft * PX, 0.3)), 0, 1) * strength

    def render(ps, col):
        lin = np.full(gx.shape + (3,), to_linear(np.array([BACKDROP] * 3))[0])
        c = to_linear(np.asarray(col, float))
        for i in args.ids:
            a = shadow(i, ps[i])[..., None]
            lin = lin * (1 - a) + c * a
        return to_srgb(lin)

    def cost(ps, col):
        diff = (render(ps, col) - target)[keep]
        return float((diff ** 2).mean())

    best = cost(params, color)
    print(f'start rms {math.sqrt(best):.2f}')
    steps = [0.1, 0.1, 0.08, 0.015]
    lows = [-1.5, -1.5, 0.0, 0.005]
    highs = [1.5, 1.5, 0.95, 0.2]
    for it in range(args.iters):
        for i in args.ids:
            for k in range(4):
                for sign in (1, -1):
                    while True:
                        cand = {kk: list(vv) for kk, vv in params.items()}
                        v = cand[i][k] + sign * steps[k]
                        if not lows[k] <= v <= highs[k]:
                            break
                        cand[i][k] = v
                        c = cost(cand, color)
                        if c < best - 1e-3:
                            params, best = cand, c
                        else:
                            break
        for k in range(3):
            for sign in (1, -1):
                while True:
                    cand = list(color)
                    cand[k] = min(255, max(0, cand[k] + sign * 10 * 0.6 ** it))
                    c = cost(params, cand)
                    if c < best - 1e-3:
                        color, best = cand, c
                    else:
                        break
        print(f'iter {it}: rms {math.sqrt(best):.2f}')
        steps = [s * 0.6 for s in steps]
    out = {i: [round(v, 4) for v in params[i]] for i in args.ids}
    out['_color'] = '#' + ''.join(f'{round(v):02x}' for v in color)
    print(json.dumps(out))
    if args.out:
        Path(args.out).write_text(json.dumps(out))
    img = np.concatenate([np.where(keep[..., None], target, 255), np.zeros((3, x1 - x0, 3)),
                          np.where(keep[..., None], render(params, color), 255)], 0).astype(np.uint8)
    path = ROOT / 'screenshots/kit/progress/planarfit.png'
    Image.fromarray(img).resize((img.shape[1] * 4, img.shape[0] * 4), Image.Resampling.NEAREST).save(path)
    print(f'image: {path}')


if __name__ == '__main__':
    main()
