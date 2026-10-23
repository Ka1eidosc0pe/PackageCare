import "dotenv/config";
import { parseArgs } from "node:util";
import {
  prepareVisionBenchmark,
  runVisionBenchmark,
} from "./lib/vision-benchmark.js";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    invoke: { type: "boolean", default: false },
    "max-requests": { type: "string" },
    "frame-offsets": { type: "string" },
    "whole-clip": { type: "boolean", default: false },
  },
});
if (positionals.length !== 1)
  throw new Error(
    "Prepare: npm run benchmark:vision -- /path/to/baseline-plan.json [--whole-clip]. To invoke (billed): npm run benchmark:vision -- /path/to/benchmark-plan.json --invoke --max-requests N",
  );
if (values.invoke) {
  if (values["frame-offsets"] || values["whole-clip"])
    throw new Error(
      "Invocation uses the reviewed plan's exact frames; prepare another plan to change them.",
    );
  if (!/^\d+$/.test(values["max-requests"] || ""))
    throw new Error(
      "Provide the specifically approved --max-requests count. No inference started.",
    );
  const r = await runVisionBenchmark(
    positionals[0],
    Number(values["max-requests"]),
  );
  console.log(
    JSON.stringify({
      output: r.output,
      state: r.state,
      attemptedRequests: r.attemptedRequests,
      receivedResponses: r.receivedResponses,
      actual: r.actual,
      usage: r.usage,
    }),
  );
  if (r.state !== "complete") process.exitCode = 1;
} else {
  if (values["max-requests"])
    throw new Error(
      "Preparation makes no inference calls; invoking is billed.",
    );
  console.log(
    JSON.stringify({
      invoking: false,
      ...(await prepareVisionBenchmark(
        positionals[0],
        undefined,
        values["frame-offsets"]?.split(",").map(Number),
        values["whole-clip"] ? 3 : undefined,
      )),
      note: "Local preparation only. Review pricing before invoking (billed).",
    }),
  );
}
