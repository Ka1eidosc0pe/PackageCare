import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import {
  type Delivery,
  type Asset,
  type Review,
  emptyReview,
  validateReview,
  validateAnalysis,
} from "../shared/domain.js";
import type { Store } from "./store.js";
import { MediaStore, prepareVideo, imageMime, videoMime } from "./media.js";
import { RingClient, RingError } from "./ring.js";
import { BedrockAnalyzer, fixtureAnalysis, type Analyzer } from "./analysis.js";
import { snapshot } from "./reports.js";

const required = (d: Delivery | undefined): Delivery => {
  if (!d)
    throw Object.assign(new Error("Delivery not found."), { status: 404 });
  return d;
};
export class PackageCare {
  running = new Set<string>();
  constructor(
    public store: Store,
    public media: MediaStore,
    public ring = new RingClient(),
    public analyzer: Analyzer = new BedrockAnalyzer(media),
  ) {}
  async get(id: string) {
    return required(await this.store.get(id));
  }
  async review(id: string, input: unknown) {
    return this.store.change(id, (current) => {
      const d = required(current);
      d.review = validateReview(d, input);
      return d;
    });
  }
  async finalize(id: string, revision: number) {
    let reportId = "";
    const d = await this.store.change(id, (current) => {
      const d = required(current);
      if (d.revision !== revision)
        throw Object.assign(
          new Error("Delivery changed. Save and preview again."),
          { status: 409 },
        );
      const report = snapshot(d);
      if (!d.reports.some((r) => r.id === report.id)) d.reports.push(report);
      reportId = report.id;
      return d;
    });
    return { delivery: d, report: d.reports.find((r) => r.id === reportId)! };
  }
  async upload(bytes: Buffer, name: string) {
    const asset = await this.media.put(
      bytes,
      `original-${name}`,
      videoMime(bytes),
      "video",
    );
    try {
      return await this.acceptUpload(asset);
    } catch (e) {
      if (!(await this.store.get(asset.id))) await this.media.remove(asset);
      throw e;
    }
  }
  async acceptUpload(asset: Asset) {
    const id = asset.id,
      now = new Date().toISOString();
    let created = false;
    const d = await this.store.change(id, (current) => {
      created = !current;
      return (
        current ?? {
          id,
          revision: 0,
          source: "uploaded",
          title: "Uploaded delivery",
          camera: "Uploaded footage",
          observedAt: now,
          createdAt: now,
          durationMs: 0,
          state: "received",
          assets: [asset],
          runs: [],
          review: emptyReview(),
          reports: [],
        }
      );
    });
    // The source exists before receipt is acknowledged. Lambda only starts a persisted workflow.
    if (created) await this.dispatch(id);
    return d;
  }
  async addPhoto(id: string, bytes: Buffer, assetId?: string) {
    const current = await this.get(id);
    if (assetId && current.assets.some((a) => a.id === assetId)) return current;
    if (current.state !== "ready")
      throw Object.assign(
        new Error("Wait for analysis before adding photos."),
        { status: 409 },
      );
    if (bytes.length > 10 * 1024 * 1024)
      throw new Error("Choose a photo under 10 MB.");
    imageMime(bytes);
    const photo = await sharp(bytes, { limitInputPixels: 25_000_000 })
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    const asset = await this.media.put(
      photo,
      "recipient-photo.jpg",
      "image/jpeg",
      "damage",
      undefined,
      assetId,
    );
    try {
      return await this.store.change(id, (c) => {
        const d = required(c);
        if (d.assets.some((a) => a.id === asset.id)) return d;
        if (d.state !== "ready")
          throw Object.assign(
            new Error("Wait for analysis before adding photos."),
            { status: 409 },
          );
        d.assets.push(asset);
        d.review.complete = false;
        return d;
      });
    } catch (e) {
      if (!(await this.store.get(id))?.assets.some((a) => a.id === asset.id))
        await this.media.remove(asset);
      throw e;
    }
  }
  async ingest(
    eventId: string,
    deviceId: string,
    timestamp: number,
    source: Delivery["source"],
    componentId?: string,
  ) {
    const id = createHash("sha256")
      .update(`${source}:${eventId}`)
      .digest("hex")
      .slice(0, 32);
    let created = false;
    const d = await this.store.change(id, (current) => {
      created = !current;
      return (
        current ?? {
          id,
          revision: 0,
          eventId,
          deviceId,
          componentId,
          source,
          title: "Front door delivery",
          camera: "Front door",
          observedAt: new Date(timestamp).toISOString(),
          createdAt: new Date().toISOString(),
          durationMs: 0,
          state: "received",
          assets: [],
          runs: [],
          review: emptyReview(),
          reports: [],
        }
      );
    });
    if (created) await this.dispatch(id);
    return d;
  }
  async dispatch(id: string) {
    if (process.env.PACKAGECARE_STATE_MACHINE) {
      try {
        await new SFNClient({}).send(
          new StartExecutionCommand({
            stateMachineArn: process.env.PACKAGECARE_STATE_MACHINE,
            name: `delivery-${id}-${randomUUID().slice(0, 8)}`,
            input: JSON.stringify({ id }),
          }),
        );
      } catch (e: any) {
        await this.fail(
          id,
          new Error(
            "Could not start the AWS workflow. Check server credentials and retry.",
          ),
        );
        throw e;
      }
    } else {
      void this.process(id);
    }
  }
  async fail(id: string, error: any) {
    console.error(
      JSON.stringify({
        event: "processing_failed",
        deliveryId: id,
        errorType: error?.name || "Error",
        ...(error instanceof RingError ? { ringStatus: error.status } : {}),
      }),
    );
    await this.store.change(id, (c) => ({
      ...required(c),
      state:
        error instanceof RingError &&
        [404, 403, 416, 425].includes(error.status)
          ? "media_unavailable"
          : "failed",
      error:
        error instanceof RingError
          ? error.message
          : "Processing failed. Check account access, media format, and server logs; then retry.",
    }));
  }
  async retrieve(id: string) {
    const d = await this.get(id);
    if (d.durationMs > 0 && d.assets.some((a) => a.kind === "video")) return;
    if (d.source === "uploaded") {
      const original = d.assets.find((a) => a.kind === "video");
      if (!original)
        throw new Error(
          "No uploaded source is available. Import the video again.",
        );
      await this.store.change(id, (c) => ({
        ...required(c),
        state: "waiting_for_media",
        error: undefined,
      }));
      const prepared = await prepareVideo(
        await this.media.read(original),
        this.media,
        original.name,
        undefined,
        original,
      );
      await this.store.change(id, (c) => ({ ...required(c), ...prepared }));
      return;
    }
    if (!d.deviceId) throw new Error("No source media is available.");
    await this.store.change(id, (c) => ({
      ...required(c),
      state: "waiting_for_media",
      error: undefined,
    }));
    const clip = await this.ring.clip(
      d.deviceId,
      Date.parse(d.observedAt),
      12000,
      d.componentId,
    );
    const prepared = await prepareVideo(
      clip.bytes,
      this.media,
      "ring-recording.mp4",
    );
    await this.store.change(id, (c) => ({
      ...required(c),
      ...prepared,
      observedAt: clip.observedAt,
    }));
  }
  async observe(id: string) {
    const d = await this.get(id);
    if (d.runs.some((r) => r.proposal && r.provider === "bedrock")) return;
    await this.store.change(id, (c) => ({
      ...required(c),
      state: "analyzing",
      error: undefined,
    }));
    const { run } = await this.analyzer.analyze(d, "observe");
    await this.store.change(id, (c) => ({
      ...required(c),
      runs: [...required(c).runs, run],
    }));
  }
  async verify(id: string) {
    const d = await this.get(id),
      proposal = [...d.runs].reverse().find((r) => r.proposal)?.proposal;
    if (d.state === "ready") return;
    if (!proposal) throw new Error("No observation pass to verify.");
    await this.store.change(id, (c) => ({
      ...required(c),
      state: "verifying",
    }));
    const { analysis, run } = await this.analyzer.analyze(
      d,
      "verify",
      proposal,
    );
    await this.store.change(id, (c) => ({
      ...required(c),
      state: "ready",
      analysis: validateAnalysis(
        analysis,
        required(c).assets,
        required(c).durationMs,
      ),
      runs: [...required(c).runs, run],
      error: undefined,
    }));
  }
  async process(id: string) {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      const d = await this.get(id);
      if (d.state === "ready") return;
      for (let attempt = 0; ; attempt++) {
        try {
          await this.retrieve(id);
          break;
        } catch (e: any) {
          if (
            !(e instanceof RingError) ||
            ![416, 425, 429, 503].includes(e.status) ||
            attempt >= 3
          )
            throw e;
          await new Promise((r) =>
            setTimeout(r, [5000, 10000, 20000][attempt]),
          );
        }
      }
      await this.observe(id);
      await this.verify(id);
    } catch (e: any) {
      await this.fail(id, e);
    } finally {
      this.running.delete(id);
    }
  }
  async retry(id: string) {
    const d = await this.get(id);
    if (!["failed", "media_unavailable"].includes(d.state))
      throw Object.assign(new Error("This delivery is not awaiting retry."), {
        status: 409,
      });
    await this.store.change(id, (c) => ({
      ...required(c),
      state: "received",
      error: undefined,
    }));
    await this.dispatch(id);
  }
  async seed() {
    const scenarios = ["drop", "normal", "ambiguous"] as const;
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i],
        id = `sample-${scenario}`;
      if (await this.store.get(id)) continue;
      const file = path.join(this.media.root, "fixtures", `${scenario}.mp4`);
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(file);
      } catch {
        throw Object.assign(
          new Error("Generate sample footage first with npm run fixtures."),
          { status: 409 },
        );
      }
      const prepared = await prepareVideo(
        bytes,
        this.media,
        `${scenario}-synthetic.mp4`,
        5,
      );
      const analysis = fixtureAnalysis(
        scenario,
        prepared.assets,
        prepared.durationMs,
      );
      const now = new Date(),
        observedAt = new Date(now.getTime() - i * 3900000).toISOString();
      await this.store.change(
        id,
        (current) =>
          current ?? {
            id,
            revision: 0,
            source: "fixture",
            fixtureScenario: scenario,
            title:
              scenario === "drop"
                ? "Doorstep release"
                : scenario === "normal"
                  ? "Careful placement"
                  : "Obscured placement",
            camera: "Sample porch",
            createdAt: observedAt,
            observedAt,
            ...prepared,
            state: "ready",
            analysis,
            runs: [
              {
                id: randomUUID(),
                provider: "scripted_fixture",
                model: "Scripted scenario (no model)",
                promptVersion: "fixture-v1",
                startedAt: observedAt,
                finishedAt: observedAt,
                inputAssetIds: prepared.assets.map((a) => a.id),
                proposal: analysis,
              },
            ],
            review: emptyReview(),
            reports: [],
          },
      );
    }
  }
}
