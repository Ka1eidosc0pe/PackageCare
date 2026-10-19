import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { MediaStore, prepareVideo } from "../../server/media.js";
import {
  ANALYSIS_STRATEGIES,
  PROMPT_VERSION,
  BedrockAnalyzer,
  failedAnalysisRun,
  planAnalysisInputs,
  type Analyzer,
  type ModelResponseReceipt,
} from "../../server/analysis.js";
import {
  APPLICATION_REGION,
  BEDROCK_MODEL,
  processingErrorMessage,
} from "../../server/aws.js";
import {
  assessmentSchema,
  emptyReview,
  type Delivery,
  type Asset,
} from "../../shared/domain.js";
const strategySchema = z.enum(ANALYSIS_STRATEGIES);
const itemSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    file: z.string().min(1),
    source: z.enum(["uploaded", "fixture", "ring_simulator", "ring_device"]),
    expected: assessmentSchema,
    split: z.enum(["development", "held_out"]),
    actionWindow: z
      .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
      .optional(),
  })
  .superRefine((item, ctx) => {
    if (item.expected === "possible_rough_handling" && !item.actionWindow)
      ctx.addIssue({
        code: "custom",
        message:
          "Label the visible rough-handling actionWindow before evaluation.",
      });
    if (item.actionWindow && item.actionWindow[0] > item.actionWindow[1])
      ctx.addIssue({ code: "custom", message: "Invalid actionWindow order." });
  });
const assetSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["video", "frame"]),
  offsetMs: z.number().int().nonnegative().optional(),
});
export const evaluationPlanSchema = z.object({
  kind: z.literal("packagecare-evaluation-v1"),
  strategy: strategySchema,
  promptVersion: z.literal(PROMPT_VERSION),
  region: z.literal(APPLICATION_REGION),
  model: z.literal(BEDROCK_MODEL),
  createdAt: z.string(),
  maximumRequests: z.number().int().positive(),
  maximumOutputTokensPerRequest: z.literal(2500),
  retries: z.literal(0),
  storage: z.literal("local"),
  requestedFrameCount: z.number().int().min(5).max(120).optional(),
  cases: z
    .array(
      z.object({
        item: itemSchema,
        sourceSha256: z.string(),
        durationMs: z.number().int().min(500).max(60000),
        preparationMs: z.number().int().nonnegative(),
        assets: z.array(assetSchema).min(2).max(122),
      }),
    )
    .min(1),
});
type Plan = z.infer<typeof evaluationPlanSchema>;
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function save(file: string, value: unknown) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
  await fs.rename(`${file}.tmp`, file);
}
function asDelivery(entry: Plan["cases"][number], at: string): Delivery {
  return {
    id: entry.item.id,
    revision: 0,
    source: entry.item.source,
    title: "Evaluation clip",
    camera: "Labeled dataset",
    observedAt: at,
    createdAt: at,
    state: "analyzing",
    durationMs: entry.durationMs,
    assets: entry.assets as Asset[],
    runs: [],
    reports: [],
    review: emptyReview(),
  };
}
export async function prepareEvaluation(
  manifestPath: string,
  strategy: z.infer<typeof strategySchema>,
  split: "development" | "held_out" | "all",
  outputParent = path.resolve("data/evaluations"),
  requestedFrameCount?: number,
) {
  strategySchema.parse(strategy);
  if (requestedFrameCount !== undefined)
    z.number().int().min(5).max(120).parse(requestedFrameCount);
  const items = z
    .array(itemSchema)
    .min(1)
    .parse(JSON.parse(await fs.readFile(manifestPath, "utf8")));
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error("Evaluation IDs must be distinct.");
  // Check all recordings, including exact duplicates across splits, before a paid run can start.
  const hashes = new Set<string>(),
    inputs = new Map<string, { file: string; sha256: string }>();
  for (const item of items) {
    const file = path.resolve(path.dirname(manifestPath), item.file),
      stat = await fs.stat(file);
    if (!stat.isFile() || !stat.size || stat.size > 80 * 1024 * 1024)
      throw new Error(`Choose a regular video under 80 MB for ${item.id}.`);
    const sha256 = hash(await fs.readFile(file));
    if (hashes.has(sha256))
      throw new Error(
        "Distinct cases must not reuse identical source footage, including across splits.",
      );
    hashes.add(sha256);
    inputs.set(item.id, { file, sha256 });
  }
  const selected = items.filter((i) => split === "all" || i.split === split);
  if (!selected.length) throw new Error("No cases in the selected split.");
  const root = path.join(outputParent, randomUUID()),
    media = new MediaStore(root, "");
  await fs.mkdir(root, { recursive: true });
  try {
    const cases: Plan["cases"] = [];
    for (const item of selected) {
      const preparationStarted = Date.now();
      const input = inputs.get(item.id)!,
        bytes = await fs.readFile(input.file);
      if (hash(bytes) !== input.sha256)
        throw new Error(
          "Source changed during preparation; prepare a fresh plan.",
        );
      const prepared = await prepareVideo(
        bytes,
        media,
        `${item.id}.mp4`,
        requestedFrameCount,
      );
      if (item.actionWindow && item.actionWindow[1] > prepared.durationMs)
        throw new Error(`Action window exceeds ${item.id}'s duration.`);
      const video = prepared.assets.find((a) => a.name.startsWith("playback"))!;
      if (strategy === "native_video" && video.bytes > 20 * 1024 * 1024)
        throw new Error(
          "Local native-video evaluation is limited to 20 MB. Choose shorter footage.",
        );
      cases.push({
        item,
        sourceSha256: input.sha256,
        durationMs: prepared.durationMs,
        assets: z.array(assetSchema).parse(prepared.assets),
        preparationMs: Date.now() - preparationStarted,
      });
    }
    const maximumRequests = cases.reduce(
      (n, c) => n + 2 * planAnalysisInputs(c.assets, strategy).windows.length,
      0,
    );
    const plan: Plan = {
      kind: "packagecare-evaluation-v1",
      strategy,
      promptVersion: PROMPT_VERSION,
      region: APPLICATION_REGION,
      model: BEDROCK_MODEL,
      createdAt: new Date().toISOString(),
      maximumRequests,
      maximumOutputTokensPerRequest: 2500,
      retries: 0,
      storage: "local",
      ...(requestedFrameCount === undefined ? {} : { requestedFrameCount }),
      cases,
    };
    const planPath = path.join(root, "plan.json");
    await save(planPath, plan);
    return { planPath, plan };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}
export type AnalyzerFactory = (
  media: MediaStore,
  strategy: Plan["strategy"],
  response: (r: ModelResponseReceipt) => Promise<void>,
  before: () => Promise<void>,
) => Analyzer;
export async function runEvaluation(
  planPath: string,
  requestLimit: number,
  factory: AnalyzerFactory = (media, strategy, response, before) =>
    new BedrockAnalyzer(media, BEDROCK_MODEL, strategy, response, before),
) {
  const planBytes = await fs.readFile(planPath),
    plan = evaluationPlanSchema.parse(JSON.parse(planBytes.toString())),
    root = path.dirname(planPath),
    media = new MediaStore(root, "");
  const required = plan.cases.reduce(
    (n, c) =>
      n + 2 * planAnalysisInputs(c.assets, plan.strategy).windows.length,
    0,
  );
  if (
    required !== plan.maximumRequests ||
    !Number.isSafeInteger(requestLimit) ||
    requestLimit < required
  )
    throw new Error(
      `This reviewed plan requires a request limit of ${required}. No inference started.`,
    );
  for (const entry of plan.cases) {
    if (
      new Set(entry.assets.map((a) => a.id)).size !== entry.assets.length ||
      entry.assets.some(
        (a) =>
          a.kind === "frame" &&
          (a.offsetMs === undefined || a.offsetMs >= entry.durationMs),
      )
    )
      throw new Error(
        "Invalid prepared evidence references. No inference started.",
      );
    for (const asset of entry.assets) {
      const bytes = await media.read(asset as Asset);
      if (hash(bytes) !== asset.sha256 || bytes.length !== asset.bytes)
        throw new Error(
          "Prepared evidence changed or is missing. No inference started.",
        );
    }
    if (
      entry.assets.find((a) => a.name.startsWith("original-"))?.sha256 !==
      entry.sourceSha256
    )
      throw new Error(
        "Original source fingerprint mismatch. No inference started.",
      );
  }
  // A durable invocation receipt prevents accidentally repeating an already-spent scope.
  await fs.writeFile(
    path.join(root, "invocation.json"),
    JSON.stringify({
      startedAt: new Date().toISOString(),
      planSha256: hash(planBytes),
      requestLimit: required,
    }),
    { flag: "wx", mode: 0o600 },
  );
  let attemptedRequests = 0,
    receivedResponses = 0;
  const results: any[] = [];
  const output = path.join(root, "results.json"),
    journal = path.join(root, "responses.jsonl");
  const checkpoint = () =>
    save(output, {
      warning:
        "Small feasibility set, not production accuracy. Source labels are manifest annotations, not provider attestations.",
      strategy: plan.strategy,
      promptVersion: plan.promptVersion,
      region: plan.region,
      model: plan.model,
      requestedFrameCount: plan.requestedFrameCount,
      maximumRequests: required,
      attemptedRequests,
      receivedResponses,
      casesPlanned: plan.cases.length,
      casesCompleted: results.filter((r) => r.state === "complete").length,
      results,
    });
  await checkpoint();
  for (const entry of plan.cases) {
    const row: any = {
      id: entry.item.id,
      source: entry.item.source,
      sourceSha256: entry.sourceSha256,
      split: entry.item.split,
      expected: entry.item.expected,
      state: "analyzing",
      runs: [],
    };
    results.push(row);
    await checkpoint();
    const start = Date.now(),
      d = asDelivery(entry, plan.createdAt);
    const analyzer = factory(
      media,
      plan.strategy,
      async (receipt) => {
        receivedResponses++;
        await fs.appendFile(
          journal,
          JSON.stringify({
            type: "response",
            caseId: entry.item.id,
            ...receipt,
          }) + "\n",
          { mode: 0o600 },
        );
        await checkpoint();
      },
      async () => {
        if (attemptedRequests >= required)
          throw new Error("Approved evaluation request boundary reached.");
        attemptedRequests++;
        await fs.appendFile(
          journal,
          JSON.stringify({
            type: "request_authorized",
            caseId: entry.item.id,
            number: attemptedRequests,
            at: new Date().toISOString(),
          }) + "\n",
          { mode: 0o600 },
        );
        await checkpoint();
      },
    );
    try {
      const first = await analyzer.analyze(d, "observe");
      row.runs.push(first.run);
      row.state = "verifying";
      await checkpoint();
      const second = await analyzer.analyze(d, "verify", first.analysis);
      row.runs.push(second.run);
      Object.assign(row, {
        state: "complete",
        actual: second.analysis.assessment,
        match: second.analysis.assessment === entry.item.expected,
        analysis: second.analysis,
        actionCovered: entry.item.actionWindow
          ? second.analysis.observations.some(
              (o) =>
                o.concern &&
                o.verification === "supported" &&
                o.startMs <= entry.item.actionWindow![1] &&
                o.endMs >= entry.item.actionWindow![0],
            )
          : null,
      });
    } catch (error: any) {
      const failed = failedAnalysisRun(error);
      if (failed) row.runs.push(failed);
      Object.assign(row, {
        state: "failed",
        match: false,
        errorType: error?.name || "Error",
        error: processingErrorMessage(error),
      });
    }
    row.analysisElapsedMs = Date.now() - start;
    row.preparationMs = entry.preparationMs;
    row.elapsedMs = row.analysisElapsedMs + entry.preparationMs;
    await checkpoint();
    if (row.state === "failed") break;
  }
  return { output, attemptedRequests, receivedResponses, results };
}
