# Runs the official "Pixal3D & TRELLIS.2: Image to Model" ComfyUI workflow headless on one
# image, with the TRELLIS.2 branch on, and uploads the GLB (and texture previews) to a Hub
# dataset. Models come in as read-only Hub volumes; nothing is downloaded but ComfyUI.
import os, sys, json, time, subprocess, shutil, glob, urllib.request, urllib.error
IN = os.environ.get('IN_DIR', 'https://stickerwild.vercel.app/tools/3d'); OUT_REPO = os.environ.get('OUT_REPO', 'Jdmiami/stickerwild-3d')
IMAGE = os.environ.get('IMAGE', 'ene_front.png'); TAG = os.environ.get('TAG', 'ene')
TEX = int(os.environ.get('TEX_RES', '2048')); USE_TRELLIS = os.environ.get('USE_TRELLIS', '1') == '1'
T0 = time.time(); log = lambda *a: print(f'[{time.time()-T0:7.1f}s]', *a, flush=True)
# the Hub token for the upload: HF_TOKEN, or a 'HF_TOKEN=...' value under any other name
TOKEN = os.environ.get('HF_TOKEN') or next((v.split('=', 1)[1] for v in os.environ.values() if v.startswith('HF_TOKEN=')), None)
if not TOKEN: raise SystemExit('no HF_TOKEN in the job environment: stopping before any GPU work')
log('token found, length', len(TOKEN))

os.makedirs('/work', exist_ok=True); os.chdir('/work')
if not os.path.exists('ComfyUI'):
    import zipfile
    urllib.request.urlretrieve('https://github.com/Comfy-Org/ComfyUI/archive/refs/heads/master.zip', 'comfy.zip')
    zipfile.ZipFile('comfy.zip').extractall('.'); os.rename('ComfyUI-master', 'ComfyUI')
os.chdir('/work/ComfyUI')
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '-r', 'requirements.txt'])
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'huggingface_hub'])
log('ComfyUI installed', open('comfyui_version.py').read().strip())

# models: symlink the mounted Hub repos into ComfyUI's folders
for sub, src in [('diffusion_models', '/hf/trellis/diffusion_models'), ('vae', '/hf/trellis/vae'),
                 ('diffusion_models', '/hf/pixal/diffusion_models'), ('clip_vision', '/hf/pixal/clip_vision'),
                 ('background_removal', '/hf/birefnet/background_removal'), ('geometry_estimation', '/hf/moge/geometry_estimation')]:
    d = f'models/{sub}'; os.makedirs(d, exist_ok=True)
    if os.path.isdir(src):
        for f in os.listdir(src):
            dst = f'{d}/{f}'
            if not os.path.exists(dst): os.symlink(f'{src}/{f}', dst)
    else: log('MISSING volume', src)
for d in ['diffusion_models', 'vae', 'clip_vision', 'background_removal', 'geometry_estimation']: log(d, os.listdir(f'models/{d}'))
os.makedirs('input', exist_ok=True)
if IN.startswith('http'): urllib.request.urlretrieve(f'{IN}/{IMAGE}', f'input/{IMAGE}')
else: shutil.copy(f'{IN}/{IMAGE}', f'input/{IMAGE}')

# the server
srv = subprocess.Popen([sys.executable, 'main.py', '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch', '--dont-print-server'],
                       stdout=open('/work/server.log', 'w'), stderr=subprocess.STDOUT)
def get(path):
    with urllib.request.urlopen('http://127.0.0.1:8188' + path, timeout=60) as r: return json.load(r)
for i in range(180):
    try: get('/system_stats'); break
    except Exception: time.sleep(2)
else:
    print(open('/work/server.log').read()[-4000:]); raise SystemExit('server did not start')
log('server up')
info = get('/object_info')

# the official template (UI format) -> API prompt
TPL = f'{IN}/template.json' if not IN.startswith('http') else ''
if not os.path.exists(TPL):
    TPL = '/work/template.json'
    urllib.request.urlretrieve('https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/3d_pixal3d_trellis2_image_to_model.json', TPL)
