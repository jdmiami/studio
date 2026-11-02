#!/usr/bin/env python3
"""A before | after sheet of the art loop's views (scripts/game/sdf-compare.mjs output).

Rows are the views (painting, nest, creature, trip), columns the labels given (e.g. m0 m1), each
cell captioned. The painting row also shows the reference painting itself in a first column.

Usage: art_sheet.py <dir> <out.png> <label> [<label> ...]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

VIEWS = ['painting', 'nest', 'creature', 'trip']
REF = Path(__file__).resolve().parents[2] / 'docs/reference/cave-door.jpg'
W, H = 512, 286


def main():
    d, out, *labels = sys.argv[1:]
    d = Path(d)
    cols = ['reference'] + labels
    sheet = Image.new('RGB', (W * len(cols), (H + 22) * len(VIEWS) + 4), '#f3e3d8')
    draw = ImageDraw.Draw(sheet)
    for r, view in enumerate(VIEWS):
        for c, label in enumerate(cols):
            if label == 'reference':
                if view != 'painting':
                    continue
                path = REF
            else:
                path = d / f'{label}-{view}.png'
            if not path.exists():
                continue
            img = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
            y = r * (H + 22) + 22
            sheet.paste(img, (c * W, y))
            draw.text((c * W + 8, y - 18), f'{label} / {view}', fill='#6b4c42')
    sheet.save(out)
    print(out)


if __name__ == '__main__':
    main()
