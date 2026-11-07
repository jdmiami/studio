# Step 1 of the free pipeline: ask Qwen-Image-Edit-2509 (Rapid AIO, via the LoRAs-Fast Space on ZeroGPU) to
# re-render a flat drawing as a volumetric vinyl figurine. Image-to-3D models read a flat drawing as a flat
# object; they need this volumetric reference. usage: python3 figurine.py <in.png> <out_dir> <lora> <seed> [<character description>]
import os, sys, time, base64
from gradio_client import Client
img, out_dir, lora, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]); os.makedirs(out_dir, exist_ok=True)
who = sys.argv[5] if len(sys.argv) > 5 else 'pink skin, black hair with a purple streak, yellow dress, bare feet, surprised open mouth'
t0 = time.time()
def log(*a): print(f'[{time.time()-t0:6.1f}s]', *[str(x)[:300] for x in a], flush=True)
c = Client('prithivMLmods/Qwen-Image-Edit-2509-LoRAs-Fast', token=os.environ.get('HF_TOKEN') or None); log('connected')
b64 = 'data:image/png;base64,' + base64.b64encode(open(img, 'rb').read()).decode()
prompt = ('Turn this flat 2D cartoon drawing into a 3D rendered vinyl toy figurine of the same character with real volume: '
          'a rounded head, a cylindrical body, rounded arms and legs, thick sculpted hair. Keep exactly the same design, pose, proportions and colors: '
          + who + '. Matte materials, soft studio lighting, front view, plain white background, no black outline strokes, no sticker border.')
res = c.predict(image_b64=b64, prompt=prompt, lora_adapter=lora, seed=seed, randomize_seed=False, guidance_scale=1.0, steps=8, api_name='/edit_image')
data = res['image'].split(',', 1)[1]; dst = os.path.join(out_dir, f'fig_{lora}_{seed}.png'); open(dst, 'wb').write(base64.b64decode(data)); log('saved', dst, os.path.getsize(dst))
log('done')
