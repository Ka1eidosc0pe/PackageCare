import { describe, it, expect, vi } from "vitest";
import { BedrockAnalyzer } from "../server/analysis.js";
import { MediaStore } from "../server/media.js";
import { PackageCare } from "../server/service.js";
import { LocalStore } from "../server/store.js";
import { delivery, analysis } from "./fixtures.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
describe("analysis input contracts", () => {
  it("covers every dense frame in chronological windows without exceeding model image limits", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const d = delivery();
    d.assets = [
      d.assets[0],
      ...Array.from({ length: 13 }, (_, i) => ({
        ...d.assets[1],
        id: `f${i}`,
        offsetMs: 200 + i * 500,
      })).reverse(),
    ];
    const adapter = new BedrockAnalyzer(media, "test-model", "dense_frames");
    const calls: any[] = [];
    vi.spyOn(adapter.client, "send").mockImplementation(
      async (command: any) => {
        calls.push(command.input);
        return {
          output: {
            message: {
              content: [
                {
                  text: JSON.stringify({
                    ...analysis,
                    observations: [],
                    assessment: "unable_to_assess",
                  }),
                },
              ],
            },
          },
          usage: { inputTokens: 100, outputTokens: 20 },
        } as any;
      },
    );
    const result = await adapter.analyze(d, "observe");
    expect(calls).toHaveLength(3);
    const cited = new Set<string>();
    for (const call of calls) {
      const content = call.messages[0].content;
      expect(content.filter((c: any) => c.image).length).toBeLessThanOrEqual(5);
      const offsets = content
        .filter((c: any) => c.text?.startsWith("Evidence ID "))
        .map((c: any) => Number(c.text.match(/offset (\d+) ms/)[1]));
      expect(offsets).toEqual(
        [...offsets].sort((a: number, b: number) => a - b),
      );
      for (const c of content)
        if (c.text?.startsWith("Evidence ID "))
          cited.add(c.text.split(";")[0].slice(12));
    }
    expect(cited.size).toBe(13);
    expect(result.run.usage?.inputTokens).toBe(300);
    expect(result.analysis.assessment).toBe("unable_to_assess");
    expect(result.analysis.summary).toContain("does not support");
  });
  it("rejects fabricated provider evidence and never substitutes a fixture", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const adapter = new BedrockAnalyzer(media, "test-model", "dense_frames"),
      bad = structuredClone(analysis);
    bad.observations[0].evidenceIds = ["invented"];
    vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: { message: { content: [{ text: JSON.stringify(bad) }] } },
    } as never);
    await expect(adapter.analyze(delivery(), "observe")).rejects.toThrow(
      "missing",
    );
  });
  it("uses a real video input contract in native-video mode rather than relabeling frame input", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-video"));
    const adapter = new BedrockAnalyzer(media, "test-model", "native_video");
    const send = vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: {
        message: {
          content: [
            { text: JSON.stringify({ ...analysis, observations: [] }) },
          ],
        },
      },
    } as never);
    const result = await adapter.analyze(delivery(), "observe");
    const content = (send.mock.calls[0][0] as any).input.messages[0].content;
    expect(content.some((c: any) => c.video?.format === "mp4")).toBe(true);
    expect(content.some((c: any) => c.image)).toBe(false);
    expect(result.run.inputAssetIds).toEqual(["video"]);
  });
  it("rejects evidence that exists in the case but was not presented in this model window", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const d = delivery();
    d.assets = [
      d.assets[0],
      ...Array.from({ length: 8 }, (_, i) => ({
        ...d.assets[1],
        id: `f${i}`,
        offsetMs: 100 + i * 900,
      })),
    ];
    const proposed = structuredClone(analysis);
    Object.assign(proposed.observations[0], {
      evidenceIds: ["f7"],
      startMs: 6000,
      endMs: 7000,
    });
    const adapter = new BedrockAnalyzer(media, "test-model", "dense_frames");
    vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: { message: { content: [{ text: JSON.stringify(proposed) }] } },
    } as never);
    await expect(adapter.analyze(d, "observe")).rejects.toThrow("missing");
  });
});
describe("job outcomes", () => {
  it("persists a provider failure as failed without creating a successful handling assessment", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-job-"));
    try {
      const store = new LocalStore(root),
        d = delivery();
      d.state = "received";
      d.analysis = undefined;
      await store.change(d.id, () => d);
      const analyzer = {
        analyze: vi.fn().mockRejectedValue(new Error("Provider unavailable")),
      };
      const service = new PackageCare(
        store,
        new MediaStore(root),
        undefined,
        analyzer,
      );
      await service.process(d.id);
      const result = await service.get(d.id);
      expect(result.state).toBe("failed");
      expect(result.analysis).toBeUndefined();
      expect(result.runs).toHaveLength(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
