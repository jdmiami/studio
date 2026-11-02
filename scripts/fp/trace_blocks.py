#!/usr/bin/env python3
"""Trace the block lattice in a frame, geometrically.

Every straight edge in a block-world frame runs along world x, y or z. Given the camera, each
axis has a known vanishing point, so edges are labelled by axis; where edges of two or three axes
meet, there is a block corner. A corner's pixel is a ray from the eye, and a block corner lies on
the half-unit lattice (x, z at k + 0.5, y at k), so the ray meets the lattice at one depth: that
is the corner's 3D position, with no need to know the layout. Corners whose vertical edge hangs
below them are top corners; the edge directions say which cell they top, so every observed cell
gets a vote for its top height.

Usage:
  trace_blocks.py <frame.png> --camera cam.json [--out dir] [--truth layout.json] [--no-mask]
    cam.json: {"fov": deg, "yaw": deg, "pitch": deg, "roll": deg, "eye": [x, y, z]} (three.js
    conventions: YXZ order, yaw 0 looks down -z, positive yaw turns toward -x, positive pitch up)
    layout.json: {"x,z": {"top": h, "kind": k}} (the game's window.__phluphLayout) to score against.

Writes <out>/trace-lines.png (segments by axis: x red, y green, z blue, grey outliers; corners:
white = resolved to the lattice, magenta = ambiguous, yellow = off-lattice) and
<out>/trace-cells.json (per cell: voted top heights with counts), and prints a summary.
"""
import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_frame import MASKS  # noqa: E402

AXIS_COLOR = {0: (235, 60, 60), 1: (60, 220, 90), 2: (70, 120, 255)}
AXIS_TOL_DEG = 3.5
MIN_LEN = 14
JUNCTION_GAP = 6.0  # px: a segment end this close to another's line makes a corner
LATTICE_TOL = 2.5  # px: a lattice point must project this close to the traced corner
AMBIG_TOL = 2.5  # px: a second lattice point this close makes the corner ambiguous
DEPTH = (0.4, 40.0)
# The level's extent (block cells x -15..7, y -2..9, z -17..3): lattice points outside it are not
# corners of anything. Far away the lattice is dense on screen, so without bounds a ray finds
# spurious points behind the back wall.
BOUNDS = ((-15.5, 7.5), (-2.0, 10.0), (-17.5, 3.5))


class Camera:
    def __init__(self, spec, width, height):
        self.w, self.h = width, height
        self.f = (height / 2) / math.tan(math.radians(spec['fov']) / 2)
        self.cx, self.cy = width / 2, height / 2
        y, p, r = (math.radians(spec[k]) for k in ('yaw', 'pitch', 'roll'))
        ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
        rx = np.array([[1, 0, 0], [0, math.cos(p), -math.sin(p)], [0, math.sin(p), math.cos(p)]])
        rz = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])
        self.R = ry @ rx @ rz  # three.js 'YXZ': local -> world
        self.eye = np.array(spec['eye'], dtype=float)

    def project(self, P):
        c = self.R.T @ (np.asarray(P, dtype=float) - self.eye)
        if c[2] >= -1e-6:
            return None
        return np.array([self.cx + self.f * c[0] / -c[2], self.cy - self.f * c[1] / -c[2]])

    def ray(self, u, v):
        d = self.R @ np.array([(u - self.cx) / self.f, -(v - self.cy) / self.f, -1.0])
        return d / np.linalg.norm(d)

    def vanishing(self, axis):
        """Image direction toward +axis: (point, None) for a finite vanishing point, else (None, unit dir)."""
        e = np.zeros(3)
        e[axis] = 1
        c = self.R.T @ e
        if abs(c[2]) < 1e-4:
            d = np.array([c[0], -c[1]])
            return None, d / np.linalg.norm(d)
        return np.array([self.cx + self.f * c[0] / -c[2], self.cy - self.f * c[1] / -c[2]]), None


def detect_segments(gray, keep):
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_ADV)
    lines = lsd.detect(gray)[0]
    out = []
    if lines is None:
        return out
    for x0, y0, x1, y1 in lines.reshape(-1, 4):  # OpenCV 4 gives (n, 1, 4), OpenCV 5 (n, 4)
        if math.hypot(x1 - x0, y1 - y0) < MIN_LEN:
            continue
        mx, my = int((x0 + x1) / 2), int((y0 + y1) / 2)
        if not keep[min(max(my, 0), keep.shape[0] - 1), min(max(mx, 0), keep.shape[1] - 1)]:
            continue
        out.append(np.array([x0, y0, x1, y1], dtype=float))
    return out


