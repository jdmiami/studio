#!/usr/bin/env python3
"""Fit the reference frame's camera to its ground-level structure by line tracing.

The reference (docs/reference/cave-door.jpg) is drawn, not rendered: its ceiling slabs sit in a
two-point perspective of their own, while the floor, terraces, walls and door share one. The
player's view is the ground-level one, so the camera is fitted to straight edges below the
ceiling only (y > CEILING_Y), with the HUD and hands masked:

1. detect straight segments (LSD);
2. search fov, yaw, pitch, roll: each world axis has a vanishing point for a given camera, and a
   segment fits an axis when it points at that axis's vanishing point; maximise the number of
   segments that fit some axis within TOL degrees (Cauchy-weighted), from a coarse grid then a
   local refinement;
3. with the rotation and focal length fixed, solve the eye position by least squares from the
   door opening's four corners (world (+-2.5, 0|6, -15.5); image positions traced from the door
   zoom) and print the residual: this is where the drawing's own inconsistency shows up.

Prints JSON {fov, yaw, pitch, roll, eye, fit, door_rms_px, flags} and writes fit-lines.png.
Usage: fit_camera.py [--out dir] [--door "u,v u,v u,v u,v"] [--fov-range 50,95]
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares, minimize

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_frame import MASKS, REFERENCE  # noqa: E402
from trace_blocks import AXIS_COLOR, Camera, detect_segments  # noqa: E402

import cv2  # noqa: E402

W, H = 1024, 572
CEILING_Y = 205  # px: above this the drawing's ceiling slabs follow their own perspective
TOL = 3.0  # degrees
# Door opening corners (bl, br, tr, tl), read off the 3x door zoom: the mosaic leaves' extent.
DOOR_WORLD = [(-2.5, 0, -15.5), (2.5, 0, -15.5), (2.5, 6, -15.5), (-2.5, 6, -15.5)]
DOOR_IMAGE = [(617, 318), (750, 327), (750, 145), (618, 152)]


def axis_angles(segments, spec):
    """Per segment: the angle (deg) to each axis's vanishing direction, shape (n, 3)."""
    cam = Camera(spec, W, H)
    mids = np.array([[(s[0] + s[2]) / 2, (s[1] + s[3]) / 2] for s in segments])
    dirs = np.array([[s[2] - s[0], s[3] - s[1]] for s in segments])
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    out = np.zeros((len(segments), 3))
    for a in range(3):
        vp, inf_dir = cam.vanishing(a)
        if vp is None:
            t = np.tile(inf_dir, (len(segments), 1))
        else:
            t = vp - mids
            t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-6)
        cosang = np.abs((dirs * t).sum(1))
        out[:, a] = np.degrees(np.arccos(np.clip(cosang, 0, 1)))
    return out


