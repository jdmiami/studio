#!/usr/bin/env python3
"""Trace the reference's remaining props (no kit model matches them) into procedural assets.

For each prop instance in docs/reference/cave-door-props.json of a traced family, inside its box:
1. the silhouette: GrabCut seeded by the segmentation (prop class 9 = probable foreground);
2. its outline traced row by row: the half-width of each row of the mask;
3. a fit of the family's generator to that outline, in world units at the prop's placed distance
   (src/cave/props-placement.json gives the position; px per unit there come from the reference
   camera):
   - 'tiers' (the stepped domes the painting scatters on the terraces): the rows group into tiers
     where the outline steps in (a width jump of more than STEP of the tier below), each tier a
     rounded slab with the width, height and the painted colour (median of its masked pixels) of
     its rows;
   - 'lathe' (the broom tree's head, band and handle): a radius profile from the row widths, with
     the painted colour per band of rows.
Writes src/cave/traced-props.json (read by src/cave/traced-props.js) and screenshots/fp/props-trace.png
(each prop: reference crop | mask | fitted outline over the crop).
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trace_blocks import Camera  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FAMILY = {'stone': 'tiers', 'bush': 'tiers', 'broom-tree': 'lathe'}
STEP = 0.12  # a row narrower than the tier's width by more than this fraction starts a new tier
MIN_TIER_PX = 4


def grabcut(ref, classes, box):
    x0, y0, x1, y1 = box
    pad = 6
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(ref.shape[1], x1 + pad), min(ref.shape[0], y1 + pad)
    crop = ref[Y0:Y1, X0:X1].copy()
    cls = classes[Y0:Y1, X0:X1]
    mask = np.full(cls.shape, cv2.GC_PR_BGD, np.uint8)
    mask[cls == 9] = cv2.GC_PR_FGD
    mask[:2], mask[-2:], mask[:, :2], mask[:, -2:] = cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        pass
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    # Keep the component that holds the box's bottom-centre (the prop, not a neighbour).
    n, lab = cv2.connectedComponents(fg)
    if n > 2:
        sizes = [(lab == i).sum() for i in range(1, n)]
        fg = (lab == 1 + int(np.argmax(sizes))).astype(np.uint8)
    return crop, fg, (X0, Y0)


def rows_profile(fg):
    """Per row: (left, right) of the mask, or None."""
    out = []
    for r in fg:
        xs = np.nonzero(r)[0]
        out.append((xs[0], xs[-1] + 1) if len(xs) else None)
    return out


def fit_tiers(crop, fg, ppu):
    """Tiers from the lines traced inside the silhouette: the painted domes are smooth outside,
    their steps drawn as dark horizontal lines across them. A black-hat (closing minus image) on
    luma, averaged over the middle 60% of each row of the mask, peaks on those lines; peaks at least
    MIN_TIER_PX apart split the rows into tiers, bottom up. Each tier: the median width of its rows
    (the silhouette's), its height, its painted colour."""
    rows = [i for i in range(fg.shape[0]) if fg[i].any()]
    if len(rows) < MIN_TIER_PX:
        return []
    top, bottom = rows[0], rows[-1]
    luma = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    hat = cv2.morphologyEx(luma, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 7))).astype(float)
    score = np.zeros(fg.shape[0])
    widths = np.zeros(fg.shape[0])
    for i in rows:
        xs = np.nonzero(fg[i])[0]
        x0, x1 = xs[0], xs[-1] + 1
        widths[i] = x1 - x0
        m0, m1 = x0 + (x1 - x0) // 5, x1 - (x1 - x0) // 5
        if m1 > m0:
            score[i] = hat[i, m0:m1].mean()
    cuts = []
    thr = max(6.0, np.percentile(score[top:bottom + 1], 75))
    for i in range(top + MIN_TIER_PX, bottom - MIN_TIER_PX + 1):
        if score[i] >= thr and score[i] == score[max(top, i - 2):i + 3].max() and (not cuts or i - cuts[-1] >= MIN_TIER_PX):
            cuts.append(i)
    bounds = [top] + cuts + [bottom + 1]
    out = []
    for t0, t1 in zip(bounds[:-1], bounds[1:]):
        sel = fg[t0:t1].astype(bool)
        px = crop[t0:t1][sel]
        if len(px) < 6:
            continue
        out.append({'w': round(float(np.median(widths[t0:t1])) / ppu, 3), 'h': round((t1 - t0) / ppu, 3),
                    'color': '#%02x%02x%02x' % tuple(int(v) for v in np.median(px, axis=0)), 'rows': [int(t0), int(t1 - 1)]})
    return out[::-1]  # bottom tier first


