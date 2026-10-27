#!/usr/bin/env python3
"""Trace the reference's remaining props (no kit model matches them) into procedural assets.

For each prop instance in docs/reference/cave-door-props.json of a traced family, inside its box:
1. the silhouette: GrabCut seeded by the segmentation (prop class 9 = probable foreground) and by
   monocular depth (Depth Anything V2 on a square crop around the box, scripts/fp/depth_ref.py):
   the prop stands nearer than the terrace behind it, which separates a green dome from green felt
   where colour cannot;
2. its outline traced row by row: the half-width of each row of the mask;
3. a fit of the family's generator to that outline, in world units at the prop's placed distance
   (src/cave/props-placement.json gives the position; px per unit there come from the reference
   camera):
   - 'tiers' (the stepped domes the painting scatters on the terraces): the rows group into tiers
     where the outline steps in (a width jump of more than STEP of the tier below), each tier a
     rounded slab with the width, height and the painted colour (median of its masked pixels) of
     its rows; plus the silhouette itself as a lathe profile (half-width per row) and the tier lines'
     heights as grooves, so the game turns the painted outline (a beehive, not stacked slabs);
   - 'lathe' (the broom tree's head, band and handle): a radius profile from the row widths, with
     the painted colour per band of rows.
Writes src/cave/traced-props.json (read by src/cave/traced-props.js), public/cave/props/prop-<i>.png (each
prop's painted pixels, alpha = its silhouette, for projection painting) and screenshots/fp/props-trace.png
(each prop: reference crop | mask | fitted outline over the crop).
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from depth_ref import infer, model_path  # noqa: E402
from trace_blocks import Camera  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FAMILY = {'stone': 'tiers', 'bush': 'tiers', 'broom-tree': 'lathe'}
STEP = 0.12  # a row narrower than the tier's width by more than this fraction starts a new tier
MIN_TIER_PX = 4


def crop_disparity(session, ref, box):
    """Relative disparity (higher = nearer) of a square crop around the box at the model's full
    518 px input: a prop of 30 px gets the model's whole attention, so its edge against the terrace
    behind it is sharp. Returns the disparity resampled to the image's pixels, over the whole image
    (NaN outside the square)."""
    x0, y0, x1, y1 = box
    side = int(max(x1 - x0, y1 - y0) * 2.2) + 8
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    H, W = ref.shape[:2]
    X0, Y0 = int(np.clip(cx - side // 2, 0, max(0, W - side))), int(np.clip(cy - side // 2, 0, max(0, H - side)))
    sq = Image.fromarray(ref[Y0:Y0 + side, X0:X0 + side])
    d = infer(session, sq)
    out = np.full((H, W), np.nan, np.float32)
    out[Y0:Y0 + d.shape[0], X0:X0 + d.shape[1]] = d
    return out


def grabcut(ref, classes, box, disp=None):
    """The prop's silhouette. GrabCut on the painting, seeded by the segmentation (prop class 9)
    and, when a disparity crop is given, by depth: the prop stands in front of the terrace or wall
    behind it, so pixels nearer than halfway between the box core's disparity and the surrounding
    ring's are probable foreground and the rest probable background (colour alone leaks where a
    green dome sits on green felt)."""
    x0, y0, x1, y1 = box
    pad = 6
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(ref.shape[1], x1 + pad), min(ref.shape[0], y1 + pad)
    crop = ref[Y0:Y1, X0:X1].copy()
    cls = classes[Y0:Y1, X0:X1]
    mask = np.full(cls.shape, cv2.GC_PR_BGD, np.uint8)
    mask[cls == 9] = cv2.GC_PR_FGD
    if disp is not None:
        d = disp[Y0:Y1, X0:X1]
        h, w = d.shape
        yy, xx = np.mgrid[0:h, 0:w]
        bx0, by0, bx1, by1 = x0 - X0, y0 - Y0, x1 - X0, y1 - Y0
        ecx, ecy, erx, ery = (bx0 + bx1) / 2, (by0 + by1) / 2, (bx1 - bx0) * 0.22, (by1 - by0) * 0.22
        core = ((xx - ecx) / max(erx, 1)) ** 2 + ((yy - ecy) / max(ery, 1)) ** 2 <= 1
        ring = (xx < bx0) | (xx >= bx1) | (yy < by0)  # not below: the ground in front is nearer
        if core.any() and ring.any() and np.isfinite(d[core]).all():
            dc, db = np.nanmedian(d[core]), np.nanmedian(d[ring])
            if dc > db:
                near = d > (dc + db) / 2
                mask[:] = np.where(near, cv2.GC_PR_FGD, cv2.GC_PR_BGD)
                mask[core & near] = cv2.GC_FGD
                mask[yy >= by1] = cv2.GC_BGD  # below the base is ground
    mask[:2], mask[-2:], mask[:, :2], mask[:, -2:] = cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        pass
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # Keep the largest component (the prop, not a neighbour), holes filled.
    n, lab = cv2.connectedComponents(fg)
    if n > 2:
        sizes = [(lab == i).sum() for i in range(1, n)]
        fg = (lab == 1 + int(np.argmax(sizes))).astype(np.uint8)
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if cnts:
        fg = cv2.drawContours(np.zeros_like(fg), cnts, -1, 1, -1)
    return crop, fg, (X0, Y0)


def rows_profile(fg):
    """Per row: (left, right) of the mask, or None."""
    out = []
    for r in fg:
        xs = np.nonzero(r)[0]
        out.append((xs[0], xs[-1] + 1) if len(xs) else None)
    return out


def fit_tiers(crop, fg, ppu, ppu_w=None):
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
        out.append({'w': round(float(np.median(widths[t0:t1])) / (ppu_w or ppu), 3), 'h': round((t1 - t0) / ppu, 3),
                    'color': '#%02x%02x%02x' % tuple(int(v) for v in np.median(px, axis=0)), 'rows': [int(t0), int(t1 - 1)]})
    return out[::-1]  # bottom tier first


def fit_profile(fg, ppu, points=28, ppu_w=None):
    """The silhouette as a lathe profile: per row from the bottom up, (y, r) in world units, r the
    row's half-width (a round prop seen from the side shows its diameter), median-smoothed over 3
    rows and resampled to at most `points` rows."""
    prof = rows_profile(fg)
    rows = [i for i, p in enumerate(prof) if p]
    if len(rows) < 4:
        return []
    top, bottom = rows[0], rows[-1]
    half = np.array([(prof[i][1] - prof[i][0]) / 2 if prof[i] else 0 for i in range(top, bottom + 1)], float)
    half = np.array([np.median(half[max(0, i - 1):i + 2]) for i in range(len(half))])
    ys = (bottom + 1 - np.arange(top, bottom + 1) - 0.5) / ppu  # row centres, world units above the base
    pick = np.unique(np.linspace(0, len(half) - 1, min(points, len(half))).round().astype(int))
    return [[round(float(ys[i]), 3), round(float(half[i] / (ppu_w or ppu)), 3)] for i in pick[::-1]]  # bottom first


def fit_lathe(crop, fg, ppu, ppu_w=None, bands=8):
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
        out.append({'r': round(float(np.median(ws)) / 2 / (ppu_w or ppu), 3), 'y0': round((bottom + 1 - b) / ppu, 3),
                    'y1': round((bottom + 1 - a) / ppu, 3),
                    'color': '#%02x%02x%02x' % tuple(int(v) for v in np.median(px, axis=0))})
    return out[::-1]  # bottom band first


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', help='Depth Anything V2 ONNX (default: ~/.cache/phluph/, downloaded once)')
    ap.add_argument('--no-depth', action='store_true', help='colour and segmentation seeds only')
    args = ap.parse_args()
    ref = np.asarray(Image.open(ROOT / 'docs/reference/cave-door.jpg').convert('RGB'))
    classes = np.asarray(Image.open(ROOT / 'docs/reference/cave-door-classes.png'))
    props = json.load(open(ROOT / 'docs/reference/cave-door-props.json'))['props']
    placed = json.load(open(ROOT / 'src/cave/props-placement.json'))['props']
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    sess = None
    if not args.no_depth:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(model_path(args.model)), providers=['CPUExecutionProvider'])
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
        # Widths are measured across the viewing ray: off the optical axis, perspective stretches a
        # round prop sideways by 1/cos(angle) (the broom, near the frame's right edge, by 27%), so
        # widths use the horizontal px per unit at the prop's centre, heights the vertical.
        eye = np.array(cam.eye)
        ray = P - eye
        right = np.array([-ray[2], 0.0, ray[0]]) / np.hypot(ray[0], ray[2])
        mid = P + np.array([0, max(0.3, p['heightPx'] / ppu / 2), 0])
        ppu_w = float(np.linalg.norm(cam.project(mid + right * 0.5) - cam.project(mid - right * 0.5)))
        disp = crop_disparity(sess, ref, p['box']) if sess else None
        crop, fg, (X0, Y0) = grabcut(ref, classes, p['box'], disp)
        if fg.sum() < 30:  # GrabCut lost it: fall back to the segmentation's prop pixels
            x0, y0 = X0, Y0
            fg = (classes[y0:y0 + crop.shape[0], x0:x0 + crop.shape[1]] == 9).astype(np.uint8)
        # A silhouette running into two or more sides of its crop is not a free-standing prop (the
        # box caught a neighbour: the dog's fur, a terrace edge): skip it rather than build it.
        e = 4
        touches = sum([fg[:e].any(), fg[-e:].any(), fg[:, :e].any(), fg[:, -e:].any()])
        if fam == 'tiers' and touches >= 2:
            print(f"  {p['name']:10s} {p['box']}: silhouette runs into {touches} crop sides; skipped")
            continue
        parts = fit_tiers(crop, fg, ppu, ppu_w) if fam == 'tiers' else fit_lathe(crop, fg, ppu, ppu_w)
        if not parts:
            print(f"  {p['name']:10s} {p['box']}: no fit (mask {int(fg.sum())} px); skipped")
            continue
        # How far the traced shape's bottom sits above the prop's base (the broom's head rides on its
        # handle; a dome sits on its base, lift ~0).
        mask_rows = np.nonzero(fg.any(1))[0]
        lift = max(0.0, (p['base'][1] - (Y0 + int(mask_rows[-1]) + 1)) / ppu)
        # The traced silhouette's centre at its middle row against where the prop's vertical axis
        # projects at that height (a vertical axis leans in the frame, so the base pixel is not the
        # centre higher up): shift the prop across the viewing ray by the difference.
        rows_fg = np.nonzero(fg.any(1))[0]
        mid_row = int(rows_fg[len(rows_fg) // 2])
        xs = np.nonzero(fg[mid_row])[0]
        mask_u = X0 + (xs[0] + xs[-1] + 1) / 2
        mid_h = (p['base'][1] - (Y0 + mid_row)) / ppu
        axis_u = cam.project(P + np.array([0, mid_h, 0]))[0]
        shift_px = mask_u - axis_u
        sx, sz = right[0] * shift_px / ppu_w, right[2] * shift_px / ppu_w
        entry = {'name': p['name'], 'family': fam, 'x': round(place['x'] + sx, 3), 'y': place['y'],
                 'z': round(place['z'] + sz, 3), 'lift': round(lift, 3), 'parts': parts, 'box': p['box']}
        # Projection paint: the painting's own pixels of this prop (alpha = its silhouette, eroded
        # a pixel so edge pixels mixed with the background are not sampled). The game projects each
        # vertex through the reference camera into this crop (src/cave/projection-paint.js).
        paint_dir = ROOT / 'public/cave/props'
        paint_dir.mkdir(parents=True, exist_ok=True)
        alpha = cv2.erode(fg, np.ones((3, 3), np.uint8)) * 255
        name = f'prop-{len(out)}.png'
        Image.fromarray(np.dstack([crop, alpha]).astype(np.uint8), 'RGBA').save(paint_dir / name)
        entry['paint'] = {'src': f'/cave/props/{name}', 'x': int(X0), 'y': int(Y0)}
        if fam == 'lathe':
            # The broom head turned from its outline row by row (dense, so the projected bristle
            # stripes and the ferrule's lip land on their own rows of vertices).
            entry['profile'] = fit_profile(fg, ppu, points=90, ppu_w=ppu_w)
        if fam == 'tiers':
            entry['profile'] = fit_profile(fg, ppu, points=40, ppu_w=ppu_w)
            # Tier boundaries (groove heights) in world units above the base, from the traced lines.
            bottom = int(np.nonzero(fg.any(1))[0][-1]) + 1
            entry['grooves'] = [round((bottom - t['rows'][0]) / ppu, 3) for t in parts[:-1]]
        out.append(entry)
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
        print(f"  {p['name']:10s} at ({place['x']:.2f},{place['y']:.2f},{place['z']:.2f}) ppu {ppu:.0f}/{ppu_w:.0f}: "
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
