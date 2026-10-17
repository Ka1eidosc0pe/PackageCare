import "dotenv/config";
import path from "node:path";
import { createStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { purgeExpired, purgeOrphans } from "../server/maintenance.js";
const root = path.resolve(process.env.DATA_DIR || "data"),
  dryRun = !process.argv.includes("--apply");
const store = createStore(root),
  media = new MediaStore(root);
const ids = await purgeExpired(
  store,
  media,
  Number(process.env.RETENTION_DAYS || 30),
  Date.now(),
  dryRun,
);
const orphans = await purgeOrphans(store, media, Date.now(), dryRun);
console.log(
  `${dryRun ? "Would remove" : "Removed"} ${ids.length} expired whole cases and ${orphans.length} unreferenced files older than one day. ${dryRun ? "Pass --apply to delete evidence and reports permanently." : ""}`,
);
