# Synthetic-data handling classifier

October 22, 2026. Replaces the prompt-only multimodal approach as the primary handling detector (see `handoff.md` for why those failed). Owner-approved spend on fal.ai: $5 pilot, then a $35 credit top-up for the full set.

## Approach

1. **Generate** short doorbell/security-camera clips with a text-to-video model on fal.ai, each prompt requesting one action family: `toss`, `drop`, `place`, `none` (no handling: passer-by, knock-and-leave, package already at rest, pickup) and `obscured` (handling hidden by pillar, body, bushes, darkness or framing). Prompts randomise camera (doorbell fisheye, high porch, distant driveway CCTV, top-down, apartment door), setting, lighting (day, dusk, rain, night IR), courier and parcel type. Clips carry no Ring branding.
2. **Augment** each clip with doorbell-style degradations (barrel distortion, downscale, blur, noise, colour jitter, heavy H.264), so the classifier sees footage closer to real cameras than the polished generator output.
3. **Embed** with the frozen V-JEPA 2 ViT-L/SSv2 backbone already on disk: 8 fps, 16-frame (2 s) windows every 0.5 s, attentive-pooler features.
4. **Train** a standardised logistic-regression head on clip features (max + mean over windows) for three coarse classes: `rough` (toss, drop), `placement`, `none` (none, obscured). Grouped CV keeps a clip and its augmentations together.
5. **Localise** by scoring each 2 s window with the same head; the peak window becomes the timeline segment.
6. **Evaluate only on footage never used for training:** clips from other generators (Kling, Wan) and the eight real clips in `evaluation/real-handling-labels.json`. Real clips are never trained on.

## Generator choice (pilot, 7 clips)

| Model | Physics | Surveillance look | Time | Cost / 5 s |
|---|---|---|---|---|
| Seedance v1 Pro Fast 480p | Good (arc, bounce, tumble) | Good | ~30 s | ~$0.05 (token-billed) |
| Kling 2.5 Turbo Pro | Excellent | Cinematic | ~150 s | $0.35 |
| Wan 2.2 A14B | Box morphs/vanishes | Good | ~200 s | $0.20–0.40 |

Seedance for training data; Kling for the cross-generator held-out set and demo material.

## Mini experiment (27 Seedance clips × 5 versions = 135)

- Synthetic grouped CV: 97% (same generator; optimistic).
- Cross-generator (Kling/Wan, 5 clips): 5/5.
- Real clips: van toss → rough (0.85) ✓; Ring at-rest → none ✓; postal conveyor placement → rough ✗ (warehouse, out of domain); distant SWNS CCTV throw → none ✗ (subject tiny in frame); unclear office/doorway/yard → none (acceptable abstention); camera-filling porch carton → rough ✗.
- Response: the full set adds distant CCTV views, near-miss placements and an obscured class.

## Full set and final model (v2)

- `scripts/synthetic/full-jobs.json`: 400 Seedance clips (toss 95, drop 75, place 130, none 60, obscured 40), estimated $19.44, cap $22.
- `scripts/synthetic/xgen-jobs.json`: 24 Kling clips for held-out cross-generator testing, $8.40, cap $9.
- Generation is concurrency-limited by fal (~3–4 Seedance clips/min).
- `scripts/synthetic/pipeline.sh` runs unattended after generation: 3 augmentations per clip → embed → train on mini + full → score real and cross-generator sets. Output: `data/synthetic/model/{classifier.joblib,real-eval.json,xgen-eval.json}`, log `data/synthetic/pipeline.log`.

If generation is interrupted, rerun the same `fal_generate.py` command: completed clips are skipped and already-submitted requests are fetched rather than paid for again. Then rerun `pipeline.sh` (finished steps are skipped).

## Final results (October 23)

Training: 487 Seedance source clips (400 full set + 27 mini + 60 extra placements) × augmentation = 1,975 clips; rough 740 / placement 805 / none 430. Grouped synthetic CV accuracy 90%.

**Cross-generator held-out (Kling 2.5 Turbo + pilot Kling/Wan, 29 clips): 23/29.**

| Expected → predicted | rough | placement | none |
|---|---|---|---|
| rough (15) | 14 | 0 | 1 |
| placement (10) | 3 | 5 | 2 |
| none / obscured (4) | 0 | 0 | 4 |

v1 (before the extra placements) scored 22/29 with the same placement→rough errors. The extra placement clips were added *after* seeing those errors, so the v2 re-score is not fully blind. The three remaining false alarms are genuine gentle placements (a top-down camera, a quick night-time set-down, a Wan clip), all scored ≥0.9 rough. **The model can flag a normal placement, which is why recipient review exists.**

**Real held-out clips (8, never trained on):**

| Clip | Label | Model | Outcome |
|---|---|---|---|
| FedEx van loading toss | rough | rough 0.96, peak window 0.5–2.5 s | ✓ detected |
| SWNS distant CCTV throw | rough | none 1.00 | ✗ missed (subject tiny in frame) |
| Postal conveyor placement | placement | none 1.00 | abstained (warehouse, out of domain) |
| Ring Playground parcel at rest | none | none 1.00 | ✓ |
| Office (railing-obscured) | unclear | none 0.99 | ✓ abstained |
| Porch (camera-filling carton) | unclear | none 0.81 | ✓ abstained |
| Doorway (person holding carton) | unclear | none 1.00 | ✓ abstained |
| Yard (no clear handling) | unclear | none 1.00 | ✓ abstained |

No false concerns on the six real clips without rough handling; 1 of 2 real rough clips caught. Eight clips is anecdotal, not an accuracy estimate. Machine-readable summary: `evaluation/synthetic-classifier-results.json`.

## Honest limitations

- The labels are the requested action. A sample of clips was checked visually and one mini-batch clip was excluded. The full set has only been spot-checked.
- Generated footage is cleaner and more cinematic than real doorbell video; augmentation narrows but does not remove that gap.
- Only eight real clips exist for evaluation, two of them clear rough handling. Any real-world accuracy figure from this set is anecdotal.
- Classifier scores are not calibrated probabilities. The product shows them as evidence for the recipient's review, never as a verdict.
