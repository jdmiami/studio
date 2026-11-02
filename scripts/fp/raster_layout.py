#!/usr/bin/env python3
"""Fast class-map rasterizer of a block layout under a camera.

Draws the cave's block world (src/cave/level.js conventions: a column (x, z) with top h is solid
from y = -2 to h and fills [x-0.5, x+0.5] x [z-0.5, z+0.5]; ceiling slabs hang from y = 10 down to
their bottom) as a label image, by a painter's algorithm: cells sorted by Manhattan distance from
the eye, far to near; each cell draws its column top, the side faces that face the eye (only their
exposed part, above the neighbouring column), its ceiling slab's underside and exposed slab faces.
For axis-aligned cells a cell can only hide one that is farther in both x and z, so the Manhattan
order is exact. Quads are clipped against the near plane before projection with the Camera of
scripts/fp/trace_blocks.py (three.js conventions, 0.1 px).

Class ids (shared with the segmentation job): 0 none/sky, 1 grass (open tops of 'wall' columns and
the top HEM of their exposed faces, where the felt blanket hangs), 2 earth (the rest of the wall
faces, enclosure walls), 3 water (tops and faces of 'water' and 'stream'), 4 floor (tops of 'floor'
and 'step' and their top block's faces), 5 door (the opening x xMin-0.5..xMax+0.5, y 0..height on
the back wall's front face), 6 frame (the door posts, lintel and pillar, or any 'frame' column),
7 ceiling (slab undersides, and slab side faces unless --slab-faces earth), 8 light, 9 prop and
10 mask (reserved, never drawn here).

Usage:
  raster_layout.py layout.json --camera cam.json [--size 1024x572] [--out dir] [--prefix name]
    [--slab-faces ceiling|earth] [--bench N]
    layout.json: {"cells": {"x,z": {"top": h, "kind": k}}, "ceiling": {"x,z": bottom},
                  "door": {"z", "xMin", "xMax", "height"}} or just the plain {"x,z": {top, kind}}
                  that --dump=__phluphLayout prints (ceiling then from level.js's ceilingAt rule,
                  door from DOOR). Fractional tops are fine (the pool at -0.25, the half step).
    cam.json: {"fov", "yaw", "pitch", "roll", "eye"} (docs/reference/cave-door-camera.json).
Writes <out>/<prefix>classes.png (uint8 labels), <prefix>depth.npy (float32, the quad's centre
distance along the view axis in world units, inf where nothing is drawn), <prefix>edges.png (class
boundaries, white) and <prefix>preview.png, and prints the render time.

As a module: Rasterizer(cam_spec, w, h).render(load_layout(obj)) -> {'classes', 'depth'}; about
10 ms for the cave's 480 columns (scripts/fp/raster_check.py is the acceptance test against the
game's own render: IoU 0.84-0.92 for grass, water, floor, 0.87 for the pink felt).

Limits: blocks are exact cubes (the kit's rounded edges, the blanket's 0.08 overhang and 0.065
lift are not modelled: 1-6 px at the usual distances); the hem is a flat band of HEM, not
scalloped; the door opening's reveal and threshold are not drawn (the door leaf nearly fills them);
columns are solid from BOTTOM, so an eye inside a column sees through it (the game shows the far
faces of exposed cubes); the back-wall partition around the door ignores a grass hem on those
cells; classes 8-10 are never drawn.
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trace_blocks import Camera  # noqa: E402

CLASSES = ['none', 'grass', 'earth', 'water', 'floor', 'door', 'frame', 'ceiling', 'light', 'prop', 'mask']
NONE, GRASS, EARTH, WATER, FLOOR, DOOR_C, FRAME, CEILING, LIGHT, PROP, MASK = range(11)
PREVIEW_RGB = np.array([
    [236, 232, 226], [152, 196, 112], [226, 180, 170], [118, 170, 214], [246, 238, 222], [96, 92, 90],
    [172, 168, 162], [204, 136, 128], [255, 226, 160], [190, 110, 200], [60, 60, 60],
], np.uint8)

KINDS = ['wall', 'water', 'stream', 'floor', 'step', 'frame', 'door', 'ceiling']
K_WALL, K_WATER, K_STREAM, K_FLOOR, K_STEP, K_FRAME, K_DOOR, K_CEILING = range(8)
KIND_CODE = {k: i for i, k in enumerate(KINDS)}
# Class of a column's top and of its top block's faces, per kind (walls: grass or earth, see below).
KIND_CLASS = np.array([EARTH, WATER, WATER, FLOOR, FLOOR, FRAME, DOOR_C, CEILING], np.uint8)

HEM = 0.27  # the grass blanket's hem hangs this far down an exposed wall face (src/cave/grass.js)
HEM_CLEAR = 0.14  # ... but never closer than this to the lower neighbour's top
BOTTOM = -2.0  # columns are solid from here up
SLAB_TOP = 10.0  # ceiling slabs reach up to here
GRASS_MAX_TOP = 9  # level.js: only wall tops at y < 9 (block y < 9) carry grass
NEAR = 0.05  # camera-space near plane (depth along the view axis)
SHIFT = 4  # fillPoly fixed-point bits
DOOR = {'z': -16, 'xMin': -2, 'xMax': 2, 'height': 6}
DEFAULT_CAMERA = {'fov': 58.3, 'yaw': 0.0, 'pitch': math.degrees(-0.1), 'roll': 0.0, 'eye': [-5.5, 2.6, -1.5]}


def ceiling_at(x, z, door_z=-16):
    """level.js's ceilingAt: slab bottom at (x, z) or None."""
    if (-1 <= x <= 1 and -14 <= z <= -12) or (-12 <= x <= -10 and -9 <= z <= -7):
        return None
    if z <= -6 and z > door_z:
        return None if ((x * 7 + z) % 4 == 0 and z == -6) else 8
    if x <= -10 and z <= -2:
        return 7
    return None


