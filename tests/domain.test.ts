import { describe, it, expect } from "vitest";
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
});
