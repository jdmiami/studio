# Rigging Ene for the game

Steps 4 to 9 of the free path (`../space/README.md` covers 0 to 3). Run them from a Hugging Face sandbox created
with `--forward-hf-token`, after `pip install gradio_client httpx huggingface_hub pygltflib numpy pillow playwright`
and `python -m playwright install --with-deps chromium`.

The first attempt rigged the sheet pose (one hand on her chest): the reconstruction had fused that hand with the
dress and no rig could free it. So the model was rebuilt from scratch in a **T-pose**: the toy figurine of the
sheet was re-posed with the image editor (arms straight out, fingers spread, legs apart), that figure was turned
to the other angles, and the four views went through the multi-view reconstruction. Every joint is readable from
any single angle, and UniRig found all of them, fingers included.

| step | script | what it does | 2026-11-04 |
| --- | --- | --- | --- |
| 1' | `../space/edit.py fig.png tpose.png Relight 41 "<figurine prompt>, standing in a T-pose, ..."` then `Multiple-Angles` for 45° and 90° and a Relight back prompt | the T-pose references | 20 s each |
| 2' | `../space/multiview_rig.py out/mv front.png threeq.png side.png back.png 0,-45,-90,180` | the T-pose model (9.8 MB, 2048 px texture) | 160 s |
| 4 | `rig_space.py out/mv/model.glb out/rig` | UniRig on ZeroGPU (Faisal786U/unirig-api): a 46-bone skeleton with fingers, and skin weights | 105 s |
| 5 | `fixweights.py out/rig/rigged.glb ene_rigged.glb bone_5 bone_4` | hair follows the head and the face is rigid | 2 s |
| 5b | `fixlegs.py ene_rigged.glb ene_rigged.glb` | re-skins the legs: UniRig left most of each leg on the static hip bones, so bent knees fanned the feet out | 1 s |
| 6 | `clips.py clips.json` | idle, walk, run, jump, joy, point, hurt, cry as poses (arm directions plus joint rotations) | |
| 7 | `sprites.py ene_rigged.glb clips.json out/sprites` | every clip in the four game views as transparent strips, 256×320 a frame, plus `meta.json` | 180 s |
| 8 | `bake.py ene_rigged.glb clips.json ene_rigged_anim.glb` | the same clips as glTF animations, read back off the pose bench so arm aims bake exactly | 30 s |
| 9 | `animcheck.py ene_rigged_anim.glb animcheck.png` | plays the baked animations with three.js and renders a proof sheet | 40 s |

`pose.html` is the bench behind steps 6 to 8: `window.pose(spec)` takes `bone: [rx, ry, rz]` degrees or
`bone: {aim: [x, y, z]}` (point the bone at a world direction), `window.shot(deg)` renders, `window.poseQuats()`
returns the posed quaternions. `render_pose.py model.glb poses.json sheet.png` renders any list of poses to a
labelled sheet; it is how the axes below were found.

## The skeleton UniRig produced from the T-pose

`bone_0` hips; `bone_1` to `bone_3` spine; `bone_4` neck; `bone_5` head. Arm A (`bone_6` shoulder, `7` upper arm,
`8` forearm, `9` hand, fingers `10` to `21` in four chains of three, thumb first) hangs at −x, which is image-right
when she faces the camera; arm B is `bone_22` to `bone_37` the same way. Leg A is `bone_38` hip, `39` thigh, `40`
shin, `41` foot; leg B `42` to `45`. She faces −z.

Axes on the T-pose rest: an upper arm's x− lowers it from the T and z− swings it forward; an elbow's z+ bends it
forward; a thigh's x+ swings forward; a shin's x− bends the knee; a finger's x+ curls. The clips drive the arms
with `aim` directions instead, which read the same from either side.

## What the rig does

- Arms swing freely from the shoulder and bend at the elbow; both hands are clear of the body in every clip.
- Fingers curl (fists in `run`, a straight index in `point`, open hands in `joy`).
- Knees bend without tearing after `fixlegs.py`; the proof is `animcheck3.png` in the dataset.
- Head turns and nods up to about 20° are clean; beyond that the neck stretches.
- Arm directions land within about 20° of the asked direction; the shoulder bones carry some of the rotation.

## Outputs

- `art/3d/ene/`: the sprite strips (`ene_<clip>_<view>.png`) and `meta.json` (frame size, fps, the feet line).
  The game does not load them yet.
- Dataset `Jdmiami/stickerwild-3d`, `out/ene_tpose/`: `ene.glb` (the T-pose model), `ene_rigged_unirig.glb`
  (raw UniRig), `ene_rigged3.glb` (weights fixed), `ene_rigged_anim3.glb` (with the eight clips as animations),
  `sprites3/`, the T-pose references under `in/apose/`, and the proof sheets.
