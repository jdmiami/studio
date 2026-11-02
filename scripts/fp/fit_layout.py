#!/usr/bin/env python3
"""Fit the cave's block layout to the reference painting docs/reference/cave-door.jpg.

The reference's camera is solved (docs/reference/cave-door-camera.json) and its pixels are
labelled by surface class (docs/reference/cave-door-classes.png, scripts/fp/segment_reference.py).
This script searches for the per-cell layout (top height and kind per column, ceiling slab bottom
per cell) whose rasterized class map (scripts/fp/raster_layout.py, the same camera) matches the
label image, and writes it as src/cave/layout.json.

Objective (lower is better), over the pixels whose reference class is a block surface (1 grass,
2 earth, 3 water, 4 floor, 5 door, 6 frame, 7 ceiling; props, light, HUD and hands are ignored):
  J = (1 - agreement) + EDGE_WEIGHT * edge + LIGHT_WEIGHT * (1 - light_ok) + SMOOTH * roughness
  agreement: per-class recall averaged over the 7 classes (every pixel weighted by the inverse
             frequency of its reference class, so the small classes count: door, frame, floor);
  edge:      symmetric chamfer distance in px between the reference's class boundaries and the
             raster's (exact Euclidean distance transform each way, distances capped at EDGE_CAP);
  light_ok:  the fraction of the reference's light pixels (class 8, the washed-out openings)
             where the raster shows no ceiling (a hole in the slabs, whatever shows through);
  roughness: mean |top - neighbour top| over the cell grid, a tie-breaker that keeps hidden
             cells sane and the terrain blocky rather than spiky.
The objective is kept incrementally: a candidate change to one column only re-renders the image
window its prism can touch (raster_layout's window render, exact) and only recomputes the
distance transform in that window dilated by the cap; the state is re-derived from a full
render every CHECK_EVERY evaluations and the two are compared.

Search: a guess from the labels (floor and the near pool back-projected onto y = 0, the grass
terraces from their hem lines, everything else a height-2 terrace inside height-9 walls, the back
wall and door as level.js has them), then coordinate descent over the cells in order of distance
from the eye: every candidate (top, kind) for the cell, then every slab bottom, keeping an
improvement; sweeps repeat until one changes nothing; then pairs of neighbouring cells jointly
around the cells that still disagree. Hard constraints: the spawn cell (7, 2) and its 8 neighbours
are height-2 wall (eye 3.775 = 2.175 + 1.6), nothing within 0.6 of the eye in x/z is taller, the
floor in front of the door (x -2..2, z -15..-9) is 'floor' at 0, the back wall z <= -16 is height
10 and the door opening stays free (DOOR of level.js).

Usage: fit_layout.py [--out src/cave/layout.json] [--scratch dir] [--init layout.json]
                     [--max-sweeps N] [--no-pairs] [--eval layout.json] [--quick]
  --eval only scores a layout (and writes its report), --init starts from a layout instead of the
  guess, --quick limits the candidate tops for a fast smoke run.
Writes the layout, <scratch>/<tag>-report.png (reference | reference classes | raster classes |
raster boundaries over the reference), <scratch>/<tag>-metrics.json and prints the before / after
metrics, the kind counts, the height histogram and the regions that still disagree.
"""
import argparse
import json
import math
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from raster_layout import (BOTTOM, CEILING, DOOR, DOOR_C, EARTH, FLOOR, FRAME, GRASS, KIND_CODE,  # noqa: E402
                           KINDS, LIGHT, PREVIEW_RGB, WATER, Layout, Rasterizer, class_edges, preview)
from trace_blocks import Camera  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / 'docs/reference/cave-door.jpg'
REF_CLASSES = ROOT / 'docs/reference/cave-door-classes.png'
CAMERA = ROOT / 'docs/reference/cave-door-camera.json'
W, H = 1024, 572

# The cell box: the camera's view wedge plus the cells around and behind the eye.
X_RANGE = (-18, 10)
Z_RANGE = (-19, 5)
WALL_TOP = 9.0  # the enclosure
BACK_TOP = 10.0  # the back wall (z <= DOOR.z)
SPAWN = (7, 2)  # the player's cell; it and its 8 neighbours are height-2 wall
SPAWN_TOP = 2.0
FLOOR_BOX = ((-2, 2), (-15, -9))  # x range, z range: 'floor' at 0 in front of the door
FRAME_COLUMNS = ((-5, DOOR['z']), (-4, DOOR['z']))  # the grey seamed column left of the door (u 546-598)

TOPS = [-1.0] + [float(h) for h in range(0, 10)]
WATER_TOPS = [-1.0, -0.25] + [float(h) for h in range(0, 7)]
FLOOR_TOPS = [-1.0, -0.25, 0.0, 0.5, 1.0, 1.5, 2.0, 3.0]
FRAME_TOPS = [float(h) for h in range(1, 11)]
SLABS = [None, 7.0, 8.0]

