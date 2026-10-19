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
  },
});
if (positionals.length !== 1)
  throw new Error(
    "Prepare: npm run benchmark:vision -- /path/to/baseline-plan.json. After specific spending approval: npm run benchmark:vision -- /path/to/benchmark-plan.json --invoke --max-requests 2",
  );
if (values.invoke) {
  if (values["frame-offsets"])
    throw new Error(
      "Invocation uses the reviewed plan's exact frames; prepare another plan to change them.",
    );
  if (values["max-requests"] !== "2")
    throw new Error(
      "Provide the specifically approved --max-requests 2. No inference started.",
    );
  const r = await runVisionBenchmark(positionals[0], 2);
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
      "Preparation makes no inference calls; obtain approval before invoking.",
    );
  console.log(
    JSON.stringify({
      invoking: false,
      ...(await prepareVisionBenchmark(
        positionals[0],
        undefined,
        values["frame-offsets"]?.split(",").map(Number),
      )),
      note: "Local preparation only. Review pricing and obtain owner approval before invocation.",
    }),
  );
}
