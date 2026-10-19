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
import {
  prepareVisionPilot,
  runVisionPilot,
} from "../scripts/lib/vision-pilot.js";
async function source(seed = "source test bytes", parent = os.tmpdir()) {
  const root = await fs.mkdtemp(path.join(parent, "pc-vision-"));
  const media = new MediaStore(root, "");
  const original = await media.put(
    Buffer.from(seed),
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
  it("selects exact prepared offsets without changing source identity or permitting missing/duplicate frames", async () => {
    const { root, planPath: baseline } = await source();
    try {
      for (const offsets of [
        [63, 999],
        [63, 63],
      ])
        await expect(
          prepareVisionBenchmark(
            baseline,
            path.join(root, "benchmarks"),
            offsets,
          ),
        ).rejects.toThrow();
      const prepared = await prepareVisionBenchmark(
        baseline,
        path.join(root, "benchmarks"),
        [313, 63, 188],
      );
      const send = vi.fn().mockResolvedValue(reply(evidence("f2")));
      const result = await runVisionBenchmark(prepared.planPath, 2, {
        send,
      } as any);
      expect(prepared.frameCount).toBe(3);
      expect(result.state).toBe("complete");
      const content = send.mock.calls[0][0].input.messages[0].content;
      expect(content.filter((c: any) => c.image)).toHaveLength(3);
      expect(
        content
          .filter((c: any) => c.text?.startsWith("Evidence ID"))
          .map((c: any) => c.text),
      ).toEqual([
        "Evidence ID f1; offset 63 ms.",
        "Evidence ID f2; offset 188 ms.",
        "Evidence ID f3; offset 313 ms.",
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
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
      ).rejects.toThrow("exactly 2");
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
      expect(first.messages[0].content.at(-1).text).toContain(
        "Include visible facts even when they are not concerning",
      );
      const verify =
        send.mock.calls[1][0].input.messages[0].content.at(-1).text;
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
  it("stops after an empty first response without spending on verification or presenting a completed assessment", async () => {
    const { root, planPath: baseline } = await source();
    try {
      const prepared = await prepareVisionBenchmark(
        baseline,
        path.join(root, "benchmarks"),
      );
      const send = vi
        .fn()
        .mockResolvedValue(reply({ observations: [], limitations: [] }));
      const result = await runVisionBenchmark(prepared.planPath, 2, {
        send,
      } as any);
      expect(result).toMatchObject({
        state: "failed",
        attemptedRequests: 1,
        receivedResponses: 1,
        diagnostic: { stage: "evidence" },
        usage: { inputTokens: 100, outputTokens: 20 },
      });
      expect(result.actual).toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

async function pilotDataset() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-pilot-"));
  await fs.mkdir(path.join(root, "media"));
  let baseline: any;
  const cases = [];
  for (const [i, expected] of [
    "possible_rough_handling",
    "no_concern_observed",
    "unable_to_assess",
  ].entries()) {
    const child = await source(`distinct source ${i}`, root);
    const plan = JSON.parse(await fs.readFile(child.planPath, "utf8"));
    baseline = plan;
    const entry = plan.cases[0];
    entry.item = { ...entry.item, id: `case-${i}`, expected };
    if (expected !== "possible_rough_handling") delete entry.item.actionWindow;
    cases.push(entry);
    for (const asset of entry.assets)
      await fs.copyFile(
        path.join(child.root, "media", asset.key),
        path.join(root, "media", asset.key),
      );
  }
  const baselinePath = path.join(root, "plan.json");
  await fs.writeFile(
    baselinePath,
    JSON.stringify({ ...baseline, maximumRequests: 12, cases }),
  );
  return { root, baselinePath };
}

describe("whole-clip mixed-case pilot", () => {
  it("covers every prepared frame in both passes with bounded windows and exact global offsets, without accepting selected action frames", async () => {
    const { root, planPath: baseline, assets } = await source();
    try {
      await expect(
        prepareVisionBenchmark(
          baseline,
          path.join(root, "scopes"),
          [63, 188, 313],
          3,
        ),
      ).rejects.toThrow("cannot use selected");
      const prepared = await prepareVisionBenchmark(
        baseline,
        path.join(root, "scopes"),
        undefined,
        3,
      );
      expect(prepared.maximumRequests).toBe(8);
      const send = vi.fn().mockResolvedValue(reply(evidence("f2")));
      await expect(
        runVisionBenchmark(prepared.planPath, 2, { send } as any),
      ).rejects.toThrow("exactly 8");
      expect(send).not.toHaveBeenCalled();
      const result = await runVisionBenchmark(prepared.planPath, 8, {
        send,
      } as any);
      expect(result.state).toBe("complete");
      expect(result.passes).toHaveLength(2);
      expect(result.windowResults).toHaveLength(8);
      const frames = assets.filter((a) => a.kind === "frame");
      expect(new Set(result.windows.flatMap((w) => w.frameIds))).toEqual(
        new Set(frames.map((a) => a.id)),
      );
      for (const pass of result.passes) {
        expect(pass.usage).toEqual({ inputTokens: 400, outputTokens: 80 });
        expect(pass.analysis.observations.map((o) => o.evidenceIds[0])).toEqual(
          [frames[1].id, frames[3].id, frames[5].id, frames[7].id],
        );
        expect(pass.analysis.observations.map((o) => o.startMs)).toEqual([
          188, 438, 688, 938,
        ]);
      }
      expect(send).toHaveBeenCalledTimes(8);
      for (const [i, call] of send.mock.calls.entries()) {
        const content = call[0].input.messages[0].content;
        expect(content.filter((c: any) => c.image)).toHaveLength(
          i % 4 === 3 ? 2 : 3,
        );
        expect(JSON.stringify(content)).not.toContain(
          "private-annotation-not-a-prompt",
        );
        expect(JSON.stringify(content)).not.toContain('"expected"');
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("checks every source before spending, retains valid mismatches across all classes, and cannot replay a completed pilot", async () => {
    const { root, baselinePath } = await pilotDataset();
    try {
      const prepared = await prepareVisionPilot(
        baselinePath,
        path.join(root, "pilots"),
      );
      expect(prepared.maximumRequests).toBe(24);
      const scope = JSON.parse(await fs.readFile(prepared.planPath, "utf8"));
      const lastPath = path.join(
        path.dirname(prepared.planPath),
        scope.cases[2].plan,
      );
      const last = JSON.parse(await fs.readFile(lastPath, "utf8"));
      const frame = last.baseline.cases[0].assets.find(
        (a: any) => a.kind === "frame",
      );
      const file = path.join(path.dirname(lastPath), "media", frame.key);
      const original = await fs.readFile(file);
      const send = vi.fn().mockResolvedValue(
        reply({
          ...evidence("f1"),
          observations: [
            { ...evidence("f1").observations[0], label: "package_at_rest" },
          ],
        }),
      );
      await expect(
        runVisionPilot(prepared.planPath, 23, { send } as any),
      ).rejects.toThrow("exactly 24");
      await fs.writeFile(file, "changed last case");
      await expect(
        runVisionPilot(prepared.planPath, 24, { send } as any),
      ).rejects.toThrow("evidence changed");
      expect(send).not.toHaveBeenCalled();
      await fs.writeFile(file, original);
      const result = await runVisionPilot(prepared.planPath, 24, {
        send,
      } as any);
      expect(result.state).toBe("complete");
      expect(result.results.map((r) => r.match)).toEqual([false, false, true]);
      expect(result.results.every((r) => r.attemptedRequests === 8)).toBe(true);
      expect(send).toHaveBeenCalledTimes(24);
      await expect(
        runVisionPilot(prepared.planPath, 24, { send } as any),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(send).toHaveBeenCalledTimes(24);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("stops the entire pilot on invalid verification, retaining the completed observation, partial usage and all raw receipts", async () => {
    const { root, baselinePath } = await pilotDataset();
    try {
      const prepared = await prepareVisionPilot(
        baselinePath,
        path.join(root, "pilots"),
      );
      let calls = 0;
      const send = vi
        .fn()
        .mockImplementation(async () =>
          reply(evidence(++calls === 5 ? "f99" : "f2")),
        );
      const result = await runVisionPilot(prepared.planPath, 24, {
        send,
      } as any);
      expect(result.state).toBe("failed");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        state: "failed",
        attemptedRequests: 5,
        receivedResponses: 5,
        usage: { inputTokens: 500, outputTokens: 100 },
        diagnostic: { stage: "evidence", window: 0 },
      });
      expect(result.results[0].passes).toHaveLength(1);
      expect(result.results[0].actual).toBeUndefined();
      const receipts = (
        await fs.readFile(
          path.join(path.dirname(result.results[0].output), "responses.jsonl"),
          "utf8",
        )
      )
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      expect(receipts.filter((r) => r.type === "response")).toHaveLength(5);
      expect(JSON.stringify(receipts.at(-1))).toContain("f99");
      expect(send).toHaveBeenCalledTimes(5);
      await expect(
        runVisionPilot(prepared.planPath, 24, { send } as any),
      ).rejects.toMatchObject({ code: "EEXIST" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
