import {
  prepareHandlingPilot,
  inspectHandlingPilot,
  runHandlingPilot,
} from "./lib/handling-pilot.js";

const [mode, file, ...args] = process.argv.slice(2);
if (!file || !["prepare", "inspect", "run"].includes(mode))
  throw new Error(
    "Usage: handling-pilot.ts prepare BASELINE [--resume-first-case PLAN] | inspect PLAN | run PLAN --approve-plan SHA256 --requests 10|8 (explicit owner spending approval required)",
  );
if (mode === "prepare") {
  if (args.length && (args.length !== 2 || args[0] !== "--resume-first-case"))
    throw new Error("Unexpected preparation arguments");
  console.log(
    JSON.stringify(
      await prepareHandlingPilot(file, undefined, args[1]),
      null,
      2,
    ),
  );
} else if (mode === "inspect") {
  if (args.length) throw new Error("Unexpected inspection arguments");
  const { scope, planSha256 } = await inspectHandlingPilot(file);
  console.log(
    JSON.stringify(
      {
        model: scope.model,
        region: scope.region,
        maximumRequests: scope.maximumRequests,
        planSha256,
      },
      null,
      2,
    ),
  );
} else {
  if (
    args.length !== 4 ||
    args[0] !== "--approve-plan" ||
    args[2] !== "--requests" ||
    !["8", "10"].includes(args[3])
  )
    throw new Error("Exact approval digest and matching request limit required");
  const result = await runHandlingPilot(file, args[1], Number(args[3]));
  console.log(
    JSON.stringify(
      {
        output: result.output,
        state: result.state,
        requests: result.attemptedRequests,
        usage: result.usage,
        diagnostic: result.diagnostic,
      },
      null,
      2,
    ),
  );
  if (result.state !== "complete") process.exitCode = 1;
}
