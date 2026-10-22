"""Score a trained classifier on an embeddings file with known labels (held-out sets only).

    data/cv-env/bin/python experiments/synthetic/score.py MODEL.joblib EMB.npz LABELS.json OUT.json

LABELS.json maps clip stem -> label string or {"label": ...}; fine labels are coarsened like train.py.
"""
import json
import sys
from pathlib import Path

import joblib
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from train import COARSE, clip_features, stem  # noqa: E402

model_file, emb, labels_file, out = sys.argv[1:5]
m = joblib.load(model_file)["model"]
d = np.load(emb)
labels = json.loads(Path(labels_file).read_text())
P = m.predict_proba(clip_features(d))
rows, hit, n = [], 0, 0
for v, p in zip(d["videos"], P):
    raw = labels.get(stem(v))
    exp = raw["label"] if isinstance(raw, dict) else raw
    exp = COARSE.get(exp, exp)
    pred = m.classes_[int(np.argmax(p))]
    if exp in m.classes_:
        n += 1
        hit += pred == exp
    rows.append({"clip": Path(str(v)).name, "expected": exp, "predicted": str(pred),
                 "probs": {str(c): round(float(x), 3) for c, x in zip(m.classes_, p)}})
    print(f"{rows[-1]['clip']:<36} expected={exp:<10} predicted={pred:<10} {rows[-1]['probs']}")
print(f"correct on scoreable clips: {hit}/{n}")
Path(out).write_text(json.dumps({"correct": int(hit), "scoreable": n, "clips": rows}, indent=2))
