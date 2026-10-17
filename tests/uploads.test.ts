import { afterEach, describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import sharp from "sharp";
import {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { CloudUploads } from "../server/uploads.js";
import { MediaStore } from "../server/media.js";
import { LocalStore } from "../server/store.js";
import { PackageCare } from "../server/service.js";
import { createApp } from "../server/app.js";
import { delivery } from "./fixtures.js";

const secret = "test-only-session-secret-at-least-32-characters";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const client = () =>
  new S3Client({
    region: "us-east-2",
    credentials: {
      accessKeyId: "TESTONLY",
      secretAccessKey: "test-only-not-a-real-key",
    },
  });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("bounded direct cloud uploads", () => {
  it("signs exact size, checksum, content type and object key; rejects oversized, tampered and expired grants", async () => {
    const uploads = new CloudUploads("test-bucket", secret, client());
    const input = {
      purpose: "video",
      name: "delivery.mp4",
      bytes: 1024,
      mime: "video/mp4",
      sha256: "a".repeat(64),
    };
    const grant = await uploads.authorize(input);
    const policy = JSON.parse(
      Buffer.from(grant.fields.Policy, "base64").toString(),
    );
    expect(policy.conditions).toContainEqual([
      "content-length-range",
      1024,
      1024,
    ]);
    expect(policy.conditions).toContainEqual([
      "eq",
      "$Content-Type",
      "video/mp4",
    ]);
    expect(policy.conditions).toContainEqual([
      "eq",
      "$x-amz-checksum-algorithm",
      "SHA256",
    ]);
    expect(policy.conditions).toContainEqual([
      "eq",
      "$x-amz-checksum-sha256",
      Buffer.from(input.sha256, "hex").toString("base64"),
    ]);
    expect(policy.conditions).toContainEqual({ key: grant.fields.key });
    const ticket = uploads.verify(grant.ticket);
    expect(grant.fields.key).toBe(`incoming/${ticket.id}`);
    await expect(
      uploads.authorize({ ...input, bytes: 80 * 1024 * 1024 + 1 }),
    ).rejects.toThrow();
    await expect(
      uploads.authorize({
        ...input,
        purpose: "photo",
        mime: "image/png",
        deliveryId: "test",
        bytes: 10 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow();
    await expect(
      uploads.authorize({ ...input, purpose: "photo", mime: "image/png" }),
    ).rejects.toThrow();
    expect(() => uploads.verify(`x${grant.ticket}`)).toThrow("invalid");
    vi.spyOn(Date, "now").mockReturnValue(ticket.expires + 1);
    expect(() => uploads.verify(grant.ticket)).toThrow("expired");
  });
  it("rejects a staged object whose bytes do not match before copying or creating a delivery", async () => {
    const s3 = client(),
      uploads = new CloudUploads("test-bucket", secret, s3);
    const grant = await uploads.authorize({
      purpose: "video",
      name: "clip.mp4",
      bytes: 500,
      mime: "video/mp4",
      sha256: "b".repeat(64),
    });
    const send = vi.spyOn(s3, "send").mockResolvedValue({
      ContentLength: 500,
      ContentType: "video/mp4",
      ChecksumSHA256: "wrong",
      ETag: '"etag"',
    } as never);
    await expect(uploads.accept(uploads.verify(grant.ticket))).rejects.toThrow(
      "checksum",
    );
    expect(send.mock.calls).toHaveLength(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });
  it("completes video receipt once and decodes/strips photo uploads while preserving their reviewed destination", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-direct-"));
    vi.stubEnv("SESSION_SECRET", secret);
    vi.stubEnv("PACKAGECARE_PASSWORD", "");
    vi.stubEnv("PACKAGECARE_STATE_MACHINE", "");
    const s3 = client(),
      objects = new Map<string, { bytes: Buffer; mime: string }>();
    const send = vi
      .spyOn(s3, "send")
      .mockImplementation(async (command: any) => {
        const i = command.input;
        if (command instanceof HeadObjectCommand) {
          const o = objects.get(i.Key)!;
          return {
            ContentLength: o.bytes.length,
            ContentType: o.mime,
            ChecksumSHA256: Buffer.from(sha(o.bytes), "hex").toString("base64"),
            ETag: '"staged-etag"',
          } as any;
        }
        if (command instanceof CopyObjectCommand) {
          expect(i.CopySourceIfMatch).toBe('"staged-etag"');
          objects.set(
            i.Key,
            objects.get(i.CopySource.slice("test-bucket/".length))!,
          );
          return {};
        }
        if (command instanceof GetObjectCommand)
          return {
            Body: {
              transformToByteArray: async () => objects.get(i.Key)!.bytes,
            },
          } as any;
        if (command instanceof PutObjectCommand) {
          objects.set(i.Key, {
            bytes: Buffer.from(i.Body),
            mime: i.ContentType,
          });
          return {};
        }
        if (command instanceof DeleteObjectCommand) {
          objects.delete(i.Key);
          return {};
        }
        throw new Error("Unexpected storage request");
      });
    try {
      const media = new MediaStore(root, "test-bucket", s3),
        service = new PackageCare(new LocalStore(root), media);
      const dispatch = vi.spyOn(service, "dispatch").mockResolvedValue();
      const uploads = new CloudUploads("test-bucket", secret, s3),
        app = createApp(service, uploads);
      async function stage(
        bytes: Buffer,
        purpose: "video" | "photo",
        mime: string,
        deliveryId?: string,
      ) {
        const grant = await request(app)
          .post("/api/uploads/authorize")
          .send({
            purpose,
            mime,
            deliveryId,
            name: "my-file",
            bytes: bytes.length,
            sha256: sha(bytes),
          })
          .expect(200);
        objects.set(grant.body.fields.key, { bytes, mime });
        return grant.body;
      }
      const raw = Buffer.from("source bytes awaiting media validation"),
        grant = await stage(raw, "video", "video/mp4");
      const received = await request(app)
        .post("/api/uploads/complete")
        .send({ ticket: grant.ticket })
        .expect(202);
      const d = await service.get(received.body.id);
      expect(d.source).toBe("uploaded");
      expect(d.state).toBe("received");
      expect(d.analysis).toBeUndefined();
      expect(await media.read(d.assets[0])).toEqual(raw);
      expect(objects.has(grant.fields.key)).toBe(false);
      await request(app)
        .post("/api/uploads/complete")
        .send({ ticket: grant.ticket })
        .expect(200);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(await service.store.list()).toHaveLength(1);
      expect(
        send.mock.calls.filter(([c]) => c instanceof CopyObjectCommand),
      ).toHaveLength(1);
      await request(app)
        .post("/api/uploads")
        .attach("file", raw, "clip.mp4")
        .expect(409);
      const original = delivery();
      original.review.complete = true;
      await service.store.change("test", () => original);
      const png = await sharp({
        create: { width: 30, height: 20, channels: 3, background: "#ccaa88" },
      })
        .png()
        .withMetadata()
        .toBuffer();
      const photo = await stage(png, "photo", "image/png", "test");
      const updated = await request(app)
        .post("/api/uploads/complete")
        .send({ ticket: photo.ticket })
        .expect(201);
      expect(updated.body.review.complete).toBe(false);
      const asset = updated.body.assets.find((a: any) => a.kind === "damage");
      const metadata = await sharp(await media.read(asset)).metadata();
      expect(metadata.format).toBe("jpeg");
      expect(metadata.exif).toBeUndefined();
      expect(objects.has(`uploads/${asset.id}.png`)).toBe(false);
      await request(app)
        .post("/api/uploads/complete")
        .send({ ticket: photo.ticket })
        .expect(200);
      expect(
        (await service.get("test")).assets.filter((a) => a.kind === "damage"),
      ).toHaveLength(1);
      const invalid = await stage(
        Buffer.from("not an image"),
        "photo",
        "image/png",
        "test",
      );
      await request(app)
        .post("/api/uploads/complete")
        .send({ ticket: invalid.ticket })
        .expect(400);
      expect(objects.has(invalid.fields.key)).toBe(false);
      expect(
        (await service.get("test")).assets.filter((a) => a.kind === "damage"),
      ).toHaveLength(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