class Layout:
    """Cells as padded grids: top (BOTTOM where there is no column), kind code, slab bottom
    (inf where there is no ceiling slab; max(bottom, top) otherwise), exists."""

    def __init__(self, cells, ceiling=None, door=None):
        self.door = dict(DOOR, **(door or {}))
        xs = [x for x, _ in cells]
        zs = [z for _, z in cells]
        self.x0, self.z0 = min(xs) - 1, min(zs) - 1
        nx, nz = max(xs) - min(xs) + 3, max(zs) - min(zs) + 3
        self.exists = np.zeros((nx, nz), bool)
        self.top = np.full((nx, nz), BOTTOM)
        self.kind = np.zeros((nx, nz), np.int8)
        self.slab = np.full((nx, nz), np.inf)
        for (x, z), (t, k) in cells.items():
            i, j = x - self.x0, z - self.z0
            self.exists[i, j] = True
            self.top[i, j] = t
            self.kind[i, j] = KIND_CODE.get(k, K_WALL)
        if ceiling is None:
            ceiling = {(x, z): b for (x, z) in cells if (b := ceiling_at(x, z, self.door['z'])) is not None}
        for (x, z), b in ceiling.items():
            i, j = x - self.x0, z - self.z0
            if 0 <= i < nx and 0 <= j < nz and self.exists[i, j]:
                self.slab[i, j] = max(b, self.top[i, j])

    def cell(self, x, z):
        i, j = x - self.x0, z - self.z0
        if not (0 <= i < self.top.shape[0] and 0 <= j < self.top.shape[1]):
            return None
        return i, j


def load_layout(obj):
    """A Layout from a parsed JSON object (either form) or a path."""
    if isinstance(obj, (str, Path)):
        obj = json.load(open(obj))
    if 'cells' in obj:
        raw, ceil_raw, door = obj['cells'], obj.get('ceiling'), obj.get('door')
    else:
        raw, ceil_raw, door = obj, None, None
    cells = {tuple(int(v) for v in k.split(',')): (float(c['top']), c['kind']) for k, c in raw.items()}
    ceiling = None
    if ceil_raw is not None:
        ceiling = {tuple(int(v) for v in k.split(',')): float(b) for k, b in ceil_raw.items() if b is not None}
    return Layout(cells, ceiling, door)


