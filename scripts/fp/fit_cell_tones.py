#!/usr/bin/env python3
"""Fit each block's tone to the painting: "shaded cells".

The painting gives every block of the cave its own tone (a little lighter, darker, warmer or cooler
than its neighbours). The level draws blocks instanced, one colour multiplier per instance
(src/cave/level.js cellTone). This fits that multiplier per block from the reference frame:

1. every pixel of the reference is mapped to the block it shows: the layout rasterizer
   (scripts/fp/raster_layout.py) gives the quad per pixel; the pixel's ray hits the quad's plane;
   the hit's height picks the block in the quad's column (tops and slab undersides by their side);
2. pixels count only where the layout's class agrees with the reference's segmentation, away from
   quad edges (a 5 px erosion), not grass (the blankets cover the tops) and not props or HUD;
3. per block with enough pixels the total multiplier it wants: its current one times
   median(painting) / median(render), in linear RGB; a gain per class is the median of those (so
   the ceiling's systematic pink-for-cream applies to every slab), and each block keeps its
   residual over that gain as its tone unless it is an outlier (the layout shows another object
   there);
   where render is the game's own frame at the reference pose with the current tones (rendered by
   scripts/screenshot.mjs). Repeating the render and the update converges the tones through the
   game's lighting, tone mapping and grade.

Writes src/cave/cell-tones.json ({"x,y,z": [r, g, b]}), read by level.js; blocks the painting does
not show keep the procedural jitter.

Usage: fit_cell_tones.py --render <game frame at the reference pose> [--min-px 12]
                         [--camera cam.json --reference ref.jpg --classes classes.png]  (default: the cave painting)
"""
import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from raster_layout import Rasterizer, load_layout  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TONES = ROOT / 'src/cave/cell-tones.json'
FIT_CLASSES = (2, 3, 4, 7)  # earth faces, water, floor, ceiling
# A block whose tone would leave this range, or swing hue (channel spread), is one where the layout
# shows a different object than the painting there: it is left out and keeps its procedural tone.
LO, HI = 0.62, 1.6
SPREAD = 1.3


