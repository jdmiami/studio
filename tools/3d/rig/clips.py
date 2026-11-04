# Step 6: Ene's game clips as bone rotations (degrees, XYZ, on top of the rest pose) plus a hips lift. Writes clips.json.
# UniRig's bones on this model: 0 hips, 1-3 spine, 4 neck, 5 head; 6-12 her LEFT arm (6 shoulder, 7 upper, 8 forearm,
# 9 hand, 10-12 fingers); 13-19 her RIGHT arm (its hand is sculpted onto her chest and stays there); 20-23 her left
# leg (20 hip, 21 thigh, 22 shin, 23 foot); 24-27 her right leg. Thigh x+ swings forward, shin x- bends the knee,
# upper arm x+ swings forward and z+ raises it sideways; the model faces -z.
import math, json, sys
S = math.sin; C = math.cos; TAU = 2 * math.pi
def gait(t, run=False):
    a = TAU * t; leg = 38 if run else 28; arm = 50 if run else 26; s = S(a); c = C(a)
    knee = lambda ph: -max(0.0, S(ph)) * (75 if run else 45)
    return {'bone_21': [leg * s, 0, 0], 'bone_22': [knee(a + math.pi), 0, 0], 'bone_25': [-leg * s, 0, 0], 'bone_26': [knee(a), 0, 0],
            'bone_7': [-arm * s, 0, 10], 'bone_8': [-20 - 15 * max(0, -s), 0, 0], 'bone_14': [-10 * s, 0, 0],
            'bone_2': [8 if run else 3, 0, 0], 'bone_5': [-4 if run else 0, 0, 0]}, (0.014 if run else 0.007) * abs(c)
clips = {}
clips['idle'] = [({'bone_2': [1.5 * S(TAU * i / 4), 0, 0], 'bone_5': [0, 0, 2 * S(TAU * i / 4)], 'bone_7': [0, 0, 3 * S(TAU * i / 4)]}, 0.0) for i in range(4)]
clips['walk'] = [gait(i / 8) for i in range(8)]
clips['run'] = [gait(i / 6, True) for i in range(6)]
clips['jump'] = [({'bone_21': [40, 0, 0], 'bone_22': [-70, 0, 0], 'bone_25': [40, 0, 0], 'bone_26': [-70, 0, 0], 'bone_2': [12, 0, 0], 'bone_7': [-40, 0, 10]}, -0.05),
                 ({'bone_21': [25, 0, 0], 'bone_22': [-60, 0, 0], 'bone_25': [-10, 0, 0], 'bone_26': [-30, 0, 0], 'bone_7': [60, 0, 40], 'bone_8': [-30, 0, 0], 'bone_2': [-4, 0, 0]}, 0.08),
                 ({'bone_21': [30, 0, 0], 'bone_22': [-50, 0, 0], 'bone_25': [30, 0, 0], 'bone_26': [-50, 0, 0], 'bone_2': [8, 0, 0], 'bone_7': [-20, 0, 10]}, -0.03)]
clips['joy'] = [({'bone_7': [115, 0, 55], 'bone_8': [-20, 0, 0], 'bone_5': [-6, 0, 6], 'bone_2': [-4, 0, 0]}, 0.0), ({'bone_7': [105, 0, 50], 'bone_8': [-40, 0, 0], 'bone_5': [-6, 0, -6], 'bone_2': [-4, 0, 0]}, 0.01)]
clips['point'] = [({'bone_7': [85, 0, 25], 'bone_8': [10, 0, 0], 'bone_5': [0, -12, 0]}, 0.0)]
clips['hurt'] = [({'bone_2': [-14, 0, 0], 'bone_5': [-10, 0, 0], 'bone_7': [40, 0, 70], 'bone_8': [-60, 0, 0], 'bone_21': [-10, 0, 0], 'bone_25': [15, 0, 0]}, 0.0)]
clips['cry'] = [({'bone_5': [12, 0, 0], 'bone_2': [8, 0, 0], 'bone_7': [60, 0, 20], 'bone_8': [-110, 0, 0]}, 0.0), ({'bone_5': [14, 0, 3], 'bone_2': [9, 0, 0], 'bone_7': [62, 0, 22], 'bone_8': [-112, 0, 0]}, 0.0)]
out = sys.argv[1] if len(sys.argv) > 1 else 'clips.json'
json.dump({k: [{'spec': s, 'lift': l} for s, l in v] for k, v in clips.items()}, open(out, 'w'))
print('clips', {k: len(v) for k, v in clips.items()}, '->', out)
