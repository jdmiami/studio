#!/usr/bin/env python3
"""Paint crops for the kit models placed in the cave (projection painting, src/cave/projection-paint.js).

The kit's models (cube tree, willow, knit domes, mushrooms, fence, dog, critters) carry the asset
sheet's colours; the cave painting shows them in its own light and palette (the cube tree's canopy
sage, not grey; the dog without a scarf). For every traced prop of a kit family that the game builds
(src/cave/props-placement.json), this cuts its silhouette from the painting with the same GrabCut,
seeded by the segmentation and by monocular depth, as scripts/fp/trace_props.py, and writes the
painted pixels with alpha = silhouette to public/cave/props/kit-<i>.png. src/cave/kit-paint.json
lists them by prop name and base pixel, which is how the game finds the model each one paints.

Usage: paint_props.py [--model depth.onnx] [--no-depth]
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from depth_ref import model_path  # noqa: E402
from trace_blocks import Camera  # noqa: E402
from trace_props import crop_disparity, grabcut  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
# Not the critters: white puffs whose painted shadow sides are brighter than the cel light gives;
# the kit's baked colours match them better than the painting's pixels de-lit.
KIT = {'cube-tree', 'willow', 'willow-2', 'knit-shrub', 'knit-bush', 'mushroom', 'fence', 'dog'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model')
    ap.add_argument('--no-depth', action='store_true')
    args = ap.parse_args()
    ref = np.asarray(Image.open(ROOT / 'docs/reference/cave-door.jpg').convert('RGB'))
    classes = np.asarray(Image.open(ROOT / 'docs/reference/cave-door-classes.png'))
    props = json.load(open(ROOT / 'docs/reference/cave-door-props.json'))['props']
    placed = json.load(open(ROOT / 'src/cave/props-placement.json'))['props']
    sess = None
    if not args.no_depth:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(model_path(args.model)), providers=['CPUExecutionProvider'])
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    out_dir = ROOT / 'public/cave/props'
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for p in props:
        if p['name'] not in KIT:
            continue
        place = next((q for q in placed if q['name'] == p['name'] and q['base'] == p['base'] and q.get('build')), None)
        if place is None:
            continue
        disp = crop_disparity(sess, ref, p['box']) if sess else None
        crop, fg, (X0, Y0) = grabcut(ref, classes, p['box'], disp)
        if fg.sum() < 30:
            print(f"  {p['name']:10s} {p['box']}: no silhouette; skipped")
            continue
        alpha = cv2.erode(fg, np.ones((3, 3), np.uint8)) * 255
        name = f'kit-{len(entries)}.png'
        Image.fromarray(np.dstack([crop, alpha]).astype(np.uint8), 'RGBA').save(out_dir / name)
        # Axis alignment, as for the traced props: the silhouette's centre at its middle row against
        # the projection of the model's vertical axis at that height; the game shifts the model
        # across the viewing ray by the difference before painting it.
        P = np.array([place['x'], place['y'], place['z']])
        ppu = float(cam.project(P)[1] - cam.project(P + np.array([0, 1.0, 0]))[1])
        ray = P - np.array(cam.eye)
        right = np.array([-ray[2], 0.0, ray[0]]) / np.hypot(ray[0], ray[2])
        rows = np.nonzero(fg.any(1))[0]
        mid = int(rows[len(rows) // 2])
        xs = np.nonzero(fg[mid])[0]
        mid_h = (p['base'][1] - (Y0 + mid)) / ppu
        C = P + np.array([0, mid_h, 0])
        ppu_w = float(np.linalg.norm(cam.project(C + right * 0.5) - cam.project(C - right * 0.5)))
        shift_px = X0 + (xs[0] + xs[-1] + 1) / 2 - cam.project(C)[0]
        shift = [round(float(right[0] * shift_px / ppu_w), 3), round(float(right[2] * shift_px / ppu_w), 3)]
        entries.append({'name': p['name'], 'base': p['base'], 'src': f'/cave/props/{name}', 'x': int(X0), 'y': int(Y0),
                        'shift': shift})
        print(f"  {p['name']:10s} base {p['base']}: {int(fg.sum())} px -> {name}, shift {shift_px:+.0f} px")
    (ROOT / 'src/cave/kit-paint.json').write_text(json.dumps({
        '_': 'Painted crops of the kit models placed in the cave, by prop name and base pixel '
             '(scripts/fp/paint_props.py); the game projection-paints each placed model from its crop.',
        'paints': entries}, indent=1))
    print(f'wrote src/cave/kit-paint.json ({len(entries)} crops)')


if __name__ == '__main__':
    main()
