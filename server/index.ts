import "dotenv/config";
import path from "node:path";
import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { MediaStore } from "./media.js";
import { PackageCare } from "./service.js";
import { purgeExpired } from "./maintenance.js";
const root = path.resolve(process.env.DATA_DIR || "data"),
  host = process.env.HOST || "127.0.0.1";
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  (!process.env.PACKAGECARE_PASSWORD || !process.env.SESSION_SECRET)
)
  throw new Error(
    "Configure PACKAGECARE_PASSWORD and SESSION_SECRET before exposing the server.",
  );
const service = new PackageCare(createStore(root), new MediaStore(root));
const cleanup = () =>
  purgeExpired(
    service.store,
    service.media,
    Number(process.env.RETENTION_DAYS || 30),
  ).catch(() =>
    console.error("Retention cleanup failed; will retry next interval."),
  );
void cleanup();
setInterval(cleanup, 86400000).unref();
createApp(service).listen(Number(process.env.PORT || 3001), host, () =>
  console.log(
    `PackageCare ready at http://${host}:${process.env.PORT || 3001}`,
  ),
);
// Recover persisted local jobs after a process restart. No fake successful analyses.
if (!process.env.PACKAGECARE_STATE_MACHINE) {
  const records = await service.store.list();
  for (const d of records)
    if (
      ["received", "waiting_for_media", "analyzing", "verifying"].includes(
        d.state,
      )
    )
      void service.process(d.id);
}
