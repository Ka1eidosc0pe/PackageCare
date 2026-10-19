"""Offline prefix completion from every automatically accepted later seed.

Preserves the forward run; no manual object/time selection, labels or training.
"""

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path

if __package__:
    from .seed_policy import MASK_AGREEMENT, select_new_seeds
else:
    from seed_policy import MASK_AGREEMENT, select_new_seeds


def digest(data):
    return hashlib.sha256(data).hexdigest()


def derive_jobs(plan, results):
    expected = [
        (ci, f["id"], f["offsetMs"])
        for ci, c in enumerate(plan["cases"])
        for f in c["frames"]
    ]
    actual = [(f["case"], f["id"], f["offsetMs"]) for f in results["frames"]]
    if (
        results["state"] != "complete"
        or expected != actual
        or len(set(expected)) != len(expected)
    ):
        raise ValueError("Complete, ordered forward evidence required")
    jobs = []
    for ci, case in enumerate(plan["cases"]):
        seeds = {s["objectId"]: s for s in case["seeds"]}
        if len(seeds) != len(case["seeds"]):
            raise ValueError("Duplicate seed identity")
        accepted = set()
        for fi, frame in enumerate(f for f in results["frames"] if f["case"] == ci):
            if frame["frameIndex"] != fi:
                raise ValueError("Changed forward frame index")
            for identity in frame.get("seededObjectIds", []):
                if (
                    identity in accepted
                    or identity not in seeds
                    or seeds[identity]["frameIndex"] != fi
                ):
                    raise ValueError(
                        "Accepted seed was retimed, duplicated or hand selected"
                    )
                accepted.add(identity)
                seed = seeds[identity]
                if (
                    seed["frameId"] != frame["id"]
                    or seed["offsetMs"] != frame["offsetMs"]
                ):
                    raise ValueError("Accepted seed frame/time changed")
            if any(o["objectId"] not in accepted for o in frame["objects"]):
                raise ValueError("Forward prediction exists before its seed")
        for seed in case["seeds"]:
            if seed["objectId"] in accepted and seed["frameIndex"] > 0:
                jobs.append({"case": ci, **seed})
    return jobs


def merge_prefix_object(frame, candidate, seed_offset_ms):
    if not math.isfinite(candidate["objectScoreLogit"]):
        raise ValueError("Nonfinite reverse score")
    if frame["offsetMs"] >= seed_offset_ms or any(
        o["objectId"] == candidate["objectId"] for o in frame["objects"]
    ):
        raise ValueError("Reverse completion must not overwrite a forward prediction")
    decision = {
        "objectId": candidate["objectId"],
        "conditionedOnOffsetMs": seed_offset_ms,
    }
    if (
        candidate["box"] is None
        or candidate["areaPixels"] <= 0
        or candidate["objectScoreLogit"] <= 0
    ):
        decision["decision"] = "not_visible"
        return False, decision
    accepted, decisions = select_new_seeds([candidate], frame["objects"])
    decision.update(decisions[0])
    if accepted:
        frame["objects"].append(
            {
                **candidate,
                "temporalDirection": "backward",
                "conditionedOnOffsetMs": seed_offset_ms,
            }
        )
        decision["decision"] = "added_prefix_prediction"
    return bool(accepted), decision


