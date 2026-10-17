import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  MediaStore,
  prepareVideo,
  inspectVideo,
  imageMime,
} from "../server/media.js";
const exec = promisify(execFile);
describe("actual media preparation", () => {
  it("preserves input bytes, makes playable output and ordered frame evidence, then clears temporary files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-media-")),
      input = path.join(root, "fixture.mp4");
    try {
      await exec("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=12",
        "-t",
        "2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        input,
      ]);
      const bytes = await fs.readFile(input),
        media = new MediaStore(root),
        prepared = await prepareVideo(bytes, media, "test.mp4");
      expect(prepared.durationMs).toBeGreaterThanOrEqual(1900);
      const videos = prepared.assets.filter((a) => a.kind === "video"),
        frames = prepared.assets.filter((a) => a.kind === "frame");
      expect(videos).toHaveLength(2);
      expect(frames).toHaveLength(8);
      expect(await media.read(videos[0])).toEqual(bytes);
      expect(videos[0].sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
      expect(await inspectVideo(media.local(videos[1].key))).toBe(
        prepared.durationMs,
      );
      expect(frames.map((a) => a.offsetMs)).toEqual(
        [...frames.map((a) => a.offsetMs)].sort((a, b) => a! - b!),
      );
      for (const frame of frames)
        expect(imageMime(await media.read(frame))).toBe("image/jpeg");
      expect(await fs.readdir(path.join(root, "tmp"))).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20000);
  it("rejects invalid video without leaving evidence or leaking process details", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-bad-media-"));
    try {
      await expect(
        prepareVideo(
          Buffer.from("not a video"),
          new MediaStore(root),
          "bad.mp4",
        ),
      ).rejects.toThrow("could not be decoded");
      expect(await fs.readdir(path.join(root, "tmp"))).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
