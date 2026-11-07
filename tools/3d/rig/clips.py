# Step 6: Ene's game clips for the T-pose rig. Writes clips.json. usage: clips.py [clips.json]
# Arm entries use aim: the world direction the bone's child joint should point to. She faces -z, +y is up;
# arm A (bones 6-21) hangs at -x, which is image-right when she faces the camera; arm B is 22-37.
# Other entries are [rx, ry, rz] degrees on the T-pose rest. Thigh x+ swings forward, shin x- bends the knee,
# finger x+ curls. Legs: A = 38-41 (hip, thigh, shin, foot), B = 42-45. Spine 1-3, neck 4, head 5, hips 0.
import math, json, sys
S = math.sin; C = math.cos; TAU = 2 * math.pi
FA = ['bone_13', 'bone_14', 'bone_15', 'bone_16', 'bone_17', 'bone_18', 'bone_19', 'bone_20', 'bone_21']
FB = ['bone_29', 'bone_30', 'bone_31', 'bone_32', 'bone_33', 'bone_34', 'bone_35', 'bone_36', 'bone_37']
def fingers(spec, curl_a, curl_b):
    for b in FA: spec[b] = [curl_a, 0, 0]
    for b in FB: spec[b] = [curl_b, 0, 0]
    spec['bone_10'] = [curl_a * 0.5, 0, 0]; spec['bone_26'] = [curl_b * 0.5, 0, 0]; return spec
def arms(spec, ua, fa, ub, fb):
    # ua/fa: upper arm and forearm directions for arm A; ub/fb for arm B
    spec['bone_7'] = {'aim': list(ua)}; spec['bone_8'] = {'aim': list(fa)}; spec['bone_23'] = {'aim': list(ub)}; spec['bone_24'] = {'aim': list(fb)}; return spec
def swing(t_fwd, ang):   # a hanging arm swung forward (t_fwd > 0) or back by ang degrees
    a = math.radians(ang * t_fwd); return (0, -C(a), -S(a))
def base(sw_a=0.0, sw_b=0.0, amp=0, elbow=22, curl=22):
    sp = {}; ua = swing(sw_a, amp); ub = swing(sw_b, amp)
    fa = (ua[0] - 0.02, ua[1] * C(math.radians(elbow)), ua[2] - S(math.radians(elbow)))
    fb = (ub[0] + 0.02, ub[1] * C(math.radians(elbow)), ub[2] - S(math.radians(elbow)))
    arms(sp, (ua[0] - 0.1, ua[1], ua[2]), fa, (ub[0] + 0.1, ub[1], ub[2]), fb)
    return fingers(sp, curl, curl)
def gait(t, run=False):
    a = TAU * t; leg = 38 if run else 28; amp = 45 if run else 26; s = S(a); c = C(a)
    knee = lambda ph: -max(0.0, S(ph)) * (75 if run else 45)
    sp = base(sw_a=-s, sw_b=s, amp=amp, elbow=35 + 20 * max(0, -s), curl=35 if run else 22)
    sp.update({'bone_39': [leg * s, 0, 0], 'bone_40': [knee(a + math.pi), 0, 0], 'bone_43': [-leg * s, 0, 0], 'bone_44': [knee(a), 0, 0], 'bone_2': [8 if run else 3, 0, 0], 'bone_5': [-4 if run else 0, 0, 0]})
    return sp, (0.014 if run else 0.007) * abs(c)
clips = {}
clips['idle'] = []
for i in range(4):
    ph = TAU * i / 4; sp = base(sw_a=0.1 * S(ph), sw_b=-0.1 * S(ph), amp=20); sp['bone_2'] = [1.5 * S(ph), 0, 0]; sp['bone_5'] = [0, 0, 2 * S(ph)]; clips['idle'].append((sp, 0.0))
clips['walk'] = [gait(i / 8) for i in range(8)]
clips['run'] = [gait(i / 6, True) for i in range(6)]
crouch = base(sw_a=1, sw_b=1, amp=35, elbow=25); crouch.update({'bone_39': [40, 0, 0], 'bone_40': [-70, 0, 0], 'bone_43': [40, 0, 0], 'bone_44': [-70, 0, 0], 'bone_2': [12, 0, 0]})
air = fingers(arms({}, (-0.7, 0.4, -0.4), (-0.6, 0.8, -0.3), (0.7, 0.4, -0.4), (0.6, 0.8, -0.3)), 0, 0); air.update({'bone_39': [25, 0, 0], 'bone_40': [-60, 0, 0], 'bone_43': [-10, 0, 0], 'bone_44': [-30, 0, 0], 'bone_2': [-4, 0, 0]})
land = base(sw_a=-0.4, sw_b=-0.4, amp=35, elbow=25); land.update({'bone_39': [30, 0, 0], 'bone_40': [-50, 0, 0], 'bone_43': [30, 0, 0], 'bone_44': [-50, 0, 0], 'bone_2': [8, 0, 0]})
clips['jump'] = [(crouch, -0.05), (air, 0.08), (land, -0.03)]
joy1 = fingers(arms({}, (-0.6, 0.75, -0.2), (-0.45, 0.9, -0.1), (0.6, 0.75, -0.2), (0.45, 0.9, -0.1)), 0, 0); joy1.update({'bone_5': [-6, 0, 6], 'bone_2': [-4, 0, 0]})
joy2 = fingers(arms({}, (-0.5, 0.85, -0.2), (-0.3, 0.95, -0.1), (0.5, 0.85, -0.2), (0.3, 0.95, -0.1)), 0, 0); joy2.update({'bone_5': [-6, 0, -6], 'bone_2': [-4, 0, 0]})
clips['joy'] = [(joy1, 0.0), (joy2, 0.01)]
point = fingers(arms({}, (-0.15, -0.05, -1), (-0.1, 0.0, -1), (0.14, -1, 0), (0.1, -0.95, -0.25)), 85, 22)
for b in ['bone_13', 'bone_14', 'bone_15']: point[b] = [0, 0, 0]   # the index finger stays straight
point['bone_5'] = [0, -12, 0]; clips['point'] = [(point, 0.0)]
hurt = fingers(arms({}, (-0.6, -0.3, -0.7), (-0.5, 0.6, -0.6), (0.6, -0.3, -0.7), (0.5, 0.6, -0.6)), 10, 10); hurt.update({'bone_2': [-14, 0, 0], 'bone_5': [-10, 0, 0], 'bone_39': [-10, 0, 0], 'bone_43': [15, 0, 0]})
clips['hurt'] = [(hurt, 0.0)]
cry = fingers(arms({}, (-0.35, -0.85, -0.4), (-0.05, 0.75, -0.65), (0.35, -0.85, -0.4), (0.05, 0.75, -0.65)), 40, 40); cry.update({'bone_5': [12, 0, 0], 'bone_2': [8, 0, 0]})
cry2 = dict(cry); cry2['bone_5'] = [14, 0, 3]; clips['cry'] = [(cry, 0.0), (cry2, 0.0)]
out = sys.argv[1] if len(sys.argv) > 1 else 'clips.json'
json.dump({k: [{'spec': s, 'lift': l} for s, l in v] for k, v in clips.items()}, open(out, 'w'))
print('clips', {k: len(v) for k, v in clips.items()}, '->', out)
