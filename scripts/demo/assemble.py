#!/usr/bin/env python3
"""Fit recorded takes to per-screen narration and render the final 1080p demo video.

    python3 scripts/demo/assemble.py AUDIO_DIR OUT.mp4 [--takes data/demo-video/takes]

AUDIO_DIR holds screen1..screen9 audio (any ffmpeg-readable format, case-insensitive names). Each screen is a
slice of a take between two marks written by rec.py (TAKE.marks.json), so consecutive screens filmed in one
continuous take join without any jump. Footage is fitted to its narration (0.8-1.6x, then a held frame; never
cut). A short dip to the background colour is used only where the picture changes source (slide <-> app,
local app <-> cloud app). Narration is trimmed of leading/trailing silence and loudness-normalised.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

# screen -> [(take, share of narration, start mark, end mark)]; None = start/end of the take
SCREENS = {
    1: [("title", 0.35, None, None), ("home", 0.65, "start", None)],
    2: [("ring", 1, "start", "saved")],
    3: [("ring", 1, "saved", "end")],
    4: [("cloud", 1, "s4", "s5")],
    5: [("cloud", 1, "s5", "s6")],
    6: [("cloud", 1, "s6", "s6_close")],
    7: [("cloud", 1, "s6_close", "end")],
    8: [("built", 0.8, None, None), ("aws", 0.2, None, None)],
    9: [("roadmap", 0.8, None, None), ("end", 0.2, None, None)],
}
CUTS = {"ring": [("wait_from", "wait_to", -0.4)]}  # remove the analysis wait (end trimmed slightly before result)
SLOW_ZOOM = {"title", "built", "roadmap"}
DIP = 0.3  # seconds per side of a dip-to-background transition
BG = "0xf3f5f0"
GAP = 0.35
MAX_SPEED, MIN_SPEED = 1.6, 0.8
BASE = "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p"


def run(*cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def dur(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def audio_for(audio_dir, n):
    found = sorted(p for p in Path(audio_dir).iterdir()
                   if p.stem.lower() == f"screen{n}" and p.suffix.lower() not in (".txt", ".md"))
    if not found:
        raise SystemExit(f"missing audio for screen {n} in {audio_dir}")
    return found[0]


def extract(take, src, marks, start, end, out):
    """Slice [start, end] of a take (by mark), removing any configured cuts inside it."""
    t0 = marks.get(start, 0.0) if start else 0.0
    t1 = marks.get(end) if end else dur(src)
    keep, cur = [], t0
    for a, b, adj in CUTS.get(take, []):
        if a in marks and b in marks and t0 <= marks[a] and marks[b] <= t1:
            keep.append((cur, marks[a])); cur = marks[b] + adj
    keep.append((cur, t1))
    chains = "".join(f"[0:v]trim={k0:.3f}:{k1:.3f},setpts=PTS-STARTPTS,{BASE}[k{i}];" for i, (k0, k1) in enumerate(keep))
    fc = chains + "".join(f"[k{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=1:a=0[v]"
    run("ffmpeg", "-y", "-i", str(src), "-an", "-filter_complex", fc, "-map", "[v]",
        "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", str(out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio_dir")
    ap.add_argument("out")
    ap.add_argument("--takes", default="data/demo-video/takes")
    a = ap.parse_args()
    takes = Path(a.takes)
    tmp = Path(tempfile.mkdtemp(prefix="demo-"))
    order = [(n, i, spec) for n, specs in SCREENS.items() for i, spec in enumerate(specs)]
    parts = []
    for n, specs in SCREENS.items():
        voice = tmp / f"v{n}.wav"
        run("ffmpeg", "-y", "-i", str(audio_for(a.audio_dir, n)), "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
            f"loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur={GAP}", "-ar", "48000", "-ac", "2", str(voice))
        narration = dur(voice)
        subs, notes = [], []
        for i, (take, share, start, end) in enumerate(specs):
            idx = order.index((n, i, (take, share, start, end)))
            prev_take = order[idx - 1][2][0] if idx > 0 else None
            next_take = order[idx + 1][2][0] if idx + 1 < len(order) else None
            src = takes / f"{take}.webm"
            marks_file = takes / f"{take}.marks.json"
            marks = json.loads(marks_file.read_text()) if marks_file.exists() else {}
            seg = tmp / f"{n}-{i}-seg.mp4"
            extract(take, src, marks, start, end, seg)
            length, alloc = dur(seg), narration * share
            speed = min(MAX_SPEED, max(MIN_SPEED, length / alloc))
            alloc = max(alloc, length / MAX_SPEED)  # never cut footage: extend with a pause instead
            vf = f"setpts=PTS/{speed:.4f}"
            if length / speed < alloc:
                vf += f",tpad=stop_mode=clone:stop_duration={alloc - length / speed + 0.1:.2f}"
            sub = tmp / f"{n}-{i}.mp4"
            run("ffmpeg", "-y", "-i", str(seg), "-vf", f"{vf},trim=duration={alloc:.3f},setpts=PTS-STARTPTS",
                "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-r", "30", str(sub))
            post = []
            if take in SLOW_ZOOM:
                frames = int(alloc * 30) + 1
                post.append(f"scale=2304:1296,zoompan=z='1+0.05*in/{frames}':d=1:x='iw/2-(iw/zoom/2)':"
                            f"y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30")
            if prev_take is not None and prev_take != take:
                post.append(f"fade=t=in:st=0:d={DIP}:color={BG}")
            if next_take is not None and next_take != take:
                post.append(f"fade=t=out:st={max(0, alloc - DIP):.3f}:d={DIP}:color={BG}")
            if post:
                final = tmp / f"{n}-{i}-p.mp4"
                run("ffmpeg", "-y", "-i", str(sub), "-vf", ",".join(post), "-c:v", "libx264", "-crf", "17",
                    "-preset", "medium", str(final))
                sub = final
            subs.append(sub)
            notes.append(f"{take}[{start or '^'}..{end or '$'}] {length:.1f}s@{speed:.2f}x->{alloc:.1f}s")
        lst = tmp / f"{n}.txt"
        lst.write_text("".join(f"file '{x}'\n" for x in subs))
        joined = tmp / f"{n}-joined.mp4"
        run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined))
        target = dur(joined)
        part = tmp / f"part{n}.mp4"
        run("ffmpeg", "-y", "-i", str(joined), "-i", str(voice), "-filter_complex", f"[1:a]apad=whole_dur={target:.3f}[a]",
            "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{target:.3f}", str(part))
        parts.append(part)
        print(f"screen {n}: narration {narration:5.1f}s, screen {target:5.1f}s  [{'; '.join(notes)}]")
    lst = tmp / "all.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", a.out)
    print(f"wrote {a.out}: {dur(a.out):.1f}s (limit 180s)")


if __name__ == "__main__":
    main()
