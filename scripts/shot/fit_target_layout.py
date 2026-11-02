#!/usr/bin/env python3
"""Fits the Nest's block layout to the target shot (docs/reference/target-shot.jpg).

The layout fitter of scripts/fp/fit_layout.py, pointed at the target shot:
- Camera: the target's solved camera, placed exactly as the game's ?frame=target mode places it
  (src/game/shot.js): explorer feet F and heading yaw, the camera 1.09 explorer heights up,
  1.0 behind and 0.12 to the right, pitched 11 degrees down, 92 degrees tall.
  F is solved so the great door's left edge lands where the shot shows it.
- Classes: docs/reference/target-shot/classes.png (scripts/shot/classes.py), at half size.
- Constraints: the old fitter's back wall, door and plaza in front of the door. The explorer's cell
  and its neighbours are floor at the feet's height.

Depth (--depth, on by default): the learned depth of the shot (Depth Anything V2, relative inverse
depth) is calibrated to world units against the surfaces the constraints pin (the door and its frame
at the door's z, the floor round the explorer's feet) where the layout shows them (a least-squares
fit of 1/z = a*d + b), and every candidate is also scored by
the mean |log z_render - log z_shot| over the block pixels (capped at 1), weighted DEPTH_WEIGHT. So
a near wall can no longer stand in for a far one that shows the same class.

Usage: fit_target_layout.py [--quick] [--max-sweeps N] [--no-pairs] [--tag name] [--scratch dir]
                            [--depth path.npy | --no-depth]
Writes src/cave/layout.json (unless --out) and docs/reference/target-shot/fit-camera.json.
"""
import argparse
import json
import math
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/fp'))
import fit_layout as F  # noqa: E402
from trace_blocks import Camera  # noqa: E402

REF = ROOT / 'docs/reference/target-shot'
EXPLORER = 3.8          # explorer height in blocks (src/game/player/controller.js EXPLORER_HEIGHT)
SHOT = {'vfov': 92.0, 'pitch': -11.0, 'eye': 1.09, 'back': 1.0, 'side': 0.12}
YAW = 52.0              # the floor grid's vanishing points: -z lies 52 degrees right of the view
FEET_Y = -0.5           # the explorer stands half a block below the door's plaza
W, H = 562, 990


def camera_for(fx, fz, fy=FEET_Y, yaw=YAW):
    y = math.radians(yaw)
    fwd = (-math.sin(y), -math.cos(y))
    right = (math.cos(y), -math.sin(y))
    h = EXPLORER
    eye = [fx - fwd[0] * SHOT['back'] * h + right[0] * SHOT['side'] * h,
           fy + SHOT['eye'] * h,
           fz - fwd[1] * SHOT['back'] * h + right[1] * SHOT['side'] * h]
    return {'fov': SHOT['vfov'], 'yaw': yaw, 'pitch': SHOT['pitch'], 'roll': 0.0, 'eye': eye}


def solve_feet():
    """Feet (x, z) that put the door's left edge (x -2.5 on the z -15.6 face, y 0 and 6) at the
    shot's pixels (930, 980) and (935, 620), full-size image coordinates."""
    targets = [((-2.5, 0.0, -15.6), (930, 980)), ((-2.5, 6.0, -15.6), (935, 620))]
    best = None
    for fx in np.arange(-4, 12, 0.1):
        for fz in np.arange(-10, 6, 0.1):
            cam = Camera(camera_for(fx, fz), 1125, 1979)
            err = 0.0
            for P, uv in targets:
                p = cam.project(P)
                if p is None:
                    err = 1e9
                    break
                err += float(np.hypot(*(p - uv)))
            if best is None or err < best[0]:
                best = (err, fx, fz)
    return best


