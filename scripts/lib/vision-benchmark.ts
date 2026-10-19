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
import {
  validateAnalysis,
  type Analysis,
  type Asset,
} from "../../shared/domain.js";

// Evaluation only. This does not expand the application model allowlist.
export const VISION_BENCHMARK_MODEL = "qwen.qwen3-vl-235b-a22b";
export const VISION_BENCHMARK_VERSION = "packagecare-vision-json-v3";
const scopeSchema = z.object({
  kind: z.literal("packagecare-vision-benchmark-v1"),
  model: z.literal(VISION_BENCHMARK_MODEL),
  region: z.literal(APPLICATION_REGION),
  profile: z.literal(AWS_PROFILE_NAME),
  promptVersion: z.literal(VISION_BENCHMARK_VERSION),
  evidenceVersion: z.literal(PROMPT_VERSION),
  maximumRequests: z.number().int().min(2).max(20),
  maximumOutputTokensPerRequest: z.literal(2500),
  maximumInputContextTokens: z.literal(262144),
  retries: z.literal(0),
  storage: z.literal("local"),
  windowSize: z.literal(3).optional(),
  baselinePlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
  selectedFrameOffsets: z
    .array(z.number().int().nonnegative())
    .min(1)
    .max(20)
    .refine(
      (offsets) => new Set(offsets).size === offsets.length,
      "Frame offsets must be distinct",
    )
    .optional(),
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
  if (scope.windowSize && scope.selectedFrameOffsets)
    throw new Error("Whole-clip windows cannot use selected action offsets.");
  if (
    scope.baseline.cases.length !== 1 ||
    scope.baseline.strategy !== "dense_frames"
  )
    throw new Error("Benchmark one dense-prepared case per reviewed scope.");
  const entry = scope.baseline.cases[0];
  const frames = entry.assets
    .filter((a) => a.kind === "frame")
    .filter(
      (a) =>
        !scope.selectedFrameOffsets ||
        scope.selectedFrameOffsets.includes(a.offsetMs!),
    )
    .sort((a, b) => a.offsetMs! - b.offsetMs!);
  if (
    scope.selectedFrameOffsets &&
    frames.length !== scope.selectedFrameOffsets.length
  )
    throw new Error(
      "Selected offsets must match existing prepared frames exactly.",
    );
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
  const windows: Asset[][] = [];
  if (scope.windowSize) {
    for (let i = 0; i < frames.length; i += 2) {
      windows.push(frames.slice(i, i + 3) as Asset[]);
      if (i + 3 >= frames.length) break;
    }
  } else windows.push(frames as Asset[]);
  return { entry, frames: frames as Asset[], windows };
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
  selectedFrameOffsets?: number[],
  windowSize?: 3,
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
    windowSize,
    baselinePlanSha256: hash(bytes),
    selectedFrameOffsets,
    baseline: JSON.parse(bytes.toString()),
  });
  const { entry, frames, windows } = input(scope);
  scope.maximumRequests = windows.length * 2;
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
      maximumRequests: scope.maximumRequests,
      windowCount: windows.length,
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
export async function inspectVisionBenchmark(planPath: string) {
  const bytes = await fs.readFile(planPath);
  const scope = scopeSchema.parse(JSON.parse(bytes.toString()));
  const { entry, windows } = input(scope);
  if (scope.maximumRequests !== windows.length * 2)
    throw new Error("Prepared request count does not match the input windows.");
  await verifyAssets(
    new MediaStore(path.dirname(planPath), ""),
    entry.assets as Asset[],
  );
  return { scope, sha256: hash(bytes) };
}
export async function runVisionBenchmark(
  planPath: string,
  requestLimit: number,
  suppliedClient?: Pick<BedrockRuntimeClient, "send">,
) {
  const bytes = await fs.readFile(planPath),
    scope = scopeSchema.parse(JSON.parse(bytes.toString()));
  const { entry, frames, windows } = input(scope);
  if (
    requestLimit !== scope.maximumRequests ||
    requestLimit !== windows.length * 2
  )
    throw new Error(
      `This reviewed benchmark requires exactly ${windows.length * 2} authorized requests. No inference started.`,
    );
  const root = path.dirname(planPath),
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
  const output = path.join(root, "results.json"),
    journal = path.join(root, "responses.jsonl");
  const result = {
    warning:
      "Development evidence, not model accuracy. Prepared-frame coverage does not establish continuous-time visibility or camera-domain generalization.",
    model: scope.model,
    region: scope.region,
    promptVersion: scope.promptVersion,
    evidenceVersion: scope.evidenceVersion,
    sourceSha256: entry.sourceSha256,
    expected: entry.item.expected,
    split: entry.item.split,
    frameCount: frames.length,
    windows: windows.map((window, index) => ({
      index,
      frameIds: window.map((a) => a.id),
      offsets: window.map((a) => a.offsetMs),
    })),
    state: "observing",
    attemptedRequests: 0,
    receivedResponses: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    passes: [] as {
      pass: "observe" | "verify";
      analysis: Analysis;
      usage: { inputTokens: number; outputTokens: number };
    }[],
    windowResults: [] as {
      pass: "observe" | "verify";
      window: number;
      analysis: Analysis;
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
  let currentWindow = 0;
  await save(output, result);
  try {
    for (const pass of ["observe", "verify"] as const) {
      result.state = pass === "observe" ? "observing" : "verifying";
      const passUsage = { inputTokens: 0, outputTokens: 0 };
      const windowAnalyses: Analysis[] = [];
      for (let w = 0; w < windows.length; w++) {
        currentWindow = w;
        const references = windows[w].map((asset, i) => ({
          alias: `f${i + 1}`,
          asset,
        }));
        const schema = evidenceTool(
          references.map((r) => ({ ...r.asset, id: r.alias })),
          false,
        ).tools[0].toolSpec.inputSchema.json;
        Object.assign(schema.properties.observations, {
          minItems: 1,
          maxItems: 3,
        });
        Object.assign(
          schema.properties.observations.items.properties.evidenceIds,
          { minItems: 1, maxItems: 10 },
        );
        Object.assign(
          schema.properties.observations.items.properties.description,
          { minLength: 1, maxLength: 800 },
        );
        Object.assign(
          schema.properties.observations.items.properties.limitations,
          { maxItems: 10, items: { type: "string", maxLength: 400 } },
        );
        Object.assign(schema.properties.limitations, {
          maxItems: 5,
          items: { type: "string", maxLength: 400 },
        });
        const proposal = result.passes[0]?.analysis.observations
          .filter((o) =>
            o.evidenceIds.some((id) =>
              references.some((r) => r.asset.id === id),
            ),
          )
          .map((o) => ({
            ...o,
            evidenceIds: o.evidenceIds.flatMap((id) =>
              references.filter((r) => r.asset.id === id).map((r) => r.alias),
            ),
          }));
        const content: any[] = [
          {
            text: `Ordered images from a ${entry.durationMs} ms clip, window ${w + 1}/${windows.length}. Each image has an evidence ID and an offset from the start.`,
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
        content.push({
          text: `${pass === "observe" ? "Inspect the images above and describe actual visible parcels and handling." : "Independently inspect the images above, then check the proposed observations below. Reject unsupported claims, weaken ambiguous descriptions, and include missed visible actions."} Compare earlier and later images: describe parcels relative to visible hands and surfaces, changes in support or position, and what cannot be tracked. Include visible facts even when they are not concerning. Return 1–3 observations; if no parcel or handling can be established, use visibility_insufficient with a specific limitation. Never invent an action to fill an observation. ${VISUAL_EVIDENCE_RULES}\nReturn only a JSON object matching this schema: ${JSON.stringify(schema)}. No tools, prose, markdown, or guessed image times.${pass === "verify" ? `\nProposal to verify: ${JSON.stringify(proposal)}` : ""}`,
        });
        if (result.attemptedRequests >= requestLimit)
          throw new Error("Approved request boundary reached.");
        result.attemptedRequests++;
        await fs.appendFile(
          journal,
          JSON.stringify({
            type: "request_authorized",
            pass,
            window: w,
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
        passUsage.inputTokens += usage.inputTokens;
        passUsage.outputTokens += usage.outputTokens;
        await fs.appendFile(
          journal,
          JSON.stringify({
            type: "response",
            pass,
            window: w,
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
        if (
          !z
            .object({ observations: z.array(z.unknown()).min(1) })
            .safeParse(decoded).success
        )
          throw new Error("No observations returned");
        const analysis = parseEvidenceResponse(
          decoded,
          references,
          entry.durationMs,
          false,
          w,
        );
        windowAnalyses.push(analysis);
        result.windowResults.push({ pass, window: w, analysis });
        await save(output, result);
      }
      stage = "evidence";
      const analysis = validateAnalysis(
        {
          assessment: "unable_to_assess",
          summary: "Evidence review.",
          observations: windowAnalyses.flatMap((a) => a.observations),
          limitations: [
            ...new Set(windowAnalyses.flatMap((a) => a.limitations)),
            `All ${frames.length} prepared frames covered in ${windows.length} window(s); sampling can miss brief or obscured actions.`,
          ].slice(0, 15),
        },
        entry.assets as Asset[],
        entry.durationMs,
      );
      result.passes.push({ pass, analysis, usage: passUsage });
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
      window: currentWindow,
      ...(error instanceof z.ZodError
        ? { issues: error.issues.map((i) => ({ path: i.path, code: i.code })) }
        : {}),
    };
  }
  result.analysisElapsedMs = Date.now() - started;
  await save(output, result);
  return { output, ...result };
}
