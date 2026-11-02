"""Scores a game frame against the target shot (docs/reference/target-shot.jpg).

Usage: python3 scripts/shot/score.py <render.png> <out_dir> [label] [--depth-model path.onnx]

Both frames are compared at half size (562 x 990) with the HUD boxes masked out. Metrics:
- colour: CIEDE2000 mean / p90 (and a heat map), lightness and chroma statistics, warm/cool error
- structure: luma SSIM, edge recall / precision (2 px tolerance)
- detail: correlation of the fine-detail (Laplacian energy) maps
- attention: correlation of the spectral-residual saliency maps
- layout: learned depth (Depth Anything V2) of both frames, aligned by scale and shift; the
  correlation and the mean absolute error of the aligned inverse depth
- per element: mean colour difference inside each target mask (docs/reference/target-shot/masks.png)

Writes <out_dir>/<label>-score.json and <label>-sheet.jpg (the frames and heat maps side by side).
"""
import argparse, json, sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/kit'))
from pixel_test import ciede2000, srgb_to_lab, ssim  # noqa: E402

TARGET = ROOT / 'docs/reference/target-shot.jpg'
REF = ROOT / 'docs/reference/target-shot'
W, H = 562, 990


def load_rgb(path):
    bgr = cv2.imread(str(path))
    return cv2.cvtColor(cv2.resize(bgr, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB).astype(np.float64)


def hud_mask():
    boxes = json.loads((REF / 'boxes.json').read_text())
    m = np.ones((H, W), bool)
    for k, (x0, y0, x1, y1) in boxes.items():
        if k.startswith('hud'):
            m[y0 // 2:y1 // 2, x0 // 2:x1 // 2] = False
    return m


def edges(rgb):
    g = cv2.GaussianBlur(cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY), (3, 3), 0)
    return cv2.Canny(g, 40, 110) > 0


def detail(rgb):
    g = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    return cv2.GaussianBlur(np.abs(cv2.Laplacian(g, cv2.CV_32F)), (0, 0), 9)


def saliency(rgb):
    g = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    small = cv2.resize(g, (128, int(128 * H / W)))
    F = np.fft.fft2(small)
    la = np.log(np.abs(F) + 1e-6)
    sr = la - cv2.blur(la, (3, 3))
    s = np.abs(np.fft.ifft2(np.exp(sr + 1j * np.angle(F)))) ** 2
    s = cv2.GaussianBlur(s, (0, 0), 3)
    return cv2.resize(s / s.max(), (W, H))


def depth(rgb, model):
    import onnxruntime as ort
    sess = depth.sess = getattr(depth, 'sess', None) or ort.InferenceSession(model, providers=['CPUExecutionProvider'])
    inp = sess.get_inputs()[0]
    x = cv2.resize((rgb / 255).astype(np.float32), (518, 518), interpolation=cv2.INTER_AREA)
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    d = sess.run(None, {inp.name: x})[0].squeeze()
    return cv2.resize(d.astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)


def corr(a, b, m):
    a, b = a[m].ravel(), b[m].ravel()
    a = a - a.mean(); b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def heat(x, lo, hi, cmap=cv2.COLORMAP_INFERNO):
    n = np.clip((x - lo) / (hi - lo), 0, 1)
    return cv2.cvtColor(cv2.applyColorMap((n * 255).astype(np.uint8), cmap), cv2.COLOR_BGR2RGB)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('render'); ap.add_argument('out'); ap.add_argument('label', nargs='?', default='now')
    ap.add_argument('--depth-model', default=str(ROOT / '.cache/models/depth_anything_v2_vits.onnx'))
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    t, r = load_rgb(TARGET), load_rgb(a.render)
    m = hud_mask()
    lt, lr = srgb_to_lab(t), srgb_to_lab(r)
    de = ciede2000(lt, lr)
    res = {'label': a.label}
    res['colour'] = {'meanDE': round(float(de[m].mean()), 2), 'p90DE': round(float(np.percentile(de[m], 90)), 2)}
    C = lambda lab: np.hypot(lab[..., 1], lab[..., 2])
    warm = lambda lab: lab[..., 2] * 0.8 + lab[..., 1] * 0.4
    for name, x in (('target', lt), ('render', lr)):
        res['colour'][name] = {'L_mean': round(float(x[..., 0][m].mean()), 1), 'L_p5': round(float(np.percentile(x[..., 0][m], 5)), 1),
                               'L_p95': round(float(np.percentile(x[..., 0][m], 95)), 1), 'chroma': round(float(C(x)[m].mean()), 1),
                               'warmth': round(float(warm(x)[m].mean()), 1)}
    res['colour']['warmth_map_corr'] = round(corr(warm(lt), warm(lr), m), 3)
    gt = cv2.cvtColor(t.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float64)
    gr = cv2.cvtColor(r.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float64)
    res['structure'] = {'ssim': round(float(ssim(gt, gr)), 3)}
    et, er = edges(t) & m, edges(r) & m
    k = np.ones((5, 5), np.uint8)
    res['structure']['edge_recall'] = round(float((et & (cv2.dilate(er.astype(np.uint8), k) > 0)).sum() / max(1, et.sum())), 3)
    res['structure']['edge_precision'] = round(float((er & (cv2.dilate(et.astype(np.uint8), k) > 0)).sum() / max(1, er.sum())), 3)
    dt, dr = detail(t), detail(r)
    res['detail_corr'] = round(corr(dt, dr, m), 3)
    st, sr = saliency(t), saliency(r)
    res['saliency_corr'] = round(corr(st, sr, m), 3)
    zt = zr = None
    if Path(a.depth_model).exists():
        zt, zr = depth(t, a.depth_model), depth(r, a.depth_model)
        A = np.stack([zr[m], np.ones(m.sum())], 1)
        s, b = np.linalg.lstsq(A, zt[m], rcond=None)[0]
        zr_al = zr * s + b
        res['depth'] = {'corr': round(corr(zt, zr, m), 3), 'mae_aligned': round(float(np.abs(zr_al - zt)[m].mean() / (zt[m].std() + 1e-9)), 3)}
    masks = cv2.resize(cv2.imread(str(REF / 'masks.png'), 0), (W, H), interpolation=cv2.INTER_NEAREST)
    legend = json.loads((REF / 'masks.json').read_text())
    res['elements'] = {v['name']: round(float(de[masks == int(i)].mean()), 1) for i, v in legend.items() if (masks == int(i)).sum() > 20}
    (out / f'{a.label}-score.json').write_text(json.dumps(res, indent=1))

    # The sheet: target | render | colour difference | warm-cool (target, render) | depth (target, render) | saliency
    tiles = [t.astype(np.uint8), r.astype(np.uint8), heat(np.where(m, de, 0), 0, 30)]
    tiles += [heat(warm(lt), -15, 25, cv2.COLORMAP_JET), heat(warm(lr), -15, 25, cv2.COLORMAP_JET)]
    if zt is not None:
        n = lambda z: (z - z[m].min()) / (np.ptp(z[m]) + 1e-9)
        tiles += [heat(n(zt), 0, 1, cv2.COLORMAP_TURBO), heat(n(zr), 0, 1, cv2.COLORMAP_TURBO)]
    tiles += [heat(st, 0, 1, cv2.COLORMAP_JET), heat(sr, 0, 1, cv2.COLORMAP_JET)]
    names = ['target', 'render', 'colour difference', 'warmth: target', 'warmth: render'] + (['depth: target', 'depth: render'] if zt is not None else []) + ['attention: target', 'attention: render']
    small = []
    for img, nm in zip(tiles, names):
        s = cv2.resize(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), (281, 495))
        cv2.putText(s, nm, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 3); cv2.putText(s, nm, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
        small.append(s)
    cols = 5
    while len(small) % cols: small.append(np.full_like(small[0], 245))
    sheet = np.vstack([np.hstack(small[i:i + cols]) for i in range(0, len(small), cols)])
    cv2.imwrite(str(out / f'{a.label}-sheet.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(json.dumps({k: v for k, v in res.items() if k != 'elements'}))
    print('elements', res['elements'])


if __name__ == '__main__':
    main()
