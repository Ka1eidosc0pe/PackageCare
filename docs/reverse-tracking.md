# Offline completion before the first detector seed

The forward test acquired the small office parcel late, missing four earlier scoreable frames. PackageCare analyzes saved clips, so a later automatic detection can potentially help locate the same candidate earlier in the clip. The [official SAM2 video API](https://huggingface.co/docs/transformers/model_doc/sam2_video) supports reverse propagation; the installed implementation was checked too. This is an offline candidate-localization experiment, not real-time detection or handling assessment.

## Frozen scope before inference

[Machine-readable scope](../evaluation/reverse-prefix-scope.json), plan SHA256 `4f0964f71c4a49faae16940d2801736ed67edab59a132637591fa5ee80aa4caa`. Same two source recordings, all 32 full prepared frames and unchanged [provisional visual annotations](../evaluation/tracking-validation-annotations.json). The earlier forward results informed this development choice; these recordings are now reused, not held out. No manual parcel ID, release time, region crop or annotation content enters the new model inputs.

Every candidate accepted by the completed forward mask-agreement policy is considered. Candidates first seeded at frame zero have no earlier work. The remaining four automatically derived jobs are office object 2 at 1,375 ms; porch object 3 at 620 ms, object 7 at 3,102 ms and object 8 at 3,599 ms. False candidates are included. Initialize each from its original first detector box, then propagate backward to frame zero in a separate session. **37 maximum local single-object calls**, including four seed initialization calls; zero new detector calls. Same SAM2.1 Tiny weights, float32/local MPS/CPU preprocessing/four threads, no fallback, variants, retries, training or cloud calls.

Original forward metadata and masks are copied into a new derived run and never overwritten in the original. A reverse prediction can only add an object **before** that object's detector-seed frame. Nonempty positive-presence predictions are compared with existing masks using the unchanged unique-overlap rule: IoU ≥ 0.6 and margin ≥ 0.1 marks a possible duplicate; ambiguous/new candidates remain. This is not identity proof or semantic verification. Raw predictions, including suppressed/nonvisible ones and seed initialization masks, are retained separately.

Added metadata and review sheets say **backward** and identify the later conditioning offset. These predictions depend on future footage relative to the displayed frame; they cannot be presented as a live alert or a detection available at that earlier instant. Existing forward objects remain intact. Completion cannot fix a candidate that is never detected anywhere, and may propagate false seeds or drift into unrelated regions. The annotated porch discontinuity remains an evaluation boundary, not a model correction.

## Evidence and stop criteria

Prepare without ML imports; hash every parent plan/result/receipt/image/mask and the model artifacts. Re-derive the entire job list at runtime and reject a selected/retimed job, altered evidence, annotation lineage or existing output directory. Keep partial results on failure. No automatic restart or CPU/cloud fallback.

Score the derived 32-frame result using the same frozen annotations, IoU ≥ 0.5 and first unique locked-ID evaluation. Compare early office misses, porch coverage, duplicate candidates, retained forward evidence and runtime. Review actual masks, not only box overlap. Unscorable frames remain unscorable. A coverage gain cannot establish release/support, train a classifier or pass the twelve-source handling gate.

Sixteen standard-library checks pass locally, including automatic job coverage, retiming/pre-seed evidence refusal, future-conditioning provenance and refusal to overwrite/delete forward evidence. Source/CI and actual inference outcomes follow. No paid scope is open; the production app/preview/model allowlist remains unchanged.
