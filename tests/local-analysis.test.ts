import { describe, it, expect, vi } from "vitest";
import {
  LocalClassifierAnalyzer,
  LOCAL_LIMITATIONS,
  type InferOutput,
} from "../server/local-analysis.js";
import { failedAnalysisRun } from "../server/analysis.js";
import { MediaStore } from "../server/media.js";
import { validateAnalysis, type Asset } from "../shared/domain.js";
import { delivery } from "./fixtures.js";

const frame = (i: number, offsetMs: number): Asset => ({
  id: `f${i}`,
  key: `f${i}.jpg`,
  name: `frame-${offsetMs}ms.jpg`,
  kind: "frame",
  mime: "image/jpeg",
  bytes: 5,
  sha256: "b".repeat(64),
  offsetMs,
});
function setup(out: Partial<InferOutput> | Error | string, durationMs = 6000) {
  const media = new MediaStore("/tmp/not-used");
  vi.spyOn(media, "read").mockResolvedValue(Buffer.from("video-bytes"));
  const d = delivery();
  d.source = "uploaded";
  d.durationMs = durationMs;
  d.analysis = undefined;
  d.assets = [
    { ...d.assets[0], id: "orig", name: "original-x.mp4" },
    { ...d.assets[0], id: "play", name: "playback-x.mp4" },
    ...[250, 750, 1250, 1750, 2250, 2750, 3250, 3750, 4250, 4750, 5250, 5750]
      .filter((o) => o < durationMs)
      .map((o, i) => frame(i, o)),
  ];
  const exec = vi.fn(async (_file: string, args: string[]) => {
    if (out instanceof Error) throw out;
    return {
      stdout:
        typeof out === "string"
          ? out
          : `${JSON.stringify({
              classes: ["none", "placement", "rough"],
              duration_ms: durationMs,
              model_id: "classifier-abc123",
              seconds: 3.2,
              ...out,
            })}\n`,
      stderr: "",
      args,
    };
  });
  const analyzer = new LocalClassifierAnalyzer(media, {
    python: "/fake/python",
    classifier: "/fake/classifier.joblib",
    exec,
  });
  return { d, analyzer, exec, media };
}
const win = (start: number, rough: number, placement: number) => ({
  start_ms: start,
  end_ms: start + 2000,
  probs: { rough, placement, none: Math.max(0, 1 - rough - placement) },
});