def score(params, segments, lengths):
    fov, yaw, pitch, roll = params
    ang = axis_angles(segments, {'fov': fov, 'yaw': yaw, 'pitch': pitch, 'roll': roll, 'eye': [0, 0, 0]})
    best = ang.min(1)
    # Cauchy: a segment within TOL counts nearly fully, far ones fade; weighted by length.
    w = 1 / (1 + (best / TOL) ** 2)
    return -float((w * lengths).sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(Path(__file__).resolve().parents[2] / 'screenshots/fp'))
    ap.add_argument('--door', help='four image points bl br tr tl as "u,v u,v u,v u,v"')
    ap.add_argument('--fov-range', default='50,95')
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    door_img = DOOR_IMAGE if not args.door else [tuple(map(float, p.split(','))) for p in args.door.split()]

    rgb = np.asarray(Image.open(REFERENCE).convert('RGB'))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    keep = np.ones(gray.shape, bool)
    for x0, y0, x1, y1 in MASKS.values():
        keep[y0:y1, x0:x1] = False
    keep[:CEILING_Y] = False
    segments = detect_segments(gray, keep)
    lengths = np.array([math.hypot(s[2] - s[0], s[3] - s[1]) for s in segments])
    print(f'{len(segments)} segments below the ceiling', file=sys.stderr)

    f0, f1 = map(float, args.fov_range.split(','))
    best = None
    for fov in np.arange(f0, f1 + 1, 5):
        for yaw in np.arange(-30, 31, 5):
            for pitch in np.arange(-15, 11, 5):
                for roll in (-2, 0, 2):
                    s = score((fov, yaw, pitch, roll), segments, lengths)
                    if best is None or s < best[0]:
                        best = (s, (fov, yaw, pitch, roll))
    res = minimize(score, best[1], args=(segments, lengths), method='Nelder-Mead',
                   options={'xatol': 0.01, 'fatol': 0.1, 'maxiter': 2000})
    fov, yaw, pitch, roll = res.x
    spec = {'fov': float(fov), 'yaw': float(yaw), 'pitch': float(pitch), 'roll': float(roll), 'eye': [0, 0, 0]}
    ang = axis_angles(segments, spec)
    labels = np.where(ang.min(1) <= TOL, ang.argmin(1), -1)
    fit = {'inliers': {k: int((labels == i).sum()) for i, k in enumerate('xyz')}, 'outliers': int((labels < 0).sum()),
           'weighted': round(-res.fun / lengths.sum(), 3)}

    # Eye position from the door corners, rotation and focal length fixed.
    def resid(eye):
        cam = Camera({**spec, 'eye': list(eye)}, W, H)
        r = []
        for P, q in zip(DOOR_WORLD, door_img):
            p = cam.project(P)
            r.extend([1e3, 1e3] if p is None else [p[0] - q[0], p[1] - q[1]])
        return r
    sol = least_squares(resid, [-5.5, 2.6, -1.5])
    eye = [round(float(v), 3) for v in sol.x]
    door_rms = round(float(np.sqrt(np.mean(np.square(sol.fun)))), 2)
    spec['eye'] = eye
    result = {'fov': round(float(fov), 2), 'yaw': round(float(yaw), 2), 'pitch': round(float(pitch), 2), 'roll': round(float(roll), 2),
              'eye': eye, 'fit': fit, 'door_rms_px': door_rms,
              'flags': f'nohud=1&nohands=1&eye={eye[0]},{eye[1]},{eye[2]}&look={yaw:.2f},{pitch:.2f},{roll:.2f}&fov={fov:.2f}'}
    print(json.dumps(result))
    (out / 'fit-camera.json').write_text(json.dumps({k: result[k] for k in ('fov', 'yaw', 'pitch', 'roll', 'eye')}))

    over = Image.fromarray((rgb * 0.55 + 60).astype(np.uint8))
    d = ImageDraw.Draw(over)
    for s, l in zip(segments, labels):
        d.line([tuple(s[:2]), tuple(s[2:])], fill=AXIS_COLOR.get(int(l), (140, 140, 140)), width=2 if l >= 0 else 1)
    cam = Camera(spec, W, H)
    for a in range(3):
        vp, _ = cam.vanishing(a)
        if vp is not None and -2000 < vp[0] < 3000 and -2000 < vp[1] < 2500:
            d.ellipse([vp[0] - 5, vp[1] - 5, vp[0] + 5, vp[1] + 5], outline=AXIS_COLOR[a], width=3)
    quad = [tuple(cam.project(P)) for P in DOOR_WORLD]
    d.polygon(quad, outline=(255, 255, 0), width=2)
    for q in door_img:
        d.ellipse([q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3], outline=(0, 255, 255), width=2)
    # Floor seams x = k + 0.5 on y = 0 from z = -15.5 to -3.5, as the fitted camera sees them.
    for k in range(-4, 4):
        a, b = cam.project((k + 0.5, 0, -15.5)), cam.project((k + 0.5, 0, -4.5))
        if a is not None and b is not None:
            d.line([tuple(a), tuple(b)], fill=(255, 255, 0), width=1)
    d.text((8, H - 16), f"fov {fov:.1f} yaw {yaw:.1f} pitch {pitch:.1f} roll {roll:.1f} eye {eye} door rms {door_rms}px", fill=(255, 255, 255))
    over.save(out / 'fit-lines.png')
    print(f"overlay {out / 'fit-lines.png'}", file=sys.stderr)


if __name__ == '__main__':
    main()
