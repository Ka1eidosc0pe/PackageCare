#!/usr/bin/env python3
"""Write labels.json (clip stem -> {label, group}) from the generator's per-clip metadata files.

    python3 scripts/synthetic/build_labels.py OUT.json CLIPS_DIR [CLIPS_DIR ...] [--exclude ID ...]

--exclude drops clips whose content was judged not to match the requested action on review.
"""
import argparse
import json
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("dirs", nargs="+")
ap.add_argument("--exclude", nargs="*", default=[])
a = ap.parse_args()
labels = {}
for d in a.dirs:
    for meta in sorted(Path(d).glob("*.json")):
        m = json.loads(meta.read_text())
        if m["id"] not in a.exclude:
            labels[m["id"]] = {"label": m["label"], "group": m["id"]}
Path(a.out).write_text(json.dumps(labels, indent=1))
print(f"{len(labels)} labelled clips -> {a.out}")
