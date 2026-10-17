import { createStore } from "./store.js";
import { MediaStore } from "./media.js";
import { PackageCare } from "./service.js";
import { RingError } from "./ring.js";
const root = "/tmp/packagecare";
export async function handler(event: {
  id: string;
  phase: "retrieve" | "observe" | "verify" | "fail";
}) {
  if (
    !event.id ||
    !["retrieve", "observe", "verify", "fail"].includes(event.phase)
  )
    throw new Error("Invalid workflow task");
  const service = new PackageCare(createStore(root), new MediaStore(root));
  try {
    if (event.phase === "fail")
      await service.fail(event.id, new Error("Workflow failed"));
    else await service[event.phase](event.id);
    return { id: event.id };
  } catch (e) {
    if (e instanceof RingError && [416, 425, 429, 503].includes(e.status))
      throw Object.assign(new Error(e.message), { name: "MediaPending" });
    // Step Functions failure details must not include provider bodies or credentials.
    throw Object.assign(new Error("PackageCare processing task failed."), {
      name: "ProcessingFailed",
    });
  }
}
