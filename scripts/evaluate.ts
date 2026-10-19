import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { prepareEvaluation, runEvaluation } from "./lib/evaluation.js";
import { ANALYSIS_STRATEGIES } from "../server/analysis.js";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    invoke: { type: "boolean", default: false },
    "max-requests": { type: "string" },
    strategy: { type: "string" },
    split: { type: "string" },
    "frame-count": { type: "string" },
  },
});
if (positionals.length !== 1)
  throw new Error(
    "Prepare: npm run evaluate -- manifest.json [--strategy dense_frames] [--split development]. After spending approval: npm run evaluate -- /path/to/plan.json --invoke --max-requests N",
  );
if (values.invoke) {
  if (values.strategy || values.split || values["frame-count"])
    throw new Error(
      "Invocation uses the reviewed plan's strategy/split. Prepare another plan to change them.",
    );
  if (!/^\d+$/.test(values["max-requests"] || ""))
    throw new Error(
      "Provide the specifically approved --max-requests N. No inference started.",
    );
  const result = await runEvaluation(
    positionals[0],
    Number(values["max-requests"]),
  );
  console.log(
    JSON.stringify({
      output: result.output,
      attemptedRequests: result.attemptedRequests,
      receivedResponses: result.receivedResponses,
      completedCases: result.results.filter((r) => r.state === "complete")
        .length,
      failed: result.results.some((r) => r.state === "failed"),
    }),
  );
  if (result.results.some((r) => r.state === "failed")) process.exitCode = 1;
} else {
  if (values["max-requests"])
    throw new Error(
      "Request limits apply only after explicit spending approval with --invoke.",
    );
  const { planPath, plan } = await prepareEvaluation(
    positionals[0],
    z.enum(ANALYSIS_STRATEGIES).parse(values.strategy || "dense_frames"),
    z
      .enum(["development", "held_out", "all"])
      .parse(values.split || "development"),
    undefined,
    values["frame-count"] === undefined
      ? undefined
      : Number(values["frame-count"]),
  );
  console.log(
    JSON.stringify({
      invoking: false,
      planPath,
      strategy: plan.strategy,
      cases: plan.cases.length,
      maximumRequests: plan.maximumRequests,
      maximumOutputTokensPerRequest: 2500,
      retries: 0,
      storage: "local",
      requestedFrameCount: plan.requestedFrameCount,
      note: "Prepared locally. Review the exact sources/call count and current pricing, then obtain owner spending approval before --invoke.",
    }),
  );
}
