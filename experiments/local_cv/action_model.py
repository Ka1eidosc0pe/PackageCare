"""Fixed local temporal-action prerequisite, not a PackageCare assessment adapter."""

import argparse
import hashlib
import json
import math
from pathlib import Path

MODEL = "facebook/vjepa2-vitl-fpc16-256-ssv2"
REVISION = "4aa02df83918538fc21cfaf576382fa20e489a80"
WEIGHTS = "35aeab96e8513d9cc60ee08c1642dd121c86452c926ce3599b3317896a320396"
RELEASE_IDS = [8, 9, 10, 11, 12, 28, 31, 110, 113, 117, 151, 152, 153, 154, 155]
PLACEMENT_IDS = [
    102,
    103,
    104,
    105,
    106,
    107,
    108,
    109,
    111,
    112,
    114,
    116,
    118,
    119,
    120,
]
PREPROCESS = {
    "kind": "full_frame_letterbox_v1",
    "side": 256,
    "fillRgb": [124, 116, 104],
    "resample": "bilinear",
    "mean": [0.485, 0.456, 0.406],
    "std": [0.229, 0.224, 0.225],
    "framesPerClip": 16,
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(file):
    hasher = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def prepare(parents, output):
    if output.exists():
        raise FileExistsError("Existing action scope preserved")
    cases, files, hashes, sources, ids = [], {}, {}, set(), set()
    for parent in parents:
        data = parent.read_bytes()
        hashes[str(parent.resolve())] = sha(data)
        for case in json.loads(data)["cases"]:
            if case["sourceSha256"] in sources or len(case["frames"]) != 16:
                raise ValueError(
                    "Distinct sources with all sixteen prepared frames required"
                )
            sources.add(case["sourceSha256"])
            frames = []
            previous_offset = -1
            for frame in case["frames"]:
                identity, offset = frame["id"], frame["offsetMs"]
                if (
                    identity in ids
                    or len(identity) != 36
                    or any(c not in "0123456789abcdef-" for c in identity)
                ):
                    raise ValueError("Invalid or duplicate frame identity")
                if (
                    not isinstance(offset, int)
                    or not 0 <= offset < case["durationMs"]
                    or offset <= previous_offset
                ):
                    raise ValueError("Frames must cover the ordered prepared sequence")
                previous_offset = offset
                ids.add(identity)
                image = (parent.parent / frame["file"]).read_bytes()
                if len(image) != frame["bytes"] or sha(image) != frame["sha256"]:
                    raise ValueError("Prepared action input changed")
                key = f"frames/{identity}.jpg"
                files[key] = image
                frames.append(
                    {
                        "id": identity,
                        "file": key,
                        "offsetMs": offset,
                        "sha256": frame["sha256"],
                        "bytes": frame["bytes"],
                    }
                )
            cases.append(
                {
                    "sourceSha256": case["sourceSha256"],
                    "durationMs": case["durationMs"],
                    "frames": frames,
                }
            )
    if not 1 <= len(cases) <= 5:
        raise ValueError("At most five complete clips per local action batch")
    plan = {
        "purpose": "Pretrained generic temporal-action ranking on every prepared full frame, not parcel identity, calibrated risk, timing evidence, product assessment, training or model adoption. Development sources reused; no held-out claim.",
        "model": MODEL,
        "revision": REVISION,
        "device": "mps",
        "dtype": "float32",
        "threads": 4,
        "attention": "sdpa",
        "mpsMemoryFraction": 0.5,
        "mpsFallback": False,
        "preprocess": PREPROCESS,
        "genericReleaseClassIds": RELEASE_IDS,
        "genericPlacementClassIds": PLACEMENT_IDS,
        "maximumLocalCalls": len(cases),
        "training": False,
        "cloudCalls": False,
        "automaticRetries": 0,
        "parentPlanHashes": hashes,
        "cases": cases,
    }
    output.mkdir(parents=True)
    (output / "frames").mkdir()
    for key, data in files.items():
        (output / key).write_bytes(data)
    target = output / "plan.json"
    target.write_text(json.dumps(plan, indent=2))
    return {
        "plan": str(target),
        "sha256": file_sha(target),
        "cases": len(cases),
        "frames": len(files),
        "maximumLocalCalls": len(cases),
    }


def summarize(logits, labels):
    if (
        len(logits) != 174
        or set(labels) != {str(i) for i in range(174)}
        or not all(math.isfinite(v) for v in logits)
    ):
        raise ValueError("Expected every finite native class logit")
    largest = max(logits)
    exponentials = [math.exp(v - largest) for v in logits]
    denominator = sum(exponentials)
    ordered = sorted(range(174), key=lambda i: (-logits[i], i))
    rankings = [
        {
            "rank": rank + 1,
            "classId": identity,
            "label": labels[str(identity)],
            "logit": logits[identity],
            "softmaxScore": exponentials[identity] / denominator,
        }
        for rank, identity in enumerate(ordered)
    ]
    return {
        "rankings": rankings,
        "bestGenericReleaseRank": min(
            r["rank"] for r in rankings if r["classId"] in RELEASE_IDS
        ),
        "bestGenericPlacementRank": min(
            r["rank"] for r in rankings if r["classId"] in PLACEMENT_IDS
        ),
        "warning": "Closed-set native action scores, not parcel handling certainty, abstention or evidence-backed PackageCare verdicts. Generic action class does not identify the parcel or establish release/support/landing.",
    }


def letterbox(image):
    from PIL import Image

    scale = min(256 / image.width, 256 / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.BILINEAR,
    )
    result = Image.new("RGB", (256, 256), tuple(PREPROCESS["fillRgb"]))
    result.paste(resized, ((256 - resized.width) // 2, (256 - resized.height) // 2))
    return result


def preview(plan_file):
    import io
    import numpy as np
    from PIL import Image, ImageDraw

    root = plan_file.parent
    if list(root.rglob("invocation.json")):
        raise ValueError("Invoked action scope cannot be changed")
    plan = json.loads(plan_file.read_text())
    if plan["preprocess"] != PREPROCESS:
        raise ValueError("Unreviewed action preprocessing")
    output = root / "preview"
    output.mkdir(exist_ok=False)
    for ci, case in enumerate(plan["cases"]):
        images = []
        for frame in case["frames"]:
            data = (root / frame["file"]).read_bytes()
            if sha(data) != frame["sha256"] or len(data) != frame["bytes"]:
                raise ValueError("Preview source changed")
            images.append(letterbox(Image.open(io.BytesIO(data)).convert("RGB")))
        pixels = np.stack([np.asarray(im) for im in images])
        case["preprocessedRgbSha256"] = sha(pixels.tobytes())
        np.save(output / f"case-{ci}-input.npy", pixels, allow_pickle=False)
        sheet = Image.new("RGB", (1024, 1136), "#111820")
        for fi, image in enumerate(images):
            sheet.paste(image, ((fi % 4) * 256, (fi // 4) * 284 + 28))
            ImageDraw.Draw(sheet).text(
                ((fi % 4) * 256 + 4, (fi // 4) * 284 + 4),
                f"{case['frames'][fi]['offsetMs']}ms",
                fill="white",
            )
        sheet.save(output / f"case-{ci}-inputs.png")
    plan_file.write_text(json.dumps(plan, indent=2))
    return {
        "plan": str(plan_file),
        "sha256": file_sha(plan_file),
        "cases": len(plan["cases"]),
        "fullFieldOfView": True,
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
    if sha(raw) != plan_sha256:
        raise ValueError("Action scope changed")
    plan, root = json.loads(raw), plan_file.parent
    if (
        plan["model"] != MODEL
        or plan["revision"] != REVISION
        or plan["preprocess"] != PREPROCESS
        or plan["genericReleaseClassIds"] != RELEASE_IDS
        or plan["genericPlacementClassIds"] != PLACEMENT_IDS
        or plan["device"] != "mps"
        or plan["dtype"] != "float32"
        or plan["threads"] != 4
        or plan["attention"] != "sdpa"
        or plan["mpsMemoryFraction"] != 0.5
        or plan["mpsFallback"]
        or plan["training"]
        or plan["cloudCalls"]
        or plan["automaticRetries"]
        or not 1 <= len(plan["cases"]) <= 5
        or plan["maximumLocalCalls"] != len(plan["cases"])
        or any(len(c["frames"]) != 16 for c in plan["cases"])
    ):
        raise ValueError("Not the fixed local action scope")
    frozen = []
    for case in plan["cases"]:
        if len(case.get("preprocessedRgbSha256", "")) != 64:
            raise ValueError("Freeze and inspect preprocessing before inference")
        images = []
        for frame in case["frames"]:
            data = (root / frame["file"]).read_bytes()
            if len(data) != frame["bytes"] or sha(data) != frame["sha256"]:
                raise ValueError("Action image changed")
            images.append(data)
        frozen.append(images)
    receipt = json.loads((root / "model-receipt.json").read_text())
    if (
        receipt["model"] != MODEL
        or receipt["revision"] != REVISION
        or not any(
            e["file"] == "model.safetensors" and e["sha256"] == WEIGHTS
            for e in receipt["files"]
        )
    ):
        raise ValueError("Wrong action checkpoint")
    for entry in receipt["files"]:
        if (
            Path(entry["file"]).name != entry["file"]
            or (model_dir / entry["file"]).stat().st_size != entry["bytes"]
            or file_sha(model_dir / entry["file"]) != entry["sha256"]
        ):
            raise ValueError("Action artifact changed")
    config = json.loads((model_dir / "config.json").read_text())
    if (
        config["frames_per_clip"] != 16
        or config["crop_size"] != 256
        or config["architectures"] != ["VJEPA2ForVideoClassification"]
    ):
        raise ValueError("Unexpected native action geometry")
    preprocessing = json.loads(
        (model_dir / "video_preprocessor_config.json").read_text()
    )
    if (
        preprocessing["image_mean"] != PREPROCESS["mean"]
        or preprocessing["image_std"] != PREPROCESS["std"]
        or not preprocessing["do_normalize"]
        or not preprocessing["do_rescale"]
    ):
        raise ValueError("Unexpected action normalization")
    output.mkdir(parents=True, exist_ok=False)
    import io
    import time
    import numpy as np
    import torch
    import transformers
    from transformers import AutoModelForVideoClassification
    from PIL import Image, ImageDraw

    (output / "invocation.json").write_text(
        json.dumps(
            {
                "planSha256": sha(raw),
                "scriptSha256": file_sha(Path(__file__)),
                "torchVersion": torch.__version__,
                "transformersVersion": transformers.__version__,
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
        "attemptedLocalCalls": 0,
        "completedCases": [],
        "preprocess": PREPROCESS,
    }

    def save():
        target = output / "results.json"
        target.with_suffix(".tmp").write_text(json.dumps(result, indent=2))
        target.with_suffix(".tmp").replace(target)

    save()
    started = time.monotonic()
    try:
        if not torch.backends.mps.is_available():
            raise ValueError("MPS unavailable; no fallback")
        torch.set_num_threads(4)
        torch.manual_seed(0)
        torch.mps.set_per_process_memory_fraction(0.5)
        model = (
            AutoModelForVideoClassification.from_pretrained(
                model_dir,
                local_files_only=True,
                trust_remote_code=False,
                use_safetensors=True,
                dtype=torch.float32,
                attn_implementation="sdpa",
            )
            .to("mps")
            .eval()
        )
        labels = {str(k): v for k, v in model.config.id2label.items()}
        summarize([0.0] * 174, labels)
        started = time.monotonic()
        for ci, case in enumerate(plan["cases"]):
            tick = time.monotonic()
            images = [
                letterbox(Image.open(io.BytesIO(b)).convert("RGB")) for b in frozen[ci]
            ]
            pixels = np.stack([np.asarray(im) for im in images])
            if sha(pixels.tobytes()) != case["preprocessedRgbSha256"]:
                raise ValueError("Actual model pixels differ from frozen preview")
            np.save(output / f"case-{ci}-input.npy", pixels, allow_pickle=False)
            sheet = Image.new("RGB", (256 * 4, 284 * 4), "#111820")
            for fi, image in enumerate(images):
                sheet.paste(image, ((fi % 4) * 256, (fi // 4) * 284 + 28))
                ImageDraw.Draw(sheet).text(
                    ((fi % 4) * 256 + 4, (fi // 4) * 284 + 4),
                    f"{case['frames'][fi]['offsetMs']}ms",
                    fill="white",
                )
            sheet.save(output / f"case-{ci}-inputs.png")
            tensor = (
                torch.from_numpy(pixels.copy())
                .permute(0, 3, 1, 2)
                .to(dtype=torch.float32)
                / 255
            )
            tensor = (
                (
                    (tensor - torch.tensor(PREPROCESS["mean"])[None, :, None, None])
                    / torch.tensor(PREPROCESS["std"])[None, :, None, None]
                )
                .unsqueeze(0)
                .to("mps")
            )
            if tuple(tensor.shape) != (1, 16, 3, 256, 256) or not bool(
                torch.isfinite(tensor).all().cpu()
            ):
                raise ValueError("Invalid native action input tensor")
            if result["attemptedLocalCalls"] >= plan["maximumLocalCalls"]:
                raise ValueError("Local action call bound reached")
            result["attemptedLocalCalls"] += 1
            save()
            with torch.inference_mode():
                prediction = model(pixel_values_videos=tensor)
            torch.mps.synchronize()
            logits = prediction.logits.detach().cpu().reshape(-1).tolist()
            row = {
                "case": ci,
                "sourceSha256": case["sourceSha256"],
                "inputFrameIds": [f["id"] for f in case["frames"]],
                "elapsedMs": round((time.monotonic() - tick) * 1000),
                "mpsAllocatedBytes": torch.mps.current_allocated_memory(),
                "mpsDriverAllocatedBytes": torch.mps.driver_allocated_memory(),
                **summarize(logits, labels),
            }
            result["completedCases"].append(row)
            save()
            print(
                json.dumps(
                    {
                        "case": ci,
                        "elapsedMs": row["elapsedMs"],
                        "top5": row["rankings"][:5],
                    }
                ),
                flush=True,
            )
            del tensor, prediction
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
    preparation = sub.add_parser("prepare")
    preparation.add_argument("--parents", type=Path, nargs="+", required=True)
    preparation.add_argument("--output", type=Path, required=True)
    inspection = sub.add_parser("preview")
    inspection.add_argument("--plan", type=Path, required=True)
    invocation = sub.add_parser("run")
    invocation.add_argument("--plan", type=Path, required=True)
    invocation.add_argument("--plan-sha256", required=True)
    invocation.add_argument("--model-dir", type=Path, required=True)
    invocation.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.operation == "prepare":
        print(json.dumps(prepare(args.parents, args.output)))
    elif args.operation == "preview":
        print(json.dumps(preview(args.plan)))
    else:
        run(args.plan, args.plan_sha256, args.model_dir, args.output)
