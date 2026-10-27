#!/usr/bin/env python3
"""Scores each asset against its cut-out from the painting (after scripts/assets/shoot.mjs).

Per asset, in its crop window (docs/reference/assets/index.json):
- iou: silhouette overlap of the studio's mask shot and the painted cut-out's alpha;
- dE: mean CIEDE2000 between the studio's colour shot and the painting where both silhouettes agree;
- status: built / missing (no builder yet, the studio error).
Writes docs/reference/assets/scores.json and docs/reference/assets/board.png (per asset: the painted
cut-out | the asset | silhouettes, painted red, asset cyan, both white).

Usage: score.py [id-prefix ...]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'kit'))
from pixel_test import ciede2000, srgb_to_lab  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'docs/reference/assets'
SHOTS = ROOT / 'screenshots/assets'


def main():
    only = sys.argv[1:]
    index = json.load(open(REF / 'index.json'))['assets']
    status = json.load(open(SHOTS / 'status.json')) if (SHOTS / 'status.json').exists() else {}
    old = json.load(open(REF / 'scores.json'))['assets'] if (REF / 'scores.json').exists() else {}
    scores = dict(old)
    tiles = []
    for r in index:
        if only and not any(r['id'].startswith(p) for p in only):
            continue
        cut = np.asarray(Image.open(REF / r['file']).convert('RGBA'))
        x0, y0 = r['crop']
        h, w = cut.shape[:2]
        painted = cut[..., 3] > 127
        st = status.get(r['id'], {})
        shot, mshot = SHOTS / f"{r['id']}.png", SHOTS / f"{r['id']}-mask.png"
        if st.get('error') or not shot.exists() or not mshot.exists():
            scores[r['id']] = {'status': 'missing', 'why': st.get('error', 'no shot')}
            render = np.full((h, w, 3), 230, np.uint8)
            m = np.zeros((h, w), bool)
        else:
            full = np.asarray(Image.open(shot).convert('RGB').resize((1024, 572)))
            fm = np.asarray(Image.open(mshot).convert('L').resize((1024, 572)))
            render = full[y0:y0 + h, x0:x0 + w]
            m = fm[y0:y0 + h, x0:x0 + w] > 127
            inter, union = (m & painted).sum(), (m | painted).sum()
            both = m & painted
            de = float(ciede2000(srgb_to_lab(cut[..., :3][both]), srgb_to_lab(render[both])).mean()) if both.any() else None
            scores[r['id']] = {'status': 'built', 'kind': st.get('kind'), 'iou': round(float(inter / max(union, 1)), 3),
                               'dE': round(de, 2) if de is not None else None}
        over = np.zeros((h, w, 3), np.uint8)
        over[painted & ~m] = (230, 60, 60)
        over[m & ~painted] = (60, 200, 230)
        over[m & painted] = (245, 245, 245)
        cutvis = np.where(painted[..., None], cut[..., :3], 235).astype(np.uint8)
        rendvis = np.where(m[..., None], render, 235).astype(np.uint8)
        tiles.append((r['id'], scores[r['id']], np.concatenate([cutvis, rendvis, over], 1)))
    (REF / 'scores.json').write_text(json.dumps({'_': 'scripts/assets/score.py: per asset iou (silhouette) and dE '
                                                      '(colour where both silhouettes agree) against the painted cut-out.',
                                                 'assets': scores}, indent=1))
    # Board.
    cw, ch = 330, 128
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    board = Image.new('RGB', (cols * cw, rows * (ch + 16)), (255, 255, 255))
    d = ImageDraw.Draw(board)
    for i, (aid, sc, t) in enumerate(tiles):
        x, y = (i % cols) * cw, (i // cols) * (ch + 16)
        im = Image.fromarray(t)
        im.thumbnail((cw - 8, ch - 4))
        board.paste(im, (x + 4, y + 2))
        label = f"{aid}: " + (f"IoU {sc['iou']:.2f}  dE {sc['dE']}" if sc['status'] == 'built' else 'MISSING')
        d.text((x + 4, y + ch), label, fill=(150, 30, 30) if sc['status'] != 'built' else (40, 40, 40))
    board.save(REF / 'board.png')
    built = [s for s in scores.values() if s['status'] == 'built']
    print(f"{len(built)}/{len(scores)} built; mean IoU {np.mean([s['iou'] for s in built]):.3f}; "
          f"mean dE {np.mean([s['dE'] for s in built if s['dE'] is not None]):.2f}")
    for k, s in sorted(scores.items(), key=lambda kv: (kv[1]['status'] != 'missing', kv[1].get('iou', 0))):
        print(f"  {k:14s} " + (f"IoU {s['iou']:.2f} dE {s['dE']}" if s['status'] == 'built' else f"MISSING ({s['why'][:60]})"))


if __name__ == '__main__':
    main()
