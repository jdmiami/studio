#!/usr/bin/env python3
"""Segment the reference frame docs/reference/cave-door.jpg into surface classes.

Writes docs/reference/cave-door-classes.png (uint8 label image, 1024 x 572, one id per pixel),
docs/reference/cave-door-classes-preview.png (colour preview with a legend) and
docs/reference/cave-door-props.json (every prop instance: box, base pixel, what it stands on,
height in px) so the rasterizer / fitter can compare a render's surfaces against the painting's
and place the props by ray casting.

Label ids (shared with the rasterizer):
  0 none    nothing / unclassifiable
  1 grass   green felt terrace tops and their hanging hems, and the thin grass strips on the floor
  2 earth   pink / terracotta block faces (terrace faces, walls, the pink blocks around the door)
  3 water   the blue cascade and pool
  4 floor   the pale cream / lavender / mint tiles and the low steps in front of the door
  5 door    the mosaic leaves inside the door opening
  6 frame   the grey seamed stone around the door: posts, lintel, pillars
  7 ceiling the salmon slab undersides and slab faces across the top of the frame
  8 light   the washed-out openings where the light shafts enter (upper left, above the door)
  9 prop    anything that is not a block surface (trees, bushes, mushrooms, stones, critters, NPC,
            scaffold, fence, ...)
  10 mask   HUD panels, hands, prompts (compare_frame.MASKS)

Method: the frame is split into zones by hand-drawn polygons (floor, water, ceiling, door, frame,
the lit wall at the top left); inside each zone a few colour thresholds in Lab decide between the
classes that zone can hold (green -> grass, blue -> water, pale and unsaturated -> floor / light,
else the zone's base class). The threshold masks are cleaned with a small morphological opening
and closing and by dropping small components. Everything a threshold cannot know (the props'
silhouettes, the willow tassels which are green like grass, the door opening, the light cores) is
a hand-drawn polygon listed below with a comment. The reference is a single fixed painting, so
hand polygons are acceptable; they were traced on 3x crops and checked on blended overlays.

Usage: segment_reference.py [--out-dir docs/reference] [--overlay path.png]
  --overlay also writes the preview blended 50/50 over the reference (for checking boundaries).
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_frame import MASKS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / 'docs/reference/cave-door.jpg'
W, H = 1024, 572

NONE, GRASS, EARTH, WATER, FLOOR, DOOR, FRAME, CEILING, LIGHT, PROP, MASK = range(11)
CLASS_NAMES = ['none', 'grass', 'earth', 'water', 'floor', 'door', 'frame', 'ceiling', 'light', 'prop', 'mask']
PALETTE = {
    NONE: (0, 0, 0), GRASS: (70, 190, 60), EARTH: (205, 90, 70), WATER: (50, 110, 230), FLOOR: (240, 235, 200),
    DOOR: (150, 70, 170), FRAME: (120, 120, 130), CEILING: (250, 150, 110), LIGHT: (255, 255, 120),
    PROP: (20, 200, 220), MASK: (40, 40, 40),
}


# ----------------------------------------------------------------------------------------------
# Zones: where each class may occur. Polygons in reference px (u, v), traced on 3x crops.
# ----------------------------------------------------------------------------------------------

# The pale tile floor and its low steps, bounded by the frame's foot (top), the bushes on the
# centre terrace (left) and the grass around the bench on the right. Inside it everything is
# floor except green strips (grass), props and the mask. Below v 428 the left side is under the
# hand mask, so the left edge there only matters between u 530 and the bush at u 552.
FLOOR_ZONE = [
    (575, 338), (712, 338), (712, 360), (730, 372), (730, 392), (700, 402), (700, 572), (530, 572),
    (530, 450), (552, 445), (552, 420), (550, 395), (552, 372), (566, 360), (566, 345),
]

# The cascade and pool at the lower left: blue -> water, green -> grass, else earth.
WATER_ZONE = [(0, 250), (330, 250), (330, 310), (470, 390), (470, 572), (0, 572)]

# Pale lavender stone cubes at the lower left beside the pool (the kit's pale stone, so 'floor').
FLOOR_EXTRA = [
    [(0, 374), (40, 372), (55, 378), (60, 386), (70, 384), (72, 460), (0, 460)],
]

# The ceiling: everything above this polyline is a slab underside / face, unless bright (light).
CEILING_LINE = [
    (0, 96), (96, 96), (96, 70), (180, 70), (180, 92), (200, 92), (200, 126), (300, 126), (300, 98),
    (420, 98), (420, 133), (560, 133), (560, 112), (766, 112), (766, 100), (830, 100), (830, 80),
    (860, 80), (860, 62), (1024, 62),
]

# The washed-out light openings: the cores are thresholded (very bright, no chroma) inside these
# zones, and the drawn cores below are always light (the opening between the slabs is white but
# its edge pixels are tinted by the surrounding salmon).
LIGHT_ZONES = [
    # upper-left opening between the slabs (the wash on the wall below and to the right stays earth)
    [(92, 56), (200, 56), (200, 140), (92, 140)],
    # above the door lintel
    [(600, 40), (740, 40), (740, 118), (600, 118)],
]
LIGHT_CORES = [
    [(96, 62), (178, 60), (178, 98), (152, 136), (112, 134), (96, 106)],
    [(624, 54), (700, 52), (712, 70), (706, 98), (690, 103), (642, 103), (628, 96)],
]

# The door opening (mosaic leaves): inner edges of the posts, the lintel's underside, the floor.
DOOR_POLY = [(617, 149), (745, 149), (745, 331), (617, 331)]

# The grey seamed stone around the door: the left column (u 546-598) and left post, the lintel
# band (v 112-149), the right post (u 745-766), the pillar (u 766-806) and the pillar's wide
# capital (to u 830, v 100-150). The door polygon is cut out again.
FRAME_POLY = [
    (546, 116), (598, 116), (598, 112), (766, 112), (766, 100), (830, 100), (830, 150), (806, 150),
    (806, 340), (745, 340), (745, 336), (617, 336), (617, 338), (580, 338), (580, 330), (546, 330),
]


# ----------------------------------------------------------------------------------------------
# Props. Each: name, polys (silhouette polygons in reference px), base (u, v: the bottom-centre
# pixel where it meets the surface it stands on), standsOn (class id of that surface),
# baseVisible (False when the base is hidden behind something and estimated). The box and
# heightPx are computed from the polygons and the base. Comments say what each one is.
# ----------------------------------------------------------------------------------------------
PROPS = [
    # Cube tree on the upper-left terrace: nine sage felt cubes and a pink trunk to the grass at v 250.
    dict(name='cube-tree', standsOn=GRASS, base=(362, 250), polys=[[
        (322, 100), (365, 100), (372, 106), (392, 103), (415, 106), (418, 130), (440, 135), (445, 175),
        (440, 200), (425, 212), (390, 215), (375, 213), (375, 245), (362, 250), (350, 245), (350, 213),
        (320, 212), (300, 210), (292, 195), (292, 140), (300, 130), (320, 128), (320, 105)]]),
    # Willow left of the door: domed canopy with hanging tassels (green like grass, but a prop),
    # pink trunk down to the grass terrace at v 300; the crate in front hides the very bottom.
    dict(name='willow', standsOn=GRASS, base=(492, 300), polys=[[
        (458, 160), (500, 158), (515, 168), (530, 178), (542, 198), (542, 236), (534, 250), (522, 241),
        (508, 246), (506, 300), (480, 300), (480, 250), (470, 240), (458, 249), (450, 253), (444, 238),
        (437, 230), (436, 200), (445, 180)]]),
    # Second willow at the upper right: its canopy is above the horizon (v 213) so it cannot be a
    # terrace top; the tassels hang beside the broom tree and over the pillar. Trunk hidden.
    dict(name='willow-2', standsOn=GRASS, base=(940, 340), baseVisible=False, polys=[
        # canopy (mostly under the HUD mask); its underside is at v ~150 over the pink column
        [(898, 118), (905, 75), (930, 55), (1000, 55), (1024, 70), (1024, 150), (985, 152), (970, 150),
         (958, 146), (950, 146), (900, 140)],
        # tassels left of the broom head
        [(806, 135), (830, 122), (880, 116), (898, 118), (898, 140), (852, 143), (850, 210), (846, 218),
         (846, 256), (836, 252), (830, 246), (822, 252), (814, 238), (806, 250), (798, 246), (798, 180),
         (800, 150)],
        # the strip of tassels between the broom head's right edge and the column
        [(956, 148), (972, 148), (972, 250), (966, 258), (950, 258), (952, 222), (956, 200)]]),
    # Broom tree: fibrous tan head with a collar, grey-green stem; the stem disappears behind the pom
    # and knit shrub, the base is estimated on the terrace behind them.
    dict(name='broom-tree', standsOn=GRASS, base=(893, 352), baseVisible=False, polys=[[
        (852, 143), (900, 140), (950, 146), (958, 160), (960, 218), (960, 238), (952, 256), (905, 258),
        (905, 292), (882, 292), (882, 258), (852, 256), (846, 238), (846, 218), (850, 210)]]),
    # White pom on top of the knit shrub.
    dict(name='pom', standsOn=PROP, base=(892, 327), polys=[[
        (872, 296), (885, 290), (905, 290), (915, 300), (915, 320), (905, 328), (880, 328), (870, 318)]]),
    # Teal knit shrub behind the fence; its foot is hidden by the fence rails.
    dict(name='knit-shrub', standsOn=GRASS, base=(890, 364), baseVisible=False, polys=[[
        (838, 340), (850, 322), (870, 312), (900, 312), (930, 320), (945, 340), (945, 365), (835, 365)]]),
    # Lavender fence: three posts and two rails. 'bases' gives both end posts' feet.
    dict(name='fence', standsOn=GRASS, base=(883, 397), bases=[(828, 396), (938, 398)], polys=[[
        (820, 345), (838, 343), (838, 355), (860, 355), (862, 345), (878, 345), (878, 355), (926, 355),
        (928, 348), (948, 348), (948, 398), (928, 398), (926, 392), (878, 392), (878, 395), (862, 395),
        (860, 392), (838, 392), (838, 398), (820, 398)]]),
    # Mushrooms (pink caps): three on the upper-left terrace, one on the lower terrace, one beside the
    # knit shrub, one big one at the right edge (cap cut by the frame edge).
    dict(name='mushroom', standsOn=GRASS, base=(305, 288), polys=[[
        (292, 266), (298, 258), (312, 257), (320, 264), (318, 274), (310, 278), (310, 288), (300, 288),
        (300, 278), (293, 274)]]),
    dict(name='mushroom', standsOn=GRASS, base=(342, 280), polys=[[
        (325, 262), (332, 254), (345, 252), (355, 258), (356, 268), (348, 272), (348, 280), (336, 280),
        (335, 272), (326, 268)]]),
    dict(name='mushroom', standsOn=GRASS, base=(357, 282), polys=[[
        (349, 272), (355, 268), (363, 270), (364, 278), (360, 281), (352, 281), (349, 278)]]),
    dict(name='mushroom', standsOn=GRASS, base=(369, 360), polys=[[
        (354, 347), (360, 339), (372, 337), (380, 342), (381, 350), (375, 354), (374, 360), (364, 360),
        (363, 354), (355, 352)]]),
    dict(name='mushroom', standsOn=GRASS, base=(826, 350), polys=[[
        (803, 322), (812, 312), (835, 310), (850, 320), (850, 335), (840, 342), (835, 350), (816, 350),
        (812, 342), (803, 335)]]),
    dict(name='mushroom', standsOn=GRASS, base=(998, 432), polys=[[
        (970, 392), (990, 378), (1024, 378), (1024, 418), (1010, 420), (1008, 432), (988, 432), (986, 420),
        (970, 418), (965, 405)]]),
    # Pastel stones on the centre terraces: a pile of small cream stones, a big cream one, a stack of
    # two tan ones, a lying pale block, a lavender one, a small pale one by the bushes.
    dict(name='stone', standsOn=GRASS, base=(345, 320), polys=[[
        (327, 308), (332, 298), (345, 296), (358, 300), (361, 310), (356, 320), (335, 320), (328, 316)]]),
    dict(name='stone', standsOn=GRASS, base=(396, 321), polys=[[
        (382, 304), (388, 296), (402, 295), (410, 300), (410, 314), (402, 318), (386, 318), (382, 312)]]),
    dict(name='stone', standsOn=GRASS, base=(423, 320), polys=[[
        (406, 300), (410, 282), (416, 274), (430, 273), (436, 280), (437, 296), (441, 305), (440, 316),
        (428, 320), (410, 320), (405, 312)]]),
    dict(name='stone', standsOn=GRASS, base=(427, 273), polys=[[
        (411, 256), (418, 250), (438, 250), (443, 256), (443, 266), (437, 269), (414, 269), (410, 264)]]),
    dict(name='stone', standsOn=GRASS, base=(421, 360), polys=[[
        (402, 348), (406, 338), (418, 330), (430, 331), (438, 340), (439, 356), (430, 360), (406, 360),
        (402, 355)]]),
    dict(name='stone', standsOn=GRASS, base=(519, 365), polys=[[
        (510, 358), (514, 351), (524, 350), (529, 356), (528, 364), (513, 365)]]),
    # Bushes (felt and knit) on the centre terrace and by the bench.
    dict(name='bush', standsOn=GRASS, base=(454, 409), polys=[[
        (437, 392), (441, 377), (450, 371), (462, 371), (470, 378), (472, 392), (470, 405), (462, 409),
        (443, 409), (437, 403)]]),
    dict(name='bush', standsOn=GRASS, base=(470, 368), polys=[[
        (456, 352), (461, 342), (472, 340), (482, 345), (484, 360), (480, 367), (460, 368), (455, 362)]]),
    dict(name='bush', standsOn=GRASS, base=(523, 425), polys=[[
        (497, 390), (500, 372), (512, 363), (535, 362), (548, 372), (550, 392), (547, 415), (538, 425),
        (506, 425), (498, 415)]]),
    dict(name='bush', standsOn=GRASS, base=(493, 380), polys=[[
        (475, 364), (480, 354), (495, 350), (508, 354), (512, 366), (508, 380), (480, 380), (475, 375)]]),
    dict(name='bush', standsOn=GRASS, base=(457, 338), polys=[[
        (440, 312), (446, 302), (462, 300), (472, 306), (474, 322), (470, 334), (448, 336), (441, 328)]]),
    dict(name='bush', standsOn=GRASS, base=(547, 361), polys=[[
        (530, 335), (536, 322), (552, 320), (563, 328), (565, 345), (560, 358), (534, 358), (529, 350)]]),
    dict(name='bush', standsOn=GRASS, base=(508, 347), polys=[[
        (495, 334), (500, 326), (512, 325), (520, 330), (521, 342), (516, 347), (498, 347), (495, 342)]]),
    dict(name='bush', standsOn=GRASS, base=(747, 346), polys=[[
        (733, 330), (738, 320), (748, 317), (760, 320), (762, 336), (758, 346), (740, 346), (733, 340)]]),
    dict(name='knit-bush', standsOn=GRASS, base=(778, 352), polys=[[
        (760, 336), (764, 327), (776, 324), (792, 326), (797, 336), (796, 348), (788, 352), (764, 352),
        (760, 346)]]),
    # Small wooden crate at the willow's foot and the wooden bench by the right terrace.
    dict(name='crate', standsOn=GRASS, base=(504, 328), polys=[[(488, 300), (520, 298), (521, 326), (489, 328)]]),
    dict(name='bench', standsOn=GRASS, base=(738, 353), polys=[[
        (722, 336), (724, 322), (728, 318), (750, 318), (753, 324), (753, 350), (748, 353), (726, 353),
        (722, 348)]]),
    # The dog (white pomeranian) on the floor, the two fluffy critters, a tiny one and a sprout mark.
    dict(name='dog', standsOn=FLOOR, base=(590, 368), polys=[[
        (552, 340), (553, 318), (560, 305), (575, 300), (582, 296), (590, 302), (604, 296), (612, 302),
        (620, 312), (624, 330), (622, 352), (616, 362), (610, 368), (590, 368), (580, 366), (570, 368),
        (558, 362), (552, 352)]]),
    dict(name='critter', standsOn=FLOOR, base=(673, 392), polys=[[
        (657, 375), (662, 362), (672, 357), (684, 360), (690, 372), (688, 386), (680, 392), (666, 392),
        (658, 386)]]),
    dict(name='critter', standsOn=FLOOR, base=(614, 423), polys=[[
        (598, 408), (602, 398), (612, 393), (624, 396), (630, 406), (629, 418), (620, 423), (606, 423),
        (599, 417)]]),
    dict(name='critter', standsOn=FLOOR, base=(714, 389), polys=[[
        (706, 378), (710, 373), (722, 374), (723, 388), (707, 389)]]),
    dict(name='sprout', standsOn=FLOOR, base=(698, 412), polys=[[(689, 402), (707, 400), (708, 412), (690, 413)]]),
    # The NPC (waving girl) standing on the scaffold's platform behind its railing.
    dict(name='npc', standsOn=PROP, base=(187, 245), baseVisible=False, polys=[[
        (156, 186), (160, 180), (167, 178), (170, 185), (172, 172), (185, 168), (198, 172), (202, 185),
        (200, 196), (204, 205), (203, 240), (176, 240), (174, 215), (172, 200), (166, 197), (158, 195)]]),
    # Wooden scaffold: railing (two rails and a plank), four posts; the two outer legs reach down to
    # the cascade's top step (left, in the water) and the grass terrace (right). Its shadow on the
    # wall is earth.
    dict(name='scaffold', standsOn=GRASS, base=(184, 289), bases=[(160, 290), (208, 287)],
         basesStandOn=[WATER, GRASS], polys=[
        [(150, 206), (232, 206), (232, 218), (150, 218)],
        [(150, 226), (232, 226), (232, 236), (150, 236)],
        [(150, 240), (232, 240), (232, 250), (150, 250)],
        [(154, 206), (166, 206), (166, 290), (154, 290)],
        [(173, 206), (182, 206), (182, 285), (173, 285)],
        [(204, 206), (214, 206), (214, 287), (204, 287)],
        [(222, 206), (231, 206), (231, 250), (222, 250)]]),
]


def poly_mask(polys, shape=(H, W)):
    m = np.zeros(shape, np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.array(p, np.int32).reshape(-1, 1, 2)], 1)
    return m.astype(bool)


def above_line(line, shape=(H, W)):
    """Pixels above (v less than) a polyline given as monotone-in-u points."""
    pts = [(0, -1)] + list(line) + [(W, -1)]
    pts = [(u, max(v, -1)) for u, v in pts]
    poly = [(0, 0)] + [(u, v) for u, v in line] + [(W - 1, 0)]
    return poly_mask([poly], shape)


def clean(mask, open_k=3, close_k=3, min_area=40):
    m = mask.astype(np.uint8)
    if open_k:
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((open_k, open_k), np.uint8))
    if close_k:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((close_k, close_k), np.uint8))
    if min_area:
        n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        keep = np.zeros(n, bool)
        keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
        m = keep[lab].astype(np.uint8)
    return m.astype(bool)


def segment(rgb):
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.int16)
    L, a, b = lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128
    # Colour features. Lab in OpenCV's 8-bit scale: L 0..255, a/b centred on 0 here.
    green = (a <= -6) & (b >= 2) & (L >= 50)
    # blue: the cascade, plus its pale foam (bright and only faintly blue)
    blue = ((b <= -9) & (a <= 6)) | ((L >= 195) & (b <= -4) & (a <= 4))
    bright = (L >= 226) & (np.abs(a) <= 9) & (np.abs(b) <= 12)

    floor_zone = poly_mask([FLOOR_ZONE])
    floor_extra = poly_mask(FLOOR_EXTRA)
    water_zone = poly_mask([WATER_ZONE])
    ceiling_zone = above_line(CEILING_LINE)
    light_zone = poly_mask(LIGHT_ZONES)
    light_core = poly_mask(LIGHT_CORES)
    door = poly_mask([DOOR_POLY])
    frame = poly_mask([FRAME_POLY]) & ~door

    labels = np.full((H, W), EARTH, np.uint8)
    # grass anywhere outside the structural zones (hems included: the green runs down to the pink)
    grass = clean(green, open_k=3, close_k=5, min_area=60)
    labels[grass] = GRASS
    # water: blue inside the cascade zone; the white foam lips at the top of each step are holes
    # in the blue mask, so holes are filled
    water = clean(blue & water_zone, open_k=3, close_k=7, min_area=80)
    water = ndimage.binary_fill_holes(water)
    labels[water] = WATER
    # floor: the floor zone is floor unless green (grass strips); the lavender cubes are floor
    labels[floor_zone & ~grass] = FLOOR
    labels[floor_extra] = FLOOR
    # ceiling / light: the light is the bright core inside its zone plus a drawn core
    labels[ceiling_zone & ~grass] = CEILING
    light = clean((bright & light_zone) | light_core, open_k=3, close_k=9, min_area=100)
    labels[light] = LIGHT
    labels[frame] = FRAME
    labels[door] = DOOR
    # props: hand polygons
    for p in PROPS:
        labels[poly_mask(p['polys'])] = PROP
    # HUD / hands / prompts
    for x0, y0, x1, y1 in MASKS.values():
        labels[y0:y1, x0:x1] = MASK
    return labels


def props_json(labels):
    out = []
    for p in PROPS:
        pts = np.array([q for poly in p['polys'] for q in poly])
        u0, v0 = pts.min(axis=0)
        u1, v1 = pts.max(axis=0)
        bu, bv = p['base']
        entry = {
            'name': p['name'], 'box': [int(u0), int(v0), int(u1), int(v1)], 'base': [int(bu), int(bv)],
            'standsOn': int(p['standsOn']), 'standsOnName': CLASS_NAMES[p['standsOn']],
            'heightPx': int(bv - v0), 'baseVisible': bool(p.get('baseVisible', True)),
        }
        if 'bases' in p:
            entry['bases'] = [[int(u), int(v)] for u, v in p['bases']]
            entry['basesStandOn'] = [int(c) for c in p.get('basesStandOn', [p['standsOn']] * len(p['bases']))]
        # how much of the silhouette is under the HUD / hands mask (1.0 = not visible at all)
        m = poly_mask(p['polys'])
        entry['maskedFraction'] = round(float((labels[m] == MASK).mean()), 2) if m.any() else 0.0
        # what the label image says just below the base (a check on standsOn; masks and the prop
        # itself are skipped)
        below = [int(labels[min(bv + d, H - 1), min(max(bu, 0), W - 1)]) for d in range(1, 6)]
        below = [c for c in below if c not in (PROP, MASK)]
        entry['labelBelowBase'] = CLASS_NAMES[below[0]] if below else None
        out.append(entry)
    return out


def preview(labels, rgb=None):
    out = np.zeros((H, W, 3), np.uint8)
    for k, c in PALETTE.items():
        out[labels == k] = c
    # legend strip below
    strip = np.full((26, W, 3), 255, np.uint8)
    img = Image.fromarray(np.concatenate([out, strip], axis=0))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
    except Exception:
        font = ImageFont.load_default()
    x = 6
    for k, name in enumerate(CLASS_NAMES):
        d.rectangle([x, H + 6, x + 14, H + 20], fill=PALETTE[k], outline=(0, 0, 0))
        d.text((x + 18, H + 6), f'{k} {name}', fill=(0, 0, 0), font=font)
        x += 90
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out-dir', default=str(ROOT / 'docs/reference'))
    ap.add_argument('--overlay')
    args = ap.parse_args()
    rgb = np.asarray(Image.open(REFERENCE).convert('RGB'))
    labels = segment(rgb)
    out = Path(args.out_dir)
    Image.fromarray(labels).save(out / 'cave-door-classes.png')
    pv = preview(labels)
    pv.save(out / 'cave-door-classes-preview.png')
    if args.overlay:
        base = Image.fromarray(rgb)
        col = pv.crop((0, 0, W, H))
        Image.blend(base, col, 0.5).save(args.overlay)
    props = props_json(labels)
    (out / 'cave-door-props.json').write_text(json.dumps({
        '_': 'Props in docs/reference/cave-door.jpg (1024x572). box [u0, v0, u1, v1]; base = bottom-centre '
             'pixel where the prop meets the surface it stands on (estimated when baseVisible is false); '
             'standsOn = class id of that surface (cave-door-classes.png ids); heightPx = base to top; '
             'fence and scaffold also give both end legs as bases.',
        'classes': {str(k): n for k, n in enumerate(CLASS_NAMES)},
        'props': props,
    }, indent=1))
    fractions = {CLASS_NAMES[k]: round(float((labels == k).mean()), 4) for k in range(len(CLASS_NAMES))}
    print(json.dumps(fractions))
    bad = [p['name'] for p in props if p['labelBelowBase'] not in (None, p['standsOnName'])]
    if bad:
        print('standsOn differs from the label below the base for:', ', '.join(bad))


if __name__ == '__main__':
    main()
