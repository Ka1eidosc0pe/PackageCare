"""Train a small handling classifier on frozen V-JEPA 2 embeddings of synthetic clips, then score real clips.

    data/cv-env/bin/python experiments/synthetic/train.py \
        --train data/synthetic/train-embeddings.npz --labels data/synthetic/labels.json \
        --real data/synthetic/real-embeddings.npz --real-labels evaluation/real-handling-labels.json \
        --out data/synthetic/model

labels.json maps clip stem -> {"label": toss|drop|place|none, "group": GROUP}. Augmented copies are
named STEM_augN and inherit their source's label and group, so cross-validation never splits a
generated clip from its own augmentations. Real clips are never used for training.
"""
import argparse
import json
import re
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

CLASSES = ["rough", "placement", "none"]
COARSE = {"toss": "rough", "drop": "rough", "place": "placement", "none": "none", "obscured": "none"}
FEATURE = "pooled"


def stem(path):
    return re.sub(r"_aug\d+$", "", Path(str(path)).stem)


def clip_features(d):
    return np.concatenate([d[f"clip_{FEATURE}_max"], d[f"clip_{FEATURE}_mean"]], axis=1)


def window_features(d):
    w = d[f"win_{FEATURE}"]
    return np.concatenate([w, w], axis=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--real")
    ap.add_argument("--real-labels")
    ap.add_argument("--out", required=True)
    ap.add_argument("--C", type=float, default=0.5)
    a = ap.parse_args()

    d = np.load(a.train)
    labels = json.loads(Path(a.labels).read_text())
    keep = [i for i, v in enumerate(d["videos"]) if stem(v) in labels]
    X = clip_features(d)[keep]
    y = np.array([COARSE[labels[stem(d["videos"][i])]["label"]] for i in keep])
    groups = np.array([labels[stem(d["videos"][i])]["group"] for i in keep])
    print(f"{len(y)} training clips, {len(set(groups))} groups:", {c: int((y == c).sum()) for c in CLASSES})

    def model():
        return make_pipeline(StandardScaler(), LogisticRegression(C=a.C, max_iter=5000, class_weight="balanced"))

    folds = min(5, min(int((y == c).sum()) for c in set(y)))
    if folds >= 2:
        pred = np.empty_like(y)
        for tr, te in StratifiedGroupKFold(folds, shuffle=True, random_state=0).split(X, y, groups):
            pred[te] = model().fit(X[tr], y[tr]).predict(X[te])
        print("grouped CV (synthetic):")
        print(classification_report(y, pred, zero_division=0))
        print(confusion_matrix(y, pred, labels=CLASSES))

    clf = model().fit(X, y)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": clf, "feature": FEATURE, "classes": list(clf.classes_)}, out / "classifier.joblib")

    if not a.real:
        return
    r = np.load(a.real)
    truth = json.loads(Path(a.real_labels).read_text()) if a.real_labels else {}
    P = clf.predict_proba(clip_features(r))
    Pw = clf.predict_proba(window_features(r))
    cls = list(clf.classes_)
    rows = []
    print("\nreal held-out clips:")
    for i, v in enumerate(r["videos"]):
        w = np.where(r["window_video_idx"] == i)[0]
        best = w[np.argmax(Pw[w, cls.index("rough")])]
        row = {"clip": Path(str(v)).name, "expected": truth.get(Path(str(v)).stem, "?"),
               "probs": {c: round(float(p), 3) for c, p in zip(cls, P[i])},
               "peak_rough_window_ms": [float(r["window_start_ms"][best]), float(r["window_end_ms"][best])],
               "peak_rough_window_p": round(float(Pw[best, cls.index("rough")]), 3)}
        rows.append(row)
        print(f"  {row['clip']:<34} expected={row['expected']:<10} {row['probs']}  peak rough "
              f"{row['peak_rough_window_ms']} p={row['peak_rough_window_p']}")
    (out / "real-eval.json").write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
