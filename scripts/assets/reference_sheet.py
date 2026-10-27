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


def main():
    import onnxruntime as ort
    sess = ort.InferenceSession(str(model_path(None)), providers=['CPUExecutionProvider'])
    ref = np.asarray(Image.open(ROOT / 'docs/reference/cave-door.jpg').convert('RGB'))
    classes = np.asarray(Image.open(ROOT / 'docs/reference/cave-door-classes.png'))
    props = json.load(open(ROOT / 'docs/reference/cave-door-props.json'))['props']
    placed = json.load(open(ROOT / 'src/cave/props-placement.json'))['props']
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    OUT.mkdir(parents=True, exist_ok=True)
    index, tiles = [], []
    count = {}
    for p in props:
        k = count.get(p['name'], 0)
        count[p['name']] = k + 1
        aid = f"{p['name']}-{k}"
        q = next((q for q in placed if q['name'] == p['name'] and q['base'] == p['base']), None)
        crop, fg, (X0, Y0) = grabcut(ref, classes, p['box'], crop_disparity(sess, ref, p['box']))
        if fg.sum() < 20:
            fg = (classes[Y0:Y0 + crop.shape[0], X0:X0 + crop.shape[1]] == 9).astype(np.uint8)
        Image.fromarray(np.dstack([crop, fg * 255]).astype(np.uint8), 'RGBA').save(OUT / f'{aid}.png')
        entry = {'id': aid, 'name': p['name'], 'box': p['box'], 'base': p['base'], 'crop': [int(X0), int(Y0)],
                 'file': f'{aid}.png'}
        rows, cols = np.nonzero(fg.any(1))[0], np.nonzero(fg.any(0))[0]
        if q is not None and len(rows):
            P = np.array([q['x'], q['y'], q['z']])
            ppu = float(cam.project(P)[1] - cam.project(P + np.array([0, 1.0, 0]))[1])
            ray = P - np.array(cam.eye)
            right = np.array([-ray[2], 0.0, ray[0]]) / np.hypot(ray[0], ray[2])
            C = P + np.array([0, (rows[-1] - rows[0]) / ppu / 2, 0])
            ppu_w = float(np.linalg.norm(cam.project(C + right * 0.5) - cam.project(C - right * 0.5)))
            entry.update({'position': [q['x'], q['y'], q['z']], 'ppu': round(ppu, 2), 'ppuW': round(ppu_w, 2),
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
