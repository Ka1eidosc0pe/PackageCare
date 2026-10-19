import { describe, it, expect, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { MediaStore } from "../server/media.js";
import { PROMPT_VERSION } from "../server/analysis.js";
import { APPLICATION_REGION, BEDROCK_MODEL } from "../server/aws.js";
import {
  prepareVisionBenchmark,
  runVisionBenchmark,
  VISION_BENCHMARK_MODEL,
} from "../scripts/lib/vision-benchmark.js";
async function source() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-vision-"));
  const media = new MediaStore(root, "");
  const original = await media.put(
    Buffer.from("source test bytes"),
    "original-test.mp4",
    "video/mp4",
    "video",
  );
  const assets = [
    original,
    await media.put(
      Buffer.from("playback test bytes"),
      "playback-test.mp4",
      "video/mp4",
      "video",
    ),
  ];
  for (let i = 0; i < 8; i++)
    assets.push(
      await media.put(
        Buffer.from(`test frame ${i}`),
        `frame-${i}.jpg`,
        "image/jpeg",
        "frame",
        63 + i * 125,
      ),
    );
  const planPath = path.join(root, "plan.json");
  await fs.writeFile(
    planPath,
    JSON.stringify({
      kind: "packagecare-evaluation-v1",
      strategy: "dense_frames",
      promptVersion: PROMPT_VERSION,
      region: APPLICATION_REGION,
      model: BEDROCK_MODEL,
      createdAt: new Date().toISOString(),
      maximumRequests: 4,
      maximumOutputTokensPerRequest: 2500,
      retries: 0,
      storage: "local",
      requestedFrameCount: 8,
      cases: [
        {
          item: {
            id: "development",
            file: "private-annotation-not-a-prompt.mp4",
            source: "fixture",
            split: "development",
            expected: "possible_rough_handling",
            actionWindow: [300, 700],
          },
          sourceSha256: original.sha256,
          durationMs: 1000,
          preparationMs: 0,
          assets,
        },
      ],
    }),
  );
  return { root, planPath, assets };
}
const evidence = (id = "f4") => ({
  observations: [
    {
      label: "possible_airborne_release",
      description: "The carton is separated from visible hands.",
      evidenceIds: [id],
      verification: "supported",
      limitations: [],
    },
  ],
  limitations: [],
});
const reply = (input: unknown) => ({
  output: { message: { content: [{ text: JSON.stringify(input) }] } },
  usage: { inputTokens: 100, outputTokens: 20 },
  stopReason: "end_turn",
});
describe("bounded alternative vision benchmark", () => {
  it("rejects changed evidence, altered models and inadequate scope before a request, and prevents replay after success", async () => {
    const { root, planPath: baseline } = await source();
    try {
      const prepared = await prepareVisionBenchmark(
        baseline,
        path.join(root, "benchmarks"),
      );
      const scope = JSON.parse(await fs.readFile(prepared.planPath, "utf8"));
      const send = vi.fn().mockResolvedValue(reply(evidence()));
      const client = { send } as any;
      expect(prepared.frameCount).toBe(8);
      await expect(
        runVisionBenchmark(prepared.planPath, 1, client),
      ).rejects.toThrow("exactly two");
      await fs.writeFile(
        prepared.planPath,
        JSON.stringify({ ...scope, model: "us.amazon.nova-pro-v1:0" }),
      );
      await expect(
        runVisionBenchmark(prepared.planPath, 2, client),
      ).rejects.toThrow();
      await fs.writeFile(prepared.planPath, JSON.stringify(scope));
      const frame = scope.baseline.cases[0].assets.find(
        (a: any) => a.kind === "frame",
      );
      const file = path.join(
          path.dirname(prepared.planPath),
          "media",
          frame.key,
        ),
        original = await fs.readFile(file);
      await fs.writeFile(file, "altered");
      await expect(
        runVisionBenchmark(prepared.planPath, 2, client),
      ).rejects.toThrow("evidence changed");
      expect(send).not.toHaveBeenCalled();
      await fs.writeFile(file, original);
      const result = await runVisionBenchmark(prepared.planPath, 2, client);
      expect(result).toMatchObject({
        state: "complete",
        actual: "possible_rough_handling",
        actionCovered: true,
        attemptedRequests: 2,
        receivedResponses: 2,
      });
      expect(result.passes[1].analysis.observations[0].evidenceIds).toEqual([
        scope.baseline.cases[0].assets.filter((a: any) => a.kind === "frame")[3]
          .id,
      ]);
      const first = send.mock.calls[0][0].input;
      expect(first.modelId).toBe(VISION_BENCHMARK_MODEL);
      expect(first.toolConfig).toBeUndefined();
      expect(first.inferenceConfig.maxTokens).toBe(2500);
      expect(
        first.messages[0].content.filter((c: any) => c.image),
      ).toHaveLength(8);
      const prompt = JSON.stringify(first.messages);
      expect(prompt).not.toContain("private-annotation-not-a-prompt");
      expect(prompt).not.toContain('"expected"');
      const verify = send.mock.calls[1][0].input.messages[0].content[0].text;
      expect(verify).toContain('"evidenceIds":["f4"]');
      await expect(
        runVisionBenchmark(prepared.planPath, 2, client),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("journals an invalid verification response and usage, preserves the completed pass, and never retries or invents an assessment", async () => {
    const { root, planPath: baseline } = await source();
    try {
      const prepared = await prepareVisionBenchmark(
        baseline,
        path.join(root, "benchmarks"),
      );
      const send = vi
        .fn()
        .mockResolvedValueOnce(reply(evidence()))
        .mockResolvedValueOnce(reply(evidence("f99")));
      const result = await runVisionBenchmark(prepared.planPath, 2, {
        send,
      } as any);
      expect(result).toMatchObject({
        state: "failed",
        attemptedRequests: 2,
        receivedResponses: 2,
        usage: { inputTokens: 200, outputTokens: 40 },
        diagnostic: { stage: "evidence" },
      });
      expect(result.actual).toBeUndefined();
      expect(result.passes).toHaveLength(1);
      const journal = (
        await fs.readFile(
          path.join(path.dirname(prepared.planPath), "responses.jsonl"),
          "utf8",
        )
      )
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      expect(journal.filter((r) => r.type === "response")).toHaveLength(2);
      expect(JSON.stringify(journal.at(-1))).toContain("f99");
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("uses the validated image bytes for both passes even if a local file changes after dispatch", async () => {
    const { root, planPath: baseline } = await source();
    try {
      const prepared = await prepareVisionBenchmark(
        baseline,
        path.join(root, "benchmarks"),
      );
      const scope = JSON.parse(await fs.readFile(prepared.planPath, "utf8"));
      const frame = scope.baseline.cases[0].assets.find(
        (a: any) => a.kind === "frame",
      );
      const file = path.join(
          path.dirname(prepared.planPath),
          "media",
          frame.key,
        ),
        original = await fs.readFile(file);
      let calls = 0;
      const send = vi.fn().mockImplementation(async (command: any) => {
        expect(
          command.input.messages[0].content.find((c: any) => c.image).image
            .source.bytes,
        ).toEqual(original);
        if (calls++ === 0) await fs.writeFile(file, "changed during analysis");
        return reply(evidence());
      });
      const result = await runVisionBenchmark(prepared.planPath, 2, {
        send,
      } as any);
      expect(result.state).toBe("complete");
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
