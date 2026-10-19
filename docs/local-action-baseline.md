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
