#!/usr/bin/env python3
"""Fit soft shadow blobs on the ground to the reference sheet, without a browser.

The sheet's shadows don't come from one light (blocks cast short ones, trees long soft ones thrown
back and to the right), so elements that opt out of the global cast shadow get blobs instead
(contact.js addShadowBlobs). This fits them: every reference pixel of the ground around the given
elements (their padded boxes plus a margin, minus every element's outline-enclosed silhouette and
its halo, minus the contact decal right at each base) is modelled exactly as the kit renders it:
the backdrop, with each blob alpha-blended over it in linear light, then sRGB. Coordinate descent
on every blob parameter minimizes the squared colour error; blobs are fitted jointly because one
element's shadow runs into its neighbour's crop.

The blobs' shared colour is fitted too (the sheet's shadows are a saturated blue-grey).

Usage: shadowfit.py <id> [<id> ...] [--blobs 2] [--iters 6] [--init init.json] [--out fit.json]
                    [--through a,b]   (elements whose ground shows through them: willow drips)
Prints {id: [[s, d, rs, rd, strength, turn], ...]} (screen-aligned units relative to each base)
and the colour.
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
from pixel_test import load_items  # noqa: E402
from lathefit import test_target  # noqa: E402
from silfit import EL, PX, R, U, reference_object_mask  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BACKDROP = 220.0  # '#dcdcdc'
BLOB_COLOR = np.array([0x3a, 0x3d, 0x55], float)
MARGIN = 10


def to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return 255.0 * np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def anchors():
    out = {}
    for fam in (ROOT / 'src/kit/families').glob('*.js'):
        for m in re.finditer(r"'([\w-]+)': \[([-\d.]+), ([-\d.]+)\], // anchor", fam.read_text()):
            out[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    return out


def fitted_shadows():
    """Blobs already in the families' SHADOWS tables: {id: (color, blobs)}."""
    out = {}
    for fam in (ROOT / 'src/kit/families').glob('*.js'):
        for m in re.finditer(r"'([\w-]+)': \{ cast: false, color: '(#[0-9a-f]{6})', blobs: (\[\[.*?\]\])", fam.read_text()):
            out[m.group(1)] = (m.group(2), json.loads(m.group(3)))
    return out


def ground_offsets(us, vs, anchor):
    """Sheet pixels -> ground point (s, d) in screen-aligned units relative to the element's base."""
    # A ground point s*Rs + d*Ds projects to u = au + PX*s, v = av + PX*d*sin(EL) (Ds points toward
    # the camera, which is screen-down).
    s = (us - anchor[0]) / PX
    d = (vs - anchor[1]) / (PX * math.sin(EL))
    return s, d


def blob_alpha(s, d, blob):
    bs, bd, rs, rd, strength, turn = blob[:6]
    core = blob[6] if len(blob) > 6 else 0.15
    qs, qd = s - bs, d - bd
    c, sn = math.cos(turn), math.sin(turn)
    a = (c * qs + sn * qd) / rs
    b = (-sn * qs + c * qd) / rd
    r = np.hypot(a, b)
    t = np.clip((r - core) / max(1 - core, 1e-3), 0, 1)
    return strength * (1 - t * t * (3 - 2 * t))


