#!/usr/bin/env bash
# One kit loop round for a family: render it on the kit sheet, score each element against its
# reference crop, log the scores, and build a reference | render sheet. Needs `npm run dev`.
#   scripts/kit/iterate.sh <family> <label> "<what changed>"
set -euo pipefail
cd "$(dirname "$0")/../.."
family="${1:?family}"
label="${2:?label}"
note="${3:-}"
mkdir -p screenshots/kit docs/kit/history
node scripts/screenshot.mjs "screenshots/kit/$label.png" --page=kit.html --size=1024x572 \
  --query="family=$family" | grep -v '^saved' || true
python3 scripts/kit/score.py "screenshots/kit/$label.png" --family "$family" \
  --history "docs/kit/history/$family.json" --note "$note" --sheet "screenshots/kit/$label-sheet.png"
