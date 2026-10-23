"""Merge embedding files (and their label maps) into one training set.

    data/cv-env/bin/python experiments/synthetic/merge.py OUT.npz OUT_LABELS.json A.npz:A.json [B.npz:B.json ...]
"""
import json
import sys

import numpy as np

out_npz, out_labels, *pairs = sys.argv[1:]
merged, labels, offset = {}, {}, 0
for pair in pairs:
    npz, lab = pair.split(":")
    d = np.load(npz)
    for k in d.files:
        if k in ("labels", "meta"):
            merged.setdefault(k, d[k])
            continue
        v = d[k] + offset if k == "window_video_idx" else d[k]
        merged.setdefault(k, []).append(v)
    offset += len(d["videos"])
    labels |= json.load(open(lab))
np.savez_compressed(out_npz, **{k: v if k in ("labels", "meta") else np.concatenate(v) for k, v in merged.items()})
json.dump(labels, open(out_labels, "w"))
print(f"{offset} videos, {len(labels)} labelled sources -> {out_npz}")
