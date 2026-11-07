# Ene in 3D on the free path (Hugging Face Spaces, ZeroGPU)

The Jobs pipeline in `../run_trellis.py` needs a rented GPU (an L40S, and it sat in the hardware queue for over
an hour on 2026-11-04 without starting). This folder is the path that costs no GPU credits: the official
image-to-3D Spaces run on ZeroGPU, which a PRO account gets a daily quota of, and the scripts talk to them
through their Gradio APIs. Run them from a Hugging Face sandbox created with `--forward-hf-token` (or anywhere
with `HF_TOKEN` set) after `pip install gradio_client httpx pillow`.

## Why three steps

An image-to-3D model reads a flat drawing as a flat object. Ene's sheet view, even cut out cleanly, came back
as a paper doll from Pixal3D and as a flat card from TRELLIS.2. So the drawing is first re-rendered as a
volumetric toy figure with an image-edit model, and that figure is what gets reconstructed.

| step | script | Space | time (2026-11-04) |
| --- | --- | --- | --- |
| 0 | `cutout.py sheet.png ene_rgba.png 9` | none (flood fill, local) | 2 s |
| 1 | `figurine.py ene_rgba.png fig Relight 21` | prithivMLmods/Qwen-Image-Edit-2509-LoRAs-Fast | 19 s |
| 0 again | `cutout.py fig/fig_Relight_21.png fig_rgba.png 3` | none; drops the floor shadow, which otherwise becomes a plate under her feet | 2 s |
| 2 | `pixal_space.py fig_rgba.png out/pixal` or `trellis_space.py fig_rgba.png out/trellis` | TencentARC/Pixal3D, microsoft/TRELLIS.2 | 100 s / 60 s |
| 2, better | `multiview_rig.py out/mv front.png threeq.png side.png back.png` with a figurine of each sheet view (`figurine.py` takes the view phrase as its fifth argument) | vpyr/pixal3d-multiview-glb | 157 s |
| 3 | `turntable.py out/pixal/model.glb sheet.png` | none (three.js in headless Chromium) | 20 s |

Pixal3D keeps the design most faithfully (pixel-aligned); TRELLIS.2 gives richer hair and shading. The posed
four-view rig is the best of all: the back and profile come from the sheet (the purple hair tips, the pointed ears)
instead of being guessed from the front. The rig uses the Space's own turntable camera formula at yaws 0, 45, 90, 180. Both
GLBs have about 200k triangles with a 2048 px texture, ready for decimation and rigging.

## Notes

- The figurine prompt pins the design (pink skin, black hair with a purple streak, yellow dress, bare feet,
  surprised open mouth); pass another character's description as the fifth argument.
- The Relight LoRA at seed 21 kept Ene's pose and proportions; Next-Scene drifted into a chibi.
- The official Qwen Spaces (`Qwen/Qwen-Image-Edit-2511`) fail silently over the API; the LoRAs-Fast Space works.
- Pixal3D's client must be created with `download_files=False`; one of its preview files is served 403.
- `cpuai/Trellis.2.multiview` (TRELLIS.2 multi-image conditioning) was down with a ModuleNotFoundError on 2026-11-04.
- Results from the first run live in the private dataset `Jdmiami/stickerwild-3d` under `out/ene_*`.
