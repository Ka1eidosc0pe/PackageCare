"""Render saved predictions for human review. Selection here never affects inference."""

import argparse
import hashlib
import io
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--case", type=int, choices=range(3), required=True)
    parser.add_argument("--objects", type=int, nargs="+")
    args = parser.parse_args()
    from PIL import Image, ImageDraw
    import numpy as np

    plan = json.loads(args.plan.read_text())
    results = json.loads((args.run / "results.json").read_text())
    if results["state"] != "complete" or len(results["frames"]) != 48:
        raise ValueError("Requires completed run")
    case = plan["cases"][args.case]
    ids = [s["objectId"] for s in case["seeds"]]
    selected = args.objects or ids
    if any(i not in ids for i in selected):
        raise ValueError("Object was not an automatic seed")
    output = args.run / "review"
    output.mkdir(exist_ok=True)
    for identity in selected:
        seed = next(s for s in case["seeds"] if s["objectId"] == identity)
        sheet = Image.new("RGB", (344 * 4, 226 * 4), "#111820")
        for fi, f in enumerate(case["frames"]):
            data = (args.plan.parent / f["file"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != f["sha256"]:
                raise ValueError("Review image changed")
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            file = args.run / f"case-{args.case}-frame-{fi}.npz"
            note = "not seeded"
            if file.exists():
                with np.load(file, allow_pickle=False) as masks:
                    if str(identity) in masks:
                        mask = masks[str(identity)]
                        if mask.dtype != np.bool_ or mask.shape != (
                            im.height,
                            im.width,
                        ):
                            raise ValueError("Wrong mask dimensions/type")
                        overlay = np.zeros((im.height, im.width, 4), dtype=np.uint8)
                        overlay[mask] = [80, 240, 145, 115]
                        im = Image.alpha_composite(im, Image.fromarray(overlay))
                        note = "predicted mask" if mask.any() else "no mask"
            im.thumbnail((344, 196))
            tile = Image.new("RGB", (344, 226), "#111820")
            tile.paste(im, (0, 28))
            d = ImageDraw.Draw(tile)
            d.text(
                (5, 6),
                f"{f['offsetMs']}ms | {'SEED | ' if fi == seed['frameIndex'] else ''}{note}",
                fill="white",
            )
            sheet.paste(tile, ((fi % 4) * 344, (fi // 4) * 226))
        sheet.save(output / f"case-{args.case}-object-{identity}.png")
    print(
        json.dumps(
            {
                "case": args.case,
                "reviewedObjectSheets": selected,
                "warning": "Display selection only; not ground truth or a model accuracy score.",
            }
        )
    )


if __name__ == "__main__":
    main()
