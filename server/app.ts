import express from "express";
import multer from "multer";
import archiver from "archiver";
import sharp from "sharp";
import path from "node:path";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { PackageCare } from "./service.js";
import { verifySignature, ringEventSchema, RingError } from "./ring.js";
import { imageMime } from "./media.js";
import { renderReport, snapshot } from "./reports.js";

export function createApp(service: PackageCare) {
  const app = express();
  app.disable("x-powered-by");
  const secret = process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
    password = process.env.PACKAGECARE_PASSWORD;
  const uploads = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  });
  const attempts = new Map<string, { count: number; at: number }>();
  const session = (expires: string) =>
    createHmac("sha256", secret).update(expires).digest("hex");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    if (!password && !["localhost", "127.0.0.1", "::1"].includes(req.hostname))
      return res.status(403).json({
        error:
          "Local mode only. Configure access control before exposing the app.",
      });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      const allowed = process.env.APP_ORIGIN
        ? [process.env.APP_ORIGIN]
        : [
            `${req.protocol}://${req.headers.host}`,
            ...(["localhost", "127.0.0.1", "::1"].includes(req.hostname)
              ? ["http://127.0.0.1:5173", "http://localhost:5173"]
              : []),
          ];
      if (!allowed.includes(req.headers.origin))
        return res
          .status(403)
          .json({ error: "Cross-origin writes are not allowed." });
    }
    next();
  });
  app.post(
    "/api/webhooks/ring",
    express.raw({ type: "application/json", limit: "100kb" }),
    async (req, res, next) => {
      try {
        if (
          !verifySignature(
            req.body,
            req.header("x-signature"),
            process.env.RING_HMAC_KEY || "",
          )
        )
          return res.status(401).json({ error: "Invalid Ring signature." });
        const event = ringEventSchema.parse(
          JSON.parse(req.body.toString("utf8")),
        );
        if (
          !process.env.RING_ACCOUNT_ID ||
          event.meta.account_id !== process.env.RING_ACCOUNT_ID
        )
          return res
            .status(403)
            .json({ error: "Ring account does not match this workspace." });
        if (!["motion_detected", "button_press"].includes(event.data.type))
          return res.json({ ignored: true });
        const a = event.data.attributes;
        const d = await service.ingest(
          event.data.id,
          a.source,
          a.timestamp,
          process.env.RING_SOURCE_TYPE === "ring_device"
            ? "ring_device"
            : "ring_simulator",
          a.component_ids?.[0],
        );
        res.status(202).json({ id: d.id });
      } catch (e) {
        next(e);
      }
    },
  );
  app.use(express.json({ limit: "100kb" }));
  app.get("/api/session", (_req, res) => res.json({ required: !!password }));
  app.post("/api/session", (req, res) => {
    const key = req.ip || "local",
      now = Date.now(),
      old = attempts.get(key),
      limit = old && now - old.at < 60000 ? old : { count: 0, at: now };
    if (++limit.count > 10)
      return res
        .status(429)
        .json({ error: "Too many attempts. Wait one minute." });
    attempts.set(key, limit);
    const supplied = createHash("sha256")
        .update(typeof req.body?.password === "string" ? req.body.password : "")
        .digest(),
      expected = createHash("sha256")
        .update(password || "")
        .digest();
    if (password && !timingSafeEqual(supplied, expected))
      return res.status(401).json({ error: "Incorrect workspace password." });
    const exp = String(Date.now() + 8 * 3600000);
    res.setHeader(
      "Set-Cookie",
      `pc_session=${exp}.${session(exp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.APP_ORIGIN?.startsWith("https:") ? "; Secure" : ""}`,
    );
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    if (!password) return next();
    const token = req.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("pc_session="))
        ?.slice(11),
      [exp, sig] = token?.split(".") || [];
    if (
      !exp ||
      !sig ||
      !/^\d+$/.test(exp) ||
      Number(exp) < Date.now() ||
      !/^[a-f0-9]{64}$/.test(sig) ||
      !timingSafeEqual(
        Buffer.from(sig, "hex"),
        Buffer.from(session(exp), "hex"),
      )
    )
      return res.status(401).json({ error: "Sign in to your workspace." });
    next();
  });
  app.get("/api/status", async (_req, res) => {
    const records = await service.store.list();
    res.json({
      ring: {
        connected: !!service.ring.token,
        source: process.env.RING_SOURCE_TYPE || "ring_simulator",
      },
      analysis: {
        provider: "bedrock",
        model: process.env.BEDROCK_MODEL_ID || "us.amazon.nova-2-lite-v1:0",
        verified: records.some((d) =>
          d.runs.some((r) => r.provider === "bedrock" && r.finishedAt),
        ),
      },
      storage: process.env.PACKAGECARE_BUCKET ? "AWS" : "local",
      workflow: process.env.PACKAGECARE_STATE_MACHINE
        ? "Step Functions"
        : "local worker",
      fixtureAvailable: !process.env.AWS_LAMBDA_FUNCTION_NAME,
      sessionRequired: !!password,
      retentionDays: Number(process.env.RETENTION_DAYS || 30),
    });
  });
  app.get("/api/deliveries", async (_req, res) =>
    res.json(await service.store.list()),
  );
  app.post("/api/logout", (_req, res) => {
    res.setHeader(
      "Set-Cookie",
      "pc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.status(204).end();
  });
  app.get("/api/deliveries/:id", async (req, res) =>
    res.json(await service.get(String(req.params.id))),
  );
  app.post("/api/samples", async (_req, res) => {
    await service.seed();
    res.status(201).json({ ok: true });
  });
  app.post("/api/uploads", uploads.single("file"), async (req, res) => {
    if (!req.file) throw new Error("Choose a video file.");
    const d = await service.upload(
      req.file.buffer,
      req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"),
    );
    res.status(202).json(d);
  });
  app.put("/api/deliveries/:id/review", async (req, res) =>
    res.json(await service.review(String(req.params.id), req.body)),
  );
  app.post("/api/deliveries/:id/retry", async (req, res) => {
    await service.retry(String(req.params.id));
    res.status(202).json({ ok: true });
  });
  app.post(
    "/api/deliveries/:id/photos",
    uploads.single("file"),
    async (req, res) => {
      if (!req.file || req.file.size > 10 * 1024 * 1024)
        throw new Error("Choose a photo under 10 MB.");
      imageMime(req.file.buffer);
      const photo = await sharp(req.file.buffer, {
        limitInputPixels: 25_000_000,
      })
        .rotate()
        .resize({
          width: 2000,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 90 })
        .toBuffer();
      const id = String(req.params.id);
      await service.get(id);
      const asset = await service.media.put(
        photo,
        "recipient-photo.jpg",
        "image/jpeg",
        "damage",
      );
      const d = await service.store.change(id, (c) => {
        if (!c) throw new Error("Delivery not found.");
        c.assets.push(asset);
        c.review.complete = false;
        return c;
      });
      res.status(201).json(d);
    },
  );
  app.get("/api/deliveries/:id/assets/:asset", async (req, res) => {
    const d = await service.get(String(req.params.id)),
      a = d.assets.find((a) => a.id === req.params.asset);
    if (!a) return res.status(404).json({ error: "Evidence not found." });
    const url = await service.media.url(a);
    if (url) return res.redirect(url);
    res.type(a.mime);
    res.sendFile(path.resolve(service.media.local(a.key)));
  });
  app.post("/api/deliveries/:id/reports", async (req, res) => {
    const { revision } = z
      .object({ revision: z.number().int() })
      .parse(req.body);
    res
      .status(201)
      .json(await service.finalize(String(req.params.id), revision));
  });
  app.get("/api/deliveries/:id/preview", async (req, res) =>
    res
      .type("html")
      .send(renderReport(snapshot(await service.get(String(req.params.id))))),
  );
  app.get("/api/deliveries/:id/reports/:report", async (req, res) => {
    const d = await service.get(String(req.params.id)),
      r = d.reports.find((r) => r.id === req.params.report);
    if (!r) return res.status(404).json({ error: "Report not found." });
    res.type("html").send(renderReport(r));
  });
  app.get(
    "/api/deliveries/:id/reports/:report/download",
    async (req, res, next) => {
      const d = await service.get(String(req.params.id)),
        r = d.reports.find((r) => r.id === req.params.report);
      if (!r) return res.status(404).json({ error: "Report not found." });
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", next);
      const chunks: Buffer[] = [];
      const end = new Promise<void>((resolve, reject) => {
        archive.on("end", resolve);
        archive.on("error", reject);
      });
      if (service.media.bucket)
        archive.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      else {
        res.attachment(`PackageCare-${d.id}-v${r.version}.zip`);
        archive.pipe(res);
      }
      archive.append(renderReport(r, true), { name: "report.html" });
      archive.append(JSON.stringify(r, null, 2), { name: "manifest.json" });
      archive.append(
        "Open report.html beside the evidence folder. Synthetic samples and model observations are labeled in the report. No report was submitted to a carrier.\n",
        { name: "READ-ME.txt" },
      );
      for (const a of r.assets)
        archive.append(await service.media.read(a), {
          name: `evidence/${a.id}.${a.key.split(".").pop()}`,
        });
      await archive.finalize();
      await end;
      if (service.media.bucket)
        res.redirect(
          await service.media.exportBundle(r.id, Buffer.concat(chunks)),
        );
    },
  );
  app.delete("/api/deliveries/:id", async (req, res) => {
    const d = await service.get(String(req.params.id));
    if (
      service.running.has(d.id) ||
      !["ready", "failed", "media_unavailable"].includes(d.state)
    )
      return res
        .status(409)
        .json({ error: "Wait for processing to finish before deleting." });
    for (const a of d.assets) await service.media.remove(a);
    for (const r of d.reports) await service.media.removeExport(r.id);
    await service.store.remove(d.id);
    res.status(204).end();
  });
  app.post("/api/ring/connect", async (req, res) => {
    if (process.env.AWS_LAMBDA_FUNCTION_NAME)
      return res
        .status(409)
        .json({
          error:
            "Set Ring credentials in the deployment configuration so API and processing workers share them.",
        });
    const { token } = z
        .object({ token: z.string().min(20).max(10000) })
        .parse(req.body),
      old = service.ring.token;
    service.ring.token = token;
    try {
      const devices = await service.ring.devices();
      res.json({ devices });
    } catch (e) {
      service.ring.token = old;
      throw e;
    }
  });
  app.delete("/api/ring/connect", (_req, res) => {
    service.ring.token = "";
    res.json({ ok: true });
  });
  app.get("/api/ring/devices", async (_req, res) =>
    res.json(await service.ring.devices()),
  );
  app.get("/api/ring/devices/:id/capabilities", async (req, res) =>
    res.json(await service.ring.capabilities(String(req.params.id))),
  );
  app.get("/api/ring/devices/:id/events", async (req, res) =>
    res.json(await service.ring.events(String(req.params.id))),
  );
  app.post("/api/ring/import", async (req, res) => {
    const body = z
      .object({
        deviceId: z.string().min(1).max(300),
        timestamp: z.number().int().positive().max(Date.now()),
        eventId: z.string().min(1).max(300),
        componentId: z.string().max(100).optional(),
      })
      .parse(req.body);
    const devices = await service.ring.devices();
    if (!devices.some((d) => d.id === body.deviceId))
      return res
        .status(403)
        .json({ error: "Device is not in your connected Ring account." });
    const caps = await service.ring.capabilities(body.deviceId),
      components = caps?.attributes?.components?.items;
    if (components?.length && !body.componentId)
      throw new Error("Select a camera component for this device.");
    if (
      body.componentId &&
      components &&
      !components.some((c: any) => c.component_id === body.componentId)
    )
      throw new Error("Unknown camera component.");
    res
      .status(202)
      .json(
        await service.ingest(
          body.eventId,
          body.deviceId,
          body.timestamp,
          process.env.RING_SOURCE_TYPE === "ring_device"
            ? "ring_device"
            : "ring_simulator",
          body.componentId,
        ),
      );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) return res.destroy();
      const status =
        err instanceof z.ZodError
          ? 400
          : err instanceof RingError
            ? 502
            : err.$metadata
              ? 503
              : err.status || 400;
      // Do not echo SDK bodies, tokens, signed URLs, raw model payloads or stack traces.
      const message =
        err instanceof z.ZodError
          ? "Some fields are invalid. Check the form and try again."
          : err instanceof RingError || status < 500
            ? err.message
            : "The service could not complete this request.";
      res.status(status).json({ error: message });
    },
  );
  return app;
}