def label_axes(segments, cam):
    """Axis per segment (0/1/2) or -1 when it fits no axis or two of them."""
    vps = [cam.vanishing(a) for a in range(3)]
    labels = []
    for s in segments:
        m = np.array([(s[0] + s[2]) / 2, (s[1] + s[3]) / 2])
        d = np.array([s[2] - s[0], s[3] - s[1]])
        d /= np.linalg.norm(d)
        angles = []
        for vp, inf_dir in vps:
            t = inf_dir if vp is None else (vp - m) / max(np.linalg.norm(vp - m), 1e-6)
            angles.append(math.degrees(math.acos(min(1.0, abs(float(np.dot(d, t)))))))
        order = np.argsort(angles)
        if angles[order[0]] > AXIS_TOL_DEG or angles[order[1]] < AXIS_TOL_DEG * 1.5:
            labels.append(-1)
        else:
            labels.append(int(order[0]))
    return labels


def line_intersection(a, b):
    x1, y1, x2, y2 = a
    x3, y3, x4, y4 = b
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return None
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
    return np.array([px, py])


def end_distance(seg, p):
    """How far p lies beyond the segment's nearer end along it (0 when inside), and which end."""
    a, b = seg[:2], seg[2:]
    d = b - a
    t = float(np.dot(p - a, d) / max(np.dot(d, d), 1e-9))
    L = np.linalg.norm(d)
    if t < 0:
        return -t * L, 0
    if t > 1:
        return (t - 1) * L, 1
    return 0.0, None


def find_corners(segments, labels):
    """Corners: points where segments of different axes meet at (or just beyond) their ends."""
    corners = []
    n = len(segments)
    by_axis = defaultdict(list)
    for i, l in enumerate(labels):
        if l >= 0:
            by_axis[l].append(i)
    for a in range(3):
        for b in range(a + 1, 3):
            for i in by_axis[a]:
                for j in by_axis[b]:
                    p = line_intersection(segments[i], segments[j])
                    if p is None:
                        continue
                    di, ei = end_distance(segments[i], p)
                    dj, ej = end_distance(segments[j], p)
                    if di > JUNCTION_GAP or dj > JUNCTION_GAP:
                        continue
                    # the two segments must actually reach the point (not cross far from their ends)
                    corners.append({'p': p, 'edges': {a: (i, ei), b: (j, ej)}})
    # Merge corners closer than 3 px, uniting their edge sets.
    merged = []
    for c in corners:
        for m in merged:
            if np.linalg.norm(m['p'] - c['p']) < 3.0:
                m['edges'].update({k: v for k, v in c['edges'].items() if k not in m['edges']})
                m['p'] = (m['p'] + c['p']) / 2
                break
        else:
            merged.append({'p': c['p'].copy(), 'edges': dict(c['edges'])})
    return merged


