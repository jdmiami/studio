"""Surface classes of the target shot, in the layout fitter's ids (scripts/fp/raster_layout.py):
1 grass, 2 earth, 3 water, 4 floor, 5 door, 6 frame, 7 ceiling, 8 light, 9 prop, 10 mask.

- From the element masks (docs/reference/target-shot/masks.png): pool and cascade -> water, door ->
  door, door pillar -> frame, stairs -> floor, every creature, tree, jar and the explorer -> prop.
- The HUD boxes -> mask.
- The rest by colour and orientation:
  - light: near-white, low chroma (the openings);
  - the ceiling mass above y 470;
  - grass where green (a* < -1.5);
  - floor where light and facing up (the learned depth gets nearer downward), below the solved
    horizon or on the far plaza just above it;
  - every other block face is earth.

Usage: python3 scripts/shot/classes.py [depth.npy]
Writes docs/reference/target-shot/classes.png and classes-preview.jpg.
"""
import json, sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'docs/reference/target-shot'
sys.path.insert(0, str(ROOT / 'scripts/fp'))
from raster_layout import PREVIEW_RGB  # noqa: E402

img = cv2.imread(str(ROOT / 'docs/reference/target-shot.jpg'))
H, W = img.shape[:2]
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
L = lab[..., 0] * 100 / 255
a = lab[..., 1] - 128
b = lab[..., 2] - 128
C = np.hypot(a, b)

depth_path = sys.argv[1] if len(sys.argv) > 1 else None
if depth_path:
    d = np.load(depth_path).astype(np.float32)
else:  # recompute with the learned-depth model
    import subprocess, tempfile
    tmp = Path(tempfile.mkdtemp()) / 'dav2'
    subprocess.run([sys.executable, str(ROOT / 'scripts/shot/learned_depth.py'), str(ROOT / '.cache/models/depth_anything_v2_vits.onnx'),
                    str(ROOT / 'docs/reference/target-shot.jpg'), str(tmp)], check=True)
    d = np.load(str(tmp) + '.npy').astype(np.float32)
ds = cv2.GaussianBlur(d, (0, 0), 4)
gy = cv2.Sobel(ds, cv2.CV_32F, 0, 1, ksize=5) / (np.abs(ds) + 1e-3)
rows = np.arange(H)[:, None].repeat(W, 1)
CEIL_Y, HORIZON = 470, 822  # the ceiling mass ends about here; the solved horizon
green = a < -1.5
bright = L > 60
cls = np.full((H, W), 2, np.uint8)                                   # earth (block faces) by default
cls[(rows < CEIL_Y)] = 7                                             # the ceiling mass
cls[(rows >= CEIL_Y) & green] = 1                                    # grass caps on the terraces and ledges
cls[(rows >= HORIZON) & ~green & bright & (gy > 0.05)] = 4           # light, up-facing ground: floor
cls[(rows >= HORIZON - 120) & (rows < HORIZON) & ~green & (L > 66) & (gy > 0.2)] = 4  # the far plaza
cls[(L > 86) & (C < 10)] = 8                                         # the openings
# Shaded ground near the camera: mostly the lilac floor slabs the explorer stands among (the
# ledges' rose side faces are thin bands under their grass), so floor.
cls[(rows >= 1250) & ~green & (cls == 2)] = 4
masks = cv2.imread(str(REF / 'masks.png'), 0)
legend = {int(k): v['name'] for k, v in json.loads((REF / 'masks.json').read_text()).items()}
for i, name in legend.items():
    m = masks == i
    if name in ('pool', 'cascade'): cls[m] = 3
    elif name == 'door': cls[m] = 5
    elif name == 'door-pillar': cls[m] = 6
    elif name == 'stairs': cls[m & (cls != 2)] = 4
    else: cls[m] = 9
boxes = json.loads((REF / 'boxes.json').read_text())
for k, (x0, y0, x1, y1) in boxes.items():
    if k.startswith('hud'): cls[y0:y1, x0:x1] = 10
# Small speckles join their surroundings (a 9 px majority filter on the open surface classes).
cls = cv2.medianBlur(cls, 9)
cv2.imwrite(str(REF / 'classes.png'), cls)
prev = PREVIEW_RGB[cls][..., ::-1]
over = cv2.addWeighted(img, 0.45, prev.astype(np.uint8), 0.55, 0)
cv2.imwrite(str(REF / 'classes-preview.jpg'), np.hstack([cv2.resize(prev.astype(np.uint8), (450, 792)), cv2.resize(over, (450, 792))]), [cv2.IMWRITE_JPEG_QUALITY, 85])
names = ['none', 'grass', 'earth', 'water', 'floor', 'door', 'frame', 'ceiling', 'light', 'prop', 'mask']
print({names[i]: round(float((cls == i).mean()), 3) for i in range(11) if (cls == i).any()})