def prepare(forward_plan, forward_run, output):
    if output.exists():
        raise FileExistsError("Existing completion scope preserved")
    raw_plan = forward_plan.read_bytes()
    original = json.loads(raw_plan)
    raw_results = (forward_run / "results.json").read_bytes()
    results = json.loads(raw_results)
    raw_invocation = (forward_run / "invocation.json").read_bytes()
    if (
        json.loads(raw_invocation)["planSha256"] != digest(raw_plan)
        or original["direction"] != "forward"
        or original["model"] != "facebook/sam2.1-hiera-tiny"
        or original["revision"] != "de431c4043854a71d8101e17995dfe596bf101a5"
        or original["seedPolicy"] != MASK_AGREEMENT
        or original["device"] != "mps"
        or original["training"]
        or original["cloudCalls"]
        or not 1 <= len(original["cases"]) <= 3
        or any(
            len(c["frames"]) != 16 or len(c["seeds"]) > 35 for c in original["cases"]
        )
    ):
        raise ValueError("Requires a completed frozen local MPS forward scope")
    jobs = derive_jobs(original, results)
    calls = sum(s["frameIndex"] + 1 for s in jobs)
    if not 0 < calls <= 128:
        raise ValueError("No prefix work or completion bound exceeds 128 local calls")
    files = {
        "base/plan.json": raw_plan,
        "base/results.json": raw_results,
        "base/invocation.json": raw_invocation,
        "model-receipt.json": (forward_plan.parent / "model-receipt.json").read_bytes(),
    }
    plan = copy.deepcopy(original)
    for ci, case in enumerate(plan["cases"]):
        for fi, f in enumerate(case["frames"]):
            data = (forward_plan.parent / f["file"]).read_bytes()
            if len(data) != f["bytes"] or digest(data) != f["sha256"]:
                raise ValueError("Forward source image changed")
            key = f"frames/{ci}-{fi}.jpg"
            files[key] = data
            f["file"] = key
            mask = forward_run / f"case-{ci}-frame-{fi}.npz"
            if mask.exists():
                files[f"base/{mask.name}"] = mask.read_bytes()
            elif results["frames"][ci * 16 + fi]["objects"]:
                raise ValueError("Missing saved forward masks")
    plan.update(
        {
            "direction": "reverse_prefix",
            "purpose": "Offline prefix completion from EVERY automatically accepted later detector seed, before its seed frame only. Future-conditioned predictions explicitly labeled. Original forward predictions retained. No manual selection, live-detection claim, handling classification, training or cloud calls.",
            "reverseJobs": jobs,
            "maximumReverseCalls": calls,
            "reverseMergePolicy": "preserve_forward_add_unique_v1",
            "baseHashes": {k: digest(v) for k, v in files.items()},
        }
    )
    output.mkdir(parents=True)
    for key, data in files.items():
        target = output / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    p = output / "plan.json"
    p.write_text(json.dumps(plan, indent=2))
    return {
        "plan": str(p),
        "sha256": digest(p.read_bytes()),
        "jobs": len(jobs),
        "maximumLocalCalls": calls,
    }


