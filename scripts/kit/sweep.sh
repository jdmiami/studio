#!/usr/bin/env bash
# Try several URL-parameter variants of one element and print the pixel test for each, without
# logging: a quick automated search over stage/tuning knobs.
#   scripts/kit/sweep.sh <id> "<extra query>" "<variant query>" ["<variant query>" ...]
set -uo pipefail
cd "$(dirname "$0")/../.."
id="$1"; base="$2"; shift 2
mkdir -p screenshots/kit/sweep
i=0
for variant in "$@"; do
  out="screenshots/kit/sweep/$id-$i.png"
  node scripts/screenshot.mjs "$out" --page=kit.html --size=1024x572 --query="only=$id${base:+&$base}&$variant" >/dev/null 2>&1
  printf '%-40s ' "$variant"
  python3 scripts/kit/pixel_test.py "$out" --ids "$id" | head -1 | sed 's/^\(PASS\|FAIL\) *[^ ]* *//'
  i=$((i + 1))
done
