#!/usr/bin/env python3
"""Depth from the reference painting, calibrated to the solved camera, to check and fit geometry.

Monocular depth (Depth Anything V2 Small, ONNX, run on the CPU with onnxruntime) gives a relative
disparity for every pixel of docs/reference/cave-door.jpg. It is affine-invariant (disparity up to
scale and shift), so it is calibrated against the layout's own render (scripts/fp/raster_layout.py)
on the pixels where the layout already agrees with the reference's segmentation,
fitted with iteratively reweighted least squares (see features(): a cubic in disparity for log depth
plus a smooth image-position term; median error about 8%, so trust only large disagreements). The calibrated depth then back-projects every
pixel through the solved camera to a world point, which answers geometric questions directly:

- per layout cell, the painting's depth against the layout's (a cell drawn nearer or farther than
  the painting shows it);
- per column-top pixel (grass/floor classes), the world height of the top it shows: the painted
  top of each column, so wrong tops are measured, not guessed;
- per ceiling pixel, the height of the slab underside.

The model: https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx
(fixed 518x518 input). Downloaded once to ~/.cache/phluph/ (or pass --model). The painting is run in
three overlapping square tiles for detail, each aligned (scale and shift) to a whole-frame pass and
feathered together.

Usage:
  depth_ref.py [--model path] [--layout src/cave/layout.json] [--min-px 25] [--tol 0.35]
Writes docs/reference/cave-door-disparity.npy (relative), docs/reference/cave-door-depth.npy (view-axis
depth, world units, calibrated), docs/reference/cave-door-depth-check.json (per-cell findings) and
screenshots/fp/depth-check.png (reference | calibrated depth | layout depth | ratio map).
"""
import argparse
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from raster_layout import Rasterizer, load_layout  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MODEL_URL = 'https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx'
MEAN, STD = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225])
S = 518
NAMES = {1: 'grass', 2: 'earth', 3: 'water', 4: 'floor', 5: 'door', 6: 'frame', 7: 'ceiling'}


def model_path(arg):
    if arg:
        return Path(arg)
    p = Path.home() / '.cache/phluph/depth_anything_v2_vits.onnx'
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        print(f'downloading {MODEL_URL}')
        urllib.request.urlretrieve(MODEL_URL, p)
    return p


def infer(session, img):
    x = np.asarray(img.resize((S, S), Image.BICUBIC), np.float32) / 255
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    d = np.squeeze(session.run(None, {session.get_inputs()[0].name: x})[0]).astype(np.float32)
    return np.asarray(Image.fromarray(d).resize(img.size, Image.BICUBIC))


def disparity(session, ref):
    """Whole frame plus overlapping square tiles, each aligned to the whole frame, feathered."""
    W, H = ref.size
    whole = infer(session, ref)
    acc, wsum = np.zeros((H, W)), np.zeros((H, W))
    n = max(2, math.ceil(W / H) + 1)
    for x0 in np.linspace(0, W - H, n).astype(int):
        tile = infer(session, ref.crop((x0, 0, x0 + H, H)))
        g = whole[:, x0:x0 + H]
        A = np.stack([tile.ravel(), np.ones(tile.size)], 1)
        a, b = np.linalg.lstsq(A, g.ravel(), rcond=None)[0]
        ramp = np.minimum(np.arange(H) + 1, H - np.arange(H)).astype(float)
        wt = np.tile(np.minimum(ramp / (H * 0.25), 1)[None, :], (H, 1))
        acc[:, x0:x0 + H] += (a * tile + b) * wt
        wsum[:, x0:x0 + H] += wt
    return (acc / np.maximum(wsum, 1e-6)).astype(np.float32)


def features(d, u, v):
    """Calibration basis: a cubic in disparity for log depth, plus a smooth quadratic in image
    position (the painting is not an exact pinhole and the model compresses depth toward the
    frame's centre; an affine-in-disparity fit leaves a radial bias of ~15%, this one ~8%)."""
    return np.stack([d ** 3, d ** 2, d, np.ones_like(d), u, v, u * u, v * v, u * v], -1)


def calibrate(d, z, mask, iters=8):
    """log z = features . c on mask, Huber-style reweighting. Returns (c, median relative error)."""
    H, W = d.shape
    vv, uu = np.mgrid[0:H, 0:W]
    F = features(d[mask].astype(float), (uu / W - 0.5)[mask], (vv / H - 0.5)[mask])
    t = np.log(z[mask].astype(float))
    w = np.ones(len(t))
    for _ in range(iters):
        c = np.linalg.lstsq(F * w[:, None], t * w, rcond=None)[0]
        r = np.abs(F @ c - t)
        k = 1.5 * np.median(r) + 1e-9
        w = np.where(r <= k, 1.0, k / r)
    rel = np.abs(np.exp(F @ c) / z[mask] - 1)
    return c, float(np.median(rel))


