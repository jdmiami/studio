# Fitting the cave layout to the reference frame

`src/cave/layout.json` is the block layout of the cave under the reference frame's camera
(`docs/reference/cave-door-camera.json`): `scripts/fp/fit_layout.py` fitted it to the surface
classes of `docs/reference/cave-door.jpg` (`cave-door-classes.png`), then `scripts/fp/layout_edits.py`
applied the hand corrections listed below and wrote the file. `scripts/fp/place_props.py` then
placed every prop of `cave-door-props.json` by casting its base pixel's ray into that layout
(`src/cave/props-placement.json`). To change the layout, edit `layout_edits.py` (or the JSON by
hand, adding a line here), rerun both scripts and `scripts/fp/compare_frame.py` on a fresh render.

The fit (sweeps 1-7 of the flat-guess run, J 0.333, class agreement 0.818, edge 7.3 px) scores
only which class lands in which pixel, so near the camera it is free to paint the frame with
whatever columns do that: pits of top -1 whose neighbours' earth faces show as "earth", lone
6-high pillars, 'frame' cells in the middle of the room, and tops of 3-6 within two units of the
eye. The near field was therefore laid out by hand from back-projections of reference pixels with
the solved camera (`eye (7.4, 3.775, 2.261)`; a pixel (u, v) and a height y give one ground point).

## CHANGES

Each change: cells, what was set, and the reference evidence (reference px, back-projected).

1. Regularisation of fitted cells (everywhere outside the hand region, in front of the back wall):
   - 'frame' cells away from the door (z > -14) with top < 5 become earth at their tallest
     non-frame neighbour's height. Evidence: the only grey stone in the frame is the door
     surround (u 560-830, v 60-330); the low grey cells at (3,-9), (0..2,-8), (2,-6), (4,-4),
     (4,-2), (6,-5) were painting pale stones and shadow. The tall ones at (5,-9) and (6,-10)
     stay: they are the painted right post of the door, which the painting puts nearer than the
     wall (its known 4-8 px inconsistency against the model).
   - pits (top -1) rise to their lowest neighbour (floor if that is 0 beside floor): a pit shows
     only its neighbours' earth faces; the reference has no holes in the floor or terraces.
   - lone pillars (wall, top >= 6, three or more above every neighbour, |x| < 9) drop to their
     tallest neighbour: the reference's tall earth is in connected walls, not posts.
2. The player's terrace, (5..8, 0..4) pale stone ('step') top 2, (3..4, 3..4) grass top 2: the big
   pale block at the bottom of the frame has its far edge at v 500 (u 600), which on y = 2 is
   (5.9, -0.4), 3.5 units away; its near part (600, 560) is (6.2, 0.1). The spawn cell is (7, 2),
   so the feet are at 2 and the eye at 3.6 (the solve says 3.775).
3. The steps down to the floor, half a unit each: (5..6, -1) 1.5, (4..6, -2) 1, (3..5, -3) 0.5,
   (2..4, -4) floor 0, and floor 0 over (0..4, -8..-5). Evidence: the pale steps at u 540-700,
   v 400-470 are on y = 1 at (3.8..5.3, -2.6..-4.2) and reach y = 0 at z = -4.4 (620, 465);
   the dog's base (590, 368) is on the floor at (0.9, -8.3).
4. The grass terrace between the steps and the water, (2..4, -1..0) and (3..4, -2) top 1, plus
   (1..2, -4..-3) and (1, -1..0): the green hem at (300, 470) is (2.2, -0.3) on y = 1.
5. The water cascade along the front-left wall, z 0..2, stepping down toward the player:
   (0..4, 1..2) 0.5, (-2..-1, 0..2) 1.5, (-4..-3, 0..2) 2.5, (-8..-5, 0..2) 3, (0, 0) 1.5.
   Evidence: the pool at the frame's lower-left corner (100, 540) is (0.1, 1.2) on y = 0 and
   (2.0, 1.5) on y = 1; the cascade's top (60, 300) is (-6.8, 0.3) on y = 2; the water's right
   edge at the bottom of the frame (u 330, v 572) needs the pool to reach x = 4.
6. Terraces behind the cascade: (-8..-4, -3..-1) top 3, (-3..0, -2..-1) top 2, (-3..-1, -3) 3,
   (0, -3) 2, (-2, -4) 3 (was water in the fit), (-6, -5..-4) 3 (also water in the fit). The
   cube tree's base (362, 250) is (-2.4, -4.2) on y = 3 and the scaffold's legs (160, 290) and
   (208, 287) land on the y = 3 terrace at x -4..-3; the fit's water cells there were isolated.
7. The right-hand grass terrace (7..8, -8..-1) top 2, level with the player's: the fence's base
   (883, 397) on y = 2 is (7.0, -3.7), 6.3 units away, where its 54 px make it 0.66 tall (the
   fence builder's size); the knit shrub's 52 px at (7.0, -5.2) make it 0.77 (the builder's
   0.75). On the fit's y = 3 both would be toys a quarter of that size. (6, -4..-3) top 1 and
   (5..6, -7..-5) top 1 bridge to the floor.
8. The right wall, (9, -15..-1) top 9: the wall blocks at the frame's right edge (990, 330) stand
   on y = 2 at x = 8.0, so their face is x = 8.5. The fit had the wall one cell further out.
9. The enclosure behind the camera (z 3..4) top 2: never seen, keeps the spawn's 3 x 3 flat.

Props: `willow-2` of cave-door-props.json (its base is invented, its canopy is the sage at the
frame's top-right corner behind the broom tree) is not built: from its base it would stand in
front of the broom tree. The NPC is out of scope; its scaffold is placed.

## Scores (scripts/fp/compare_frame.py, HUD and hands masked)

| frame | meanDE | edgeRecall |
| --- | --- | --- |
| 94bb9bf, old pose and layout | 21.7 | 0.53 |
| 94bb9bf, solved pose, old layout | 27.5 | 0.38 |
| fitted layout (sweep 1), solved pose | 22.9 | 0.28 |
| fitted (sweep 7) + CHANGES 1-6, props | 23.4 | 0.60 |
| + CHANGES 7-8, willow-2 dropped, cooler light, brighter slabs | 21.4 | 0.59 |

The edge recall is bounded by the felt and fur textures (their Canny edges carpet both frames) and
the mean dE by the palette: the render's mean Lab b is 17 against the reference's 9.5 and its
chroma 27 against 17, which no block move fixes; the ceiling slabs (L 43 against 58) and the
water (the reference's cascade is many small steps where the layout has one-unit blocks) are the
largest remaining regions.
