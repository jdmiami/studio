#!/usr/bin/env python3
"""Acceptance test for scripts/fp/raster_layout.py: rasterize a layout under the camera the game
rendered it with, classify the game's render by colour into the same class ids, and report the
per-class IoU.

The colour classifier is supervised by hand-picked sample boxes of the render (SAMPLES, reference
px for the default spawn camera, props off), one Gaussian per class in CIE Lab after a light blur
that hides the block outlines; a 5 x 5 mode filter cleans the result. It knows nothing of the
rasterizer, so the IoU measures the geometry (projection, painter's order, hem band), not the
thresholds.

Usage: raster_check.py <render.png> <layout.json> [--camera default|cam.json] [--out dir]
                        [--prefix name] [--slab-faces ceiling|earth] [--samples boxes.json]
Writes <out>/<prefix>overlay.png (raster class boundaries in cyan over the render),
<prefix>board.png (render | render classified | raster) and <prefix>render-classes.png, prints
the IoU table and JSON.
"""
import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from raster_layout import CLASSES, Rasterizer, class_edges, load_camera, load_layout, preview  # noqa: E402

# Class -> boxes (u0, v0, u1, v1) of the props-free render at the default spawn camera.
SAMPLES = {
    0: [(0, 0, 45, 90)],
    1: [(330, 340, 500, 400), (830, 410, 1000, 470), (290, 205, 370, 225)],
    2: [(250, 40, 560, 130), (880, 120, 1010, 250), (210, 310, 300, 400)],
    3: [(10, 280, 130, 400), (120, 430, 230, 520)],
    4: [(560, 370, 760, 480), (540, 500, 760, 560)],
    5: [(630, 125, 700, 300), (720, 125, 800, 300)],
    6: [(592, 120, 618, 300), (812, 120, 845, 300), (640, 85, 800, 100)],
    7: [(300, 2, 800, 10)],
}
BLUR = 1.2  # px, enough to hide the one-pixel outlines between blocks
MODE_WINDOW = 5
DOOR_WINDOW = 15  # the door's panels are 15-25 px; the grout between them is door-coloured


