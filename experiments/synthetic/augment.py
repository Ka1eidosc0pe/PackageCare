"""Doorbell-realism augmentations via ffmpeg.

Usage:
    python experiments/synthetic/augment.py IN.mp4 OUT_DIR [--n 4] [--seed 0]

Each variant randomly combines: random crop/zoom (0.85-1.0, random offset), barrel/fisheye
distortion (lenscorrection), downscale to 640x360 and back up, mild gaussian blur, temporal
noise, brightness/contrast/saturation jitter, and h264 re-encode at crf ~30-34.
Writes OUT_DIR/<stem>_aug<i>.mp4 and prints the filter chain used for each.
"""

import argparse
import random
import subprocess
from pathlib import Path

FFMPEG = "/opt/homebrew/bin/ffmpeg"


def chain(rng):
    z = rng.uniform(0.85, 1.0)
    fx, fy = rng.random(), rng.random()
    f = [
        f"crop=trunc(iw*{z:.3f}/2)*2:trunc(ih*{z:.3f}/2)*2:(iw-ow)*{fx:.3f}:(ih-oh)*{fy:.3f}",
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
    ]
    if rng.random() < 0.8:
        k1 = rng.uniform(-0.35, -0.1)  # negative = barrel (doorbell fisheye look)
        f.append(f"lenscorrection=k1={k1:.3f}:k2={k1 / 4:.3f}:i=bilinear")
    if rng.random() < 0.7:
        f += ["scale=640:360:force_original_aspect_ratio=decrease", "scale=1280:720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"]
    if rng.random() < 0.6:
        f.append(f"gblur=sigma={rng.uniform(0.4, 1.2):.2f}")
    f.append(
        f"eq=brightness={rng.uniform(-0.12, 0.12):.3f}:contrast={rng.uniform(0.85, 1.15):.3f}"
        f":saturation={rng.uniform(0.7, 1.1):.3f}"
    )
    if rng.random() < 0.7:
        f.append(f"noise=alls={rng.randint(4, 12)}:allf=t")
    f.append("format=yuv420p")
    return ",".join(f), rng.randint(30, 34)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("out_dir")
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    src, out = Path(a.input), Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(f"{a.seed}:{src.name}")
    for i in range(a.n):
        vf, crf = chain(rng)
        dst = out / f"{src.stem}_aug{i}.mp4"
        subprocess.run(
            [FFMPEG, "-v", "error", "-y", "-i", str(src), "-vf", vf, "-an",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf), str(dst)],
            check=True,
        )
        print(f"{dst}  crf={crf}  vf={vf}")


if __name__ == "__main__":
    main()
