#!/usr/bin/env python3
"""Print the per-region Lab difference (render - reference) on the scorer's 16x9 grid."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from score import region_lab  # noqa: E402

ref = region_lab(sys.argv[1])
ren = region_lab(sys.argv[2])
d = ren - ref
np.set_printoptions(precision=0, suppress=True, linewidth=200)
print('mean dL %.1f  da %.1f  db %.1f' % tuple(d.reshape(-1, 3).mean(0)))
print('chroma ref %.1f  render %.1f' % (np.hypot(ref[..., 1], ref[..., 2]).mean(), np.hypot(ren[..., 1], ren[..., 2]).mean()))
for i, name in enumerate(['dL', 'da', 'db']):
    print(name)
    print(d[..., i])
