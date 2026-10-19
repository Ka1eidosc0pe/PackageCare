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

## Actual result and visual failure

One local run completed **37 single-object calls / 37 retained raw predictions in 21.216 s** after model load. Zero new detector calls, retries, CPU fallback or cloud calls. Source committed before inference as **b136503c08c40f6c789e01c868c6942b2dd35789**; [CI 39307205445](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39307205445) passed application tests/build, sixteen dependency-free CV checks, Ohio synthesis, Linux image, FFmpeg and runtime smoke.

| Source | Detector | Forward only | Forward + reverse prefix | Guarded saved-mask replay |
|---|---:|---:|---:|---:|
| Office scoreable target frames | 2/8 | 4/8 | 7/8 | 7/8 |
| Porch scoreable target frames | 8/10 | 10/10 | 10/10 | 10/10 |

Locked-ID counts match within the annotated continuity segments. The office parcel is now matched from 375 ms using its later 1,375 ms detector seed. It recovers 375/625/875 ms; **1,125 ms remains below threshold (IoU 0.4727)**. Keep that miss and the unchanged visual annotation. Fourteen unscorable frames remain unscorable.

**Do not adopt the unfiltered reverse variant.** Visual review found porch object 7 spilling onto the person's legs before its seed, despite unchanged target-box scores. The seed mask comes from a boundary-truncated carton filling much of the camera. Object 8's seed fills the image. Their extra candidates expose a failure that target-only box coverage does not measure. All 79 original forward object masks/metadata are preserved exactly; the unfiltered derived view has 93 object-frame predictions (14 additions). Raw reverse decisions: 14 additions, 5 possible duplicates, 14 nonvisible prefix outputs, plus four seed initializations. Stable forward evidence is not sufficient to validate every added reverse candidate.

## Post-hoc interior-seed guard — zero new inference

Added `interior_positive_seed_v1`: allow prefix completion only when the saved forward seed mask is nonempty/positive-presence and its bounding envelope lies strictly inside all four image edges. No hand-selected ID or action time. Every reverse job is still considered; the rule excludes porch 7/8 and retains office 2 and the interior vehicle candidate porch 3. An interior mask can still be semantically false; this rule does not establish parcel identity or eliminate drift.

Replayed **all 37 saved raw masks** from the immutable parent, reusing the same duplicate policy and adding only eligible prefixes into a fresh copy of forward results. **Zero model calls.** Twenty-six prefix outputs from boundary-seeded jobs are withheld, including outputs already nonvisible in the unfiltered result; these are not 26 proven false masks. Seven additions remain (five office-parcel frames and two vehicle-candidate frames), for 86 object-frame predictions. Original forward masks/objects remain byte/array-identical; no backward object 7/8 remains in the derived prefix. All raw masks are retained, including rejected predictions.

The unchanged coverage table conceals the important visual difference: the guard withholds the observed leg-spill additions without losing the office recovery. **The guard was selected after seeing that failure. This is development replay, not independent validation.** Future testing must include boundary-truncated parcels, interior false seeds and occlusion; target-only coverage cannot be the sole adoption metric. No handling classifier or production adapter is adopted.

[Computed scores, hashes and limitations](../evaluation/reverse-prefix-results.json). Local evidence: `data/tracking-reverse-prefix/attempt-1/` and `data/tracking-reverse-interior/attempt-1/`. A final-helper zero-model replay under `data/tracking-reverse-interior-reproduction/` reproduces plan/results byte-for-byte and retains the exact helper snapshot. Portable prefix preparation also reproduces the original scope hash. Existing model/replay outputs refuse overwrite before model imports and leave completed receipts/results unchanged.

Eighteen standard-library checks pass locally, including automatic job coverage, retiming/pre-seed evidence refusal, future-conditioning provenance, refusal to overwrite/delete forward evidence and positive/interior-seed requirements. Guard source **b436b4d100dc6f779af51f9941e9a92a56b8c413** passed [CI 39308342144](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39308342144): application tests/build, all eighteen CV checks, Ohio synthesis, Linux image, FFmpeg and packaged HTTP/frontend runtime smoke. No paid scope is open; production app/preview/model allowlist remains unchanged. Semantic parcel validity, action evidence and independent handling quality remain open; no training occurred.
