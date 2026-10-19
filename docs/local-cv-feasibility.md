# Local CV feasibility checkpoint — October 19, 2026

The failed Qwen pilot closed before its action window. To examine the proposed CV direction without another paid scope, ran a **local pretrained parcel/hand localization prerequisite**, then a conservative association diagnostic. No training or application integration occurred. This does not replace Gate B with object detection.

## What actually ran

- Same three development excerpts, all sixteen uniform prepared frames each: **48 local CPU inferences**. No expected labels, action times, source titles or manually selected boxes entered the model. Scope was saved and hashed before inference.
- Public [Grounding DINO Tiny](https://huggingface.co/IDEA-Research/grounding-dino-tiny), publisher-listed Apache-2.0, pinned revision/checkpoint, safetensors only, remote code disabled. It detects text-described objects; it is not a package-handling action classifier. [Official model/API documentation](https://huggingface.co/docs/transformers/model_doc/grounding-dino).
- Fixed query `cardboard box. parcel. hand.`, thresholds 0.3/0.25, CPU, four threads, no gradients. All image/model hashes checked before loading. Model artifacts downloaded anonymously; **no images were uploaded**. Inference was offline. Python packages isolated under ignored data; production dependencies/container unchanged.
- All 48 completed. Processing/overlays/checkpoints: **89.544 s** after model initialization; median inference/postprocessing **1.824 s/frame**. These are development workstation measurements, not AWS latency. No AWS/model-service billing operation occurred.

## Observations, including failures

Counts below mean at least one raw candidate detection in a frame. They are **not recall, precision, correct-object coverage or action accuracy**; manually annotated bounding-box ground truth is absent.

| Development excerpt | Frames with box/parcel candidate | Frames with hand candidate | Visual findings |
|---|---:|---:|---|
| Van loading / annotated release | 14/16 | 11/16 | Some cartons/hands localized, including an airborne carton at 1,875 ms. The relevant airborne carton is missed at 1,625 ms despite other detections. Support → release → landing cannot be established from a continuous correct-object track. |
| Controlled postal placement | 16/16 | 16/16 | Foreground cartons and hands often found, along with many background/duplicate candidates. A hand box alone does not establish hand contact or parcel support. |
| Ring package already at rest | 16/16 | 0/16 | Real parcel repeatedly localized, but doormat and shrub/background regions also receive box/parcel labels. Stable false positives show why persistent boxes are not delivery observations. Placement remains absent. |

Reviewed all three annotated contact sheets and the original frames. No example was reclassified or removed to improve the result. Raw scores/boxes/frame IDs/times, pinned environment, scope, checkpoint receipts and sheets remain in `data/local-cv-baseline/`. Sources retain the [frozen provenance](../evaluation/handling-pilot-sources.json). The DVIDS postal excerpt retains its creator credit and required notice: “The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.” No public media publication occurred.

The subsequent conservative box-association diagnostic produced 10/35/3 candidate tracks across the three clips; longest tracks spanned 4/13/16 sampled frames respectively. It refuses ambiguous mutual matches and gaps above 300 ms, rather than filling missing detections. These are **heuristic candidate tracks**, not verified parcel identities. The Ring result includes persistent false tracks. The loading result does not establish the required continuous release evidence. Association parameters were chosen after inspecting this development run; no held-out tracking score exists.

## Training-data audit

Audited all **47 recording annotations / 395 activity instances** in the already acquired CAP detection validation archive, without exposing unrelated collector/device metadata. Found **37** broad action matches: 27 put-down activities, three drops, and seven throws. These are publisher labels, not 37 parcel examples or independent recordings.

Inspected raw source moments for all three `person_drops_object` examples plus `person_throws_object_into_air` and `person_throws_object_to_ground`: dishes/household items, laundry and play activities rather than suitable delivery-carton positives. Previously inspected box packing/carrying also did not supply the needed controlled carton lowering. Retained original archive verification, extracted-source hashes and allowlisted activity/time audit under `data/research-cap/`. Do not relabel these objects as packages.

[CAP's publisher](https://github.com/visym/cap) offers CC BY4.0 consented activity footage, but the small acquired set is explicitly its **validation** split. Do not train on it and then claim an independent CAP validation result. Publisher training archives are 288/386 GB; neither was downloaded. The available footage may support generic pretraining research, but task relevance, full source access, group splits and parcel-action annotation remain unresolved. MEVA's inspected exemplars have burned-in labels and remain excluded; no raw training corpus was acquired.

Three current PackageCare source groups are development controls. Forty-eight frames, crops or augmented copies do not turn them into independent training/evaluation recordings. They cannot establish doorway/night/occlusion/parcel-variety coverage or satisfy the PRD's twelve distinct clips.

## Decision

A local CV route is technically practical: pretrained weights run on this workstation and yield machine-readable parcel/hand candidates without cloud inference. **Useful handling detection is still unproven.** Do not fine-tune on three recordings, promote the detector, infer force/weight/damage from image coordinates, or turn a disappearance into a confirmed drop.

Recommended next stage is to validate parcel identity tracking and support/release visibility on independently labeled footage before a training commitment. If tracking cannot maintain the relevant object through blur/occlusion, a temporal head on those tracks will inherit that gap. Custom temporal training becomes a considered proposal only after suitable task data, grouped splits and a comparison protocol exist. A generic Kinetics classifier's published classes/benchmark numbers are not PackageCare performance.

The owner's choice between further tracking validation and prioritizing training-footage collection is pending. No paid scope is open. No training, deployment, final model selection or product-scope change follows from this free prerequisite. [Reproduction helpers and meaningful software checks](../experiments/local_cv/README.md) are separate from production code.
