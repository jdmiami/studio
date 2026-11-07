# Step 5c: re-skin the arms. UniRig spreads each arm's weights across shoulder, upper arm and forearm, and a few
# hundred arm vertices end up on bones that never move (fixweights binds everything above the neck line to the
# head, and in a T-pose the arms and the upturned fingertips sit at neck height). Those vertices stay in the T while
# the rest of the arm hangs, and the triangles between them stretch into thin diagonal lines that read as an
# A-pose. In the T-pose each arm is a straight tube, so every vertex within reach of the arm's axis beyond the
# shoulder is assigned by distance along it: upper arm to the elbow, forearm to the wrist, hand and fingers beyond
# (UniRig's finger weights are kept; anything else out there goes to the hand bone). At the shoulder itself only
# skin-coloured vertices are taken, so the hair hanging there stays with the head. usage: fixarms.py <in.glb> <out.glb>
import io, numpy as np, sys
from PIL import Image
from pygltflib import GLTF2
from collections import Counter
src, dst = sys.argv[1], sys.argv[2]
g = GLTF2().load(src); blob = g.binary_blob()
def acc(i):
    a = g.accessors[i]; bv = g.bufferViews[a.bufferView]; comp = {5126: 'f4', 5123: 'u2', 5121: 'u1', 5125: 'u4'}[a.componentType]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a.type]; off = (bv.byteOffset or 0) + (a.byteOffset or 0)
    return np.frombuffer(blob, dtype=comp, count=a.count * n, offset=off).reshape(a.count, n), off, comp
prim = g.meshes[0].primitives[0]; A = prim.attributes; skin = g.skins[0]
pos, _, _ = acc(A.POSITION); J, joff, jcomp = acc(A.JOINTS_0); Wt, woff, wcomp = acc(A.WEIGHTS_0); uv, _, _ = acc(A.TEXCOORD_0)
ibm, _, _ = acc(skin.inverseBindMatrices); ibm = ibm.reshape(-1, 4, 4)
names = [g.nodes[j].name for j in skin.joints]; idx = {n: i for i, n in enumerate(names)}
head = lambda b: np.linalg.inv(ibm[idx[b]].T)[:3, 3]
# texture colour per vertex (the texture may name its image through an extension such as EXT_texture_webp)
mat = g.materials[prim.material]; tex = g.textures[mat.pbrMetallicRoughness.baseColorTexture.index]
src_i = tex.source
if src_i is None and tex.extensions: src_i = next((v['source'] for v in tex.extensions.values() if isinstance(v, dict) and 'source' in v), None)
if src_i is None: src_i = 0
img = g.images[src_i]; print('texture image', src_i, img.mimeType, 'bufferView', img.bufferView)
bv = g.bufferViews[img.bufferView]; im = Image.open(io.BytesIO(blob[(bv.byteOffset or 0):(bv.byteOffset or 0) + bv.byteLength])).convert('RGB'); tw, th = im.size
px = np.asarray(im).astype(int)
ui = np.clip((uv[:, 0] % 1.0) * tw, 0, tw - 1).astype(int); vi = np.clip((uv[:, 1] % 1.0) * th, 0, th - 1).astype(int)
col = px[vi, ui]; R, G, B = col[:, 0], col[:, 1], col[:, 2]
skinny = (R > 150) & (R - G > 15) & (R - B > 15) & (G > 80)      # pink skin; hair is dark or purple, the dress yellow
print('texture', tw, th, 'skin-coloured vertices', int(skinny.sum()), 'of', len(pos))
Jn = J.astype(np.int64).copy(); Wn = Wt.astype(np.float32).copy()
dom = J[np.arange(len(J)), Wt.argmax(1)]
ARMS = {'A': ('bone_7', 'bone_8', 'bone_9', range(10, 22)), 'B': ('bone_23', 'bone_24', 'bone_25', range(26, 38))}
for side, (u, f, h, fingers) in ARMS.items():
    iu, ifo, ih = idx[u], idx[f], idx[h]; hand_set = {ih} | {idx[f'bone_{k}'] for k in fingers}
    pu, pf, ph = head(u), head(f), head(h); axis = ph - pu; L = float(np.linalg.norm(axis)); axis /= L; te = float((pf - pu) @ axis)
    rel = pos - pu; t = rel @ axis; perp = np.linalg.norm(rel - np.outer(t, axis), axis=1)
    r = float(np.median(perp[dom == ifo])) if (dom == ifo).any() else 0.02
    band = max(r, 0.004); far = L + 0.12                                    # fingertips reach about 0.07 past the hand bone
    shoulder = (t > -r) & (t <= 2 * r) & (perp < 2.0 * r) & skinny          # at the shoulder only skin, so hair stays
    arm = (t > 2 * r) & (t < far) & (perp < 5.0 * r)                        # along the arm everything is arm
    hand = (t > L - band) & (t < far) & (perp < 8 * r)                     # the hand is flat and wide, fingers spread
    sel = shoulder | arm | hand
    c = Counter(names[j] for i in np.where(sel)[0] for j in J[i][Wt[i] > 0.05])
    print(side, 'arm length', round(L, 3), 'elbow at', round(te, 3), 'forearm radius', round(r, 4), 'selected', int(sel.sum()), 'bones before', sorted(c.items(), key=lambda kv: -kv[1])[:8])
    n = 0
    for i in np.where(sel)[0]:
        ti = float(t[i])
        if ti >= L - band:   # hand: keep hand and finger weights, pull anything else onto the hand bone
            merged = {}
            for k in range(4):
                j = int(J[i, k]); w = float(Wt[i, k])
                if w <= 0: continue
                if j not in hand_set:
                    if ti < L + band:
                        merged[ifo] = merged.get(ifo, 0) + w * (L + band - ti) / (2 * band); j = ih; w = w * (ti - (L - band)) / (2 * band)
                    else: j = ih
                merged[j] = merged.get(j, 0) + w
        else:
            fore = float(np.clip((ti - te) / (2 * band) + 0.5, 0, 1)); new = {iu: 1 - fore, ifo: fore}
            top = float(np.clip((ti + r) / (3 * r), 0, 1))   # fade in from the shoulder over the first 2r
            merged = {}
            if top < 1:
                for k in range(4):
                    if Wt[i, k] > 0: merged[int(J[i, k])] = merged.get(int(J[i, k]), 0) + float(Wt[i, k]) * (1 - top)
            for j, w in new.items(): merged[j] = merged.get(j, 0) + w * top
        best = sorted(merged.items(), key=lambda kv: -kv[1])[:4]; tot = sum(w for _, w in best) or 1
        for k in range(4):
            if k < len(best): Jn[i, k], Wn[i, k] = best[k][0], best[k][1] / tot
            else: Jn[i, k], Wn[i, k] = 0, 0
        n += 1
    still = (t > 2 * r) & (t < far + 0.05) & (perp < 10 * r) & ~sel & ~np.isin(dom, list(hand_set | {iu, ifo}))
    print(side, 're-skinned', n, 'vertices; nearby vertices left on other bones', int(still.sum()), Counter(names[dom[i]] for i in np.where(still)[0]).most_common(4))
b = bytearray(blob); b[joff:joff + Jn.size * np.dtype(jcomp).itemsize] = Jn.astype(jcomp).tobytes(); b[woff:woff + Wn.size * 4] = Wn.astype('f4').tobytes()
g.set_binary_blob(bytes(b)); g.save(dst); print('saved', dst)
