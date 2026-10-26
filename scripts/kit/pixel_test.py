#!/usr/bin/env python3
"""Pixel-level test for kit elements: does each element match its crop of the reference sheet?

This is the acceptance test the per-element loop drives toward. It follows the img2threejs
microscope rules (grimoire/review/divine_eye_microscope.md): measure inside the silhouette, and
judge by the worst patch, never a global average.

For every element, at the reference's own resolution (512 x 286):
  1. align the render crop to the reference crop: best silhouette overlap within +-6 px, in
     half-pixel steps (the render is 2x the reference, so it is shifted at full resolution and
     then box-downsampled);
  2. iou         silhouette overlap (shape and size);
  3. dE          per-pixel CIEDE2000 inside the shared silhouette: mean and 90th percentile;
  4. worstPatch  mean dE of the worst 6 x 6 px patch that is mostly inside the silhouette
                 (one wrong detail fails the element even when the average is fine);
  5. ssim        luma SSIM over the crop at full resolution (structure, texture, linework).

An element PASSES when every threshold holds (see THRESHOLDS). The script exits 1 if any tested
element fails, so it can run as `npm run test:kit` and as the stop condition of a loop.

It also writes progress images: screenshots/kit/progress/<id>.png (reference | render | dE heat
map, enlarged) and a board of every tested element.

Usage:
  pixel_test.py <render.png> [--ids a,b | --family blocks] [--json out.json] [--board out.png]
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / 'docs/reference/asset-kit.jpg'
MANIFEST = ROOT / 'src/kit/manifest.js'
PROGRESS = ROOT / 'screenshots/kit/progress'
BG = np.array([220.0, 220.0, 220.0])
PAD = 4
SEARCH = 6
PATCH = 6
ZOOM = 6

# Near-perfect: what the loop has to reach before an element counts as done.
THRESHOLDS = {'iou': 0.95, 'meanDE': 6.0, 'p90DE': 12.0, 'worstPatch': 14.0, 'ssim': 0.70}


def load_items():
    text = MANIFEST.read_text()
    return [{'id': m.group(1), 'family': m.group(2), 'box': [int(v) for v in m.group(3).split(',')]}
            for m in re.finditer(r"id: '([^']+)', family: '([^']+)'.*?box: \[([^\]]+)\]", text)]


def srgb_to_lab(rgb):
    rgb = rgb / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def ciede2000(lab1, lab2):
    """Vectorized CIEDE2000 colour difference."""
    L1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    L2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp = L2 - L1
    dCp = C2p - C1p
    dh = h2p - h1p
    dh = np.where(C1p * C2p == 0, 0, np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh)))
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh / 2))
    Lbp = (L1 + L2) / 2
    Cbp = (C1p + C2p) / 2
    hsum = h1p + h2p
    hbp = np.where(C1p * C2p == 0, hsum, np.where(np.abs(h1p - h2p) > 180,
                                                 np.where(hsum < 360, (hsum + 360) / 2, (hsum - 360) / 2), hsum / 2))
    T = (1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp))
         + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dtheta = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dtheta)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def mask_of(a):
    d = np.linalg.norm(a - BG, axis=-1)
    sat = a.max(-1) - a.min(-1)
    return (d > 20) | (sat > 14)


def window(img, box, pad):
    x0, y0, x1, y1 = box
    return img[y0 - pad:y1 + pad, x0 - pad:x1 + pad]


def ssim(a, b):
    """Mean SSIM of two luma images with a 7x7 box window (stdlib-style, numpy only)."""
    def box(x):
        k = 7
        p = np.pad(x, k // 2, mode='edge')
        c = np.cumsum(np.cumsum(p, 0), 1)
        c = np.pad(c, ((1, 0), (1, 0)))
        return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ma, mb = box(a), box(b)
    va, vb = box(a * a) - ma * ma, box(b * b) - mb * mb
    cov = box(a * b) - ma * mb
    return float((((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2))).mean())


def render_window(ren2x, box, dx2, dy2):
    """The render's padded box shifted by (dx2, dy2) render pixels, box-downsampled to reference scale."""
    x0, y0, x1, y1 = box
    w, h = (x1 - x0 + 2 * PAD), (y1 - y0 + 2 * PAD)
    sx, sy = 2 * (x0 - PAD) + dx2, 2 * (y0 - PAD) + dy2
    a = ren2x[sy:sy + 2 * h, sx:sx + 2 * w]
    if a.shape[:2] != (2 * h, 2 * w):
        return None
    return a.reshape(h, 2, w, 2, 3).mean(axis=(1, 3))


