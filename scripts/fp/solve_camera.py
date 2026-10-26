#!/usr/bin/env python3
"""Solve the camera of the reference frame docs/reference/cave-door.jpg by line tracing.

The reference is a block world: nearly every straight edge runs along world x (rows), y (verticals)
or z (depth lines toward the door). For a pinhole camera with vertical fov, yaw, pitch and roll
(three.js PerspectiveCamera, Euler order 'YXZ', principal point at the image centre) each axis has
a known vanishing point, so the rotation and the focal length are found by making the detected
segments point at their axis's vanishing point. The eye position then follows from 2D-3D
correspondences with the rotation and focal fixed: the traced door-opening corners, the door's
centre seam and the floor-tile seams (lines x = k + 0.5 on y = 0), a linear least-squares problem.

Deterministic, no arguments needed. Prints JSON {fov, yaw, pitch, roll, eye, rms_px, segments_used,
...} and writes solve-lines.png (traced segments coloured by axis: x red, y green, z blue, outliers
grey; vanishing points marked when inside the frame; the reprojected door opening, lintel and the
floor grid in yellow) to the output folder.

Usage: solve_camera.py [--out DIR] [--json FILE]
Conventions (src/main.js): yaw 0 looks down -z, positive yaw turns left (toward -x); positive
pitch looks up; f = (H/2) / tan(fov/2) px.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares, minimize

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_frame import H, MASKS, REFERENCE, W  # noqa: E402

DEFAULT_OUT = os.environ.get('SOLVE_OUT', str(Path(__file__).resolve().parents[2] / 'screenshots/fp'))
CX, CY = W / 2, H / 2
MIN_LEN = 15.0          # px: shorter segments are texture, not block edges
CAUCHY_PX = 1.5         # robust scale for the vanishing-point residual (px)
INLIER_PX = 3.0         # a segment is an inlier of its axis below this residual ...
INLIER_DEG = 5.0        # ... and this angle (short segments pass the px test too easily)
SEAM_PX = 4.0           # a floor z-segment matches a predicted seam line within this distance
SEAM_SUPPORT_PX = 40.0  # ... and a seam counts only with this much segment length along it
AXIS_COLOR = {0: (235, 60, 50), 1: (50, 190, 70), 2: (60, 110, 240), -1: (150, 150, 150)}
AXIS_NAME = {0: 'x', 1: 'y', 2: 'z'}

# World geometry of the anchors (src/cave/level.js, src/cave/props.js).
DOOR_Z = -15.5          # front face of the door frame / opening plane
DOOR_X0, DOOR_X1 = -2.5, 2.5
DOOR_H = 6.0
FLOOR_SEAMS = [k + 0.5 for k in range(-4, 4)]  # x = k + 0.5 on y = 0, running along z


# --- camera model -----------------------------------------------------------------------------

def rotation(yaw, pitch, roll):
    """three.js Euler 'YXZ' (degrees): R = Ry(yaw) Rx(pitch) Rz(roll); columns are the camera axes."""
    y, p, r = np.radians([yaw, pitch, roll])
    cy, sy, cp, sp, cr, sr = np.cos(y), np.sin(y), np.cos(p), np.sin(p), np.cos(r), np.sin(r)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return ry @ rx @ rz


def focal(fov):
    return (H / 2) / np.tan(np.radians(fov) / 2)


def vanishing_points(fov, yaw, pitch, roll):
    """Homogeneous image points of the world x, y, z directions (last coordinate may be ~0)."""
    r = rotation(yaw, pitch, roll)
    f = focal(fov)
    dc = r  # R^T e_a is the a-th row of R: dc[a] = world axis a in camera coordinates
    return np.stack([f * dc[:, 0] - CX * dc[:, 2], -f * dc[:, 1] - CY * dc[:, 2], -dc[:, 2]], axis=1)


def project(points, fov, yaw, pitch, roll, eye):
    pc = (np.asarray(points, float) - np.asarray(eye, float)) @ rotation(yaw, pitch, roll)
    z = -pc[:, 2]
    f = focal(fov)
    return np.stack([CX + f * pc[:, 0] / z, CY - f * pc[:, 1] / z], axis=1), z


# --- segments -----------------------------------------------------------------------------------

def detect_segments(gray, keep):
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_ADV)
    lines = lsd.detect(gray)[0].reshape(-1, 4).astype(float)
    p0, p1 = lines[:, :2], lines[:, 2:]
    length = np.linalg.norm(p1 - p0, axis=1)
    mid = (p0 + p1) / 2
    inside = np.ones(len(lines), bool)
    for q in (p0, p1, mid):
        xi = np.clip(q[:, 0].astype(int), 0, W - 1)
        yi = np.clip(q[:, 1].astype(int), 0, H - 1)
        inside &= keep[yi, xi]
    ok = inside & (length >= MIN_LEN)
    return {'p0': p0[ok], 'p1': p1[ok], 'mid': mid[ok], 'len': length[ok],
            'dir': (p1[ok] - p0[ok]) / length[ok, None], 'all': len(lines)}


def residuals_per_axis(seg, params):
    """Endpoint offset (px) of each segment from the line midpoint -> vanishing point, per axis."""
    vps = vanishing_points(*params)
    out = np.empty((len(seg['len']), 3))
    for a in range(3):
        h = vps[a]
        v = np.stack([h[0] - seg['mid'][:, 0] * h[2], h[1] - seg['mid'][:, 1] * h[2]], axis=1)
        v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
        cross = np.abs(seg['dir'][:, 0] * v[:, 1] - seg['dir'][:, 1] * v[:, 0])
        out[:, a] = seg['len'] / 2 * cross
    return out


def cauchy(r, c=CAUCHY_PX):
    return (c * c / 2) * np.log1p((r / c) ** 2)


BOUNDS = np.array([[40, 110], [-60, 60], [-45, 30], [-15, 15]], float)


def loss_free(params, seg):
    pen = np.sum(np.maximum(0, BOUNDS[:, 0] - params) ** 2 + np.maximum(0, params - BOUNDS[:, 1]) ** 2)
    r = residuals_per_axis(seg, params).min(axis=1)
    return cauchy(r).sum() + 1e3 * pen


def assign(seg, params):
    """Best axis per segment; an inlier must be within INLIER_PX and INLIER_DEG of its axis."""
    r = residuals_per_axis(seg, params)
    axis = r.argmin(axis=1)
    best = r[np.arange(len(axis)), axis]
    angle = np.degrees(np.arcsin(np.clip(best / (seg['len'] / 2), 0, 1)))
    axis = np.where((best < INLIER_PX) & (angle < INLIER_DEG), axis, -1)
    return axis, best


def fit_rotation(seg):
    """Multi-start Nelder-Mead on the min-over-axes Cauchy loss, then assignment/refit iterations."""
    starts = [(fov, yaw, pitch, roll)
              for fov in (55, 65, 75, 90) for yaw in (-20, -10, 0, 10, 20)
              for pitch in (-20, -10, 0, 10) for roll in (-3, 0, 3)]
    best = None
    for s in starts:
        res = minimize(loss_free, np.array(s, float), args=(seg,), method='Nelder-Mead',
                       options={'xatol': 1e-3, 'fatol': 1e-4, 'maxiter': 2000})
        if best is None or res.fun < best.fun:
            best = res
    params = best.x
    for _ in range(6):
        axis, _ = assign(seg, params)
        sel = axis >= 0

        def fun(p):
            r = residuals_per_axis({k: (v[sel] if isinstance(v, np.ndarray) else v) for k, v in seg.items()}, p)
            return r[np.arange(sel.sum()), axis[sel]]
        params = least_squares(fun, params, loss='cauchy', f_scale=CAUCHY_PX, x_scale=[1, 1, 1, 0.5]).x
    return params, best.fun


def subset(seg, sel):
    return {k: (v[sel] if isinstance(v, np.ndarray) else v) for k, v in seg.items()}


def fov_profile(seg, params, fovs=(50, 55, 60, 65, 70, 80, 90)):
    """How confident the focal length is: refit yaw/pitch/roll with the fov held at each value and
    report the vanishing-point loss and the door-corner reprojection of the eye solve."""
    out = []
    for fv in fovs:
        p = np.array(params, float)
        p[0] = fv
        for _ in range(4):
            axis, _ = assign(seg, p)
            sel = axis >= 0
            sub, ax = subset(seg, sel), axis[sel]

            def fun(q):
                r = residuals_per_axis(sub, np.array([fv, *q]))
                return r[np.arange(len(ax)), ax]
            p = np.array([fv, *least_squares(fun, p[1:], loss='cauchy', f_scale=CAUCHY_PX).x])
        axis, _ = assign(seg, p)
        lines, _ = trace_door(seg, axis)
        c2, c3 = door_corners(lines)
        rms = float('nan')
        if len(c2) == 4:
            eye, _ = solve_eye(p, c2, c3, [])
            pr, z = project(c3, *p, eye)
            rms = float(np.sqrt(np.mean(np.sum((pr - np.array(c2)) ** 2, axis=1)))) if (z > 0).all() else float('inf')
        out.append({'fov': fv, 'yaw': round(float(p[1]), 1), 'pitch': round(float(p[2]), 1),
                    'roll': round(float(p[3]), 1), 'vp_loss': round(float(loss_free(p, seg)), 1),
                    'inliers': int((axis >= 0).sum()), 'corner_rms_px': round(rms, 1)})
    return out


def joint_refinement(seg, params, eye, c2, c3, line_pairs, w=2.0):
    """Reported, not adopted: refit all seven parameters on the vanishing-point loss plus w times
    the squared anchor residuals. It trades the whole frame's line consensus (fov, distance) for the
    painted door's corners, so it says how much the door alone would move the camera."""
    def total(q):
        p, e = q[:4], q[4:]
        return loss_free(p, seg) + w * np.sum(anchor_residuals_px(p, e, c2, c3, line_pairs) ** 2)
    r = minimize(total, np.array([*params, *eye]), method='Nelder-Mead',
                 options={'xatol': 1e-4, 'fatol': 1e-5, 'maxiter': 8000, 'maxfev': 8000})
    p, e = r.x[:4], r.x[4:]
    res = anchor_residuals_px(p, e, c2, c3, line_pairs)
    return {'fov': round(float(p[0]), 2), 'yaw': round(float(p[1]), 2), 'pitch': round(float(p[2]), 2),
            'roll': round(float(p[3]), 2), 'eye': [round(float(v), 3) for v in e],
            'rms_px': round(float(np.sqrt(np.mean(res ** 2))), 2), 'vp_loss': round(float(loss_free(p, seg)), 1)}


