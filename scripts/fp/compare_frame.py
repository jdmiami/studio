#!/usr/bin/env python3
"""How close a cave screenshot is to the reference frame docs/reference/cave-door.jpg.

The reference is a 1024 x 572 game frame with a HUD and first-person hands; those are masked out
(they are compared separately) so the score is the world's. The render may be any size with the
same aspect; it is box-downsampled to the reference's size.

Prints JSON: mean / p90 CIEDE2000 and luma SSIM over the unmasked frame, the same per cell of an
8 x 4 grid (so the worst region is named), and an edge-agreement score: the fraction of the
reference's edge pixels within 2 px of a render edge (the line-tracing check: block outlines land
where the reference draws them).

Writes next to <render>: <stem>-board.png (reference | render | dE heat) and <stem>-edges.png
(reference edges red, render edges cyan, agreement white, over the dimmed reference), the
"line tracing" overlay to read before moving the camera or a terrace.

Usage: compare_frame.py <render.png> [--region x0,y0,x1,y1] [--json out.json] [--no-mask]
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'kit'))
from pixel_test import ciede2000, srgb_to_lab, ssim  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / 'docs/reference/cave-door.jpg'
W, H = 1024, 572
# Boxes to leave out (reference px): HUD panels, the prompt labels, and the two hands.
MASKS = {
    'hud-vitals': (14, 12, 335, 82), 'hud-topright': (800, 12, 1012, 118), 'minimap': (12, 440, 134, 562),
    'prompts': (430, 470, 600, 530), 'hand-left': (225, 428, 530, 572), 'hand-right': (690, 372, 1024, 572),
}


def load(path, size=(W, H)):
    img = Image.open(path).convert('RGB')
    if img.size != size:
        a = np.asarray(img, dtype=np.float64)
        fy, fx = a.shape[0] / size[1], a.shape[1] / size[0]
        if abs(fy - round(fy)) < 1e-6 and abs(fx - round(fx)) < 1e-6 and fy == fx and fy >= 1:
            k = int(fy)
            a = a.reshape(size[1], k, size[0], k, 3).mean(axis=(1, 3))
        else:
            a = np.asarray(img.resize(size, Image.Resampling.BOX), dtype=np.float64)
        return a
    return np.asarray(img, dtype=np.float64)


def edges(rgb):
    g = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    g = cv2.GaussianBlur(g, (3, 3), 0)
    return cv2.Canny(g, 40, 110) > 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('render')
    ap.add_argument('--region', help='x0,y0,x1,y1 in reference px: score only this box')
    ap.add_argument('--json')
    ap.add_argument('--no-mask', action='store_true')
    args = ap.parse_args()
    ref = load(REFERENCE)
    ren = load(args.render)
    keep = np.ones((H, W), bool)
    if not args.no_mask:
        for x0, y0, x1, y1 in MASKS.values():
            keep[y0:y1, x0:x1] = False
    if args.region:
        x0, y0, x1, y1 = map(int, args.region.split(','))
        box = np.zeros_like(keep)
        box[y0:y1, x0:x1] = True
        keep &= box
    de = ciede2000(srgb_to_lab(ref), srgb_to_lab(ren))
    luma = lambda a: a @ np.array([0.299, 0.587, 0.114])
    lr, ln = luma(ref), luma(ren)
    # SSIM over the kept area: compute on the whole frame, average where kept.
    result = {
        'meanDE': round(float(de[keep].mean()), 2), 'p90DE': round(float(np.percentile(de[keep], 90)), 2),
        'ssim': round(ssim(np.where(keep, lr, 0), np.where(keep, ln, 0)), 4),
    }
    er, en = edges(ref), edges(ren)
    near = cv2.dilate(en.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    nearRef = cv2.dilate(er.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    result['edgeRecall'] = round(float((er & near & keep).sum() / max((er & keep).sum(), 1)), 3)
    result['edgePrecision'] = round(float((en & nearRef & keep).sum() / max((en & keep).sum(), 1)), 3)
    cells = []
    for gy in range(4):
        for gx in range(8):
            sy, sx = slice(gy * H // 4, (gy + 1) * H // 4), slice(gx * W // 8, (gx + 1) * W // 8)
            k = keep[sy, sx]
            if k.sum() < 200:
                continue
            cells.append({'cell': [gx, gy], 'box': [sx.start, sy.start, sx.stop, sy.stop], 'meanDE': round(float(de[sy, sx][k].mean()), 2),
                          'edgeRecall': round(float((er[sy, sx] & near[sy, sx] & k).sum() / max((er[sy, sx] & k).sum(), 1)), 3)})
    result['cells'] = sorted(cells, key=lambda c: -c['meanDE'])
    print(json.dumps({k: v for k, v in result.items() if k != 'cells'}))
    print('worst cells:', ' '.join(f"{c['cell']}:{c['meanDE']}" for c in result['cells'][:6]))
    if args.json:
        Path(args.json).write_text(json.dumps(result, indent=1))
    stem = Path(args.render).with_suffix('')
    heat = np.zeros((H, W, 3))
    t = np.clip(de / 25, 0, 1)
    heat[..., 0] = 255 * t
    heat[..., 1] = 255 * (1 - abs(t - 0.5) * 2) * 0.8
    heat[..., 2] = 255 * (1 - t)
    heat[~keep] = 40
    board = np.concatenate([ref, ren, heat], axis=1)
    Image.fromarray(board.astype(np.uint8)).save(f'{stem}-board.png')
    over = (ref * 0.35 + 90).astype(np.uint8).copy()
    both = er & near
    over[er & ~both] = (255, 60, 60)
    over[en & ~nearRef] = (60, 220, 255)
    over[both] = (255, 255, 255)
    over[~keep] = (over[~keep] * 0.4).astype(np.uint8)
    Image.fromarray(over).save(f'{stem}-edges.png')
    print(f'board {stem}-board.png  edges {stem}-edges.png')


if __name__ == '__main__':
    main()
