# Pose test sheet. usage: render_pose.py <rigged.glb> <poses.json> <out.png>
# poses.json: [{"name": ..., "spec": {bone: [rx, ry, rz]}, "lift": 0, "deg": 180, "el": 0.12}, ...]
import base64, io, json, os, subprocess, time, sys, shutil, tempfile
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
glb, posesf, out = sys.argv[1], sys.argv[2], sys.argv[3]
poses = json.load(open(posesf))
d = tempfile.mkdtemp(); shutil.copy(glb, d + '/rigged.glb'); shutil.copy(os.path.join(HERE, 'pose.html'), d + '/pose.html')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '--bind', '127.0.0.1', '--directory', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
frames = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 512, 'height': 640}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8767/pose.html'); pg.wait_for_function('window.ready === true', timeout=120000)
    print('info', json.dumps(pg.evaluate('window.info'))[:400], 'errs', errs[:3], flush=True)
    for ps in poses:
        pg.evaluate('([s, bg, l]) => window.pose(s, bg, l)', [ps.get('spec', {}), ps.get('bg', True), ps.get('lift', 0)])
        u = pg.evaluate(f"window.shot({ps.get('deg', 180)}, {ps.get('el', 0.12)})")
        im = Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGB'); ImageDraw.Draw(im).text((8, 8), ps.get('name', ''), fill=(40, 30, 50)); frames.append(im)
    b.close()
srv.terminate()
cols = min(4, len(frames)); rows = (len(frames) + cols - 1) // cols; W, H = frames[0].size
sheet = Image.new('RGB', (W * cols, H * rows), '#f6efe4')
for i, f in enumerate(frames): sheet.paste(f, ((i % cols) * W, (i // cols) * H))
sheet.save(out, optimize=True); print('saved', out, os.path.getsize(out), flush=True)
