import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  validateAnalysis,
  type Analysis,
  type Asset,
  type Delivery,
  type Observation,
  type Run,
} from "../shared/domain.js";
import type { MediaStore } from "./media.js";
import { attachFailedRun, type Analyzer } from "./analysis.js";

export const LOCAL_PROMPT_VERSION = "packagecare-local-classifier-v1";
export const LOCAL_PROVIDER_LABEL =
  "Local handling classifier (trained on synthetic clips)";
// The Lambda bundle is CommonJS (esbuild), where import.meta.dirname is undefined;
// fall back to PACKAGECARE_ROOT or the working directory (/var/task in Lambda).
const ROOT = process.env.PACKAGECARE_ROOT
  ? path.resolve(process.env.PACKAGECARE_ROOT)
  : import.meta.dirname
    ? path.resolve(import.meta.dirname, "..")
    : process.cwd();
export const THRESHOLDS = {
  clip: 0.6,
  supported: 0.8,
  roughVeto: 0.3,
} as const;
export const LOCAL_LIMITATIONS = [
  "Automated classifier on frozen V-JEPA 2 video features, trained only on synthetic footage; it has not been validated on real deliveries.",
  "Classifier scores are not calibrated probabilities and do not establish what happened.",
  "Review the footage yourself before relying on this timeline. Package damage is recorded separately by the recipient.",
  "2-second windows at a 0.5-second hop; brief, distant, or obscured actions can be missed.",
];

const probs = z.record(z.number().min(0).max(1));
export const inferOutputSchema = z.object({
  classes: z.array(z.string()).min(1),
  clip_probs: probs,
  windows: z
    .array(
      z.object({
        start_ms: z.number().nonnegative(),
        end_ms: z.number().nonnegative(),
        probs,
      }),
    )
    .min(1),
  duration_ms: z.number().nonnegative(),
  model_id: z.string().min(1),
  seconds: z.number().nonnegative(),
});
export type InferOutput = z.infer<typeof inferOutputSchema>;
export type Exec = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export class LocalClassifierError extends Error {
  name = "LocalClassifierError";
}

const defaultExec: Exec = (file, args) =>
  new Promise((resolve, reject) =>
    execFile(
      file,
      args,
      { timeout: 10 * 60_000, maxBuffer: 20 * 1024 * 1024, cwd: ROOT },
      (error, stdout, stderr) =>
        error
          ? reject(Object.assign(error, { stderr: String(stderr) }))
          : resolve({ stdout: String(stdout), stderr: String(stderr) }),
    ),
  );

export function resolveClassifier(
  configured = process.env.PACKAGECARE_CLASSIFIER,
) {
  if (configured) return path.resolve(configured);
  const preferred = path.join(ROOT, "data/synthetic/model/classifier.joblib");
  return existsSync(preferred)
    ? preferred
    : path.join(ROOT, "data/synthetic/model-mini/classifier.joblib");
}

// Plain-language strength for the peak window score. Scores are not
// calibrated probabilities; the numbers stay available in run.raw.
export function signalStrength(peak: number) {
  return peak >= THRESHOLDS.supported
    ? "Strong signal"
    : peak >= THRESHOLDS.clip
      ? "Moderate signal"
      : "Weak signal";
}
function clampWindow(w: { start_ms: number; end_ms: number }, dur: number) {
  const endMs = Math.max(0, Math.min(dur, Math.round(w.end_ms)));
  const startMs = Math.min(endMs, Math.max(0, Math.round(w.start_ms)));
  return { startMs, endMs };
}
function evidenceFor(
  assets: Asset[],
  video: Asset,
  startMs: number,
  endMs: number,
) {
  const inside = assets
    .filter(
      (a) =>
        a.kind === "frame" &&
        a.offsetMs !== undefined &&
        a.offsetMs >= startMs &&
        a.offsetMs <= endMs,
    )
    .sort((a, b) => a.offsetMs! - b.offsetMs!);
  if (!inside.length) return [video.id];
  // Spread up to 10 frames evenly across the interval.
  const picked =
    inside.length <= 10
      ? inside
      : Array.from(
          { length: 10 },
          (_, i) => inside[Math.round(((inside.length - 1) * i) / 9)],
        );
  return [...new Set(picked.map((a) => a.id))];
}

// Conservative mapping from classifier scores to evidence-linked observations.
// The assessment itself is always derived by validateAnalysis.
export function mapClassifierOutput(
  out: InferOutput,
  assets: Asset[],
  durationMs: number,
  video: Asset,
): Analysis {
  const clip = (c: string) => out.clip_probs[c] ?? 0;
  const peak = (c: string) =>
    out.windows.reduce((best, w) =>
      (w.probs[c] ?? 0) > (best.probs[c] ?? 0) ? w : best,
    );
  const observe = (
    cls: string,
    o: Pick<Observation, "label" | "concern"> & { describe: string },
  ): Observation => {
    const w = peak(cls),
      score = w.probs[cls] ?? 0;
    const { startMs, endMs } = clampWindow(w, durationMs);
    return {
      id: `local-${cls}`,
      label: o.label,
      description: `${o.describe}. ${signalStrength(score)} in the highlighted 2-second window. Review this segment.`,
      startMs,
      endMs,
      evidenceIds: evidenceFor(assets, video, startMs, endMs),
      concern: o.concern,
      verification: score >= THRESHOLDS.supported ? "supported" : "ambiguous",
      limitations: [
        "Interval is the highest-scoring 2-second classifier window, not a precise event time.",
      ],
    };
  };
  let observation: Observation;
  if (clip("rough") >= THRESHOLDS.clip)
    observation = observe("rough", {
      label: "possible_airborne_release",
      concern: true,
      describe:
        "Motion consistent with a package being tossed or dropped",
    });
  else if (
    clip("placement") >= THRESHOLDS.clip &&
    clip("rough") < THRESHOLDS.roughVeto
  )
    observation = observe("placement", {
      label: "controlled_placement",
      concern: false,
      describe: "Motion consistent with a package being set down",
    });
  else
    observation = {
      id: "local-inconclusive",
      label: "visibility_insufficient",
      description:
        "The classifier did not find a clear toss, drop, or placement in this clip. Review the footage.",
      startMs: 0,
      endMs: Math.max(0, Math.round(durationMs)),
      evidenceIds: evidenceFor(assets, video, 0, durationMs),
      concern: false,
      verification: "ambiguous",
      limitations: [],
    };
  return validateAnalysis(
    {
      assessment: "unable_to_assess",
      summary: "The available sequence does not support a handling assessment.",
      observations: [observation],
      limitations: LOCAL_LIMITATIONS,
    },
    assets,
    durationMs,
  );
}

