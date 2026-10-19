"""Exhaustive fixed temporal views using the unchanged local action runner."""

import argparse
import json
from pathlib import Path
import shutil

if __package__:
    from . import action_model
else:
    import action_model


def views(frames):
    if (
        len(frames) != 32
        or len({f["id"] for f in frames}) != 32
        or any(a["offsetMs"] >= b["offsetMs"] for a, b in zip(frames, frames[1:]))
    ):
        raise ValueError("Every ordered dense frame is required")
    return [frames[start : start + 16] for start in (0, 8, 16)]


def prepare(evaluation, model_receipt, output):
    if output.exists():
        raise FileExistsError("Existing window scope preserved")
    raw = evaluation.read_bytes()
    parent = json.loads(raw)
    receipt_bytes = model_receipt.read_bytes()
    receipt = json.loads(receipt_bytes)
    if (
        receipt["model"] != action_model.MODEL
        or receipt["revision"] != action_model.REVISION
    ):
        raise ValueError("Wrong action receipt")
    sources, seen_sources, seen_ids = [], set(), set()
    for case in parent["cases"]:
        original = next(a for a in case["assets"] if a["name"].startswith("original-"))
        if (
            case["item"]["split"] != "development"
            or original["sha256"] != case["sourceSha256"]
            or case["sourceSha256"] in seen_sources
        ):
            raise ValueError("Distinct development recordings required")
        seen_sources.add(case["sourceSha256"])
        frames = sorted(
            (a for a in case["assets"] if a["kind"] == "frame"),
            key=lambda a: a["offsetMs"],
        )
        views(frames)
        prepared = []
        for asset in [original, *frames]:
            if Path(asset["key"]).name != asset["key"]:
                raise ValueError("Invalid prepared asset key")
            file = evaluation.parent / "media" / asset["key"]
            data = file.read_bytes()
            if len(data) != asset["bytes"] or action_model.sha(data) != asset["sha256"]:
                raise ValueError("Dense source changed")
            if asset is original:
                continue
            if asset["id"] in seen_ids:
                raise ValueError("Frame identity reused across sources")
            seen_ids.add(asset["id"])
            prepared.append(
                {
                    "id": asset["id"],
                    "offsetMs": asset["offsetMs"],
                    "file": str(file.resolve()),
                    "sha256": asset["sha256"],
                    "bytes": asset["bytes"],
                }
            )
        sources.append(
            {
                "sourceSha256": case["sourceSha256"],
                "durationMs": case["durationMs"],
                "frames": prepared,
            }
        )
    if not 1 <= len(sources) <= 5:
        raise ValueError("One to five sources required")
    output.mkdir(parents=True)
    children = []
    for wi, start in enumerate((0, 8, 16)):
        virtual = output / f"parent-window-{wi}.json"
        virtual.write_text(
            json.dumps(
                {"cases": [{**c, "frames": views(c["frames"])[wi]} for c in sources]},
                indent=2,
            )
        )
        child = output / f"window-{wi}"
        action_model.prepare([virtual], child)
        shutil.copyfile(model_receipt, child / "model-receipt.json")
        p = child / "plan.json"
        plan = json.loads(p.read_text())
        plan["purpose"] = (
            "Automatic overlapping temporal view of every source, not whole-original-clip classification, handling verdict, training or held-out evidence. No action-time selection."
        )
        plan["temporalView"] = {
            "startIndex": start,
            "sourceSamples": 32,
            "nativeSamples": 16,
        }
        p.write_text(json.dumps(plan, indent=2))
        children.append(
            {
                "window": wi,
                "startIndex": start,
                "plan": f"window-{wi}/plan.json",
                "sha256": None,
            }
        )
    bundle = {
        "kind": "local-action-windows-v1",
        "parentEvaluationSha256": action_model.sha(raw),
        "model": action_model.MODEL,
        "revision": action_model.REVISION,
        "sources": sources,
        "children": children,
        "maximumLocalCalls": 3 * len(sources),
        "finalized": False,
        "training": False,
        "cloudCalls": False,
        "automaticRetries": 0,
    }
    p = output / "plan.json"
    p.write_text(json.dumps(bundle, indent=2))
    return {
        "plan": str(p),
        "sources": len(sources),
        "views": 3 * len(sources),
        "maximumLocalCalls": bundle["maximumLocalCalls"],
    }


