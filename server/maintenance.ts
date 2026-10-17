import type { Store } from "./store.js";
import type { MediaStore } from "./media.js";
export async function purgeExpired(
  store: Store,
  media: MediaStore,
  days: number,
  now = Date.now(),
  dryRun = false,
) {
  if (!Number.isFinite(days) || days < 1)
    throw new Error("Retention must be at least one day.");
  const cutoff = now - days * 86400000;
  const expired = (await store.list()).filter(
    (d) =>
      Date.parse(d.createdAt) < cutoff &&
      ["ready", "failed", "media_unavailable"].includes(d.state),
  );
  for (const d of expired)
    if (!dryRun) {
      for (const a of d.assets) await media.remove(a);
      for (const r of d.reports) await media.removeExport(r.id);
      await store.remove(d.id);
    }
  return expired.map((d) => d.id);
}

// Only generated PackageCare keys are eligible. Incoming uploads have a separate S3 lifecycle.
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const ownedKey = new RegExp(
  `^(?:(?:uploads/)?${uuid}\\.(?:mp4|mov|webm|jpg|png|webp|bin)|exports/${uuid}\\.zip)$`,
);
export async function purgeOrphans(
  store: Store,
  media: MediaStore,
  now = Date.now(),
  dryRun = true,
) {
  const cutoff = now - 86400000;
  // Finish the inventory before deleting anything; pagination failures must not cause partial reconciliation.
  const oldKeys: string[] = [];
  for await (const object of media.inventory())
    if (ownedKey.test(object.key) && object.modifiedAt < cutoff)
      oldKeys.push(object.key);
  const referenced = new Set<string>();
  for (const d of await store.list()) {
    for (const a of d.assets) referenced.add(a.key);
    for (const r of d.reports) {
      referenced.add(`exports/${r.id}.zip`);
      for (const a of r.assets) referenced.add(a.key);
    }
  }
  const orphaned = oldKeys.filter((key) => !referenced.has(key));
  if (!dryRun) for (const key of orphaned) await media.remove({ key });
  return orphaned;
}