def apply_calibration(c, d):
    H, W = d.shape
    vv, uu = np.mgrid[0:H, 0:W]
    return np.exp(features(d.astype(float), uu / W - 0.5, vv / H - 0.5) @ c).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model')
    ap.add_argument('--layout', default=str(ROOT / 'src/cave/layout.json'))
    ap.add_argument('--min-px', type=int, default=25)
    ap.add_argument('--tol', type=float, default=0.75, help='world units of height error to report')
    args = ap.parse_args()
    import onnxruntime as ort

    ref = Image.open(ROOT / 'docs/reference/cave-door.jpg').convert('RGB')
    W, H = ref.size
    sess = ort.InferenceSession(str(model_path(args.model)), providers=['CPUExecutionProvider'])
    d = disparity(sess, ref)
    np.save(ROOT / 'docs/reference/cave-door-disparity.npy', d)

    layout_obj = json.load(open(args.layout))
    cam = json.load(open(ROOT / 'docs/reference/cave-door-camera.json'))
    rast = Rasterizer(cam, W, H)
    out = rast.render(load_layout(layout_obj), want_ids=True)
    zl, cl, cell = out['depth'], out['classes'], out['cell']
    ref_cls = np.asarray(Image.open(ROOT / 'docs/reference/cave-door-classes.png'))
    agree = (cl == ref_cls) & np.isin(cl, [1, 2, 3, 4, 6, 7]) & np.isfinite(zl)
    coef, med = calibrate(d, zl, agree)
    zr = apply_calibration(coef, d)
    np.save(ROOT / 'docs/reference/cave-door-depth.npy', zr)
    print(f'calibrated on {int(agree.sum())} px; median relative depth error {med:.3f}')

    # Back-project: world point of every pixel at the painting's depth.
    f = (H / 2) / math.tan(math.radians(cam['fov']) / 2)
    uu, vv = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    camp = np.stack([(uu - W / 2) / f * zr, -(vv - H / 2) / f * zr, -zr], -1)
    y_, p_, r_ = (math.radians(cam[k]) for k in ('yaw', 'pitch', 'roll'))
    Ry = np.array([[math.cos(y_), 0, math.sin(y_)], [0, 1, 0], [-math.sin(y_), 0, math.cos(y_)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(p_), -math.sin(p_)], [0, math.sin(p_), math.cos(p_)]])
    Rz = np.array([[math.cos(r_), -math.sin(r_), 0], [math.sin(r_), math.cos(r_), 0], [0, 0, 1]])
    P = camp @ (Ry @ Rx @ Rz).T + np.array(cam['eye'])

    # Per cell findings: where the layout shows a cell, the painting's depth over the layout's, and
    # for top classes the painted top height (world y of the pixels the reference calls a top).
    cells = {}
    keyed = cell[..., 0].astype(np.int32) * 100000 + cell[..., 1].astype(np.int32)
    valid = (cell[..., 0] != -32768) & np.isfinite(zr) & np.isfinite(zl) & (ref_cls != 9) & (ref_cls != 10)
    for k in np.unique(keyed[valid]):
        m = valid & (keyed == k)
        if m.sum() < args.min_px:
            continue
        x, z = int(cell[m][0, 0]), int(cell[m][0, 1])
        entry = {'px': int(m.sum()), 'ratio': round(float(np.median(zr[m] / zl[m])), 3)}
        tops = m & np.isin(ref_cls, [1, 3, 4]) & np.isin(cl, [1, 3, 4])
        if tops.sum() >= args.min_px // 2:
            entry['paintedTop'] = round(float(np.median(P[..., 1][tops])), 2)
            c = layout_obj['cells'].get(f'{x},{z}')
            if c:
                entry['top'] = c['top']
        ceil = m & (ref_cls == 7) & (cl == 7)
        if ceil.sum() >= args.min_px // 2:
            entry['paintedCeiling'] = round(float(np.median(P[..., 1][ceil])), 2)
            entry['ceiling'] = layout_obj['ceiling'].get(f'{x},{z}')
        cells[f'{x},{z}'] = entry
    flagged = {k: v for k, v in cells.items()
               if ('paintedTop' in v and 'top' in v and abs(v['paintedTop'] - v['top']) > args.tol)
               or ('paintedCeiling' in v and v.get('ceiling') is not None and abs(v['paintedCeiling'] - v['ceiling']) > args.tol)}
    (ROOT / 'docs/reference/cave-door-depth-check.json').write_text(json.dumps({
        '_': 'scripts/fp/depth_ref.py: per layout cell, the painting\'s calibrated depth over the layout\'s (ratio), '
             'the painted top / ceiling height where the reference shows one, and the cells off by more than tol.',
        'calibration': {'coef': [round(float(x), 5) for x in coef], 'medianRelativeError': med}, 'tol': args.tol,
        'flagged': flagged, 'cells': cells}, indent=1))
    print(f'{len(cells)} cells measured, {len(flagged)} off by more than {args.tol}:')
    for k, v in sorted(flagged.items(), key=lambda kv: -kv[1]['px']):
        print(f'  {k:>8s} px {v["px"]:5d} ratio {v["ratio"]:.2f}'
              + (f' top {v["top"]} painted {v["paintedTop"]}' if 'paintedTop' in v and 'top' in v else '')
              + (f' ceiling {v["ceiling"]} painted {v["paintedCeiling"]}' if 'paintedCeiling' in v else ''))

    # Board.
    def vis(z):
        q = np.where(np.isfinite(z), 1 / np.maximum(z, 1e-3), 0)
        lo, hi = np.percentile(q[q > 0], [1, 99])
        return (np.clip((q - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    ratio = np.where(valid, np.log(np.clip(zr / np.where(np.isfinite(zl), zl, 1), 0.25, 4)), 0)
    rv = np.zeros((H, W, 3), np.uint8)
    rv[..., 0] = (np.clip(ratio / 0.4, 0, 1) * 255).astype(np.uint8)   # red: painting farther
    rv[..., 2] = (np.clip(-ratio / 0.4, 0, 1) * 255).astype(np.uint8)  # blue: painting nearer
    top = np.concatenate([np.asarray(ref), np.dstack([vis(zr)] * 3)], 1)
    bot = np.concatenate([np.dstack([vis(zl)] * 3), rv], 1)
    (ROOT / 'screenshots/fp').mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.concatenate([top, bot], 0)).save(ROOT / 'screenshots/fp/depth-check.png')
    print('wrote docs/reference/cave-door-{disparity,depth}.npy, cave-door-depth-check.json, screenshots/fp/depth-check.png')


if __name__ == '__main__':
    main()
