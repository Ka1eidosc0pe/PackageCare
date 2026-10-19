import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RingClient } from "../server/ring.js";
import { RingLive } from "../server/ring-live.js";
import { PackageCare } from "../server/service.js";
import { LocalStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { createApp } from "../server/app.js";
import { snapshot, renderReport } from "../server/reports.js";
import { delivery } from "./fixtures.js";

function connected() {
  const transport = vi.fn(async (url: any, options: any) => {
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    if (String(url).endsWith("devices?include=status,capabilities"))
      return Response.json({ data: [{ id: "camera" }] });
    if (String(url).endsWith("capabilities"))
      return Response.json({
        data: {
          attributes: { components: { items: [{ component_id: "2" }] } },
        },
      });
    return new Response("v=0\r\ns=Ring\r\n", {
      status: 201,
      headers: {
        Location:
          "https://api.amazonvision.com/v1/devices/camera/media/streaming/whep/sessions/stream1",
      },
    });
  });
  return {
    ring: new RingClient("test-token-not-real", transport as typeof fetch),
    transport,
  };
}
describe("Ring live view and capture", () => {
  it("binds the session to an authorized camera/component, proxies SDP, and rejects forged close targets", async () => {
    const { ring, transport } = connected(),
      live = new RingLive(ring, "test-secret");
    await expect(
      live.start("foreign", "v=0\r\ns=offer\r\n", "2"),
    ).rejects.toThrow("connected");
    await expect(live.start("camera", "v=0\r\ns=offer\r\n")).rejects.toThrow(
      "component",
    );
    const result = await live.start("camera", "v=0\r\ns=offer\r\n", "2");
    expect(result).not.toHaveProperty("token");
    expect(JSON.stringify(result)).not.toContain(ring.token);
    expect(transport.mock.calls.at(-1)?.[0]).toContain("?component_id=2");
    expect(transport.mock.calls.at(-1)?.[1]).toMatchObject({
      body: "v=0\r\ns=offer\r\n",
      headers: { "Content-Type": "application/sdp" },
      redirect: "manual",
    });
    await expect(live.close(`x${result.ticket}`)).rejects.toThrow("Invalid");
    await live.close(result.ticket);
    expect(transport.mock.calls.at(-1)?.[1].method).toBe("DELETE");
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 301000);
    try {
      await expect(live.close(result.ticket)).rejects.toThrow("expired");
    } finally {
      clock.mockRestore();
    }
  });
  it("never forwards credentials to an untrusted WHEP Location", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response("v=0\r\n", {
        status: 201,
        headers: { Location: "https://attacker.example/session" },
      }),
    );
    await expect(
      new RingClient("secret", transport as any).startLive(
        "camera",
        "v=0\r\ns=offer\r\n",
      ),
    ).rejects.toThrow("location");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("treats Ring's session location as opaque while keeping its URL out of the browser ticket", async () => {
    const { ring, transport } = connected();
    const sessionUrl =
      "https://api.amazonvision.com/v1/devices/camera/media/streaming/whep/sessions/resource:opaque/?route=example";
    transport.mockImplementation(
      async () =>
        new Response("v=0\r\ns=Ring\r\n", {
          status: 201,
          headers: { Location: sessionUrl },
        }),
    );
    const started = await ring.startLive("camera", "v=0\r\ns=offer\r\n");
    expect(started.sessionUrl).toBe(sessionUrl);
    vi.spyOn(ring, "devices").mockResolvedValue([{ id: "camera" }]);
    vi.spyOn(ring, "capabilities").mockResolvedValue({});
    const live = new RingLive(ring, "test-secret"),
      result = await live.start("camera", "v=0\r\ns=offer\r\n");
    expect(result.ticket).not.toContain("example");
    expect(live.read(result.ticket).sessionUrl).toBe(sessionUrl);
    await expect(
      new RingLive(ring, "other-workspace").close(result.ticket),
    ).rejects.toThrow("Invalid");
  });
  it("saves a capture once with explicit browser provenance, survives restart, and defers all analysis until requested", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-live-"));
    try {
      const { ring } = connected(),
        service = new PackageCare(
          new LocalStore(root),
          new MediaStore(root),
          ring,
        ),
        dispatch = vi.spyOn(service, "dispatch").mockResolvedValue(),
        app = createApp(service);
      const session = await request(app)
        .post("/api/ring/live")
        .send({
          deviceId: "camera",
          componentId: "2",
          offer: "v=0\r\ns=offer\r\n",
        })
        .expect(201);
      await request(app)
        .post("/api/ring/live/capture")
        .field("ticket", "forged")
        .attach("file", Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), "live.webm")
        .expect(409);
      const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2]);
      const save = () =>
        request(app)
          .post("/api/ring/live/capture")
          .field("ticket", session.body.ticket)
          .attach("file", bytes, "live.webm");
      const [a, b] = await Promise.all([
        save().expect(201),
        save().expect(201),
      ]);
      expect(a.body.id).toBe(b.body.id);
      expect(a.body.state).toBe("awaiting_analysis");
      expect(a.body.capture.method).toBe("browser_recording");
      expect(a.body.source).toBe("ring_simulator");
      expect(dispatch).not.toHaveBeenCalled();
      expect(await fs.readdir(path.join(root, "media"))).toHaveLength(1);
      const persisted = await new LocalStore(root).get(a.body.id);
      expect(persisted?.state).toBe("awaiting_analysis");
      expect(await service.media.read(persisted!.assets[0])).toEqual(bytes);
      await request(app)
        .post("/api/ring/live/capture")
        .field("ticket", session.body.ticket)
        .attach(
          "file",
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 9]),
          "changed.webm",
        )
        .expect(409);
      const ready = { ...delivery(), capture: persisted!.capture };
      ready.review.complete = true;
      const report = snapshot(ready);
      expect(report.delivery.capture).toEqual(persisted!.capture);
      expect(renderReport(report)).toContain(
        "not a native Ring recording download",
      );
      await request(app)
        .post(`/api/deliveries/${a.body.id}/analyze`)
        .expect(202);
      expect(dispatch).toHaveBeenCalledTimes(1);
      await request(app)
        .post(`/api/deliveries/${a.body.id}/analyze`)
        .expect(409);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
