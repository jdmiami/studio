#!/usr/bin/env python3
"""Where an element's render departs from the reference, aligned as pixel_test aligns it:
reference | render | signed luma error (red: render too dark, blue: too light) | chroma error
(where the hue or saturation is off, whatever the lightness), all enlarged. Prints the largest
coherent error blobs so the next fix can target them.

Usage: diffmap.py <render.png> <id> [<id> ...] [--out dir] [--zoom 8]
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from pixel_test import REFERENCE, evaluate, load_items, srgb_to_lab  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def blur(a, r=1):
    out = np.zeros_like(a)
    n = 0
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out += np.roll(np.roll(a, dy, 0), dx, 1)
            n += 1
    return out / n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('render')
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--out', default=str(ROOT / 'screenshots/kit/progress'))
    ap.add_argument('--zoom', type=int, default=8)
    args = ap.parse_args()
    ref_img = np.asarray(Image.open(REFERENCE).convert('RGB'), dtype=np.float64)
    ren2x = np.asarray(Image.open(args.render).convert('RGB'), dtype=np.float64)
    items = {it['id']: it for it in load_items()}
    z = args.zoom
    for item_id in args.ids:
        _, ref, ren, _, _ = evaluate(ref_img, ren2x, items[item_id])
        lab_ref, lab_ren = srgb_to_lab(ref), srgb_to_lab(ren)
        dl = lab_ren[..., 0] - lab_ref[..., 0]
        dab = lab_ren[..., 1:] - lab_ref[..., 1:]
        h, w = dl.shape
        dark, light = np.clip(-dl / 15, 0, 1) * 230, np.clip(dl / 15, 0, 1) * 230
        lum = 255 - np.stack([light, dark + light, dark], -1)  # too dark -> red, too light -> blue
        chroma = np.hypot(dab[..., 0], dab[..., 1])
        chroma_img = 255 - np.stack([np.zeros_like(chroma), np.clip(chroma / 12, 0, 1) * 200, np.clip(chroma / 12, 0, 1) * 200], -1)
        tiles = [ref, ren, lum, chroma_img]
        board = Image.new('RGB', (len(tiles) * (w * z + 6), h * z + 20), 'white')
        draw = ImageDraw.Draw(board)
        for k, (t, name) in enumerate(zip(tiles, ['reference', 'render', 'luma (red=too dark, blue=too light)', 'chroma error'])):
            img = Image.fromarray(np.clip(t, 0, 255).astype(np.uint8)).resize((w * z, h * z), Image.Resampling.NEAREST)
            board.paste(img, (k * (w * z + 6), 20))
            draw.text((k * (w * z + 6) + 4, 4), name, fill='black')
        out = Path(args.out) / f'diff-{item_id}.png'
        board.save(out)
        # Coherent errors: 3x3-smoothed signed luma error; report the strongest spots (row, col
        # in reference px within the crop) and what they are.
        sm = blur(dl)
        cm = blur(chroma)
        print(f'{item_id}: |dL| mean {np.abs(dl).mean():.2f}  chroma mean {chroma.mean():.2f}  -> {out}')
        for name, field in (('too dark', -sm), ('too light', sm), ('chroma', cm)):
            f = field.copy()
            spots = []
            for _ in range(4):
                y, x = np.unravel_index(np.argmax(f), f.shape)
                if f[y, x] < 3:
                    break
                d = dab[y, x]
                spots.append(f'({x},{y}) {f[y, x]:.1f}' + (f' da{d[0]:+.0f} db{d[1]:+.0f}' if name == 'chroma' else ''))
                f[max(0, y - 3):y + 4, max(0, x - 3):x + 4] = 0
            print(f'   {name:9s}: ' + '  '.join(spots))


if __name__ == '__main__':
    main()
