"""Frozen V-JEPA 2 (ViT-L, SSv2) feature extractor for PackageCare clip classification.

Usage:
    data/cv-env/bin/python experiments/synthetic/embed.py OUT.npz VIDEO_OR_DIR [VIDEO_OR_DIR ...]
        [--model-dir data/local-action-small-model] [--fps 8] [--stride 4] [--batch 4] [--device mps]

Preprocessing (matches experiments/local_cv/action_model.py letterbox):
  - ffmpeg decode at a fixed 8 fps (16-frame window = 2.0 s, stride 4 = 0.5 s hop).
  - Aspect-preserving bilinear resize to fit 256x256, padded with RGB (124,116,104).
  - /255 then ImageNet mean/std normalization.
  - Clips shorter than 16 frames are padded by repeating the last frame.

Per window features (frozen, eval, no_grad, float32):
  - enc_mean   [W,1024] mean-pooled encoder last_hidden_state
  - pooled     [W,1024] attentive-pooler output (classifier pre-logit features)
  - logits     [W,174]  SSv2 logits
Clip-level: clip_{enc_mean,pooled,logits}_{mean,max} [N,D] over windows.
Indexing: window_video_idx [W] -> videos[N]; window_start_ms / window_end_ms [W].
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

FFMPEG = "/opt/homebrew/bin/ffmpeg"
SIDE = 256
FILL = "0x7C7468"  # RGB (124,116,104), same fill as action_model.py
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
T = 16
ROOT = Path(__file__).resolve().parents[2]


def collect(inputs):
    vids = []
    for p in map(Path, inputs):
        vids += sorted(p.glob("*.mp4")) if p.is_dir() else [p]
    return vids


def decode(path, fps):
    vf = (
        f"fps={fps},scale={SIDE}:{SIDE}:force_original_aspect_ratio=decrease:flags=bilinear,"
        f"pad={SIDE}:{SIDE}:(ow-iw)/2:(oh-ih)/2:color={FILL},format=rgb24"
    )
    cmd = [FFMPEG, "-v", "error", "-i", str(path), "-vf", vf, "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, SIDE, SIDE, 3)
    if len(frames) == 0:
        raise ValueError(f"No frames decoded from {path}")
    return frames


def windows(n, stride):
    if n <= T:
        return [0]
    starts = list(range(0, n - T + 1, stride))
    if starts[-1] != n - T:  # cover the tail
        starts.append(n - T)
    return starts


def load_model(model_dir, device):
    """Load the frozen V-JEPA 2 classifier once. Returns (model, torch.device, mean, std)."""
    import torch
    from transformers import AutoModelForVideoClassification

    if device == "mps" and not torch.backends.mps.is_available():
        sys.exit("MPS unavailable (try running outside the sandbox); refusing silent CPU fallback. Use --device cpu explicitly.")
    dev = torch.device(device)
    model = AutoModelForVideoClassification.from_pretrained(
        model_dir, local_files_only=True, use_safetensors=True,
        dtype=torch.float32, attn_implementation="sdpa",
    ).to(dev).eval()
    mean = torch.tensor(MEAN, device=dev).view(1, 1, 3, 1, 1)
    std = torch.tensor(STD, device=dev).view(1, 1, 3, 1, 1)
    return model, dev, mean, std


def embed_video(path, loaded, fps=8.0, stride=4, batch=4):
    """Decode one video and return (per-window feature dict, starts_ms, ends_ms, num_frames)."""
    import torch

    model, dev, mean, std = loaded
    frames = decode(path, fps)
    n = len(frames)
    if n < T:
        frames = np.concatenate([frames, np.repeat(frames[-1:], T - n, 0)])
    st = windows(n, stride)
    per = {"enc_mean": [], "pooled": [], "logits": []}
    with torch.no_grad():
        for b in range(0, len(st), batch):
            clipb = np.stack([frames[s:s + T] for s in st[b:b + batch]])  # B,T,H,W,C
            x = torch.from_numpy(clipb).to(dev).permute(0, 1, 4, 2, 3).float() / 255
            x = (x - mean) / std  # B,T,C,H,W
            hs = model.vjepa2(pixel_values_videos=x, skip_predictor=True).last_hidden_state
            pooled = model.pooler(hs)
            logits = model.classifier(pooled)
            per["enc_mean"].append(hs.mean(1).cpu().numpy())
            per["pooled"].append(pooled.cpu().numpy())
            per["logits"].append(logits.cpu().numpy())
    feats = {k: np.concatenate(v).astype(np.float32) for k, v in per.items()}
    starts_ms = [s * 1000.0 / fps for s in st]
    ends_ms = [min(s + T, n) * 1000.0 / fps for s in st]
    return feats, starts_ms, ends_ms, n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--model-dir", default=str(ROOT / "data/local-action-small-model"))
    ap.add_argument("--fps", type=float, default=8.0)
    ap.add_argument("--stride", type=int, default=4)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--device", default="mps")
    a = ap.parse_args()

    import torch

    vids = collect(a.videos)
    if not vids:
        sys.exit("No videos found")

    t0 = time.monotonic()
    loaded = load_model(a.model_dir, a.device)
    model, dev = loaded[0], loaded[1]
    print(f"model loaded on {dev} in {time.monotonic() - t0:.1f}s", flush=True)

    W = {"enc_mean": [], "pooled": [], "logits": []}
    vidx, starts_ms, ends_ms, nframes, clip = [], [], [], [], {}
    for vi, path in enumerate(vids):
        tick = time.monotonic()
        feats, st_ms, en_ms, n = embed_video(path, loaded, a.fps, a.stride, a.batch)
        dur_ms = n * 1000.0 / a.fps
        for k in W:
            arr = feats[k]
            W[k].append(arr)
            clip.setdefault(f"clip_{k}_mean", []).append(arr.mean(0))
            clip.setdefault(f"clip_{k}_max", []).append(arr.max(0))
        vidx += [vi] * len(st_ms)
        starts_ms += st_ms
        ends_ms += en_ms
        nframes.append(n)
        mem = ""
        if dev.type == "mps":
            mem = f", mps driver mem {torch.mps.driver_allocated_memory() / 2**30:.2f} GiB"
        print(f"{path}: {n} frames ({dur_ms / 1000:.2f}s), {len(st_ms)} windows, "
              f"{time.monotonic() - tick:.2f}s{mem}", flush=True)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out,
        videos=np.array([str(v) for v in vids]),
        video_num_frames=np.array(nframes, np.int32),
        window_video_idx=np.array(vidx, np.int32),
        window_start_ms=np.array(starts_ms, np.float32),
        window_end_ms=np.array(ends_ms, np.float32),
        **{f"win_{k}": np.concatenate(v) for k, v in W.items()},
        **{k: np.stack(v) for k, v in clip.items()},
        labels=np.array([model.config.id2label[i] for i in range(model.config.num_labels)]),
        meta=np.array(f"fps={a.fps} T={T} stride={a.stride} side={SIDE} letterbox fill=124,116,104 imagenet-norm"),
    )
    print(f"wrote {out} ({len(vids)} videos, {len(vidx)} windows) total {time.monotonic() - t0:.1f}s")


if __name__ == "__main__":
    main()
