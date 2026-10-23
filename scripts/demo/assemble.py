#!/usr/bin/env python3
"""Fit recorded takes to per-screen narration and render the final 1080p demo video.

    python3 scripts/demo/assemble.py AUDIO_DIR OUT.mp4 [--takes data/demo-video/takes]

AUDIO_DIR holds screen1..screen9 audio files (any ffmpeg-readable format: m4a, mp3, wav, ...). Each screen's
takes are joined, then sped up (at most 1.6x) or held on the last frame so the picture ends with the narration.
Leading/trailing silence is trimmed from each narration file and loudness is normalised.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

# screen -> [(take, share of the narration)]
SCREENS = {1: [("title", 0.35), ("home", 0.65)], 2: [("s2", 1)], 3: [("s3", 1)], 4: [("s4", 1)], 5: [("s5", 1)],
           6: [("s6", 1)], 7: [("s7", 1)], 8: [("built", 0.8), ("aws", 0.2)], 9: [("roadmap", 0.8), ("end", 0.2)]}
SKIP_HEAD = {"home": 0.0, "s4": 1.2, "s5": 1.2, "s6": 1.2, "s7": 1.2}  # default-selection frames before the first click
GAP = 0.35  # silence between screens
MAX_SPEED = 1.6
MIN_SPEED = 0.8  # slow footage slightly before holding a frame


def run(*cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def dur(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def audio_for(audio_dir, n):
    found = sorted(p for p in Path(audio_dir).glob(f"screen{n}.*") if p.suffix.lower() not in (".txt", ".md"))
    if not found:
        raise SystemExit(f"missing audio for screen {n} in {audio_dir}")
    return found[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio_dir")
    ap.add_argument("out")
    ap.add_argument("--takes", default="data/demo-video/takes")
    a = ap.parse_args()
    takes = Path(a.takes)
    tmp = Path(tempfile.mkdtemp(prefix="demo-"))
    parts, total = [], 0.0
    for n, names in SCREENS.items():
        src = audio_for(a.audio_dir, n)
        voice = tmp / f"v{n}.wav"
        # trim silence at both ends, normalise loudness, pad a short gap
        run("ffmpeg", "-y", "-i", str(src), "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
            f"loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur={GAP}", "-ar", "48000", "-ac", "2", str(voice))
        narration = dur(voice)
        subs, notes = [], []
        for i, (name, share) in enumerate(names):
            seg = tmp / f"{n}-{name}.mp4"
            run("ffmpeg", "-y", "-ss", str(SKIP_HEAD.get(name, 0.0)), "-i", str(takes / f"{name}.webm"), "-an", "-vf",
                "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16",
                "-preset", "veryfast", str(seg))
            length, alloc = dur(seg), narration * share
            speed = min(MAX_SPEED, max(MIN_SPEED, length / alloc))
            alloc = max(alloc, length / MAX_SPEED)  # never cut footage: extend the screen with a pause instead
            vf = f"setpts=PTS/{speed:.4f}"
            if length / speed < alloc:
                vf += f",tpad=stop_mode=clone:stop_duration={alloc - length / speed + 0.1:.2f}"
            sub = tmp / f"{n}-{i}.mp4"
            run("ffmpeg", "-y", "-i", str(seg), "-vf", f"{vf},trim=duration={alloc:.3f},setpts=PTS-STARTPTS",
                "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-r", "30", str(sub))
            subs.append(sub)
            notes.append(f"{name} {length:.1f}s@{speed:.2f}x->{alloc:.1f}s")
        lst = tmp / f"{n}.txt"
        lst.write_text("".join(f"file '{x}'\n" for x in subs))
        joined = tmp / f"{n}-joined.mp4"
        run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined))
        target = dur(joined)
        part = tmp / f"part{n}.mp4"
        run("ffmpeg", "-y", "-i", str(joined), "-i", str(voice), "-filter_complex", f"[1:a]apad=whole_dur={target:.3f}[a]",
            "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{target:.3f}", str(part))
        parts.append(part)
        total += target
        print(f"screen {n}: narration {narration:5.1f}s, screen {target:5.1f}s  [{'; '.join(notes)}]")
    lst = tmp / "all.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", a.out)
    print(f"wrote {a.out}: {dur(a.out):.1f}s (limit 180s)")


if __name__ == "__main__":
    main()
