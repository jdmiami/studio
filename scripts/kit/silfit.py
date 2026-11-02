#!/usr/bin/env python3
"""Fit a cluster of rounded-cube puffs to an element's reference silhouette, without a browser.

Each puff is a rounded box (size s, height 0.92 s, corner radius 0.4 s, turned 45° to face the
camera) placed at screen-aligned coordinates (s_pos, y, d): s along screen-right, y up, d toward the
camera, all in world units relative to the element's base. Puffs are projected through the kit's
own orthographic camera (azimuth 45°, elevation 35°, 39.5 px per unit), splatted into a mask at 4x,
and their union is compared with the reference's object mask (cast shadows excluded) inside the
element's box. Coordinate descent on (s_pos, y, size) per puff maximizes IoU; d is kept (it only
orders overlapping puffs, which the silhouette cannot see).

Usage: silfit.py <id> <layout.json> [--trunk r,h] [--iters 4] [--out fitted.json]
  layout.json: [[s, y, d, size], ...] (y is the puff's bottom), anchor taken from the family file.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PX = 39.5
EL = math.radians(35)
SS = 4  # supersampling for the mask
R = np.array([math.sqrt(0.5), 0, -math.sqrt(0.5)])
U = np.array([-math.sin(EL) * math.sin(math.pi / 4), math.cos(EL), -math.sin(EL) * math.cos(math.pi / 4)])


def reference_object_mask(box, pad, edge=22):
    """Only the element: everything its outline encloses.

    The background is flood-filled in from the crop border through every pixel that is not on a
    strong luminance edge (thickened by one pixel to close small gaps). Cast shadows have soft
    edges, so the fill flows through them; the element's dark outline stops it.
    """
    from collections import deque
    img = np.asarray(Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB'), dtype=np.float64)
    x0, y0, x1, y1 = box
    a = img[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
    lum = a @ np.array([0.299, 0.587, 0.114])
    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
    gy[1:-1, :] = lum[2:, :] - lum[:-2, :]
    barrier = np.hypot(gx, gy) > edge
    thick = barrier.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        thick |= np.roll(np.roll(barrier, dy, 0), dx, 1)
    h, w = lum.shape
    reached = np.zeros((h, w), bool)
    q = deque()
    for y, x in [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]:
        if not thick[y, x] and not reached[y, x]:
            reached[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not thick[ny, nx] and not reached[ny, nx]:
                reached[ny, nx] = True
                q.append((ny, nx))
    return ~reached


def rounded_box_points(size, height, radius, n=14):
    """Points on the surface of a rounded box centered at the origin (same construction as softBox)."""
    half = np.array([size / 2, height / 2, size / 2])
    inner = half - radius
    g = np.linspace(-1, 1, n)
    pts = []
    for axis in range(3):
        for sign in (-1, 1):
            a, b = [i for i in range(3) if i != axis]
            A, B = np.meshgrid(g, g)
            p = np.zeros((n * n, 3))
            p[:, axis] = sign * half[axis]
            p[:, a] = A.ravel() * half[a]
            p[:, b] = B.ravel() * half[b]
            pts.append(p)
    p = np.concatenate(pts)
    c = np.clip(p, -inner, inner)
    v = p - c
    v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
    return c + v * radius


def rot_y(points, angle):
    c, s = math.cos(angle), math.sin(angle)
    m = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return points @ m.T


def world_of(s, y, d):
    k = math.sqrt(0.5)
    return np.array([(s + d) * k, y, (d - s) * k])


def project(points, anchor, origin):
    """World points (relative to the element base) -> crop pixel coordinates (x, y) at SS scale."""
    u = anchor[0] + PX * (points @ R)
    v = anchor[1] - PX * (points @ U)
    return (u - origin[0]) * SS, (v - origin[1]) * SS


def splat(mask, xs, ys, r):
    h, w = mask.shape
    xi = np.round(xs).astype(int)
    yi = np.round(ys).astype(int)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            x = xi + dx
            y = yi + dy
            ok = (x >= 0) & (y >= 0) & (x < w) & (y < h)
            mask[y[ok], x[ok]] = True


def render_mask(layout, trunk, anchor, origin, shape):
    m = np.zeros((shape[0] * SS, shape[1] * SS), bool)
    if trunk:
        r, h = trunk
        t = np.linspace(0, 2 * math.pi, 40)
        ys = np.linspace(0, h, 20)
        T, Y = np.meshgrid(t, ys)
        pts = np.stack([r * np.cos(T).ravel(), Y.ravel(), r * np.sin(T).ravel()], 1)
        xs, yy = project(pts, anchor, origin)
        splat(m, xs, yy, 3)
    for s, y, d, size in layout:
        # Shells at several scales fill each puff's volume, so its projection is solid while gaps
        # between puffs stay open (a scan fill would hide them).
        base = rounded_box_points(size, size * 0.92, size * 0.4, n=12)
        pts = np.concatenate([base * k for k in (1.0, 0.75, 0.5, 0.25)])
        pts = rot_y(pts, math.pi / 4) * 1.03 + world_of(s, y + size * 0.46, d)  # 1.03: bulge
        xs, yy = project(pts, anchor, origin)
        splat(m, xs, yy, 4)
    return m.reshape(shape[0], SS, shape[1], SS).mean(axis=(1, 3)) > 0.5


def iou(a, b):
    u = (a | b).sum()
    return (a & b).sum() / u if u else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('layout')
    ap.add_argument('--trunk')
    ap.add_argument('--iters', type=int, default=4)
    ap.add_argument('--out')
    args = ap.parse_args()
    manifest = (ROOT / 'src/kit/manifest.js').read_text()
    m = re.search(r"id: '" + re.escape(args.id) + r"', family: '([^']+)'.*?box: \[([^\]]+)\]", manifest)
    family, box = m.group(1), [int(v) for v in m.group(2).split(',')]
    fam = (ROOT / f'src/kit/families/{family}.js').read_text()
    a = re.search(r"'" + re.escape(args.id) + r"': \[([-\d.]+), ([-\d.]+)\], // anchor", fam)
    anchor = (float(a.group(1)), float(a.group(2)))
    pad = 4
    ref = reference_object_mask(box, pad)
    origin = (box[0] - pad, box[1] - pad)
    layout = json.loads(Path(args.layout).read_text())
    trunk = [float(v) for v in args.trunk.split(',')] if args.trunk else None
    best = iou(render_mask(layout, trunk, anchor, origin, ref.shape), ref)
    print(f'start IoU {best:.4f}')
    steps = [0.06, 0.06, 0.04]  # s, y, size
    for it in range(args.iters):
        improved = False
        for i in range(len(layout)):
            for k, idx in enumerate((0, 1, 3)):
                for sign in (1, -1):
                    while True:
                        cand = [list(p) for p in layout]
                        cand[i][idx] += sign * steps[k]
                        if cand[i][3] < 0.2:
                            break
                        score = iou(render_mask(cand, trunk, anchor, origin, ref.shape), ref)
                        if score > best + 1e-4:
                            layout, best, improved = cand, score, True
                        else:
                            break
        print(f'iter {it}: IoU {best:.4f}')
        steps = [v * 0.6 for v in steps]
        if not improved and steps[0] < 0.01:
            break
    print(json.dumps([[round(v, 3) for v in p] for p in layout]))
    if args.out:
        Path(args.out).write_text(json.dumps(layout))
    # A side-by-side mask image to read back.
    fitted = render_mask(layout, trunk, anchor, origin, ref.shape)
    img = np.full(ref.shape + (3,), 235, np.uint8)
    img[ref & fitted] = (120, 190, 120)
    img[ref & ~fitted] = (220, 40, 40)
    img[~ref & fitted] = (40, 80, 220)
    out = ROOT / f'screenshots/kit/progress/silfit-{args.id}.png'
    Image.fromarray(img).resize((img.shape[1] * 8, img.shape[0] * 8), Image.Resampling.NEAREST).save(out)
    print(f'mask: {out}')


if __name__ == '__main__':
    main()
