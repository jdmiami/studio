#!/usr/bin/env python3
"""Hand corrections on top of the fitted cave layout (docs/reference/fit-notes.md, CHANGES).

The fit (scripts/fp/fit_layout.py) scores only the frame's surface classes, so it is free to paint
the near field with whatever columns put the right class in the right pixels: pits of top -1 whose
neighbours' earth faces show, isolated 6-high pillars, 'frame' cells in the middle of the room. The
reference's geometry near the player is simpler and is pinned here by back-projecting reference
pixels with the solved camera (see the notes). This script takes the fit's layout and applies:

  1. the near field by hand (the player's stone terrace, the steps down to the floor, the water
     cascade along the front-left wall, the terraces beside it, the right-hand grass terrace);
  2. regularisation elsewhere: pits (top -1) rise to their lowest neighbour, lone pillars drop to
     their tallest neighbour, 'frame' cells away from the door become earth;
  3. the ceiling is kept as fitted.

Usage: layout_edits.py <fitted.json> <out.json>
"""
import json
import sys

NOTE = ('Block layout of the cave: scripts/fp/fit_layout.py fitted to docs/reference/cave-door.jpg under the '
        'reference camera, then corrected by hand (scripts/fp/layout_edits.py; the reasons are the CHANGES in '
        'docs/reference/fit-notes.md). Per cell "x,z": top (y of the walkable surface, solid from y=-2) and kind '
        '(wall = pink earth with grass on open tops, water, floor/step = pale stone, frame = grey seamed stone); '
        '"ceiling": slab bottoms (slabs reach y=10); "door" as level.js DOOR; "camera": the reference frame\'s.')

# --- 1. the near field (x, z) -> (top, kind) -------------------------------------------------
HAND = {}


def fill(x0, x1, z0, z1, top, kind='wall'):
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            HAND[(x, z)] = (top, kind)


# The player's terrace: pale stone (the big block at the bottom of the frame, its far edge at
# (5.9, -0.4) on y = 2) with grass to its left; spawn cell (7, 2), top 2.
fill(5, 8, 0, 4, 2, 'step')
fill(3, 4, 1, 4, 2, 'wall')
# Steps down to the floor (reference u 540-700, v 400-470: y = 1 at (3.9..4.8, -4.2..-2.6), y = 0
# from z = -4.4), half a unit each so the player can walk them (STEP_HEIGHT 0.55).
fill(5, 6, -1, -1, 1.5, 'step')
fill(4, 6, -2, -2, 1, 'step')
fill(3, 5, -3, -3, 0.5, 'step')
fill(2, 4, -4, -4, 0, 'floor')
fill(0, 4, -8, -5, 0, 'floor')
# The grass terrace between the steps and the water (hem at (2.2, -0.3) on y = 1).
fill(2, 4, -1, 0, 1, 'wall')
fill(3, 4, -2, -2, 1, 'wall')
HAND[(2, -2)] = (1, 'wall')
HAND[(2, -3)] = (1, 'wall')
HAND[(1, -4)] = (1, 'wall')
HAND[(1, -3)] = (2, 'wall')
HAND[(1, -2)] = (2, 'wall')
HAND[(1, -1)] = (1, 'wall')
HAND[(1, 0)] = (1, 'wall')
# The water cascade along the front-left wall (z 0..2), stepping down toward the player: the pool
# at the frame's lower-left corner is at (0.1..2, 1.2..1.5) on y 0..1, the top of the cascade at
# (-6.8, 0.3) on y = 2 .. (1.2, 1.4) on y = 3.
fill(0, 4, 1, 2, 0.5, 'water')
fill(-2, -1, 0, 2, 1.5, 'water')
fill(-4, -3, 0, 2, 2.5, 'water')
fill(-6, -5, 0, 2, 3, 'water')
fill(-8, -7, 0, 2, 3, 'water')
HAND[(0, 0)] = (1.5, 'water')
# Terraces behind the cascade (z -3..-1): the scaffold's terrace at 2..3 on the far left.
fill(-8, -4, -3, -1, 3, 'wall')
fill(-3, 0, -2, -1, 2, 'wall')
fill(-3, -1, -3, -3, 3, 'wall')
HAND[(0, -3)] = (2, 'wall')
# The right-hand grass terrace, level with the player's (the fence base (883, 397) on y = 2 is at
# (7.0, -3.7), 6.3 units away, where its 54 px make it 0.66 tall, the builder's size; the shrub's
# 52 px at (7.0, -5.2) make it 0.77, also the builder's size; on y = 3 both would be toys).
fill(7, 8, -8, -1, 2, 'wall')
# The right wall: the wall blocks at the frame's right edge stand on y = 2 at x = 8 ((990, 330)
# back-projected), so their face is x = 8.5, the x = 9 column.
fill(9, 9, -15, -1, 9, 'wall')
# The cube tree's base (362, 250) on y = 3 is at (-2.4, -4.2): earth, not the fit's water.
HAND[(-2, -4)] = (3, 'wall')
HAND[(-6, -4)] = (3, 'wall')
HAND[(-6, -5)] = (3, 'wall')
HAND[(6, -3)] = (1, 'wall')
HAND[(6, -4)] = (1, 'wall')
fill(5, 6, -7, -5, 1, 'wall')
HAND[(5, -4)] = (0.5, 'step')
# The enclosure in front of the player (z >= 3 is behind the camera, never seen).
fill(-8, 8, 3, 4, 2, 'wall')
fill(5, 8, 3, 4, 2, 'step')


