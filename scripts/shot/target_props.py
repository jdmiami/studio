#!/usr/bin/env python3
"""Places the target shot's props in the fitted Nest layout.

Builds the prop list (scripts/fp/place_props.py's input format) from the element masks of
docs/reference/target-shot/masks.png: each mask's base pixel (the middle of its lowest row), its
height in pixels and the surface it stands on; the mushrooms and the jars split into their
separate pieces; the little fence gets its two end legs. Then runs the placer with the target's
fit camera (docs/reference/target-shot/fit-camera.json) and classes, at full size.

Usage: target_props.py [--layout src/cave/layout.json] [--out src/cave/props-placement.json]
Writes docs/reference/target-shot/props.json and the placement.
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'docs/reference/target-shot'
sys.path.insert(0, str(ROOT / 'scripts/fp'))
import place_props as P  # noqa: E402

# mask name -> (builder name, surface id it stands on: 1 grass, 4 floor, 3 water; split into pieces?)
MAP = {
    'cube-tree': ('cube-tree', 1, False), 'willow': ('willow', 1, False), 'mushrooms': ('mushroom', 1, True),
    'jars-mint': ('knit-shrub', 4, True), 'jars-cream': ('stone', 1, True), 'lavender-pom': ('pom', 1, False),
    'dog': ('dog', 4, False), 'critter-a': ('critter', 4, False), 'critter-b': ('critter', 4, False),
    'critter-c': ('critter', 4, False), 'mira': ('npc', 1, False), 'little-fence': ('fence', 4, False),
}


def entry(name, m, stands):
    ys, xs = np.nonzero(m)
    y1 = int(ys.max())
    low = xs[ys >= y1 - 3]
    e = {'name': name, 'box': [int(xs.min()), int(ys.min()), int(xs.max()), y1], 'base': [int(np.median(low)), y1],
         'standsOn': stands, 'heightPx': int(y1 - ys.min()), 'baseVisible': True}
    if name == 'fence':
        e['bases'] = [[int(xs.min()) + 2, int(ys[xs <= xs.min() + 4].max())], [int(xs.max()) - 2, int(ys[xs >= xs.max() - 4].max())]]
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--layout', default=str(ROOT / 'src/cave/layout.json'))
    ap.add_argument('--out', default=str(ROOT / 'src/cave/props-placement.json'))
    a = ap.parse_args()
    masks = cv2.imread(str(REF / 'masks.png'), 0)
    legend = {v['name']: int(k) for k, v in json.loads((REF / 'masks.json').read_text()).items()}
    props = []
    for mname, (name, stands, split) in MAP.items():
        if mname not in legend:
            continue
        m = (masks == legend[mname]).astype(np.uint8)
        if split:
            n, lab, st, _ = cv2.connectedComponentsWithStats(m)
            for i in range(1, n):
                if st[i, 4] >= 150:
                    props.append(entry(name, lab == i, stands))
        else:
            props.append(entry(name, m > 0, stands))
    (REF / 'props.json').write_text(json.dumps({'_': 'Props of the target shot from its element masks (scripts/shot/target_props.py).', 'props': props}, indent=1))
    print(len(props), 'props:', ', '.join(p['name'] for p in props))
    P.W, P.H = 1125, 1979
    sys.argv = [sys.argv[0], '--layout', a.layout, '--props', str(REF / 'props.json'), '--camera', str(REF / 'fit-camera.json'),
                '--classes', str(REF / 'classes.png'), '--out', a.out]
    P.main()


if __name__ == '__main__':
    main()
