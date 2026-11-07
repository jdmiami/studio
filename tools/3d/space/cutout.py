# Cut a character out of a sheet view or a figurine render: flood the bright, low-saturation paper (and a white
# sticker border or a soft floor shadow) in from the image edges, keep the largest enclosed blob, shave the edge.
# usage: python3 cutout.py <in.png> <out_rgba.png> [erode_px=9]
import sys
from collections import deque
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
erode = int(sys.argv[3]) if len(sys.argv) > 3 else 9
im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
def bright(p):
    mx, mn = max(p), min(p)
    return mx > 150 and (mx - mn) < 40
bg = bytearray(W * H); q = deque()
for x in range(W):
    for y in (0, H - 1):
        if bright(px[x, y]) and not bg[y * W + x]: bg[y * W + x] = 1; q.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        if bright(px[x, y]) and not bg[y * W + x]: bg[y * W + x] = 1; q.append((x, y))
while q:
    x, y = q.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < W and 0 <= ny < H and not bg[ny * W + nx] and bright(px[nx, ny]): bg[ny * W + nx] = 1; q.append((nx, ny))
mask = Image.frombytes('L', (W, H), bytes(255 - 255 * v for v in bg))
# keep only the largest connected blob of foreground (drops loose bits like the flower on Ene's sheet)
lab = mask.load(); seen = bytearray(W * H); best = []
for sy in range(H):
    for sx in range(W):
        if lab[sx, sy] and not seen[sy * W + sx]:
            comp = []; q.append((sx, sy)); seen[sy * W + sx] = 1
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H and lab[nx, ny] and not seen[ny * W + nx]: seen[ny * W + nx] = 1; q.append((nx, ny))
            if len(comp) > len(best): best = comp
keep = Image.new('L', (W, H), 0); kp = keep.load()
for x, y in best: kp[x, y] = 255
keep = keep.filter(ImageFilter.MinFilter(erode)).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert('RGBA'); out.putalpha(keep)
bb = keep.getbbox(); out = out.crop(bb)
side = int(max(out.size) * 1.15); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(out, ((side - out.size[0]) // 2, (side - out.size[1]) // 2))
sq = sq.resize((1024, 1024), Image.LANCZOS); sq.save(dst)
print('fg pixels', len(best), 'bbox', bb, 'saved', dst)
