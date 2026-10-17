import "dotenv/config";
import path from "node:path";
import { createStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { purgeExpired } from "../server/maintenance.js";
const root = path.resolve(process.env.DATA_DIR || "data"),
  dryRun = !process.argv.includes("--apply");
const ids = await purgeExpired(
  createStore(root),
  new MediaStore(root),
  Number(process.env.RETENTION_DAYS || 30),
  Date.now(),
  dryRun,
);
console.log(
  `${dryRun ? "Would remove" : "Removed"} ${ids.length} expired whole cases. ${dryRun ? "Pass --apply to delete evidence and reports permanently." : ""}`,
);
