# Rigging Ene for the game

Steps 4 to 8 of the free path (`../space/README.md` covers 0 to 3). Run them from a Hugging Face sandbox created
with `--forward-hf-token`, after `pip install gradio_client httpx huggingface_hub pygltflib numpy pillow playwright`
and `python -m playwright install --with-deps chromium`.

| step | script | what it does | 2026-11-04 |
| --- | --- | --- | --- |
| 4 | `rig_space.py model.glb out` | UniRig on ZeroGPU (Faisal786U/unirig-api): a 28-bone humanoid skeleton and skin weights | 107 s |
| 5 | `fixweights.py out/rigged.glb ene_rigged.glb` | hair follows the head, the face is rigid: arms stop tugging hair and nods stop tearing the face | 2 s |
| 6 | `clips.py clips.json` | idle, walk, run, jump, joy, point, hurt, cry as bone rotations | |
| 7 | `sprites.py ene_rigged.glb clips.json out/sprites` | every clip in the four game views as transparent strips, 256×320 a frame, plus `meta.json` | 160 s |
| 8 | `embed_anims.py ene_rigged.glb clips.json ene_rigged_anim.glb` | the same clips as glTF animations inside the GLB | 1 s |

`render_pose.py model.glb poses.json sheet.png` renders any list of poses to a labelled sheet; it is how the
bone axes and the hand problem below were found.

## The skeleton UniRig produced

`bone_0` hips; `bone_1` to `bone_3` spine; `bone_4` neck; `bone_5` head. `bone_6` to `bone_12` are her **left**
arm (shoulder, upper arm, forearm, hand, three finger bones), `bone_13` to `bone_19` her **right** arm,
`bone_20` to `bone_23` her left leg (hip, thigh, shin, foot), `bone_24` to `bone_27` her right leg. The model
faces −z. A thigh's x+ swings it forward, a shin's x− bends the knee, an upper arm's x+ swings it forward and
z+ raises it sideways.

## What the rig can and cannot do

- Legs, left arm, spine and head animate cleanly; see `art/3d/ene/contact.png`.
- Her right hand is sculpted onto her chest and the reconstruction fused it with the dress, so pulling it away
  tears the surface. The clips keep that hand where the sheet draws it and swing the arm only from the shoulder.
  Freeing it means cutting the hand loose from the dress in a mesh editor, or sculpting the figure with the arms
  apart before reconstruction (an A-pose reference in step 1).
- Head turns and nods up to about 20° are clean; beyond that the neck stretches.

## Outputs

- `art/3d/ene/`: the sprite strips (`ene_<clip>_<view>.png`) and `meta.json` (frame size, fps, the feet line).
  The game does not load them yet.
- Dataset `Jdmiami/stickerwild-3d`: `out/rig/ene_rigged.glb` (skeleton and weights), `out/rig/ene_rigged_anim.glb`
  (with the eight clips as animations), `out/sprites/`, and the pose sheets under `out/rig/`.
