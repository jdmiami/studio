#!/usr/bin/env python3
"""Coordinate-descent fit of one element's scale (x, y, z) and turn (ry) against the pixel test.

Each candidate is rendered on the kit page with ?fit=<id>:sx,sy,sz,ry (the whole family is
rendered so neighbor shadows are present) and scored by pixel_test.py. The objective rewards the
silhouette first and colour second:  score = iou - wde * meanDE - wworst * worstPatch
(defaults 0.01 and 0.004; lower them to let the silhouette dominate).
Prints the best transform; paste it into the family module's FIT table.

Usage: fit.py <id> [--start sx,sy,sz,ry] [--rounds 2]
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'screenshots/kit/fit'


def family_of(item_id):
    text = (ROOT / 'src/kit/manifest.js').read_text()
    return re.search(r"id: '" + re.escape(item_id) + r"', family: '([^']+)'", text).group(1)


WEIGHTS = {'de': 0.01, 'worst': 0.004}


def score(item_id, family, t, cache):
    key = tuple(round(v, 4) for v in t)
    if key in cache:
        return cache[key]
    OUT.mkdir(parents=True, exist_ok=True)
    png = OUT / f'{item_id}.png'
    q = f"family={family}&fit={item_id}:{','.join(str(round(v, 4)) for v in t)}"
    subprocess.run(['node', 'scripts/screenshot.mjs', str(png), '--page=kit.html', '--size=1024x572', f'--query={q}'],
                   cwd=ROOT, capture_output=True, check=True)
    out = OUT / f'{item_id}.json'
    subprocess.run([sys.executable, 'scripts/kit/pixel_test.py', str(png), '--ids', item_id, '--json', str(out)],
                   cwd=ROOT, capture_output=True)
    r = json.loads(out.read_text())['results'][0]
    s = r['iou'] - WEIGHTS['de'] * r['meanDE'] - WEIGHTS['worst'] * r['worstPatch']
    cache[key] = (s, r)
    print(f"  {key}  score {s:.4f}  iou {r['iou']:.3f}  dE {r['meanDE']:.2f}  worst {r['worstPatch']:.2f}  "
          f"{'PASS' if r['pass'] else 'fails ' + ','.join(r['fails'])}", flush=True)
    return cache[key]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--start', default='1,1,1,0')
    ap.add_argument('--rounds', type=int, default=2)
    ap.add_argument('--wde', type=float, default=0.01)
    ap.add_argument('--wworst', type=float, default=0.004)
    args = ap.parse_args()
    WEIGHTS.update(de=args.wde, worst=args.wworst)
    family = family_of(args.id)
    t = [float(v) for v in args.start.split(',')]
    cache = {}
    best = score(args.id, family, t, cache)
    steps = [0.02, 0.02, 0.02, 0.03]
    for rnd in range(args.rounds):
        for axis in range(4):
            for direction in (1, -1):
                while True:
                    cand = list(t)
                    cand[axis] += direction * steps[axis]
                    s = score(args.id, family, cand, cache)
                    if s[0] > best[0] + 1e-4:
                        t, best = cand, s
                    else:
                        break
        steps = [v / 2 for v in steps]
    print(f"BEST {args.id}: [{', '.join(f'{v:.4f}' for v in t)}]  score {best[0]:.4f}  {json.dumps(best[1])}")


if __name__ == '__main__':
    main()