def learned_depth(path):
    """The shot's learned depth (relative inverse depth, bigger = nearer) at the fit size."""
    if path is None:
        import subprocess
        out = Path(tempfile.mkdtemp()) / 'dav2'
        subprocess.run([sys.executable, str(ROOT / 'scripts/shot/learned_depth.py'), str(ROOT / '.cache/models/depth_anything_v2_vits.onnx'),
                        str(ROOT / 'docs/reference/target-shot.jpg'), str(out)], check=True)
        path = str(out) + '.npy'
    d = np.load(path).astype(np.float32)
    return cv2.resize(d, (W, H), interpolation=cv2.INTER_AREA)


def install_depth_term(a, cam, tmp):
    """Adds the depth term to the fitter's objective (State, Fitter.refresh and Fitter.evaluate)."""
    from raster_layout import Rasterizer, load_layout
    disp = learned_depth(a.depth)
    ref_cls = cv2.imread(str(tmp / 'classes.png'), 0)
    valid = np.isin(ref_cls, F.VALID_CLASSES)
    # Calibrate against the layout we start from, on its pinned surfaces only.
    start = json.load(open(a.init or (ROOT / 'src/cave/layout.json')))
    r = Rasterizer(cam, W, H).render(load_layout(start))
    # Anchors only where the layout is pinned by constraints, not by the fit itself: the door and its
    # frame (the back wall at the door's z) and the floor round the explorer's feet (the lower part
    # of the frame), so the calibration does not inherit the starting layout's mistakes.
    rows = np.arange(H)[:, None].repeat(W, 1)
    anchor = np.isin(ref_cls, (5, 6)) | ((ref_cls == 4) & (rows >= int(H * 0.72)))
    ok = anchor & (r['classes'] == ref_cls) & np.isfinite(r['depth']) & (r['depth'] > 0.3)
    A = np.stack([disp[ok], np.ones(ok.sum())], 1)
    coef, *_ = np.linalg.lstsq(A, 1.0 / r['depth'][ok], rcond=None)
    inv = coef[0] * disp + coef[1]
    target_ok = valid & (inv > 1e-3)
    tz = np.where(target_ok, np.log(1.0 / np.maximum(inv, 1e-3)), 0).astype(np.float32)
    w = target_ok.astype(np.float64) / max(1, target_ok.sum())
    print(f'depth calibration: 1/z = {coef[0]:.4f} d + {coef[1]:.4f} from {int(ok.sum())} px; '
          f'shot depth {np.exp(np.percentile(tz[target_ok], 5)):.1f}..{np.exp(np.percentile(tz[target_ok], 95)):.1f} units')
    CAP, WEIGHT = 1.0, a.depth_weight

    def err(depth, win=None):
        sl = (slice(None), slice(None)) if win is None else (slice(win[1], win[3]), slice(win[0], win[2]))
        z = np.where(np.isfinite(depth) & (depth > 1e-3), depth, 1e3)
        e = np.minimum(np.abs(np.log(z) - tz[sl]), CAP)
        return float((e * w[sl]).sum())

    Base = F.State

    class DepthState(Base):
        def __init__(self, ref, classes, rough, depth=None):
            super().__init__(ref, classes, rough)
            self.depth = depth.copy() if depth is not None else np.full(classes.shape, np.inf, np.float32)
            self.derr = err(self.depth)

        def _with_depth(self, score, derr):
            score = dict(score)
            score['J'] += WEIGHT * derr
            score['depth_err'] = derr
            return score

        def score(self):
            return self._with_depth(super().score(), self.derr)

        def propose(self, window, cw, rough, dw=None):
            p = super().propose(window, cw, rough)
            d = 0.0
            if dw is not None:
                u0, v0, u1, v1 = window
                d = err(dw, window) - err(self.depth[v0:v1, u0:u1], window)
            if p is None:
                if d == 0.0:
                    return None
                p = {'window': window, 'cw': None, 'rough': rough,
                     'score': Base.objective(self.ref, self.agree, self.r2r, self.n_ras, self.r2f, self.light, rough)}
            p['score'] = self._with_depth(p['score'], self.derr + d)
            p['dw'], p['d_depth'] = dw, d
            return p

        def accept(self, p):
            super().accept(p)
            if p.get('dw') is not None:
                u0, v0, u1, v1 = p['window']
                self.depth[v0:v1, u0:u1] = p['dw']
                self.derr += p['d_depth']

    def refresh(self):
        r = self.M.render()
        self.state = DepthState(self.ref, r['classes'], self.M.rough(), r['depth'])
        return self.cur

    def evaluate(self, window):
        self.evals += 1
        if window is None:
            return self.state.propose((0, 0, 1, 1), F._sub(self.state.classes, (0, 0, 1, 1)), self.M.rough())
        r = self.M.render(window=window)
        return self.state.propose(window, r['classes'], self.M.rough(), r['depth'])

    F.State = DepthState
    F.Fitter.refresh = refresh
    F.Fitter.evaluate = evaluate


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'src/cave/layout.json'))
    ap.add_argument('--scratch', default=str(REF / 'fit'))
    ap.add_argument('--tag', default='target')
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--max-sweeps', type=int, default=6)
    ap.add_argument('--no-pairs', action='store_true')
    ap.add_argument('--pair-budget', type=float, default=600)
    ap.add_argument('--init', default=None)
    ap.add_argument('--depth', default=None, help='learned depth .npy of the shot (default: computed)')
    ap.add_argument('--no-depth', action='store_true')
    ap.add_argument('--depth-weight', type=float, default=0.6)
    a = ap.parse_args()

    err, fx, fz = solve_feet()
    cam = camera_for(fx, fz)
    feet = {'x': round(float(fx), 2), 'y': FEET_Y, 'z': round(float(fz), 2), 'yaw': YAW}
    (REF / 'fit-camera.json').write_text(json.dumps({**cam, 'feet': feet, 'door_edge_error_px': round(err, 1),
                                                     '_': 'The target camera in world units for the layout fit (scripts/shot/fit_target_layout.py).'}, indent=1))
    print('feet', feet, 'eye', [round(v, 2) for v in cam['eye']], 'door edge error px', round(err, 1))

    tmp = Path(tempfile.mkdtemp())
    cls = cv2.imread(str(REF / 'classes.png'), 0)
    cv2.imwrite(str(tmp / 'classes.png'), cv2.resize(cls, (W, H), interpolation=cv2.INTER_NEAREST))
    (tmp / 'camera.json').write_text(json.dumps(cam))

    F.REFERENCE = ROOT / 'docs/reference/target-shot.jpg'
    F.REF_CLASSES = tmp / 'classes.png'
    F.Reference.__init__.__defaults__ = (tmp / 'classes.png',)  # the default was bound at import
    F.CAMERA = tmp / 'camera.json'
    F.W, F.H = W, H
    F.X_RANGE = (-20, 12)
    F.Z_RANGE = (-20, 8)
    F.SPAWN = (int(round(fx)), int(round(fz)))
    F.SPAWN_TOP = FEET_Y
    F.SLABS = [None, 6.0, 7.0, 8.0, 9.0]
    orig = F.apply_constraints

    def constraints(M):
        orig(M)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = (F.SPAWN[0] + dx, F.SPAWN[1] + dz)
                M.fixed[c] = (FEET_Y, 'floor')
                M.set(c[0], c[1], FEET_Y, 'floor')
    F.apply_constraints = constraints
    if not a.no_depth:
        install_depth_term(a, cam, tmp)

    sys.argv = [sys.argv[0], '--out', a.out, '--scratch', a.scratch, '--tag', a.tag, '--max-sweeps', str(a.max_sweeps),
                '--pair-budget', str(a.pair_budget)] + (['--quick'] if a.quick else []) + (['--no-pairs'] if a.no_pairs else []) \
        + (['--init', a.init] if a.init else [])
    F.main()


if __name__ == '__main__':
    main()
