#!/usr/bin/env python3
"""Score a first-person render against the reference frame.

Two independent signals, combined into one number the loop tracks:
  * fidelity     - img2threejs Divine Eye deterministic ensemble (structure, SSIM, edges, tone).
                   Its silhouette gate targets isolated objects, so it is reported but not used.
  * colorLayout  - 1 - mean CIEDE2000-style distance over a 16x9 grid of region means
                   (approximated with CIE76 dE in Lab), scaled so dE 40 -> 0.
  composite      = 0.5 * fidelity + 0.5 * colorLayout

Usage: score.py <reference> <render> [--history docs/loop/history.json --note "..."]
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIVINE_EYE = ROOT / '.claude/skills/img2threejs/forge/stage4_review/divine_eye.py'


def srgb_to_lab(rgb):
    rgb = rgb / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def region_lab(path, grid=(16, 9)):
    img = Image.open(path).convert('RGB').resize(grid, Image.Resampling.BOX)
    return srgb_to_lab(np.asarray(img, dtype=np.float64))


def color_layout(ref, render):
    de = np.linalg.norm(region_lab(ref) - region_lab(render), axis=-1)
    return float(max(0.0, 1.0 - de.mean() / 40.0)), float(de.mean()), de


def divine_eye(ref, render):
    out = subprocess.run([sys.executable, str(DIVINE_EYE), '--reference', str(ref), '--render', str(render), '--json'],
                         capture_output=True, text=True, check=False)
    data = json.loads(out.stdout)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('reference')
    ap.add_argument('render')
    ap.add_argument('--history')
    ap.add_argument('--note', default='')
    ap.add_argument('--summary', action='store_true', help='print a short human summary instead of JSON')
    args = ap.parse_args()

    eye = divine_eye(args.reference, args.render)
    cl, mean_de, de = color_layout(args.reference, args.render)
    fidelity = eye.get('fidelity', 0.0)
    composite = round(0.5 * fidelity + 0.5 * cl, 4)
    worst = np.dstack(np.unravel_index(np.argsort(-de, axis=None)[:4], de.shape))[0].tolist()
    result = {
        'render': args.render,
        'composite': composite,
        'fidelity': fidelity,
        'colorLayout': round(cl, 4),
        'meanDeltaE': round(mean_de, 2),
        'signals': eye.get('signals', {}),
        'worstRegions_row_col_of_9x16': worst,
        'note': args.note,
        'time': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }
    if args.history:
        hist_path = Path(args.history)
        hist = json.loads(hist_path.read_text()) if hist_path.exists() else []
        result['iteration'] = len(hist)
        hist.append(result)
        hist_path.parent.mkdir(parents=True, exist_ok=True)
        hist_path.write_text(json.dumps(hist, indent=1) + '\n')
    if args.summary:
        sig = result['signals']
        print(f"iter {result.get('iteration', '-')}: composite {composite}  fidelity {fidelity}  "
              f"colorLayout {result['colorLayout']} (mean dE {result['meanDeltaE']})")
        print(f"  ssim {sig.get('ssim')}  edges {sig.get('edgeOverlap')}  phash {sig.get('phashSimilarity')}  "
              f"tonal {sig.get('tonalParity')}  flat {sig.get('flatRegionScore')}")
        print(f"  worst regions (row,col of 9x16): {worst}")
    else:
        print(json.dumps(result, indent=1))


if __name__ == '__main__':
    main()