def evaluate(ref_img, ren2x, item):
    box = item['box']
    ref = window(ref_img, box, PAD)
    ref_m = mask_of(ref)
    best = (-1.0, 0, 0)
    for dy2 in range(-2 * SEARCH, 2 * SEARCH + 1):
        for dx2 in range(-2 * SEARCH, 2 * SEARCH + 1):
            ren = render_window(ren2x, box, dx2, dy2)
            if ren is None:
                continue
            ren_m = mask_of(ren)
            union = (ref_m | ren_m).sum()
            iou = (ref_m & ren_m).sum() / union if union else 0.0
            if iou > best[0]:
                best = (iou, dx2, dy2)
    iou, dx2, dy2 = best
    dx, dy = dx2 / 2, dy2 / 2
    ren = render_window(ren2x, box, dx2, dy2)
    ren_m = mask_of(ren)
    inside = ref_m & ren_m
    de = ciede2000(srgb_to_lab(ref), srgb_to_lab(ren))
    vals = de[inside] if inside.any() else np.array([99.0])
    worst, worst_at = 0.0, [0, 0]
    h, w = inside.shape
    for y in range(0, h - PATCH + 1, PATCH // 2):
        for x in range(0, w - PATCH + 1, PATCH // 2):
            cell = inside[y:y + PATCH, x:x + PATCH]
            if cell.mean() >= 0.6:
                m = float(de[y:y + PATCH, x:x + PATCH][cell].mean())
                if m > worst:
                    worst, worst_at = m, [round((x + PATCH / 2) / w, 2), round((y + PATCH / 2) / h, 2)]
    luma = lambda a: a @ np.array([0.299, 0.587, 0.114])
    result = {
        'id': item['id'], 'family': item['family'], 'offset': [dx, dy],
        'iou': round(float(iou), 4), 'meanDE': round(float(vals.mean()), 2), 'p90DE': round(float(np.percentile(vals, 90)), 2),
        'worstPatch': round(worst, 2), 'worstAt': worst_at, 'ssim': round(ssim(luma(ref), luma(ren)), 4),
    }
    fails = []
    if result['iou'] < THRESHOLDS['iou']:
        fails.append('iou')
    for k in ('meanDE', 'p90DE', 'worstPatch'):
        if result[k] > THRESHOLDS[k]:
            fails.append(k)
    if result['ssim'] < THRESHOLDS['ssim']:
        fails.append('ssim')
    result['fails'] = fails
    result['pass'] = not fails
    return result, ref, ren, de, inside


def heat(de, inside):
    """dE heat map: black (0) -> red (10) -> yellow (20+); outside the silhouette stays grey."""
    t = np.clip(de / 20.0, 0, 1)
    rgb = np.stack([np.clip(t * 2, 0, 1), np.clip(t * 2 - 1, 0, 1), np.zeros_like(t)], -1) * 255
    rgb[~inside] = 90
    return rgb


def tile(result, ref, ren, de, inside):
    parts = [Image.fromarray(a.astype(np.uint8)) for a in (ref, ren, heat(de, inside))]
    parts = [p.resize((p.width * ZOOM, p.height * ZOOM), Image.Resampling.NEAREST if i == 2 else Image.Resampling.LANCZOS)
             for i, p in enumerate(parts)]
    w, h = parts[0].size
    img = Image.new('RGB', (w * 3 + 16, h + 34), (250, 250, 250))
    for i, p in enumerate(parts):
        img.paste(p, (i * (w + 8), 0))
    d = ImageDraw.Draw(img)
    status = 'PASS' if result['pass'] else 'FAIL ' + ','.join(result['fails'])
    d.text((4, h + 4), f"{result['id']}  {status}", fill=(0, 120, 0) if result['pass'] else (170, 0, 0))
    d.text((4, h + 18), f"iou {result['iou']:.3f}  dE mean {result['meanDE']:.1f} p90 {result['p90DE']:.1f}  "
                        f"worst patch {result['worstPatch']:.1f}  ssim {result['ssim']:.3f}", fill=(40, 40, 40))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('render')
    ap.add_argument('--ids')
    ap.add_argument('--family')
    ap.add_argument('--json')
    ap.add_argument('--board')
    args = ap.parse_args()

    ref_full = Image.open(REFERENCE).convert('RGB')
    ren_full = Image.open(args.render).convert('RGB')
    if ren_full.size != (ref_full.width * 2, ref_full.height * 2):
        sys.exit(f'render must be 2x the reference ({ref_full.width * 2}x{ref_full.height * 2}), got {ren_full.size}')
    ref_img = np.asarray(ref_full, dtype=np.float64)
    ren_img = np.asarray(ren_full, dtype=np.float64)
    items = load_items()
    if args.family:
        items = [it for it in items if it['family'] == args.family]
    if args.ids:
        wanted = args.ids.split(',')
        items = [it for it in items if it['id'] in wanted]
    if not items:
        sys.exit('no items matched')

    PROGRESS.mkdir(parents=True, exist_ok=True)
    results, tiles = [], []
    for it in items:
        r, ref, ren, de, inside = evaluate(ref_img, ren_img, it)
        results.append(r)
        t = tile(r, ref, ren, de, inside)
        t.save(PROGRESS / f"{it['id']}.png")
        tiles.append(t)
        print(f"{'PASS' if r['pass'] else 'FAIL'}  {r['id']:20s} iou {r['iou']:.3f}  dE {r['meanDE']:5.2f} "
              f"p90 {r['p90DE']:5.2f}  worst {r['worstPatch']:5.2f} at {r['worstAt']}  ssim {r['ssim']:.3f}  "
              f"offset {r['offset'][0]:+.1f},{r['offset'][1]:+.1f}  {'' if r['pass'] else 'fails: ' + ','.join(r['fails'])}")
    passed = sum(r['pass'] for r in results)
    print(f"{passed}/{len(results)} elements pass  (thresholds: {THRESHOLDS})")

    if args.json:
        Path(args.json).write_text(json.dumps({'thresholds': THRESHOLDS, 'results': results}, indent=1) + '\n')
    if args.board:
        cols = 2
        cw = max(t.width for t in tiles)
        ch = max(t.height for t in tiles)
        rows = (len(tiles) + cols - 1) // cols
        board = Image.new('RGB', (cw * cols + 10 * (cols - 1), ch * rows + 8 * (rows - 1)), (255, 255, 255))
        for i, t in enumerate(tiles):
            board.paste(t, ((i % cols) * (cw + 10), (i // cols) * (ch + 8)))
        board.save(args.board)
        print(f"board: {args.board}")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
