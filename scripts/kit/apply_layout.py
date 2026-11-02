#!/usr/bin/env python3
"""Write a fitted puff layout (from silfit.py) into a cube tree's table in trees.js.
Usage: apply_layout.py <large|small> <layout.json>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
size, path = sys.argv[1], sys.argv[2]
layout = json.loads(Path(path).read_text())
p = ROOT / 'src/kit/families/trees.js'
s = p.read_text()
m = re.search(r"(  " + size + r": \{\n    trunk: [^\n]*\n)(?:    // [^\n]*\n)?    puffs: \[\n.*?\n    \],\n", s, re.S)
rows = ",\n".join("      [" + ", ".join(f"{v:.3f}" for v in r) + "]" for r in layout)
s = s[:m.start()] + m.group(1) + "    // Fitted to the reference silhouette with scripts/kit/silfit.py.\n    puffs: [\n" + rows + ",\n    ],\n" + s[m.end():]
p.write_text(s)
print(f'wrote {len(layout)} puffs to {size}')
