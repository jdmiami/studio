#!/usr/bin/env python3
"""Paint images for projection painting the level from the reference (src/cave/projection-paint.js).

For each region: the reference frame docs/reference/cave-door.jpg as RGBA, alpha = the pixels the
segmentation (docs/reference/cave-door-classes.png) gives that class, eroded so pixels mixed with a
neighbour are not sampled. The game projects each vertex of the region's blocks through the
reference camera into it; vertices that land on alpha 0 (another class, a prop in front, off the
frame) keep their own colour or take their block's painted mean.

Usage: paint_regions.py   (writes public/cave/paint-<name>.png for every entry of REGIONS)
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REGIONS = {'frame': 6}  # name -> segmentation class


def main():
    ref = np.asarray(Image.open(ROOT / 'docs/reference/cave-door.jpg').convert('RGB'))
    classes = np.asarray(Image.open(ROOT / 'docs/reference/cave-door-classes.png'))
    out = ROOT / 'public/cave'
    out.mkdir(parents=True, exist_ok=True)
    for name, k in REGIONS.items():
        alpha = cv2.erode((classes == k).astype(np.uint8), np.ones((5, 5), np.uint8)) * 255
        Image.fromarray(np.dstack([ref, alpha]), 'RGBA').save(out / f'paint-{name}.png')
        print(f'{name}: class {k}, {int((alpha > 0).sum())} px -> public/cave/paint-{name}.png')


if __name__ == '__main__':
    main()
