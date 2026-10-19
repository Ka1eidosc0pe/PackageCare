import { describe, it, expect, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { S3Client } from "@aws-sdk/client-s3";
import { BedrockAnalyzer } from "../server/analysis.js";
import {
  prepareEvaluation,
  runEvaluation,
  type AnalyzerFactory,
} from "../scripts/lib/evaluation.js";
const exec = promisify(execFile);
async function dataset() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-eval-"));
  for (const [i, color] of ["gray", "blue"].entries())
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=160x90:r=10`,
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      path.join(root, `${i}.mp4`),
    ]);
  const cases = [0, 1].map((i) => ({
    id: `case-${i}`,
    file: `${i}.mp4`,
    source: "fixture",
    split: "development",
    expected: "unable_to_assess",
  }));
  const manifest = path.join(root, "manifest.json");
  await fs.writeFile(manifest, JSON.stringify(cases));
  return { root, manifest, cases };
}
const reply = (input: unknown) => ({
  output: {
    message: {
      content: [
        { toolUse: { name: "record_evidence", toolUseId: "test-only", input } },
      ],
    },
  },
  usage: { inputTokens: 100, outputTokens: 20 },
});
describe("reviewable evaluation scopes", () => {
  it("prepares only local evidence, rejects duplicate recordings and refuses missing/changed inputs before inference", async () => {
    const { root, manifest, cases } = await dataset(),
      previous = process.env.PACKAGECARE_BUCKET;
    const s3 = vi
      .spyOn(S3Client.prototype, "send")
      .mockRejectedValue(new Error("Cloud storage must not be used") as never);
    process.env.PACKAGECARE_BUCKET = "must-not-use-this-bucket";
    try {
      const { planPath, plan } = await prepareEvaluation(
        manifest,
        "dense_frames",
        "development",
        path.join(root, "plans"),
        8,
      );
      expect(plan.storage).toBe("local");
      expect(plan.requestedFrameCount).toBe(8);
      expect(plan.maximumRequests).toBe(8);
      expect(s3).not.toHaveBeenCalled();
      const factory = vi.fn() as unknown as AnalyzerFactory;
      await expect(runEvaluation(planPath, 2, factory)).rejects.toThrow(
        "requires a request limit of 8",
      );
      const asset = plan.cases[0].assets[0];
      await fs.writeFile(
        path.join(path.dirname(planPath), "media", asset.key),
        "changed",
      );
      await expect(runEvaluation(planPath, 8, factory)).rejects.toThrow(
        "evidence changed",
      );
      expect(factory).not.toHaveBeenCalled();
      await fs.writeFile(
        manifest,
        JSON.stringify([
          cases[0],
          { ...cases[1], file: cases[0].file, split: "held_out" },
        ]),
      );
      await expect(
        prepareEvaluation(
          manifest,
          "sparse_frames",
          "development",
          path.join(root, "plans"),
        ),
      ).rejects.toThrow("identical source");
      await fs.writeFile(
        manifest,
        JSON.stringify([cases[0], { ...cases[1], file: "missing.mp4" }]),
      );
      await expect(
        prepareEvaluation(
          manifest,
          "sparse_frames",
          "development",
          path.join(root, "plans"),
        ),
      ).rejects.toThrow();
      expect(s3).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.PACKAGECARE_BUCKET;
      else process.env.PACKAGECARE_BUCKET = previous;
      s3.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20000);
  it("checkpoints a completed observation and rejected verification reply, stops later cases, and refuses replay", async () => {
    const { root, manifest } = await dataset();
    try {
      const { planPath } = await prepareEvaluation(
        manifest,
        "sparse_frames",
        "development",
        path.join(root, "plans"),
      );
      let calls = 0,
        factories = 0;
      const factory: AnalyzerFactory = (media, strategy, response, before) => {
        factories++;
        expect(media.bucket).toBe("");
        const analyzer = new BedrockAnalyzer(
          media,
          "amazon.nova-lite-v1:0",
          strategy,
          response,
          before,
        );
        vi.spyOn(analyzer.client, "send").mockImplementation(async () => {
          calls++;
          return reply(
            calls === 1
              ? { observations: [], limitations: [] }
              : {
                  observations: [
                    {
                      label: "package_visible",
                      description: "test output",
                      evidenceIds: ["f99"],
                      verification: "supported",
                      limitations: [],
                    },
                  ],
                  limitations: [],
                },
          ) as any;
        });
        return analyzer;
      };
      const result = await runEvaluation(planPath, 4, factory);
      expect(result.attemptedRequests).toBe(2);
      expect(result.receivedResponses).toBe(2);
      expect(calls).toBe(2);
      expect(factories).toBe(1);
      expect(result.results).toHaveLength(1);
      const saved = JSON.parse(await fs.readFile(result.output, "utf8"));
      expect(saved.results[0].state).toBe("failed");
      expect(saved.results[0].runs).toHaveLength(2);
      expect(saved.results[0].runs[0].proposal).toBeDefined();
      expect(saved.results[0].runs[1]).toMatchObject({
        usage: { inputTokens: 100, outputTokens: 20 },
        failure: { stage: "evidence", receivedResponses: 1 },
      });
      const journal = (
        await fs.readFile(
          path.join(path.dirname(planPath), "responses.jsonl"),
          "utf8",
        )
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(journal.filter((r) => r.type === "response")).toHaveLength(2);
      expect(journal.at(-1).raw).toContain("f99");
      await expect(runEvaluation(planPath, 4, factory)).rejects.toMatchObject({
        code: "EEXIST",
      });
      expect(calls).toBe(2);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20000);
  it("does not count an ambiguous concern as supported action coverage", async () => {
    const { root, manifest, cases } = await dataset();
    try {
      await fs.writeFile(
        manifest,
        JSON.stringify([
          {
            ...cases[0],
            expected: "possible_rough_handling",
            actionWindow: [100, 500],
          },
        ]),
      );
      const { planPath } = await prepareEvaluation(
        manifest,
        "sparse_frames",
        "development",
        path.join(root, "plans"),
      );
      const factory: AnalyzerFactory = (media, strategy, response, before) => {
        const analyzer = new BedrockAnalyzer(
          media,
          "amazon.nova-lite-v1:0",
          strategy,
          response,
          before,
        );
        vi.spyOn(analyzer.client, "send").mockResolvedValue(
          reply({
            observations: [
              {
                label: "possible_drop",
                description:
                  "Scripted unit-test observation, not model accuracy.",
                evidenceIds: ["f1", "f2"],
                verification: "ambiguous",
                limitations: ["Obscured."],
              },
            ],
            limitations: [],
          }) as never,
        );
        return analyzer;
      };
      const result = await runEvaluation(planPath, 2, factory);
      expect(result.results[0]).toMatchObject({
        state: "complete",
        actual: "unable_to_assess",
        actionCovered: false,
        match: false,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20000);
});
