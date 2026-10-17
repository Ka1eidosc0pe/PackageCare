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
