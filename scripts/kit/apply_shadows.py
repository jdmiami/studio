#!/usr/bin/env python3
"""Write a shadowfit.py result into a family's SHADOWS table (cast: false, fitted colour and blobs),
keeping any per-element contact strength already there.
Usage: apply_shadows.py <family> <fit.json>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
family, fit = sys.argv[1], json.loads(Path(sys.argv[2]).read_text())
color = fit.pop('_color')
path = ROOT / f'src/kit/families/{family}.js'
text = path.read_text()
start = text.index('export const SHADOWS = {')
end = text.index('};', start) + 2
old = text[start:end]
members = set(re.findall(r"id: '([^']+)', family: '" + re.escape(family) + "'", (ROOT / 'src/kit/manifest.js').read_text()))
lines = ['export const SHADOWS = {']
for item_id, blobs in fit.items():
    if item_id not in members:
        continue
    m = re.search(r"'" + re.escape(item_id) + r"':.*?contact: ([\d.]+)", old)
    contact = f', contact: {m.group(1)}' if m else ''
    lines.append(f"  '{item_id}': {{ cast: false, color: '{color}', blobs: {json.dumps(blobs, separators=(', ', ': '))}{contact} }},")
lines.append('};')
path.write_text(text[:start] + '\n'.join(lines) + text[end:])
print('\n'.join(lines))
