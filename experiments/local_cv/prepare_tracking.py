"""Freeze every automatic candidate's first box as a forward tracking seed."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil

if __package__:
    from .associate import associate
else:
    from associate import associate


def prepare_tracking(source: Path, output: Path):
    if output.exists():
        raise FileExistsError("Existing tracking scope preserved")
    raw = {
        name: (source / name).read_bytes()
        for name in ("plan.json", "results.json", "tracks.json")
    }
    baseline = json.loads(raw["plan.json"])
    results = json.loads(raw["results.json"])
    tracks = json.loads(raw["tracks.json"])
    if (
        results["state"] != "complete"
        or len(results["frames"]) != 48
        or len(baseline["cases"]) != 3
    ):
        raise ValueError(
            "Requires the complete three-case local detection prerequisite"
        )
    indexed = {f["id"]: f for f in results["frames"]}
    if len(indexed) != 48:
        raise ValueError("Duplicate result frame ID")
    cases = []
    images = []
    for ci, case in enumerate(baseline["cases"]):
        frames = case["frames"]
        if len(frames) != 16:
            raise ValueError("Expected sixteen frames per case")
        observed = []
        prepared = []
        for frame in frames:
            detection = indexed[frame["id"]]
            if detection["case"] != ci or detection["offsetMs"] != frame["offsetMs"]:
                raise ValueError("Frame/case/time mismatch")
            data = (source / frame["file"]).read_bytes()
            if (
                len(data) != frame["bytes"]
                or hashlib.sha256(data).hexdigest() != frame["sha256"]
            ):
                raise ValueError("Source image changed")
            if len(frame["id"]) != 36 or any(
                ch not in "0123456789abcdef-" for ch in frame["id"]
            ):
                raise ValueError("Invalid evidence ID")
            key = f"frames/{frame['id']}.jpg"
            images.append((key, data))
            prepared.append({**frame, "file": key})
            observed.append(detection)
        automatic = associate(observed)
        if (
            tracks["cases"][ci]["case"] != ci
            or automatic != tracks["cases"][ci]["tracks"]
        ):
            raise ValueError("Candidate tracks changed or manually selected")
        if len(automatic) > 35:
            raise ValueError("Object bound exceeded; no silent selection")
        seeds = []
        for track in automatic:
            p = track["points"][0]
            fi = next(i for i, f in enumerate(frames) if f["id"] == p["frameId"])
            seeds.append(
                {
                    "objectId": track["id"],
                    "frameIndex": fi,
                    "frameId": p["frameId"],
                    "offsetMs": p["offsetMs"],
                    "box": p["box"],
                    "score": p["score"],
                    "label": p["label"],
                }
            )
        cases.append(
            {
                "sourceSha256": case["sourceSha256"],
                "durationMs": case["durationMs"],
                "frames": prepared,
                "seeds": seeds,
            }
        )
    output.mkdir(parents=True)
    try:
        (output / "frames").mkdir()
        for key, data in images:
            (output / key).write_bytes(data)
        plan = {
            "purpose": "Local forward mask propagation prerequisite. Automatic first detection of EVERY candidate track, no manual action/region seed or future correction. No handling classification, training, model adoption or cloud calls. Same three development excerpts, not held out.",
            "model": "facebook/sam2.1-hiera-tiny",
            "revision": "de431c4043854a71d8101e17995dfe596bf101a5",
            "device": "cpu",
            "threads": 4,
            "maskLogitThreshold": 0,
            "direction": "forward",
            "training": False,
            "cloudCalls": False,
            "maximumFrames": 48,
            "maximumObjectsPerCase": 35,
            "sourceDirectory": str(source.resolve()),
            "sourceHashes": {n: hashlib.sha256(b).hexdigest() for n, b in raw.items()},
            "cases": cases,
        }
        p = output / "plan.json"
        p.write_text(json.dumps(plan, indent=2))
        return {
            "plan": str(p),
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
            "objectsPerCase": [len(c["seeds"]) for c in cases],
        }
    except Exception:
        shutil.rmtree(output)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare_tracking(args.source, args.output)))
