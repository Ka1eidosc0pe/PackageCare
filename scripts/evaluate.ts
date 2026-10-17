import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { MediaStore, prepareVideo } from "../server/media.js";
import { BedrockAnalyzer } from "../server/analysis.js";
import {
  emptyReview,
  assessmentSchema,
  type Delivery,
} from "../shared/domain.js";
const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error(
    "Usage: npm run evaluate -- /absolute/path/to/labeled-manifest.json",
  );
  process.exit(1);
}
const cases = z
  .array(
    z.object({
      id: z.string(),
      file: z.string(),
      expected: assessmentSchema,
      actionWindow: z.tuple([z.number(), z.number()]).optional(),
      split: z.enum(["development", "held_out"]),
    }),
  )
  .parse(JSON.parse(await fs.readFile(manifestPath, "utf8")));
if (!cases.length) throw new Error("Evaluation manifest is empty.");
const media = new MediaStore(path.resolve(process.env.DATA_DIR || "data")),
  analyzer = new BedrockAnalyzer(media),
  results = [];
for (const item of cases) {
  const start = Date.now();
  const prepared = await prepareVideo(
    await fs.readFile(path.resolve(path.dirname(manifestPath), item.file)),
    media,
    `${item.id}.mp4`,
  );
  const d: Delivery = {
    id: item.id,
    revision: 0,
    title: "Evaluation",
    camera: "Labeled dataset",
    source: "uploaded",
    observedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    state: "analyzing",
    ...prepared,
    runs: [],
    reports: [],
    review: emptyReview(),
  };
  try {
    const first = await analyzer.analyze(d, "observe"),
      second = await analyzer.analyze(d, "verify", first.analysis);
    results.push({
      id: item.id,
      split: item.split,
      expected: item.expected,
      actual: second.analysis.assessment,
      match: item.expected === second.analysis.assessment,
      elapsedMs: Date.now() - start,
      actionCovered: item.actionWindow
        ? second.analysis.observations.some(
            (o) =>
              o.startMs <= item.actionWindow![1] &&
              o.endMs >= item.actionWindow![0] &&
              o.concern,
          )
        : null,
      analysis: second.analysis,
      runs: [first.run, second.run],
    });
  } catch (e: any) {
    results.push({
      id: item.id,
      error: e.name,
      match: false,
      elapsedMs: Date.now() - start,
    });
  } finally {
    for (const asset of prepared.assets) await media.remove(asset);
  }
}
const output = path.join(media.root, `evaluation-${Date.now()}.json`);
await fs.writeFile(
  output,
  JSON.stringify(
    {
      warning:
        "Small feasibility set; not production accuracy. Sparse-frame adapter; native-video comparison pending.",
      results,
    },
    null,
    2,
  ),
);
console.log(`Saved ${results.length} real inference results to ${output}`);
