# Local temporal-action baseline

Tracking now supplies useful parcel localization, but neither tracking nor the earlier structured-model diagnostics establishes useful handling classification. Inspected the saved Qwen response and contract: the received text has no observations, so no deterministic parser repair can recover missing visual facts. No new paid prompt variant is authorized or invoked.

## Frozen five-clip test

Test a pretrained temporal classifier, [Meta V-JEPA 2 ViT-L / Something-Something V2](https://huggingface.co/facebook/vjepa2-vitl-fpc16-256-ssv2), publisher-listed MIT, revision `4aa02df83918538fc21cfaf576382fa20e489a80`. Safetensors SHA256 `35aeab96e8513d9cc60ee08c1642dd121c86452c926ce3599b3317896a320396`; four public files / **1,502,038,721 bytes** acquired anonymously. Same isolated Python environment, no production dependencies/model change. No custom training.

The larger ViT-g checkpoint was initially identified and its 4.5 GB download finished before cancellation. It has **not been invoked**. The smaller native 16-frame checkpoint was verified before any inference and chosen for this fixed test; do not silently substitute the giant model later. VideoMAE variants were inspected but not acquired/invoked; their publisher-listed noncommercial terms were not adopted as this product's model license.

[Sealed scope](../evaluation/local-action-scope.json), plan SHA256 `fcedf5067b271d4a3df592a383100d0a711c4c3609eb80f7455bc93b21f9050e`. Five existing distinct development recordings, all sixteen uniformly prepared frames each, **80 frames / maximum five local model calls**, one entire clip per call:

1. Van loading: visible airborne carton, obscured landing; outside doorstep domain.
2. Postal sorting: controlled placement; outside doorstep domain.
3. Actual connected Ring Playground browser capture: parcel already at rest, placement absent.
4. Office delivery: distant parcel, railing obscures descent.
5. USDA porch: approach/position discontinuity and camera-blocking carton, final contact obscured.

Credits, original/excerpt fingerprints and edits remain in [the first three-source record](../evaluation/handling-pilot-sources.json) and [additional-source record](../evaluation/tracking-validation-sources.json). Ring remains owner-connected local browser capture, not native-provider byte attestation. No media publication or upload.

No selected action time, parcel box, tracker mask, expected answer or prompt is given to the model. Every source frame is retained in order. Inputs are aspect-preserving full-frame letterboxes at 256×256, bilinear resize, RGB fill 124/116/104, ImageNet mean/std normalization. This deliberately preserves the field of view rather than using the publisher's default center crop, which could exclude an approaching parcel. It is a development preprocessing choice, not a claim to reproduce public benchmark scores. Native model configuration expects sixteen frames / 256 pixels.

All five actual input contact sheets were inspected before inference. Frozen raw RGB hashes seal the prepared pixels; invocation recomputes them and refuses changes. The visible carton/release sequence remains in the input. Contact-sheet timestamp headers are not part of model pixels. Exact model inputs are retained locally as arrays.

## Outcome contract and limits

Local MPS, float32/SDPA/four CPU threads, model eval/inference mode, allocator fraction 0.5, CPU fallback disabled. Load only hashed local safetensors/config; no remote code or network during inference. One call per case, at most five. Preserve every native class logit and ranking; continue across semantic misses, stop on operational/nonfinite/shape failure. No automatic retry or alternate input/model/dtype. Existing output directory refuses replay before importing ML libraries.

Predeclare generic release/drop and placement class-ID groups from the native vocabulary for rank summaries. **These are not PackageCare risk labels.** Throwing/catching or putting something down does not by itself establish mistreatment, parcel identity, damage, support, blame or intent. Softmax scores are closed-set classifier scores, not calibrated handling certainty. The head always ranks one of 174 classes and has no native unknown/abstention category; inspect the at-rest case for forced-action errors. No action timestamp or evidence-linked observation is supplied by a whole-clip class.

This test asks whether a generic temporal component contains a useful discriminating signal for the next pipeline stage. It cannot pass Gate B, replace the twelve distinct normal/rough/unclear clips or authorize training/deployment. Same five development sources are reused; no held-out or independent-review claim. Results follow the single frozen run.

Twenty-one dependency-free scope/scoring/lineage checks pass locally; three new checks cover all-frame/label separation, source reuse/tamper refusal and complete finite native scores. CI runs these without ML packages/models. No paid scope is open; app/preview and saved reports are unchanged.

## Whole-clip result

One frozen local run completed all **five calls / eighty input frames in 4.477 s** after model load. Per-case processing 1.639 / 0.703 / 0.712 / 0.696 / 0.714 s, including input preparation/checkpointing. Recorded allocator/driver memory approximately 1,445 / 2,113 MiB after each call; not peak memory or application/cloud latency. No failure, retry or CPU fallback. Full native rankings/logits and actual input arrays remain in ignored `data/local-action-pilot/attempt-1/`.

| Source | Native top class | Best generic release rank | Best generic placement rank | Product implication |
|---|---|---:|---:|---|
| Van loading | Piling objects up | 7 | 2 | Whole-clip scene/action context dominates the brief toss; no useful release detection established. |
| Postal placement | Placing similar objects with existing objects | 20 | 1 | A plausible ordinary manipulation signal, not support/damage verification. |
| Ring already at rest | Showing an object next to another | 30 | 28 | Closed-set forced action; cannot be used as an observed handling event. |
| Office | Closing something | 5 | 3 | Does not establish the distant parcel's obscured handling. |
| Porch | Covering something with something | 19 | 6 | Plausible camera-covering signal, without establishing final support/contact. |

No PackageCare assessments were emitted and no product adapter adopted. Source **293d32a348bb4c6ff0a93eda7a3b7d204ef5ddcf** passed [CI 39310734514](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39310734514), including application tests/build, twenty-one stdlib checks, Ohio synthesis and full Linux runtime smoke. These checks do not establish model quality.

## One bounded automatic-window comparison

The whole-clip miss motivates one explicit temporal-localization test, rather than a manually chosen release frame. Prepare **32 uniform full frames per same source**; derive every 16-frame view beginning at indices **0, 8 and 16**. Every prepared source frame is covered, with eight-frame overlaps. Approximately two seconds/view; actual sampled offsets are recorded. No selected action annotation, tracker mask or box guides the views.

[Frozen window scope](../evaluation/local-action-window-scope.json), SHA256 `0b9c30469f76eb66b755b129c30f498b971c1037cfb57d0ce935753d56f2217e`: **five source groups / 160 unique sampled frames / fifteen native forwards maximum**. Three deterministic groups use the **byte-identical native runner** from the completed whole-clip baseline, same weights, letterbox/normalization, dtype, MPS/SDPA and memory cap. No new model download/training. All fifteen input sheets were inspected and RGB hashes sealed before inference. Each child plan has five sources/calls; the parent seals all three children, validates exact coverage/source identity/offsets and fixes the global fifteen-call bound before any invocation. Stop the whole batch on operational failure; valid semantic misses continue.

This is a new, bounded development scope after the completed five-call baseline. It does not reuse unused calls, count overlapping views as independent clips, or use a sampled window's bounds as a proven action time. No further input/model/dtype variant is part of this comparison. Results follow the single fixed batch. Twenty-three stdlib checks pass locally, including all-frame window coverage and refusal of retimed views/global-bound changes.

## Automatic-window result and decision

The frozen batch completed **all fifteen forwards** without failure, retry, fallback or cloud use. The three groups took **3.622 / 3.555 / 3.539 seconds after their respective model loads**. Each group loads the same checkpoint; the 10.716-second sum excludes those three initializations and is not total application latency. Full native rankings, exact input arrays and invocation receipts remain in ignored `data/local-action-windows/scope/run-1/`. The [machine-readable result](../evaluation/local-action-results.json) records both completed scopes, fingerprints, top-five native ranks and limits.

| Source | Top native classes, windows 0 / 1 / 2 | Best release ranks, windows 0 / 1 / 2 | Interpretation |
|---|---|---|---|
| Van loading | Putting into / Putting similar objects together / Piling up | 8 / 7 / 17 | Still misses the clear airborne carton as a useful release signal, including views spanning the release. |
| Postal placement | Pushing with / Putting similar objects together / Putting similar objects together | 72 / 54 / 84 | Ordinary manipulation/placement signal; does not establish support or absence of damage. |
| Ring at rest | Showing next to / Showing next to / Showing next to | 33 / 24 / 32 | Forced closed-set action despite handling being absent. |
| Office, obscured | Showing behind / Showing behind / Dropping behind | 18 / 2 / 1 | Last view ranks a drop, but the obscured descent is not confirmed rough-handling ground truth. Do not count it as a successful detection. |
| Porch, obscured | Moving toward camera / Moving toward camera / Covering with | 3 / 10 / 56 | Approach/camera-covering context, without a verified final placement. |

**Do not adopt this classifier as PackageCare's handling detector.** The clear toss remains missed; ambiguous footage and the at-rest control cannot be interpreted safely from a forced native class. This closes the unmodified generic-head, full-field-of-view whole-clip/window comparison. No further input/model/dtype variant is part of it. It does not establish that parcel-specific training or other temporal models cannot work; useful parcel labels and independent data remain prerequisites for that path.

Post-run verification matched all **twenty actual input arrays** to their sealed preview hashes and arrays. Both existing-output replays refused before importing Torch/Transformers; original plans and results remained byte-identical. These checks made zero model calls. Source **93286515b47f0225e668ed95982e7bee292b10c1** passed [CI 39312006857](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39312006857): application tests/build, twenty-three dependency-free local-CV/action checks, Ohio synthesis and Linux container/FFmpeg/packaged-runtime smoke. Gate B and the overall product remain incomplete. No paid scope is open.
