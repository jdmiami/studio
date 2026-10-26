#!/usr/bin/env bash
# One per-element round: render only the given elements on the kit sheet, run the strict pixel
# test on them, and log the result. Needs `npm run dev`.
#   scripts/kit/item.sh <id[,id...]> <label> "<what changed>"
set -uo pipefail
cd "$(dirname "$0")/../.."
ids="${1:?ids}"
label="${2:?label}"
note="${3:-}"
mkdir -p screenshots/kit/rounds docs/kit
node scripts/screenshot.mjs "screenshots/kit/rounds/$label.png" --page=kit.html --size=1024x572 \
  --query="only=$ids${KIT_QUERY:+&$KIT_QUERY}" | grep -v "^saved" || true
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
