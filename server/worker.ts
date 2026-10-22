import { createStore } from "./store.js";
import { MediaStore } from "./media.js";
import { PackageCare } from "./service.js";
import { RingError } from "./ring.js";
import { analyzerFromEnv } from "./local-analysis.js";
import { WorkflowStore, StaleWorkflow } from "./workflow-store.js";
const root = "/tmp/packagecare";
export interface WorkerEvent {
  id: string;
  generation: string;
  phase: "retrieve" | "observe" | "verify" | "fail";
  failureCode?: string;
}
export async function handler(event: WorkerEvent) {
  if (
    !event.id ||
    typeof event.generation !== "string" ||
    !event.generation ||
    !["retrieve", "observe", "verify", "fail"].includes(event.phase)
  )
    throw new Error("Invalid workflow task");
  const media = new MediaStore(root);
  const service = new PackageCare(
    new WorkflowStore(createStore(root), event.id, event.generation),
    media,
    undefined,
    analyzerFromEnv(media),
  );
  return runWorkerTask(service, event);
}

export async function runWorkerTask(service: PackageCare, event: WorkerEvent) {
  try {
    if (event.phase === "fail")
      await service.fail(
        event.id,
        event.failureCode === "MediaPending"
          ? new RingError(
              425,
              "Ring recording is not ready. Retry when the recording is available.",
            )
          : new Error("Workflow failed"),
      );
    else await service[event.phase](event.id);
    return { id: event.id, generation: event.generation };
  } catch (e) {
    if (e instanceof StaleWorkflow)
      return { id: event.id, generation: event.generation, ignored: true };
    if (e instanceof RingError && [416, 425, 429, 503].includes(e.status))
      throw Object.assign(new Error(e.message), { name: "MediaPending" });
    if (event.phase !== "fail") {
      try {
        // Persist a safe, actionable error while preserving any completed pass.
        // The catcher can still recover platform errors that never reach here.
        await service.fail(event.id, e);
      } catch (persistenceError) {
        if (persistenceError instanceof StaleWorkflow)
          return { id: event.id, generation: event.generation, ignored: true };
        // Let the workflow catcher attempt persistence; never expose provider bodies.
      }
    }
    // Step Functions failure details must not include provider bodies or credentials.
    throw Object.assign(new Error("PackageCare processing task failed."), {
      name: "ProcessingFailed",
    });
  }
}
