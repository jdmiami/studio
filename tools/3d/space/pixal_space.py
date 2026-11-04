# Step 2b: the official Pixal3D Space (TencentARC/Pixal3D, ZeroGPU) on an RGBA cut-out -> GLB.
# The client must not auto-download every returned file (a preview is served 403), so the GLB is fetched by hand.
# usage: python3 pixal_space.py <rgba.png> <out_dir>
import os, sys, time, json, re
import httpx
from gradio_client import Client, handle_file
img, out_dir = sys.argv[1], sys.argv[2]; os.makedirs(out_dir, exist_ok=True)
t0 = time.time()
def log(*a): print(f'[{time.time()-t0:6.1f}s]', *[str(x)[:400] for x in a], flush=True)
tok = os.environ.get('HF_TOKEN') or None
c = Client('TencentARC/Pixal3D', token=tok, download_files=False); log('connected')
res = c.predict(image=handle_file(img), seed=42, resolution='1024', ss_guidance_strength=7.5, ss_guidance_rescale=0.7, ss_sampling_steps=12, ss_rescale_t=5.0,
    shape_slat_guidance_strength=7.5, shape_slat_guidance_rescale=0.5, shape_slat_sampling_steps=12, shape_slat_rescale_t=3.0,
    tex_slat_guidance_strength=1.0, tex_slat_guidance_rescale=0.0, tex_slat_sampling_steps=12, tex_slat_rescale_t=3.0, manual_fov=-1.0, fov_unit='deg', session_id='sw', api_name='/generate_3d')
log('generated')
flat = []
def walk(o):
    if isinstance(o, dict):
        if 'path' in o: flat.append(o['path'])
        if isinstance(o.get('url'), str): flat.append(o['url'])
        for v in o.values(): walk(v)
    elif isinstance(o, (list, tuple)):
        for v in o: walk(v)
    elif isinstance(o, str): flat.append(o)
walk(res)
state = next((p for p in flat if isinstance(p, str) and re.search(r'state|\.pt$|\.pkl$|\.npz$|\.pth$', p)), None); log('state', state)
res2 = c.predict(state_path=state, decimation_target=200000, texture_size=2048, session_id='sw', api_name='/extract_glb_api'); log('extracted')
flat = []; walk(res2)
hdr = {'Authorization': f'Bearer {tok}'} if tok else {}
for p in [p for p in flat if isinstance(p, str) and p.endswith('.glb')]:
    url = p if p.startswith('http') else f'https://tencentarc-pixal3d.hf.space/gradio_api/file={p}'
    r = httpx.get(url, headers=hdr, timeout=300, follow_redirects=True); log('GET', r.status_code, len(r.content))
    if r.status_code == 200:
        dst = os.path.join(out_dir, 'model.glb'); open(dst, 'wb').write(r.content); log('saved', dst, len(r.content)); break
log('done')
