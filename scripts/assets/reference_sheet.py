#!/usr/bin/env python3
"""The cave painting's assets, cut out one by one: the target each standalone asset is built to.

For every object traced in docs/reference/cave-door-props.json: its silhouette (GrabCut seeded by
the segmentation and by monocular depth, as scripts/fp/trace_props.py) and its painted pixels, saved
to docs/reference/assets/<name>-<i>.png (RGBA, alpha = silhouette) with its measurements in
docs/reference/assets/index.json: box, base pixel, world position (src/cave/props-placement.json),
pixels per unit there (vertical, and horizontal across the viewing ray) and the painted height and
width in world units. Also writes docs/reference/assets/sheet.png, all of them on one board.

Usage: reference_sheet.py
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fp'))
from depth_ref import model_path  # noqa: E402
from trace_blocks import Camera  # noqa: E402
from trace_props import crop_disparity, grabcut  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/reference/assets'
PUBLIC = ROOT / 'public/assets/ref'  # the cut-outs served to the studio (projection paint)
# Traced boxes that are not props (terrace edges, floor and fur, a speck).
DROP = {'bush-4', 'bush-5', 'bush-6', 'sprout-0', 'bush-7'}  # bush-7: hidden behind a fence
# What stands in front of an object in the painting, cut out of its silhouette.
IN_FRONT = {'willow-2-0': ['broom-tree-0'], 'bush-7': ['bench-0'], 'knit-shrub-0': ['pom-0']}
# Objects GrabCut mostly misses (it locks onto what stands in front): start from the whole box and
# keep its green felt (GREEN below) instead.
CLASS_CUT = {'willow-2-0', 'bush-7'}
# Split by colour where a green felt object and a wooden one share a box: the wood keeps its non-green
# pixels, the green one its green pixels.
WOOD = {'wood-fence', 'scaffold'}
GREEN = {'bush-7', 'willow-2-0'}
# Objects the HUD is drawn over.
HUD_OVER = {'willow-2-0'}
# The asset family each traced name belongs to (the crate and the bench are the same small fence).
FAMILY = {'crate': 'wood-fence', 'bench': 'wood-fence'}


def main():
    import onnxruntime as ort
    sess = ort.InferenceSession(str(model_path(None)), providers=['CPUExecutionProvider'])
    ref = np.asarray(Image.open(ROOT / 'docs/reference/cave-door.jpg').convert('RGB'))
    classes = np.asarray(Image.open(ROOT / 'docs/reference/cave-door-classes.png'))
    props = json.load(open(ROOT / 'docs/reference/cave-door-props.json'))['props']
    placed = json.load(open(ROOT / 'src/cave/props-placement.json'))['props']
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    index, tiles = [], []
    count = {}
    cut = {}  # id -> (p, crop, fg, X0, Y0) for every traced object, before the exclusions
    for p in props:
        k = count.get(p['name'], 0)
        count[p['name']] = k + 1
        aid = f"{p['name']}-{k}"
        crop, fg, (X0, Y0) = grabcut(ref, classes, p['box'], crop_disparity(sess, ref, p['box']))
        if fg.sum() < 20:
            fg = (classes[Y0:Y0 + crop.shape[0], X0:X0 + crop.shape[1]] == 9).astype(np.uint8)
        cut[aid] = (p, crop, fg, X0, Y0)
    for aid, (p, crop, fg, X0, Y0) in cut.items():
        if aid in DROP:
            continue
        h, w = fg.shape
        fg = fg.copy()
        if aid in CLASS_CUT:  # every pixel of the box; the green split below keeps the felt
            fg = np.zeros_like(fg)
            bx0, by0, bx1, by1 = p['box']
            fg[max(0, by0 - Y0):by1 - Y0, max(0, bx0 - X0):bx1 - X0] = 1
        # Green felt by Lab a* (muted sage has red and green nearly equal in RGB).
        green = cv2.cvtColor(crop, cv2.COLOR_RGB2LAB)[..., 1].astype(int) - 128 < -4
        if FAMILY.get(p['name'], p['name']) in WOOD:
            fg[green] = 0
        if aid in GREEN:
            fg[~green] = 0
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        if aid in HUD_OVER:  # the HUD panel drawn over it (the mask class elsewhere is a coarse box)
            fg[classes[Y0:Y0 + h, X0:X0 + w] == 10] = 0
        for other in IN_FRONT.get(aid, []):
            _, _, ofg, ox, oy = cut[other]
            full = np.zeros(classes.shape, np.uint8)
            full[oy:oy + ofg.shape[0], ox:ox + ofg.shape[1]] = cv2.dilate(ofg, np.ones((5, 5), np.uint8))
            fg[full[Y0:Y0 + h, X0:X0 + w] > 0] = 0
        n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
        if n > 2:
            fg = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
        q = next((q for q in placed if q['name'] == p['name'] and q['base'] == p['base']), None)
        rgba = np.dstack([crop, fg * 255]).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(OUT / f'{aid}.png')
        Image.fromarray(rgba, 'RGBA').save(PUBLIC / f'{aid}.png')
        entry = {'id': aid, 'name': p['name'], 'family': FAMILY.get(p['name'], p['name']), 'box': p['box'],
                 'base': p['base'], 'crop': [int(X0), int(Y0)], 'file': f'{aid}.png', 'src': f'/assets/ref/{aid}.png'}
        rows, cols = np.nonzero(fg.any(1))[0], np.nonzero(fg.any(0))[0]
        if q is None:  # never placed: stand it where its base pixel's ray meets the painted ground
            q = {'x': None}
        if q.get('x') is not None and len(rows):
            # Stand it where the base pixel's ray meets its ground height: the scene's placement may
            # have snapped it onto our layout's terrace, a few pixels off the painted base.
            P = np.array([q['x'], q['y'], q['z']])
            d = cam.ray(*p['base'])
            if d[1] < -1e-3:
                t = (q['y'] - cam.eye[1]) / d[1]
                if t > 0:
                    P = np.array(cam.eye) + t * d
            ppu = float(cam.project(P)[1] - cam.project(P + np.array([0, 1.0, 0]))[1])
            ray = P - np.array(cam.eye)
            right = np.array([-ray[2], 0.0, ray[0]]) / np.hypot(ray[0], ray[2])
            C = P + np.array([0, (rows[-1] - rows[0]) / ppu / 2, 0])
            ppu_w = float(np.linalg.norm(cam.project(C + right * 0.5) - cam.project(C - right * 0.5)))
            entry.update({'position': [round(float(v), 3) for v in P], 'ppu': round(ppu, 2), 'ppuW': round(ppu_w, 2),
                          'height': round((rows[-1] - rows[0] + 1) / ppu, 3), 'width': round((cols[-1] - cols[0] + 1) / ppu_w, 3)})
        index.append(entry)
        tile = np.where(fg[..., None] > 0, crop, 245).astype(np.uint8)
        s = max(1, min(4, 140 // max(tile.shape)))
        tile = cv2.resize(tile, (tile.shape[1] * s, tile.shape[0] * s), interpolation=cv2.INTER_NEAREST)
        tiles.append((aid, tile))
    (OUT / 'index.json').write_text(json.dumps({
        '_': 'The cave painting\'s assets cut out (scripts/assets/reference_sheet.py): per object its crop '
             '(RGBA, alpha = silhouette), box and base pixel, placed world position, px per unit and painted size.',
        'assets': index}, indent=1))
    # Board.
    cell = 150
    cols_n = 8
    rows_n = (len(tiles) + cols_n - 1) // cols_n
    board = Image.new('RGB', (cols_n * cell, rows_n * (cell + 16)), (255, 255, 255))
    d = ImageDraw.Draw(board)
    for i, (aid, t) in enumerate(tiles):
        x, y = (i % cols_n) * cell, (i // cols_n) * (cell + 16)
        im = Image.fromarray(t)
        im.thumbnail((cell - 6, cell - 6))
        board.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        d.text((x + 4, y + cell), aid, fill=(60, 50, 50))
    board.save(OUT / 'sheet.png')
    print(f'{len(index)} assets -> {OUT.relative_to(ROOT)}/ (index.json, sheet.png)')


if __name__ == '__main__':
    main()
