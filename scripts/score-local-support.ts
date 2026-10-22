import { promises as fs } from "node:fs";
import path from "node:path";
import { parseHandlingResponse } from "../server/handling-evidence.js";
import type { Asset } from "../shared/domain.js";

// Offline parser/scorer. Expected labels never enter the inference request.
// A matching assessment is only a headline check, not a factuality verdict.
const [planPath, outputPath] = process.argv.slice(2);
if (!planPath || !outputPath)
  throw new Error(
    "Usage: score-local-support.ts BASELINE_PLAN OUTPUT_DIRECTORY",
  );
const baseline = JSON.parse(await fs.readFile(planPath, "utf8"));
const results = [];
for (let i = 0; i < baseline.cases.length; i++) {
  const entry = baseline.cases[i];
  const file = path.join(outputPath, `case-${i}-response.json`);
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  try {
    if (raw.finishReason !== "stop") throw new Error("Truncated output");
    let answer: string = raw.text;
    if (answer.includes("</think>")) answer = answer.split("</think>").at(-1)!;
    // Remove a complete outer Markdown fence only; never repair model JSON.
    answer = answer.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1");
    const frames = (entry.assets as Asset[])
      .filter((a) => a.kind === "frame")
      .sort((a, b) => a.offsetMs! - b.offsetMs!);
    const parsed = parseHandlingResponse(
      JSON.parse(answer),
      frames.map((asset, n) => ({ alias: `f${n + 1}`, asset })),
      entry.durationMs,
    );
    results.push({
      case: i,
      expected: entry.item.expected,
      headlineMatch: parsed.analysis.assessment === entry.item.expected,
      factualAudit: "requires_visual_review",
      seconds: raw.seconds,
      ...parsed,
    });
  } catch (error) {
    results.push({ case: i, status: "invalid", error: String(error) });
  }
}
await fs.writeFile(
  path.join(outputPath, "validation.json"),
  JSON.stringify(results, null, 2),
);
console.log(
  results.map((r) => ({
    case: r.case,
    status: "analysis" in r ? r.analysis.assessment : r.status,
    error: "error" in r ? r.error : undefined,
  })),
);
