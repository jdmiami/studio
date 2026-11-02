#!/usr/bin/env python3
"""Compose one full-sheet render from per-scene renders (a full kit render with the warp is too slow
to take in one go): each element's padded box is copied from the render of the scene it was tested
in, so the result reads like the whole kit rendered at once.

Usage: compose_sheet.py <out.png> <render.png>:<family,family> [<render.png>:<families> ...]
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pixel_test import load_items  # noqa: E402

PAD = 8


def main():
    out_path, specs = sys.argv[1], sys.argv[2:]
    items = load_items()
    canvas = None
    for spec in specs:
        path, families = spec.rsplit(':', 1)
        render = Image.open(path).convert('RGB')
        if canvas is None:
            canvas = render.copy()
        scale = render.width / 512
        for it in items:
            if it['family'] not in families.split(','):
                continue
            x0, y0, x1, y1 = it['box']
            box = tuple(round(v * scale) for v in (x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD))
            canvas.paste(render.crop(box), box[:2])
    canvas.save(out_path)
    print(f'saved {out_path}')


if __name__ == '__main__':
    main()
