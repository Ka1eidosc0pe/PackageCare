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

## Single-run result

Both local runs completed once, with the original annotation digest intact and no retries. [Computed frame-level scores and receipts](../evaluation/tracking-validation-results.json).

| Source | Scoreable / total frames | Detector target-box hits | Tracker any-candidate hits | Tracker locked-ID hits | Unscorable |
|---|---:|---:|---:|---:|---:|
| Office | 8 / 16 | 2 / 8 | 4 / 8 | 4 / 8 | 8 |
| Porch | 10 / 16 | 8 / 10 | 10 / 10 | 10 / 10 | 6 |

Office object 2 is first seeded/acquired at **1,375 ms**. It retains the parcel at **1,875 and 2,125 ms**, where the detector has no parcel candidate. It cannot recover the earlier **375/625/875/1,125 ms** misses because no correct seed existed then and this is forward-only tracking. Later descent/occlusion frames remain unscorable; predictions there do not establish release or landing. Object 1 persistently follows a foreground office object rather than the parcel.

Porch object 1 is acquired at **124 ms** and independently matched again at the annotated segment boundary **1,861 ms**. The same numeric ID across that boundary is not evidence of physical continuity. It adds the **3,102/3,351 ms** cropped-carton frames missed by the detector. Masks visually follow the actual carried carton, including the approach/camera-filling interval. Other seeds follow a planter and part of the vehicle; stable masks do not establish parcel semantics. Near-full camera coverage and out-of-frame intervals remain explicitly unscorable. Boxes alone are a weak proxy for segmentation, especially for camera-filling objects.

The CPU detector processed 32 frames in **51.918 s** after initialization. Local MPS tracking processed every frame in **44.252 s** after model load, **36 forwards / 89 object evaluations / 79 saved object-frame predictions**. All automatic seeds were considered (4 / 8), with 5 possible duplicates suppressed; accepted 2 / 5. Fallback remained disabled. These are different source/seed workloads from the previous three-case speed comparison; do not claim a speedup from comparing their total runtimes. Model initialization, source acquisition and annotation are excluded; this is not end-to-end application latency.

**Decision:** retain forward tracking as a useful candidate-localization component. It improves box coverage on additional sources once correctly seeded. The next weaknesses to address are early small-parcel acquisition and semantic false seeds. These results do not justify training an action classifier, adopting an application adapter or passing Gate B: no new normal-versus-rough handling decision was tested, fourteen frames are unscorable and the annotations have no independent reviewer. Preserve the full PRD evaluation requirement.

Source and annotations were committed as **8c1d370766e3ac7a816b9cf8f7f09bdc6ea802cf** before inference. It passed [CI 39305318048](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39305318048): application tests/build, twelve dependency-free CV checks, Ohio synthesis, Linux image, FFmpeg and packaged runtime smoke. Operational checks also confirmed changed-annotation refusal, score-output overwrite refusal and model-run replay refusal before model imports, preserving original annotations/results/receipts byte-for-byte. No extra model inference was used for these checks.

Local paths: `data/tracking-validation/detection/`, `tracking/attempt-1/`, source snapshots under `source/`; detection scope SHA256 `9b87acd9b4ad8ab47fc60b04e661b1dfc0c7edcf858ba07849837e9815d92d27`, tracking scope `005d4b183f9c85cb0c4f4d4dc17ba459f3c228cc6ecf496517e8aab04bf4f712`. No paid scope is open. No training, AWS call, media upload, deployment, external message or public media publication occurred. Production app, preview and saved reports remain unchanged.
