#!/usr/bin/env bash
# run_local_gpu.sh — Pitch MTNN — local GPU pickup
set -euo pipefail
EPOCHS="${1:-50}"
cd "$(dirname "$0")/.."
echo "[pitch] epochs=$EPOCHS $(date -u)"
DEVICE="cpu"
if python3 -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then DEVICE="cuda"; echo "[pitch] CUDA -> $DEVICE"; else echo "[pitch] -> cpu"; fi
if [ ! -f pipeline/data/tm_full.npz ]; then
  echo "[pitch] Missing pipeline/data/tm_full.npz - need build_features.py (TransferMarkt)"
  python3 pipeline/build_features.py || true
  if [ ! -f pipeline/data/tm_full.npz ]; then exit 0; fi
fi
python3 pipeline/train_mtnn.py --epochs "$EPOCHS" 2>&1 | tee -a pipeline/cache/train_pitch_${EPOCHS}ep.log || echo "[pitch] graceful exit"
echo "[pitch] done"
