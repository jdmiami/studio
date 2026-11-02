#!/usr/bin/env python3
"""Stack the reference sheet above a full kit render (both at the render's size) for a by-eye check.

Usage: compare_sheet.py <render.png> <out.png>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
render = Image.open(sys.argv[1]).convert('RGB')
reference = Image.open(ROOT / 'docs/reference/asset-kit.jpg').convert('RGB').resize(render.size, Image.Resampling.LANCZOS)
gap = 28
out = Image.new('RGB', (render.width, render.height * 2 + gap * 2), (245, 245, 245))
draw = ImageDraw.Draw(out)
draw.text((8, 8), 'reference: docs/reference/asset-kit.jpg', fill=(40, 40, 40))
out.paste(reference, (0, gap))
draw.text((8, render.height + gap + 8), f'render: {sys.argv[1]}', fill=(40, 40, 40))
out.paste(render, (0, render.height + gap * 2))
out.save(sys.argv[2])
print(f'saved {sys.argv[2]}')
