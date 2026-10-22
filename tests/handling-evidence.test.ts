import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { BedrockRuntimeServiceException } from "@aws-sdk/client-bedrock-runtime";
import {
  HANDLING_MODEL,
  parseHandlingResponse,
  reconcileHandling,
  type HandlingResponse,
} from "../server/handling-evidence.js";
import {
  prepareHandlingPilot,
  runHandlingPilot,
} from "../scripts/lib/handling-pilot.js";
import { PROMPT_VERSION } from "../server/analysis.js";
import { BEDROCK_MODEL } from "../server/aws.js";
import type { Asset } from "../shared/domain.js";

const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const references = Array.from({ length: 16 }, (_, i) => ({
  alias: `f${i + 1}`,
  asset: { id: `asset-${i}`, kind: "frame", offsetMs: 125 + 250 * i } as Asset,
}));
function event(
  action: "release" | "placement" | "at_rest" | "unclear" = "release",
): HandlingResponse {
  const trace =
    action === "placement"
      ? [
          { frame: "f10", support: "held" },
          { frame: "f12", support: "hand_and_surface" },
          { frame: "f14", support: "surface_supported" },
        ]
      : action === "at_rest"
        ? [
            { frame: "f1", support: "surface_supported" },
            { frame: "f16", support: "surface_supported" },
          ]
        : [
            { frame: "f6", support: "held" },
            { frame: "f8", support: "airborne" },
          ];
  return {
    events: [
      {
        parcel: "White carton at right",
        action,
        continuity: "same_parcel",
        description: "Visible parcel support transition.",
        trace: trace.map((t) => ({
          ...t,
          visible: "Visible relationship to hands and surface.",
        })) as HandlingResponse["events"][number]["trace"],
        limitations: [],
      },
    ],
    limitations: [],
  };
}
describe("support-transition evidence contract", () => {
  it("requires distinct ordered witnesses, but allows unseen landing after a visible release", () => {
    const input = event();
    input.events[0].trace.push({
      frame: "f9",
      support: "occluded",
      visible: "Landing is hidden.",
    });
    const result = parseHandlingResponse(input, references, 4000);
    expect(result.analysis.assessment).toBe("possible_rough_handling");
    expect(result.analysis.observations[0]).toMatchObject({
      startMs: 1375,
      endMs: 2125,
      evidenceIds: ["asset-5", "asset-7", "asset-8"],
    });
    for (const bad of ["f99", "f6", "f2"]) {
      const invalid = event();
      invalid.events[0].trace[1].frame = bad;
      expect(() => parseHandlingResponse(invalid, references, 4000)).toThrow();
    }
  });
  it("abstains on invisible support, identity uncertainty, and rest mislabeled as placement", () => {
    const cases = [event(), event(), event("at_rest"), event("placement")];
    cases[0].events[0].trace[1].support = "occluded";
    cases[1].events[0].continuity = "uncertain";
    cases[2].events[0].action = "placement";
    cases[3].events[0].trace[1].support = "airborne";
    for (const input of cases) {
      const a = parseHandlingResponse(input, references, 4000).analysis;
      expect(a.assessment).toBe("unable_to_assess");
      expect(a.observations[0].verification).toBe("ambiguous");
      expect(a.observations[0].description).not.toBe(
        input.events[0].description,
      );
    }
    expect(
      parseHandlingResponse(event("placement"), references, 4000).analysis
        .assessment,
    ).toBe("no_concern_observed");
    expect(
      parseHandlingResponse(event("at_rest"), references, 4000).analysis
        .assessment,
    ).toBe("unable_to_assess");
  });
  it("treats a valid empty answer as abstention and preserves disagreement rather than false clearance", () => {
    expect(
      parseHandlingResponse(
        { events: [], limitations: ["No handling visible."] },
        references,
        4000,
      ).analysis.assessment,
    ).toBe("unable_to_assess");
    expect(() =>
      parseHandlingResponse({ events: [], limitations: [] }, references, 4000),
    ).toThrow();
    const release = parseHandlingResponse(event(), references, 4000).analysis;
    const placement = parseHandlingResponse(
      event("placement"),
      references,
      4000,
    ).analysis;
    const reconciled = reconcileHandling(
      release,
      placement,
      references.map((r) => r.asset),
      4000,
    );
    expect(reconciled.assessment).toBe("unable_to_assess");
    expect(
      reconciled.observations.some(
        (o) => o.concern && o.verification === "ambiguous",
      ),
    ).toBe(true);
  });
});

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
async function dataset() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-support-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "media"));
  const cases = [];
  for (let c = 0; c < 5; c++) {
    const assets: Asset[] = [];
    const put = async (
      bytes: Buffer,
      id: string,
      kind: "video" | "frame",
      name: string,
      offsetMs?: number,
    ) => {
      const key = `${id}.${kind === "video" ? "mp4" : "jpg"}`;
      await fs.writeFile(path.join(root, "media", key), bytes);
      assets.push({
        id,
        key,
        name,
        kind,
        mime: kind === "video" ? "video/mp4" : "image/jpeg",
        bytes: bytes.length,
        sha256: hash(bytes),
        ...(offsetMs === undefined ? {} : { offsetMs }),
      });
    };
    await put(
      Buffer.from(`original-${c}`),
      `video-${c}`,
      "video",
      "original-test.mp4",
    );
    for (let f = 0; f < 16; f++)
      await put(
        await sharp({
          create: {
            width: 16,
            height: 12,
            channels: 3,
            background: { r: c * 30, g: f * 10, b: 100 },
          },
        })
          .jpeg()
          .toBuffer(),
        `frame-${c}-${f}`,
        "frame",
        `frame-${f}.jpg`,
        125 + 250 * f,
      );
    cases.push({
      item: {
        id: `case-${c}`,
        file: "secret-scoring-label.mp4",
        source: "uploaded",
        split: "development",
        expected:
          c === 0
            ? "possible_rough_handling"
            : c === 1
              ? "no_concern_observed"
              : "unable_to_assess",
        ...(c === 0 ? { actionWindow: [1300, 2300] } : {}),
      },
      sourceSha256: assets[0].sha256,
      durationMs: 4000,
      preparationMs: 0,
      assets,
    });
  }
  const baselinePath = path.join(root, "plan.json");
  await fs.writeFile(
    baselinePath,
    JSON.stringify({
      kind: "packagecare-evaluation-v1",
      strategy: "dense_frames",
      promptVersion: PROMPT_VERSION,
      region: "us-east-2",
      model: BEDROCK_MODEL,
      createdAt: "2026-10-19",
      maximumRequests: 40,
      maximumOutputTokensPerRequest: 2500,
      retries: 0,
      storage: "local",
      requestedFrameCount: 16,
      cases,
    }),
  );
  return {
    root,
    prepared: await prepareHandlingPilot(
      baselinePath,
      path.join(root, "pilot"),
    ),
  };
}
const reply = (data: unknown, more = {}) =>
  ({
    output: {
      message: { role: "assistant", content: [{ text: JSON.stringify(data) }] },
    },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    stopReason: "end_turn",
    $metadata: {},
    ...more,
  }) as any;

