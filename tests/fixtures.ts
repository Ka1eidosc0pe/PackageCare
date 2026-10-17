import {
  emptyReview,
  type Delivery,
  type Analysis,
  type Asset,
} from "../shared/domain.js";
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
