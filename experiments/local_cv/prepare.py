"""Copy all frames from a prepared three-case evaluation; no models or networking."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil


def prepare(baseline: Path, output: Path):
    if output.exists():
        raise FileExistsError("Existing experiment directory preserved")
    plan = json.loads(baseline.read_text())
    cases = plan["cases"]
    if len(cases) != 3 or len({c["sourceSha256"] for c in cases}) != 3:
        raise ValueError("Expected three distinct development recordings")
    pending = []
    seen = set()
    for case in cases:
        frames = sorted(
            (a for a in case["assets"] if a["kind"] == "frame"),
            key=lambda a: a["offsetMs"],
        )
        if case["item"]["split"] != "development" or len(frames) != 16:
            raise ValueError("Expected all sixteen frames of each development case")
        if len({a["offsetMs"] for a in frames}) != 16:
            raise ValueError("Duplicate time offsets")
        for frame in frames:
            if frame["id"] in seen:
                raise ValueError("Duplicate evidence ID across cases")
            seen.add(frame["id"])
            if (
                Path(frame["key"]).name != frame["key"]
                or not 0 <= frame["offsetMs"] < case["durationMs"]
            ):
                raise ValueError("Invalid frame reference")
            data = (baseline.parent / "media" / frame["key"]).read_bytes()
            if (
                len(data) != frame["bytes"]
                or hashlib.sha256(data).hexdigest() != frame["sha256"]
            ):
                raise ValueError("Source frame changed")
            pending.append((case, frame, data))
    output.mkdir(parents=True, exist_ok=False)
    try:
        (output / "frames").mkdir()
        prepared = []
        for case in cases:
            frames = []
            for c, a, data in pending:
                if c is not case:
                    continue
                filename = f"frames/{a['id']}.jpg"
                # Filenames derive only from validated UUID-shaped asset identifiers.
                if len(a["id"]) != 36 or any(
                    ch not in "0123456789abcdef-" for ch in a["id"]
                ):
                    raise ValueError("Invalid evidence ID")
                (output / filename).write_bytes(data)
                frames.append(
                    {
                        "id": a["id"],
                        "file": filename,
                        "offsetMs": a["offsetMs"],
                        "sha256": a["sha256"],
                        "bytes": a["bytes"],
                    }
                )
            prepared.append(
                {
                    "sourceSha256": case["sourceSha256"],
                    "durationMs": case["durationMs"],
                    "frames": frames,
                }
            )
        scope = {
            "purpose": "Evaluation-only parcel/hand localization prerequisite, not action classification, product adoption or training. Same three development excerpts; all sixteen frames each.",
            "model": "IDEA-Research/grounding-dino-tiny",
            "revision": "a2bb814dd30d776dcf7e30523b00659f4f141c71",
            "query": "cardboard box. parcel. hand.",
            "boxThreshold": 0.3,
            "textThreshold": 0.25,
            "device": "cpu",
            "maximumFrames": 48,
            "training": False,
            "cloudCalls": False,
            "cases": prepared,
        }
        file = output / "plan.json"
        file.write_text(json.dumps(scope, indent=2))
        return {
            "plan": str(file),
            "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "frames": 48,
        }
    except Exception:
        shutil.rmtree(output)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.baseline, args.output)))
