"""One frozen, offline localization prerequisite. No handling classification/training."""

import os

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"
import hashlib
import io
import json
import math
from pathlib import Path
import time
import argparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    args = parser.parse_args()
    root = args.plan.resolve().parent
    raw = args.plan.read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.plan_sha256:
        raise ValueError("Plan changed; no inference started")
    scope = json.loads(raw)
    if (
        scope["model"] != "IDEA-Research/grounding-dino-tiny"
        or scope["revision"] != "a2bb814dd30d776dcf7e30523b00659f4f141c71"
        or scope["query"] != "cardboard box. parcel. hand."
        or scope["device"] != "cpu"
        or scope["training"]
        or scope["cloudCalls"]
        or scope["boxThreshold"] != 0.3
        or scope["textThreshold"] != 0.25
        or len(scope["cases"]) != 3
        or any(len(c["frames"]) != 16 for c in scope["cases"])
    ):
        raise ValueError("Not the fixed three-case localization scope")
    images = []
    for case in scope["cases"]:
        for frame in case["frames"]:
            data = (root / frame["file"]).read_bytes()
            if (
                len(data) != frame["bytes"]
                or hashlib.sha256(data).hexdigest() != frame["sha256"]
            ):
                raise ValueError("Image changed; no inference started")
            images.append(data)
    receipt = json.loads((root / "model-receipt.json").read_text())
    model_dir = args.model_dir.resolve()
    if receipt["model"] != scope["model"] or receipt["revision"] != scope["revision"]:
        raise ValueError("Wrong model receipt")
    if not any(
        e["file"] == "model.safetensors"
        and e["sha256"]
        == "1a2412ef99bd74bcd3c2a246fa1e48581f8889a1300c9051974741314fc042f3"
        for e in receipt["files"]
    ):
        raise ValueError("Wrong checkpoint")
    for entry in receipt["files"]:
        if Path(entry["file"]).name != entry["file"]:
            raise ValueError("Invalid model filename")
        data = (model_dir / entry["file"]).read_bytes()
        if (
            len(data) != entry["bytes"]
            or hashlib.sha256(data).hexdigest() != entry["sha256"]
        ):
            raise ValueError("Model file changed")
    if len(images) != scope["maximumFrames"] or len(images) != 48:
        raise ValueError("Expected exactly 48 prepared frames")
    if (root / "invocation.json").exists():
        raise FileExistsError(
            "Existing run preserved; use a separately prepared output directory"
        )

    import torch
    import torchvision
    import transformers
    from transformers import (
        AutoConfig,
        AutoProcessor,
        AutoModelForZeroShotObjectDetection,
    )
    from PIL import Image, ImageDraw

    torch.set_num_threads(4)
    torch.manual_seed(0)
    config = AutoConfig.from_pretrained(
        model_dir, local_files_only=True, trust_remote_code=False
    )
    config.disable_custom_kernels = True
    processor = AutoProcessor.from_pretrained(
        model_dir, local_files_only=True, trust_remote_code=False
    )
    model = (
        AutoModelForZeroShotObjectDetection.from_pretrained(
            model_dir,
            config=config,
            local_files_only=True,
            trust_remote_code=False,
            use_safetensors=True,
        )
        .to("cpu")
        .eval()
    )
    with (root / "invocation.json").open("x") as f:
        json.dump(
            {
                "planSha256": hashlib.sha256(raw).hexdigest(),
                "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "device": "cpu",
                "torch": torch.__version__,
                "torchvision": torchvision.__version__,
                "transformers": transformers.__version__,
                "training": False,
                "cloudCalls": False,
            },
            f,
            indent=2,
        )
    result = {
        "warning": scope["purpose"],
        "state": "running",
        "model": scope["model"],
        "revision": scope["revision"],
        "query": scope["query"],
        "boxThreshold": scope["boxThreshold"],
        "textThreshold": scope["textThreshold"],
        "frames": [],
    }
    started = time.monotonic()
    i = 0
    try:
        for ci, case in enumerate(scope["cases"]):
            tiles = []
            for frame in case["frames"]:
                im = Image.open(io.BytesIO(images[i])).convert("RGB")
                inputs = processor(images=im, text=scope["query"], return_tensors="pt")
                t = time.monotonic()
                with torch.inference_mode():
                    outputs = model(**inputs)
                found = processor.post_process_grounded_object_detection(
                    outputs,
                    inputs.input_ids,
                    threshold=scope["boxThreshold"],
                    text_threshold=scope["textThreshold"],
                    target_sizes=[(im.height, im.width)],
                )[0]
                labels = found.get("text_labels", found.get("labels"))
                detections = []
                for box, score, label in zip(
                    found["boxes"].tolist(), found["scores"].tolist(), labels
                ):
                    if not all(math.isfinite(x) for x in [*box, score]):
                        raise ValueError("Non-finite detection")
                    detections.append({"box": box, "score": score, "label": str(label)})
                result["frames"].append(
                    {
                        "case": ci,
                        "id": frame["id"],
                        "offsetMs": frame["offsetMs"],
                        "width": im.width,
                        "height": im.height,
                        "elapsedMs": round((time.monotonic() - t) * 1000),
                        "detections": detections,
                    }
                )
                (root / "results.json").write_text(json.dumps(result, indent=2))
                print(
                    json.dumps(
                        {
                            "frame": i + 1,
                            "case": ci,
                            "offsetMs": frame["offsetMs"],
                            "detections": len(detections),
                        }
                    ),
                    flush=True,
                )
                tile = im.copy()
                tile.thumbnail((344, 210))
                view = Image.new("RGB", (344, 238), "#111820")
                view.paste(tile, (0, 28))
                draw = ImageDraw.Draw(view)
                draw.text(
                    (5, 6),
                    f"{frame['offsetMs']} ms | {len(detections)} candidates",
                    fill="white",
                )
                for di, d in enumerate(detections):
                    xy = [
                        d["box"][0] * tile.width / im.width,
                        28 + d["box"][1] * tile.height / im.height,
                        d["box"][2] * tile.width / im.width,
                        28 + d["box"][3] * tile.height / im.height,
                    ]
                    draw.rectangle(xy, outline="#ffca65", width=2)
                    draw.text(
                        (xy[0], max(28, xy[1] - 10)),
                        f"{di}:{d['label']} {d['score']:.2f}",
                        fill="#ffca65",
                    )
                tiles.append(view)
                i += 1
            sheet = Image.new("RGB", (344 * 4, 238 * 4), "#111820")
            for ti, tile in enumerate(tiles):
                sheet.paste(tile, ((ti % 4) * 344, (ti // 4) * 238))
            sheet.save(root / f"case-{ci}-detections.png")
        result["state"] = "complete"
    except Exception as exc:
        result["state"] = "failed"
        result["errorType"] = type(exc).__name__
        raise
    finally:
        result["elapsedMs"] = round((time.monotonic() - started) * 1000)
        (root / "results.json").write_text(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