EDGE_CAP = 24.0  # px
EDGE_WEIGHT = 0.02  # J per px of mean edge distance
LIGHT_WEIGHT = 0.5 / 7  # the light-openings term, half a class's worth
SMOOTH = 1.5e-5  # J per unit of mean |top - neighbour top|
MIN_GAIN = 1e-6
CHECK_EVERY = 500  # evaluations between full re-derivations of the incremental state

VALID_CLASSES = (GRASS, EARTH, WATER, FLOOR, DOOR_C, FRAME, CEILING)
KIND_NAMES = ['none', 'grass', 'earth', 'water', 'floor', 'door', 'frame', 'ceiling', 'light', 'prop', 'mask']


# ----------------------------------------------------------------------------------------------
# Reference
# ----------------------------------------------------------------------------------------------
def dist_capped(edges):
    """Exact Euclidean distance to the nearest edge pixel, capped at EDGE_CAP (float32)."""
    d = cv2.distanceTransform((~edges).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    return np.minimum(d, EDGE_CAP).astype(np.float32)


def class_boundaries(classes, valid):
    """Boundaries between valid pixels of different classes (marked on the left/upper pixel)."""
    e = np.zeros(classes.shape, bool)
    d = (classes[:, 1:] != classes[:, :-1]) & valid[:, 1:] & valid[:, :-1]
    e[:, :-1] |= d
    d = (classes[1:, :] != classes[:-1, :]) & valid[1:, :] & valid[:-1, :]
    e[:-1, :] |= d
    return e


class Reference:
    def __init__(self, classes_png=REF_CLASSES):
        self.classes = cv2.imread(str(classes_png), cv2.IMREAD_UNCHANGED)
        assert self.classes is not None and self.classes.shape == (H, W), classes_png
        ref = self.classes
        self.valid = np.isin(ref, VALID_CLASSES)
        counts = np.array([(ref[self.valid] == c).sum() for c in range(11)], float)
        self.counts = counts
        w = np.zeros(11)
        for c in VALID_CLASSES:
            w[c] = 1.0 / (len(VALID_CLASSES) * max(counts[c], 1))
        self.weight = (w[ref] * self.valid).astype(np.float64)  # per pixel; sums to 1 over the valid pixels
        self.light = ref == LIGHT
        self.n_light = max(int(self.light.sum()), 1)
        self.edges = class_boundaries(ref, self.valid)
        self.dist = dist_capped(self.edges)
        self.n_edges = max(int(self.edges.sum()), 1)

    def per_class(self, classes):
        """Recall and IoU per class."""
        out = {}
        for c in VALID_CLASSES:
            r = (self.classes == c) & self.valid
            p = (classes == c) & self.valid
            inter = (r & p).sum()
            out[KIND_NAMES[c]] = {'recall': float(inter / max(r.sum(), 1)), 'iou': float(inter / max((r | p).sum(), 1)),
                                  'ref_px': int(r.sum()), 'raster_px': int(p.sum())}
        return out


def roughness(tops, exists):
    t = np.where(exists, tops, np.nan)
    dx = np.abs(np.diff(t, axis=0))
    dz = np.abs(np.diff(t, axis=1))
    return float(np.nanmean(np.concatenate([dx.ravel(), dz.ravel()])))


def _clip(box, pad):
    u0, v0, u1, v1 = box
    return max(u0 - pad, 0), max(v0 - pad, 0), min(u1 + pad, W), min(v1 + pad, H)


def _sub(a, box):
    u0, v0, u1, v1 = box
    return a[v0:v1, u0:u1]


def _rel(inner, outer):
    """inner box as slices relative to outer box."""
    return slice(inner[1] - outer[1], inner[3] - outer[1]), slice(inner[0] - outer[0], inner[2] - outer[0])


class State:
    """The objective's terms for a class map, updated incrementally per window."""

    def __init__(self, ref, classes, rough):
        self.ref = ref
        self.classes = classes.copy()
        self.edges = class_boundaries(classes, ref.valid)
        self.dt = dist_capped(self.edges)
        self.agree = float((ref.weight * (classes == ref.classes)).sum())
        self.r2r = float(self.dt[ref.edges].sum())
        self.n_ras = int(self.edges.sum())
        self.r2f = float(ref.dist[self.edges].sum())
        self.light = int((ref.light & (classes != CEILING)).sum())
        self.rough = rough

    @staticmethod
    def objective(ref, agree, r2r, n_ras, r2f, light, rough):
        ref_to_ras = r2r / ref.n_edges
        ras_to_ref = r2f / n_ras if n_ras else EDGE_CAP
        edge = 0.5 * (ref_to_ras + ras_to_ref)
        light_ok = light / ref.n_light
        J = (1 - agree) + EDGE_WEIGHT * edge + LIGHT_WEIGHT * (1 - light_ok) + SMOOTH * rough
        return {'J': J, 'agreement': agree, 'edge': edge, 'ref_to_ras': ref_to_ras, 'ras_to_ref': ras_to_ref,
                'light_ok': light_ok, 'rough': rough, 'ras_edges': n_ras}

    def score(self):
        return self.objective(self.ref, self.agree, self.r2r, self.n_ras, self.r2f, self.light, self.rough)

    def propose(self, window, cw, rough):
        """The objective after replacing the window's classes by cw; None when nothing changes."""
        ref = self.ref
        old = _sub(self.classes, window)
        if np.array_equal(cw, old):
            if rough == self.rough:
                return None
            return {'window': window, 'cw': None, 'rough': rough,
                    'score': self.objective(ref, self.agree, self.r2r, self.n_ras, self.r2f, self.light, rough)}
        refc = _sub(ref.classes, window)
        d_agree = float((_sub(ref.weight, window) * ((cw == refc).astype(np.float64) - (old == refc))).sum())
        lw = _sub(ref.light, window)
        d_light = int((lw & (cw != CEILING)).sum()) - int((lw & (old != CEILING)).sum())
        cap = int(math.ceil(EDGE_CAP)) + 1
        E = _clip(window, 1)  # where boundaries may change
        A = _clip(E, cap)  # where the capped distance to the raster's boundaries may change
        B = _clip(A, cap)  # computing the distance transform here makes it exact inside A
        cB = _sub(self.classes, B).copy()
        cB[_rel(window, B)] = cw
        eB = _sub(self.edges, B).copy()
        eE = class_boundaries(cB, _sub(ref.valid, B))[_rel(E, B)]
        eB[_rel(E, B)] = eE
        dtA = np.minimum(cv2.distanceTransform((~eB).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE),
                         EDGE_CAP).astype(np.float32)[_rel(A, B)]
        eA = eB[_rel(A, B)]
        refeA = _sub(ref.edges, A)
        d_r2r = float(dtA[refeA].sum()) - float(_sub(self.dt, A)[refeA].sum())
        oldeA = _sub(self.edges, A)
        d_n = int(eA.sum()) - int(oldeA.sum())
        refdA = _sub(ref.dist, A)
        d_r2f = float(refdA[eA].sum()) - float(refdA[oldeA].sum())
        score = self.objective(ref, self.agree + d_agree, self.r2r + d_r2r, self.n_ras + d_n, self.r2f + d_r2f,
                               self.light + d_light, rough)
        return {'window': window, 'cw': cw, 'rough': rough, 'score': score, 'A': A, 'eA': eA, 'dtA': dtA,
                'd': (d_agree, d_r2r, d_n, d_r2f, d_light)}

    def accept(self, p):
        self.rough = p['rough']
        if p['cw'] is None:
            return
        u0, v0, u1, v1 = p['window']
        self.classes[v0:v1, u0:u1] = p['cw']
        u0, v0, u1, v1 = p['A']
        self.edges[v0:v1, u0:u1] = p['eA']
        self.dt[v0:v1, u0:u1] = p['dtA']
        d_agree, d_r2r, d_n, d_r2f, d_light = p['d']
        self.agree += d_agree
        self.r2r += d_r2r
        self.n_ras += d_n
        self.r2f += d_r2f
        self.light += d_light


# ----------------------------------------------------------------------------------------------
# The mutable layout
# ----------------------------------------------------------------------------------------------
class Model:
    """A Layout over the cell box whose arrays are edited in place (top, kind, slab bottom)."""

    def __init__(self, cam_spec):
        self.cam_spec = cam_spec
        self.cam = Camera(cam_spec, W, H)
        self.eye = self.cam.eye
        cells = {(x, z): (SPAWN_TOP, 'wall') for x in range(X_RANGE[0], X_RANGE[1] + 1)
                 for z in range(Z_RANGE[0], Z_RANGE[1] + 1)}
        self.L = Layout(cells, ceiling={}, door=DOOR)
        self.slab_bottom = np.full(self.L.top.shape, np.inf)
        self.R = Rasterizer(cam_spec, W, H, slab_faces='ceiling')
        self.fixed = {}  # (x, z) -> (top, kind) that may not change
        self.fixed_slab = {}
        self.windows = {}

    # -- access
    def ij(self, x, z):
        return x - self.L.x0, z - self.L.z0

    def get(self, x, z):
        i, j = self.ij(x, z)
        return float(self.L.top[i, j]), KINDS[self.L.kind[i, j]]

    def slab(self, x, z):
        i, j = self.ij(x, z)
        b = self.slab_bottom[i, j]
        return None if not np.isfinite(b) else float(b)

    def set(self, x, z, top, kind):
        i, j = self.ij(x, z)
        self.L.top[i, j] = top
        self.L.kind[i, j] = KIND_CODE[kind]
        self.L.slab[i, j] = max(self.slab_bottom[i, j], top)

    def set_slab(self, x, z, bottom):
        i, j = self.ij(x, z)
        self.slab_bottom[i, j] = np.inf if bottom is None else bottom
        self.L.slab[i, j] = max(self.slab_bottom[i, j], self.L.top[i, j])

    def cells(self):
        return [(x, z) for x in range(X_RANGE[0], X_RANGE[1] + 1) for z in range(Z_RANGE[0], Z_RANGE[1] + 1)]

    def inside(self, x, z):
        return X_RANGE[0] <= x <= X_RANGE[1] and Z_RANGE[0] <= z <= Z_RANGE[1]

    def render(self, want_ids=False, window=None):
        return self.R.render(self.L, want_ids=want_ids, window=window)

    def rough(self):
        return roughness(self.L.top, self.L.exists)

    # -- the image window a cell's column can affect (its prism's projection, BOTTOM..SLAB_TOP)
    def window(self, x, z):
        if (x, z) in self.windows:
            return self.windows[(x, z)]
        pts = []
        behind = False
        for cx in (x - 0.5, x + 0.5):
            for cz in (z - 0.5, z + 0.5):
                for cy in (BOTTOM, 10.0):
                    q = self.cam.project([cx, cy, cz])
                    if q is None:
                        behind = True
                    else:
                        pts.append(q)
        if behind or not pts:
            win = (0, 0, W, H) if behind else None
        else:
            p = np.array(pts)
            u0, v0 = np.floor(p.min(0)) - 2
            u1, v1 = np.ceil(p.max(0)) + 3
            u0, v0 = max(int(u0), 0), max(int(v0), 0)
            u1, v1 = min(int(u1), W), min(int(v1), H)
            win = (u0, v0, u1, v1) if (u1 > u0 and v1 > v0) else None
        self.windows[(x, z)] = win
        return win

    # -- (de)serialisation
    def to_json(self, note, extra=None):
        cells = {}
        ceiling = {}
        for (x, z) in self.cells():
            t, k = self.get(x, z)
            cells[f'{x},{z}'] = {'top': int(t) if float(t).is_integer() else t, 'kind': k}
            b = self.slab(x, z)
            if b is not None:
                ceiling[f'{x},{z}'] = int(b)
        obj = {'_': note, 'door': dict(DOOR), 'camera': self.cam_spec}
        if extra:
            obj.update(extra)
        obj['cells'] = cells
        obj['ceiling'] = ceiling
        return obj

    def load(self, obj):
        raw = obj['cells'] if 'cells' in obj else obj
        for key, c in raw.items():
            x, z = (int(v) for v in key.split(','))
            if self.inside(x, z):
                self.set(x, z, float(c['top']), c['kind'])
        for (x, z) in self.cells():
            self.set_slab(x, z, None)
        ceil = obj.get('ceiling') if 'cells' in obj else None
        if ceil is None:
            from raster_layout import ceiling_at
            for (x, z) in self.cells():
                b = ceiling_at(x, z, DOOR['z'])
                if b is not None and f'{x},{z}' in raw:
                    self.set_slab(x, z, float(b))
        else:
            for key, b in ceil.items():
                x, z = (int(v) for v in key.split(','))
                if self.inside(x, z) and b is not None:
                    self.set_slab(x, z, float(b))


# ----------------------------------------------------------------------------------------------
# Constraints and initialisation
# ----------------------------------------------------------------------------------------------
def apply_constraints(M):
    """The hard constraints, as fixed cells."""
    for (x, z) in M.cells():
        if z <= DOOR['z']:
            kind = 'frame' if (x, z) in FRAME_COLUMNS else 'wall'
            M.fixed[(x, z)] = (BACK_TOP, kind)
        elif x <= X_RANGE[0] or x >= X_RANGE[1] or z >= Z_RANGE[1]:
            M.fixed[(x, z)] = (WALL_TOP, 'wall')
    for x in range(FLOOR_BOX[0][0], FLOOR_BOX[0][1] + 1):
        for z in range(FLOOR_BOX[1][0], FLOOR_BOX[1][1] + 1):
            M.fixed[(x, z)] = (0.0, 'floor')
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            M.fixed[(SPAWN[0] + dx, SPAWN[1] + dz)] = (SPAWN_TOP, 'wall')
    for (x, z), (t, k) in M.fixed.items():
        M.set(x, z, t, k)
    # No slab over the back wall's cells (they are solid to 10 anyway).
    for (x, z) in list(M.fixed):
        if z <= DOOR['z']:
            M.fixed_slab[(x, z)] = None


def near_eye(M, x, z):
    """A column within 0.6 of the eye in x and z may not be taller than SPAWN_TOP."""
    ex, _, ez = M.eye
    return abs(x - ex) < 1.1 and abs(z - ez) < 1.1


def backproject_cells(M, mask, y):
    """Cells hit by the rays of the masked pixels on the plane y (Counter)."""
    vs, us = np.nonzero(mask)
    cam = M.cam
    d = cam.R @ np.stack([(us - cam.cx) / cam.f, -(vs - cam.cy) / cam.f, -np.ones(len(us))])
    t = (y - cam.eye[1]) / d[1]
    ok = (t > 0) & (d[1] < 0)
    px = cam.eye[0] + d[0][ok] * t[ok]
    pz = cam.eye[2] + d[2][ok] * t[ok]
    cx = np.round(px).astype(int)
    cz = np.round(pz).astype(int)
    return Counter(zip(cx.tolist(), cz.tolist()))


def flat_guess(M, ref):
    """The initial layout: a flat terrace with the labelled floor and pool back-projected."""
    for (x, z) in M.cells():
        if (x, z) not in M.fixed:
            M.set(x, z, SPAWN_TOP, 'wall')
    # Floor: every floor pixel onto y = 0.
    for (x, z), n in backproject_cells(M, (ref.classes == FLOOR), 0.0).items():
        if n >= 6 and (x, z) not in M.fixed and X_RANGE[0] < x < X_RANGE[1] and Z_RANGE[0] < z < Z_RANGE[1]:
            M.set(x, z, 0.0, 'floor')
    # The pool in the lower left onto y = 0 (the cascade above it is found by the search).
    pool = (ref.classes == WATER)
    pool[:400, :] = False
    for (x, z), n in backproject_cells(M, pool, 0.0).items():
        if n >= 6 and (x, z) not in M.fixed and X_RANGE[0] < x < X_RANGE[1] and Z_RANGE[0] < z < Z_RANGE[1]:
            M.set(x, z, 0.0, 'water')
    # Ceiling: slabs at 8 over the back of the room, like level.js.
    for (x, z) in M.cells():
        M.set_slab(x, z, 8.0 if z <= -6 else None)
    for (x, z), b in M.fixed_slab.items():
        M.set_slab(x, z, b)


# ----------------------------------------------------------------------------------------------
# Search
# ----------------------------------------------------------------------------------------------
class Fitter:
    def __init__(self, M, ref, log=print, quick=False):
        self.M, self.ref, self.log, self.quick = M, ref, log, quick
        self.evals = 0
        self.last_check = 0
        self.state = None
        self.refresh()

    @property
    def cur(self):
        return self.state.classes, self.state.score()

    def refresh(self):
        """Re-derive the incremental state from a full render (and report any drift)."""
        r = self.M.render()
        fresh = State(self.ref, r['classes'], self.M.rough())
        if self.state is not None:
            a, b = self.state.score(), fresh.score()
            drift = abs(a['J'] - b['J'])
            px = int((self.state.classes != fresh.classes).sum())
            if drift > 1e-7 or px:
                self.log(f'  state check: J {a["J"]:.6f} vs fresh {b["J"]:.6f} (drift {drift:.2e}, {px} px differ)')
        self.state = fresh
        return self.cur

    def evaluate(self, window):
        """The objective with the layout as it is now, re-rendered inside window; None if unchanged."""
        self.evals += 1
        if window is None:
            rough = self.M.rough()
            return self.state.propose((0, 0, 1, 1), _sub(self.state.classes, (0, 0, 1, 1)), rough)
        cw = self.M.render(window=window)['classes']
        return self.state.propose(window, cw, self.M.rough())

    def classes_in_window(self, x, z):
        win = self.M.window(x, z)
        if win is None:
            return set()
        sub = _sub(self.ref.classes, win)
        return set(int(c) for c in np.unique(sub))

    def candidates(self, x, z):
        """(top, kind) options for a cell, from the classes its window can show."""
        present = self.classes_in_window(x, z)
        cur_top, cur_kind = self.M.get(x, z)
        tops = TOPS if not self.quick else [-1.0, 0.0, 1.0, 2.0, 3.0, 4.0, 6.0, 9.0]
        opts = [(t, 'wall') for t in tops]
        if WATER in present:
            opts += [(t, 'water') for t in (WATER_TOPS if not self.quick else [-0.25, 0.0, 1.0, 2.0, 3.0])]
        if FLOOR in present:
            opts += [(t, 'floor' if t == 0 else 'step') for t in (FLOOR_TOPS if not self.quick else [0.0, 0.5, 1.0])]
        if FRAME in present or DOOR_C in present:
            opts += [(t, 'frame') for t in (FRAME_TOPS if not self.quick else [4.0, 7.0, 10.0])]
        if near_eye(self.M, x, z):
            opts = [(t, k) for t, k in opts if t <= SPAWN_TOP]
        opts = [(t, k) for t, k in opts if (t, k) != (cur_top, cur_kind)]
        return opts

    def hidden(self, x, z):
        """True when the column at its extremes changes nothing on screen."""
        t, k = self.M.get(x, z)
        win = self.M.window(x, z)
        for ext in ((WALL_TOP, 'wall'), (-1.0, 'wall')):
            if ext == (t, k):
                continue
            self.M.set(x, z, *ext)
            p = self.evaluate(win)
            self.M.set(x, z, t, k)
            if p is not None and p['cw'] is not None:
                return False
        return True

    def try_cell(self, x, z):
        """Coordinate step on one cell's (top, kind), then on its slab. Returns True on a change."""
        win = self.M.window(x, z)
        changed = False
        if (x, z) not in self.M.fixed:
            t0, k0 = self.M.get(x, z)
            best, best_p = self.state.score()['J'], None
            for (t, k) in self.candidates(x, z):
                self.M.set(x, z, t, k)
                p = self.evaluate(win)
                if p is not None and p['score']['J'] < best - MIN_GAIN:
                    best, best_p = p['score']['J'], (t, k, p)
            if best_p is None:
                self.M.set(x, z, t0, k0)
            else:
                t, k, p = best_p
                self.M.set(x, z, t, k)
                self.state.accept(p)
                changed = True
        return self.try_slab(x, z) or changed

    def try_slab(self, x, z):
        if (x, z) in self.M.fixed_slab:
            return False
        win = self.M.window(x, z)
        b0 = self.M.slab(x, z)
        best, best_p = self.state.score()['J'], None
        for b in SLABS:
            if b == b0:
                continue
            self.M.set_slab(x, z, b)
            p = self.evaluate(win)
            if p is not None and p['score']['J'] < best - MIN_GAIN:
                best, best_p = p['score']['J'], (b, p)
        if best_p is None:
            self.M.set_slab(x, z, b0)
            return False
        self.M.set_slab(x, z, best_p[0])
        self.state.accept(best_p[1])
        return True

    def ordered_cells(self):
        ex, _, ez = self.M.eye
        cells = [c for c in self.M.cells() if self.M.window(*c) is not None]
        cells.sort(key=lambda c: math.hypot(c[0] - ex, c[1] - ez))
        return cells

    def sweep(self, n):
        t0 = time.perf_counter()
        changed = skipped = 0
        cells = self.ordered_cells()
        for idx, (x, z) in enumerate(cells):
            if (x, z) in self.M.fixed and (x, z) in self.M.fixed_slab:
                continue
            if (x, z) not in self.M.fixed and self.hidden(x, z):
                skipped += 1
                continue
            if self.try_cell(x, z):
                changed += 1
            if self.evals - self.last_check >= CHECK_EVERY:  # between cells: the layout is the accepted one
                self.last_check = self.evals
                self.refresh()
            if (idx + 1) % 100 == 0:
                s = self.state.score()
                self.log(f'  sweep {n}: {idx + 1}/{len(cells)} cells, J {s["J"]:.5f} agree {s["agreement"]:.4f} '
                         f'edge {s["edge"]:.2f} changed {changed} hidden {skipped} ({time.perf_counter() - t0:.0f} s)')
        s = self.refresh()[1]
        self.log(f'sweep {n} done: J {s["J"]:.5f} agree {s["agreement"]:.4f} edge {s["edge"]:.2f} light {s["light_ok"]:.3f} '
                 f'changed {changed} hidden {skipped} evals {self.evals} ({time.perf_counter() - t0:.0f} s)')
        return changed

    def disagreeing_cells(self, min_px=40):
        """Cells whose visible pixels disagree with the reference, with the count."""
        r = self.M.render(want_ids=True)
        cell = r['cell']
        bad = self.ref.valid & (r['classes'] != self.ref.classes)
        keys = cell[bad]
        counts = Counter(map(tuple, keys.tolist()))
        return {k: n for k, n in counts.items() if n >= min_px and k[0] > -32768}

    @staticmethod
    def union(a, b):
        if a is None:
            return b
        if b is None:
            return a
        return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])

    def pairs(self, budget_s=600):
        """Joint moves of a disagreeing cell and each 4-neighbour."""
        t0 = time.perf_counter()
        bad = self.disagreeing_cells()
        order = sorted(bad.items(), key=lambda kv: -kv[1])
        self.log(f'pairs: {len(order)} disagreeing cells')
        changed = 0
        for (x, z), n in order:
            if time.perf_counter() - t0 > budget_s:
                self.log('pairs: budget spent')
                break
            if (x, z) in self.M.fixed:
                continue
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nb = (x + dx, z + dz)
                if nb in self.M.fixed or not self.M.inside(*nb):
                    continue
                win = self.union(self.M.window(x, z), self.M.window(*nb))
                t0c, k0c = self.M.get(x, z)
                t0n, k0n = self.M.get(*nb)
                best, best_move = self.state.score()['J'], None
                nb_tops = sorted({max(-1.0, min(9.0, t0n + d)) for d in (-3, -2, -1, 1, 2, 3)})
                if near_eye(self.M, *nb):
                    nb_tops = [t for t in nb_tops if t <= SPAWN_TOP]
                for tn in nb_tops:
                    self.M.set(*nb, tn, k0n)
                    for (t, k) in self.candidates(x, z) + [(t0c, k0c)]:
                        self.M.set(x, z, t, k)
                        p = self.evaluate(win)
                        if p is not None and p['score']['J'] < best - MIN_GAIN:
                            best, best_move = p['score']['J'], (t, k, tn, p)
                if best_move is None:
                    self.M.set(x, z, t0c, k0c)
                    self.M.set(*nb, t0n, k0n)
                else:
                    t, k, tn, p = best_move
                    self.M.set(x, z, t, k)
                    self.M.set(*nb, tn, k0n)
                    self.state.accept(p)
                    changed += 1
                    self.log(f'  pair ({x},{z})+({nb[0]},{nb[1]}): -> {t:g} {k} / {tn:g}, J {best:.5f}')
        s = self.refresh()[1]
        self.log(f'pairs done: J {s["J"]:.5f} agree {s["agreement"]:.4f} edge {s["edge"]:.2f} changed {changed} '
                 f'({time.perf_counter() - t0:.0f} s)')
        return changed

    def fill_hidden(self):
        """Cells that never show give the game sane terrain: the median of their decided neighbours."""
        r = self.M.render(want_ids=True)
        seen = set(map(tuple, np.unique(r['cell'].reshape(-1, 2), axis=0).tolist()))
        decided = set(seen) | set(self.M.fixed)
        n = 0
        for _ in range(40):
            progress = False
            for (x, z) in self.M.cells():
                if (x, z) in decided:
                    continue
                nb = [self.M.get(x + dx, z + dz)[0] for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1))
                      if (x + dx, z + dz) in decided]
                if len(nb) >= 2:
                    t = float(np.round(np.median(nb)))
                    if near_eye(self.M, x, z):
                        t = min(t, SPAWN_TOP)
                    self.M.set(x, z, t, 'wall')
                    decided.add((x, z))
                    progress = True
                    n += 1
            if not progress:
                break
        self.refresh()
        return n