def snap_to_lattice(cam, u, v):
    """The lattice point whose projection lands nearest the pixel, as (error px, depth, point),
    and the runner-up (a different lattice point): a second one within the pixel tolerance means
    the ray is genuinely ambiguous between two depths."""
    d = cam.ray(u, v)
    seen = {}
    # Candidate depths: where the ray crosses each lattice plane of each axis; round the crossing
    # point to the nearest lattice point and measure its reprojection error.
    for axis, offset in ((0, 0.5), (1, 0.0), (2, 0.5)):
        if abs(d[axis]) < 1e-4:
            continue
        lo = cam.eye[axis] + d[axis] * DEPTH[0]
        hi = cam.eye[axis] + d[axis] * DEPTH[1]
        k0, k1 = sorted((math.floor(min(lo, hi) - offset), math.ceil(max(lo, hi) - offset)))
        for k in range(k0, k1 + 1):
            t = (k + offset - cam.eye[axis]) / d[axis]
            if not DEPTH[0] <= t <= DEPTH[1]:
                continue
            P = cam.eye + d * t
            L = np.array([round(P[0] - 0.5) + 0.5, round(P[1]), round(P[2] - 0.5) + 0.5])
            key = tuple(L)
            if key in seen or any(not lo <= L[i] <= hi for i, (lo, hi) in enumerate(BOUNDS)):
                continue
            q = cam.project(L)
            if q is None:
                continue
            seen[key] = (float(np.hypot(q[0] - u, q[1] - v)), float(np.linalg.norm(L - cam.eye)), L)
    if not seen:
        return None
    ranked = sorted(seen.values(), key=lambda b: b[0])
    return ranked[0], (ranked[1] if len(ranked) > 1 else None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('frame')
    ap.add_argument('--camera', required=True)
    ap.add_argument('--out', default=None)
    ap.add_argument('--truth')
    ap.add_argument('--no-mask', action='store_true')
    args = ap.parse_args()
    out = Path(args.out or Path(args.frame).parent)
    out.mkdir(parents=True, exist_ok=True)
    img = Image.open(args.frame).convert('RGB')
    if img.size != (1024, 572):
        img = img.resize((1024, 572), Image.Resampling.BOX)
    rgb = np.asarray(img)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    keep = np.ones(gray.shape, bool)
    if not args.no_mask:
        for x0, y0, x1, y1 in MASKS.values():
            keep[y0:y1, x0:x1] = False
    cam = Camera(json.load(open(args.camera)), *img.size)
    segments = detect_segments(gray, keep)
    labels = label_axes(segments, cam)
    corners = find_corners(segments, labels)

    votes = defaultdict(lambda: defaultdict(int))  # (cx, cz) -> top -> count
    resolved = []
    for c in corners:
        snap = snap_to_lattice(cam, *c['p'])
        if snap is None:
            c['status'] = 'none'
            continue
        (res, t, L), runner = snap
        if res > LATTICE_TOL:
            c['status'] = 'off'
            continue
        c['status'] = 'ambiguous' if runner is not None and runner[0] < AMBIG_TOL else 'ok'
        c['L'] = L
        # World sign of each edge leaving the corner: compare the segment's outward image
        # direction with the projection of +axis at the corner.
        signs = {}
        for axis, (i, end) in c['edges'].items():
            s = segments[i]
            far = s[:2] if end == 1 else s[2:]
            if end is None:
                continue  # the corner lies inside this segment: it passes through
            outward = far - c['p']
            e = np.zeros(3)
            e[axis] = 0.01
            q = cam.project(L + e)
            if q is None:
                continue
            signs[axis] = 1 if np.dot(outward, q - c['p']) > 0 else -1
        c['signs'] = signs
        resolved.append(c)
        if c['status'] != 'ok':
            continue
        # A top corner: a vertical edge hangs below it, and x and z edges leave it along the top.
        if signs.get(1) == -1 and 0 in signs and 2 in signs:
            cell = (int(L[0] + 0.5 * signs[0]), int(L[2] + 0.5 * signs[2]))
            votes[cell][int(L[1])] += 2
        elif signs.get(1) == -1 and (0 in signs or 2 in signs):
            # Two-edge corner on a face: the cell lies on either side across the missing axis.
            ax = 0 if 0 in signs else 2
            other = 2 if ax == 0 else 0
            for sgn in (-1, 1):
                cell = (int(L[0] + 0.5 * (signs[0] if ax == 0 else sgn)), int(L[2] + 0.5 * (signs[2] if ax == 2 else sgn)))
                votes[cell][int(L[1])] += 1

    # Overlay.
    over = Image.fromarray((rgb * 0.55 + 60).astype(np.uint8))
    d = ImageDraw.Draw(over)
    for s, l in zip(segments, labels):
        d.line([tuple(s[:2]), tuple(s[2:])], fill=AXIS_COLOR.get(l, (140, 140, 140)), width=2 if l >= 0 else 1)
    for c in corners:
        col = {'ok': (255, 255, 255), 'ambiguous': (255, 80, 255), 'off': (255, 220, 40)}.get(c.get('status'), (120, 120, 120))
        x, y = c['p']
        d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=col, width=2)
        if c.get('status') == 'ok':
            L = c['L']
            d.text((x + 4, y - 10), f"{L[0]:g},{L[1]:g},{L[2]:g}", fill=col)
    over.save(out / 'trace-lines.png')

    cells = {f'{x},{z}': dict(sorted(v.items(), key=lambda kv: -kv[1])) for (x, z), v in votes.items()}
    (out / 'trace-cells.json').write_text(json.dumps(cells, indent=1))
    counts = {k: sum(1 for l in labels if l == k) for k in (0, 1, 2, -1)}
    status = defaultdict(int)
    for c in corners:
        status[c.get('status', 'none')] += 1
    print(f"segments {len(segments)} (x {counts[0]}, y {counts[1]}, z {counts[2]}, unlabelled {counts[-1]}); "
          f"corners {len(corners)}: {dict(status)}; cells voted {len(cells)}")
    if args.truth:
        truth = json.load(open(args.truth))
        agree = wrong = 0
        wrongs = []
        for key, v in cells.items():
            if key not in truth:
                continue
            top = max(v.items(), key=lambda kv: kv[1])[0]
            t = truth[key]['top']
            if abs(int(top) - math.ceil(t)) == 0:
                agree += 1
            else:
                wrong += 1
                wrongs.append(f'{key}: voted {top} truth {t}')
        print(f'against truth: {agree} cells right, {wrong} wrong' + (': ' + '; '.join(wrongs[:12]) if wrongs else ''))
    print(f"overlay {out / 'trace-lines.png'}  cells {out / 'trace-cells.json'}")


if __name__ == '__main__':
    main()
