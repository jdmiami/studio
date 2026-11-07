# Step 3: an 8-angle turntable sheet of a GLB, rendered with three.js in headless Chromium (software GL).
# usage: python3 turntable.py <model.glb> <out.png>   (needs: pip install playwright pillow; python -m playwright install --with-deps chromium)
import base64, io, json, os, subprocess, time, sys, shutil, tempfile
from PIL import Image
from playwright.sync_api import sync_playwright
glb, out = sys.argv[1], sys.argv[2]
d = tempfile.mkdtemp(); shutil.copy(glb, d + '/model.glb'); shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'turntable.html'), d + '/turntable.html')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '--bind', '127.0.0.1', '--directory', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
frames = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 512, 'height': 640}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8766/turntable.html'); pg.wait_for_function('window.ready === true', timeout=120000)
    print('info', json.dumps(pg.evaluate('window.info')), 'errs', errs[:3], flush=True)
    for deg in range(0, 360, 45):
        u = pg.evaluate(f'window.shot({deg})'); frames.append(Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGB'))
    b.close()
srv.terminate()
W, H = frames[0].size; sheet = Image.new('RGB', (W * 4, H * 2), '#f6efe4')
for i, f in enumerate(frames): sheet.paste(f, ((i % 4) * W, (i // 4) * H))
sheet.save(out, optimize=True); print('saved', out, os.path.getsize(out), flush=True)