def _quad_x(xp, za, zb, ya, yb):
    """Vertical quads in the plane x = xp spanning z [za, zb], y [ya, yb] (arrays) -> (n, 4, 3)."""
    return np.stack([np.stack([xp, ya, za], -1), np.stack([xp, ya, zb], -1),
                     np.stack([xp, yb, zb], -1), np.stack([xp, yb, za], -1)], 1)


def _quad_z(zp, xa, xb, ya, yb):
    return np.stack([np.stack([xa, ya, zp], -1), np.stack([xb, ya, zp], -1),
                     np.stack([xb, yb, zp], -1), np.stack([xa, yb, zp], -1)], 1)


def _quad_y(yp, xa, xb, za, zb):
    return np.stack([np.stack([xa, yp, za], -1), np.stack([xb, yp, za], -1),
                     np.stack([xb, yp, zb], -1), np.stack([xa, yp, zb], -1)], 1)


class Rasterizer:
    def __init__(self, cam_spec, width=1024, height=572, slab_faces='ceiling'):
        self.cam = Camera(cam_spec, width, height)
        self.w, self.h = width, height
        self.eye = self.cam.eye
        self.slab_face_class = CEILING if slab_faces == 'ceiling' else EARTH

    # --- geometry -------------------------------------------------------------------------------
    def quads(self, L):
        """All quads to draw: (P (n, 4, 3) world corners, cls (n,), key (n,) painter's sort key)."""
        ex, ey, ez = self.eye
        nx, nz = L.top.shape
        xs = np.arange(L.x0, L.x0 + nx, dtype=float)
        zs = np.arange(L.z0, L.z0 + nz, dtype=float)
        X, Z = np.meshgrid(xs, zs, indexing='ij')
        top, kind, slab, exists = L.top, L.kind, L.slab, L.exists
        grass = (kind == K_WALL) & (top <= GRASS_MAX_TOP) & (slab > top) & exists
        top_class = np.where(grass, GRASS, KIND_CLASS[kind]).astype(np.uint8)
        # The faces' split: the top block ('floor', 'step', 'stream') or the hem ('wall' with grass)
        # gets the kind's class; the rest of an exposed face is earth. 'water', 'frame', 'door' and
        # 'ceiling' columns are one class down to the ground.
        split_block = np.isin(kind, [K_FLOOR, K_STEP, K_STREAM])
        manhattan = np.abs(X - ex) + np.abs(Z - ez)
        d = L.door
        # The back wall's front face around the door is partitioned by hand below (door, posts,
        # lintel, pillar), so the vectorised +z pass leaves those cells out.
        door_row = (Z == d['z']) & (X >= d['xMin'] - 1) & (X <= d['xMax'] + 2)
        out_P, out_c, out_k, out_xz = [], [], [], []

        def emit(P, c, key, cx=None, cz=None):
            if len(P):
                out_P.append(P)
                out_c.append(np.broadcast_to(c, (len(P),)).astype(np.uint8))
                out_k.append(key)
                out_xz.append(np.stack([np.broadcast_to(cx, (len(P),)), np.broadcast_to(cz, (len(P),))], 1))

        # Column tops (below the eye) and slab undersides (above it).
        m = exists & (top < ey)
        emit(_quad_y(top[m], X[m] - 0.5, X[m] + 0.5, Z[m] - 0.5, Z[m] + 0.5), top_class[m], manhattan[m], X[m], Z[m])
        m = np.isfinite(slab) & (top < slab) & (slab > ey)
        emit(_quad_y(slab[m], X[m] - 0.5, X[m] + 0.5, Z[m] - 0.5, Z[m] + 0.5), CEILING, manhattan[m], X[m], Z[m])

        # Side faces, per direction: the strip above the neighbour's top and below its slab.
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb_top = np.roll(top, (-di, -dj), (0, 1))
            nb_slab = np.roll(slab, (-di, -dj), (0, 1))
            if di:
                faces = (ex > X + 0.5) if di > 0 else (ex < X - 0.5)
            else:
                faces = (ez > Z + 0.5) if dj > 0 else (ez < Z - 0.5)
            faces = faces & exists
            faces[0, :] = faces[-1, :] = faces[:, 0] = faces[:, -1] = False  # padding (np.roll wraps)
            y0 = nb_top
            y1 = np.minimum(top, nb_slab)
            m = faces & (y1 > y0 + 1e-9)
            if dj > 0:
                m &= ~door_row
            if m.any():
                t, a, b = top[m], y0[m], y1[m]
                hem = np.maximum(t - HEM, a + HEM_CLEAR)
                ua = np.where(grass[m], hem, np.where(split_block[m], np.maximum(t - 1, a), a))
                upper_class = top_class[m]
                self._emit_faces(emit, di, dj, X[m], Z[m], manhattan[m], ua, b, upper_class)
                lo = ua > a + 1e-9
                self._emit_faces(emit, di, dj, X[m][lo], Z[m][lo], manhattan[m][lo], a[lo], np.minimum(ua, b)[lo], EARTH)
            # Slab faces: from the slab's bottom (or the neighbour's top) up to the neighbour's slab.
            y0 = np.maximum(slab, nb_top)
            y1 = np.minimum(SLAB_TOP, nb_slab)
            m = faces & np.isfinite(slab) & (y1 > y0 + 1e-9)
            if m.any():
                self._emit_faces(emit, di, dj, X[m], Z[m], manhattan[m], y0[m], y1[m], self.slab_face_class)

        # The back wall's front face around the door (level.js isFrame): the door opening, the posts
        # and lintel, the pillar, earth elsewhere, as one partition of the exposed face (strips that
        # overlap would leave seams: fillPoly's boundary pixels depend on the edge's endpoints).
        zc, hgt = d['z'], d['height']
        if ez > zc + 0.5:
            for x in range(d['xMin'] - 1, d['xMax'] + 3):
                ij = L.cell(x, zc)
                if ij is None or not exists[ij] or ij[1] + 1 >= nz:
                    continue
                i, j = ij
                a = top[i, j + 1]
                b = min(top[i, j], slab[i, j + 1])
                if b <= a:
                    continue
                if x in (d['xMin'] - 1, d['xMax'] + 1):
                    cuts = [(BOTTOM, EARTH), (BOTTOM, FRAME), (hgt + 1, EARTH)]
                elif x == d['xMax'] + 2:
                    cuts = [(BOTTOM, FRAME), (hgt + 3, EARTH)]
                else:
                    cuts = [(BOTTOM, EARTH), (0.0, DOOR_C), (hgt, FRAME), (hgt + 1, EARTH)]
                for n_, (ya, c) in enumerate(cuts):
                    yb = cuts[n_ + 1][0] if n_ + 1 < len(cuts) else SLAB_TOP
                    ya, yb = max(ya, a), min(yb, b)
                    if yb > ya:
                        emit(_quad_z(np.array([zc + 0.5]), np.array([x - 0.5]), np.array([x + 0.5]), np.array([ya]), np.array([yb])),
                             c, np.array([abs(x - ex) + abs(zc - ez)]), float(x), float(zc))
        if not out_P:
            self.quad_cells = np.zeros((0, 2))
            return np.zeros((0, 4, 3)), np.zeros(0, np.uint8), np.zeros(0)
        self.quad_cells = np.concatenate(out_xz)  # (n, 2): the cell (x, z) each quad belongs to
        return np.concatenate(out_P), np.concatenate(out_c), np.concatenate(out_k)

    @staticmethod
    def _emit_faces(emit, di, dj, X, Z, key, ya, yb, cls):
        if di:
            P = _quad_x(X + 0.5 * di, Z - 0.5, Z + 0.5, ya, yb)
        else:
            P = _quad_z(Z + 0.5 * dj, X - 0.5, X + 0.5, ya, yb)
        emit(P, cls, key, X, Z)

    # --- projection -----------------------------------------------------------------------------
    def project(self, C):
        """Camera-space points (..., 3) with z < 0 -> pixel (u, v); the Camera's formula, vectorised."""
        d = -C[..., 2]
        return np.stack([self.cam.cx + self.cam.f * C[..., 0] / d, self.cam.cy - self.cam.f * C[..., 1] / d], -1)

    def _clip_near(self, C):
        """Sutherland-Hodgman against the near plane z = -NEAR (keep z <= -NEAR): (k, 3)."""
        out = []
        n = len(C)
        for i in range(n):
            a, b = C[i], C[(i + 1) % n]
            ina, inb = a[2] <= -NEAR, b[2] <= -NEAR
            if ina:
                out.append(a)
            if ina != inb:
                t = (-NEAR - a[2]) / (b[2] - a[2])
                out.append(a + t * (b - a))
        return np.array(out)

    def render(self, L, want_ids=False, window=None):
        """Rasterizes a Layout: {'classes': uint8 (h, w), 'depth': float32 (h, w), 'quads': n}; with
        want_ids also 'ids' (uint16, quad index + 1 per pixel, 0 = nothing) and 'cell' (int16
        (h, w, 2): the cell (x, z) whose quad each pixel shows, -32768 where nothing is drawn).
        With window = (u0, v0, u1, v1) the arrays are that pixel box only and the quads whose
        bounding box misses it are skipped; the pixels equal the full render's crop exactly (the
        drawing still happens in a full-size buffer, because fillPoly re-clips edges that leave
        the image to integer endpoints, so its boundary pixels depend on the image bounds)."""
        P, cls, key = self.quads(L)
        n = len(P)
        h, w = self.h, self.w
        if window is None:
            u0, v0, u1, v1 = 0, 0, w, h
        else:
            u0, v0, u1, v1 = window
        ids = np.zeros((h, w), np.uint16)
        if n == 0:
            ids = ids[v0:v1, u0:u1]
            out = {'classes': ids.astype(np.uint8), 'depth': np.full(ids.shape, np.inf, np.float32), 'quads': 0}
            if want_ids:
                out['ids'] = ids
                out['cell'] = np.full(ids.shape + (2,), -32768, np.int16)
            return out
        assert n < 65535, f'{n} quads'
        C = (P - self.eye) @ self.cam.R  # world -> camera (R is local -> world)
        front = C[..., 2] <= -NEAR
        n_front = front.sum(1)
        whole = n_front == 4
        mixed = (n_front > 0) & ~whole
        # Whole quads: project all at once; cull those entirely off screen (convex, so a bounding
        # box test is exact).
        uv = np.zeros((n, 4, 2))
        uv[whole] = self.project(C[whole])
        lo, hi = uv.min(1), uv.max(1)
        visible = whole & (hi[:, 0] >= u0) & (lo[:, 0] <= u1) & (hi[:, 1] >= v0) & (lo[:, 1] <= v1)
        pts = np.rint(uv * (1 << SHIFT)).astype(np.int32)
        depth = np.full(n, np.inf)
        depth[whole] = -C[whole, :, 2].mean(1)
        order = np.argsort(-key, kind='stable')
        fill = cv2.fillPoly
        scale = float(1 << SHIFT)
        for k in order:
            k = int(k)
            if visible[k]:
                fill(ids, [pts[k]], k + 1, cv2.LINE_8, SHIFT)
            elif mixed[k]:
                poly = self._clip_near(C[k])
                if len(poly) < 3:
                    continue
                q = self.project(poly)
                if q[:, 0].max() < u0 or q[:, 0].min() > u1 or q[:, 1].max() < v0 or q[:, 1].min() > v1:
                    continue
                depth[k] = -poly[:, 2].mean()
                fill(ids, [np.rint(q * scale).astype(np.int32)], k + 1, cv2.LINE_8, SHIFT)
        if window is not None:
            ids = ids[v0:v1, u0:u1]
        cls_lut = np.concatenate([[NONE], cls]).astype(np.uint8)
        depth_lut = np.concatenate([[np.inf], depth]).astype(np.float32)
        out = {'classes': cls_lut[ids], 'depth': depth_lut[ids], 'quads': n}
        if want_ids:
            out['ids'] = ids
            cell_lut = np.concatenate([[[-32768, -32768]], self.quad_cells]).astype(np.int16)
            out['cell'] = cell_lut[ids]
        return out


