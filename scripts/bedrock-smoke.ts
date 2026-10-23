import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MediaStore, prepareVideo } from "../server/media.js";
import {
  BedrockAnalyzer,
  ModelOutputError,
  type ModelResponseReceipt,
} from "../server/analysis.js";
import {
  APPLICATION_REGION,
  BEDROCK_MODEL,
  processingErrorMessage,
} from "../server/aws.js";
import { emptyReview, type Delivery } from "../shared/domain.js";

const [file, mode] = process.argv.slice(2);
if (!file || (mode && mode !== "--invoke"))
  throw new Error(
    "Usage: npm run bedrock:smoke -- /path/to/clip.mp4 [--invoke]. Default only prepares local inputs. --invoke makes billed Bedrock calls.",
  );
// Never use configured cloud storage/workflows for this bounded smoke test.
const root = path.resolve("data", "bedrock-smoke", randomUUID()),
  media = new MediaStore(root, ""),
  input = await fs.readFile(path.resolve(file));
if (input.length > 80 * 1024 * 1024) throw new Error("Clip exceeds 80 MB.");
const prepared = await prepareVideo(input, media, path.basename(file), 5),
  now = new Date().toISOString(),
  delivery: Delivery = {
    id: randomUUID(),
    revision: 0,
    source: "uploaded",
    title: "Connection smoke test",
    camera: "Provided test clip",
    observedAt: now,
    createdAt: now,
    state: "analyzing",
    ...prepared,
    runs: [],
    reports: [],
    review: emptyReview(),
  };
await fs.writeFile(
  path.join(root, "input.json"),
  JSON.stringify(delivery, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    region: APPLICATION_REGION,
    model: BEDROCK_MODEL,
    frames: 5,
    maximumCalls: 2,
    maximumOutputTokensPerCall: 2500,
    automaticRetries: 0,
    storage: "local",
    invoking: mode === "--invoke",
    evidenceDirectory: root,
  }),
);
if (mode === "--invoke") {
  const responses: ModelResponseReceipt[] = [];
  try {
    const analyzer = new BedrockAnalyzer(
        media,
        BEDROCK_MODEL,
        "sparse_frames",
        async (receipt) => {
          responses.push(receipt);
          // Save usage/output before schema validation so a rejected reply still has an audit trail.
          // Ignored local evidence only; never print raw model output or source frames.
          await fs.writeFile(
            path.join(root, "responses.json"),
            JSON.stringify(responses, null, 2),
            { mode: 0o600 },
          );
        },
      ),
      first = await analyzer.analyze(delivery, "observe");
    delivery.runs.push(first.run);
    await fs.writeFile(
      path.join(root, "runs.json"),
      JSON.stringify(delivery.runs, null, 2),
      { mode: 0o600 },
    );
    const second = await analyzer.analyze(delivery, "verify", first.analysis);
    delivery.runs.push(second.run);
    await fs.writeFile(
      path.join(root, "result.json"),
      JSON.stringify(
        {
          warning:
            "Connectivity and schema smoke only; not an accuracy evaluation or proof of Ring provenance.",
          analysis: second.analysis,
          runs: delivery.runs,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Saved the two-pass result and usage locally. No cloud resources were created.",
    );
  } catch (error: any) {
    const diagnostic = {
      succeeded: false,
      errorType: error?.name || "Error",
      message: processingErrorMessage(error),
      httpStatus: error?.$metadata?.httpStatusCode,
      attempts: error?.$metadata?.attempts,
      automaticRetryDelayMs: error?.$metadata?.totalRetryDelay,
      receivedResponses: responses.length,
      completedPasses: delivery.runs.length,
      ...(error instanceof ModelOutputError
        ? { validation: error.diagnostic }
        : {}),
    };
    await fs.writeFile(
      path.join(root, "failure.json"),
      JSON.stringify(diagnostic, null, 2),
      { mode: 0o600 },
    );
    console.error(JSON.stringify(diagnostic));
    process.exitCode = 1;
  }
} else console.log("Preparation complete. No inference was invoked.");
