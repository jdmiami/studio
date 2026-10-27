#!/usr/bin/env python3
"""Fences fitted in 3D from their painted cut-outs.

A fence stands on the ground along a straight line. From its cut-out (docs/reference/assets/<id>.png):
1. its two bottom ends (the outline's bottom at the leftmost and rightmost columns) cast through the
   painting's camera onto its ground height give the fence line in the world: ends, length, yaw;
2. each column of the outline, cast onto the vertical plane through that line, gives a height at
   a distance along the fence: the top profile h(t);
3. posts are the runs where h(t) rises above POST of its maximum (their centre, width and height);
   between posts the top is the rails' top, and the rails fill the gap from RAIL0 of that up.
Writes src/assets/fence-fits.json, read by src/assets/fence.js (pink pillow fence, small wooden
fence) through src/assets/library.js.

Usage: fit_fences.py
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fp'))
from trace_blocks import Camera  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'docs/reference/assets'
FAMILIES = {'fence', 'wood-fence'}
POST = 0.86


def ground_hit(cam, u, v, y):
    d = cam.ray(u, v)
    t = (y - cam.eye[1]) / d[1]
    return np.array(cam.eye) + t * d


def plane_hit(cam, u, v, p0, normal):
    d = cam.ray(u, v)
    t = np.dot(p0 - np.array(cam.eye), normal) / np.dot(d, normal)
    return np.array(cam.eye) + t * d


def main():
    cam = Camera(json.load(open(ROOT / 'docs/reference/cave-door-camera.json')), 1024, 572)
    fits = {}
    for r in json.load(open(REF / 'index.json'))['assets']:
        if r['family'] not in FAMILIES or 'position' not in r:
            continue
        alpha = np.asarray(Image.open(REF / r['file']))[..., 3] > 127
        x0, y0 = r['crop']
        Y = r['position'][1]
        cols = [j for j in range(alpha.shape[1]) if alpha[:, j].any()]
        bottom = {j: int(np.nonzero(alpha[:, j])[0][-1]) for j in cols}
        top = {j: int(np.nonzero(alpha[:, j])[0][0]) for j in cols}
        # Ends: a few columns in from each side (the rounded caps), their bottom on the ground.
        jl, jr = cols[min(2, len(cols) - 1)], cols[max(-3, -len(cols))]
        E0 = ground_hit(cam, x0 + jl + 0.5, y0 + bottom[jl] + 1, Y)
        E1 = ground_hit(cam, x0 + jr + 0.5, y0 + bottom[jr] + 1, Y)
        along = E1 - E0
        along[1] = 0
        L = float(np.linalg.norm(along))
        along /= L
        normal = np.array([-along[2], 0.0, along[0]])
        # Top profile along the fence.
        prof = []
        for j in cols:
            P = plane_hit(cam, x0 + j + 0.5, y0 + top[j], E0, normal)
            prof.append((float(np.dot(P - E0, along)), float(P[1] - Y)))
        prof.sort()
        ts = np.array([p[0] for p in prof])
        hs = np.array([p[1] for p in prof])
        hs = np.array([np.median(hs[max(0, i - 1):i + 2]) for i in range(len(hs))])
        hmax = float(hs.max())
        tall = hs > POST * hmax
        posts, i = [], 0
        while i < len(ts):
            if tall[i]:
                k = i
                while k + 1 < len(ts) and tall[k + 1]:
                    k += 1
                w = max(0.06, ts[k] - ts[i])
                posts.append({'t': round(float((ts[i] + ts[k]) / 2), 3), 'w': round(float(w), 3),
                              'h': round(float(hs[i:k + 1].max()), 3)})
                i = k + 1
            else:
                i += 1
        if r['family'] == 'wood-fence':
            # A small wooden fence is two end posts and rails: the outline's end columns are trimmed
            # by the fit, so take each post's height as the highest top near its end.
            near = lambda a, b: hs[(ts >= a) & (ts <= b)]
            w = max(0.07, 0.14 * L)
            posts = [{'t': round(w / 2, 3), 'w': round(w, 3), 'h': round(float(near(0, 0.2 * L).max()), 3)},
                     {'t': round(L - w / 2, 3), 'w': round(w, 3), 'h': round(float(near(0.8 * L, L).max()), 3)}]
            tall = (ts < 0.2 * L) | (ts > 0.8 * L)
        gaps = hs[~tall]
        rail_top = float(np.median(gaps)) if len(gaps) else hmax * 0.7
        fits[r['id']] = {
            'family': r['family'], 'ends': [[round(float(v), 3) for v in E0], [round(float(v), 3) for v in E1]],
            'length': round(L, 3), 'yaw': round(float(np.arctan2(along[0], along[2])), 4),
            'posts': posts, 'railTop': round(rail_top, 3),
            'paint': {'src': r['src'], 'x': x0, 'y': y0},
        }
        print(f"{r['id']}: length {L:.2f}, {len(posts)} posts " + ', '.join(f"t{p['t']:.2f} w{p['w']:.2f} h{p['h']:.2f}" for p in posts)
              + f", rails to {rail_top:.2f}")
    (ROOT / 'src/assets/fence-fits.json').write_text(json.dumps({
        '_': 'Fences fitted in 3D from their painted cut-outs (scripts/assets/fit_fences.py): the line on the '
             'ground (ends, length, yaw: local +x along the fence), posts (distance along t, width, height) and '
             'the rails\' top; world units.', 'fits': fits}, indent=1))


if __name__ == '__main__':
    main()