def pick_labelling(seg, params):
    """The vanishing-point loss cannot tell world x from world z (yaw and yaw -/+ 90 score the same):
    keep the labelling whose door-corner eye solve reprojects best."""
    cands = [np.array(params, float)]
    for d in (-90, 90):
        p = np.array(params, float)
        p[1] += d
        if BOUNDS[1, 0] <= p[1] <= BOUNDS[1, 1]:
            cands.append(p)
    scored = []
    for p in cands:
        axis, _ = assign(seg, p)
        lines, _ = trace_door(seg, axis)
        c2, c3 = door_corners(lines)
        if len(c2) < 4:
            scored.append((np.inf, p))
            continue
        eye, _ = solve_eye(p, c2, c3, [])
        pr, z = project(c3, *p, eye)
        rms = np.sqrt(np.mean(np.sum((pr - np.array(c2)) ** 2, axis=1))) if (z > 0).all() else np.inf
        scored.append((rms, p))
    scored.sort(key=lambda t: t[0])
    return scored[0][1], [(round(float(r), 1), round(float(p[1]), 1)) for r, p in scored]


# --- tracing the anchors ----------------------------------------------------------------------

def hom_line(p, q):
    return np.cross([p[0], p[1], 1.0], [q[0], q[1], 1.0])


def intersect(l1, l2):
    p = np.cross(l1, l2)
    return p[:2] / p[2]


