#!/usr/bin/env python3
"""Trace the reference's great door into game assets.

The door's plane is known (z = -15.5, x -2.5..2.5, y 0..6) and the reference camera is solved, so
the painted door is rectified to a front view (a homography from its four traced corners), then:

- the colour map is the rectified painting itself (projection-first: a patterned surface takes the
  reference's own pixels, img2threejs grimoire/character/likeness_maximization.md);
- the panel seams are traced as lines: a black-hat (closing minus image) on luma picks out the thin
  dark seams between panels, thresholded and cleaned; the relief map is 1 on panels and falls to
  0 in the seams over a soft bevel (a distance transform), so the game can raise each panel.

Writes public/cave/door-albedo.png, public/cave/door-relief.png (both 250 x 300: 50 px per unit)
and screenshots/fp/door-trace.png (rectified door | traced seams | relief | overlay).
Usage: trace_door.py [--corners "u,v u,v u,v u,v"]  (top-left, top-right, bottom-right, bottom-left)
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / 'docs/reference/cave-door.jpg'
# The door opening's corners as painted (traced in the camera solve; the painting's door is a few px
# off the solved model on the right, so the traced corners rectify it squarer than the model's).
CORNERS = [(617, 152), (750, 145), (750, 327), (617, 318)]
PPU = 50  # px per world unit in the outputs
W, H = 5 * PPU, 6 * PPU
SS = 4  # rectify at 4x, then downsample, so the seams stay crisp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corners')
    args = ap.parse_args()
    corners = CORNERS if not args.corners else [tuple(map(float, c.split(','))) for c in args.corners.split()]
    ref = np.asarray(Image.open(REFERENCE).convert('RGB'))
    big = (W * SS, H * SS)
    M = cv2.getPerspectiveTransform(np.float32(corners), np.float32([(0, 0), (big[0], 0), big, (0, big[1])]))
    rect = cv2.warpPerspective(ref, M, big, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # The two leaves meet at the centre seam (the darkest column near the middle); the painting
    # draws them unequal (its perspective is a little off), so each leaf is resampled to half the
    # opening.
    luma0 = cv2.cvtColor(rect, cv2.COLOR_RGB2GRAY).astype(np.float32)
    lo, hi = int(big[0] * 0.4), int(big[0] * 0.6)
    split = lo + int(np.argmin(luma0[big[1] // 6: -big[1] // 6, lo:hi].mean(0)))
    half = big[0] // 2
    rect = np.concatenate([cv2.resize(rect[:, :split], (half, big[1]), interpolation=cv2.INTER_AREA),
                           cv2.resize(rect[:, split:], (big[0] - half, big[1]), interpolation=cv2.INTER_AREA)], axis=1)

    # Seams: thin dark lines. Black-hat with a kernel wider than a seam but narrower than a panel.
    luma = cv2.cvtColor(rect, cv2.COLOR_RGB2GRAY)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9 * SS // 2 * 2 + 1, 9 * SS // 2 * 2 + 1))
    hat = cv2.morphologyEx(luma, cv2.MORPH_BLACKHAT, k)
    thr = max(12, np.percentile(hat, 80))
    seams = (hat > thr).astype(np.uint8)
    seams = cv2.morphologyEx(seams, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(seams)
    keep = np.zeros_like(seams)
    for i in range(1, n):  # lines, not specks: long thin components only
        if max(st[i, 2], st[i, 3]) >= 6 * SS:
            keep[lab == i] = 1
    # (The leaves look mirrored but are not: the painter's key shapes sit several px apart, so a
    # mirrored union of their seams doubles every line. Each leaf keeps its own trace.)
    # The outer border of each leaf and the centre seam are seams too (the leaves meet there).
    b = 2 * SS
    keep[:b], keep[-b:], keep[:, :b], keep[:, -b:] = 1, 1, 1, 1
    keep[:, big[0] // 2 - b // 2: big[0] // 2 + b // 2 + 1] = 1

    # Relief: distance from the nearest seam, ramped over a bevel, so panels are pillowy felt.
    dist = cv2.distanceTransform((1 - keep).astype(np.uint8), cv2.DIST_L2, 5)
    bevel = 3.0 * SS
    relief = np.clip(dist / bevel, 0, 1)
    relief = relief * relief * (3 - 2 * relief)

    out = ROOT / 'public/cave'
    out.mkdir(parents=True, exist_ok=True)
    albedo = cv2.resize(rect, (W, H), interpolation=cv2.INTER_AREA)
    rel = cv2.resize((relief * 255).astype(np.uint8), (W, H), interpolation=cv2.INTER_AREA)
    Image.fromarray(albedo).save(out / 'door-albedo.png')
    Image.fromarray(rel).save(out / 'door-relief.png')

    shots = ROOT / 'screenshots/fp'
    shots.mkdir(parents=True, exist_ok=True)
    seam_img = cv2.resize(keep * 255, (W, H), interpolation=cv2.INTER_AREA)
    over = albedo.copy()
    over[seam_img > 128] = (255, 40, 40)
    board = np.concatenate([albedo, np.dstack([seam_img] * 3), np.dstack([rel] * 3), over], axis=1)
    Image.fromarray(board).resize((board.shape[1] * 2, board.shape[0] * 2), Image.Resampling.NEAREST).save(shots / 'door-trace.png')
    print(f'centre seam at {split / SS:.0f} px of {W}; seam threshold {thr:.1f}; seam coverage {keep.mean():.3f}; wrote {out}/door-albedo.png, door-relief.png and {shots}/door-trace.png')


if __name__ == '__main__':
    main()