def inspect(plan_file, require_final=True):
    bundle = json.loads(plan_file.read_text())
    sources, children = bundle["sources"], bundle["children"]
    if (
        bundle["kind"] != "local-action-windows-v1"
        or bundle["model"] != action_model.MODEL
        or bundle["revision"] != action_model.REVISION
        or bundle["training"]
        or bundle["cloudCalls"]
        or bundle["automaticRetries"]
        or not 1 <= len(sources) <= 5
        or len({c["sourceSha256"] for c in sources}) != len(sources)
        or bundle["maximumLocalCalls"] != 3 * len(sources)
        or len(children) != 3
        or (require_final and not bundle["finalized"])
    ):
        raise ValueError("Not the complete fixed window batch")
    for ci, child in enumerate(children):
        if (
            child["window"] != ci
            or child["startIndex"] != (0, 8, 16)[ci]
            or child["plan"] != f"window-{ci}/plan.json"
        ):
            raise ValueError("Window subset/order changed")
        p = plan_file.parent / child["plan"]
        raw = p.read_bytes()
        plan = json.loads(raw)
        if (
            (require_final and action_model.sha(raw) != child["sha256"])
            or plan["maximumLocalCalls"] != len(sources)
            or len(plan["cases"]) != len(sources)
        ):
            raise ValueError("Child scope or call bound changed")
        for source, case in zip(sources, plan["cases"]):
            expected = views(source["frames"])[ci]
            if (
                case["sourceSha256"] != source["sourceSha256"]
                or len(case["frames"]) != 16
                or [
                    {k: f[k] for k in ("id", "offsetMs", "sha256", "bytes")}
                    for f in case["frames"]
                ]
                != [
                    {k: f[k] for k in ("id", "offsetMs", "sha256", "bytes")}
                    for f in expected
                ]
                or (require_final and len(case.get("preprocessedRgbSha256", "")) != 64)
            ):
                raise ValueError("Dense coverage or source identity changed")
            for frame in case["frames"]:
                data = (p.parent / frame["file"]).read_bytes()
                if (
                    len(data) != frame["bytes"]
                    or action_model.sha(data) != frame["sha256"]
                ):
                    raise ValueError("Window image changed")
    return bundle


def preview(plan_file):
    bundle = inspect(plan_file, require_final=False)
    if bundle["finalized"] or list(plan_file.parent.rglob("invocation.json")):
        raise ValueError("Window scope already sealed or invoked")
    for child in bundle["children"]:
        report = action_model.preview(plan_file.parent / child["plan"])
        child["sha256"] = report["sha256"]
    bundle["finalized"] = True
    plan_file.write_text(json.dumps(bundle, indent=2))
    inspect(plan_file)
    return {
        "plan": str(plan_file),
        "sha256": action_model.file_sha(plan_file),
        "maximumLocalCalls": bundle["maximumLocalCalls"],
    }


def run(plan_file, plan_sha256, model_dir, output):
    if action_model.file_sha(plan_file) != plan_sha256:
        raise ValueError("Window bundle changed")
    bundle = inspect(plan_file)
    output.mkdir(parents=True, exist_ok=False)
    (output / "invocation.json").write_text(
        json.dumps(
            {
                "planSha256": plan_sha256,
                "scriptSha256": action_model.file_sha(Path(__file__)),
                "runnerSha256": action_model.file_sha(Path(action_model.__file__)),
                "maximumLocalCalls": bundle["maximumLocalCalls"],
                "cloudCalls": False,
                "training": False,
            },
            indent=2,
        )
    )
    result = {
        "state": "running",
        "sourceCount": len(bundle["sources"]),
        "maximumLocalCalls": bundle["maximumLocalCalls"],
        "attemptedLocalCalls": 0,
        "completedViews": [],
        "warning": "Three automatic overlapping views per source are not independent recordings or calibrated handling judgments. Sample-window bounds are not action times.",
    }

    def save():
        target = output / "results.json"
        target.with_suffix(".tmp").write_text(json.dumps(result, indent=2))
        target.with_suffix(".tmp").replace(target)

    save()
    try:
        for child in bundle["children"]:
            wi = child["window"]
            action_model.run(
                plan_file.parent / child["plan"],
                child["sha256"],
                model_dir,
                output / f"window-{wi}",
            )
        result["state"] = "complete"
    except Exception as error:
        result.update({"state": "failed", "errorType": type(error).__name__})
        raise
    finally:
        for child in bundle["children"]:
            p = output / f"window-{child['window']}/results.json"
            if not p.exists():
                continue
            recorded = json.loads(p.read_text())
            result["attemptedLocalCalls"] += recorded["attemptedLocalCalls"]
            for row in recorded["completedCases"]:
                frame_subset = views(bundle["sources"][row["case"]]["frames"])[
                    child["window"]
                ]
                result["completedViews"].append(
                    {
                        "window": child["window"],
                        "sampleStartMs": frame_subset[0]["offsetMs"],
                        "sampleEndMs": frame_subset[-1]["offsetMs"],
                        **row,
                    }
                )
        save()
    return {
        "output": str(output),
        "state": result["state"],
        "attemptedLocalCalls": result["attemptedLocalCalls"],
        "completedViews": len(result["completedViews"]),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--evaluation", type=Path, required=True)
    p.add_argument("--model-receipt", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p = sub.add_parser("preview")
    p.add_argument("--plan", type=Path, required=True)
    p = sub.add_parser("run")
    p.add_argument("--plan", type=Path, required=True)
    p.add_argument("--plan-sha256", required=True)
    p.add_argument("--model-dir", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.operation == "prepare":
        print(json.dumps(prepare(args.evaluation, args.model_receipt, args.output)))
    elif args.operation == "preview":
        print(json.dumps(preview(args.plan)))
    else:
        print(json.dumps(run(args.plan, args.plan_sha256, args.model_dir, args.output)))
