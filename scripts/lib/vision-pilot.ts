import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { awsConfig, APPLICATION_REGION } from "../../server/aws.js";
import { AWS_PROFILE_NAME } from "../../shared/project.js";
import { MediaStore } from "../../server/media.js";
import { evaluationPlanSchema } from "./evaluation.js";
import {
  inspectVisionBenchmark,
  prepareVisionBenchmark,
  runVisionBenchmark,
  VISION_BENCHMARK_MODEL,
  VISION_BENCHMARK_VERSION,
} from "./vision-benchmark.js";

const pilotSchema = z.object({
  kind: z.literal("packagecare-vision-pilot-v1"),
  model: z.literal(VISION_BENCHMARK_MODEL),
  promptVersion: z.literal(VISION_BENCHMARK_VERSION),
  region: z.literal(APPLICATION_REGION),
  profile: z.literal(AWS_PROFILE_NAME),
  storage: z.literal("local"),
  retries: z.literal(0),
  maximumOutputTokensPerRequest: z.literal(2500),
  maximumRequests: z.number().int().min(6).max(60),
  cases: z
    .array(
      z.object({
        plan: z.string().regex(/^case-[0-2]\/[0-9a-f-]+\/plan\.json$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .length(3),
});
async function save(file: string, value: unknown) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
  await fs.rename(`${file}.tmp`, file);
}
function checkCases(
  entries: {
    item: { expected: string; split: string };
    sourceSha256: string;
  }[],
) {
  if (
    entries.length !== 3 ||
    new Set(entries.map((c) => c.sourceSha256)).size !== 3 ||
    entries.some((c) => c.item.split !== "development") ||
    [...new Set(entries.map((c) => c.item.expected))].sort().join(",") !==
      "no_concern_observed,possible_rough_handling,unable_to_assess"
  )
    throw new Error(
      "Pilot requires three distinct development sources: ordinary, rough and unclear.",
    );
}
export async function prepareVisionPilot(
  baselinePath: string,
  outputParent = path.resolve("data/vision-pilots"),
) {
  const baseline = evaluationPlanSchema.parse(
    JSON.parse(await fs.readFile(baselinePath, "utf8")),
  );
  checkCases(baseline.cases);
  const root = path.join(outputParent, randomUUID());
  const source = new MediaStore(path.dirname(baselinePath), "");
  try {
    await fs.mkdir(path.join(root, "media"), { recursive: true });
    const copied = new MediaStore(root, "");
    const ids = baseline.cases.flatMap((c) => c.assets.map((a) => a.id));
    if (new Set(ids).size !== ids.length)
      throw new Error("Cross-case evidence IDs must be distinct.");
    // Child preparation revalidates all copied hashes before publishing its plan.
    for (const entry of baseline.cases)
      for (const asset of entry.assets)
        await fs.copyFile(source.local(asset.key), copied.local(asset.key));
    const cases = [];
    let maximumRequests = 0;
    for (const [i, entry] of baseline.cases.entries()) {
      const childBaseline = path.join(root, `case-${i}-baseline.json`);
      await save(childBaseline, { ...baseline, cases: [entry] });
      const prepared = await prepareVisionBenchmark(
        childBaseline,
        path.join(root, `case-${i}`),
        undefined,
        3,
      );
      const inspected = await inspectVisionBenchmark(prepared.planPath);
      cases.push({
        plan: path.relative(root, prepared.planPath),
        sha256: inspected.sha256,
      });
      maximumRequests += inspected.scope.maximumRequests;
    }
    const plan = pilotSchema.parse({
      kind: "packagecare-vision-pilot-v1",
      model: VISION_BENCHMARK_MODEL,
      promptVersion: VISION_BENCHMARK_VERSION,
      region: APPLICATION_REGION,
      profile: AWS_PROFILE_NAME,
      storage: "local",
      retries: 0,
      maximumOutputTokensPerRequest: 2500,
      maximumRequests,
      cases,
    });
    const planPath = path.join(root, "plan.json");
    await save(planPath, plan);
    return { planPath, maximumRequests, cases: 3 };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}
export async function runVisionPilot(
  planPath: string,
  requestLimit: number,
  client?: Pick<BedrockRuntimeClient, "send">,
) {
  const planBytes = await fs.readFile(planPath);
  const plan = pilotSchema.parse(JSON.parse(planBytes.toString()));
  const root = path.dirname(planPath);
  awsConfig();
  const preflight = [];
  for (const item of plan.cases) {
    const childPath = path.join(root, item.plan);
    const checked = await inspectVisionBenchmark(childPath);
    if (
      checked.sha256 !== item.sha256 ||
      checked.scope.windowSize !== 3 ||
      checked.scope.selectedFrameOffsets
    )
      throw new Error("Pilot child scope changed. No inference started.");
    preflight.push({ childPath, ...checked });
  }
  checkCases(preflight.map((c) => c.scope.baseline.cases[0]));
  const required = preflight.reduce((n, c) => n + c.scope.maximumRequests, 0);
  if (required !== plan.maximumRequests || requestLimit !== required)
    throw new Error(
      `Pilot requires exactly ${required} approved requests. No inference started.`,
    );
  await fs.writeFile(
    path.join(root, "invocation.json"),
    JSON.stringify({
      startedAt: new Date().toISOString(),
      planSha256: createHash("sha256").update(planBytes).digest("hex"),
      maximumRequests: required,
      childHashes: plan.cases.map((c) => c.sha256),
    }),
    { flag: "wx", mode: 0o600 },
  );
  const output = path.join(root, "results.json");
  const results: Awaited<ReturnType<typeof runVisionBenchmark>>[] = [];
  let failure: string | undefined;
  const checkpoint = async () =>
    save(output, {
      warning:
        "Three development cases, not accuracy or a passed feasibility gate. Valid misses are retained; no tuning or retries occur within the pilot.",
      model: plan.model,
      promptVersion: plan.promptVersion,
      maximumRequests: required,
      state:
        failure || results.some((r) => r.state === "failed")
          ? "failed"
          : results.length === 3
            ? "complete"
            : "running",
      countsComplete: !failure,
      attemptedRequests: results.reduce((n, r) => n + r.attemptedRequests, 0),
      receivedResponses: results.reduce((n, r) => n + r.receivedResponses, 0),
      ...(failure ? { errorType: failure } : {}),
      results,
    });
  await checkpoint();
  try {
    for (const child of preflight) {
      if (
        (await inspectVisionBenchmark(child.childPath)).sha256 !== child.sha256
      )
        throw new Error("Child changed after pilot preflight");
      const result = await runVisionBenchmark(
        child.childPath,
        child.scope.maximumRequests,
        client,
      );
      results.push(result);
      await checkpoint();
      if (result.state !== "complete") break;
    }
  } catch (error: any) {
    failure = error?.name || "Error";
  }
  await checkpoint();
  return {
    output,
    state:
      failure ||
      results.some((r) => r.state !== "complete") ||
      results.length !== 3
        ? "failed"
        : "complete",
    maximumRequests: required,
    results,
  };
}
