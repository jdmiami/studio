#!/usr/bin/env bash
# One per-element round: render the elements' whole family on the kit sheet (neighbors cast
# shadows into each other's crops, as on the reference), run the strict pixel test on just the
# given elements, and log the result. Needs `npm run dev`.
#   scripts/kit/item.sh <id[,id...]> <label> "<what changed>"
set -uo pipefail
cd "$(dirname "$0")/../.."
ids="${1:?ids}"
label="${2:?label}"
note="${3:-}"
mkdir -p screenshots/kit/rounds docs/kit
family=$(python3 -c "import re,sys; t=open('src/kit/manifest.js').read(); print(re.search(r\"id: '\"+re.escape(sys.argv[1])+r\"', family: '([^']+)'\", t).group(1))" "${ids%%,*}")
node scripts/screenshot.mjs "screenshots/kit/rounds/$label.png" --page=kit.html --size=1024x572 \
  --query="family=$family${KIT_QUERY:+&$KIT_QUERY}" | grep -v "^saved" || true
python3 scripts/kit/pixel_test.py "screenshots/kit/rounds/$label.png" --ids "$ids" \
  --json "screenshots/kit/rounds/$label.json"
status=$?
python3 - "$label" "$note" <<'PY'
import json, sys, time
from pathlib import Path
label, note = sys.argv[1], sys.argv[2]
run = json.loads(Path(f'screenshots/kit/rounds/{label}.json').read_text())
log = Path('docs/kit/rounds.jsonl')
with log.open('a') as f:
    for r in run['results']:
        f.write(json.dumps({'time': time.strftime('%Y-%m-%dT%H:%M:%S'), 'label': label, 'note': note, **r}) + '\n')
PY
exit $status
