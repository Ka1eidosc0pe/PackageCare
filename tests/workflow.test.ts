import { it, expect, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { LocalStore } from "../server/store.js";
import { MediaStore } from "../server/media.js";
import { PackageCare } from "../server/service.js";
import { WorkflowStore, StaleWorkflow } from "../server/workflow-store.js";
import { createApp } from "../server/app.js";
import { delivery, analysis } from "./fixtures.js";

it("reconciles a stopped cloud execution into a retryable failure, starts a new generation and preserves records when status checks fail", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-cloud-state-"));
  vi.stubEnv(
    "PACKAGECARE_STATE_MACHINE",
    "arn:aws:states:us-east-1:000000000000:stateMachine:test",
  );
  vi.stubEnv("PACKAGECARE_PASSWORD", "");
  try {
    const store = new LocalStore(root),
      client = new SFNClient({}),
      d = delivery();
    Object.assign(d, {
      state: "analyzing",
      analysis: undefined,
      workflowExecutionArn: "old-execution",
      workflowGeneration: "old",
    });
    await store.change(d.id, () => d);
    const service = new PackageCare(
        store,
        new MediaStore(root),
        undefined,
        undefined,
        client,
      ),
      app = createApp(service);
    const send = vi
      .spyOn(client, "send")
      .mockResolvedValueOnce({ status: "TIMED_OUT" } as never);
    const list = await request(app).get("/api/deliveries").expect(200);
    expect(list.body[0].state).toBe("failed");
    expect(list.body[0].analysis).toBeUndefined();
    expect(list.body[0].error).toContain("Retry");
    send.mockResolvedValueOnce({ executionArn: "new-execution" } as never);
    const retries = await Promise.all([
      request(app).post(`/api/deliveries/${d.id}/retry`),
      request(app).post(`/api/deliveries/${d.id}/retry`),
    ]);
    expect(retries.map((r) => r.status).sort()).toEqual([202, 409]);
    const retried = await service.get(d.id);
    expect(retried.state).toBe("received");
    expect(retried.workflowExecutionArn).toBe("new-execution");
    expect(retried.workflowGeneration).not.toBe("old");
    const start = send.mock.calls.find(
      ([c]) => c instanceof StartExecutionCommand,
    )![0] as StartExecutionCommand;
    expect(JSON.parse(start.input.input!)).toEqual({
      id: d.id,
      generation: retried.workflowGeneration,
    });
    expect(retried.assets).toEqual(d.assets);
    send.mockResolvedValueOnce({ status: "RUNNING" } as never);
    await request(app).get(`/api/deliveries/${d.id}`).expect(200);
    send.mockRejectedValueOnce(
      new Error("sensitive provider body must never reach the browser"),
    );
    const failedCheck = await request(app).get("/api/deliveries").expect(503);
    expect(failedCheck.body.error).not.toContain("sensitive");
    expect((await service.get(d.id)).state).toBe("received");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it("ignores stale execution status and rejects an older worker's result atomically after a retry supersedes it", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pc-generation-"));
  try {
    const store = new LocalStore(root),
      d = delivery(),
      client = new SFNClient({});
    Object.assign(d, {
      state: "received",
      analysis: undefined,
      runs: [],
      workflowExecutionArn: "old-execution",
      workflowGeneration: "old",
    });
    await store.change(d.id, () => d);
    let completeStatus!: (value: any) => void,
      completeModel!: (value: any) => void;
    vi.spyOn(client, "send").mockImplementation(
      () =>
        new Promise((resolve) => {
          completeStatus = resolve;
        }) as any,
    );
    const rootService = new PackageCare(
      store,
      new MediaStore(root),
      undefined,
      undefined,
      client,
    );
    const oldStatus = rootService.reconcile(await rootService.get(d.id));
    const analyzer = {
      analyze: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            completeModel = resolve;
          }),
      ),
    };
    const oldWorker = new PackageCare(
      new WorkflowStore(store, d.id, "old"),
      new MediaStore(root),
      undefined,
      analyzer as any,
    );
    const pendingWork = oldWorker.observe(d.id);
    // Wait until the model is actually in flight, without timers or assuming it started synchronously.
    await vi.waitFor(() => expect(analyzer.analyze).toHaveBeenCalledOnce());
    await store.change(d.id, (c) => ({
      ...c!,
      state: "received",
      workflowGeneration: "new",
      workflowExecutionArn: "new-execution",
    }));
    completeStatus({ status: "FAILED" });
    expect((await oldStatus).workflowGeneration).toBe("new");
    completeModel({
      analysis,
      run: {
        id: "old-result",
        provider: "bedrock",
        model: "test",
        promptVersion: "test",
        startedAt: new Date().toISOString(),
        inputAssetIds: [],
        proposal: analysis,
      },
    });
    await expect(pendingWork).rejects.toBeInstanceOf(StaleWorkflow);
    expect((await rootService.get(d.id)).runs).toEqual([]);
    expect((await rootService.get(d.id)).state).toBe("received");
    await expect(oldWorker.get(d.id)).rejects.toBeInstanceOf(StaleWorkflow);
  } finally {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  }
});
