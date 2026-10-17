import { createStore } from "./store.js";
import { MediaStore } from "./media.js";
import { purgeExpired } from "./maintenance.js";
export async function handler() {
  const root = "/tmp/packagecare";
  const ids = await purgeExpired(
    createStore(root),
    new MediaStore(root),
    Number(process.env.RETENTION_DAYS || 30),
  );
  return { expiredCases: ids.length };
}