export class LocalClassifierAnalyzer implements Analyzer {
  readonly provider = "local_classifier" as const;
  readonly label = LOCAL_PROVIDER_LABEL;
  constructor(
    private media: MediaStore,
    private options: {
      python?: string;
      classifier?: string;
      script?: string;
      device?: string;
      modelDir?: string;
      exec?: Exec;
    } = {},
  ) {}
  get classifier() {
    return resolveClassifier(this.options.classifier);
  }
  async analyze(d: Delivery, pass: "observe" | "verify", proposal?: Analysis) {
    const startedAt = new Date().toISOString();
    const video =
      d.assets.find(
        (a) => a.kind === "video" && a.name.startsWith("playback"),
      ) || d.assets.find((a) => a.kind === "video");
    if (!video) throw new LocalClassifierError("No source video available.");
    const base = {
      provider: "local_classifier" as const,
      startedAt,
      inputAssetIds: [video.id],
    };
    // Single-model provider: verification re-validates the observe result
    // against current assets and preserves its verification states.
    if (pass === "verify") {
      if (!proposal) throw new Error("No observation pass to verify.");
      const analysis = validateAnalysis(
        structuredClone(proposal),
        d.assets,
        d.durationMs,
      );
      const prior = [...d.runs]
        .reverse()
        .find((r) => r.provider === "local_classifier" && r.proposal);
      const run: Run = {
        ...base,
        id: randomUUID(),
        model: prior?.model || path.basename(this.classifier),
        promptVersion: `${LOCAL_PROMPT_VERSION}/verify-passthrough`,
        finishedAt: new Date().toISOString(),
        verification: analysis,
      };
      return { analysis, run };
    }
    const classifier = this.classifier;
    const python = path.resolve(
      ROOT,
      this.options.python ||
        process.env.PACKAGECARE_PYTHON ||
        "data/cv-env/bin/python",
    );
    const script =
      this.options.script ||
      process.env.PACKAGECARE_INFER_SCRIPT ||
      path.join(ROOT, "experiments/synthetic/infer.py");
    const device = this.options.device || process.env.PACKAGECARE_DEVICE;
    const modelDir = this.options.modelDir || process.env.PACKAGECARE_MODEL_DIR;
    const exec = this.options.exec || defaultExec;
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "packagecare-local-"));
    const t0 = Date.now();
    let attempted = 0;
    try {
      const file = path.join(tmp, "clip.mp4");
      await fs.writeFile(file, await this.media.read(video));
      let stdout: string;
      attempted = 1;
      try {
        ({ stdout } = await exec(python, [
          script,
          "--model",
          classifier,
          ...(device ? ["--device", device] : []),
          ...(modelDir ? ["--model-dir", path.resolve(modelDir)] : []),
          file,
        ]));
      } catch {
        throw new LocalClassifierError(
          "The local handling classifier failed. No assessment was saved.",
        );
      }
      let out: InferOutput;
      try {
        const line = stdout.trim().split("\n").at(-1) || "";
        out = inferOutputSchema.parse(JSON.parse(line));
      } catch {
        throw new LocalClassifierError(
          "The local handling classifier returned unreadable output. No assessment was saved.",
        );
      }
      const analysis = mapClassifierOutput(out, d.assets, d.durationMs, video);
      const run: Run = {
        ...base,
        id: randomUUID(),
        model: `${out.model_id} (${path.relative(ROOT, classifier) || classifier})`,
        promptVersion: `${LOCAL_PROMPT_VERSION}/observe`,
        finishedAt: new Date().toISOString(),
        usage: {
          wallMs: Date.now() - t0,
          inferenceSeconds: out.seconds,
          windows: out.windows.length,
        },
        proposal: analysis,
        raw: out,
      };
      return { analysis, run };
    } catch (error) {
      throw attachFailedRun(error, {
        ...base,
        id: randomUUID(),
        model: path.relative(ROOT, classifier) || classifier,
        promptVersion: `${LOCAL_PROMPT_VERSION}/observe`,
        finishedAt: new Date().toISOString(),
        usage: { wallMs: Date.now() - t0 },
        failure: {
          stage: "processing",
          attemptedRequests: attempted,
          receivedResponses: 0,
        },
      } satisfies Run);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}

export function analyzerFromEnv(media: MediaStore): Analyzer | undefined {
  return process.env.PACKAGECARE_ANALYZER === "local"
    ? new LocalClassifierAnalyzer(media)
    : undefined;
}
