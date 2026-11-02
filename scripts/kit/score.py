#!/usr/bin/env python3
"""Score kit elements against their crops of the reference sheet.

The kit page renders every element where it sits on docs/reference/asset-kit.jpg, so each
element's reference box can be cut from both images. Per element:

  * the render crop is aligned to the reference crop (best silhouette overlap within +-6 px,
    so small placement errors don't hide shape and color);
  * iou        - silhouette overlap after alignment (masks: pixels that differ from the grey
                 background; the soft cast shadows stay below the threshold);
  * fidelity   - img2threejs Divine Eye soft ensemble on the aligned pair (pHash, SSIM, edges,
                 blowout, flat-region and tonal parity, objectness). Its inputs keep only each
                 crop's own element (largest blob, grown 2 px so the outline survives); everything
                 else, including a neighbor's cast shadow, is flattened to the background grey.
                 Its two mask-derived signals (proportion, symmetry) are left out: its foreground
                 mask mis-segments these small JPEG crops, and iou already measures shape;
  * color      - 1 - mean CIE76 dE over a 4 x 4 grid of the crop, scaled so dE 30 -> 0;
  * composite  = 0.4 * fidelity + 0.3 * iou + 0.3 * color.

Usage:
  score.py <render.png> [--family blocks | --ids a,b] [--history docs/kit/history/blocks.json]
           [--note "..."] [--sheet out.png]
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / 'docs/reference/asset-kit.jpg'
MANIFEST = ROOT / 'src/kit/manifest.js'
DIVINE_EYE = ROOT / '.claude/skills/img2threejs/forge/stage4_review/divine_eye.py'
CROPS = ROOT / 'screenshots/kit/crops'
PAD = 5
SEARCH = 6
UPSCALE = 4
BG = np.array([220.0, 220.0, 220.0])


def load_items():
    text = MANIFEST.read_text()
    items = []
    for m in re.finditer(r"id: '([^']+)', family: '([^']+)'.*?box: \[([^\]]+)\]", text):
        items.append({'id': m.group(1), 'family': m.group(2), 'box': [int(v) for v in m.group(3).split(',')]})
    return items


def srgb_to_lab(rgb):
    rgb = rgb / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def mask_of(a):
    d = np.linalg.norm(a - BG, axis=-1)
    sat = a.max(-1) - a.min(-1)
    return (d > 20) | (sat > 14)


def window(img, box, pad):
    x0, y0, x1, y1 = box
    return img[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]


def align(ref_img, ren_img, box):
    """Shift of the render that best overlaps the reference silhouette inside the padded box."""
    ref = window(ref_img, box, PAD)
    ref_m = mask_of(ref)
    best = (-1.0, 0, 0)
    x0, y0, x1, y1 = box
    for dy in range(-SEARCH, SEARCH + 1):
        for dx in range(-SEARCH, SEARCH + 1):
            ren = window(ren_img, (x0 + dx, y0 + dy, x1 + dx, y1 + dy), PAD)
            if ren.shape != ref.shape:
                continue
            ren_m = mask_of(ren)
            union = (ref_m | ren_m).sum()
            iou = (ref_m & ren_m).sum() / union if union else 0.0
            if iou > best[0]:
                best = (iou, dx, dy)
    return best


def color_score(ref, ren, grid=4):
    def cells(a):
        return np.asarray(Image.fromarray(a.astype(np.uint8)).resize((grid, grid), Image.Resampling.BOX), dtype=np.float64)
    de = np.linalg.norm(srgb_to_lab(cells(ref)) - srgb_to_lab(cells(ren)), axis=-1).mean()
    return max(0.0, 1.0 - de / 30.0), float(de)


def divine_eye(ref_path, ren_path):
    out = subprocess.run([sys.executable, str(DIVINE_EYE), '--reference', str(ref_path), '--render', str(ren_path), '--json'],
                         capture_output=True, text=True, check=False)
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return {'fidelity': 0.0, 'signals': {}, 'error': out.stderr[-400:]}


def largest_blob(m):
    """The largest 4-connected component of a boolean mask."""
    from collections import deque
    seen = np.zeros_like(m)
    best = None
    h, w = m.shape
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        comp = []
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if best is None or len(comp) > len(best):
            best = comp
    out = np.zeros_like(m)
    if best:
        ys, xs = zip(*best)
        out[list(ys), list(xs)] = True
    return out


def isolate(a):
    """The crop with everything but its element (largest blob, grown 2 px) flattened to background."""
    m = largest_blob(mask_of(a))
    grown = m.copy()
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            grown |= np.roll(np.roll(m, dy, 0), dx, 1)
    out = a.copy()
    out[~grown] = BG
    return out


# Divine Eye soft-signal names -> the keys its 'weights' map uses.
SOFT_SIGNALS = {
    'phashSimilarity': 'phash', 'ssim': 'ssim', 'edgeOverlap': 'edgeOverlap', 'blowoutParity': 'blowoutParity',
    'flatRegionScore': 'flatRegion', 'tonalParity': 'tonalParity', 'objectness': 'objectness',
}


def soft_fidelity(eye):
    """Divine Eye's weighted soft ensemble without its mask-derived proportion and symmetry."""
    sig, weights = eye.get('signals', {}), eye.get('weights', {})
    pairs = [(sig[k], weights[w]) for k, w in SOFT_SIGNALS.items() if sig.get(k) is not None and w in weights]
    total = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / total if total else 0.0