def fit_line(seg, idx):
    """Total-least-squares line through the endpoints of the given segments (weighted by length)."""
    pts = np.concatenate([seg['p0'][idx], seg['p1'][idx]])
    w = np.concatenate([seg['len'][idx], seg['len'][idx]])
    c = (pts * w[:, None]).sum(0) / w.sum()
    u, s, vt = np.linalg.svd((pts - c) * np.sqrt(w)[:, None], full_matrices=False)
    d = vt[0]
    n = np.array([-d[1], d[0]])
    return np.array([n[0], n[1], -n @ c])


def pick(seg, axis, want_axes, u_range, v_range, at_v=None):
    """Indices of segments of the given axes whose midpoint lies in the window (and, with at_v, whose
    line crosses that row inside the u range)."""
    out = []
    for i in range(len(seg['len'])):
        if axis[i] not in want_axes:
            continue
        p0, p1 = seg['p0'][i], seg['p1'][i]
        m = seg['mid'][i]
        if not (v_range[0] <= m[1] <= v_range[1] and u_range[0] <= m[0] <= u_range[1]):
            continue
        if at_v is not None:
            d = p1 - p0
            if abs(d[1]) < 1e-6:
                continue
            u = p0[0] + (at_v - p0[1]) * d[0] / d[1]
            if not (u_range[0] <= u <= u_range[1]):
                continue
        out.append(i)
    return np.array(out, int)


