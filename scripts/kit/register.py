#!/usr/bin/env python3
"""Register elements to the reference sheet: print the ANCHORS that remove the test's offsets.

The baked finish samples the sheet where the element stands on the page, so an element that is
offset from its reference position gets its colours misregistered by that offset. This renders the
family, reads each element's best alignment offset from the pixel test, and prints new anchors
(current anchor - offset: a positive offset means the element stands lower/right of the reference). Paste them into the family's ANCHORS and run again until the offsets
are ~0.

Usage: register.py <family> [--current anchors.json]
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
family = sys.argv[1]
png = ROOT / f'screenshots/kit/register-{family}.png'
out = ROOT / f'screenshots/kit/register-{family}.json'
subprocess.run(['node', 'scripts/screenshot.mjs', str(png), '--page=kit.html', '--size=1024x572', f'--query=family={family}'],
               cwd=ROOT, capture_output=True, check=True)
subprocess.run([sys.executable, 'scripts/kit/pixel_test.py', str(png), '--family', family, '--json', str(out)], cwd=ROOT, capture_output=True)
results = json.loads(out.read_text())['results']

# Current anchors: the family's ANCHORS table if present, else the manifest default.
manifest = (ROOT / 'src/kit/manifest.js').read_text()
boxes = {m.group(1): [int(v) for v in m.group(2).split(',')]
         for m in re.finditer(r"id: '([^']+)',.*?box: \[([^\]]+)\]", manifest)}
family_src = (ROOT / f'src/kit/families/{family}.js').read_text()
current = {m.group(1): [float(m.group(2)), float(m.group(3))]
           for m in re.finditer(r"'([^']+)': \[([-\d.]+), ([-\d.]+)\],\s*// anchor", family_src)}
print('export const ANCHORS = {')
for r in results:
    x0, y0, x1, y1 = boxes[r['id']]
    u, v = current.get(r['id'], [(x0 + x1) / 2, y1 - 0.22 * (x1 - x0)])
    dx, dy = r['offset']
    print(f"  '{r['id']}': [{u - dx:.2f}, {v - dy:.2f}], // anchor (offset was {dx:+.1f}, {dy:+.1f})")
print('};')
