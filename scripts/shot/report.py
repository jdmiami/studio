"""Builds the shot-match comparison page: the target and a game frame with an onion-skin slider, the
heat-map sheet, the scores and the per-element colour differences, for one or more labelled runs.

Usage: python3 scripts/shot/report.py <out.html> <score_dir> <label> [<label> ...]
Each label needs <score_dir>/<label>-score.json, <label>-sheet.jpg and the render it scored, passed
as <score_dir>/<label>.png (the newest label is shown first).
"""
import base64, json, sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / 'docs/reference/target-shot.jpg'


def uri(path, w=None, q=80):
    im = cv2.imread(str(path))
    if w and im.shape[1] > w:
        im = cv2.resize(im, (w, int(im.shape[0] * w / im.shape[1])), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, q])
    return 'data:image/jpeg;base64,' + base64.b64encode(buf).decode()


ROWS = [
    ('Colour difference (mean CIEDE2000)', lambda s: s['colour']['meanDE'], 'lower', '≤ 9'),
    ('Colour difference (90th percentile)', lambda s: s['colour']['p90DE'], 'lower', ''),
    ('Lightness mean (target 51.3)', lambda s: s['colour']['render']['L_mean'], 'match', '51.3'),
    ('Chroma mean (target 11.2)', lambda s: s['colour']['render']['chroma'], 'match', '11.2'),
    ('Warm/cool map match', lambda s: s['colour']['warmth_map_corr'], 'higher', ''),
    ('SSIM (structure)', lambda s: s['structure']['ssim'], 'higher', '≥ 0.65'),
    ('Edge recall', lambda s: s['structure']['edge_recall'], 'higher', '≥ 0.55'),
    ('Edge precision', lambda s: s['structure']['edge_precision'], 'higher', ''),
    ('Detail map match', lambda s: s['detail_corr'], 'higher', ''),
    ('Attention (saliency) match', lambda s: s['saliency_corr'], 'higher', '≥ 0.7'),
    ('Depth layout match', lambda s: s.get('depth', {}).get('corr', float('nan')), 'higher', ''),
]


def main():
    out, sdir, labels = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
    runs = [(l, json.loads((sdir / f'{l}-score.json').read_text())) for l in labels]
    latest, ls = runs[-1]
    head = ''.join(f'<th>{l}</th>' for l, _ in runs)
    body = ''
    for name, get, _, goal in ROWS:
        body += f'<tr><td>{name}</td>' + ''.join(f'<td class="n">{get(s):.2f}</td>' for _, s in runs) + f'<td class="n goal">{goal}</td></tr>'
    elems = sorted(ls['elements'].items(), key=lambda kv: -kv[1])
    ebody = ''.join(f'<tr><td>{k}</td><td class="n">{v:.1f}</td><td><span class="bar" style="width:{min(100, v * 2):.0f}%"></span></td></tr>' for k, v in elems)
    html = f'''<title>Shot Match</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Figtree:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
/* Layout: the onion-skin viewer on the left, the scorecard on the right; the heat-map sheet below. */
:root {{ --bg:#f3ece8; --panel:#fbf7f4; --ink:#33282a; --muted:#7a6a66; --rule:#ddcfc9; --accent:#7b826c; --bar:#c98f7a;
  --display:"Fraunces", Georgia, serif; --body:"Figtree", system-ui, sans-serif; --mono:"JetBrains Mono", ui-monospace, monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#1f1a1b; --panel:#2a2325; --ink:#efe5e2; --muted:#b3a19c; --rule:#43383a; --accent:#a9b493; --bar:#d9a28e; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --bg:#1f1a1b; --panel:#2a2325; --ink:#efe5e2; --muted:#b3a19c; --rule:#43383a; --accent:#a9b493; --bar:#d9a28e; color-scheme:dark; }}
*{{box-sizing:border-box}} body{{background:var(--bg);color:var(--ink);font:15px/1.55 var(--body)}}
.page{{max-width:1240px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 64px;display:grid;gap:28px}}
h1{{font-family:var(--display);font-size:clamp(30px,5vw,46px);margin:0;text-wrap:balance}} h2{{font-family:var(--display);font-size:22px;margin:0 0 10px}}
.eyebrow{{font:500 11px var(--mono);letter-spacing:1.4px;text-transform:uppercase;color:var(--muted)}}
.top{{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:28px;align-items:start}}
.viewer{{display:grid;gap:10px}} .stack{{position:relative;width:100%;aspect-ratio:1125/1979;border-radius:12px;overflow:hidden;background:var(--panel)}}
.stack img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}}
.stack .over{{clip-path:inset(0 0 0 var(--cut,50%))}}
.stack .line{{position:absolute;top:0;bottom:0;left:var(--cut,50%);width:2px;background:#fff;box-shadow:0 0 4px #0008}}
label{{font-size:13px;color:var(--muted);display:flex;gap:10px;align-items:center}} input[type=range]{{flex:1}}
.legend{{display:flex;justify-content:space-between;font:500 12px var(--mono);color:var(--muted)}}
.tw{{overflow-x:auto}} table{{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}}
th,td{{text-align:left;padding:7px 9px;border-bottom:1px solid var(--rule)}} th{{background:var(--panel);font-weight:700}}
td.n{{text-align:right;font-family:var(--mono);font-size:13px}} td.goal{{color:var(--accent)}}
.bar{{display:inline-block;height:9px;border-radius:5px;background:var(--bar)}}
.sheet img{{width:100%;border-radius:10px;display:block}}
p{{max-width:70ch;margin:0;color:var(--muted)}}
@media (max-width:860px){{.top{{grid-template-columns:1fr}}.viewer{{max-width:420px}}}}
</style>
<div class="page">
<header><span class="eyebrow">Phluph · shot match · {latest}</span><h1>Game frame against the target shot</h1>
<p>Both frames from the same solved camera. Drag the slider to wipe between them. Scores come from scripts/shot/score.py with the HUD masked out.</p></header>
<section class="top">
 <div class="viewer">
  <div class="stack" id="stack"><img src="{uri(TARGET, 700)}" alt="The target shot"><img class="over" src="{uri(sdir / f'{latest}.png', 700)}" alt="The game frame"><span class="line"></span></div>
  <label for="cut">Game <input id="cut" type="range" min="0" max="100" value="50"> Target</label>
 </div>
 <div><h2>Scores</h2><div class="tw"><table><tr><th>Metric</th>{head}<th>Goal</th></tr>{body}</table></div>
 <h2 style="margin-top:22px">Colour difference by element ({latest})</h2><div class="tw"><table><tr><th>Element</th><th>Mean ΔE</th><th></th></tr>{ebody}</table></div></div>
</section>
<section class="sheet"><h2>Heat maps ({latest})</h2><img src="{uri(sdir / f'{latest}-sheet.jpg', 1405)}" alt="Target, game frame, colour difference, warmth, depth and attention maps">
<div class="legend"><span>Colour difference: black = match, bright = far off</span><span>Depth: warm = near</span></div></section>
</div>
<script>
const s=document.getElementById('stack'),c=document.getElementById('cut');
const set=()=>{{const v=c.value+'%';s.style.setProperty('--cut',v);}}; c.addEventListener('input',set); set();
</script>'''
    out.write_text(html)
    print(out, len(html))


if __name__ == '__main__':
    main()