def save_up(a, path):
    img = Image.fromarray(a.astype(np.uint8))
    img.resize((img.width * UPSCALE, img.height * UPSCALE), Image.Resampling.LANCZOS).save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('render')
    ap.add_argument('--family')
    ap.add_argument('--ids')
    ap.add_argument('--history')
    ap.add_argument('--note', default='')
    ap.add_argument('--sheet')
    args = ap.parse_args()

    ref_full = Image.open(REFERENCE).convert('RGB')
    ren_full = Image.open(args.render).convert('RGB').resize(ref_full.size, Image.Resampling.LANCZOS)
    ref_img = np.asarray(ref_full, dtype=np.float64)
    ren_img = np.asarray(ren_full, dtype=np.float64)
    items = load_items()
    if args.family:
        items = [it for it in items if it['family'] == args.family]
    if args.ids:
        wanted = args.ids.split(',')
        items = [it for it in items if it['id'] in wanted]
    if not items:
        sys.exit('no items matched')
    CROPS.mkdir(parents=True, exist_ok=True)

    results = {}
    rows = []
    for it in items:
        iou, dx, dy = align(ref_img, ren_img, it['box'])
        x0, y0, x1, y1 = it['box']
        ref = window(ref_img, it['box'], PAD)
        ren = window(ren_img, (x0 + dx, y0 + dy, x1 + dx, y1 + dy), PAD)
        ref_path = CROPS / f"{it['id']}-ref.png"
        ren_path = CROPS / f"{it['id']}-render.png"
        save_up(ref, ref_path)
        save_up(ren, ren_path)
        eye_ref, eye_ren = CROPS / f"{it['id']}-ref-iso.png", CROPS / f"{it['id']}-render-iso.png"
        save_up(isolate(ref), eye_ref)
        save_up(isolate(ren), eye_ren)
        eye = divine_eye(eye_ref, eye_ren)
        cs, de = color_score(ref, ren)
        fidelity = soft_fidelity(eye)
        composite = round(0.4 * fidelity + 0.3 * iou + 0.3 * cs, 4)
        sig = eye.get('signals', {})
        results[it['id']] = {
            'composite': composite, 'fidelity': round(fidelity, 4), 'iou': round(float(iou), 4),
            'color': round(cs, 4), 'deltaE': round(de, 2), 'offset': [dx, dy],
            'ssim': sig.get('ssim'), 'edges': sig.get('edgeOverlap'), 'objectness': sig.get('objectness'),
            'phash': sig.get('phashSimilarity'), 'tonal': sig.get('tonalParity'),
        }
        rows.append((it['id'], ref_path, ren_path))
        r = results[it['id']]
        print(f"{it['id']:20s} composite {composite:.4f}  fidelity {r['fidelity']:.3f}  iou {r['iou']:.3f}  "
              f"color {r['color']:.3f} (dE {r['deltaE']:.1f})  offset {dx:+d},{dy:+d}  "
              f"ssim {r['ssim']}  edges {r['edges']}  objectness {r['objectness']}")
    mean = round(float(np.mean([r['composite'] for r in results.values()])), 4)
    print(f"MEAN composite {mean}  ({len(results)} items)")

    if args.history:
        path = Path(args.history)
        hist = json.loads(path.read_text()) if path.exists() else []
        hist.append({'iteration': len(hist), 'time': time.strftime('%Y-%m-%dT%H:%M:%S'), 'note': args.note,
                     'render': args.render, 'mean': mean, 'items': results})
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(hist, indent=1) + '\n')
        print(f"history: {path} (iteration {len(hist) - 1})")

    if args.sheet:
        # Reference | render, one row per element, with the score under each pair.
        tiles = [(Image.open(a), Image.open(b)) for _, a, b in rows]
        cell_w = max(a.width for a, _ in tiles)
        cell_h = max(a.height for a, _ in tiles) + 18
        sheet = Image.new('RGB', (cell_w * 2 + 12, cell_h * len(tiles)), (245, 245, 245))
        draw = ImageDraw.Draw(sheet)
        for i, ((name, _, _), (a, b)) in enumerate(zip(rows, tiles)):
            y = i * cell_h
            sheet.paste(a, (0, y))
            sheet.paste(b, (cell_w + 12, y))
            r = results[name]
            draw.text((4, y + a.height + 2), f"{name}  composite {r['composite']:.3f}  iou {r['iou']:.2f}  "
                      f"fid {r['fidelity']:.2f}  color {r['color']:.2f}  offset {r['offset']}", fill=(40, 40, 40))
        Path(args.sheet).parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.sheet)
        print(f"sheet: {args.sheet}")


if __name__ == '__main__':
    main()
