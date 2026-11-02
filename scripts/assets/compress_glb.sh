#!/usr/bin/env bash
# Compresses every exported asset in place with meshopt (positions/normals/colours quantized);
# three's GLTFLoader decodes it with MeshoptDecoder.
set -euo pipefail
cd "$(dirname "$0")/../.."
for f in public/assets/glb/*.glb; do
  npx --yes @gltf-transform/cli@4 meshopt "$f" "$f.tmp.glb" --level medium >/dev/null && mv "$f.tmp.glb" "$f"
done
du -ch public/assets/glb/*.glb | tail -1
