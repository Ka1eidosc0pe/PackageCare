#!/usr/bin/env bash
# Unattended local pipeline after generation: augment -> embed -> train -> score held-out sets.
# Local only (no network, no paid calls). Re-runnable: finished steps are skipped.
#   bash scripts/synthetic/pipeline.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=data/cv-env/bin/python
S=data/synthetic
mkdir -p $S/full-train $S/model
log() { echo "[$(date +%H:%M:%S)] $*"; }

log "waiting for generation to finish"
while pgrep -f "fal_generate.py scripts/synthetic/(full|xgen)-jobs.json" >/dev/null; do sleep 20; done
log "generation finished: $(ls $S/full/clips/*.mp4 | wc -l) Seedance clips, $(ls $S/xgen/clips/*.mp4 2>/dev/null | wc -l) Kling clips"

log "augmenting (3 variants per clip)"
for f in $S/full/clips/*.mp4; do
  [ -f "$S/full-train/$(basename "$f")" ] || cp "$f" $S/full-train/
done
ls $S/full/clips/*.mp4 | xargs -n 1 -P 6 bash scripts/synthetic/augment_one.sh

python3 scripts/synthetic/build_labels.py $S/full-labels.json $S/full/clips $S/pilot/clips \
  --exclude m-drop-003 pilot-kling25-toss pilot-kling25-place pilot-kling25-drop pilot-wan22-toss pilot-wan22-place
python3 scripts/synthetic/build_labels.py $S/xgen-labels.json $S/xgen/clips

if [ ! -f $S/full-train-emb.npz ]; then
  log "embedding training clips"
  $PY experiments/synthetic/embed.py $S/full-train-emb.npz $S/full-train --batch 8 2>&1 | tail -1
fi
if [ ! -f $S/xgen-full-emb.npz ]; then
  log "embedding Kling cross-generator clips"
  $PY experiments/synthetic/embed.py $S/xgen-full-emb.npz $S/xgen/clips $S/pilot/clips/pilot-kling25-*.mp4 $S/pilot/clips/pilot-wan22-*.mp4 --batch 8 2>&1 | tail -1
fi

log "merging mini + full training embeddings and training"
$PY - <<'EOF'
import json, numpy as np
a, b = np.load("data/synthetic/full-train-emb.npz"), np.load("data/synthetic/mini-train-emb.npz")
n = len(a["videos"])
out = {k: a[k] for k in ("labels", "meta")}
for k in a.files:
    if k in out: continue
    out[k] = np.concatenate([a[k], b[k] + (n if k == "window_video_idx" else 0)])
np.savez_compressed("data/synthetic/train-all-emb.npz", **out)
labels = json.load(open("data/synthetic/full-labels.json")) | json.load(open("data/synthetic/mini-labels.json"))
json.dump(labels, open("data/synthetic/all-labels.json", "w"))
print(len(out["videos"]), "training videos")
EOF
$PY experiments/synthetic/train.py --train $S/train-all-emb.npz --labels $S/all-labels.json \
  --real $S/real-embeddings.npz --real-labels evaluation/real-handling-labels.json --out $S/model 2>&1 | grep -v Warning
pilot_labels=$(mktemp)
python3 - "$pilot_labels" <<'EOF'
import json, sys
labels = json.load(open("data/synthetic/xgen-labels.json"))
for s, l in [("pilot-kling25-toss","toss"),("pilot-kling25-drop","drop"),("pilot-kling25-place","place"),("pilot-wan22-toss","toss"),("pilot-wan22-place","place")]:
    labels[s] = {"label": l}
json.dump(labels, open(sys.argv[1], "w"))
EOF
log "cross-generator held-out score"
$PY experiments/synthetic/score.py $S/model/classifier.joblib $S/xgen-full-emb.npz "$pilot_labels" $S/model/xgen-eval.json 2>&1 | grep -v Warning | tail -3
log "pipeline complete"
