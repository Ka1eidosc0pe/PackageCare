import { describe, it, expect, vi } from "vitest";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { PackageCare } from "../server/service.js";
import { LocalStore } from "../server/store.js";
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
  it("recovers an acknowledged upload after restart and retries analysis without losing or preparing the source twice", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-restart-"));
    try {
      const input = path.join(root, "clip.mp4");
      await exec("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=gray:s=160x90:r=10",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        input,
      ]);
      const bytes = await fs.readFile(input),
        first = new PackageCare(new LocalStore(root), new MediaStore(root));
      const dispatch = vi.spyOn(first, "dispatch").mockResolvedValue();
      const receipt = await first.upload(bytes, "clip.mp4");
      expect(dispatch).toHaveBeenCalledWith(receipt.id);
      expect(receipt.durationMs).toBe(0);
      expect(await first.media.read(receipt.assets[0])).toEqual(bytes);
      // Recreate both services before any decoding, as if the process stopped after its response.
      const analyzer = {
        analyze: vi
          .fn()
          .mockRejectedValueOnce(new Error("Temporary provider failure"))
          .mockImplementation(async (d, phase) => {
            const analysis = {
              assessment: "unable_to_assess" as const,
              summary: "No handling is visible in the test clip.",
              observations: [],
              limitations: ["No package visible."],
            };
            return {
              analysis,
              run: {
                id: phase,
                provider: "bedrock" as const,
                model: "test-only",
                promptVersion: "test",
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                inputAssetIds: d.assets.map((a: any) => a.id),
                ...(phase === "observe"
                  ? { proposal: analysis }
                  : { verification: analysis }),
              },
            };
          }),
      };
      const restarted = new PackageCare(
        new LocalStore(root),
        new MediaStore(root),
        undefined,
        analyzer,
      );
      await restarted.process(receipt.id);
      const failed = await restarted.get(receipt.id);
      expect(failed.state).toBe("failed");
      expect(failed.durationMs).toBeGreaterThan(0);
      expect(failed.analysis).toBeUndefined();
      expect(failed.assets[0].id).toBe(receipt.assets[0].id);
      expect(await restarted.media.read(failed.assets[0])).toEqual(bytes);
      const ids = failed.assets.map((a) => a.id);
      vi.spyOn(restarted, "dispatch").mockResolvedValue();
      await restarted.retry(receipt.id);
      await restarted.process(receipt.id);
      const ready = await restarted.get(receipt.id);
      expect(ready.state).toBe("ready");
      expect(ready.assets.map((a) => a.id)).toEqual(ids);
      expect(ready.runs).toHaveLength(2);
      expect(await fs.readdir(path.join(root, "tmp"))).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20000);
});
