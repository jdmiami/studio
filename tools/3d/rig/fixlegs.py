# Step 5b: vertices below the knees that carry weight on the other leg's bones get that weight moved to their
# own leg, so a bent knee no longer drags triangles across to the other foot. usage: fixlegs.py <in.glb> <out.glb>
import numpy as np, sys
from pygltflib import GLTF2
src, dst = sys.argv[1], sys.argv[2]
g = GLTF2().load(src); blob = g.binary_blob()
def acc(i):
    a = g.accessors[i]; bv = g.bufferViews[a.bufferView]; comp = {5126: 'f4', 5123: 'u2', 5121: 'u1', 5125: 'u4'}[a.componentType]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a.type]; off = (bv.byteOffset or 0) + (a.byteOffset or 0)
    return np.frombuffer(blob, dtype=comp, count=a.count * n, offset=off).reshape(a.count, n), off, comp
prim = g.meshes[0].primitives[0]; A = prim.attributes
pos, _, _ = acc(A.POSITION); J, joff, jcomp = acc(A.JOINTS_0); Wt, woff, wcomp = acc(A.WEIGHTS_0)
names = [g.nodes[j].name for j in g.skins[0].joints]; idx = {n: i for i, n in enumerate(names)}
legA = [idx[f'bone_{k}'] for k in (38, 39, 40, 41)]; legB = [idx[f'bone_{k}'] for k in (42, 43, 44, 45)]
A2B = dict(zip(legA, legB)); B2A = dict(zip(legB, legA))
dom = J[np.arange(len(J)), Wt.argmax(1)]
xa = pos[dom == legA[1], 0].mean(); xb = pos[dom == legB[1], 0].mean(); print('leg A thigh mean x', round(float(xa), 3), 'leg B', round(float(xb), 3))
mid = (xa + xb) / 2; a_neg = xa < xb
Jn = J.astype(np.int64).copy(); fixed = 0
low = pos[:, 1] < pos[:, 1].min() + 0.45 * (pos[:, 1].max() - pos[:, 1].min())
for i in np.where(low)[0]:
    on_a_side = (pos[i, 0] < mid) == a_neg
    for k in range(4):
        j = Jn[i, k]
        if on_a_side and j in B2A: Jn[i, k] = B2A[j]; fixed += 1
        elif (not on_a_side) and j in A2B: Jn[i, k] = A2B[j]; fixed += 1
print('cross-leg weights moved', fixed)
Wn = Wt.astype(np.float32).copy()
for i in np.where(low)[0]:
    seen = {}
    for k in range(4):
        j = int(Jn[i, k])
        if j in seen: Wn[i, seen[j]] += Wn[i, k]; Wn[i, k] = 0
        else: seen[j] = k
b = bytearray(blob); b[joff:joff + Jn.size * np.dtype(jcomp).itemsize] = Jn.astype(jcomp).tobytes(); b[woff:woff + Wn.size * 4] = Wn.astype('f4').tobytes()
g.set_binary_blob(bytes(b)); g.save(dst); print('saved', dst)