def classify(rgb, samples):
    """Per-pixel class by the nearest class Gaussian (Mahalanobis) in Lab, mode-filtered."""
    lab = cv2.cvtColor(cv2.GaussianBlur(rgb, (0, 0), BLUR), cv2.COLOR_RGB2LAB).astype(np.float64)
    ids = sorted(samples)
    dist = []
    for c in ids:
        pts = np.concatenate([lab[v0:v1, u0:u1].reshape(-1, 3) for u0, v0, u1, v1 in samples[c]])
        mu = pts.mean(0)
        cov = np.cov(pts.T) + np.eye(3) * 4.0
        inv = np.linalg.inv(cov)
        d = lab.reshape(-1, 3) - mu
        dist.append(np.einsum('ij,jk,ik->i', d, inv, d) + np.log(np.linalg.det(cov)))
    labels = np.array(ids, np.uint8)[np.argmin(np.stack(dist, 1), 1)].reshape(lab.shape[:2])
    # Mode filter: the class with the most votes in the window.
    votes = np.stack([cv2.boxFilter((labels == c).astype(np.float32), -1, (MODE_WINDOW, MODE_WINDOW)) for c in ids], -1)
    labels = np.array(ids, np.uint8)[np.argmax(votes, -1)]
    # The ceiling's undersides are the same dark salmon as the shaded bottom of every wall block;
    # those are thin bands, the ceiling is a broad one: keep only ceiling regions thicker than 7 px.
    if 7 in ids:
        ceil = (labels == 7).astype(np.uint8)
        kept = cv2.morphologyEx(ceil, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        labels[(ceil > 0) & (kept == 0)] = 2
    # The door's mosaic and the frame's stone share their greys: the mosaic is told by its dark
    # grout, so within the grey family each pixel takes the majority of door vs frame nearby.
    if 5 in ids and 6 in ids:
        grey = (labels == 5) | (labels == 6)
        d = cv2.boxFilter((labels == 5).astype(np.float32), -1, (DOOR_WINDOW, DOOR_WINDOW))
        f = cv2.boxFilter((labels == 6).astype(np.float32), -1, (DOOR_WINDOW, DOOR_WINDOW))
        labels[grey & (d >= f)] = 5
        labels[grey & (d < f)] = 6
    return labels


def iou_table(a, b, classes):
    rows = []
    for c in classes:
        cs = c if isinstance(c, tuple) else (c,)
        A, B = np.isin(a, cs), np.isin(b, cs)
        inter, union = int((A & B).sum()), int((A | B).sum())
        rows.append({'class': '+'.join(CLASSES[k] for k in cs), 'id': c, 'iou': round(inter / union, 3) if union else None,
                     'render_px': int(A.sum()), 'raster_px': int(B.sum())})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('render')
    ap.add_argument('layout')
    ap.add_argument('--camera', default='default')
    ap.add_argument('--out', default=None)
    ap.add_argument('--prefix', default='check-')
    ap.add_argument('--slab-faces', choices=['ceiling', 'earth'], default='ceiling')
    ap.add_argument('--samples', help='JSON {class id: [[u0, v0, u1, v1], ...]} overriding SAMPLES')
    args = ap.parse_args()
    out = Path(args.out or Path(args.render).parent)
    out.mkdir(parents=True, exist_ok=True)
    rgb = cv2.cvtColor(cv2.imread(args.render), cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]
    samples = SAMPLES
    if args.samples:
        samples = {int(k): [tuple(b) for b in v] for k, v in json.load(open(args.samples)).items()}
    truth = classify(rgb, samples)

    R = Rasterizer(load_camera(args.camera), w, h, slab_faces=args.slab_faces)
    L = load_layout(args.layout)
    t0 = time.perf_counter()
    res = R.render(L)
    dt = time.perf_counter() - t0
    raster = res['classes']
    # Classes 1-7, plus the two pairs the colour classifier cannot always tell apart.
    rows = iou_table(truth, raster, [*range(1, 8), (2, 7), (5, 6)])
    acc = float((truth == raster).mean())
    print(f'render time {1e3 * dt:.1f} ms ({res["quads"]} quads); pixel agreement {acc:.3f}')
    print(f'{"class":14s} {"IoU":>6s} {"render px":>10s} {"raster px":>10s}')
    for r in rows:
        print(f'{r["class"]:14s} {str(r["iou"]):>6s} {r["render_px"]:10d} {r["raster_px"]:10d}')

    edges = class_edges(raster)
    over = rgb.copy()
    over[edges] = (40, 230, 255)
    cv2.imwrite(str(out / f'{args.prefix}overlay.png'), cv2.cvtColor(over, cv2.COLOR_RGB2BGR))
    board = np.concatenate([rgb, preview(truth, class_edges(truth)), preview(raster, edges)], 1)
    cv2.imwrite(str(out / f'{args.prefix}board.png'), cv2.cvtColor(board, cv2.COLOR_RGB2BGR))
    cv2.imwrite(str(out / f'{args.prefix}render-classes.png'), truth)
    # Where they disagree, by (render class, raster class) pair: the biggest confusions.
    pairs = {}
    for a in range(0, 8):
        for b in range(0, 8):
            if a != b:
                n = int(((truth == a) & (raster == b)).sum())
                if n > 500:
                    pairs[f'{CLASSES[a]}->{CLASSES[b]}'] = n
    print('confusions (render->raster px):', dict(sorted(pairs.items(), key=lambda kv: -kv[1])[:10]))
    print(json.dumps({'agreement': round(acc, 4), 'iou': {r['class']: r['iou'] for r in rows}, 'ms': round(1e3 * dt, 1)}))
    print(f'overlay {out / (args.prefix + "overlay.png")}  board {out / (args.prefix + "board.png")}')


if __name__ == '__main__':
    main()