def trace_door(seg, axis):
    """The door opening's edges in the reference, traced from the y and x inliers near the door.

    Windows (reference px) come from reading the frame: the left post's inner edge ~u 615, the
    right post's inner edge ~u 749, the centre seam ~u 681, the lintel's underside ~v 150, the
    threshold ~v 322."""
    lines = {}
    horiz = (0, 2)  # the labelling of x vs z is settled later; both are 'row' directions here
    picks = {
        'left': pick(seg, axis, (1,), (606, 624), (160, 320), at_v=240),
        'seam': pick(seg, axis, (1,), (670, 692), (160, 320), at_v=240),
        'right': pick(seg, axis, (1,), (740, 760), (160, 320), at_v=240),
        'lintel': pick(seg, axis, horiz, (600, 760), (138, 162)),
        'threshold': pick(seg, axis, horiz, (600, 760), (310, 340)),
        'lintel_top': pick(seg, axis, horiz, (600, 760), (108, 132)),
    }
    for name, idx in picks.items():
        if len(idx):
            lines[name] = fit_line(seg, idx)
    return lines, picks


CORNERS = (('bottom-left', 'left', 'threshold', DOOR_X0, 0), ('bottom-right', 'right', 'threshold', DOOR_X1, 0),
           ('top-left', 'left', 'lintel', DOOR_X0, DOOR_H), ('top-right', 'right', 'lintel', DOOR_X1, DOOR_H))


def door_corners(lines):
    c2, c3 = [], []
    if all(k in lines for k in ('left', 'right', 'lintel', 'threshold')):
        for _, vert, horiz, x, y in CORNERS:
            c2.append(intersect(lines[vert], lines[horiz]))
            c3.append((x, y, DOOR_Z))
    return c2, c3


def solve_eye(params, points2d, points3d, line_pairs):
    """Linear least squares for the eye with R and f fixed.

    points: u = cx + f x_c / (-z_c) etc. with p_c = R^T P - t, t = R^T eye.
    line_pairs: (image line l, world points on the world line): l . proj(P) = 0, linear in t."""
    fov, yaw, pitch, roll = params
    r = rotation(yaw, pitch, roll)
    f = focal(fov)
    rows, rhs = [], []
    for (u, v), p in zip(points2d, points3d):
        q = r.T @ np.asarray(p, float)
        rows.append([f, 0, u - CX]); rhs.append(f * q[0] + (u - CX) * q[2])
        rows.append([0, f, -(v - CY)]); rhs.append(f * q[1] - (v - CY) * q[2])
    for l, pts in line_pairs:
        l = np.asarray(l, float) / np.linalg.norm(l[:2])
        for p in pts:
            q = r.T @ np.asarray(p, float)
            # l1 (CX (-z) + f x) + l2 (CY (-z) - f y) + l3 (-z) = 0, with (x,y,z) = q - t
            coef = np.array([l[0] * f, -l[1] * f, -(l[0] * CX + l[1] * CY + l[2])])
            rows.append(list(coef)); rhs.append(coef @ q)
    a, b = np.array(rows), np.array(rhs)
    t, *_ = np.linalg.lstsq(a, b, rcond=None)
    eye = r @ t
    return eye, anchor_residuals_px(params, eye, points2d, points3d, line_pairs)


def anchor_residuals_px(params, eye, points2d, points3d, line_pairs):
    """Reprojection errors in px: corner distance, and for a line anchor the distance of each
    projected world point from the traced image line."""
    res = []
    if len(points2d):
        pr, _ = project(points3d, *params, eye)
        res += list(np.linalg.norm(pr - np.array(points2d), axis=1))
    for l, pts in line_pairs:
        l = np.asarray(l, float) / np.linalg.norm(l[:2])
        pr, _ = project(pts, *params, eye)
        res += [abs(l @ [u, v, 1.0]) for u, v in pr]
    return np.array(res)


