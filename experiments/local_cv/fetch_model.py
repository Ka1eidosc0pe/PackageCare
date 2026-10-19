"""Fetch one public, pinned checkpoint for LOCAL use; never uploads user media."""

import os

os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ["DO_NOT_TRACK"] = "1"
import argparse
import hashlib
import json
from pathlib import Path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--receipt-dir", type=Path, required=True)
    choice = parser.add_mutually_exclusive_group()
    choice.add_argument(
        "--tracker",
        action="store_true",
        help="Fetch pinned SAM2.1 Tiny instead of the detector",
    )
    choice.add_argument(
        "--actions",
        action="store_true",
        help="Fetch the pinned local V-JEPA 2 classifier",
    )
    args = parser.parse_args()
    from huggingface_hub import snapshot_download

    model = "IDEA-Research/grounding-dino-tiny"
    revision = "a2bb814dd30d776dcf7e30523b00659f4f141c71"
    expected = "1a2412ef99bd74bcd3c2a246fa1e48581f8889a1300c9051974741314fc042f3"
    if args.tracker:
        model = "facebook/sam2.1-hiera-tiny"
        revision = "de431c4043854a71d8101e17995dfe596bf101a5"
        expected = "48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7"
    if args.actions:
        model = "facebook/vjepa2-vitl-fpc16-256-ssv2"
        revision = "4aa02df83918538fc21cfaf576382fa20e489a80"
        expected = "35aeab96e8513d9cc60ee08c1642dd121c86452c926ce3599b3317896a320396"
    root = Path(
        snapshot_download(
            model,
            revision=revision,
            token=False,
            allow_patterns=["*.json", "*.txt", "model.safetensors", "README.md"],
            local_dir=args.model_dir,
        )
    )
    files = [
        {
            "file": p.name,
            "bytes": p.stat().st_size,
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        }
        for p in sorted(root.iterdir())
        if p.is_file()
    ]
    if not any(
        e["file"] == "model.safetensors" and e["sha256"] == expected for e in files
    ):
        raise ValueError("Checkpoint digest mismatch")
    receipt = args.receipt_dir / "model-receipt.json"
    if receipt.exists():
        raise FileExistsError("Existing receipt preserved")
    receipt.write_text(
        json.dumps({"model": model, "revision": revision, "files": files}, indent=2)
    )
    print(
        json.dumps(
            {
                "receipt": str(receipt),
                "files": len(files),
                "bytes": sum(e["bytes"] for e in files),
            }
        )
    )