def fit_lathe(crop, fg, ppu, bands=8):
    prof = rows_profile(fg)
    rows = [i for i, p in enumerate(prof) if p]
    if not rows:
        return []
    top, bottom = rows[0], rows[-1]
    out = []
    edges = np.linspace(top, bottom + 1, bands + 1).astype(int)
    for a, b in zip(edges[:-1], edges[1:]):
        ws = [prof[i][1] - prof[i][0] for i in range(a, b) if prof[i]]
        sel = fg[a:b].astype(bool)
        px = crop[a:b][sel]
        if not ws or len(px) < 5:
            continue
        out.append({'r': round(float(np.median(ws)) / 2 / ppu, 3), 'y0': round((bottom + 1 - b) / ppu, 3),
                    'y1': round((bottom + 1 - a) / ppu, 3),
                    'color': '#%02x%02x%02x' % tuple(int(v) for v in np.median(px, axis=0))})
    return out[::-1]  # bottom band first


def main():
    ref = np.asarray(Image.open(ROOT / 'docs/reference/cave-door.jpg').convert('RGB'))
    classes = np.asarray(Image.open(ROOT / 'docs/reference/cave-door-classes.png'))
    props = json.load(open(ROOT / 'docs/reference/cave-door-props.json'))['props']
    placed = json.load(open(ROOT / 'src/cave/props-placement.json'))['props']
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    out, tiles = [], []
    for p in props:
        fam = FAMILY.get(p['name'])
        if not fam:
            continue
        place = next((q for q in placed if q['name'] == p['name'] and q['base'] == p['base']), None)
        if place is None:
            continue
        P = np.array([place['x'], place['y'], place['z']])
        a, b = cam.project(P), cam.project(P + np.array([0, 1.0, 0]))
        ppu = float(a[1] - b[1])
        crop, fg, (X0, Y0) = grabcut(ref, classes, p['box'])
        if fg.sum() < 30:  # GrabCut lost it: fall back to the segmentation's prop pixels
            x0, y0 = X0, Y0
            fg = (classes[y0:y0 + crop.shape[0], x0:x0 + crop.shape[1]] == 9).astype(np.uint8)
        parts = fit_tiers(crop, fg, ppu) if fam == 'tiers' else fit_lathe(crop, fg, ppu)
        if not parts:
            print(f"  {p['name']:10s} {p['box']}: no fit (mask {int(fg.sum())} px); skipped")
            continue
        # How far the traced shape's bottom sits above the prop's base (the broom's head rides on its
        # handle; a dome sits on its base, lift ~0).
        mask_rows = np.nonzero(fg.any(1))[0]
        lift = max(0.0, (p['base'][1] - (Y0 + int(mask_rows[-1]) + 1)) / ppu)
        out.append({'name': p['name'], 'family': fam, 'x': place['x'], 'y': place['y'], 'z': place['z'],
                    'lift': round(lift, 3), 'parts': parts, 'box': p['box']})
        # board tile
        over = crop.copy()
        edge = cv2.morphologyEx(fg, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(bool)
        over[edge] = (255, 40, 40)
        for t in parts:
            if 'rows' in t:
                over[t['rows'][0], :] = (40, 200, 255)
        tile = np.concatenate([crop, np.dstack([fg * 255] * 3), over], axis=1)
        z = max(2, min(6, 150 // max(tile.shape[0], 1)))
        tiles.append(cv2.resize(tile, (tile.shape[1] * z, tile.shape[0] * z), interpolation=cv2.INTER_NEAREST))
        print(f"  {p['name']:10s} at ({place['x']:.2f},{place['y']:.2f},{place['z']:.2f}) ppu {ppu:.0f}: "
              + ', '.join(f"{t.get('w', t.get('r'))}x{t.get('h', t.get('y1'))} {t['color']}" for t in parts))
    (ROOT / 'src/cave/traced-props.json').write_text(json.dumps({
        '_': 'Props traced from docs/reference/cave-door.jpg by scripts/fp/trace_props.py: per instance, the '
             'generator family and its parts fitted to the painted outline (tiers: w, h, colour from the bottom '
             'up; lathe: radius bands r, y0..y1, colour), in world units at the placed position.',
        'props': out}, indent=1))
    H = max(t.shape[0] for t in tiles)
    rowsimg, row, w = [], [], 0
    for t in tiles:
        if w + t.shape[1] > 2400 and row:
            rowsimg.append(row); row, w = [], 0
        row.append(np.pad(t, ((0, H - t.shape[0]), (0, 6), (0, 0)), constant_values=255)); w += t.shape[1] + 6
    rowsimg.append(row)
    W = max(sum(x.shape[1] for x in r) for r in rowsimg)
    board = np.concatenate([np.pad(np.concatenate(r, 1), ((0, 6), (0, W - sum(x.shape[1] for x in r)), (0, 0)), constant_values=255) for r in rowsimg], 0)
    (ROOT / 'screenshots/fp').mkdir(parents=True, exist_ok=True)
    Image.fromarray(board).save(ROOT / 'screenshots/fp/props-trace.png')
    print(f'wrote src/cave/traced-props.json ({len(out)} props) and screenshots/fp/props-trace.png')


if __name__ == '__main__':
    main()
