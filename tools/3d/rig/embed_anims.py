# Step 8: write the clips into the GLB as glTF animations (a rotation track per bone, hips translation for the lift).
# usage: embed_anims.py <rigged.glb> <clips.json> <out.glb>
import json, math, sys
import numpy as np
from pygltflib import GLTF2, Animation, AnimationChannel, AnimationChannelTarget, AnimationSampler, Accessor, BufferView
src, clipsf, dst = sys.argv[1:4]
g = GLTF2().load(src); blob = bytearray(g.binary_blob()); clips = json.load(open(clipsf))
joints = g.skins[0].joints; names = {g.nodes[j].name: j for j in joints}
def quat_mul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return [aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx, aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz]
def euler_xyz(rx, ry, rz):   # three.js Euler XYZ -> quaternion
    c1, s1 = math.cos(rx/2), math.sin(rx/2); c2, s2 = math.cos(ry/2), math.sin(ry/2); c3, s3 = math.cos(rz/2), math.sin(rz/2)
    return [s1*c2*c3 + c1*s2*s3, c1*s2*c3 - s1*c2*s3, c1*c2*s3 + s1*s2*c3, c1*c2*c3 - s1*s2*s3]
def add_accessor(arr, typ, minmax=False):
    data = np.asarray(arr, dtype='f4').tobytes(); off = len(blob)
    while off % 4: blob.append(0); off += 1
    blob.extend(data); g.bufferViews.append(BufferView(buffer=0, byteOffset=off, byteLength=len(data)))
    a = Accessor(bufferView=len(g.bufferViews) - 1, componentType=5126, count=len(arr), type=typ)
    if minmax: a.min = [float(np.min(arr))]; a.max = [float(np.max(arr))]
    g.accessors.append(a); return len(g.accessors) - 1
for name, frames in clips.items():
    fps = 8 if name in ('walk', 'idle') else 10; loop = len(frames) > 1; seq = frames + ([frames[0]] if loop else [])
    t_acc = add_accessor([[i / fps] for i in range(len(seq))], 'SCALAR', minmax=True)
    anim = Animation(name=name, samplers=[], channels=[])
    for b in sorted({b for f in frames for b in f['spec']}):
        rest = g.nodes[names[b]].rotation or [0, 0, 0, 1]
        qs = [quat_mul(rest, euler_xyz(*[math.radians(x) for x in f['spec'].get(b, [0, 0, 0])])) for f in seq]
        anim.samplers.append(AnimationSampler(input=t_acc, output=add_accessor(qs, 'VEC4'), interpolation='LINEAR'))
        anim.channels.append(AnimationChannel(sampler=len(anim.samplers) - 1, target=AnimationChannelTarget(node=names[b], path='rotation')))
    base = g.nodes[names['bone_0']].translation or [0, 0, 0]
    anim.samplers.append(AnimationSampler(input=t_acc, output=add_accessor([[base[0], base[1] + f['lift'], base[2]] for f in seq], 'VEC3'), interpolation='LINEAR'))
    anim.channels.append(AnimationChannel(sampler=len(anim.samplers) - 1, target=AnimationChannelTarget(node=names['bone_0'], path='translation')))
    g.animations.append(anim); print(name, 'channels', len(anim.channels))
g.buffers[0].byteLength = len(blob); g.set_binary_blob(bytes(blob)); g.save(dst); print('saved', dst, len(blob))