describe("frozen mixed-case handling pilot", () => {
  it("replays two byte-matched saved replies with extra caveats and spends only on the four untouched cases", async () => {
    const { root, prepared } = await dataset();
    const response = event();
    response.limitations = Array.from(
      { length: 6 },
      (_, i) => `Visibility caveat ${i + 1}`,
    );
    await runHandlingPilot(
      prepared.planPath,
      prepared.planSha256,
      10,
      vi.fn().mockResolvedValue(reply(response)),
    );
    const journalPath = path.join(
      path.dirname(prepared.planPath),
      "responses.jsonl",
    );
    const records = (await fs.readFile(journalPath, "utf8"))
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s));
    await fs.writeFile(
      journalPath,
      records
        .filter((r) => r.case === 0)
        .map((r) => JSON.stringify(r))
        .join("\n") + "\n",
    );
    const continued = await prepareHandlingPilot(
      path.join(root, "plan.json"),
      path.join(root, "continued"),
      prepared.planPath,
    );
    expect(continued.maximumRequests).toBe(8);
    const send = vi.fn().mockResolvedValue(reply(event("at_rest")));
    await expect(
      runHandlingPilot(continued.planPath, continued.planSha256, 10, send),
    ).rejects.toThrow("continuation request limit");
    expect(send).not.toHaveBeenCalled();
    const result = await runHandlingPilot(
      continued.planPath,
      continued.planSha256,
      8,
      send,
    );
    expect(result).toMatchObject({
      state: "complete",
      attemptedRequests: 8,
      receivedResponses: 8,
      replayedResponses: 2,
      replayedUsage: { inputTokens: 200, outputTokens: 100 },
      usage: { inputTokens: 800, outputTokens: 400 },
    });
    expect(result.cases).toHaveLength(5);
    expect(result.cases[0].passes[1].evidence.limitations).toHaveLength(6);
    expect(send).toHaveBeenCalledTimes(8);
    records.find((r) => r.type === "attempt").request.system[0].text =
      "Changed semantic task";
    await fs.writeFile(
      journalPath,
      records
        .filter((r) => r.case === 0)
        .map((r) => JSON.stringify(r))
        .join("\n") + "\n",
    );
    await expect(
      prepareHandlingPilot(
        path.join(root, "plan.json"),
        path.join(root, "altered"),
        prepared.planPath,
      ),
    ).rejects.toThrow("Saved request differs");
  });
  it("preserves actionable service validation errors locally without serializing credentials or headers", async () => {
    const { prepared } = await dataset();
    const send = vi.fn(async () => {
      throw Object.assign(
        new BedrockRuntimeServiceException({
          name: "ValidationException",
          $fault: "client",
          $metadata: {
            requestId: "request-1",
            httpStatusCode: 400,
            attempts: 1,
          },
          message:
            "Unsupported image count. Bearer private-token secretAccessKey=private-secret",
        }),
        { request: { authorization: "private-request-token" } },
      );
    });
    const result = await runHandlingPilot(
      prepared.planPath,
      prepared.planSha256,
      10,
      send,
    );
    expect(result.state).toBe("failed");
    const saved = await fs.readFile(
      path.join(path.dirname(prepared.planPath), "service-error.json"),
      "utf8",
    );
    expect(saved).toContain("Unsupported image count");
    expect(saved).toContain("request-1");
    expect(saved).not.toContain("private-");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("preserves all frames on both passes, excludes annotations, continues semantic misses, and refuses replay", async () => {
    const { prepared } = await dataset();
    const plan = JSON.parse(await fs.readFile(prepared.planPath, "utf8"));
    const send = vi
      .fn()
      .mockResolvedValue(
        reply({ events: [], limitations: ["Handling absent."] }),
      );
    const result = await runHandlingPilot(
      prepared.planPath,
      prepared.planSha256,
      10,
      send,
    );
    expect(result.state).toBe("complete");
    expect(result.cases.map((c) => c.match)).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
    expect(send).toHaveBeenCalledTimes(10);
    for (const [i, [input]] of send.mock.calls.entries()) {
      expect(input.modelId).toBe(HANDLING_MODEL);
      expect(input.outputConfig.textFormat.type).toBe("json_schema");
      expect(input.inferenceConfig.maxTokens).toBe(2500);
      expect(input.toolConfig).toBeUndefined();
      const images = input.messages[0].content.filter((c: any) => c.image);
      expect(images).toHaveLength(3);
      expect(images.map((c: any) => hash(c.image.source.bytes))).toEqual(
        plan.sheets[Math.floor(i / 2)].map((s: any) => s.sha256),
      );
      const panels = plan.sheets[Math.floor(i / 2)].flatMap(
        (s: any) => s.panels,
      );
      expect(panels.map((p: any) => p.id)).toEqual(
        plan.baseline.cases[Math.floor(i / 2)].assets
          .filter((a: any) => a.kind === "frame")
          .map((a: any) => a.id),
      );
      expect(panels.every((p: any) => p.width === 16 && p.height === 12)).toBe(
        true,
      );
      for (const panel of panels)
        expect(JSON.stringify(input.messages)).toContain(
          `${panel.alias}: ${panel.offsetMs} ms`,
        );
      const text = JSON.stringify(input);
      expect(text).not.toContain("secret-scoring-label");
      expect(text).not.toContain("actionWindow");
      expect(text).not.toContain('"expected"');
    }
    const journal = await fs.readFile(
      path.join(path.dirname(prepared.planPath), "responses.jsonl"),
      "utf8",
    );
    expect(journal).toContain("sha256");
    expect(journal).not.toContain('"type":"Buffer"');
    await expect(
      runHandlingPilot(prepared.planPath, prepared.planSha256, 10, send),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(send).toHaveBeenCalledTimes(10);
  });
  it("preflights the last case and binds the approved plan before any call", async () => {
    const { prepared } = await dataset();
    const original = await fs.readFile(prepared.planPath);
    const plan = JSON.parse(original.toString());
    const send = vi.fn();
    await expect(
      runHandlingPilot(prepared.planPath, prepared.planSha256, 9, send),
    ).rejects.toThrow("digest/request");
    await fs.writeFile(
      prepared.planPath,
      JSON.stringify({ ...plan, maximumRequests: 12 }),
    );
    await expect(
      runHandlingPilot(prepared.planPath, prepared.planSha256, 10, send),
    ).rejects.toThrow("digest/request");
    await fs.writeFile(prepared.planPath, original);
    const last = plan.baseline.cases[4].assets.at(-1);
    await fs.writeFile(
      path.join(path.dirname(prepared.planPath), "media", last.key),
      "tampered",
    );
    await expect(
      runHandlingPilot(prepared.planPath, prepared.planSha256, 10, send),
    ).rejects.toThrow("evidence changed");
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["citation", "truncated", "usage", "transport"])(
    "stops all remaining cases on %s failure and preserves completed evidence/receipts",
    async (kind) => {
      const { prepared } = await dataset();
      const invalid = event();
      invalid.events[0].trace[1].frame = "f99";
      let calls = 0;
      const send = vi.fn(async () => {
        if (++calls === 1) return reply(event());
        if (kind === "transport")
          throw Object.assign(new Error("private transport text"), {
            name: "ServiceUnavailableException",
          });
        return kind === "citation"
          ? reply(invalid)
          : kind === "truncated"
            ? reply(event(), { stopReason: "max_tokens" })
            : reply(event(), { usage: undefined });
      });
      const result = await runHandlingPilot(
        prepared.planPath,
        prepared.planSha256,
        10,
        send,
      );
      expect(result.state).toBe("failed");
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0].passes).toHaveLength(1);
      expect(result.cases[0].analysis).toBeUndefined();
      expect(send).toHaveBeenCalledTimes(2);
      expect(result.usage.inputTokens).toBe(
        ["citation", "truncated"].includes(kind) ? 200 : 100,
      );
      const journal = await fs.readFile(
        path.join(path.dirname(prepared.planPath), "responses.jsonl"),
        "utf8",
      );
      expect(journal).not.toContain("private transport text");
      if (kind === "citation") expect(journal).toContain("f99");
      expect(journal).toContain('"type":"failure"');
    },
  );
  it("uses frozen bytes even when later-case files change during dispatch, and scores the airborne frame", async () => {
    const { prepared } = await dataset();
    const scope = JSON.parse(await fs.readFile(prepared.planPath, "utf8"));
    const last = scope.baseline.cases[4].assets.at(-1);
    let calls = 0;
    const send = vi.fn(async (input: any) => {
      if (++calls === 1)
        await fs.writeFile(
          path.join(path.dirname(prepared.planPath), "media", last.key),
          "changed",
        );
      if (calls >= 9)
        expect(
          hash(
            input.messages[0].content.filter((c: any) => c.image).at(-1).image
              .source.bytes,
          ),
        ).toBe(scope.sheets[4].at(-1).sha256);
      return reply(
        event(calls <= 2 ? "release" : calls <= 4 ? "placement" : "at_rest"),
      );
    });
    const result = await runHandlingPilot(
      prepared.planPath,
      prepared.planSha256,
      10,
      send,
    );
    expect(result.state).toBe("complete");
    expect(result.cases.every((c) => c.match)).toBe(true);
    expect(result.cases[0].releaseWitnessInActionWindow).toBe(true);
  });
});
