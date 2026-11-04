# Step 2a: the official TRELLIS.2 Space (microsoft/TRELLIS.2, ZeroGPU) on an RGBA cut-out -> GLB.
# usage: python3 trellis_space.py <rgba.png> <out_dir>
import os, sys, time, shutil
from gradio_client import Client, handle_file
img, out_dir = sys.argv[1], sys.argv[2]; os.makedirs(out_dir, exist_ok=True)
t0 = time.time()
def log(*a): print(f'[{time.time()-t0:6.1f}s]', *[str(x)[:300] for x in a], flush=True)
c = Client('microsoft/TRELLIS.2', token=os.environ.get('HF_TOKEN') or None); log('connected')
c.predict(api_name='/start_session')
c.predict(input=handle_file(img), api_name='/preprocess_image'); log('preprocessed')
c.predict(image=handle_file(img), seed=42, resolution='1024', ss_guidance_strength=7.5, ss_guidance_rescale=0.7, ss_sampling_steps=12, ss_rescale_t=5.0,
    shape_slat_guidance_strength=7.5, shape_slat_guidance_rescale=0.5, shape_slat_sampling_steps=12, shape_slat_rescale_t=3.0,
    tex_slat_guidance_strength=1.0, tex_slat_guidance_rescale=0.0, tex_slat_sampling_steps=12, tex_slat_rescale_t=3.0, api_name='/image_to_3d'); log('generated')
res = c.predict(decimation_target=200000, texture_size=2048, api_name='/extract_glb'); log('extracted')
for p in (res if isinstance(res, (list, tuple)) else [res]):
    if isinstance(p, dict) and 'path' in p: p = p['path']
    if isinstance(p, str) and os.path.isfile(p) and p.endswith('.glb'):
        dst = os.path.join(out_dir, 'model.glb'); shutil.copy(p, dst); log('saved', dst, os.path.getsize(dst)); break
log('done')
