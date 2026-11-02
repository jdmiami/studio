"""Learned monocular depth for the target shot (Depth Anything V2 small, ONNX, CPU).

Usage: python3 scripts/shot/learned_depth.py <model.onnx> <image> <out_prefix>
Writes <out_prefix>.npy (relative inverse depth: larger = nearer), <out_prefix>.png (turbo) and
<out_prefix>-normals.png (normals from the depth gradients).
"""
import sys, cv2, numpy as np, onnxruntime as ort
model, src, out = sys.argv[1:4]
sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0]
shape = inp.shape
# The export takes a fixed or dynamic 518-multiple; keep the portrait aspect at 518 wide.
h_in = shape[2] if isinstance(shape[2], int) else 518 * 2 // 14 * 14
w_in = shape[3] if isinstance(shape[3], int) else 518
bgr = cv2.imread(src); H, W = bgr.shape[:2]
if not isinstance(shape[2], int):
    w_in = 518; h_in = int(round(518 * H / W / 14)) * 14
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
# A fixed square input: squash the portrait frame into it (the network copes with the stretch far
# better than with the 3x resolution loss of letterboxing), then stretch the result back.
x = cv2.resize(rgb, (w_in, h_in), interpolation=cv2.INTER_AREA)
x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
x = x.transpose(2, 0, 1)[None].astype(np.float32)
d = sess.run(None, {inp.name: x})[0].squeeze()
d = cv2.resize(d.astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
np.save(out + '.npy', d)
n = (d - d.min()) / (d.max() - d.min())
cv2.imwrite(out + '.png', cv2.applyColorMap((n * 255).astype(np.uint8), cv2.COLORMAP_TURBO))
z = cv2.GaussianBlur(n, (0, 0), 2)
gx = cv2.Sobel(z, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(z, cv2.CV_32F, 0, 1, ksize=3)
nm = np.dstack([-gx * 60, -gy * 60, np.ones_like(gx)]); nm /= np.linalg.norm(nm, axis=2, keepdims=True)
cv2.imwrite(out + '-normals.png', ((nm[..., ::-1] * 0.5 + 0.5) * 255).astype(np.uint8))
print('input', inp.name, shape, '->', (h_in, w_in), 'depth range', float(d.min()), float(d.max()))
