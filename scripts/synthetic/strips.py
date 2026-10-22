#!/usr/bin/env python3
"""One review image per group of clips: each row is one clip as 8 evenly spaced frames, labelled with its id.

    data/cv-env/bin/python scripts/synthetic/strips.py OUT_PREFIX CLIP.mp4 [...] [--per-image 9]
"""
import argparse, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("clips", nargs="+")
ap.add_argument("--per-image", type=int, default=9)
a = ap.parse_args()
W, H, N = 240, 135, 8
rows = []
with tempfile.TemporaryDirectory() as tmp:
    for clip in map(Path, a.clips):
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(clip)],
                                   capture_output=True, text=True).stdout)
        png = Path(tmp) / f"{clip.stem}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clip), "-vf",
                        f"fps={N / dur:.4f},scale={W}:{H},tile={N}x1", "-frames:v", "1", str(png)], check=True)
        row = Image.new("RGB", (W * N, H + 18), "black")
        row.paste(Image.open(png).convert("RGB"), (0, 18))
        ImageDraw.Draw(row).text((4, 2), clip.stem, fill="yellow")
        rows.append(row)
for k in range(0, len(rows), a.per_image):
    chunk = rows[k:k + a.per_image]
    img = Image.new("RGB", (W * N, sum(r.height for r in chunk)), "black")
    y = 0
    for r in chunk:
        img.paste(r, (0, y)); y += r.height
    path = f"{a.out}-{k // a.per_image}.jpg"
    img.save(path, quality=85)
    print(path)
