# Additional-source parcel tracking validation

The owner chose tracking validation before training. This checkpoint tests the frozen local detector/tracker beyond the three reused development excerpts. It is a localization prerequisite, not a handling classifier or a passed PRD quality gate.

## Sealed before inference

- Two new source recordings: office delivery, source 2.5–6.5 s; USDA porch delivery, source 256–260 s. [Credits, original/excerpt fingerprints and edits](../evaluation/tracking-validation-sources.json). No added cuts, crop or speed change; audio removed/H.264 transcode. The original source may contain edits. Both excerpts remain local.
- Every uniformly prepared frame retained: sixteen per source, 32 total. Office input 640×480; porch input 1280×720 after the existing media preparation. Enlarged crops/grids were used only for visual annotation; models receive full prepared images.
- [Provisional visual annotations](../evaluation/tracking-validation-annotations.json), SHA256 `9fc761fb304d74084d725a415a7bb8e811ce1944de9ea16471dc3197bd1d1c9e`, saved before either model saw these sources. Single Codex annotation pass with overlay review, no model-suggested boxes and no independent adjudicator. Approximate visible-envelope boxes, not segmentation or amodal ground truth.
- Eight office frames scoreable / eight unscorable; ten porch frames scoreable / six unscorable. Reasons remain per frame. Large approach-position discontinuity before porch frame 7 breaks the evaluated identity segment; no continuity across it is assumed. Handling/release/support/landing is not scored.
- Same Grounding DINO Tiny revision/query/thresholds and SAM2.1 Tiny revision/mask threshold as the prior experiment. Automatic candidate seeds only, frozen `mask_agreement_v1`, no new prompt or threshold variants. Offline CPU detector and local MPS tracker, no CPU fallback, training, cloud requests, upload or deployment. Stop on operational failure, no automatic retries.

The detector scope seals the annotation digest without exposing its contents to the model. Tracking preparation carries that digest forward and hashes the complete detector inputs/results/association. The scorer requires matching annotation and invocation-plan hashes, every result/annotation frame exactly once in order, source/time/image integrity, valid boxes and the frozen scoring policy. Completed model outputs are never rewritten for scoring.

## What the score means

**Any-candidate box coverage:** does at least one parcel candidate overlap the provisional target box at IoU ≥ 0.5? This may select a different candidate every frame; it does not establish tracking continuity.

**Locked-ID box coverage:** at the first unique match (IoU ≥ 0.5, margin ≥ 0.1 over the next candidate), select that predicted ID for evaluation and retain it through the annotated continuity segment. No switch after drift/disappearance. This is ground-truth-assisted evaluation association, not an application capability for choosing the right parcel. A new segment can acquire a new ID; its separate acquisition is disclosed.

All frame counts and unscorable frames remain visible. Unscorable frames have no guessed box and no success/failure score. Candidate counts are recorded, but unmatched predictions are not automatically called false positives because only the target parcel is annotated. Review actual masks/detections as well as these box proxies. These two selected, difficult sources are not a representative held-out benchmark or the twelve-clip normal/rough/unclear feasibility set.

Results will be appended after the single local run. No paid scope is open.
