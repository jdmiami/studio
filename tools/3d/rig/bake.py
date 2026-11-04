# Step 8: bake the clips into the GLB as glTF animations by reading the posed local quaternions off the pose bench,
# so aim entries and plain rotations bake alike. usage: bake.py <rigged.glb> <clips.json> <out.glb>
import json, os, subprocess, time, sys, shutil, tempfile
import numpy as np
from playwright.sync_api import sync_playwright
from pygltflib import GLTF2, Animation, AnimationChannel, AnimationChannelTarget, AnimationSampler, Accessor, BufferView
HERE = os.path.dirname(os.path.abspath(__file__))
glb, clipsf, dst = sys.argv[1:4]; clips = json.load(open(clipsf))
d = tempfile.mkdtemp(); shutil.copy(glb, d + '/rigged.glb'); shutil.copy(os.path.join(HERE, 'pose.html'), d + '/pose.html')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8770', '--bind', '127.0.0.1', '--directory', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
baked = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 64, 'height': 64}); pg.goto('http://127.0.0.1:8770/pose.html'); pg.wait_for_function('window.ready === true', timeout=120000)
    for name, frames in clips.items():
        baked[name] = []
        for f in frames:
            pg.evaluate('([s, l]) => window.pose(s, false, l)', [f['spec'], f['lift']]); baked[name].append(pg.evaluate('window.poseQuats()'))
    b.close()
srv.terminate(); print('baked', {k: len(v) for k, v in baked.items()}, flush=True)
g = GLTF2().load(glb); blob = bytearray(g.binary_blob()); joints = g.skins[0].joints; names = {g.nodes[j].name: j for j in joints}
def add_accessor(arr, typ, minmax=False):
    data = np.asarray(arr, dtype='f4').tobytes(); off = len(blob)
    while off % 4: blob.append(0); off += 1
    blob.extend(data); g.bufferViews.append(BufferView(buffer=0, byteOffset=off, byteLength=len(data)))
    a = Accessor(bufferView=len(g.bufferViews) - 1, componentType=5126, count=len(arr), type=typ)
    if minmax: a.min = [float(np.min(arr))]; a.max = [float(np.max(arr))]
    g.accessors.append(a); return len(g.accessors) - 1
for name, frames in baked.items():
    fps = 8 if name in ('walk', 'idle') else 10; loop = len(frames) > 1; seq = frames + ([frames[0]] if loop else [])
    t_acc = add_accessor([[i / fps] for i in range(len(seq))], 'SCALAR', minmax=True); anim = Animation(name=name, samplers=[], channels=[])
    for bn, node in names.items():
        qs = [fr[bn] for fr in seq]
        if all(np.allclose(q, qs[0], atol=1e-6) for q in qs) and np.allclose(qs[0], g.nodes[node].rotation or [0, 0, 0, 1], atol=1e-6): continue
        anim.samplers.append(AnimationSampler(input=t_acc, output=add_accessor(qs, 'VEC4'), interpolation='LINEAR'))
        anim.channels.append(AnimationChannel(sampler=len(anim.samplers) - 1, target=AnimationChannelTarget(node=node, path='rotation')))
    hips = [fr['__hips'] for fr in seq]
    anim.samplers.append(AnimationSampler(input=t_acc, output=add_accessor(hips, 'VEC3'), interpolation='LINEAR'))
    anim.channels.append(AnimationChannel(sampler=len(anim.samplers) - 1, target=AnimationChannelTarget(node=names['bone_0'], path='translation')))
    g.animations.append(anim); print(name, 'channels', len(anim.channels), flush=True)
g.buffers[0].byteLength = len(blob); g.set_binary_blob(bytes(blob)); g.save(dst); print('saved', dst, len(blob), flush=True)
