import { describe, it, expect, vi } from "vitest";
import { BedrockAnalyzer } from "../server/analysis.js";
import { MediaStore } from "../server/media.js";
import { PackageCare } from "../server/service.js";
import { LocalStore } from "../server/store.js";
import { delivery, analysis } from "./fixtures.js";
import { createApp } from "../server/app.js";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
const tool = (input: unknown) => ({
  toolUse: { name: "record_evidence", toolUseId: "test-tool", input },
});
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
    const adapter = new BedrockAnalyzer(
      media,
      "amazon.nova-lite-v1:0",
      "dense_frames",
    );
    const calls: any[] = [];
    vi.spyOn(adapter.client, "send").mockImplementation(
      async (command: any) => {
        calls.push(command.input);
        return {
          output: {
            message: {
              content: [tool({ observations: [], limitations: [] })],
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
      expect(call.toolConfig.toolChoice).toEqual({
        tool: { name: "record_evidence" },
      });
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
    expect([...cited].sort()).toEqual(["f1", "f2", "f3", "f4", "f5"]);
    expect(new Set(result.run.inputAssetIds).size).toBe(13);
    expect(result.run.usage?.inputTokens).toBe(300);
    expect(result.analysis.assessment).toBe("unable_to_assess");
    expect(result.analysis.summary).toContain("does not support");
  });
  it("rejects fabricated provider evidence and never substitutes a fixture", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const adapter = new BedrockAnalyzer(
        media,
        "amazon.nova-lite-v1:0",
        "dense_frames",
      ),
      bad = structuredClone(analysis);
    bad.observations[0].evidenceIds = ["invented"];
    vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: { message: { content: [tool(bad)] } },
    } as never);
    await expect(adapter.analyze(delivery(), "observe")).rejects.toMatchObject({
      name: "ModelOutputError",
      diagnostic: { stage: "evidence" },
    });
  });
  it("uses a real video input contract in native-video mode rather than relabeling frame input", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-video"));
    const adapter = new BedrockAnalyzer(
      media,
      "amazon.nova-lite-v1:0",
      "native_video",
    );
    const send = vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: {
        message: {
          content: [tool({ observations: [], limitations: [] })],
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
    const adapter = new BedrockAnalyzer(
      media,
      "amazon.nova-lite-v1:0",
      "dense_frames",
    );
    vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: { message: { content: [tool(proposed)] } },
    } as never);
    await expect(adapter.analyze(d, "observe")).rejects.toMatchObject({
      name: "ModelOutputError",
      diagnostic: { stage: "evidence" },
    });
  });
  it("retains a received response and usage before rejecting invalid model structure, without retrying", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const received = vi.fn().mockResolvedValue(undefined);
    const adapter = new BedrockAnalyzer(
      media,
      "amazon.nova-lite-v1:0",
      "sparse_frames",
      received,
    );
    const raw = JSON.stringify({
      ...analysis,
      observations: [{ ...analysis.observations[0], limitations: null }],
    });
    const send = vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: { message: { content: [tool(JSON.parse(raw))] } },
      usage: { inputTokens: 123, outputTokens: 45 },
      stopReason: "end_turn",
      $metadata: { requestId: "test-request" },
    } as never);
    await expect(adapter.analyze(delivery(), "observe")).rejects.toMatchObject({
      name: "ModelOutputError",
      diagnostic: {
        stage: "schema",
        usage: { inputTokens: 123, outputTokens: 45 },
        issues: [
          { path: ["observations", 0, "limitations"], code: "invalid_type" },
        ],
      },
    });
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        raw,
        requestId: "test-request",
        usage: { inputTokens: 123, outputTokens: 45 },
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("anchors image observation timing to cited offsets and derives concern only from a handling action", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const adapter = new BedrockAnalyzer(
        media,
        "amazon.nova-lite-v1:0",
        "sparse_frames",
      ),
      d = delivery();
    d.assets[1].offsetMs = 2400;
    vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: {
        message: {
          content: [
            tool({
              observations: [
                {
                  ...analysis.observations[0],
                  label: "package_visible",
                  concern: true,
                  startMs: 0,
                  endMs: 1000,
                  evidenceIds: ["f1"],
                },
              ],
              limitations: [],
            }),
          ],
        },
      },
    } as never);
    const result = await adapter.analyze(d, "observe");
    expect(result.analysis.observations[0]).toMatchObject({
      startMs: 2400,
      endMs: 2400,
      concern: false,
      evidenceIds: [d.assets[1].id],
    });
    expect(result.analysis.assessment).toBe("unable_to_assess");
  });
  it("retains valid evidence when optional limitation annotations are omitted, visibly marks the omission, and still rejects missing action fields", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const adapter = new BedrockAnalyzer(
      media,
      "amazon.nova-lite-v1:0",
      "sparse_frames",
    );
    const observation = {
      label: "package_at_rest",
      description: "A package rests on the step.",
      evidenceIds: ["f1"],
      verification: "supported",
    };
    const send = vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: { message: { content: [tool({ observations: [observation] })] } },
    } as never);
    const result = await adapter.analyze(delivery(), "observe");
    expect(result.analysis.assessment).toBe("unable_to_assess");
    expect(result.analysis.limitations).toContain(
      "The model omitted clip-level limitations; review visibility and sampling.",
    );
    expect(result.analysis.observations[0].limitations).toContain(
      "The model omitted observation-level limitations; review visibility and sampling.",
    );
    expect(result.analysis.observations[0].evidenceIds).toEqual([
      delivery().assets[1].id,
    ]);
    send.mockResolvedValue({
      output: {
        message: {
          content: [
            tool({ observations: [{ ...observation, label: undefined }] }),
          ],
        },
      },
    } as never);
    await expect(adapter.analyze(delivery(), "observe")).rejects.toMatchObject({
      diagnostic: { stage: "schema" },
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("rejects a text reply when the structured evidence response is missing", async () => {
    const media = new MediaStore("/tmp/not-used");
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("test-image"));
    const adapter = new BedrockAnalyzer(
      media,
      "amazon.nova-lite-v1:0",
      "sparse_frames",
    );
    vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: { message: { content: [{ text: JSON.stringify(analysis) }] } },
    } as never);
    await expect(adapter.analyze(delivery(), "observe")).rejects.toMatchObject({
      diagnostic: { stage: "tool" },
    });
  });
});
describe("job outcomes", () => {
  it("persists all returned usage and safe diagnostics for a mid-pass failure without claiming verification or retrying", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-failed-pass-"));
    try {
      const media = new MediaStore(root),
        d = delivery();
      d.state = "received";
      d.analysis = undefined;
      d.assets = [
        d.assets[0],
        ...Array.from({ length: 13 }, (_, i) => ({
          ...d.assets[1],
          id: `source-${i}`,
          offsetMs: 200 + i * 500,
        })),
      ];
      vi.spyOn(media, "read").mockResolvedValue(Buffer.from("frame"));
      const analyzer = new BedrockAnalyzer(
        media,
        "amazon.nova-lite-v1:0",
        "dense_frames",
      );
      const send = vi
        .spyOn(analyzer.client, "send")
        .mockResolvedValueOnce({
          output: {
            message: { content: [tool({ observations: [], limitations: [] })] },
          },
          usage: { inputTokens: 100, outputTokens: 20 },
        } as never)
        .mockResolvedValueOnce({
          output: {
            message: {
              content: [
                tool({
                  observations: [
                    {
                      ...analysis.observations[0],
                      evidenceIds: ["f99"],
                      description:
                        "raw reply must stay out of the failure record",
                    },
                  ],
                  limitations: [],
                }),
              ],
            },
          },
          usage: { inputTokens: 200, outputTokens: 30 },
        } as never);
      const service = new PackageCare(
        new LocalStore(root),
        media,
        undefined,
        analyzer,
      );
      await service.store.change(d.id, () => d);
      await service.process(d.id);
      const saved = await new LocalStore(root).get(d.id);
      expect(saved?.state).toBe("failed");
      expect(saved?.analysis).toBeUndefined();
      expect(saved?.runs).toHaveLength(1);
      expect(saved?.runs[0]).toMatchObject({
        usage: { inputTokens: 300, outputTokens: 50 },
        failure: {
          stage: "evidence",
          window: 1,
          attemptedRequests: 2,
          receivedResponses: 2,
        },
      });
      expect(JSON.stringify(saved)).not.toContain("raw reply must");
      expect(send).toHaveBeenCalledTimes(2);
      const status = await request(createApp(service))
        .get("/api/status")
        .expect(200);
      expect(status.body.analysis.verified).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("enforces a request boundary before dispatch and retains usage from earlier windows", async () => {
    const media = new MediaStore("/tmp/not-used"),
      d = delivery();
    d.assets = [
      d.assets[0],
      ...Array.from({ length: 8 }, (_, i) => ({
        ...d.assets[1],
        id: `source-${i}`,
        offsetMs: 200 + i * 500,
      })),
    ];
    vi.spyOn(media, "read").mockResolvedValue(Buffer.from("frame"));
    let authorized = 0;
    const adapter = new BedrockAnalyzer(
      media,
      "amazon.nova-lite-v1:0",
      "dense_frames",
      undefined,
      async () => {
        if (authorized >= 1)
          throw new Error("Approved request boundary reached");
        authorized++;
      },
    );
    const send = vi.spyOn(adapter.client, "send").mockResolvedValue({
      output: {
        message: { content: [tool({ observations: [], limitations: [] })] },
      },
      usage: { inputTokens: 100, outputTokens: 20 },
    } as never);
    await expect(adapter.analyze(d, "observe")).rejects.toThrow(
      "request boundary",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([
    {
      name: "Error",
      message: "Provider unavailable",
      expected: "Processing failed",
    },
    {
      name: "ThrottlingException",
      message: "Too many tokens per day, please wait before trying again.",
      expected: "daily token quota",
    },
  ])(
    "persists $name as failed without a successful assessment or automatic retry",
    async ({ name, message, expected }) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-job-"));
      try {
        const store = new LocalStore(root),
          d = delivery();
        d.state = "received";
        d.analysis = undefined;
        await store.change(d.id, () => d);
        const analyzer = {
          analyze: vi
            .fn()
            .mockRejectedValue(Object.assign(new Error(message), { name })),
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
        expect(result.error).toContain(expected);
        expect(result.assets).toEqual(d.assets);
        expect(analyzer.analyze).toHaveBeenCalledTimes(1);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );
});
