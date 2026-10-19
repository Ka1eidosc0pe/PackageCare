"""Conservative box association diagnostic; never emits handling assessments."""

import argparse
import json
from pathlib import Path


def iou(a, b):
    def area(x):
        return max(0, x[2] - x[0]) * max(0, x[3] - x[1])

    overlap = area([max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])])
    union = area(a) + area(b) - overlap
    return overlap / union if union else 0


def associate(frames):
    """Only link mutually unambiguous adjacent detections; do not bridge misses."""
    tracks = []
    for frame in frames:
        boxes = []
        for d in sorted(frame["detections"], key=lambda d: -d["score"]):
            if not ("box" in d["label"] or "parcel" in d["label"]):
                continue
            if any(iou(d["box"], b["box"]) >= 0.6 for b in boxes):
                continue
            boxes.append(d)
        active = [
            t
            for t in tracks
            if 0 < frame["offsetMs"] - t["points"][-1]["offsetMs"] <= 300
        ]
        candidates = {
            (bi, ti): iou(b["box"], t["points"][-1]["box"])
            for bi, b in enumerate(boxes)
            for ti, t in enumerate(active)
        }
        links = {}
        for bi in range(len(boxes)):
            scores = sorted(
                (
                    (score, ti)
                    for (b, ti), score in candidates.items()
                    if b == bi and score >= 0.3
                ),
                reverse=True,
            )
            if not scores or len(scores) > 1 and scores[0][0] - scores[1][0] < 0.1:
                continue
            score, ti = scores[0]
            other = sorted(
                (
                    s
                    for (b, t), s in candidates.items()
                    if t == ti and b != bi and s >= 0.3
                ),
                reverse=True,
            )
            if other and score - other[0] < 0.1:
                continue
            links[bi] = active[ti]
        for bi, b in enumerate(boxes):
            point = {
                "frameId": frame["id"],
                "offsetMs": frame["offsetMs"],
                "box": b["box"],
                "score": b["score"],
                "label": b["label"],
            }
            track = links.get(bi)
            if track is None:
                track = {"id": len(tracks) + 1, "points": []}
                tracks.append(track)
            track["points"].append(point)
    return tracks


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("results", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = json.loads(args.results.read_text())
    if source["state"] != "complete" or len(source["frames"]) != 48:
        raise ValueError("Requires the completed 48-frame development localization run")
    result = {
        "warning": "Heuristic candidate association, not object identity ground truth, support/release inference, concern classification or accuracy. False boxes remain candidates. No interpolation or gap bridging.",
        "thresholds": {
            "nmsIou": 0.6,
            "minimumLinkIou": 0.3,
            "ambiguityMargin": 0.1,
            "maximumGapMs": 300,
        },
        "cases": [],
    }
    for ci in range(3):
        frames = sorted(
            (f for f in source["frames"] if f["case"] == ci),
            key=lambda f: f["offsetMs"],
        )
        tracks = associate(frames)
        result["cases"].append({"case": ci, "tracks": tracks})
    with args.output.open("x") as f:
        json.dump(result, f, indent=2)
    print(
        json.dumps(
            {
                "cases": [
                    {
                        "case": c["case"],
                        "tracks": len(c["tracks"]),
                        "longestFrames": max(
                            (len(t["points"]) for t in c["tracks"]), default=0
                        ),
                    }
                    for c in result["cases"]
                ]
            }
        )
    )
