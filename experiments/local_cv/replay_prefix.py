"""Replay saved reverse masks with an interior-seed guard; zero model calls."""

import argparse
import copy
import io
import json
import math
from pathlib import Path

if __package__:
    from .reverse_prefix import digest, derive_jobs, merge_prefix_object
else:
    from reverse_prefix import digest, derive_jobs, merge_prefix_object

POLICY = "interior_positive_seed_v1"


def seed_eligibility(obj, width, height):
    box = obj["box"]
    if (
        box is None
        or obj["areaPixels"] <= 0
        or not math.isfinite(obj["objectScoreLogit"])
        or obj["objectScoreLogit"] <= 0
    ):
        return {"eligible": False, "reason": "seed_not_visible"}
    if (
        len(box) != 4
        or not all(math.isfinite(v) for v in box)
        or not (0 < box[0] < box[2] < width and 0 < box[1] < box[3] < height)
    ):
        return {"eligible": False, "reason": "seed_touches_image_boundary"}
    return {"eligible": True, "reason": "positive_interior_seed"}


def replay(plan_file, parent_run, output):
    if output.exists():
        raise FileExistsError("Existing replay preserved")
    raw_plan, raw_result = (
        plan_file.read_bytes(),
        (parent_run / "results.json").read_bytes(),
    )
    raw_invocation = (parent_run / "invocation.json").read_bytes()
    plan, source = json.loads(raw_plan), json.loads(raw_result)
    root = plan_file.parent
    if (
        source["state"] != "complete"
        or plan["direction"] != "reverse_prefix"
        or json.loads(raw_invocation)["planSha256"] != digest(raw_plan)
    ):
        raise ValueError("Completed, matching reverse parent required")
    frozen = {}
    for key, sha in plan["baseHashes"].items():
        if Path(key).is_absolute() or ".." in Path(key).parts:
            raise ValueError("Invalid replay input path")
        data = (root / key).read_bytes()
        if digest(data) != sha:
            raise ValueError("Replay source changed")
        frozen[key] = data
    base = json.loads(frozen["base/results.json"])
    jobs = derive_jobs(json.loads(frozen["base/plan.json"]), base)
    expected = [
        (j["case"], j["objectId"], fi)
        for j in jobs
        for fi in range(j["frameIndex"], -1, -1)
    ]
    predictions = source["reversePredictions"]
    if (
        jobs != plan["reverseJobs"]
        or expected
        != [(p["case"], p["objectId"], p["frameIndex"]) for p in predictions]
        or len(expected) != source["modelForwardCalls"]
    ):
        raise ValueError("Saved reverse predictions were omitted/reordered")
    job_offsets = {(j["case"], j["objectId"]): j["offsetMs"] for j in jobs}
    if any(
        p["conditionedOnOffsetMs"] != job_offsets[(p["case"], p["objectId"])]
        for p in predictions
    ):
        raise ValueError("Reverse conditioning timestamp changed")
    import numpy as np
    from PIL import Image

    decisions = {}
    for job in jobs:
        ci, fi, identity = job["case"], job["frameIndex"], job["objectId"]
        image = Image.open(io.BytesIO(frozen[plan["cases"][ci]["frames"][fi]["file"]]))
        obj = next(
            o
            for o in base["frames"][ci * 16 + fi]["objects"]
            if o["objectId"] == identity
        )
        decisions[(ci, identity)] = {
            "case": ci,
            "objectId": identity,
            "seedOffsetMs": job["offsetMs"],
            **seed_eligibility(obj, *image.size),
        }
    raw_masks = {}
    for prediction in predictions:
        key = prediction["maskFile"]
        if Path(key).name != key:
            raise ValueError("Invalid reverse mask filename")
        data = (parent_run / key).read_bytes()
        raw_masks[key] = data
        image = Image.open(
            io.BytesIO(
                frozen[
                    plan["cases"][prediction["case"]]["frames"][
                        prediction["frameIndex"]
                    ]["file"]
                ]
            )
        )
        with np.load(io.BytesIO(data), allow_pickle=False) as masks:
            if masks.files != [str(prediction["objectId"])]:
                raise ValueError("Raw mask identity changed")
            mask = masks[masks.files[0]]
            if (
                mask.dtype != np.bool_
                or mask.shape != (image.height, image.width)
                or int(mask.sum()) != prediction["areaPixels"]
            ):
                raise ValueError("Raw mask shape/area changed")
            yy, xx = np.nonzero(mask)
            box = (
                [int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)]
                if len(xx)
                else None
            )
            if box != prediction["box"]:
                raise ValueError("Raw mask envelope changed")
    derived_plan = copy.deepcopy(plan)
    derived_plan.update(
        {
            "direction": "saved_prefix_replay",
            "eligibilityPolicy": POLICY,
            "maximumReverseCalls": 0,
            "replaySeedDecisions": list(decisions.values()),
            "purpose": "Post-hoc development replay of saved masks with positive interior-seed guard. Zero new model calls. Original forward evidence retained, future conditioning labeled; not independent validation or handling classification.",
            "replayParent": {
                "planSha256": digest(raw_plan),
                "resultsSha256": digest(raw_result),
                "invocationSha256": digest(raw_invocation),
                "rawMasksSha256": {k: digest(v) for k, v in raw_masks.items()},
            },
        }
    )
    output.mkdir(parents=True)
    for key, data in frozen.items():
        target = output / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    scope_file = output / "plan.json"
    scope_file.write_text(json.dumps(derived_plan, indent=2))
    out = output / "attempt-1"
    out.mkdir()
    (out / "invocation.json").write_text(
        json.dumps(
            {
                "operation": "saved_mask_replay",
                "planSha256": digest(scope_file.read_bytes()),
                "scriptSha256": digest(Path(__file__).read_bytes()),
                "mergeModuleSha256": digest(
                    Path(__file__).with_name("reverse_prefix.py").read_bytes()
                ),
                "modelCalls": 0,
                "cloudCalls": False,
                "training": False,
            },
            indent=2,
        )
    )
    result = {
        "state": "running",
        "warning": derived_plan["purpose"],
        "modelForwardCalls": 0,
        "modelObjectEvaluations": 0,
        "eligibilityPolicy": POLICY,
        "seedEligibility": list(decisions.values()),
        "frames": copy.deepcopy(base["frames"]),
        "reversePredictions": predictions,
    }
    for frame in result["frames"]:
        frame["forwardElapsedMs"] = frame.pop("elapsedMs", 0)
        frame["elapsedMs"] = 0
        frame["reverseDecisions"] = []
        name = f"case-{frame['case']}-frame-{frame['frameIndex']}.npz"
        if f"base/{name}" in frozen:
            (out / name).write_bytes(frozen[f"base/{name}"])
    for key, data in raw_masks.items():
        (out / key).write_bytes(data)

    def save():
        file = out / "results.json"
        file.with_suffix(".tmp").write_text(json.dumps(result, indent=2))
        file.with_suffix(".tmp").replace(file)

    save()
    try:
        for prediction in predictions:
            ci, fi, identity = (
                prediction["case"],
                prediction["frameIndex"],
                prediction["objectId"],
            )
            seed_offset = prediction["conditionedOnOffsetMs"]
            frame = result["frames"][ci * 16 + fi]
            if frame["offsetMs"] >= seed_offset:
                continue
            decision = decisions[(ci, identity)]
            if not decision["eligible"]:
                frame["reverseDecisions"].append(
                    {
                        "objectId": identity,
                        "decision": "withheld_boundary_seed",
                        "reason": decision["reason"],
                        "conditionedOnOffsetMs": seed_offset,
                    }
                )
                continue
            candidate = {
                k: prediction[k]
                for k in ("objectId", "box", "areaPixels", "objectScoreLogit")
            }
            added, decision = merge_prefix_object(frame, candidate, seed_offset)
            frame["reverseDecisions"].append(decision)
            if added:
                name = out / f"case-{ci}-frame-{fi}.npz"
                masks = {}
                if name.exists():
                    with np.load(name, allow_pickle=False) as previous:
                        masks = {k: previous[k] for k in previous.files}
                with np.load(
                    io.BytesIO(raw_masks[prediction["maskFile"]]), allow_pickle=False
                ) as saved:
                    masks[str(identity)] = saved[str(identity)]
                np.savez_compressed(name, **masks)
        result["state"] = "complete"
    except Exception as error:
        result.update({"state": "failed", "errorType": type(error).__name__})
        raise
    finally:
        save()
    return {
        "plan": str(scope_file),
        "output": str(out),
        "seedEligibility": list(decisions.values()),
        "newModelCalls": 0,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(replay(args.plan, args.run, args.output)))
