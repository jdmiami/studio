# Step 7: render every clip in the game's four views to transparent sprite strips (2x game size) + meta.json.
# usage: sprites.py <rigged.glb> <clips.json> <out_dir>
import base64, io, json, os, subprocess, time, sys, shutil, tempfile
from PIL import Image
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
glb, clipsf, out = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(out, exist_ok=True)
clips = json.load(open(clipsf)); VIEWS = {'front': 180, 'threeq': 135, 'side': 90, 'back': 0}
d = tempfile.mkdtemp(); shutil.copy(glb, d + '/rigged.glb'); shutil.copy(os.path.join(HERE, 'pose.html'), d + '/pose.html')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '--bind', '127.0.0.1', '--directory', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
meta = {'frame': [256, 320], 'views': list(VIEWS), 'clips': {}}; t0 = time.time(); contact = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 512, 'height': 640}); pg.goto('http://127.0.0.1:8768/pose.html'); pg.wait_for_function('window.ready === true', timeout=120000)
    for name, frames in clips.items():
        meta['clips'][name] = {'frames': len(frames), 'fps': 8 if name in ('walk', 'idle') else 10}
        for view, deg in VIEWS.items():
            ims = []
            for f in frames:
                pg.evaluate('([s, l]) => window.pose(s, false, l)', [f['spec'], f['lift']])
                u = pg.evaluate(f'window.shot({deg}, 0.1)'); ims.append(Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA').resize((256, 320), Image.LANCZOS))
            strip = Image.new('RGBA', (256 * len(ims), 320), (0, 0, 0, 0))
            for i, im in enumerate(ims): strip.paste(im, (256 * i, 0))
            strip.save(f'{out}/ene_{name}_{view}.png', optimize=True)
            if view in ('front', 'side'): contact.append((f'{name} {view}', ims[0]))
        print(name, 'done', round(time.time() - t0), 's', flush=True)
    b.close()
srv.terminate()
idle = Image.open(f'{out}/ene_idle_front.png').crop((0, 0, 256, 320)); bb = idle.getchannel('A').getbbox(); meta['feet_y'] = bb[3]; meta['bbox_idle_front'] = bb
json.dump(meta, open(f'{out}/meta.json', 'w'), indent=1)
cols = 8; rows = (len(contact) + cols - 1) // cols; sheet = Image.new('RGB', (256 * cols, 320 * rows), '#f6efe4')
for i, (n, im) in enumerate(contact): sheet.paste(im, ((i % cols) * 256, (i // cols) * 320), im)
sheet.save(f'{out}/contact.png', optimize=True); print('all done', round(time.time() - t0), 's', flush=True)
