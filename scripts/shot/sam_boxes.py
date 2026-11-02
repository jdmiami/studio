"""Segment Anything (ViT-B, ONNX export from rembg's GitHub release) masks from box prompts, CPU.

The exported encoder expects a fixed 684 x 1024 (landscape) canvas, so each box gets its own crop:
a landscape window round the box (with margin), scaled into the canvas, segmented with the box as
the prompt, and mapped back to the full image.

Usage: python3 scripts/shot/sam_boxes.py <models_dir> <image> <boxes.json> <out_dir> [name ...]
Writes <out_dir>/<name>.png (255 = inside).
"""
import sys, json, os, cv2, numpy as np, onnxruntime as ort

CH, CW = 684, 1024
mdir, src, bfile, out = sys.argv[1:5]
names = sys.argv[5:]
os.makedirs(out, exist_ok=True)
enc = ort.InferenceSession(f'{mdir}/sam_vit_b_01ec64.encoder.onnx', providers=['CPUExecutionProvider'])
dec = ort.InferenceSession(f'{mdir}/sam_vit_b_01ec64.decoder.onnx', providers=['CPUExecutionProvider'])
img = cv2.cvtColor(cv2.imread(src), cv2.COLOR_BGR2RGB)
H, W = img.shape[:2]
boxes = json.load(open(bfile))
for name in names or boxes:
    x0, y0, x1, y1 = boxes[name]
    # A landscape window centred on the box, at least 1.6x its size, clamped to the image.
    bw, bh = x1 - x0, y1 - y0
    ww = max(bw * 1.6, bh * 1.6 * CW / CH, 160); wh = ww * CH / CW
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    wx0, wy0 = cx - ww / 2, cy - wh / 2
    s = CW / ww
    M = np.array([[s, 0, -wx0 * s], [0, s, -wy0 * s]], np.float32)
    canvas = cv2.warpAffine(img, M, (CW, CH), flags=cv2.INTER_AREA, borderValue=(0, 0, 0)).astype(np.float32)
    emb = enc.run(None, {'input_image': canvas})[0]
    pts = np.array([[[(x0 - wx0) * s, (y0 - wy0) * s], [(x1 - wx0) * s, (y1 - wy0) * s], [0, 0]]], np.float32)
    masks, iou, _ = dec.run(None, {
        'image_embeddings': emb, 'point_coords': pts, 'point_labels': np.array([[2, 3, -1]], np.float32),
        'mask_input': np.zeros((1, 1, 256, 256), np.float32), 'has_mask_input': np.zeros(1, np.float32),
        'orig_im_size': np.array([CH, CW], np.float32)})
    k = int(np.argmax(iou[0]))
    local = (masks[0, k] > 0).astype(np.uint8) * 255
    full = cv2.warpAffine(local, M, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    full = np.where(full > 127, 255, 0).astype(np.uint8)
    cv2.imwrite(f'{out}/{name}.png', full)
    ys, xs = np.nonzero(full)
    print(name, 'iou', round(float(iou[0, k]), 3), 'bbox', (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None, 'box', boxes[name])
