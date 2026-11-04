# Step 9: prove the baked glTF animations play. Loads the GLB with three.js AnimationMixer in headless Chromium,
# samples a few clips at a few times from the side and the front, and writes a labelled sheet.
# usage: animcheck.py <rigged_anim.glb> <sheet.png>
import base64, io, json, os, subprocess, time, sys, shutil, tempfile
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
glb, out = sys.argv[1], sys.argv[2]
d = tempfile.mkdtemp(); shutil.copy(glb, d + '/anim.glb'); shutil.copy(os.path.join(HERE, 'anim.html'), d + '/anim.html')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '--bind', '127.0.0.1', '--directory', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
shots = [('walk t=0.0 side', 'walk', 0.0, 90), ('walk t=0.25 side', 'walk', 0.25, 90), ('walk t=0.5 front', 'walk', 0.5, 180), ('run t=0.2 side', 'run', 0.2, 90), ('joy t=0.1 front', 'joy', 0.1, 180), ('point front', 'point', 0.0, 180), ('cry side', 'cry', 0.0, 90), ('jump t=0.1 side', 'jump', 0.1, 90)]
frames = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 512, 'height': 640}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8771/anim.html'); pg.wait_for_function('window.ready === true', timeout=120000); print('info', json.dumps(pg.evaluate('window.info')), 'errs', errs[:2], flush=True)
    for name, clip, t, deg in shots:
        pg.evaluate('([c, t]) => window.play(c, t)', [clip, t]); u = pg.evaluate(f'window.shot({deg})')
        im = Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGB'); ImageDraw.Draw(im).text((8, 8), name, fill=(40, 30, 50)); frames.append(im)
    b.close()
srv.terminate()
sheet = Image.new('RGB', (512 * 4, 640 * 2), '#f6efe4')
for i, f in enumerate(frames): sheet.paste(f, ((i % 4) * 512, (i // 4) * 640))
sheet.save(out, optimize=True); print('saved', out)
