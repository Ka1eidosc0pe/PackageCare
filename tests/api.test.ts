import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
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
    const first = await request(app)
      .post("/api/deliveries/test/reports")
      .send({ revision: saved.body.revision })
      .expect(201);
    expect(first.body.report.version).toBe(1);
    const preview = await request(app)
      .get(`/api/deliveries/test/reports/${first.body.report.id}`)
      .expect(200);
    expect(preview.text).toContain("Recipient reports no damage observed");
    const next = await service.get("test");
    const changed = await service.review("test", {
      ...next.review,
      revision: next.revision,
      notes: "Corner crushed",
      damage: "observed",
    });
    const { report } = await service.finalize("test", changed.revision);
    expect(report.version).toBe(2);
    expect(first.body.report.review.damage).toBe("none_observed");
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
  });
});
describe("Ring adapter", () => {
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
    const transport = vi
      .fn()
      .mockResolvedValue(
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
