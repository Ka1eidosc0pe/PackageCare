import { z } from "zod";

export const assessmentSchema = z.enum([
  "no_concern_observed",
  "possible_rough_handling",
  "unable_to_assess",
]);
export type Assessment = z.infer<typeof assessmentSchema>;
export type Source = "fixture" | "uploaded" | "ring_simulator" | "ring_device";
export type State =
  | "awaiting_analysis"
  | "received"
  | "waiting_for_media"
  | "analyzing"
  | "verifying"
  | "ready"
  | "failed"
  | "media_unavailable";
export type Damage = "unknown" | "none_observed" | "observed";
export const actionSchema = z.enum([
  "package_visible",
  "controlled_placement",
  "possible_airborne_release",
  "possible_drop",
  "landing_visible",
  "package_at_rest",
  "visibility_insufficient",
]);
export const observationSchema = z.object({
  id: z.string().min(1).max(80),
  label: actionSchema,
  description: z.string().min(1).max(800),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  evidenceIds: z.array(z.string()).min(1).max(10),
  concern: z.boolean(),
  verification: z.enum(["supported", "ambiguous", "rejected"]),
  limitations: z.array(z.string().max(400)).max(10),
});
export type Observation = z.infer<typeof observationSchema>;
export const analysisSchema = z.object({
  assessment: assessmentSchema,
  summary: z.string().min(1).max(1200),
  observations: z.array(observationSchema).max(30),
  limitations: z.array(z.string().max(400)).max(15),
});
export type Analysis = z.infer<typeof analysisSchema>;
export interface Asset {
  id: string;
  key: string;
  name: string;
  mime: string;
  bytes: number;
  sha256: string;
  kind: "video" | "frame" | "damage";
  offsetMs?: number;
}
export interface Run {
  id: string;
  provider: "scripted_fixture" | "bedrock" | "local_classifier";
  model: string;
  promptVersion: string;
  startedAt: string;
  finishedAt?: string;
  inputAssetIds: string[];
  usage?: Record<string, number>;
  proposal?: Analysis;
  verification?: Analysis;
  // Local classifier only: the numeric scores printed by experiments/synthetic/infer.py.
  raw?: unknown;
  failure?: {
    stage: "tool" | "schema" | "evidence" | "truncated" | "processing";
    window?: number;
    attemptedRequests: number;
    receivedResponses: number;
    issues?: { path: (string | number)[]; code: string }[];
  };
}
export interface Review {
  decisions: Record<
    string,
    {
      decision: "confirmed" | "dismissed" | "corrected" | "unresolved";
      statement: string;
    }
  >;
  damage: Damage;
  notes: string;
  shipment: string;
  complete: boolean;
  updatedAt?: string;
}
export interface Report {
  id: string;
  version: number;
  createdAt: string;
  fingerprint: string;
  delivery: {
    id: string;
    title: string;
    camera: string;
    source: Source;
    observedAt: string;
    durationMs: number;
    eventId?: string;
    capture?: Delivery["capture"];
  };
  analysis: Analysis;
  review: Review;
  assets: Asset[];
  runs: Run[];
}
export interface Delivery {
  id: string;
  revision: number;
  eventId?: string;
  deviceId?: string;
  componentId?: string;
  capture?: {
    method: "browser_recording";
    sessionId: string;
    startedAt: string;
  };
  workflowExecutionArn?: string;
  workflowGeneration?: string;
  source: Source;
  title: string;
  camera: string;
  observedAt: string;
  createdAt: string;
  durationMs: number;
  state: State;
  analysis?: Analysis;
  error?: string;
  assets: Asset[];
  runs: Run[];
  review: Review;
  reports: Report[];
  fixtureScenario?: "normal" | "drop" | "ambiguous";
}
export const emptyReview = (): Review => ({
  decisions: {},
  damage: "unknown",
  notes: "",
  shipment: "",
  complete: false,
});
export const reviewSchema = z.object({
  revision: z.number().int().nonnegative(),
  decisions: z.record(
    z.object({
      decision: z.enum(["confirmed", "dismissed", "corrected", "unresolved"]),
      statement: z.string().max(1500),
    }),
  ),
  damage: z.enum(["unknown", "none_observed", "observed"]),
  notes: z.string().max(4000),
  shipment: z.string().max(300),
  complete: z.boolean(),
});
export const labels: Record<Assessment, string> = {
  no_concern_observed: "No concern observed",
  possible_rough_handling: "Handling review",
  unable_to_assess: "Unable to assess",
};
export const sourceLabels: Record<Source, string> = {
  fixture: "Synthetic sample",
  uploaded: "Uploaded footage",
  ring_simulator: "Ring simulator",
  ring_device: "Ring device",
};
export function validateAnalysis(
  input: unknown,
  assets: Asset[],
  durationMs: number,
): Analysis {
  const result = analysisSchema.parse(input);
  const ids = new Set<string>();
  for (const o of result.observations) {
    if (ids.has(o.id)) throw new Error("Duplicate observation identifier");
    ids.add(o.id);
    if (o.startMs > o.endMs || o.endMs > durationMs)
      throw new Error("Observation falls outside source footage");
    for (const id of o.evidenceIds) {
      const a = assets.find((x) => x.id === id);
      if (!a || a.kind === "damage")
        throw new Error(
          "Observation cites missing or recipient-provided evidence",
        );
      if (
        a.kind === "frame" &&
        (a.offsetMs === undefined ||
          a.offsetMs < o.startMs ||
          a.offsetMs > o.endMs)
      )
        throw new Error("Evidence frame falls outside observation interval");
    }
  }
  // The server derives the overall result from verified observations, not an unchecked model headline.
  const supported = result.observations.find(
    (o) => o.concern && o.verification === "supported",
  );
  const placement = result.observations.find(
    (o) =>
      o.label === "controlled_placement" &&
      o.verification === "supported" &&
      !o.concern,
  );
  result.observations.sort(
    (a, b) =>
      a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id),
  );
  const unclear =
    result.observations.every((o) => o.verification === "rejected") ||
    result.observations.some(
      (o) =>
        o.verification === "ambiguous" || o.label === "visibility_insufficient",
    );
  result.assessment = supported
    ? "possible_rough_handling"
    : unclear || !placement
      ? "unable_to_assess"
      : "no_concern_observed";
  // Never retain an unchecked model headline after weakening its assessment.
  // Arrival/landing/rest alone cannot establish that placement was controlled.
  result.summary = supported
    ? supported.description
    : result.assessment === "no_concern_observed"
      ? placement!.description
      : "The available sequence does not support a handling assessment.";
  return result;
}
export function validateReview(d: Delivery, input: unknown): Review {
  const parsed = reviewSchema.parse(input);
  if (parsed.revision !== d.revision)
    throw Object.assign(
      new Error("This delivery changed. Reload before saving."),
      { status: 409 },
    );
  if (d.state !== "ready" || !d.analysis)
    throw Object.assign(new Error("Wait for analysis before reviewing."), {
      status: 409,
    });
  const ids = new Set(d.analysis.observations.map((o) => o.id));
  for (const [id, entry] of Object.entries(parsed.decisions)) {
    if (!ids.has(id))
      throw new Error("Review references an unknown observation");
    if (entry.decision === "corrected" && !entry.statement.trim())
      throw new Error("Add a statement for a corrected observation");
  }
  if (
    parsed.complete &&
    d.analysis.observations.some(
      (o) =>
        o.concern &&
        o.verification !== "rejected" &&
        (!parsed.decisions[o.id] ||
          parsed.decisions[o.id].decision === "unresolved"),
    )
  )
    throw new Error(
      "Review each handling concern before marking review complete",
    );
  const { revision, ...review } = parsed;
  return { ...review, updatedAt: new Date().toISOString() };
}
export const timecode = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;
