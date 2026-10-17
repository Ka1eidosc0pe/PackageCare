import { createStore } from "./store.js";
import { MediaStore } from "./media.js";
import { purgeExpired, purgeOrphans } from "./maintenance.js";
export async function handler() {
  const root = "/tmp/packagecare";
  const store = createStore(root),
    media = new MediaStore(root);
  const ids = await purgeExpired(
    store,
    media,
    Number(process.env.RETENTION_DAYS || 30),
  );
  const orphans = await purgeOrphans(store, media, Date.now(), false);
  return { expiredCases: ids.length, orphanedFiles: orphans.length };
}
