"""Score frozen visual parcel boxes; no models, networking or handling verdicts."""

import argparse
import hashlib
import json
import math
from pathlib import Path

if __package__:
    from .associate import iou
else:
    from associate import iou

POLICY = {"minimumIou": 0.5, "acquisitionMargin": 0.1}


def score(plan, results, annotations, mode):
    if mode not in ("detection", "tracking") or results["state"] != "complete":
        raise ValueError("Complete detection or tracking results required")
    if annotations["policy"] != POLICY or len(annotations["cases"]) != len(
        plan["cases"]
    ):
        raise ValueError("Unreviewed policy or incomplete annotations")
    expected = [
        (ci, f["id"]) for ci, c in enumerate(plan["cases"]) for f in c["frames"]
    ]
    observed = [(f["case"], f["id"]) for f in results["frames"]]
    if expected != observed or len(set(expected)) != len(expected):
        raise ValueError("Every result frame must match the plan exactly once in order")
    indexed = {(f["case"], f["id"]): f for f in results["frames"]}
    output = {"mode": mode, "policy": POLICY, "cases": []}
    for ci, (case, truth) in enumerate(zip(plan["cases"], annotations["cases"])):
        if truth["sourceSha256"] != case["sourceSha256"] or len(truth["frames"]) != len(
            case["frames"]
        ):
            raise ValueError("Source or annotation coverage changed")
        locked = None
        rows = []
        acquisitions = []
        for fi, (frame, label) in enumerate(zip(case["frames"], truth["frames"])):
            if any(label[k] != frame[k] for k in ("id", "offsetMs", "sha256")):
                raise ValueError("Annotation frame changed")
            if fi == 0 or label.get("continuityBreakBefore", False):
                locked = None
            prediction = indexed[(ci, frame["id"])]
            if prediction["offsetMs"] != frame["offsetMs"]:
                raise ValueError("Prediction timestamp changed")
            if mode == "tracking":
                candidates = [
                    o
                    for o in prediction["objects"]
                    if o["box"] is not None
                    and o["areaPixels"] > 0
                    and o["objectScoreLogit"] > 0
                ]
                ids = [o["objectId"] for o in candidates]
                if len(ids) != len(set(ids)):
                    raise ValueError("Duplicate predicted object identity")
            else:
                candidates = [
                    {**d, "objectId": None}
                    for d in prediction["detections"]
                    if "box" in d["label"] or "parcel" in d["label"]
                ]
            for o in candidates:
                box = o["box"]
                if (
                    len(box) != 4
                    or not all(math.isfinite(v) for v in box)
                    or not (box[2] > box[0] and box[3] > box[1])
                ):
                    raise ValueError("Invalid predicted box")
            row = {
                "id": frame["id"],
                "offsetMs": frame["offsetMs"],
                "visibility": label["visibility"],
                "candidateCount": len(candidates),
            }
            if label["visibility"] == "unscorable":
                if label["box"] is not None or not label["reason"]:
                    raise ValueError(
                        "Unscorable frames need a reason and no guessed box"
                    )
                row.update(
                    {"bestIou": None, "anyCandidateHit": None, "lockedIdHit": None}
                )
            elif label["visibility"] in ("visible", "visible_cropped"):
                box = label["box"]
                w, h = truth["dimensions"]
                if (
                    not isinstance(box, list)
                    or len(box) != 4
                    or not all(math.isfinite(v) for v in box)
                    or not (0 <= box[0] < box[2] <= w and 0 <= box[1] < box[3] <= h)
                ):
                    raise ValueError("Invalid visual annotation box")
                matches = sorted(
                    [(iou(box, o["box"]), o["objectId"]) for o in candidates],
                    key=lambda x: x[0],
                    reverse=True,
                )
                best = matches[0][0] if matches else 0
                if (
                    mode == "tracking"
                    and locked is None
                    and best >= POLICY["minimumIou"]
                    and (
                        len(matches) < 2
                        or best - matches[1][0] >= POLICY["acquisitionMargin"]
                    )
                ):
                    locked = matches[0][1]
                    acquisitions.append({"frameIndex": fi, "objectId": locked})
                locked_iou = (
                    next(
                        (
                            overlap
                            for overlap, identity in matches
                            if identity == locked
                        ),
                        0,
                    )
                    if locked is not None
                    else 0
                )
                row.update(
                    {
                        "bestIou": best,
                        "anyCandidateHit": best >= POLICY["minimumIou"],
                        "lockedIdHit": locked_iou >= POLICY["minimumIou"]
                        if mode == "tracking"
                        else None,
                    }
                )
            else:
                raise ValueError("Unknown visibility label")
            row["lockedObjectId"] = locked
            rows.append(row)
        output["cases"].append(
            {
                "sourceSha256": case["sourceSha256"],
                "totalFrames": len(rows),
                "scoreableFrames": sum(r["anyCandidateHit"] is not None for r in rows),
                "unscorableFrames": sum(r["anyCandidateHit"] is None for r in rows),
                "anyCandidateHits": sum(r["anyCandidateHit"] is True for r in rows),
                "lockedIdHits": sum(r["lockedIdHit"] is True for r in rows)
                if mode == "tracking"
                else None,
                "acquisitions": acquisitions,
                "frames": rows,
            }
        )
    output["limitations"] = [
        "Provisional single-agent visual box annotations, not independently reviewed segmentation ground truth.",
        "Any-candidate coverage can change identity each frame; locked-ID coverage cannot switch within an annotated continuity segment.",
        "Ground-truth-assisted first unique match selects the evaluated ID, not an application identity-selection capability.",
        "Unscorable frames remain in coverage counts; no accuracy, absence, safety or damage claim is made for them.",
        "Other candidates are not automatically false positives: annotations identify one target parcel, not every object.",
        "Localization proxy only; not a handling classifier or the PRD quality gate.",
    ]
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--mode", choices=("detection", "tracking"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plan_bytes, label_bytes = args.plan.read_bytes(), args.annotations.read_bytes()
    plan = json.loads(plan_bytes)
    digest = hashlib.sha256(label_bytes).hexdigest()
    if plan.get("validationAnnotationSha256") != digest:
        raise ValueError("Annotations were not frozen into this inference scope")
    receipt = json.loads((args.run / "invocation.json").read_text())
    if receipt["planSha256"] != hashlib.sha256(plan_bytes).hexdigest():
        raise ValueError("Inference receipt does not match plan")
    result_bytes = (args.run / "results.json").read_bytes()
    result = score(plan, json.loads(result_bytes), json.loads(label_bytes), args.mode)
    result.update(
        {
            "annotationSha256": digest,
            "planSha256": receipt["planSha256"],
            "resultsSha256": hashlib.sha256(result_bytes).hexdigest(),
        }
    )
    with args.output.open("x") as f:
        json.dump(result, f, indent=2)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "cases": [
                    {k: v for k, v in c.items() if k != "frames"}
                    for c in result["cases"]
                ],
            }
        )
    )


if __name__ == "__main__":
    main()
