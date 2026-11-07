# Step 1 (general form): Qwen-Image-Edit-2509 through the LoRAs-Fast Space, for any edit prompt.
# usage: edit.py <in.png> <out.png> <lora> <seed> <prompt>     (lora: Relight, Multiple-Angles, Next-Scene, ...)
# The T-pose references were made with it: the figurine prompt plus "standing in a T-pose, arms straight out to the
# sides, fingers spread, legs slightly apart" (Relight, seed 41), then Multiple-Angles for the 45° and 90° views and
# a Relight back-view prompt (seed 53).
import os, sys, time, base64
from gradio_client import Client
img, dst, lora, seed, prompt = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
t0 = time.time()
def log(*a): print(f'[{time.time()-t0:6.1f}s]', *[str(x)[:300] for x in a], flush=True)
c = Client('prithivMLmods/Qwen-Image-Edit-2509-LoRAs-Fast', token=os.environ.get('HF_TOKEN') or None); log('connected')
b64 = 'data:image/png;base64,' + base64.b64encode(open(img, 'rb').read()).decode()
res = c.predict(image_b64=b64, prompt=prompt, lora_adapter=lora, seed=seed, randomize_seed=False, guidance_scale=1.0, steps=8, api_name='/edit_image')
open(dst, 'wb').write(base64.b64decode(res['image'].split(',', 1)[1])); log('saved', dst, os.path.getsize(dst)); log('done')
