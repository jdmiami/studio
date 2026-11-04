# Step 5: clean UniRig's skin weights for a toy figure with big hair.
# - hair vertices (dark or purple in the texture, after a neighbour vote over the mesh) follow the head bone,
#   so a swinging arm never tugs the hair and a turning head carries all of it;
# - everything above the chin follows the head too, so nods and turns never tear the face.
# usage: fixweights.py <rigged.glb> <out.glb> [head_bone neck_bone]
import numpy as np, io, sys, base64
from pygltflib import GLTF2
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
g = GLTF2().load(src); blob = g.binary_blob()
def acc(i):
    a = g.accessors[i]; bv = g.bufferViews[a.bufferView]; comp = {5126: 'f4', 5123: 'u2', 5121: 'u1', 5125: 'u4'}[a.componentType]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a.type]
    off = (bv.byteOffset or 0) + (a.byteOffset or 0); arr = np.frombuffer(blob, dtype=comp, count=a.count * n, offset=off).reshape(a.count, n)
    return arr, off, comp
prim = g.meshes[0].primitives[0]; A = prim.attributes
pos, _, _ = acc(A.POSITION); uv, _, _ = acc(A.TEXCOORD_0); J, joff, jcomp = acc(A.JOINTS_0); Wt, woff, wcomp = acc(A.WEIGHTS_0)
tx = g.textures[g.materials[0].pbrMetallicRoughness.baseColorTexture.index]
src_i = tx.source if tx.source is not None else next((k for k, i in enumerate(g.images) if i.bufferView is not None or i.uri), 0)
im = g.images[src_i]
if im.bufferView is not None:
    bv = g.bufferViews[im.bufferView]; data = blob[(bv.byteOffset or 0):(bv.byteOffset or 0) + bv.byteLength]
elif im.uri and im.uri.startswith('data:'): data = base64.b64decode(im.uri.split(',', 1)[1])
else: data = open(im.uri, 'rb').read()
tex = Image.open(io.BytesIO(data)).convert('RGB'); T = np.asarray(tex).astype(np.float32) / 255; H, W = T.shape[:2]
u = np.clip((uv[:, 0] % 1) * (W - 1), 0, W - 1).astype(int); v = np.clip((uv[:, 1] % 1) * (H - 1), 0, H - 1).astype(int); col = T[v, u]
lum = col.mean(1); purple = (col[:, 0] > 0.3) & (col[:, 2] > 0.35) & (col[:, 1] < 0.6 * col[:, 2])
hair = (lum < 0.22) | purple
skin = g.skins[0]; joints = skin.joints; names = [g.nodes[j].name for j in joints]; idx = {n: i for i, n in enumerate(names)}
head_name, neck_name = (sys.argv[3], sys.argv[4]) if len(sys.argv) > 4 else ('bone_5', 'bone_4')
head = idx[head_name]
parent = {c: i for i, nd in enumerate(g.nodes) for c in (nd.children or [])}
def world_y(name):
    y = 0.0; ni = joints[idx[name]]
    while ni is not None and g.nodes[ni].name != 'Armature':
        y += (g.nodes[ni].translation or [0, 0, 0])[1]; ni = parent.get(ni)
    return y
neck_y = world_y(neck_name); print('neck y', round(neck_y, 3), 'hair verts', int(hair.sum()), 'of', len(pos))
idxs, _, _ = acc(prim.indices); F = idxs.reshape(-1, 3).astype(np.int64)
nbr_sum = np.zeros(len(pos)); nbr_cnt = np.zeros(len(pos))
for it in range(2):
    h = hair.astype(np.float64); nbr_sum[:] = 0; nbr_cnt[:] = 0
    for a_, b_ in ((0, 1), (1, 2), (2, 0)):
        np.add.at(nbr_sum, F[:, a_], h[F[:, b_]]); np.add.at(nbr_cnt, F[:, a_], 1); np.add.at(nbr_sum, F[:, b_], h[F[:, a_]]); np.add.at(nbr_cnt, F[:, b_], 1)
    vote = nbr_sum / np.maximum(nbr_cnt, 1); hair = (vote > 0.5) | (hair & (vote > 0.3))
Jn = J.astype(np.int64).copy(); Wn = Wt.astype(np.float32).copy()
for i in np.where(hair)[0]: Jn[i] = [head] * 4; Wn[i] = [1.0, 0.0, 0.0, 0.0]
chin = neck_y - 0.004; rigid = (pos[:, 1] > chin) & ~hair
for i in np.where(rigid)[0]: Jn[i] = [head] * 4; Wn[i] = [1.0, 0.0, 0.0, 0.0]
print('hair -> head', int(hair.sum()), 'face -> head', int(rigid.sum()))
s = Wn.sum(1, keepdims=True); s[s == 0] = 1; Wn /= s
b = bytearray(blob); b[joff:joff + Jn.size * np.dtype(jcomp).itemsize] = Jn.astype(jcomp).tobytes(); b[woff:woff + Wn.size * 4] = Wn.astype('f4').tobytes()
g.set_binary_blob(bytes(b)); g.save(dst); print('saved', dst)