# ----------------------------------------------------------------------------------------------
# Report
# ----------------------------------------------------------------------------------------------
def histogram(M):
    kinds = Counter()
    tops = Counter()
    for (x, z) in M.cells():
        t, k = M.get(x, z)
        kinds[k] += 1
        tops[t] += 1
    return dict(kinds), {str(k): v for k, v in sorted(tops.items())}


def disagreement_regions(ref, classes, min_area=400):
    """Connected regions of valid pixels where the raster's class is wrong: boxes with the two classes."""
    bad = (ref.valid & (classes != ref.classes)).astype(np.uint8)
    bad = cv2.morphologyEx(bad, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bad, connectivity=8)
    regions = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        m = lab == i
        want = Counter(ref.classes[m].tolist()).most_common(1)[0][0]
        got = Counter(classes[m].tolist()).most_common(1)[0][0]
        regions.append({'box': [int(x), int(y), int(x + w), int(y + h)], 'area': int(area),
                        'reference': KIND_NAMES[want], 'raster': KIND_NAMES[got]})
    regions.sort(key=lambda r: -r['area'])
    return regions


def report_image(ref, classes, path, regions=None):
    rgb = np.asarray(Image.open(REFERENCE).convert('RGB').resize((W, H)))
    ref_prev = PREVIEW_RGB[ref.classes]
    ras_prev = preview(classes, class_edges(classes))
    over = rgb.copy()
    e = cv2.dilate(class_edges(classes).astype(np.uint8), np.ones((2, 2), np.uint8)) > 0
    over[e] = (0, 220, 255)
    bad = ref.valid & (classes != ref.classes)
    over[bad] = (over[bad] * 0.55 + np.array([255, 40, 40]) * 0.45).astype(np.uint8)
    over = Image.fromarray(over)
    if regions:
        d = ImageDraw.Draw(over)
        for r in regions[:12]:
            x0, y0, x1, y1 = r['box']
            d.rectangle([x0, y0, x1, y1], outline=(255, 255, 0), width=1)
            d.text((x0 + 2, y0 + 1), f"{r['reference']}>{r['raster']}", fill=(255, 255, 0))
    board = Image.new('RGB', (W * 2 + 8, H * 2 + 8), (30, 30, 30))
    for k, img in enumerate([Image.fromarray(rgb), Image.fromarray(ref_prev), Image.fromarray(ras_prev), over]):
        board.paste(img, ((k % 2) * (W + 8), (k // 2) * (H + 8)))
    board.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'src/cave/layout.json'))
    ap.add_argument('--scratch', default=str(ROOT / 'docs/reference'))
    ap.add_argument('--init', default=None, help='start from this layout JSON instead of the flat guess')
    ap.add_argument('--eval', default=None, help='only score this layout JSON and write its report')
    ap.add_argument('--max-sweeps', type=int, default=6)
    ap.add_argument('--no-pairs', action='store_true')
    ap.add_argument('--pair-budget', type=float, default=600)
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--tag', default='fit')
    args = ap.parse_args()
    scratch = Path(args.scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    log_path = scratch / f'{args.tag}.log'
    log_f = open(log_path, 'a')

    def log(msg):
        print(msg, flush=True)
        log_f.write(msg + '\n')
        log_f.flush()

    ref = Reference()
    cam = json.load(open(CAMERA))
    M = Model(cam)
    apply_constraints(M)

    if args.eval:
        M.load(json.load(open(args.eval)))
        fit = Fitter(M, ref, log)
        classes, s = fit.cur
        regions = disagreement_regions(ref, classes)
        log(json.dumps({'eval': args.eval, **{k: round(v, 5) for k, v in s.items()}}))
        log(json.dumps(ref.per_class(classes)))
        report_image(ref, classes, scratch / f'{args.tag}-report.png', regions)
        for r in regions[:20]:
            log(f"  {r['box']} {r['area']} px: reference {r['reference']}, raster {r['raster']}")
        return

    if args.init:
        M.load(json.load(open(args.init)))
        for (x, z), (t, k) in M.fixed.items():
            M.set(x, z, t, k)
        for (x, z), b in M.fixed_slab.items():
            M.set_slab(x, z, b)
    else:
        flat_guess(M, ref)
    fit = Fitter(M, ref, log, quick=args.quick)
    before = dict(fit.cur[1])
    log('before: ' + json.dumps({k: round(v, 5) for k, v in before.items()}))
    report_image(ref, fit.cur[0], scratch / f'{args.tag}-before.png')

    for n in range(1, args.max_sweeps + 1):
        changed = fit.sweep(n)
        json.dump(M.to_json('work in progress'), open(scratch / f'{args.tag}-sweep{n}.json', 'w'))
        if changed == 0:
            break
    if not args.no_pairs:
        fit.pairs(args.pair_budget)
        fit.sweep(args.max_sweeps + 1)
    filled = fit.fill_hidden()
    log(f'filled {filled} hidden cells')
    classes, after = fit.cur
    after = dict(after)
    log('after: ' + json.dumps({k: round(v, 5) for k, v in after.items()}))
    per_class = ref.per_class(classes)
    log(json.dumps(per_class))
    kinds, tops = histogram(M)
    log(f'kinds {kinds}')
    log(f'tops {tops}')
    regions = disagreement_regions(ref, classes)
    for r in regions[:20]:
        log(f"  {r['box']} {r['area']} px: reference {r['reference']}, raster {r['raster']}")

    note = ('Block layout of the cave fitted to docs/reference/cave-door.jpg by scripts/fp/fit_layout.py: per '
            'cell "x,z" the column top (y of its walkable surface; solid from y = -2) and kind (wall = pink earth '
            'with a grass blanket on open tops, water, floor / step = pale stone, frame = grey seamed stone), '
            '"ceiling" the slab bottoms (slabs reach y = 10), "door" as level.js DOOR. Fitted under the reference '
            'camera (docs/reference/cave-door-camera.json) against the class map docs/reference/cave-door-classes.png.')
    out = M.to_json(note, {'metrics': {'before': before, 'after': after, 'per_class': per_class},
                           'kinds': kinds, 'tops': tops})
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(args.out, 'w'), indent=0)
    report_image(ref, classes, scratch / f'{args.tag}-report.png', regions)
    cv2.imwrite(str(scratch / f'{args.tag}-classes.png'), classes)
    json.dump({'before': before, 'after': after, 'per_class': per_class, 'kinds': kinds, 'tops': tops,
               'regions': regions, 'evals': fit.evals}, open(scratch / f'{args.tag}-metrics.json', 'w'), indent=1)
    log(f'wrote {args.out} and {scratch / (args.tag + "-report.png")}')


if __name__ == '__main__':
    main()