# --- main ---------------------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--json')
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    ref = np.asarray(Image.open(REFERENCE).convert('RGB'))
    keep = np.ones((H, W), bool)
    for x0, y0, x1, y1 in MASKS.values():
        keep[y0:y1, x0:x1] = False
    gray = cv2.cvtColor(ref, cv2.COLOR_RGB2GRAY)
    seg = detect_segments(gray, keep)

    params, loss = fit_rotation(seg)
    params, labellings = pick_labelling(seg, params)
    axis, best_r = assign(seg, params)
    fov, yaw, pitch, roll = params
    counts = {AXIS_NAME[a]: int((axis == a).sum()) for a in range(3)}
    counts['outliers'] = int((axis < 0).sum())
    inl = axis >= 0
    angle = np.degrees(np.arcsin(np.clip(best_r / (seg['len'] / 2), 0, 1)))

    # Anchors: the door opening's corners from the traced post / lintel / threshold lines, plus the
    # door's centre seam (x = 0) and the lintel's top edge (y = 7) as line correspondences.
    lines, picks = trace_door(seg, axis)
    corners2d, corners3d = door_corners(lines)
    used = {name: [round(float(p[0]), 1), round(float(p[1]), 1)] for (name, *_), p in zip(CORNERS, corners2d)}
    line_pairs = []
    if 'seam' in lines:
        line_pairs.append((lines['seam'], [(0, 0, DOOR_Z), (0, DOOR_H, DOOR_Z)]))
        used['centre-seam'] = 'line x=0 on the door plane, %d segments' % len(picks['seam'])
    if 'lintel_top' in lines:
        line_pairs.append((lines['lintel_top'], [(-3, DOOR_H + 1, DOOR_Z), (3, DOOR_H + 1, DOOR_Z)]))
        used['lintel-top'] = 'line y=7 on the door plane, %d segments' % len(picks['lintel_top'])
    eye, _ = solve_eye(params, corners2d, corners3d, line_pairs)

    # Floor seams: z-inliers on the floor matched to the predicted x = k + 0.5 lines, then re-solve.
    seams_used = []
    floor_idx = [i for i in range(len(seg['len'])) if axis[i] == 2 and 300 <= seg['mid'][i][1] <= 470
                 and 440 <= seg['mid'][i][0] <= 800]
    for k in FLOOR_SEAMS:
        pts3 = [(k, 0, z) for z in (-3, -15)]
        (p2d, _) = project(pts3, fov, yaw, pitch, roll, eye)
        pl = hom_line(p2d[0], p2d[1])
        pl = pl / np.linalg.norm(pl[:2])
        matched = [i for i in floor_idx
                   if abs(pl @ [*seg['p0'][i], 1]) < SEAM_PX and abs(pl @ [*seg['p1'][i], 1]) < SEAM_PX]
        # A seam needs real support (one stray 16 px segment is a terrace edge, not a tile seam).
        if matched and seg['len'][matched].sum() >= SEAM_SUPPORT_PX:
            l = fit_line(seg, np.array(matched))
            line_pairs.append((l, pts3))
            seams_used.append({'x': k, 'segments': len(matched),
                               'mid': [[round(float(c), 1) for c in seg['mid'][i]] for i in matched][:3]})
    eye, res_all = solve_eye(params, corners2d, corners3d, line_pairs)

    # Reprojection check of the anchors with the final pose.
    rms_px = float(np.sqrt(np.mean(res_all ** 2))) if len(res_all) else float('nan')
    corner_err = [round(float(e), 1) for e in res_all[:len(corners2d)]]

    result = {
        'fov': round(float(fov), 2), 'yaw': round(float(yaw), 2), 'pitch': round(float(pitch), 2),
        'roll': round(float(roll), 2), 'eye': [round(float(v), 3) for v in eye],
        'rms_px': round(rms_px, 2), 'segments_used': int(inl.sum()),
        'corner_errors_px': corner_err,
        'segments_total': int(len(seg['len'])), 'segments_detected': seg['all'],
        'inliers': counts, 'vp_rms_px': round(float(np.sqrt(np.mean(best_r[inl] ** 2))), 2),
        'vp_mean_angle_deg': round(float(angle[inl].mean()), 2),
        'focal_px': round(float(focal(fov)), 1),
        'vanishing_points': {AXIS_NAME[a]: ([round(float(h[0] / h[2]), 1), round(float(h[1] / h[2]), 1)]
                                            if abs(h[2]) > 1e-6 else 'infinity')
                             for a, h in enumerate(vanishing_points(*params))},
        'anchors': used, 'floor_seams': seams_used, 'labellings_rms_yaw': labellings,
        'vp_loss': round(float(loss), 1), 'fov_profile': fov_profile(seg, params),
        'joint_refinement_not_adopted': joint_refinement(seg, params, eye, corners2d, corners3d, line_pairs),
        'flags': f'nohud=1&nohands=1&eye={eye[0]:.3f},{eye[1]:.3f},{eye[2]:.3f}'
                 f'&look={yaw:.2f},{pitch:.2f},{roll:.2f}&fov={fov:.2f}',
    }
    print(json.dumps(result))
    if args.json:
        Path(args.json).write_text(json.dumps(result, indent=1))
    draw_overlay(ref, keep, seg, axis, params, eye, corners2d, lines, out / 'solve-lines.png')
    print(f'overlay {out / "solve-lines.png"}')


