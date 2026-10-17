import "dotenv/config";
import { RingClient } from "../server/ring.js";
import { MediaStore, prepareVideo } from "../server/media.js";
import path from "node:path";
const ring = new RingClient();
if (!ring.token) {
  console.error(
    "Set RING_ACCESS_TOKEN in .env. Do not paste credentials into the terminal command.",
  );
  process.exit(1);
}
const devices = await ring.devices();
console.log(`Authenticated device discovery: ${devices.length} device(s).`);
for (const d of devices) console.log({ id: d.id, name: d.attributes?.name });
const device = process.env.RING_PROBE_DEVICE,
  timestamp = Number(process.env.RING_PROBE_TIMESTAMP);
if (device && timestamp) {
  const clip = await ring.clip(
    device,
    timestamp,
    12000,
    process.env.RING_PROBE_COMPONENT,
  );
  const media = new MediaStore(path.resolve(process.env.DATA_DIR || "data"));
  const prepared = await prepareVideo(clip.bytes, media, "gate-a-probe.mp4");
  console.log({
    downloaded: true,
    observedAt: clip.observedAt,
    durationMs: prepared.durationMs,
    assetCount: prepared.assets.length,
  });
} else
  console.log(
    "Set RING_PROBE_DEVICE and RING_PROBE_TIMESTAMP (epoch ms) to test an existing recording. Custom scene support still requires manual verification.",
  );