describe("local classifier analyzer", () => {
  it("maps a confident rough clip to a supported concern at the peak window", async () => {
    const { d, analyzer, exec } = setup({
      clip_probs: { rough: 0.86, placement: 0.1, none: 0.04 },
      windows: [win(0, 0.2, 0.5), win(1500, 0.91, 0.05), win(3000, 0.4, 0.3)],
    });
    const { analysis, run } = await analyzer.analyze(d, "observe");
    expect(exec.mock.calls[0][0]).toBe("/fake/python");
    expect(exec.mock.calls[0][1]).toContain("/fake/classifier.joblib");
    expect(analysis.assessment).toBe("possible_rough_handling");
    const [o] = analysis.observations;
    expect(o).toMatchObject({
      label: "possible_airborne_release",
      concern: true,
      verification: "supported",
      startMs: 1500,
      endMs: 3500,
    });
    expect(o.description).toMatch(/tossed or dropped/);
    expect(o.description).not.toMatch(/driver|courier|damage|intent/i);
    const frames = d.assets.filter((a) => o.evidenceIds.includes(a.id));
    expect(frames.length).toBe(4);
    for (const f of frames)
      expect(f.offsetMs! >= 1500 && f.offsetMs! <= 3500).toBe(true);
    expect(analysis.limitations).toEqual(LOCAL_LIMITATIONS);
    expect(analysis.limitations.join(" ")).toMatch(/synthetic/);
    expect(analysis.limitations.join(" ")).toMatch(/not calibrated/);
    expect(() =>
      validateAnalysis(structuredClone(analysis), d.assets, d.durationMs),
    ).not.toThrow();
    expect(run).toMatchObject({
      provider: "local_classifier",
      inputAssetIds: ["play"],
      proposal: analysis,
    });
    expect(run.model).toContain("classifier-abc123");
    expect((run.raw as any).clip_probs.rough).toBe(0.86);
    expect(run.usage?.windows).toBe(3);
  });

  it("marks a rough clip with a weaker peak as ambiguous, so the result is unable to assess", async () => {
    const { d, analyzer } = setup({
      clip_probs: { rough: 0.65, placement: 0.2, none: 0.15 },
      windows: [win(0, 0.7, 0.2)],
    });
    const { analysis } = await analyzer.analyze(d, "observe");
    expect(analysis.observations[0].verification).toBe("ambiguous");
    expect(analysis.assessment).toBe("unable_to_assess");
  });

  it("maps a confident placement to no concern observed", async () => {
    const { d, analyzer } = setup({
      clip_probs: { rough: 0.1, placement: 0.82, none: 0.08 },
      windows: [win(0, 0.1, 0.6), win(2000, 0.05, 0.88)],
    });
    const { analysis } = await analyzer.analyze(d, "observe");
    expect(analysis.observations[0]).toMatchObject({
      label: "controlled_placement",
      concern: false,
      verification: "supported",
      startMs: 2000,
      endMs: 4000,
    });
    expect(analysis.assessment).toBe("no_concern_observed");
  });

  it("does not report placement when rough motion is also scored", async () => {
    const { d, analyzer } = setup({
      clip_probs: { rough: 0.35, placement: 0.62, none: 0.03 },
      windows: [win(0, 0.35, 0.62)],
    });
    const { analysis } = await analyzer.analyze(d, "observe");
    expect(analysis.observations[0].label).toBe("visibility_insufficient");
    expect(analysis.assessment).toBe("unable_to_assess");
  });

  it("maps an inconclusive clip to visibility_insufficient over the whole clip", async () => {
    const { d, analyzer } = setup({
      clip_probs: { rough: 0.2, placement: 0.3, none: 0.5 },
      windows: [win(0, 0.2, 0.3), win(4000, 0.2, 0.3)],
    });
    const { analysis } = await analyzer.analyze(d, "observe");
    const [o] = analysis.observations;
    expect(o).toMatchObject({
      label: "visibility_insufficient",
      startMs: 0,
      endMs: 6000,
      concern: false,
    });
    expect(o.evidenceIds.length).toBeLessThanOrEqual(10);
    expect(analysis.assessment).toBe("unable_to_assess");
  });

  it("clamps windows that overrun the delivery duration and falls back to the video id", async () => {
    const { d, analyzer } = setup(
      {
        clip_probs: { rough: 0.9, placement: 0.05, none: 0.05 },
        windows: [win(1000, 0.95, 0.02)],
      },
      1200,
    );
    // Only frames at 250/750 ms exist; none fall inside [1000, 1200].
    const { analysis } = await analyzer.analyze(d, "observe");
    const [o] = analysis.observations;
    expect(o.startMs).toBe(1000);
    expect(o.endMs).toBe(1200);
    expect(o.evidenceIds).toEqual(["play"]);
  });

  it("verify passes the observe result through without running a second model", async () => {
    const { d, analyzer, exec } = setup({
      clip_probs: { rough: 0.86, placement: 0.1, none: 0.04 },
      windows: [win(1500, 0.91, 0.05)],
    });
    const observed = await analyzer.analyze(d, "observe");
    d.runs.push(observed.run);
    const { analysis, run } = await analyzer.analyze(
      d,
      "verify",
      observed.analysis,
    );
    expect(exec).toHaveBeenCalledTimes(1);
    expect(analysis).toEqual(observed.analysis);
    expect(run.provider).toBe("local_classifier");
    expect(run.verification).toEqual(analysis);
    expect(run.model).toBe(observed.run.model);
  });

  it("surfaces subprocess failure as an error without an assessment", async () => {
    const { d, analyzer } = setup(new Error("python exited 1"));
    const error = await analyzer.analyze(d, "observe").catch((e) => e);
    expect(error.name).toBe("LocalClassifierError");
    expect(error.message).toMatch(/No assessment was saved/);
    const failed = failedAnalysisRun(error);
    expect(failed?.provider).toBe("local_classifier");
    expect(failed?.failure?.stage).toBe("processing");
    expect(failed?.proposal).toBeUndefined();
  });

  it("rejects unreadable classifier output", async () => {
    const { d, analyzer } = setup("model loaded\nnot json\n");
    await expect(analyzer.analyze(d, "observe")).rejects.toThrow(
      /unreadable output/,
    );
  });
});
