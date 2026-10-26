#!/usr/bin/env python3
"""Mean luma across an element's outline, reference vs render, by signed distance (sheet px) from
the reference mask boundary (negative inside). Shows whether the dark outline line, the light halo
and their widths match. Usage: edgeprofile.py <render.png> <id> [<id> ...]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pixel_test import REFERENCE, evaluate, load_items, mask_of  # noqa: E402


def sdf(mask):
    """Signed distance (px) to the mask boundary, negative inside (brute force; crops are small)."""
    edge = np.zeros_like(mask)
    edge[:, 1:] |= mask[:, 1:] != mask[:, :-1]
    edge[1:, :] |= mask[1:, :] != mask[:-1, :]
    by, bx = np.nonzero(edge)
    yy, xx = np.mgrid[:mask.shape[0], :mask.shape[1]]
    d = np.full(mask.shape, 1e9)
    for i in range(0, len(by), 256):
        d = np.minimum(d, np.min((yy[..., None] - by[i:i + 256]) ** 2 + (xx[..., None] - bx[i:i + 256]) ** 2, axis=-1))
    d = np.sqrt(d)
    return np.where(mask, -d, d)


def main():
    render, ids = sys.argv[1], sys.argv[2:]
    ref_img = np.asarray(Image.open(REFERENCE).convert('RGB'), dtype=np.float64)
    ren2x = np.asarray(Image.open(render).convert('RGB'), dtype=np.float64)
    items = {it['id']: it for it in load_items()}
    luma = np.array([0.299, 0.587, 0.114])
    for item_id in ids:
        _, ref, ren, _, _ = evaluate(ref_img, ren2x, items[item_id])
        m = mask_of(ref)
        d = sdf(m)
        # Only the upper 70% of the crop: below that the outline meets ground shadows.
        h = m.shape[0]
        rows = np.arange(h)[:, None] < 0.7 * h
        # Outward direction of the outline: up-facing edges (the outward normal points up on screen)
        # versus side-facing ones; the reference draws them differently on some elements.
        gy, gx = np.gradient(d)
        ny = gy / np.maximum(np.hypot(gx, gy), 1e-6)
        print(item_id)
        print('  dist   up: ref   ren  diff  |  side: ref   ren  diff')
        for k in range(-5, 4):
            line = f'  {k:+d}  '
            for sel_dir in (ny < -0.6, np.abs(ny) <= 0.6):
                sel = rows & (np.round(d) == k) & sel_dir
                if sel.sum() < 5:
                    line += '      (few)          |'
                    continue
                a, b = (ref[sel] @ luma).mean(), (ren[sel] @ luma).mean()
                line += f'  {a:6.1f} {b:6.1f} {b - a:+5.1f}  |'
            print(line)


if __name__ == '__main__':
    main()
