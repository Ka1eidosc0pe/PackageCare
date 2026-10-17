import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { LocalStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { PackageCare } from "../server/service.js";
import { createApp } from "../server/app.js";
import { RingClient, verifySignature } from "../server/ring.js";
import { analysis, delivery } from "./fixtures.js";

let root: string, service: PackageCare;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-test-"));
  service = new PackageCare(new LocalStore(root), new MediaStore(root));
  delete process.env.PACKAGECARE_PASSWORD;
  delete process.env.PACKAGECARE_STATE_MACHINE;
  process.env.RING_HMAC_KEY = "test-signing-key";
  process.env.RING_ACCOUNT_ID = "account";
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  delete process.env.PACKAGECARE_PASSWORD;
});
describe("durability and concurrency", () => {
  it("serializes concurrent review updates and rejects the stale writer", async () => {
    await service.store.change("test", () => delivery());
    const current = await service.get("test");
    const input = {
      ...current.review,
      revision: current.revision,
      notes: "First edit",
    };
    const results = await Promise.allSettled([
      service.review("test", input),
      service.review("test", { ...input, notes: "Second edit" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const restarted = new LocalStore(root);
    expect((await restarted.get("test"))?.review.notes).toBe("First edit");
  });
  it("verifies original webhook bytes, account ownership, and deduplicates accepted events", async () => {
    const app = createApp(service);
    vi.spyOn(service, "dispatch").mockResolvedValue();
    const event = {
      meta: {
        account_id: "account",
        request_id: "req1",
        time: "2026-10-16T12:00:00Z",
      },
      data: {
        id: "event1",
        type: "motion_detected",
        attributes: { source: "camera", timestamp: Date.now() },
      },
    };
    const raw = JSON.stringify(event),
      sig = `sha256=${createHmac("sha256", "test-signing-key").update(raw).digest("hex")}`;
    expect(
      verifySignature(Buffer.from(raw + " "), sig, "test-signing-key"),
    ).toBe(false);
    await request(app)
      .post("/api/webhooks/ring")
      .set("Content-Type", "application/json")
      .send(raw)
      .expect(401);
    for (let i = 0; i < 2; i++)
      await request(app)
        .post("/api/webhooks/ring")
        .set("Content-Type", "application/json")
        .set("X-Signature", sig)
        .send(raw)
        .expect(202);
    expect(await service.store.list()).toHaveLength(1);
    expect((await service.store.list())[0].revision).toBe(0);
    expect(service.dispatch).toHaveBeenCalledTimes(1);
    process.env.RING_ACCOUNT_ID = "different";
    await request(app)
      .post("/api/webhooks/ring")
      .set("Content-Type", "application/json")
      .set("X-Signature", sig)
      .send(raw)
      .expect(403);
  });
});
describe("review/report interaction", () => {
  it("persists a reviewed case, freezes v1, and creates v2 only after recipient changes", async () => {
    await service.store.change("test", () => delivery());
    const app = createApp(service),
      d = await service.get("test");
    await request(app)
      .post("/api/deliveries/test/reports")
      .send({ revision: d.revision })
      .expect(409);
    const saved = await request(app)
      .put("/api/deliveries/test/review")
      .send({
        ...d.review,
        revision: d.revision,
        complete: true,
        damage: "none_observed",
        decisions: { o1: { decision: "confirmed", statement: "" } },
      })
      .expect(200);
    expect(saved.body.review.damage).toBe("none_observed");
    const previewBeforeFinalizing = await request(app)
      .get("/api/deliveries/test/preview")
      .expect(200);
    const authorization = previewBeforeFinalizing.text.match(
      /name="packagecare-preview" content="([^"]+)"/,
    )![1];
    await request(app)
      .post("/api/deliveries/test/reports")
      .send({ revision: saved.body.revision })
      .expect(409);
    const first = await request(app)
      .post("/api/deliveries/test/reports")
      .send({
        revision: saved.body.revision,
        previewAuthorization: authorization,
      })
      .expect(201);
    expect(first.body.report.version).toBe(1);
    const repeated = await request(app)
      .post("/api/deliveries/test/reports")
      .send({
        revision: saved.body.revision,
        previewAuthorization: authorization,
      })
      .expect(201);
    expect(repeated.body.report.id).toBe(first.body.report.id);
    expect(repeated.body.delivery.revision).toBe(first.body.delivery.revision);
    const preview = await request(app)
      .get(`/api/deliveries/test/reports/${first.body.report.id}`)
      .expect(200);
    expect(preview.text).toContain("Recipient reports no damage observed");
    expect(preview.text).not.toContain('name="packagecare-preview"');
    expect(preview.text).not.toContain(authorization);
    const next = await service.get("test");
    const changed = await service.review("test", {
      ...next.review,
      revision: next.revision,
      notes: "Corner crushed",
      damage: "observed",
    });
    await request(app)
      .post("/api/deliveries/test/reports")
      .send({
        revision: saved.body.revision,
        previewAuthorization: authorization,
      })
      .expect(409);
    const secondPreview = await request(app)
      .get("/api/deliveries/test/preview")
      .expect(200);
    const nextAuthorization = secondPreview.text.match(
      /name="packagecare-preview" content="([^"]+)"/,
    )![1];
    const finalized = await request(app)
      .post("/api/deliveries/test/reports")
      .send({
        revision: changed.revision,
        previewAuthorization: nextAuthorization,
      })
      .expect(201);
    const report = finalized.body.report;
    expect(report.version).toBe(2);
    expect(first.body.report.review.damage).toBe("none_observed");
  });
  it("rejects tampered, cross-delivery and expired preview receipts without creating reports", async () => {
    const d = delivery();
    d.review.complete = true;
    await service.store.change("test", () => d);
    await service.store.change("other", () => ({ ...d, id: "other" }));
    const app = createApp(service),
      preview = await request(app)
        .get("/api/deliveries/test/preview")
        .expect(200);
    const authorization = preview.text.match(
      /name="packagecare-preview" content="([^"]+)"/,
    )![1];
    await request(app)
      .post("/api/deliveries/test/reports")
      .send({ revision: 0, previewAuthorization: `x${authorization}` })
      .expect(409);
    await request(app)
      .post("/api/deliveries/other/reports")
      .send({ revision: 0, previewAuthorization: authorization })
      .expect(409);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 601000);
    try {
      await request(app)
        .post("/api/deliveries/test/reports")
        .send({ revision: 0, previewAuthorization: authorization })
        .expect(409);
    } finally {
      clock.mockRestore();
    }
    expect((await service.get("test")).reports).toHaveLength(0);
    expect((await service.get("other")).reports).toHaveLength(0);
  });
  it("rejects foreign-origin mutations, anonymous remote access, and password bypass", async () => {
    let app = createApp(service);
    await request(app)
      .get("/api/deliveries")
      .set("Host", "attacker.example")
      .expect(403);
    await request(app)
      .post("/api/samples")
      .set("Origin", "https://attacker.example")
      .expect(403);
    process.env.PACKAGECARE_PASSWORD = "long-secret";
    app = createApp(service);
    await request(app).get("/api/deliveries").expect(401);
    await request(app)
      .post("/api/session")
      .send({ password: "wrong" })
      .expect(401);
    const agent = request.agent(app);
    await agent
      .post("/api/session")
      .send({ password: "long-secret" })
      .expect(200);
    await agent.get("/api/deliveries").expect(200);
    await agent.post("/api/logout").expect(204);
    await agent.get("/api/deliveries").expect(401);
  });
});
describe("Ring adapter", () => {
  it("surfaces an expired Ring token as a connection error without logging the workspace out", async () => {
    const ring = new RingClient(
      "expired",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })) as any,
    );
    service.ring = ring;
    const result = await request(createApp(service))
      .get("/api/ring/devices")
      .expect(502);
    expect(result.body.error).toContain("Reconnect");
    expect(ring.token).toBe("");
  });
  it("does not leak tokens across media redirects and preserves actual recording time", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 303,
          headers: {
            Location:
              "https://example.s3.amazonaws.com/clip?signature=redacted",
            "X-Media-Timestamp": "1700000000000",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        }),
      );
    const ring = new RingClient("secret", transport as any),
      clip = await ring.clip("device", 1700000000000, 12000, "2");
    expect(clip.observedAt).toBe("2023-11-14T22:13:20.000Z");
    expect(JSON.parse(transport.mock.calls[0][1].body).components).toEqual([
      { component_id: "2" },
    ]);
    expect(transport.mock.calls[1][1].headers).toBeUndefined();
  });
  it("refuses redirects to an arbitrary host", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 303,
        headers: { Location: "http://127.0.0.1/secrets" },
      }),
    );
    await expect(
      new RingClient("secret", transport as any).clip("device", 1, 1000),
    ).rejects.toThrow("redirect");
  });
});
describe("recipient photos and portable exports", () => {
  it("decodes photos, preserves review provenance, exports all files, and rejects spoofed image input", async () => {
    const source = await service.media.put(
      Buffer.from("source video bytes"),
      "original.mp4",
      "video/mp4",
      "video",
    );
    const d = delivery();
    d.assets = [source];
    d.analysis!.observations[0].evidenceIds = [source.id];
    await service.store.change(d.id, () => d);
    const app = createApp(service);
    await request(app)
      .post("/api/deliveries/test/photos")
      .attach("file", Buffer.from("<svg>untrusted</svg>"), "fake.jpg")
      .expect(400);
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#d8cfb6" },
    })
      .png()
      .toBuffer();
    const uploaded = await request(app)
      .post("/api/deliveries/test/photos")
      .attach("file", image, "damage.png")
      .expect(201);
    expect(
      uploaded.body.assets.filter((a: any) => a.kind === "damage"),
    ).toHaveLength(1);
    expect(uploaded.body.review.complete).toBe(false);
    const current = await service.get("test"),
      saved = await service.review("test", {
        ...current.review,
        revision: current.revision,
        complete: true,
        damage: "observed",
        decisions: { o1: { decision: "confirmed", statement: "" } },
      });
    const { report } = await service.finalize("test", saved.revision);
    const exported = await request(app)
      .get(`/api/deliveries/test/reports/${report.id}/download`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const archive = path.join(root, "export.zip");
    await fs.writeFile(archive, exported.body);
    const run = promisify(execFile),
      html = (await run("unzip", ["-p", archive, "report.html"])).stdout;
    const manifest = JSON.parse(
      (await run("unzip", ["-p", archive, "manifest.json"])).stdout,
    );
    expect(manifest.review.damage).toBe("observed");
    expect(html).toContain("Recipient reports damage observed");
    for (const asset of manifest.assets) {
      const entry = `evidence/${asset.id}.${asset.key.split(".").pop()}`;
      const { stdout } = await run("unzip", ["-l", archive, entry]);
      expect(stdout).toContain(entry);
      expect(html).toContain(entry);
    }
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("amazonaws.com");
  });
});
