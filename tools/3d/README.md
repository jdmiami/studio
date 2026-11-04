# 3D asset pipeline (work in progress)

Inputs and the job script for turning the hand-drawn sheets into 3D models with
ComfyUI's native TRELLIS.2 / Pixal3D workflow, run headless on Hugging Face Jobs.

- `ene_front.png`, `ene_threeq.png`, `ene_side.png`, `ene_back.png`: Ene's views from
  her character sheet, 1024×1024 on white.
- `run_trellis.py`: downloads ComfyUI, links the model repos mounted as volumes
  (Comfy-Org/TRELLIS.2, Comfy-Org/Pixal3D, Comfy-Org/BiRefNet, Comfy-Org/MoGe),
  converts the official "Pixal3D & TRELLIS.2: Image to Model" template to an API
  prompt, runs it on one image and uploads the GLB and texture previews to the
  `Jdmiami/stickerwild-3d` dataset. Settings come from the environment:
  `IMAGE`, `TAG`, `TEX_RES`, `USE_TRELLIS` (1 for TRELLIS.2, 0 for Pixal3D).

The game does not load these yet; they are the source for the sprite sheets of a
later release.