tpl = json.load(open(TPL))
links = {l[0]: l for l in tpl['links']}
CTRL = {'fixed', 'increment', 'decrement', 'randomize'}
WIDGET_T = {'INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO'}
prompt = {}
for n in tpl['nodes']:
    t = n['type']
    if t in ('Note', 'MarkdownNote') or n.get('mode', 0) == 4: continue
    if t not in info: log('UNKNOWN node', t); continue
    spec = info[t]['input']; order = list(spec.get('required', {}).items()) + list(spec.get('optional', {}).items())
    linked = {i['name']: i.get('link') for i in n.get('inputs', []) if i.get('link') is not None}
    vals = [v for v in (n.get('widgets_values') or []) if v not in CTRL]
    inputs = {}
    for name, d in order:
        if name in linked:
            l = links[linked[name]]; inputs[name] = [str(l[1]), l[2]]; continue
        ty = d[0]
        is_widget = isinstance(ty, list) or ty in WIDGET_T
        if is_widget and vals: inputs[name] = vals.pop(0)
    prompt[str(n['id'])] = {'class_type': t, 'inputs': inputs}
# our settings
for nid, node in prompt.items():
    c = node['class_type']
    if c == 'LoadImage': node['inputs']['image'] = IMAGE
    if c == 'PrimitiveBoolean': node['inputs']['value'] = USE_TRELLIS
    if c == 'PrimitiveInt': node['inputs']['value'] = TEX
    if c == 'Save3DAdvanced': node['inputs']['filename_prefix'] = f'3d/{TAG}'
    if c == 'RemeshMesh': node['inputs']['resolution'] = min(node['inputs'].get('resolution', 768), 512)   # lighter post-processing for a game asset
    if c == 'DecimateMesh': node['inputs']['target_face_count'] = 200000
json.dump(prompt, open(f'/work/prompt_{TAG}.json', 'w'), indent=1)
log('prompt nodes', len(prompt))

req = urllib.request.Request('http://127.0.0.1:8188/prompt', data=json.dumps({'prompt': prompt, 'client_id': 'job'}).encode(), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=120) as r: res = json.load(r)
except urllib.error.HTTPError as e:
    body = e.read().decode(); print(body[:6000]); raise SystemExit('prompt rejected')
pid = res['prompt_id']; log('queued', pid, 'node_errors', res.get('node_errors'))
done = None
for i in range(2400):
    h = get(f'/history/{pid}')
    if pid in h:
        st = h[pid].get('status', {})
        if st.get('completed') or st.get('status_str') in ('success', 'error'): done = h[pid]; break
    time.sleep(2)
    if i % 30 == 0:
        q = get('/queue'); log('running', len(q.get('queue_running', [])), 'pending', len(q.get('queue_pending', [])))
if not done: raise SystemExit('timed out')
log('status', json.dumps(done.get('status'))[:3000])
srv.terminate()
outs = sorted(glob.glob('output/**/*', recursive=True))
outs = [f for f in outs if os.path.isfile(f)]
log('outputs', [(f, os.path.getsize(f)) for f in outs])
print(open('/work/server.log').read()[-3000:])
from huggingface_hub import HfApi
api = HfApi(token=TOKEN)
up = [f for f in outs if f.endswith(('.glb', '.png', '.jpg'))]
for f in up:
    api.upload_file(path_or_fileobj=f, path_in_repo=f'out/{TAG}/{os.path.basename(f)}', repo_id=OUT_REPO, repo_type='dataset')
api.upload_file(path_or_fileobj=f'/work/prompt_{TAG}.json', path_in_repo=f'out/{TAG}/prompt.json', repo_id=OUT_REPO, repo_type='dataset')
api.upload_file(path_or_fileobj='/work/server.log', path_in_repo=f'out/{TAG}/server.log', repo_id=OUT_REPO, repo_type='dataset')
log('uploaded', len(up), 'files to', OUT_REPO)