def class_edges(classes):
    """Class boundaries (a pixel whose right or lower neighbour has another class)."""
    e = np.zeros(classes.shape, bool)
    e[:, :-1] |= classes[:, 1:] != classes[:, :-1]
    e[:-1, :] |= classes[1:, :] != classes[:-1, :]
    return e


def preview(classes, edges=None):
    img = PREVIEW_RGB[classes].copy()
    if edges is not None:
        img[edges] = (img[edges] * 0.45).astype(np.uint8)
    return img


def load_camera(spec):
    if spec in (None, 'default'):
        return dict(DEFAULT_CAMERA)
    if isinstance(spec, (str, Path)):
        return json.load(open(spec))
    return spec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('layout')
    ap.add_argument('--camera', default='default', help='camera JSON, or "default" for the spawn pose')
    ap.add_argument('--size', default='1024x572')
    ap.add_argument('--out', default=None, help='output directory (default: beside the layout)')
    ap.add_argument('--prefix', default='raster-')
    ap.add_argument('--slab-faces', choices=['ceiling', 'earth'], default='ceiling')
    ap.add_argument('--bench', type=int, default=0, help='also time N repeated renders')
    args = ap.parse_args()
    w, h = map(int, args.size.split('x'))
    out = Path(args.out or Path(args.layout).parent)
    out.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()
    L = load_layout(args.layout)
    t1 = time.perf_counter()
    R = Rasterizer(load_camera(args.camera), w, h, slab_faces=args.slab_faces)
    # Projection self-check against the Camera's own (per-point) formula.
    probe = np.array([[0.5, 1.0, -3.5], [-2.5, 0.0, -15.5], [3.5, 8.0, -9.5]])
    for p in probe:
        q = R.cam.project(p)
        if q is not None:
            assert np.allclose(R.project(((p - R.eye) @ R.cam.R)[None])[0], q, atol=1e-6)
    t2 = time.perf_counter()
    res = R.render(L)
    t3 = time.perf_counter()
    print(f'load {1e3 * (t1 - t0):.1f} ms, render {1e3 * (t3 - t2):.1f} ms ({res["quads"]} quads, '
          f'{int(L.exists.sum())} columns, {w}x{h})')
    if args.bench:
        ts = []
        for _ in range(args.bench):
            a = time.perf_counter()
            R.render(L)
            ts.append(time.perf_counter() - a)
        print(f'bench {args.bench} renders: mean {1e3 * np.mean(ts):.1f} ms, min {1e3 * np.min(ts):.1f} ms, '
              f'max {1e3 * np.max(ts):.1f} ms')
    classes = res['classes']
    edges = class_edges(classes)
    cv2.imwrite(str(out / f'{args.prefix}classes.png'), classes)
    np.save(out / f'{args.prefix}depth.npy', res['depth'])
    cv2.imwrite(str(out / f'{args.prefix}edges.png'), (edges * 255).astype(np.uint8))
    cv2.imwrite(str(out / f'{args.prefix}preview.png'), cv2.cvtColor(preview(classes, edges), cv2.COLOR_RGB2BGR))
    share = {CLASSES[c]: round(float((classes == c).mean()), 3) for c in range(len(CLASSES)) if (classes == c).any()}
    print('coverage', share)
    print(f'wrote {out / (args.prefix + "classes.png")} depth.npy edges.png preview.png')


if __name__ == '__main__':
    main()
