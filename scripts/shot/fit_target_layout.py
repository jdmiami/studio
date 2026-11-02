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

Usage: fit_target_layout.py [--quick] [--max-sweeps N] [--no-pairs] [--tag name] [--scratch dir]
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

    sys.argv = [sys.argv[0], '--out', a.out, '--scratch', a.scratch, '--tag', a.tag, '--max-sweeps', str(a.max_sweeps),
                '--pair-budget', str(a.pair_budget)] + (['--quick'] if a.quick else []) + (['--no-pairs'] if a.no_pairs else []) \
        + (['--init', a.init] if a.init else [])
    F.main()


if __name__ == '__main__':
    main()
