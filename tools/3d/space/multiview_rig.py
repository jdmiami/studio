# Step 2c: posed multi-view Pixal3D (vpyr/pixal3d-multiview-glb, ZeroGPU). Four 3D-style references of the
# same character (front, three-quarter, side, back) go into a calibrated turntable rig, which gives the model
# the real back and profile instead of a guess. usage: python3 multiview_rig.py <out_dir> front.png threeq.png side.png back.png
import os, sys, json, math, zipfile, time
import httpx
from gradio_client import Client, handle_file
out_dir, imgs = sys.argv[1], sys.argv[2:6]; os.makedirs(out_dir, exist_ok=True)
R, FOV = 3.1192049980163574, math.radians(20.0)   # the Space's own fixed-turnaround radius and lens
def c2w(yaw):
    a = math.radians(yaw); c, s = math.cos(a), math.sin(a)
    return [[c, 0.0, s, R * s], [s, 0.0, -c, -R * c], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
yaws = [0.0, 45.0, 90.0, 180.0]
frames = []
for i, (img, yaw) in enumerate(zip(imgs, yaws)):
    f = {'file_path': f'{i:02d}.png', 'transform_matrix': c2w(yaw)}
    if i == 0: f['is_canonical_front'] = True
    frames.append(f)
zp = os.path.join(out_dir, 'rig.zip')
with zipfile.ZipFile(zp, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr('transforms.json', json.dumps({'camera_angle_x': FOV, 'frames': frames}, indent=2))
    for i, img in enumerate(imgs): z.write(img, arcname=f'{i:02d}.png')
t0 = time.time()
def log(*a): print(f'[{time.time()-t0:6.1f}s]', *[str(x)[:300] for x in a], flush=True)
tok = os.environ.get('HF_TOKEN') or None
c = Client('vpyr/pixal3d-multiview-glb', token=tok, download_files=False); log('connected')
res = c.predict(archive=handle_file(zp), seed=42, mesh_scale=1.0, resolution='1024', generate_textured=True, api_name='/generate_calibrated_glb')
log('generated')
flat = []
def walk(o):
    if isinstance(o, dict):
        for k in ('path', 'url'):
            if isinstance(o.get(k), str): flat.append(o[k])
        for v in o.values(): walk(v)
    elif isinstance(o, (list, tuple)):
        for v in o: walk(v)
    elif isinstance(o, str): flat.append(o)
walk(res)
hdr = {'Authorization': f'Bearer {tok}'} if tok else {}
for p in [p for p in flat if p.endswith('.glb')]:
    url = p if p.startswith('http') else f'https://vpyr-pixal3d-multiview-glb.hf.space/gradio_api/file={p}'
    r = httpx.get(url, headers=hdr, timeout=300, follow_redirects=True); log('GET', r.status_code, len(r.content))
    if r.status_code == 200 and len(r.content) > 1000:
        open(os.path.join(out_dir, 'model.glb'), 'wb').write(r.content); log('saved'); break
log('done')