def to_linear(rgb):
    c = rgb.astype(np.float64) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def pixel_blocks(cam, W, H):
    """(H, W, 3) int block (x, y, z) per pixel, valid mask, layout classes."""
    rast = Rasterizer(cam, W, H)
    L = load_layout(json.load(open(ROOT / 'src/cave/layout.json')))
    out = rast.render(L, want_ids=True)
    ids, cls = out['ids'].astype(np.int64), out['classes']
    P, _, _ = rast.quads(L)
    cells = rast.quad_cells
    f = (H / 2) / math.tan(math.radians(cam['fov']) / 2)
    uu, vv = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    d_cam = np.stack([(uu - W / 2) / f, -(vv - H / 2) / f, -np.ones_like(uu)], -1)
    R = rast.cam.R
    d = d_cam @ R.T
    eye = np.asarray(cam['eye'], float)
    blocks = np.full((H, W, 3), -9999, np.int64)
    valid = ids > 0
    q = ids[valid] - 1
    quad = P[q]  # (n, 4, 3)
    dirs = d[valid]
    # The quad's constant axis is its plane.
    span = quad.max(1) - quad.min(1)
    axis = np.argmin(span, 1)
    plane = quad[np.arange(len(q)), 0, axis]
    t = (plane - eye[axis]) / dirs[np.arange(len(q)), axis]
    hit = eye + dirs * t[:, None]
    y = hit[:, 1]
    by = np.where(axis == 1, np.where(plane < eye[1], np.round(plane) - 1, np.round(plane)), np.floor(y))
    cx, cz = cells[q, 0], cells[q, 1]
    blocks[valid] = np.stack([cx, by, cz], 1).astype(np.int64)
    # Away from quad edges: the 5x5 neighbourhood shows the same quad.
    same = np.ones_like(valid)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            same &= np.roll(np.roll(ids, dy, 0), dx, 1) == ids
    return blocks, valid & same, cls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', required=True)
    ap.add_argument('--min-px', type=int, default=12)
    ap.add_argument('--camera', default=str(ROOT / 'docs/reference/cave-door-camera.json'))
    ap.add_argument('--reference', default=str(ROOT / 'docs/reference/cave-door.jpg'))
    ap.add_argument('--classes', default=str(ROOT / 'docs/reference/cave-door-classes.png'))
    args = ap.parse_args()
    cam = json.load(open(args.camera))
    ref_img = Image.open(args.reference).convert('RGB')
    W, H = ref_img.size
    ref = to_linear(np.asarray(ref_img))
    ren = to_linear(np.asarray(Image.open(args.render).convert('RGB').resize((W, H), Image.Resampling.BOX)))
    ref_cls = np.asarray(Image.open(args.classes))
    blocks, valid, cls = pixel_blocks(cam, W, H)
    use = valid & (cls == ref_cls) & np.isin(cls, FIT_CLASSES)
    data = json.loads(TONES.read_text()) if TONES.exists() else {}
    gains = {int(k): np.array(v) for k, v in data.get('gains', {}).items()}
    tones = data.get('tones', {})
    keys = blocks[use]
    flat = keys[:, 0] * 1_000_000 + (keys[:, 1] + 100) * 1000 + (keys[:, 2] + 500)
    order = np.argsort(flat)
    flat, keys = flat[order], keys[order]
    a, b, c = ref[use][order], ren[use][order], cls[use][order]
    starts = np.r_[0, np.nonzero(np.diff(flat))[0] + 1, len(flat)]
    # Per block: the total multiplier it should have (its class gain x its tone x the ratio).
    want = {}
    for s0, e in zip(starts[:-1], starts[1:]):
        if e - s0 < args.min_px:
            continue
        k = '%d,%d,%d' % tuple(keys[s0])
        k_cls = int(np.bincount(c[s0:e]).argmax())
        # Damped (square root): the render's response to a multiplier runs through tone mapping and
        # the grade, so full steps overshoot and oscillate.
        ratio = np.sqrt(np.median(a[s0:e], 0) / np.maximum(np.median(b[s0:e], 0), 1e-4))
        current = gains.get(k_cls, np.ones(3)) * np.array(tones.get(k, [1.0, 1.0, 1.0]))
        want[k] = (k_cls, current * ratio)
    # Level 1: a gain per class (applied to all its blocks, seen or not): the median wanted total.
    for k_cls in FIT_CLASSES:
        totals = np.array([t for kc, t in want.values() if kc == k_cls])
        if len(totals) >= 3:
            gains[k_cls] = np.clip(np.median(totals, 0), 0.3, 3.0)
    # Level 2: each block's residual tone over its class gain, unless it is an outlier.
    tones, changes, n, rejected = {}, [], 0, 0
    for k, (k_cls, total) in want.items():
        t = total / gains.get(k_cls, np.ones(3))
        if t.min() < LO or t.max() > HI or t.max() / t.min() > SPREAD:
            rejected += 1
            continue
        tones[k] = [round(float(v), 3) for v in t]
        n += 1
    TONES.write_text(json.dumps({
        '_': f'Fitted to {Path(args.reference).resolve().relative_to(ROOT)} by scripts/fp/fit_cell_tones.py. gains: per segmentation class '
             '(2 earth/wall, 3 water, 4 floor, 7 ceiling) a multiplier for every block of that kind; tones: per block '
             '"x,y,z" the residual multiplier over its gain (blocks the painting does not show, or where the layout '
             'differs from it, are absent).',
        'gains': {str(k): [round(float(x), 3) for x in v] for k, v in sorted(gains.items())},
        'tones': dict(sorted(tones.items()))}, indent=0))
    print('gains ' + ', '.join(f'{k}: {np.round(v, 2).tolist()}' for k, v in sorted(gains.items()))
          + f'; {n} block tones, {rejected} rejected (layout differs there), from {int(use.sum())} px')

if __name__ == '__main__':
    main()
