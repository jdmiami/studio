#!/usr/bin/env python3
"""Run dripfit.py for the given willows and write the results into WILLOW_DRIPS in trees.js."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
lines = [subprocess.run([sys.executable, 'scripts/kit/dripfit.py', i], cwd=ROOT, capture_output=True, text=True, check=True).stdout.rstrip()
         for i in sys.argv[1:]]
p = ROOT / 'src/kit/families/trees.js'
s = p.read_text()
start = s.index('export const WILLOW_DRIPS = {')
end = s.index('};', start) + 2
s = s[:start] + 'export const WILLOW_DRIPS = {\n' + '\n'.join(lines) + '\n};' + s[end:]
p.write_text(s)
print('wrote', ', '.join(sys.argv[1:]))
