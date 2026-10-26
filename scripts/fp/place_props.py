#!/usr/bin/env python3
"""Place the reference frame's props in the fitted block layout.

For each prop in docs/reference/cave-door-props.json the ray of its base pixel is cast from the
reference camera (docs/reference/cave-door-camera.json, scripts/fp/trace_blocks.py Camera) and
marched through src/cave/layout.json until it meets a column's surface: that is where the prop
stands. Its scale is the reference height in pixels over the pixels one world unit of height
covers at that spot (so the rendered prop is as tall as the painted one), divided by the prop
builder's native height (src/cave/props.js). The fence and the scaffold also get their two end
legs, so they run along the terrace edge the reference paints. The light shafts hang where the
rays through the two washed-out light regions (class 8 of cave-door-classes.png) leave the room.

Writes src/cave/props-placement.json, which src/cave/index.js reads. Rerun after any layout
change:  python3 scripts/fp/place_props.py [--layout src/cave/layout.json] [--out ...]
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trace_blocks import Camera  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
W, H = 1024, 572

# Native heights of the builders in src/cave/props.js at scale 1 (base to top, world units).
NATIVE = {
    'cube-tree': 3.2, 'willow': 3.6, 'willow-2': 3.6, 'broom-tree': 3.8, 'knit-shrub': 0.75, 'pom': 0.34,
    'fence': 0.7, 'mushroom': 0.42, 'stone': 0.32, 'bush': 0.75, 'knit-bush': 0.75, 'dog': 1.3,
    'critter': 0.32, 'scaffold': 2.0, 'crate': 0.5, 'bench': 0.5, 'sprout': 0.2, 'npc': 1.6,
}
# The ones the game builds (the rest are listed in the output but skipped by index.js).
# willow-2's base is invented (its canopy is the sage at the frame's top-right corner, behind the
# broom tree); built from its base it would stand in front of the broom tree, so it is left out.
BUILT = {'cube-tree', 'willow', 'broom-tree', 'knit-shrub', 'fence', 'mushroom', 'stone', 'bush',
         'knit-bush', 'dog', 'critter', 'scaffold'}


def load_layout(path):
    L = json.load(open(path))
    cells = {tuple(int(v) for v in k.split(',')): c for k, c in L['cells'].items()}
    ceiling = {tuple(int(v) for v in k.split(',')): b for k, b in (L.get('ceiling') or {}).items()}
    return L, cells, ceiling


def march(cam, cells, ceiling, u, v, t_max=60.0, dt=0.02):
    """First point along the pixel's ray that lies on or inside a column (or a ceiling slab).
    Returns (P, cell, 'top'|'side'|'ceiling'|'out') with P on the surface."""
    d = cam.ray(u, v)
    prev_cell = None
    t = 0.3
    while t < t_max:
        P = cam.eye + t * d
        cell = (int(round(P[0])), int(round(P[2])))
        if cell not in cells:
            return P, cell, 'out'
        top = cells[cell]['top']
        slab = ceiling.get(cell)
        if slab is not None and P[1] >= slab and P[1] <= 10:
            return P, cell, 'ceiling'
        if P[1] <= top:
            # Entering the column from the side (the ray crossed a cell border above the previous
            # column's top) or from above (through the top face)?
            if prev_cell is not None and prev_cell != cell and P[1] < top - 1e-6 and d[1] < 0:
                Q = P.copy()
                Q[1] = top
                return Q, cell, 'side'
            Q = P.copy()
            Q[1] = top
            return Q, cell, 'top'
        prev_cell = cell
        t += dt
    return cam.eye + t_max * d, None, 'out'


def px_per_unit(cam, P):
    a = cam.project(P)
    b = cam.project(P + np.array([0, 1.0, 0]))
    return float(a[1] - b[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--layout', default=str(ROOT / 'src/cave/layout.json'))
    ap.add_argument('--props', default=str(ROOT / 'docs/reference/cave-door-props.json'))
    ap.add_argument('--camera', default=str(ROOT / 'docs/reference/cave-door-camera.json'))
    ap.add_argument('--classes', default=str(ROOT / 'docs/reference/cave-door-classes.png'))
    ap.add_argument('--out', default=str(ROOT / 'src/cave/props-placement.json'))
    args = ap.parse_args()

    cam = Camera(json.load(open(args.camera)), W, H)
    L, cells, ceiling = load_layout(args.layout)
    props = json.load(open(args.props))['props']
    eye = cam.eye

    def place(u, v):
        P, cell, how = march(cam, cells, ceiling, u, v)
        if how == 'side':
            # Stand on the column the base pixel belongs to, a little in from its edge.
            cx, cz = cell
            P = P.copy()
            P[0] = min(max(P[0], cx - 0.35), cx + 0.35)
            P[2] = min(max(P[2], cz - 0.35), cz + 0.35)
        return P, cell, how

    out = []
    for p in props:
        name = p['name']
        P, cell, how = place(*p['base'])
        if cell is None or how == 'out':
            print(f'  {name}: ray leaves the level ({how}); skipped', file=sys.stderr)
            continue
        ppu = px_per_unit(cam, P)
        height = p['heightPx'] / ppu
        entry = {
            'name': name, 'x': round(float(P[0]), 3), 'y': round(float(P[1]), 3), 'z': round(float(P[2]), 3),
            'cell': list(cell), 'surface': cells[cell]['kind'], 'hit': how,
            'height': round(height, 3), 'scale': round(height / NATIVE.get(name, 1.0), 3),
            'base': p['base'], 'heightPx': p['heightPx'], 'build': name in BUILT,
        }
        if name == 'dog':
            dx, dz = eye[0] - P[0], eye[2] - P[2]
            entry['yaw'] = round(math.atan2(-dz, dx), 4)  # the head (+x) turns toward the player
        if p.get('bases'):
            ends = []
            for b in p['bases']:
                Q, c2, how2 = place(*b)
                ends.append([round(float(Q[0]), 3), round(float(Q[1]), 3), round(float(Q[2]), 3)])
            entry['ends'] = ends
            (ax, ay, az), (bx, by, bz) = ends
            entry['length'] = round(math.hypot(bx - ax, bz - az), 3)
            entry['x'], entry['y'], entry['z'] = round((ax + bx) / 2, 3), round(min(ay, by), 3), round((az + bz) / 2, 3)
            # Rotation about y that takes local +x onto the end-to-end direction.
            entry['yaw'] = round(math.atan2(-(bz - az), bx - ax), 4)
        out.append(entry)
        print(f'  {name:11s} base {p["base"]} -> ({entry["x"]:6.2f}, {entry["y"]:5.2f}, {entry["z"]:6.2f}) '
              f'cell {cell} {cells[cell]["kind"]:5s} {how:7s} height {height:4.2f} scale {entry["scale"]:.2f}')

    # Light shafts: the rays through the light regions' centroids, where they leave the room.
    shafts = []
    try:
        import cv2
        a = np.asarray(Image.open(args.classes))
        m = (a == 8).astype(np.uint8)
        n, lab, st, cen = cv2.connectedComponentsWithStats(m)
        for i in range(1, n):
            if st[i, 4] < 500:
                continue
            u, v = cen[i]
            P, cell, how = march(cam, cells, ceiling, u, v)
            y = min(float(P[1]), 9.5)
            width = st[i, 2] / px_per_unit(cam, P) * 0.9
            shafts.append({'u': round(float(u), 1), 'v': round(float(v), 1), 'x': round(float(P[0]), 2), 'y': round(y, 2),
                           'z': round(float(P[2]), 2), 'width': round(min(max(width, 1.5), 4.0), 2), 'hit': how})
            print(f'  light ({u:.0f}, {v:.0f}) -> ({P[0]:.2f}, {y:.2f}, {P[2]:.2f}) {how}')
    except Exception as e:  # noqa: BLE001
        print(f'  light shafts: {e}', file=sys.stderr)

    result = {
        '_': 'Prop placements for src/cave/index.js, computed by scripts/fp/place_props.py from '
             'docs/reference/cave-door-props.json, the reference camera and src/cave/layout.json: each '
             'prop stands where its base pixel\'s ray meets the layout, scaled so its rendered height '
             'matches the painted one (height = world units; scale = height / the builder\'s native height). '
             'Regenerate after changing the layout.',
        'props': out, 'lights': shafts,
    }
    json.dump(result, open(args.out, 'w'), indent=1)
    print(f'wrote {args.out}: {len(out)} props, {len(shafts)} lights')


if __name__ == '__main__':
    main()
