import { it, expect, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PackageCare } from "../server/service.js";
import { LocalStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { RingClient, RingError } from "../server/ring.js";
import { WorkflowStore } from "../server/workflow-store.js";
import { runWorkerTask, type WorkerEvent } from "../server/worker.js";
import { delivery, analysis } from "./fixtures.js";

it("retains a completed observation pass and actionable quota failure through the cloud catcher, then resumes verification without repeating observation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-worker-recovery-"));
  try {
    const store = new LocalStore(root),
      d = delivery();
    Object.assign(d, {
      state: "received",
      analysis: undefined,
      workflowGeneration: "first",
    });
    await store.change(d.id, () => d);
    const proposalRun = {
      id: "observation-run",
      provider: "bedrock" as const,
      model: "test",
      promptVersion: "test",
      startedAt: new Date().toISOString(),
      inputAssetIds: d.assets.map((a) => a.id),
      proposal: analysis,
    };
    const analyzer = {
      analyze: vi
        .fn()
        .mockResolvedValueOnce({ analysis, run: proposalRun })
        .mockRejectedValueOnce(
          Object.assign(
            new Error("Too many tokens per day; sensitive-provider-body"),
            { name: "ThrottlingException" },
          ),
        )
        .mockResolvedValueOnce({
          analysis,
          run: {
            ...proposalRun,
            id: "verification-run",
            proposal: undefined,
            verification: analysis,
          },
        }),
    };
    const service = new PackageCare(
        new WorkflowStore(store, d.id, "first"),
        new MediaStore(root),
        undefined,
        analyzer,
      ),
      event: WorkerEvent = { id: d.id, generation: "first", phase: "observe" };
    await runWorkerTask(service, event);
    await expect(
      runWorkerTask(service, { ...event, phase: "verify" }),
    ).rejects.toMatchObject({
      name: "ProcessingFailed",
      message: "PackageCare processing task failed.",
    });
    const failed = await store.get(d.id);
    expect(failed?.state).toBe("failed");
    expect(failed?.analysis).toBeUndefined();
    expect(failed?.error).toContain("daily token quota");
    expect(JSON.stringify(failed)).not.toContain("sensitive-provider-body");
    expect(failed?.runs).toEqual([proposalRun]);
    expect(failed?.assets).toEqual(d.assets);
    await runWorkerTask(service, { ...event, phase: "fail" });
    await runWorkerTask(service, { ...event, phase: "fail" });
    expect(await store.get(d.id)).toEqual(failed);

    const ownerService = new PackageCare(
      store,
      new MediaStore(root),
      undefined,
      analyzer,
    );
    // Replace only dispatch: no AWS execution is started in this local test.
    vi.spyOn(ownerService, "dispatch").mockImplementation(async () => {
      await store.change(d.id, (c) => ({
        ...c!,
        workflowGeneration: "second",
      }));
    });
    await ownerService.retry(d.id);
    const resumed = new PackageCare(
        new WorkflowStore(store, d.id, "second"),
        new MediaStore(root),
        undefined,
        analyzer,
      ),
      next = { ...event, generation: "second" };
    expect(
      await runWorkerTask(service, { ...event, phase: "fail" }),
    ).toMatchObject({ ignored: true });
    await runWorkerTask(resumed, next);
    await runWorkerTask(resumed, { ...next, phase: "verify" });
    const ready = await store.get(d.id);
    expect(ready?.state).toBe("ready");
    expect(ready?.analysis).toEqual(analysis);
    expect(ready?.runs.map((r) => r.id)).toEqual([
      "observation-run",
      "verification-run",
    ]);
    expect(analyzer.analyze.mock.calls.map((c) => c[1])).toEqual([
      "observe",
      "verify",
      "verify",
    ]);
    await runWorkerTask(resumed, { ...next, phase: "fail" });
    expect(await store.get(d.id)).toEqual(ready);
  } finally {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it("keeps transient Ring media retryable and marks exhausted readiness retries unavailable without exposing raw failure details", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-worker-media-"));
  try {
    const store = new LocalStore(root),
      d = delivery(),
      ring = new RingClient("test-token");
    Object.assign(d, {
      state: "received",
      analysis: undefined,
      assets: [],
      durationMs: 0,
      deviceId: "simulator",
      source: "ring_simulator",
      workflowGeneration: "first",
    });
    await store.change(d.id, () => d);
    const clip = vi
        .spyOn(ring, "clip")
        .mockRejectedValue(
          new RingError(425, "Ring is still preparing the recording."),
        ),
      analyzer = { analyze: vi.fn() },
      service = new PackageCare(
        new WorkflowStore(store, d.id, "first"),
        new MediaStore(root),
        ring,
        analyzer,
      ),
      event: WorkerEvent = { id: d.id, generation: "first", phase: "retrieve" };
    await expect(runWorkerTask(service, event)).rejects.toMatchObject({
      name: "MediaPending",
    });
    expect((await store.get(d.id))?.state).toBe("waiting_for_media");
    expect(clip).toHaveBeenCalledOnce();
    await runWorkerTask(service, {
      ...event,
      phase: "fail",
      failureCode: "MediaPending",
    });
    const exhausted = await store.get(d.id);
    expect(exhausted?.state).toBe("media_unavailable");
    expect(exhausted?.error).toContain("recording is not ready");
    expect(exhausted?.analysis).toBeUndefined();
    await runWorkerTask(service, {
      ...event,
      phase: "fail",
      failureCode: "untrusted-provider-error-or-token",
    });
    expect(await store.get(d.id)).toEqual(exhausted);
    expect(analyzer.analyze).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  }
});
