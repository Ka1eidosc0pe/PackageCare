#!/usr/bin/env bash
# Augment one clip into data/synthetic/full-train (3 variants) unless already done. Used by pipeline.sh.
s=$(basename "$1" .mp4)
[ -f "data/synthetic/full-train/${s}_aug2.mp4" ] && exit 0
data/cv-env/bin/python experiments/synthetic/augment.py "$1" data/synthetic/full-train --n 3 >/dev/null 2>&1 || echo "augment failed: $s"
