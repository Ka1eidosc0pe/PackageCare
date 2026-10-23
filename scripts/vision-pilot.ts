import "dotenv/config";
import { parseArgs } from "node:util";
import { prepareVisionPilot, runVisionPilot } from "./lib/vision-pilot.js";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    invoke: { type: "boolean", default: false },
    "max-requests": { type: "string" },
  },
});
if (positionals.length !== 1)
  throw new Error(
    "Prepare locally: npm run pilot:vision -- /path/to/prepared-evaluation-plan.json. Invocation requires a separate explicit owner-approved scope.",
  );
if (values.invoke) {
  if (!/^\d+$/.test(values["max-requests"] || ""))
    throw new Error(
      "Provide the specifically approved --max-requests count. No inference started.",
    );
  const r = await runVisionPilot(
    positionals[0],
    Number(values["max-requests"]),
  );
  console.log(
    JSON.stringify({
      output: r.output,
      state: r.state,
      maximumRequests: r.maximumRequests,
      cases: r.results.map((c) => ({
        state: c.state,
        actual: c.actual,
        match: c.match,
        attemptedRequests: c.attemptedRequests,
        usage: c.usage,
      })),
    }),
  );
  if (r.state !== "complete") process.exitCode = 1;
} else {
  if (values["max-requests"])
    throw new Error("Local preparation does not invoke a model.");
  console.log(
    JSON.stringify({
      invoking: false,
      ...(await prepareVisionPilot(positionals[0])),
      note: "Review the frozen mixed-case scope and pricing before invoking (billed).",
    }),
  );
}
