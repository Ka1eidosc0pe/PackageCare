"""Frozen local SAM2 forward tracking, automatic detector seeds only."""

import os

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "0"
from pathlib import Path
import hashlib
import json
import io
import time
import math
import argparse

if __package__:
    from .seed_policy import MASK_AGREEMENT, select_new_seeds
else:
    from seed_policy import MASK_AGREEMENT, select_new_seeds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.plan.resolve().parent
    plan_bytes = args.plan.read_bytes()
    if hashlib.sha256(plan_bytes).hexdigest() != args.plan_sha256:
        raise ValueError("Changed scope")
    plan = json.loads(plan_bytes)
    if plan.get("seedPolicy") not in (None, MASK_AGREEMENT):
        raise ValueError("Unreviewed seed policy")
    model_dir = args.model_dir.resolve()
    if (
        plan["model"] != "facebook/sam2.1-hiera-tiny"
        or plan["revision"] != "de431c4043854a71d8101e17995dfe596bf101a5"
        or plan["direction"] != "forward"
        or plan["cloudCalls"]
        or plan["training"]
        or plan["device"] not in ("cpu", "mps")
        or plan["threads"] != 4
        or plan["maskLogitThreshold"] != 0
        or plan["maximumFrames"] != 16 * len(plan["cases"])
        or plan["maximumObjectsPerCase"] != 35
        or not 1 <= len(plan["cases"]) <= 3
        or any(len(c["frames"]) != 16 or len(c["seeds"]) > 35 for c in plan["cases"])
    ):
        raise ValueError("Not the frozen local tracking scope")
    receipt = json.loads((root / "model-receipt.json").read_text())
    if (
        receipt["model"] != plan["model"]
        or receipt["revision"] != plan["revision"]
        or not any(
            e["file"] == "model.safetensors"
            and e["sha256"]
            == "48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7"
            for e in receipt["files"]
        )
    ):
        raise ValueError("Wrong checkpoint receipt")
    for e in receipt["files"]:
        if Path(e["file"]).name != e["file"]:
            raise ValueError("Invalid model filename")
        b = (model_dir / e["file"]).read_bytes()
        if hashlib.sha256(b).hexdigest() != e["sha256"] or len(b) != e["bytes"]:
            raise ValueError("Changed model")
    for name, sha in plan["sourceHashes"].items():
        if Path(name).name != name:
            raise ValueError("Invalid source filename")
        if (
            hashlib.sha256(
                (
                    Path(plan.get("sourceDirectory", root.parent / "local-cv-baseline"))
                    / name
                ).read_bytes()
            ).hexdigest()
            != sha
        ):
            raise ValueError("Changed input results")
    frozen = []
    for c in plan["cases"]:
        row = []
        for f in c["frames"]:
            b = (root / f["file"]).read_bytes()
            if hashlib.sha256(b).hexdigest() != f["sha256"] or len(b) != f["bytes"]:
                raise ValueError("Changed image")
            row.append(b)
        frozen.append(row)
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    import torch
    import numpy as np
    from transformers import Sam2VideoModel, Sam2VideoProcessor
    from PIL import Image

    if plan["device"] == "mps" and not torch.backends.mps.is_available():
        raise ValueError("Local MPS unavailable; no fallback or cloud inference")
    device = plan["device"]
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
        .to(device)
        .eval()
    )
    (out / "invocation.json").write_text(
        json.dumps(
            {
                "planSha256": hashlib.sha256(plan_bytes).hexdigest(),
                "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "policyModuleSha256": hashlib.sha256(
                    Path(__file__).with_name("seed_policy.py").read_bytes()
                ).hexdigest(),
                "associationModuleSha256": hashlib.sha256(
                    Path(__file__).with_name("associate.py").read_bytes()
                ).hexdigest(),
                "training": False,
                "cloudCalls": False,
                "device": device,
                "dtype": "float32",
                "mpsFallback": False,
                "torchVersion": torch.__version__,
            },
            indent=2,
        )
    )
    result = {
        "state": "running",
        "warning": plan["purpose"],
        "device": device,
        "seedPolicy": plan.get("seedPolicy"),
        "modelForwardCalls": 0,
        "modelObjectEvaluations": 0,
        "frames": [],
    }
    started = time.monotonic()

    def save():
        p = out / "results.json"
        p.with_suffix(".tmp").write_text(json.dumps(result, indent=2))
        p.with_suffix(".tmp").replace(p)

    save()

    def infer(session, fi, image):
        if result["modelForwardCalls"] >= 2 * plan["maximumFrames"]:
            raise ValueError("Local comparison call bound reached")
        result["modelForwardCalls"] += 1
        result["modelObjectEvaluations"] += len(session.obj_ids)
        save()
        with torch.inference_mode():
            prediction = model(inference_session=session, frame_idx=fi)
        masks = processor.post_process_masks(
            [prediction.pred_masks],
            original_sizes=[[image.height, image.width]],
            binarize=False,
        )[0]
        masks = (masks[:, 0] > 0).cpu().numpy()
        scores = prediction.object_score_logits.cpu().reshape(-1).tolist()
        if not len(masks) == len(prediction.object_ids) == len(scores):
            raise ValueError("Mask/object count mismatch")
        objects = []
        for identity, mask, score in zip(prediction.object_ids, masks, scores):
            yy, xx = np.nonzero(mask)
            box = (
                [int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)]
                if len(xx)
                else None
            )
            if not math.isfinite(score):
                raise ValueError("Non-finite tracking score")
            objects.append(
                {
                    "objectId": identity,
                    "box": box,
                    "areaPixels": int(mask.sum()),
                    "objectScoreLogit": score,
                }
            )
        return prediction, masks, objects

    try:
        for ci, c in enumerate(plan["cases"]):
            video = [Image.open(io.BytesIO(b)).convert("RGB") for b in frozen[ci]]
            session = processor.init_video_session(
                video=video,
                inference_device=device,
                processing_device="cpu",
                video_storage_device="cpu",
                dtype=torch.float32,
            )
            for fi, f in enumerate(c["frames"]):
                t = time.monotonic()
                new = [s for s in c["seeds"] if s["frameIndex"] == fi]
                cached = None
                if plan.get("seedPolicy") and session.obj_ids:
                    cached = infer(session, fi, video[fi])
                    new, decisions = select_new_seeds(new, cached[2])
                else:
                    decisions = [
                        {"objectId": s["objectId"], "decision": "seeded"} for s in new
                    ]
                if new:
                    processor.add_inputs_to_inference_session(
                        inference_session=session,
                        frame_idx=fi,
                        obj_ids=[s["objectId"] for s in new],
                        input_boxes=[[s["box"] for s in new]],
                    )
                if not session.obj_ids:
                    result["frames"].append(
                        {
                            "case": ci,
                            "frameIndex": fi,
                            "id": f["id"],
                            "offsetMs": f["offsetMs"],
                            "objects": [],
                            "elapsedMs": 0,
                        }
                    )
                    save()
                    continue
                prediction, masks, objects = (
                    infer(session, fi, video[fi]) if new or cached is None else cached
                )
                np.savez_compressed(
                    out / f"case-{ci}-frame-{fi}.npz",
                    **{
                        str(identity): mask
                        for identity, mask in zip(prediction.object_ids, masks)
                    },
                )
                result["frames"].append(
                    {
                        "case": ci,
                        "frameIndex": fi,
                        "id": f["id"],
                        "offsetMs": f["offsetMs"],
                        "seededObjectIds": [s["objectId"] for s in new],
                        "seedDecisions": decisions,
                        "objects": objects,
                        "elapsedMs": round((time.monotonic() - t) * 1000),
                    }
                )
                save()
                print(
                    json.dumps(
                        {
                            "case": ci,
                            "frame": fi,
                            "objects": len(objects),
                            "nonemptyMasks": sum(o["areaPixels"] > 0 for o in objects),
                        }
                    ),
                    flush=True,
                )
            del session
        result["state"] = "complete"
    except Exception as e:
        result["state"] = "failed"
        result["errorType"] = type(e).__name__
        raise
    finally:
        result["elapsedMs"] = round((time.monotonic() - started) * 1000)
        save()


if __name__ == "__main__":
    main()