def main():
    src, out = sys.argv[1], sys.argv[2]
    L = json.load(open(src))
    cells = {tuple(int(v) for v in k.split(',')): dict(c) for k, c in L['cells'].items()}
    door = L['door']

    def nbs(x, z):
        return [cells[(x + dx, z + dz)] for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)) if (x + dx, z + dz) in cells]

    # 2. regularisation of the fitted cells
    changes = []
    for (x, z), c in sorted(cells.items()):
        if (x, z) in HAND or z <= door['z']:
            continue
        n = nbs(x, z)
        # Low 'frame' cells scattered over the room paint grey where the reference has stones or
        # shadow; the tall ones at (5,-9) and (6,-10) are the door's right post, which the painting
        # puts nearer than the wall (its known 4-8 px inconsistency), so those stay.
        if c['kind'] == 'frame' and z > door['z'] + 2 and c['top'] < 5:
            tops = [m['top'] for m in n if m['kind'] != 'frame']
            new = max(tops) if tops else 2
            changes.append(((x, z), dict(c), {'top': new, 'kind': 'wall'}))
            c['top'], c['kind'] = new, 'wall'
    for (x, z), c in sorted(cells.items()):
        if (x, z) in HAND or z <= door['z']:
            continue
        n = nbs(x, z)
        if c['top'] < 0 and c['kind'] in ('wall', 'floor', 'step'):
            tops = [m['top'] for m in n if m['top'] >= 0]
            new = min(tops) if tops else 0
            kind = 'floor' if new == 0 and any(m['kind'] == 'floor' for m in n) else 'wall'
            changes.append(((x, z), dict(c), {'top': new, 'kind': kind}))
            c['top'], c['kind'] = new, kind
    for (x, z), c in sorted(cells.items()):
        if (x, z) in HAND or z <= door['z']:
            continue
        n = nbs(x, z)
        if c['kind'] == 'wall' and c['top'] >= 6 and c['top'] >= max(m['top'] for m in n) + 3 and abs(x) < 9:
            new = max(m['top'] for m in n)
            changes.append(((x, z), dict(c), {'top': new, 'kind': 'wall'}))
            c['top'] = new
    # 1. the hand cells
    for (x, z), (top, kind) in HAND.items():
        if (x, z) in cells and cells[(x, z)] != {'top': top, 'kind': kind}:
            changes.append(((x, z), dict(cells[(x, z)]), {'top': top, 'kind': kind}))
        cells[(x, z)] = {'top': top, 'kind': kind}

    obj = {'_': NOTE, 'door': door, 'camera': L['camera'],
           'cells': {f'{x},{z}': c for (x, z), c in sorted(cells.items(), key=lambda kv: (kv[0][0], kv[0][1]))},
           'ceiling': L.get('ceiling', {})}
    json.dump(obj, open(out, 'w'), indent=1)
    print(f'{len(changes)} cells changed; wrote {out}')
    for (x, z), a, b in changes:
        print(f'  ({x},{z}): {a["top"]:g} {a["kind"]} -> {b["top"]:g} {b["kind"]}')


if __name__ == '__main__':
    main()
