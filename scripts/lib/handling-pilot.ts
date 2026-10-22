import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import {
  BedrockRuntimeClient,
  BedrockRuntimeServiceException,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { awsConfig, APPLICATION_REGION } from "../../server/aws.js";
import { AWS_PROFILE_NAME } from "../../shared/project.js";
import type { Analysis, Asset } from "../../shared/domain.js";
import {
  HANDLING_MODEL,
  HANDLING_VERSION,
  handlingRequest,
  parseHandlingResponse,
  reconcileHandling,
  type HandlingResponse,
} from "../../server/handling-evidence.js";
import { evaluationPlanSchema } from "./evaluation.js";
import {
  packHandlingFrames,
  SHEET_VERSION,
  type HandlingSheet,
} from "../../server/handling-sheets.js";

const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const implementationFiles = [
  "server/handling-evidence.ts",
  "server/handling-sheets.ts",
  "scripts/lib/handling-pilot.ts",
  "scripts/handling-pilot.ts",
  "server/aws.ts",
  "shared/project.ts",
  "shared/domain.ts",
  "scripts/lib/evaluation.ts",
  "package-lock.json",
];
async function implementationHash() {
  const parts = await Promise.all(
    implementationFiles.map(async (f) => [
      f,
      hash(await fs.readFile(path.join(sourceRoot, f))),
    ]),
  );
  return hash(JSON.stringify(parts));
}
const scopeSchema = z
  .object({
    kind: z.literal("packagecare-support-pilot-v1"),
    model: z.literal(HANDLING_MODEL),
    promptVersion: z.literal(HANDLING_VERSION),
    region: z.literal(APPLICATION_REGION),
    profile: z.literal(AWS_PROFILE_NAME),
    framesPerCase: z.literal(16),
    maximumRequests: z.union([z.literal(8), z.literal(10)]),
    maximumOutputTokensPerRequest: z.literal(2500),
    maximumInputContextTokens: z.literal(262144),
    retries: z.literal(0),
    storage: z.literal("local"),
    packingVersion: z.literal(SHEET_VERSION),
    sheets: z
      .array(
        z
          .array(
            z.object({
              key: z.string(),
              sha256: z.string(),
              bytes: z.number().int().positive(),
              width: z.number().int().positive(),
              height: z.number().int().positive(),
              panels: z.array(
                z.object({
                  id: z.string(),
                  alias: z.string(),
                  offsetMs: z.number().int().nonnegative(),
                  x: z.number().int().nonnegative(),
                  y: z.number().int().nonnegative(),
                  width: z.number().int().positive(),
                  height: z.number().int().positive(),
                }),
              ),
            }),
          )
          .length(3),
      )
      .length(5)
      .optional(),
    implementationSha256: z.string().regex(/^[a-f0-9]{64}$/),
    baselineSha256: z.string().regex(/^[a-f0-9]{64}$/),
    baseline: evaluationPlanSchema,
    replayFirstCase: z
      .object({
        journalSha256: z.string().regex(/^[a-f0-9]{64}$/),
        priorPlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .optional(),
  })
  .strict();
type Scope = z.infer<typeof scopeSchema>;
async function save(file: string, value: unknown) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
  await fs.rename(`${file}.tmp`, file);
}
function assetPath(root: string, key: string) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error("Invalid asset key");
  return path.join(root, "media", key);
}
function frames(entry: Scope["baseline"]["cases"][number]) {
  return entry.assets
    .filter((a) => a.kind === "frame")
    .sort((a, b) => a.offsetMs! - b.offsetMs!);
}
function validateScope(scope: Scope) {
  if (scope.maximumRequests !== (scope.replayFirstCase ? 8 : 10))
    throw new Error("Invalid continuation request bound");
  const cases = scope.baseline.cases;
  if (
    cases.length !== 5 ||
    scope.baseline.strategy !== "dense_frames" ||
    new Set(cases.map((c) => c.sourceSha256)).size !== 5 ||
    new Set(cases.map((c) => c.item.id)).size !== 5
  )
    throw new Error("Pilot requires five distinct full-sequence source cases");
  for (const entry of cases) {
    const input = frames(entry);
    if (
      input.length !== 16 ||
      input.some(
        (a, i) =>
          a.offsetMs === undefined ||
          a.offsetMs >= entry.durationMs ||
          (i > 0 && a.offsetMs <= input[i - 1].offsetMs!) ||
          a.mime !== "image/jpeg" ||
          a.bytes > 3.75 * 1024 * 1024,
      )
    )
      throw new Error("Each case requires all 16 ordered bounded JPEG frames");
    if (
      new Set(entry.assets.map((a) => a.id)).size !== entry.assets.length ||
      new Set(entry.assets.map((a) => a.key)).size !== entry.assets.length ||
      entry.assets.find((a) => a.name.startsWith("original-"))?.sha256 !==
        entry.sourceSha256
    )
      throw new Error("Invalid source/evidence identity");
  }
  const all = cases.flatMap((c) => c.assets);
  if (
    new Set(all.map((a) => a.id)).size !== all.length ||
    new Set(all.map((a) => a.key)).size !== all.length
  )
    throw new Error("Evidence identities must be globally unique");
}
async function readInputs(root: string, scope: Scope) {
  const bytes = new Map<string, Buffer>();
  // Verify every source and frame across the entire batch before its first call.
  for (const entry of scope.baseline.cases)
    for (const a of entry.assets) {
      const data = await fs.readFile(assetPath(root, a.key));
      if (data.length !== a.bytes || hash(data) !== a.sha256)
        throw new Error("Prepared evidence changed");
      if (a.kind === "frame") {
        const m = await sharp(data).metadata();
        if (
          m.format !== "jpeg" ||
          !m.width ||
          !m.height ||
          m.width > 8000 ||
          m.height > 8000
        )
          throw new Error("Invalid JPEG dimensions/format");
        bytes.set(a.id, data);
      }
    }
  return bytes;
}
export async function prepareHandlingPilot(
  baselinePath: string,
  outputParent = path.resolve("data/handling-support-pilots"),
  previousPlanPath?: string,
) {
  const source = await fs.readFile(baselinePath);
  const scope = scopeSchema.parse({
    kind: "packagecare-support-pilot-v1",
    model: HANDLING_MODEL,
    promptVersion: HANDLING_VERSION,
    region: APPLICATION_REGION,
    profile: AWS_PROFILE_NAME,
    framesPerCase: 16,
    maximumRequests: 10,
    maximumOutputTokensPerRequest: 2500,
    maximumInputContextTokens: 262144,
    retries: 0,
    storage: "local",
    packingVersion: SHEET_VERSION,
    implementationSha256: await implementationHash(),
    baselineSha256: hash(source),
    baseline: JSON.parse(source.toString()),
  });
  validateScope(scope);
  await readInputs(path.dirname(baselinePath), scope);
  const root = path.join(outputParent, randomUUID());
  await fs.mkdir(path.join(root, "media"), { recursive: true });
  await fs.writeFile(path.join(root, "baseline.json"), source, {
    flag: "wx",
    mode: 0o600,
  });
  for (const entry of scope.baseline.cases)
    for (const a of entry.assets)
      await fs.copyFile(
        assetPath(path.dirname(baselinePath), a.key),
        assetPath(root, a.key),
      );
  const frameBytes = await readInputs(root, scope);
  scope.sheets = [];
  for (const [i, entry] of scope.baseline.cases.entries()) {
    const packed = await packHandlingFrames(
      frames(entry).map((asset, n) => ({ alias: `f${n + 1}`, asset })),
      frameBytes,
    );
    const records = [];
    for (const [j, sheet] of packed.entries()) {
      const key = `sheet-${i}-${j}.jpg`;
      await fs.writeFile(assetPath(root, key), sheet.bytes, { mode: 0o600 });
      records.push({
        key,
        sha256: hash(sheet.bytes),
        bytes: sheet.bytes.length,
        width: sheet.width,
        height: sheet.height,
        panels: sheet.panels,
      });
    }
    scope.sheets.push(records);
  }
  const planPath = path.join(root, "plan.json");
  if (previousPlanPath) {
    const previous = await fs.readFile(previousPlanPath);
    const priorScope = JSON.parse(previous.toString());
    if (
      priorScope.baselineSha256 !== scope.baselineSha256 ||
      priorScope.model !== scope.model ||
      priorScope.promptVersion !== scope.promptVersion
    )
      throw new Error(
        "Continuation must use the identical baseline/model/prompt",
      );
    const priorJournal = await fs.readFile(
      path.join(path.dirname(previousPlanPath), "responses.jsonl"),
    );
    await fs.writeFile(path.join(root, "prior-responses.jsonl"), priorJournal, {
      mode: 0o600,
    });
    scope.replayFirstCase = {
      journalSha256: hash(priorJournal),
      priorPlanSha256: hash(previous),
    };
    scope.maximumRequests = 8;
  }
  await save(planPath, scope);
  await inspectHandlingPilot(planPath);
  return {
    planPath,
    planSha256: hash(await fs.readFile(planPath)),
    maximumRequests: scope.maximumRequests,
    frames: 80,
  };
}
export async function inspectHandlingPilot(planPath: string) {
  const data = await fs.readFile(planPath);
  const scope = scopeSchema.parse(JSON.parse(data.toString()));
  validateScope(scope);
  if (scope.implementationSha256 !== (await implementationHash()))
    throw new Error("Candidate implementation changed; prepare a new scope");
  const baseline = await fs.readFile(
    path.join(path.dirname(planPath), "baseline.json"),
  );
  if (
    hash(baseline) !== scope.baselineSha256 ||
    JSON.stringify(
      evaluationPlanSchema.parse(JSON.parse(baseline.toString())),
    ) !== JSON.stringify(scope.baseline)
  )
    throw new Error("Baseline changed");
  const bytes = await readInputs(path.dirname(planPath), scope);
  if (!scope.sheets) throw new Error("Prepared image sheets missing");
  const sheets: HandlingSheet[][] = [];
  for (const [i, entry] of scope.baseline.cases.entries()) {
    const packed = await packHandlingFrames(
      frames(entry).map((asset, n) => ({ alias: `f${n + 1}`, asset })),
      bytes,
    );
    for (const [j, sheet] of packed.entries()) {
      const saved = scope.sheets[i][j];
      const onDisk = await fs.readFile(
        assetPath(path.dirname(planPath), saved.key),
      );
      if (
        hash(onDisk) !== saved.sha256 ||
        saved.bytes !== onDisk.length ||
        hash(sheet.bytes) !== saved.sha256 ||
        saved.width !== sheet.width ||
        saved.height !== sheet.height ||
        JSON.stringify(saved.panels) !== JSON.stringify(sheet.panels)
      )
        throw new Error("Prepared image sheet changed or lost frame lineage");
    }
    sheets.push(packed);
  }
  const replay = scope.replayFirstCase
    ? await replayFirstCase(path.dirname(planPath), scope, sheets[0])
    : undefined;
  return { scope, bytes, sheets, replay, planSha256: hash(data) };
}
export type HandlingTransport = (
  input: ConverseCommandInput,
) => Promise<ConverseCommandOutput>;
type CaseResult = {
  id: string;
  expected: string;
  passes: { pass: string; evidence: HandlingResponse; analysis: Analysis }[];
  analysis?: Analysis;
  match?: boolean;
  releaseWitnessInActionWindow?: boolean | null;
};
function requestReceipt(input: ConverseCommandInput) {
  return JSON.parse(
    JSON.stringify(input, (_key, value) => {
      if (value?.type === "Buffer" && Array.isArray(value.data))
        return {
          sha256: hash(Buffer.from(value.data)),
          bytes: value.data.length,
        };
      return value;
    }),
  );
}
async function replayFirstCase(
  root: string,
  scope: Scope,
  sheets: HandlingSheet[],
) {
  const raw = await fs.readFile(path.join(root, "prior-responses.jsonl"));
  if (hash(raw) !== scope.replayFirstCase!.journalSha256)
    throw new Error("Prior response journal changed");
  const lines = raw
    .toString()
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const attempts = lines.filter((r) => r.type === "attempt"),
    responses = lines.filter((r) => r.type === "response");
  if (attempts.length !== 2 || responses.length !== 2)
    throw new Error("Continuation needs exactly two saved first-case replies");
  const entry = scope.baseline.cases[0];
  const references = frames(entry).map((asset, i) => ({
    alias: `f${i + 1}`,
    asset,
  }));
  const row: CaseResult = {
    id: entry.item.id,
    expected: entry.item.expected,
    passes: [],
  };
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (const [i, pass] of (["observe", "verify"] as const).entries()) {
    const a = attempts[i],
      r = responses[i];
    if (
      a.case !== 0 ||
      r.case !== 0 ||
      a.pass !== pass ||
      r.pass !== pass ||
      r.stopReason !== "end_turn"
    )
      throw new Error("Invalid saved pass identity/status");
    const expected = requestReceipt(
      handlingRequest(
        references,
        sheets,
        entry.durationMs,
        i ? row.passes[0].evidence : undefined,
      ),
    );
    if (JSON.stringify(expected) !== JSON.stringify(a.request))
      throw new Error(
        "Saved request differs from current full-sequence request",
      );
    const u = z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .parse(r.usage);
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    const parsed = parseHandlingResponse(
      JSON.parse(r.content.map((c: { text: string }) => c.text).join("\n")),
      references,
      entry.durationMs,
    );
    row.passes.push({
      pass,
      evidence: parsed.response,
      analysis: parsed.analysis,
    });
  }
  row.analysis = reconcileHandling(
    row.passes[0].analysis,
    row.passes[1].analysis,
    entry.assets as Asset[],
    entry.durationMs,
  );
  row.match = row.analysis.assessment === entry.item.expected;
  row.releaseWitnessInActionWindow = entry.item.actionWindow
    ? row.passes[1].evidence.events.some(
        (e, i) =>
          row.passes[1].analysis.observations.some(
            (o) =>
              o.id === `event-${i}` &&
              o.concern &&
              o.verification === "supported",
          ) &&
          e.trace.some((t) => {
            const offset = references.find((r) => r.alias === t.frame)!.asset
              .offsetMs!;
            return (
              t.support === "airborne" &&
              offset >= entry.item.actionWindow![0] &&
              offset <= entry.item.actionWindow![1]
            );
          }),
      )
    : null;
  return { row, usage };
}
export async function runHandlingPilot(
  planPath: string,
  approvedSha256: string,
  requestLimit: number,
  transport?: HandlingTransport,
) {
  // Approval is supplied by the owner out of band. The digest binds that scope;
  // a command-line flag alone must never be treated as owner authorization.
  const raw = await fs.readFile(planPath);
  if (hash(raw) !== approvedSha256 || ![8, 10].includes(requestLimit))
    throw new Error("Approved plan digest/request limit mismatch");
  const { scope, sheets, replay, planSha256 } =
    await inspectHandlingPilot(planPath);
  if (requestLimit !== scope.maximumRequests)
    throw new Error("Approved continuation request limit mismatch");
  if (planSha256 !== approvedSha256)
    throw new Error("Plan changed during preflight");
  const config = awsConfig();
  if (!("profile" in config) || config.profile !== "pkgcare")
    throw new Error("Local pilot requires the pkgcare profile");
  const root = path.dirname(planPath);
  await fs.writeFile(
    path.join(root, "invocation.json"),
    JSON.stringify({
      planSha256,
      requestLimit,
      startedAt: new Date().toISOString(),
    }),
    { flag: "wx", mode: 0o600 },
  );
  const client = transport
    ? undefined
    : new BedrockRuntimeClient({ ...config, maxAttempts: 1 });
  const send: HandlingTransport =
    transport ?? ((input) => client!.send(new ConverseCommand(input)));
  const result = {
    state: "running",
    model: scope.model,
    planSha256,
    attemptedRequests: 0,
    receivedResponses: 0,
    replayedResponses: replay ? 2 : 0,
    replayedUsage: replay?.usage,
    usage: { inputTokens: 0, outputTokens: 0 },
    cases: replay ? [replay.row] : ([] as CaseResult[]),
    diagnostic: undefined as { stage: string; errorType: string } | undefined,
    elapsedMs: 0,
    estimatedUsdBeforeTax: 0,
    warning:
      "Five reused development sources. Headline matches are not accuracy; inspect every support witness and description.",
  };
  const output = path.join(root, "results.json");
  const journal = (value: unknown) =>
    fs.appendFile(
      path.join(root, "responses.jsonl"),
      JSON.stringify(value) + "\n",
      { mode: 0o600 },
    );
  let stage = "preflight";
  const started = Date.now();
  try {
    for (const [index, entry] of scope.baseline.cases.entries()) {
      if (index === 0 && replay) continue;
      const references = frames(entry).map((asset, i) => ({
        alias: `f${i + 1}`,
        asset: asset as Asset,
      }));
      const row: CaseResult = {
        id: entry.item.id,
        expected: entry.item.expected,
        passes: [],
      };
      result.cases.push(row);
      for (const pass of ["observe", "verify"] as const) {
        const input = handlingRequest(
          references,
          sheets[index],
          entry.durationMs,
          pass === "verify" ? row.passes[0].evidence : undefined,
        );
        // Serialize text/schema/metadata + image fingerprints, never media bytes,
        // so the actual request can be reconstructed without leaking secrets.
        const receipt = requestReceipt(input);
        if (result.attemptedRequests >= requestLimit)
          throw new Error("Request boundary reached");
        result.attemptedRequests++;
        await journal({
          type: "attempt",
          case: index,
          pass,
          request: receipt,
          at: new Date().toISOString(),
        });
        await save(output, result);
        stage = "transport";
        const response = await send(input);
        result.receivedResponses++;
        // Retain the complete returned content and usage before validation.
        await journal({
          type: "response",
          case: index,
          pass,
          content: response.output?.message?.content,
          usage: response.usage,
          stopReason: response.stopReason,
          requestId: response.$metadata?.requestId,
        });
        stage = "usage";
        const usage = z
          .object({
            inputTokens: z.number().int().nonnegative().max(262144),
            outputTokens: z.number().int().nonnegative().max(2500),
          })
          .parse(response.usage);
        result.usage.inputTokens += usage.inputTokens;
        result.usage.outputTokens += usage.outputTokens;
        await save(output, result);
        stage = "stop_reason";
        if (response.stopReason !== "end_turn")
          throw new Error("Incomplete/filtered response");
        stage = "json";
        const content = response.output?.message?.content;
        if (!content?.length || content.some((c) => typeof c.text !== "string"))
          throw new Error("Non-text response");
        const decoded = JSON.parse(content.map((c) => c.text).join("\n"));
        stage = "evidence";
        const parsed = parseHandlingResponse(
          decoded,
          references,
          entry.durationMs,
        );
        row.passes.push({
          pass,
          evidence: parsed.response,
          analysis: parsed.analysis,
        });
        await save(output, result);
      }
      row.analysis = reconcileHandling(
        row.passes[0].analysis,
        row.passes[1].analysis,
        entry.assets as Asset[],
        entry.durationMs,
      );
      row.match = row.analysis.assessment === entry.item.expected;
      const actionWindow = entry.item.actionWindow;
      // Score an actual airborne witness, not merely overlap of a broad interval.
      row.releaseWitnessInActionWindow = actionWindow
        ? row.passes[1].evidence.events.some(
            (e, i) =>
              row.passes[1].analysis.observations.some(
                (o) =>
                  o.id === `event-${i}` &&
                  o.concern &&
                  o.verification === "supported",
              ) &&
              e.trace.some((t) => {
                const offset = references.find((r) => r.alias === t.frame)!
                  .asset.offsetMs!;
                return (
                  t.support === "airborne" &&
                  offset >= actionWindow[0] &&
                  offset <= actionWindow[1]
                );
              }),
          )
        : null;
      await save(output, result);
    }
    result.state = "complete";
  } catch (error) {
    result.state = "failed";
    result.diagnostic = {
      stage,
      errorType: error instanceof Error ? error.name : "UnknownError",
    };
    // Service validation details are essential for diagnosing an incompatible
    // request. Persist only explicit service fields locally, never the client,
    // request/headers, credentials, or arbitrary thrown objects.
    if (error instanceof BedrockRuntimeServiceException) {
      const message = error.message
        .slice(0, 4000)
        .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[redacted-access-key]")
        .replace(/(Bearer\s+)[^\s"']+/gi, "$1[redacted]")
        .replace(
          /((?:secretAccessKey|sessionToken|authorization)\s*[:=]\s*)[^\s,;}]+/gi,
          "$1[redacted]",
        );
      await save(path.join(root, "service-error.json"), {
        name: error.name,
        message,
        requestId: error.$metadata.requestId,
        httpStatusCode: error.$metadata.httpStatusCode,
        attempts: error.$metadata.attempts,
      });
    }
    await journal({ type: "failure", ...result.diagnostic });
  } finally {
    client?.destroy();
  }
  result.elapsedMs = Date.now() - started;
  result.estimatedUsdBeforeTax =
    result.usage.inputTokens * 0.0000005 +
    result.usage.outputTokens * 0.0000015;
  await save(output, result);
  return { output, ...result };
}
