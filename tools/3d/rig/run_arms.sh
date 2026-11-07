#!/bin/sh
# Steps 5c to 9 as one detached Hugging Face Job (cpu-upgrade, about 6 minutes): fetch the rigged model and these
# scripts from the dataset, re-skin the arms, bake the clips, render the proof sheet and the sprite strips, and
# upload everything back. The scripts live under tools/ in the dataset; a job is submitted with
#   hf jobs run --flavor cpu-upgrade --secrets HF_TOKEN python:3.12 /bin/sh -lc 'pip install -q huggingface_hub && python -c "..." && sh /run_arms.sh'
# where the python one-liner downloads this file from the dataset. A job survives whatever happens to the session.
set -e
mkdir -p /work/out && cd /work
pip install -q huggingface_hub pygltflib numpy pillow playwright
python -m playwright install --with-deps chromium > /dev/null 2>&1
python - <<'PY'
from huggingface_hub import hf_hub_download
import shutil
for f in ['fixarms.py', 'pose.html', 'anim.html', 'clips.py', 'sprites.py', 'bake.py', 'animcheck.py']:
    shutil.copy(hf_hub_download('Jdmiami/stickerwild-3d', 'tools/' + f, repo_type='dataset'), f)
shutil.copy(hf_hub_download('Jdmiami/stickerwild-3d', 'out/ene_tpose/ene_rigged3.glb', repo_type='dataset'), 'ene_rigged3.glb')
print('fetched')
PY
python clips.py clips.json
python fixarms.py ene_rigged3.glb out/ene_rigged4.glb
python bake.py out/ene_rigged4.glb clips.json out/ene_rigged_anim4.glb
python animcheck.py out/ene_rigged_anim4.glb out/animcheck4.png
python -c "from huggingface_hub import HfApi; HfApi().upload_file(path_or_fileobj='out/animcheck4.png', path_in_repo='out/ene_tpose/animcheck4.png', repo_id='Jdmiami/stickerwild-3d', repo_type='dataset')"
echo CHECK_OK
python sprites.py out/ene_rigged4.glb clips.json out/sprites4
python - <<'PY'
from huggingface_hub import HfApi
a = HfApi(); R = dict(repo_id='Jdmiami/stickerwild-3d', repo_type='dataset')
a.upload_folder(folder_path='out/sprites4', path_in_repo='out/ene_tpose/sprites4', **R)
a.upload_file(path_or_fileobj='out/ene_rigged4.glb', path_in_repo='out/ene_tpose/ene_rigged4.glb', **R)
a.upload_file(path_or_fileobj='out/ene_rigged_anim4.glb', path_in_repo='out/ene_tpose/ene_rigged_anim4.glb', **R)
print('uploaded')
PY
echo PIPE_OK
