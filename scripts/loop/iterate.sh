#!/usr/bin/env bash
# One loop iteration: render the reference framing, score it, record history, build the
# side-by-side sheet. Requires the dev server (npm run dev).
#   scripts/loop/iterate.sh <label> "<what changed>"
set -euo pipefail
cd "$(dirname "$0")/../.."
label="${1:?label}"
note="${2:-}"
mkdir -p screenshots/loop docs/loop
node scripts/screenshot.mjs "screenshots/loop/$label.png" --size=1024x572 >/dev/null
python3 scripts/loop/score.py docs/reference/cave-door.jpg "screenshots/loop/$label.png" \
  --history docs/loop/history.json --note "$note" --summary
python3 .claude/skills/img2threejs/forge/stage4_review/make_comparison_sheet.py \
  --reference docs/reference/cave-door.jpg --render "screenshots/loop/$label.png" \
  --out "screenshots/loop/$label-compare.png" --json >/dev/null
echo "  sheet: screenshots/loop/$label-compare.png"
