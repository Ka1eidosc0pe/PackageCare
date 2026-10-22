#!/usr/bin/env python3
"""Tile N evenly spaced frames (left-to-right, top-to-bottom) from each clip into one JPEG per clip, for quick visual review.

    python3 scripts/synthetic/contact_sheet.py OUT_DIR CLIP.mp4 [CLIP.mp4 ...] [--frames 12]
"""
import argparse
import subprocess
from pathlib import Path


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("clips", nargs="+")
    ap.add_argument("--frames", type=int, default=12)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cols = 4
    rows = -(-args.frames // cols)
    for clip in map(Path, args.clips):
        fps = args.frames / duration(clip)
        vf = (f"fps={fps:.4f},scale=480:-2,"
              f"tile={cols}x{rows}:padding=4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clip), "-vf", vf, "-frames:v", "1",
                        "-q:v", "3", str(out / f"{clip.stem}.jpg")], check=True)
        print(out / f"{clip.stem}.jpg")


if __name__ == "__main__":
    main()