def run(plan_file, plan_sha256, model_dir, output):
    import os

    os.environ.update(
        {
            "HF_HUB_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
            "DO_NOT_TRACK": "1",
            "PYTORCH_ENABLE_MPS_FALLBACK": "0",
        }
    )
    raw = plan_file.read_bytes()
    if digest(raw) != plan_sha256:
        raise ValueError("Completion scope changed")
    plan, root = json.loads(raw), plan_file.parent
    if (
        plan["direction"] != "reverse_prefix"
        or plan["reverseMergePolicy"] != "preserve_forward_add_unique_v1"
        or plan["seedPolicy"] != MASK_AGREEMENT
        or plan["device"] != "mps"
        or plan["training"]
        or plan["cloudCalls"]
        or plan["threads"] != 4
        or plan["maskLogitThreshold"] != 0
    ):
        raise ValueError("Not the frozen offline completion policy")
    frozen = {}
    for key, sha in plan["baseHashes"].items():
        if Path(key).is_absolute() or ".." in Path(key).parts:
            raise ValueError("Invalid completion input path")
        data = (root / key).read_bytes()
        if digest(data) != sha:
            raise ValueError("Completion input changed")
        frozen[key] = data
    original, base = (
        json.loads(frozen["base/plan.json"]),
        json.loads(frozen["base/results.json"]),
    )
    if json.loads(frozen["base/invocation.json"])["planSha256"] != digest(
        frozen["base/plan.json"]
    ):
        raise ValueError("Changed forward lineage")
    jobs = derive_jobs(original, base)
    if (
        len(plan["cases"]) != len(original["cases"])
        or plan.get("validationAnnotationSha256")
        != original.get("validationAnnotationSha256")
        or plan["maximumFrames"] != original["maximumFrames"]
    ):
        raise ValueError("Changed case scope or annotation lineage")
    if (
        jobs != plan["reverseJobs"]
        or plan["maximumReverseCalls"] != sum(s["frameIndex"] + 1 for s in jobs)
        or not 0 < plan["maximumReverseCalls"] <= 128
    ):
        raise ValueError("Reverse jobs selected or local bound changed")
    for a, b in zip(plan["cases"], original["cases"]):
        if (
            a["sourceSha256"] != b["sourceSha256"]
            or a["seeds"] != b["seeds"]
            or [{k: v for k, v in f.items() if k != "file"} for f in a["frames"]]
            != [{k: v for k, v in f.items() if k != "file"} for f in b["frames"]]
        ):
            raise ValueError("Changed source frames/seeds")
    for frame in base["frames"]:
        if (
            frame["objects"]
            and f"base/case-{frame['case']}-frame-{frame['frameIndex']}.npz"
            not in frozen
        ):
            raise ValueError("Forward mask omitted from completion lineage")
    receipt = json.loads(frozen["model-receipt.json"])
    if (
        receipt["model"] != "facebook/sam2.1-hiera-tiny"
        or receipt["revision"] != "de431c4043854a71d8101e17995dfe596bf101a5"
        or not any(
            e["file"] == "model.safetensors"
            and e["sha256"]
            == "48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7"
            for e in receipt["files"]
        )
    ):
        raise ValueError("Wrong tracker checkpoint")
    for entry in receipt["files"]:
        if Path(entry["file"]).name != entry["file"]:
            raise ValueError("Invalid model filename")
        data = (model_dir / entry["file"]).read_bytes()
        if len(data) != entry["bytes"] or digest(data) != entry["sha256"]:
            raise ValueError("Changed tracker weights")
    output.mkdir(parents=True, exist_ok=False)
    import io
    import time
    import numpy as np
    import torch
    from PIL import Image
    from transformers import Sam2VideoModel, Sam2VideoProcessor

    (output / "invocation.json").write_text(
        json.dumps(
            {
                "planSha256": digest(raw),
                "scriptSha256": digest(Path(__file__).read_bytes()),
                "policyModuleSha256": digest(
                    Path(__file__).with_name("seed_policy.py").read_bytes()
                ),
                "device": "mps",
                "dtype": "float32",
                "mpsFallback": False,
                "training": False,
                "cloudCalls": False,
            },
            indent=2,
        )
    )
    result = {
        "state": "running",
        "warning": plan["purpose"],
        "device": "mps",
        "frames": copy.deepcopy(base["frames"]),
        "modelForwardCalls": 0,
        "modelObjectEvaluations": 0,
        "reversePredictions": [],
    }
    for frame in result["frames"]:
        frame["forwardElapsedMs"] = frame.pop("elapsedMs", 0)
        frame["elapsedMs"] = 0
        frame["reverseDecisions"] = []
        name = f"case-{frame['case']}-frame-{frame['frameIndex']}.npz"
        if f"base/{name}" in frozen:
            (output / name).write_bytes(frozen[f"base/{name}"])

    def save():
        file = output / "results.json"
        file.with_suffix(".tmp").write_text(json.dumps(result, indent=2))
        file.with_suffix(".tmp").replace(file)

    started = time.monotonic()
    save()
    try:
        for frame in result["frames"]:
            ci, fi = frame["case"], frame["frameIndex"]
            entry = plan["cases"][ci]["frames"][fi]
            image = Image.open(io.BytesIO(frozen[entry["file"]]))
            mask_name = f"base/case-{ci}-frame-{fi}.npz"
            if mask_name not in frozen:
                continue
            with np.load(io.BytesIO(frozen[mask_name]), allow_pickle=False) as saved:
                if set(saved.files) != {str(o["objectId"]) for o in frame["objects"]}:
                    raise ValueError("Forward mask identity mismatch")
                for obj in frame["objects"]:
                    mask = saved[str(obj["objectId"])]
                    if (
                        mask.dtype != np.bool_
                        or mask.shape != (image.height, image.width)
                        or int(mask.sum()) != obj["areaPixels"]
                    ):
                        raise ValueError("Forward mask shape/area mismatch")
        if not torch.backends.mps.is_available():
            raise ValueError("Local MPS unavailable; no CPU/cloud fallback")
        torch.set_num_threads(4)
        torch.manual_seed(0)
        processor = Sam2VideoProcessor.from_pretrained(
            model_dir, local_files_only=True, trust_remote_code=False
        )
        model = (
            Sam2VideoModel.from_pretrained(
                model_dir,
                local_files_only=True,
                trust_remote_code=False,
                use_safetensors=True,
            )
            .to("mps")
            .eval()
        )
        started = time.monotonic()
        for job in jobs:
            ci, identity, start = job["case"], job["objectId"], job["frameIndex"]
            case = plan["cases"][ci]
            video = [
                Image.open(io.BytesIO(frozen[f["file"]])).convert("RGB")
                for f in case["frames"][: start + 1]
            ]
            session = processor.init_video_session(
                video=video,
                inference_device="mps",
                processing_device="cpu",
                video_storage_device="cpu",
                dtype=torch.float32,
            )
            processor.add_inputs_to_inference_session(
                inference_session=session,
                frame_idx=start,
                obj_ids=[identity],
                input_boxes=[[job["box"]]],
            )
            for fi in range(start, -1, -1):
                tick = time.monotonic()
                if result["modelForwardCalls"] >= plan["maximumReverseCalls"]:
                    raise ValueError("Completion inference bound reached")
                result["modelForwardCalls"] += 1
                result["modelObjectEvaluations"] += 1
                save()
                with torch.inference_mode():
                    prediction = model(
                        inference_session=session, frame_idx=fi, reverse=True
                    )
                if prediction.object_ids != [identity]:
                    raise ValueError("Unexpected reverse object identity")
                mask = (
                    (
                        processor.post_process_masks(
                            [prediction.pred_masks],
                            original_sizes=[[video[fi].height, video[fi].width]],
                            binarize=False,
                        )[0][0, 0]
                        > 0
                    )
                    .cpu()
                    .numpy()
                )
                logit = float(prediction.object_score_logits.cpu().reshape(-1)[0])
                if not math.isfinite(logit):
                    raise ValueError("Nonfinite reverse score")
                yy, xx = np.nonzero(mask)
                candidate = {
                    "objectId": identity,
                    "areaPixels": int(mask.sum()),
                    "objectScoreLogit": logit,
                    "box": [
                        int(xx.min()),
                        int(yy.min()),
                        int(xx.max() + 1),
                        int(yy.max() + 1),
                    ]
                    if len(xx)
                    else None,
                }
                raw_name = f"reverse-case-{ci}-object-{identity}-frame-{fi}.npz"
                np.savez_compressed(output / raw_name, **{str(identity): mask})
                result["reversePredictions"].append(
                    {
                        "case": ci,
                        "frameIndex": fi,
                        "conditionedOnOffsetMs": job["offsetMs"],
                        "maskFile": raw_name,
                        **candidate,
                    }
                )
                frame = result["frames"][ci * 16 + fi]
                if fi < start:
                    added, decision = merge_prefix_object(
                        frame, candidate, job["offsetMs"]
                    )
                    frame["reverseDecisions"].append(decision)
                    if added:
                        name = output / f"case-{ci}-frame-{fi}.npz"
                        masks = {}
                        if name.exists():
                            with np.load(name, allow_pickle=False) as old:
                                masks = {k: old[k] for k in old.files}
                        masks[str(identity)] = mask
                        np.savez_compressed(name, **masks)
                frame["elapsedMs"] += round((time.monotonic() - tick) * 1000)
                save()
            print(
                json.dumps(
                    {
                        "case": ci,
                        "automaticObjectId": identity,
                        "prefixFrames": start,
                        "callsIncludingSeed": start + 1,
                    }
                ),
                flush=True,
            )
            del session
        result["state"] = "complete"
    except Exception as error:
        result.update({"state": "failed", "errorType": type(error).__name__})
        raise
    finally:
        result["elapsedMs"] = round((time.monotonic() - started) * 1000)
        save()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--forward-plan", type=Path, required=True)
    prep.add_argument("--forward-run", type=Path, required=True)
    prep.add_argument("--output", type=Path, required=True)
    execute = sub.add_parser("run")
    execute.add_argument("--plan", type=Path, required=True)
    execute.add_argument("--plan-sha256", required=True)
    execute.add_argument("--model-dir", type=Path, required=True)
    execute.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.operation == "prepare":
        print(json.dumps(prepare(args.forward_plan, args.forward_run, args.output)))
    else:
        run(args.plan, args.plan_sha256, args.model_dir, args.output)
