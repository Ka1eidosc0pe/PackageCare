import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { purgeExpired, purgeOrphans } from "../server/maintenance.js";
import { snapshot } from "../server/reports.js";
import { delivery } from "./fixtures.js";
it("expires whole completed cases with their evidence but retains recent and in-flight work", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-retention-"));
  try {
    const store = new LocalStore(root),
      media = new MediaStore(root),
      a = await media.put(
        Buffer.from("old clip"),
        "old.mp4",
        "video/mp4",
        "video",
      ),
      now = Date.now();
    const d = delivery();
    d.createdAt = new Date(now - 31 * 86400000).toISOString();
    d.assets = [a];
    await store.change(d.id, () => d);
    await store.change("recent", () => ({
      ...delivery(),
      id: "recent",
      createdAt: new Date(now).toISOString(),
    }));
    await store.change("processing", () => ({
      ...d,
      id: "processing",
      state: "analyzing",
      assets: [],
    }));
    expect(await purgeExpired(store, media, 30, now, true)).toEqual(["test"]);
    expect(await store.get("test")).toBeDefined();
    expect(await purgeExpired(store, media, 30, now)).toEqual(["test"]);
    expect(await store.get("test")).toBeUndefined();
    await expect(media.read(a)).rejects.toThrow();
    expect(await store.get("recent")).toBeDefined();
    expect(await store.get("processing")).toBeDefined();
    const orphan = await media.put(
      Buffer.from("interrupted write"),
      "unclaimed.mp4",
      "video/mp4",
      "video",
    );
    await fs.utimes(
      media.local(orphan.key),
      new Date(now - 2 * 86400000),
      new Date(now - 2 * 86400000),
    );
    expect(await purgeOrphans(store, media, now, true)).toEqual([orphan.key]);
    expect(await media.read(orphan)).toEqual(Buffer.from("interrupted write"));
    await purgeOrphans(store, media, now, false);
    await expect(media.read(orphan)).rejects.toThrow();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
it("reconciles paginated orphan inventory without removing report evidence, active sources, incoming or recent files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-orphans-"));
  try {
    const now = Date.now(),
      old = new Date(now - 2 * 86400000),
      fresh = new Date(now - 1000);
    const current = `${randomUUID()}.mp4`,
      snapshotOnly = `${randomUUID()}.jpg`,
      orphan = `uploads/${randomUUID()}.mp4`,
      orphanExport = `exports/${randomUUID()}.zip`,
      recent = `${randomUUID()}.jpg`;
    const d = delivery();
    d.review.complete = true;
    d.assets = [{ ...d.assets[0], key: snapshotOnly }];
    const report = snapshot(d);
    d.assets = [{ ...d.assets[0], key: current }];
    d.reports = [report];
    d.state = "analyzing";
    const store = new LocalStore(root);
    await store.change(d.id, () => d);
    const s3 = new S3Client({}),
      media = new MediaStore(root, "test-bucket", s3),
      removed: string[] = [];
    const send = vi
      .spyOn(s3, "send")
      .mockImplementation(async (command: any) => {
        if (command instanceof ListObjectsV2Command)
          return command.input.ContinuationToken
            ? ({
                Contents: [
                  { Key: orphan, LastModified: old },
                  { Key: orphanExport, LastModified: old },
                  { Key: recent, LastModified: fresh },
                  { Key: `incoming/${randomUUID()}`, LastModified: old },
                  { Key: "unrelated.txt", LastModified: old },
                ],
                IsTruncated: false,
              } as any)
            : ({
                Contents: [
                  { Key: current, LastModified: old },
                  { Key: snapshotOnly, LastModified: old },
                  { Key: `exports/${report.id}.zip`, LastModified: old },
                ],
                IsTruncated: true,
                NextContinuationToken: "page-two",
              } as any);
        if (command instanceof DeleteObjectCommand) {
          removed.push(command.input.Key!);
          return {} as any;
        }
        throw new Error("Unexpected storage request");
      });
    expect(await purgeOrphans(store, media, now, true)).toEqual([
      orphan,
      orphanExport,
    ]);
    expect(removed).toEqual([]);
    expect(await purgeOrphans(store, media, now, false)).toEqual([
      orphan,
      orphanExport,
    ]);
    expect(removed).toEqual([orphan, orphanExport]);
    // A truncated/unreadable inventory must fail before any removal.
    send.mockImplementation(
      async () =>
        ({
          Contents: [{ Key: orphan, LastModified: old }],
          IsTruncated: true,
        }) as any,
    );
    await expect(purgeOrphans(store, media, now, false)).rejects.toThrow(
      "Incomplete storage inventory",
    );
    expect(removed).toEqual([orphan, orphanExport]);
  } finally {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  }
});
