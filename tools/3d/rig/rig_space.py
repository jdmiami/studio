# Step 4: auto-rig a GLB with UniRig over a Space's Gradio API (Faisal786U/unirig-api runs the official
# UniRig on ZeroGPU: skeleton, skin weights, merge). usage: rig_space.py <model.glb> <out_dir>
import os, sys, time, json
import httpx
from gradio_client import Client, handle_file
glb, out_dir = sys.argv[1], sys.argv[2]; os.makedirs(out_dir, exist_ok=True); t0 = time.time()
def log(*a): print(f'[{time.time()-t0:6.1f}s]', *[str(x)[:400] for x in a], flush=True)
tok = os.environ.get('HF_TOKEN') or None
c = Client('Faisal786U/unirig-api', token=tok, download_files=False); log('connected')
res = c.predict(input_glb=handle_file(glb), api_name='/rig_model'); log('result', json.dumps(res, default=str)[:600])
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
    url = p if p.startswith('http') else f'https://faisal786u-unirig-api.hf.space/gradio_api/file={p}'
    r = httpx.get(url, headers=hdr, timeout=600, follow_redirects=True); log('GET', r.status_code, len(r.content))
    if r.status_code == 200 and len(r.content) > 1000:
        open(os.path.join(out_dir, 'rigged.glb'), 'wb').write(r.content); log('saved'); break
log('done')
