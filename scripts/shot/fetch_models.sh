#!/bin/sh
# Downloads the models the shot tools use into .cache/models (git-ignored):
# Depth Anything V2 small (scripts/shot/learned_depth.py, score.py) and Segment Anything ViT-B
# (scripts/shot/sam_boxes.py), from their GitHub releases.
set -e
cd "$(dirname "$0")/../.." && mkdir -p .cache/models && cd .cache/models
get() { [ -s "$2" ] || curl -fsSL -o "$2" "$1"; }
get https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx depth_anything_v2_vits.onnx
get https://github.com/danielgatis/rembg/releases/download/v0.0.0/sam_vit_b_01ec64.encoder.onnx sam_vit_b_01ec64.encoder.onnx
get https://github.com/danielgatis/rembg/releases/download/v0.0.0/sam_vit_b_01ec64.decoder.onnx sam_vit_b_01ec64.decoder.onnx
ls -la
