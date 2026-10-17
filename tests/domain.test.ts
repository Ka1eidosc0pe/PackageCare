import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  validateAnalysis,
  validateReview,
  emptyReview,
  type Delivery,
  type Analysis,
  type Asset,
} from "../shared/domain.js";
import { snapshot, renderReport } from "../server/reports.js";
export const assets: Asset[] = [
  {
    id: "video",
    key: "video.mp4",
    name: "original.mp4",
    kind: "video",
    mime: "video/mp4",
    bytes: 10,
    sha256: "a".repeat(64),
  },
  {
    id: "frame",
    key: "frame.jpg",
    name: "frame.jpg",
    kind: "frame",
    mime: "image/jpeg",
    bytes: 5,
    sha256: "b".repeat(64),
    offsetMs: 4000,
  },
];
export const analysis: Analysis = {
  assessment: "possible_rough_handling",
  summary: "Possible release.",
  limitations: ["Sparse footage."],
  observations: [
    {
      id: "o1",
      label: "possible_drop",
      description: "The package appears airborne.",
      startMs: 3000,
      endMs: 5000,
      evidenceIds: ["frame"],
      concern: true,
      verification: "supported",
      limitations: [],
    },
  ],
};
export const delivery = (): Delivery => ({
  id: "test",
  revision: 3,
  source: "fixture",
  title: "Sample delivery",
  camera: "Sample porch",
  observedAt: "2026-10-16T12:00:00Z",
  createdAt: "2026-10-16T12:00:00Z",
  state: "ready",
  durationMs: 8000,
  assets: structuredClone(assets),
  analysis: structuredClone(analysis),
  runs: [],
  review: emptyReview(),
  reports: [],
});
describe("evidence validation", () => {
  it("abstains when a parcel is only visible, landing or at rest, and requires supported placement before clearing a clip", () => {
    for (const label of [
      "package_visible",
      "landing_visible",
      "package_at_rest",
    ] as const) {
      const candidate = structuredClone(analysis);
      candidate.assessment = "no_concern_observed";
      candidate.summary = "The package was handled perfectly.";
      Object.assign(candidate.observations[0], { label, concern: false });
      const result = validateAnalysis(candidate, assets, 8000);
      expect(result.assessment).toBe("unable_to_assess");
      expect(result.summary).toBe(
        "The available sequence does not support a handling assessment.",
      );
    }
    const visiblePlacement = structuredClone(analysis);
    Object.assign(visiblePlacement.observations[0], {
      label: "controlled_placement",
      concern: false,
      description: "The parcel is lowered onto the doorstep.",
    });
    const result = validateAnalysis(visiblePlacement, assets, 8000);
    expect(result.assessment).toBe("no_concern_observed");
    expect(result.summary).toBe("The parcel is lowered onto the doorstep.");
  });

  it("removes rejected concern headlines and preserves abstention when placement evidence is ambiguous", () => {
    const candidate = structuredClone(analysis);
    candidate.summary = "The driver threw and damaged the package.";
    candidate.observations[0].verification = "rejected";
    candidate.observations.push({
      ...candidate.observations[0],
      id: "at-rest",
      label: "package_at_rest",
      concern: false,
      verification: "supported",
    });
    const rejected = validateAnalysis(candidate, assets, 8000);
    expect(rejected.assessment).toBe("unable_to_assess");
    expect(rejected.summary).not.toContain("threw");
    expect(rejected.summary).not.toContain("damaged");
    Object.assign(candidate.observations[0], {
      label: "controlled_placement",
      concern: false,
      verification: "ambiguous",
    });
    expect(validateAnalysis(candidate, assets, 8000).assessment).toBe(
      "unable_to_assess",
    );
  });

  it("presents model observations in chronological order even when the provider returns them out of order", () => {
    const a = structuredClone(analysis);
    a.observations.push({
      ...a.observations[0],
      id: "earlier",
      startMs: 1000,
      endMs: 2000,
      evidenceIds: ["video"],
    });
    expect(
      validateAnalysis(a, assets, 8000).observations.map((o) => o.id),
    ).toEqual(["earlier", "o1"]);
  });
  it("rejects invented evidence, damage photos as source evidence, and incorrect time ranges", () => {
    for (const change of [
      { evidenceIds: ["invented"] },
      { startMs: 6000 },
      { endMs: 9000 },
      { evidenceIds: ["damage"] },
    ]) {
      const a = structuredClone(analysis);
      Object.assign(a.observations[0], change);
      expect(() =>
        validateAnalysis(
          a,
          [...assets, { ...assets[1], id: "damage", kind: "damage" }],
          8000,
        ),
      ).toThrow();
    }
  });
  it("does not turn rejected or uncertain evidence into a confirmed concern", () => {
    const a = structuredClone(analysis);
    a.observations[0].verification = "ambiguous";
    expect(validateAnalysis(a, assets, 8000).assessment).toBe(
      "unable_to_assess",
    );
    a.observations[0].verification = "rejected";
    expect(validateAnalysis(a, assets, 8000).assessment).toBe(
      "unable_to_assess",
    );
  });
});
describe("recipient review and report provenance", () => {
  it("prevents stale saves and requires decisions for handling concerns", () => {
    const d = delivery();
    expect(() => validateReview(d, { ...d.review, revision: 2 })).toThrow(
      "changed",
    );
    expect(() =>
      validateReview(d, { ...d.review, revision: 3, complete: true }),
    ).toThrow("each handling concern");
  });
  it("keeps damage separate, excludes dismissed observations, escapes text, and freezes snapshots", () => {
    const d = delivery();
    d.review = validateReview(d, {
      ...d.review,
      revision: 3,
      complete: true,
      decisions: { o1: { decision: "dismissed", statement: "Not a drop" } },
      notes: "<script>alert(1)</script>",
    });
    expect(d.review.damage).toBe("unknown");
    const r = snapshot(d);
    d.reports.push(r);
    const html = renderReport(r, true);
    expect(html).not.toContain("The package appears airborne.");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("SYNTHETIC SAMPLE");
    expect(html).not.toContain("recipient-photo");
    expect(snapshot(d).id).toBe(r.id);
    d.review.notes = "Changed after export";
    expect(r.review.notes).not.toBe(d.review.notes);
    expect(snapshot(d).version).toBe(2);
  });
  it("does not export an unreviewed or failed delivery", () => {
    const d = delivery();
    expect(() => snapshot(d)).toThrow("Complete recipient review");
    d.review.complete = true;
    d.state = "failed";
    expect(() => snapshot(d)).toThrow();
  });
  it("keeps report identity stable across storage key ordering and preserves older fingerprint versions", () => {
    const d = delivery();
    d.review.complete = true;
    const original = snapshot(d);
    const reorder = (v: any): any =>
      Array.isArray(v)
        ? v.map(reorder)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, value]) => [k, reorder(value)]),
            )
          : v;
    const restored = reorder(d);
    expect(snapshot(restored).fingerprint).toBe(original.fingerprint);
    const legacy = structuredClone(original);
    const { delivery: reference, analysis, review, assets, runs } = legacy;
    legacy.fingerprint = createHash("sha256")
      .update(
        JSON.stringify({ delivery: reference, analysis, review, assets, runs }),
      )
      .digest("hex");
    expect(legacy.fingerprint).not.toBe(original.fingerprint);
    restored.reports = [reorder(legacy)];
    expect(snapshot(restored).id).toBe(legacy.id);
    expect(snapshot(restored).fingerprint).toBe(legacy.fingerprint);
    restored.review.notes = "New recipient statement";
    expect(snapshot(restored).version).toBe(2);
    expect(legacy.review.notes).not.toBe(restored.review.notes);
  });
});