def model(blobs_by_id, pix, offsets, color=BLOB_COLOR, fixed=None):
    lin = np.full(pix[0].shape + (3,), to_linear(np.array([BACKDROP] * 3))[0]) if fixed is None else fixed.copy()
    col = to_linear(np.asarray(color, float))
    for item_id, blobs in blobs_by_id.items():
        s, d = offsets[item_id]
        for blob in blobs:
            a = blob_alpha(s, d, blob)[:, None]
            lin = lin * (1 - a) + col * a
    return to_srgb(lin)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--blobs', type=int, default=2)
    ap.add_argument('--iters', type=int, default=6)
    ap.add_argument('--init')
    ap.add_argument('--out')
    ap.add_argument('--through', default='', help='elements whose ground shows through (willows)')
    ap.add_argument('--mask', choices=['outline', 'test', 'color'], default='outline',
                    help="how elements are cut out of the ground ('color': test mask less ground-coloured pixels, for open elements)")
    ap.add_argument('--core', action='store_true', help='also fit each blob\'s core (edge crispness)')
    ap.add_argument('--open', default='', help="elements cut out by colour (fences): see --mask color")
    ap.add_argument('--region-margin', type=int, default=MARGIN, help='px of sheet around the elements that the fit sees')
    ap.add_argument('--margin', type=int, default=2, help='px cut out around each element (outline, halo)')
    ap.add_argument('--base-exclude', type=float, default=5, help='px radius left out at each base (contact decal); 0 keeps it')
    ap.add_argument('--mask-weight', type=float, default=400.0, help='cost of a pixel on the wrong side of the background threshold')
    args = ap.parse_args()
    through = set(args.through.split(','))
    opened = set(args.open.split(','))
    items = {it['id']: it for it in load_items()}
    anchor_of = anchors()
    ref = np.asarray(Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB'), dtype=np.float64)
    boxes = [items[i]['box'] for i in args.ids]
    rm = args.region_margin
    x0 = max(0, min(b[0] for b in boxes) - rm)
    y0 = max(0, min(b[1] for b in boxes) - rm)
    x1 = min(ref.shape[1], max(b[2] for b in boxes) + rm)
    y1 = min(ref.shape[0], max(b[3] for b in boxes) + rm)
    keep = np.ones((y1 - y0, x1 - x0), bool)
    # Drop every element in the region (and its halo), and the contact decal at each base.
    for it in items.values():
        bx0, by0, bx1, by1 = it['box']
        if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1:
            continue
        pad = 4
        # Small elements' faint outlines leak, so their outline mask swallows their own shadow:
        # --mask test excludes them by pixel_test's mask with the ground shadow peeled off instead.
        if args.mask == 'outline':
            inner = reference_object_mask(it['box'], pad)
        else:
            inner = test_target(it['box'], erode=0)
            if args.mask == 'color' or it['id'] in opened:
                # Open elements (fences): shadow and background seen between their parts are ground.
                c = ref[by0 - pad:by1 + pad, bx0 - pad:bx1 + pad]
                cl = c @ np.array([0.299, 0.587, 0.114])
                cs = c.max(-1) - c.min(-1)
                groundish = ((c[..., 2] >= c[..., 1] - 1) & (c[..., 2] >= c[..., 0] - 1) & (cs < 24)) | ((np.linalg.norm(c - BACKDROP, axis=-1) <= 20) & (cs <= 14))
                inner = inner & ~groundish
        m = inner.copy()
        for _ in range(args.margin):
            m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
        for _ in range(2):
            inner = inner & np.roll(inner, 1, 0) & np.roll(inner, -1, 0) & np.roll(inner, 1, 1) & np.roll(inner, -1, 1)
        # Ground seen through the element (between willow drips, beside a trunk) still counts:
        # well inside the outline, a neutral-to-blue pixel is ground; the felt is green, mint or brown.
        gx0, gy0 = bx0 - pad, by0 - pad
        crop = ref[gy0:gy0 + m.shape[0], gx0:gx0 + m.shape[1]]
        r, g, b = crop[..., 0], crop[..., 1], crop[..., 2]
        ground = (b >= g - 1) & (b >= r - 1) & (crop @ np.array([0.299, 0.587, 0.114]) > 110)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ground = ground & np.roll(np.roll(ground, dy, 0), dx, 1)  # solid patches, not creases
        low = np.arange(m.shape[0])[:, None] > pad + 0.65 * (by1 - by0)  # where ground can show
        if it['id'] in through:
            m &= ~(inner & ground & low)
        for yy, xx in zip(*np.nonzero(m)):
            Y, X = gy0 + yy - y0, gx0 + xx - x0
            if 0 <= Y < keep.shape[0] and 0 <= X < keep.shape[1]:
                keep[Y, X] = False
        if it['id'] in anchor_of:
            au, av = anchor_of[it['id']]
            yy, xx = np.mgrid[y0:y1, x0:x1]
            if args.base_exclude > 0:
                keep &= np.hypot(xx - au, (yy - av) * 1.6) > args.base_exclude
    ys, xs = np.nonzero(keep)
    us, vs = xs + x0 + 0.5, ys + y0 + 0.5
    target = ref[ys + y0, xs + x0]
    offsets = {i: ground_offsets(us, vs, anchor_of[i]) for i in args.ids}
    init_color = None
    if args.init:
        init = json.loads(Path(args.init).read_text())
        init_color = init.pop('_color', None)
        blobs = {k: [list(b) + [0.0] * max(0, 6 - len(b)) for b in v] for k, v in init.items()}
    else:
        base = [[0.9, -0.9, 0.7, 0.45, 0.45, 0.0], [0.3, -0.2, 0.4, 0.3, 0.35, 0.0]]
        blobs = {i: [list(b) for b in base[:args.blobs]] for i in args.ids}
    if args.core:  # a seventh parameter per blob: its core
        blobs = {k: [b + [0.15] if len(b) < 7 else b for b in v] for k, v in blobs.items()}

    color = [float(int(init_color[i:i + 2], 16)) for i in (1, 3, 5)] if init_color else list(BLOB_COLOR)
    # Neighbours' shadows that are already fitted (another family's) stay as they are.
    fixed = np.full((len(us), 3), to_linear(np.array([BACKDROP] * 3))[0])
    for item_id, (hexcolor, nblobs) in fitted_shadows().items():
        if item_id in args.ids or item_id not in anchor_of:
            continue
        col = to_linear(np.array([int(hexcolor[i:i + 2], 16) for i in (1, 3, 5)], float))
        s_, d_ = ground_offsets(us, vs, anchor_of[item_id])
        for blob in nblobs:
            a = blob_alpha(s_, d_, list(blob) + [0.0] * (6 - len(blob)))[:, None]
            if a.max() > 0.01:
                fixed = fixed * (1 - a) + col * a
    fixed_srgb_lin = fixed

    def non_background(rgb):
        # pixel_test.py's background test: the masks it scores IoU on include cast shadows.
        return (np.linalg.norm(rgb - BACKDROP, axis=-1) > 20) | (rgb.max(-1) - rgb.min(-1) > 14)

    ref_shadow = non_background(target)

    def cost(b, c=None):
        mod = model(b, (us,), offsets, color if c is None else c, fixed_srgb_lin)
        mse = float(((mod - target) ** 2).sum() / len(us))
        # A shadow pixel on the wrong side of the test's background threshold costs IoU, so it
        # weighs like a 10-level colour error on every ground pixel's share.
        miss = float((non_background(mod) != ref_shadow).sum() / len(us))
        return mse + args.mask_weight * miss

    best = cost(blobs)
    print(f'region x {x0}-{x1} y {y0}-{y1}, {len(us)} ground px; start rms {math.sqrt(best):.2f}')
    steps = [0.12, 0.12, 0.1, 0.1, 0.08, 0.2, 0.1]
    lows = [-3, -3, 0.08, 0.08, 0.0, -1.6, 0.0]
    highs = [3, 3, 2.5, 2.5, 0.95, 1.6, 0.9]
    for it in range(args.iters):
        for item_id in args.ids:
            for bi in range(len(blobs[item_id])):
                for k in range(len(blobs[item_id][bi])):
                    for sign in (1, -1):
                        while True:
                            cand = {kk: [list(b) for b in vv] for kk, vv in blobs.items()}
                            v = cand[item_id][bi][k] + sign * steps[k]
                            if not lows[k] <= v <= highs[k]:
                                break
                            cand[item_id][bi][k] = v
                            c = cost(cand)
                            if c < best - 1e-4:
                                blobs, best = cand, c
                            else:
                                break
        cstep = 12 * 0.6 ** it
        for k in range(3):
            for sign in (1, -1):
                while True:
                    cand = list(color)
                    cand[k] = min(255, max(0, cand[k] + sign * cstep))
                    c = cost(blobs, cand)
                    if c < best - 1e-4:
                        color, best = cand, c
                    else:
                        break
        print(f'iter {it}: rms {math.sqrt(best):.2f}  colour {[round(v) for v in color]}')
        steps = [s * 0.6 for s in steps]
    out = {k: [[round(x, 3) for x in b] for b in v] for k, v in blobs.items()}
    hexcolor = '#' + ''.join(f'{round(v):02x}' for v in color)
    print(json.dumps(out))
    print(f'colour {hexcolor}')
    out['_color'] = hexcolor
    if args.out:
        Path(args.out).write_text(json.dumps(out))
    # Reference | model over the region, with excluded pixels greyed, to read back.
    img = np.full((y1 - y0, x1 - x0, 3), 255.0)
    img[ys, xs] = target
    mod = np.full_like(img, 255.0)
    mod[ys, xs] = model(blobs, (us,), offsets, color, fixed_srgb_lin)
    both = np.concatenate([img, np.full((3, x1 - x0, 3), 0.0), mod], 0).astype(np.uint8)
    path = ROOT / 'screenshots/kit/progress/shadowfit.png'
    Image.fromarray(both).resize((both.shape[1] * 3, both.shape[0] * 3), Image.Resampling.NEAREST).save(path)
    print(f'image: {path}')


if __name__ == '__main__':
    main()
