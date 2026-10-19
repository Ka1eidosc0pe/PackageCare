import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { awsConfig, APPLICATION_REGION } from "../../server/aws.js";
import { AWS_PROFILE_NAME } from "../../shared/project.js";
import { MediaStore } from "../../server/media.js";
import { evaluationPlanSchema } from "./evaluation.js";
import {
  evidenceTool,
  parseEvidenceResponse,
  PROMPT_VERSION,
  VISUAL_EVIDENCE_RULES,
} from "../../server/analysis.js";
import type { Analysis, Asset } from "../../shared/domain.js";

// Evaluation only. This does not expand the application model allowlist.
export const VISION_BENCHMARK_MODEL = "qwen.qwen3-vl-235b-a22b";
export const VISION_BENCHMARK_VERSION = "packagecare-vision-json-v1";
const scopeSchema = z.object({
  kind: z.literal("packagecare-vision-benchmark-v1"),
  model: z.literal(VISION_BENCHMARK_MODEL),
  region: z.literal(APPLICATION_REGION),
  profile: z.literal(AWS_PROFILE_NAME),
  promptVersion: z.literal(VISION_BENCHMARK_VERSION),
  evidenceVersion: z.literal(PROMPT_VERSION),
  maximumRequests: z.literal(2),
  maximumOutputTokensPerRequest: z.literal(2500),
  maximumInputContextTokens: z.literal(262144),
  retries: z.literal(0),
  storage: z.literal("local"),
  baselinePlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
  baseline: evaluationPlanSchema,
});
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function save(file: string, value: unknown) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
  await fs.rename(`${file}.tmp`, file);
}
function input(scope: z.infer<typeof scopeSchema>) {
  if (
    scope.baseline.cases.length !== 1 ||
    scope.baseline.strategy !== "dense_frames"
  )
    throw new Error("Benchmark one dense-prepared case per reviewed scope.");
  const entry = scope.baseline.cases[0];
  const frames = entry.assets
    .filter((a) => a.kind === "frame")
    .sort((a, b) => a.offsetMs! - b.offsetMs!);
  if (
    !frames.length ||
    frames.length > 20 ||
    frames.some(
      (a) =>
        a.mime !== "image/jpeg" ||
        a.offsetMs === undefined ||
        a.offsetMs >= entry.durationMs ||
        a.bytes > 3.75 * 1024 * 1024,
    )
  )
    throw new Error(
      "Choose 1–20 bounded JPEG frames with valid source offsets.",
    );
  if (new Set(entry.assets.map((a) => a.id)).size !== entry.assets.length)
    throw new Error("Evidence IDs must be distinct.");
  if (
    entry.assets.find((a) => a.name.startsWith("original-"))?.sha256 !==
    entry.sourceSha256
  )
    throw new Error("Original source fingerprint mismatch.");
  return { entry, frames: frames as Asset[] };
}
async function verifyAssets(media: MediaStore, assets: Asset[]) {
  for (const asset of assets) {
    const bytes = await media.read(asset);
    if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256)
      throw new Error("Prepared evidence changed. No inference started.");
  }
}
export async function prepareVisionBenchmark(
  baselinePlanPath: string,
  outputParent = path.resolve("data/vision-benchmarks"),
) {
  const bytes = await fs.readFile(baselinePlanPath);
  const scope = scopeSchema.parse({
    kind: "packagecare-vision-benchmark-v1",
    model: VISION_BENCHMARK_MODEL,
    region: APPLICATION_REGION,
    profile: AWS_PROFILE_NAME,
    promptVersion: VISION_BENCHMARK_VERSION,
    evidenceVersion: PROMPT_VERSION,
    maximumRequests: 2,
    maximumOutputTokensPerRequest: 2500,
    maximumInputContextTokens: 262144,
    retries: 0,
    storage: "local",
    baselinePlanSha256: hash(bytes),
    baseline: JSON.parse(bytes.toString()),
  });
  const { entry, frames } = input(scope);
  const source = new MediaStore(path.dirname(baselinePlanPath), "");
  await verifyAssets(source, entry.assets as Asset[]);
  const root = path.join(outputParent, randomUUID());
  try {
    await fs.mkdir(path.join(root, "media"), { recursive: true });
    const target = new MediaStore(root, "");
    for (const asset of entry.assets)
      await fs.copyFile(source.local(asset.key), target.local(asset.key));
    await verifyAssets(target, entry.assets as Asset[]);
    const planPath = path.join(root, "plan.json");
    await save(planPath, scope);
    return {
      planPath,
      model: scope.model,
      frameCount: frames.length,
      sourceSha256: entry.sourceSha256,
      maximumRequests: 2,
    };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}
export function parseVisionJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
export async function runVisionBenchmark(
  planPath: string,
  requestLimit: number,
  suppliedClient?: Pick<BedrockRuntimeClient, "send">,
) {
  const bytes = await fs.readFile(planPath),
    scope = scopeSchema.parse(JSON.parse(bytes.toString()));
  if (requestLimit !== 2)
    throw new Error(
      "This reviewed benchmark requires exactly two authorized requests. No inference started.",
    );
  const { entry, frames } = input(scope),
    root = path.dirname(planPath),
    media = new MediaStore(root, "");
  const config = awsConfig();
  await verifyAssets(media, entry.assets as Asset[]);
  const frameBytes = new Map<string, Buffer>();
  for (const frame of frames) {
    const image = await media.read(frame);
    if (hash(image) !== frame.sha256 || image.length !== frame.bytes)
      throw new Error("Prepared evidence changed. No inference started.");
    frameBytes.set(frame.id, image);
  }
  await fs.writeFile(
    path.join(root, "invocation.json"),
    JSON.stringify({
      startedAt: new Date().toISOString(),
      planSha256: hash(bytes),
      requestLimit,
    }),
    { flag: "wx", mode: 0o600 },
  );
  const client =
    suppliedClient ?? new BedrockRuntimeClient({ ...config, maxAttempts: 1 });
  const references = frames.map((asset, i) => ({ alias: `f${i + 1}`, asset }));
  const schema = evidenceTool(
    references.map((r) => ({ ...r.asset, id: r.alias })),
    false,
  ).tools[0].toolSpec.inputSchema.json;
  const output = path.join(root, "results.json"),
    journal = path.join(root, "responses.jsonl");
  const result = {
    warning:
      "One development example, not model accuracy. Full-sequence image context differs from Nova's five-image windows.",
    model: scope.model,
    region: scope.region,
    promptVersion: scope.promptVersion,
    evidenceVersion: scope.evidenceVersion,
    sourceSha256: entry.sourceSha256,
    expected: entry.item.expected,
    split: entry.item.split,
    frameCount: frames.length,
    state: "observing",
    attemptedRequests: 0,
    receivedResponses: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    passes: [] as {
      pass: "observe" | "verify";
      analysis: Analysis;
      usage: { inputTokens: number; outputTokens: number };
    }[],
    errorType: undefined as string | undefined,
    diagnostic: undefined as unknown,
    actual: undefined as string | undefined,
    match: undefined as boolean | undefined,
    actionCovered: undefined as boolean | null | undefined,
    analysisElapsedMs: 0,
  };
  const started = Date.now();
  let stage = "processing";
  await save(output, result);
  try {
    for (const pass of ["observe", "verify"] as const) {
      result.state = pass === "observe" ? "observing" : "verifying";
      const proposal = result.passes[0]?.analysis.observations.map((o) => ({
        ...o,
        evidenceIds: o.evidenceIds.map(
          (id) => references.find((r) => r.asset.id === id)!.alias,
        ),
      }));
      const content: any[] = [
        {
          text: `${pass === "observe" ? "Inspect this complete ordered image sequence and describe visible package actions." : "Independently check the proposed observations against this complete sequence. Reject unsupported claims, weaken ambiguous descriptions, and include missed visible actions."} Clip duration ${entry.durationMs} ms. Return only a JSON object matching this schema: ${JSON.stringify(schema)}. No tools, prose, markdown, or guessed image times. ${VISUAL_EVIDENCE_RULES}${pass === "verify" ? `\nProposal to verify: ${JSON.stringify(proposal)}` : ""}`,
        },
      ];
      for (const r of references)
        content.push(
          { text: `Evidence ID ${r.alias}; offset ${r.asset.offsetMs} ms.` },
          {
            image: {
              format: "jpeg",
              source: { bytes: frameBytes.get(r.asset.id)! },
            },
          },
        );
      if (result.attemptedRequests >= requestLimit)
        throw new Error("Approved request boundary reached.");
      result.attemptedRequests++;
      await fs.appendFile(
        journal,
        JSON.stringify({
          type: "request_authorized",
          pass,
          number: result.attemptedRequests,
          at: new Date().toISOString(),
        }) + "\n",
        { mode: 0o600 },
      );
      await save(output, result);
      stage = "transport";
      const response = await client.send(
        new ConverseCommand({
          modelId: scope.model,
          messages: [{ role: "user", content }],
          inferenceConfig: { maxTokens: 2500, temperature: 0 },
        }),
      );
      result.receivedResponses++;
      const usage = {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
      };
      result.usage.inputTokens += usage.inputTokens;
      result.usage.outputTokens += usage.outputTokens;
      await fs.appendFile(
        journal,
        JSON.stringify({
          type: "response",
          pass,
          usage,
          requestId: response.$metadata?.requestId,
          stopReason: response.stopReason,
          content: response.output?.message?.content,
          receivedAt: new Date().toISOString(),
        }) + "\n",
        { mode: 0o600 },
      );
      await save(output, result);
      stage = "truncated";
      if (response.stopReason === "max_tokens")
        throw new Error("Truncated response");
      const text =
        response.output?.message?.content
          ?.map((c) => c.text ?? "")
          .join("\n") ?? "";
      stage = "json";
      const decoded = parseVisionJson(text);
      stage = "evidence";
      const analysis = parseEvidenceResponse(
        decoded,
        references,
        entry.durationMs,
      );
      result.passes.push({ pass, analysis, usage });
      await save(output, result);
    }
    const analysis = result.passes[1].analysis;
    result.actual = analysis.assessment;
    result.match = analysis.assessment === entry.item.expected;
    result.actionCovered = entry.item.actionWindow
      ? analysis.observations.some(
          (o) =>
            o.concern &&
            o.verification === "supported" &&
            o.startMs <= entry.item.actionWindow![1] &&
            o.endMs >= entry.item.actionWindow![0],
        )
      : null;
    result.state = "complete";
  } catch (error: any) {
    result.state = "failed";
    result.errorType = error?.name || "Error";
    result.diagnostic = {
      stage: error instanceof z.ZodError ? "schema" : stage,
      ...(error instanceof z.ZodError
        ? { issues: error.issues.map((i) => ({ path: i.path, code: i.code })) }
        : {}),
    };
  }
  result.analysisElapsedMs = Date.now() - started;
  await save(output, result);
  return { output, ...result };
}