def draw_overlay(ref, keep, seg, axis, params, eye, corners2d, lines, path):
    fov, yaw, pitch, roll = params
    img = Image.fromarray((ref * 0.55 + 60).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for i in np.argsort(axis):  # outliers first so the axis colours sit on top
        c = AXIS_COLOR[int(axis[i])]
        d.line([tuple(seg['p0'][i]), tuple(seg['p1'][i])], fill=c, width=2 if axis[i] >= 0 else 1)
    # Reprojected door opening, lintel row, pillar and the floor grid.
    yel = (255, 230, 40)

    def poly(pts3, close=True, w=2, col=yel):
        p2, z = project(pts3, fov, yaw, pitch, roll, eye)
        if (z <= 0.05).any():
            return
        pts = [tuple(p) for p in p2]
        d.line(pts + ([pts[0]] if close else []), fill=col, width=w)
    poly([(DOOR_X0, 0, DOOR_Z), (DOOR_X1, 0, DOOR_Z), (DOOR_X1, DOOR_H, DOOR_Z), (DOOR_X0, DOOR_H, DOOR_Z)])
    poly([(-3.5, 0, DOOR_Z), (3.5, 0, DOOR_Z), (3.5, 7, DOOR_Z), (-3.5, 7, DOOR_Z)], w=1)
    poly([(3.5, 0, DOOR_Z), (4.5, 0, DOOR_Z), (4.5, 8, DOOR_Z), (3.5, 8, DOOR_Z)], w=1)
    poly([(0, 0, DOOR_Z), (0, DOOR_H, DOOR_Z)], close=False, w=1)
    for k in range(-4, 5):
        poly([(k - 0.5, 0, -3), (k - 0.5, 0, DOOR_Z)], close=False, w=1)
    for z in range(-4, -16, -1):
        poly([(-4.5, 0, z - 0.5), (3.5, 0, z - 0.5)], close=False, w=1)
    # Traced anchor lines (cyan) and corners.
    for name, l in lines.items():
        a, b, c = l
        if abs(b) > abs(a):
            pts = [(0, -c / b), (W, -(a * W + c) / b)]
        else:
            pts = [(-c / a, 0), (-(b * H + c) / a, H)]
        d.line(pts, fill=(60, 230, 230), width=1)
    for p in corners2d:
        d.ellipse([p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4], outline=(255, 255, 255), width=2)
    for a, h in enumerate(vanishing_points(*params)):
        if abs(h[2]) < 1e-6:
            continue
        u, v = h[0] / h[2], h[1] / h[2]
        if 0 <= u < W and 0 <= v < H:
            d.ellipse([u - 7, v - 7, u + 7, v + 7], outline=AXIS_COLOR[a], width=3)
            d.text((u + 9, v - 6), f'VP {AXIS_NAME[a]}', fill=AXIS_COLOR[a])
    d.text((8, H - 14), f'fov {fov:.1f} yaw {yaw:.1f} pitch {pitch:.1f} roll {roll:.1f} '
           f'eye ({eye[0]:.2f}, {eye[1]:.2f}, {eye[2]:.2f})', fill=(255, 255, 255))
    img.save(path)


if __name__ == '__main__':
    main()
