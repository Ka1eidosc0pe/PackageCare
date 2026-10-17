import { it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { purgeExpired } from "../server/maintenance.js";
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
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
