#!/usr/bin/env python3
"""Register elements to the reference sheet: print the ANCHORS that remove the test's offsets.

The baked finish samples the sheet where the element stands on the page, so an element that is
offset from its reference position gets its colours misregistered by that offset. This renders the
family, reads each element's best alignment offset from the pixel test, and prints new anchors
(current anchor - offset: a positive offset means the element stands lower/right of the reference). Paste them into the family's ANCHORS and run again until the offsets
are ~0.

Usage: register.py <family> [--write] [--ids a,b] [--with trees,blocks]
  --write   update the ANCHORS entries in src/kit/families/<family>.js in place
  --with    also render these families (their shadows reach into this family's crops)
  --ids     only these elements
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
family = sys.argv[1]
write = '--write' in sys.argv
only = sys.argv[sys.argv.index('--ids') + 1].split(',') if '--ids' in sys.argv else None
png = ROOT / f'screenshots/kit/register-{family}.png'
out = ROOT / f'screenshots/kit/register-{family}.json'
neighbours = sys.argv[sys.argv.index('--with') + 1] if '--with' in sys.argv else ''
scene = ','.join([family] + [f for f in neighbours.split(',') if f])
subprocess.run(['node', 'scripts/screenshot.mjs', str(png), '--page=kit.html', '--size=1024x572', f'--query=family={scene}'],
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
    if only and r['id'] not in only:
        continue
    x0, y0, x1, y1 = boxes[r['id']]
    u, v = current.get(r['id'], [(x0 + x1) / 2, y1 - 0.22 * (x1 - x0)])
    dx, dy = r['offset']
    print(f"  '{r['id']}': [{u - dx:.2f}, {v - dy:.2f}], // anchor (offset was {dx:+.1f}, {dy:+.1f})")
    if write:
        pattern = r"'" + re.escape(r['id']) + r"': \[[-\d.]+, [-\d.]+\], // anchor"
        family_src, n = re.subn(pattern, f"'{r['id']}': [{u - dx:.2f}, {v - dy:.2f}], // anchor", family_src)
        if n != 1:
            print(f"  (no ANCHORS entry for {r['id']} to update)")
print('};')
if write:
    (ROOT / f'src/kit/families/{family}.js').write_text(family_src)
    print(f'wrote src/kit/families/{family}.js')
