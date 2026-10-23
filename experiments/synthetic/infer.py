"""Score one video with a trained handling classifier on frozen V-JEPA 2 features.

    data/cv-env/bin/python experiments/synthetic/infer.py --model data/synthetic/model/classifier.joblib VIDEO

Prints exactly one JSON object to stdout:
    {classes, clip_probs, windows: [{start_ms, end_ms, probs}], duration_ms, model_id, seconds}
Diagnostics go to stderr. Features match train.py: clip = concat(max, mean) over windows of win_pooled;
window = concat(w, w). Scores are classifier outputs, not calibrated probabilities.
"""
import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from embed import DEFAULT_DEVICE, DEFAULT_MODEL_DIR, embed_video, load_model  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--model", required=True, help="classifier.joblib from train.py")
    ap.add_argument("--model-dir", default=DEFAULT_MODEL_DIR, help="default: $PACKAGECARE_MODEL_DIR or data/local-action-small-model")
    ap.add_argument("--fps", type=float, default=8.0)
    ap.add_argument("--stride", type=int, default=int(os.environ.get("PACKAGECARE_STRIDE", "4")))
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--device", default=DEFAULT_DEVICE, choices=["mps", "cpu"],
                    help="default: $PACKAGECARE_DEVICE or mps (no silent fallback)")
    a = ap.parse_args()

    import joblib
    import torch

    t0 = time.monotonic()
    model_bytes = Path(a.model).read_bytes()
    bundle = joblib.load(a.model)
    clf, feature = bundle["model"], bundle.get("feature", "pooled")
    classes = [str(c) for c in clf.classes_]
    loaded = load_model(a.model_dir, a.device)
    t_load = time.monotonic() - t0
    print(f"loaded in {t_load:.1f}s on {loaded[1]} with {torch.get_num_threads()} threads", file=sys.stderr, flush=True)

    feats, starts, ends, n = embed_video(a.video, loaded, a.fps, a.stride, a.batch)
    w = feats[feature]
    clip_x = np.concatenate([w.max(0), w.mean(0)])[None, :]
    clip_p = clf.predict_proba(clip_x)[0]
    win_p = clf.predict_proba(np.concatenate([w, w], axis=1))

    out = {
        "classes": classes,
        "clip_probs": {c: round(float(p), 4) for c, p in zip(classes, clip_p)},
        "windows": [
            {"start_ms": int(round(s)), "end_ms": int(round(e)),
             "probs": {c: round(float(p), 4) for c, p in zip(classes, row)}}
            for s, e, row in zip(starts, ends, win_p)
        ],
        "duration_ms": int(round(n * 1000.0 / a.fps)),
        "model_id": f"classifier-{hashlib.sha256(model_bytes).hexdigest()[:12]}",
        "feature": feature,
        "device": str(loaded[1]),
        "threads": torch.get_num_threads(),
        "load_seconds": round(t_load, 2),
        "seconds": round(time.monotonic() - t0, 2),
    }
    print(json.dumps(out))


if __name__ == "__main__":
    main()
