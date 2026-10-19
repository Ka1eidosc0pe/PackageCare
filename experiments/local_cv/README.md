# Local parcel localization and association experiment

This is an evaluation prerequisite for the proposed CV direction. It is **not** a trained PackageCare handling model or an application adapter. It never emits `possible_rough_handling`, `no_concern_observed` or a support/release judgment. Detection scores are not calibrated probabilities of a handling concern.

The October 19 run used all sixteen previously prepared frames from each of the three frozen development excerpts. No action-time selection, region crop, training, Bedrock call, media upload or paid compute occurred. [Measured results, limitations and source credits](../../docs/local-cv-feasibility.md).

## Reproduction

Tested on Apple Silicon, Python 3.12.14, CPU with four PyTorch threads. The isolated environment and all model/media/results live under ignored `data/`. Dependencies are pinned to the environment actually used; no production Node dependency or Lambda image changed. Linux/cloud packaging is untested.

```sh
python3.12 -m venv data/cv-env
data/cv-env/bin/python -m pip install --only-binary=:all: -r experiments/local_cv/requirements.txt

# Free preparation, no model imports/networking. First prepare the ordinary
# PackageCare evaluation inputs as documented in docs/handling-pilot.md.
data/cv-env/bin/python experiments/local_cv/prepare.py \
  /path/to/prepared-three-case-evaluation/plan.json data/local-cv-new

# Anonymous public artifact download, approximately 690 MB; not inference.
# No Hugging Face account/token, endpoint or remote code is required.
HF_HOME=./data/local-cv-cache data/cv-env/bin/python experiments/local_cv/fetch_model.py \
  --model-dir data/local-cv-model --receipt-dir data/local-cv-new

# Replace the digest with the exact value printed by preparation.
# Model loading and inference are offline and use safetensors, CPU, eval()
# and inference_mode(). Every source/model file is rehashed first.
data/cv-env/bin/python experiments/local_cv/run.py \
  --plan data/local-cv-new/plan.json --plan-sha256 PREPARATION_DIGEST \
  --model-dir data/local-cv-model

# No model calls: conservative box association over already saved detections.
data/cv-env/bin/python experiments/local_cv/associate.py \
  data/local-cv-new/results.json data/local-cv-new/tracks.json

# No CV packages/model calls: source-integrity and association invariants.
python3 -m unittest discover -s tests -p 'test_local_cv.py'
```

The preparation copies every frame and strips action labels/intervals from the inference plan. It refuses changed source bytes, cross-case identifier collisions and an existing output directory. The runner refuses a changed plan/model/image or an existing invocation receipt; it saves detections per frame and preserves partial results on failure. It does not automatically fetch missing models, train, retry a failed inference, call AWS or change the app. Reproduction creates a separate experiment; never overwrite the original receipts or present a reproduction as held-out evidence.

The fixed public model is [IDEA-Research/grounding-dino-tiny](https://huggingface.co/IDEA-Research/grounding-dino-tiny), Apache-2.0, revision `a2bb814dd30d776dcf7e30523b00659f4f141c71`. Its safetensors SHA256 is `1a2412ef99bd74bcd3c2a246fa1e48581f8889a1300c9051974741314fc042f3`. Query `cardboard box. parcel. hand.`, box threshold 0.3, text threshold 0.25. These were frozen before this local run, with no subsequent model variants. [Publisher implementation](https://github.com/IDEA-Research/GroundingDINO), [Transformers API](https://huggingface.co/docs/transformers/model_doc/grounding-dino).

Association is an explicitly heuristic diagnostic added after inspecting detections: NMS IoU 0.6; link IoU at least 0.3; mutual best match with a 0.1 ambiguity margin; maximum 300 ms gap. Missing or ambiguous matches start separate tracks rather than inventing an identity or interpolated trajectory. Persistent false detections can still form persistent false tracks. Association parameters were not independently calibrated. No action classification follows from these tracks.

Actual original run: `data/local-cv-baseline/`, prepared before the checked-in portable helpers. Original plan digest `c8232052f17a4877815cdb48856bded3a96a75f8207bbc2ccd5384a0c4d425ac`. A free portable preparation at `data/local-cv-reproduction/` was checked to preserve all 48 original IDs, offsets and image hashes; it has **not** been inferred again. Existing-run refusal was exercised before model import and left original receipts/results byte-identical. The original prototype is preserved alongside its receipts. This distinction prevents claiming the generalized helper itself received a second full model run.

## Forward video masks

Owner chose tracking validation before training. [SAM2 results and limits](../../docs/sam2-tracking.md): automatic initial seeds recover the moving carton through the detector miss, but duplicate/background seeds, occlusion uncertainty and processing time remain. This is still an experiment, not an action classifier.

```sh
# Uses every candidate's first automatic detection; rejects edited/selected tracks.
data/cv-env/bin/python experiments/local_cv/prepare_tracking.py \
  data/local-cv-new data/local-tracking-new

# Public SAM2.1 Tiny artifact download (~156 MB), no inference or media upload.
HF_HOME=./data/local-cv-cache data/cv-env/bin/python experiments/local_cv/fetch_model.py \
  --tracker --model-dir data/local-sam2-model --receipt-dir data/local-tracking-new

# Offline CPU inference, only forward propagation; no future corrections.
data/cv-env/bin/python experiments/local_cv/track_masks.py \
  --plan data/local-tracking-new/plan.json --plan-sha256 PREPARATION_DIGEST \
  --model-dir data/local-sam2-model --output data/local-tracking-new/attempt-1

# Display selected saved masks only; this does not change model inputs/results.
# Omitting --objects renders every seeded object for that case.
data/cv-env/bin/python experiments/local_cv/review_masks.py \
  --plan data/local-tracking-new/plan.json --run data/local-tracking-new/attempt-1 \
  --case 0 --objects 1 5
```

Actual original run: `data/local-sam2/attempt-1/`, one complete 48-frame/501-object-frame run. Original prototype and scope remain alongside it. The portable baseline preparation at `data/local-sam2-reproduction/` preserves every original frame and automatic seed and has not been inferred again. The generalized runner subsequently completed a gated CPU comparison and the same policy on local MPS; see [measured results](../../docs/sam2-tracking.md). Eight dependency-free tests include seed provenance/case/time integrity and conservative duplicate gating. No ML package or model call is added to CI.

For the measured policy, prepare a **new** scope with `--mask-agreement`; optionally add `--device mps` for a local Apple GPU. CPU remains the default. Copy the already verified tracker `model-receipt.json` into the new scope, or fetch artifacts using the command above. Use the printed new plan digest when running. Do not edit an old plan or reuse its output directory. MPS availability is checked explicitly and CPU fallback is disabled; an unavailable/unsupported backend stops the attempt. CPU preprocessing/video storage and float32 were used in the actual GPU run.

The policy records `possible_duplicate` only when a current positive, nonempty mask uniquely agrees with the new seed (box IoU ≥ 0.6, margin ≥ 0.1). It keeps new/absent/ambiguous candidates. It cannot reject a semantically false parcel, establish identity through occlusion or infer handling. Probe and recomputation calls are counted separately; at most 96 forwards are allowed for the 48-frame comparison. Saved review sheets distinguish suppressed seeds from objects not yet seeded.

## Additional-source validation

Helpers now accept **one to three distinct development sources**, with **all sixteen prepared frames per source**, at most 48 images and 35 automatic seeds per case. Smaller batches are not padded with reused clips. Tracking has at most twice the prepared frame count in forward calls. Existing three-case runs/receipts remain historical evidence with their original source snapshots.

[Additional-source protocol and frozen annotations](../../docs/tracking-validation.md) distinguish parcel-box coverage from locked-ID continuity. The standard-library scorer makes no model calls:

```sh
python3 experiments/local_cv/score_tracking.py \
  --plan /absolute/path/to/tracking/plan.json \
  --run /absolute/path/to/tracking/attempt-1 \
  --annotations evaluation/tracking-validation-annotations.json \
  --mode tracking --output /absolute/path/to/new-score.json
```

Use `--mode detection` with the detector plan/run directory for box-only coverage. The annotation digest must have been sealed in the inference plan before invocation and must match the receipt; the scorer refuses missing/reordered/changed evidence and existing score outputs. Single-agent approximate visual annotations are provisional, not independently adjudicated truth. Unscorable frames remain explicit. No handling verdict is produced.

## Offline prefix completion

[Frozen reverse-tracking experiment](../../docs/reverse-tracking.md) reuses an already completed forward run, considering every accepted later seed and completing earlier frames only. It makes no new detector calls and explicitly labels predictions conditioned on later footage. It is not a live detection claim.

```sh
python3 experiments/local_cv/reverse_prefix.py prepare \
  --forward-plan /absolute/path/to/forward/plan.json \
  --forward-run /absolute/path/to/forward/attempt-1 \
  --output /absolute/path/to/new-completion-scope

# Exact digest and call count come from preparation; local MPS only.
data/cv-env/bin/python experiments/local_cv/reverse_prefix.py run \
  --plan /absolute/path/to/new-completion-scope/plan.json \
  --plan-sha256 PREPARATION_DIGEST --model-dir data/local-sam2-model \
  --output /absolute/path/to/new-completion-scope/attempt-1
```

At most 128 local single-object calls per prepared completion batch; the actual frozen two-source scope has 37. Original forward masks/objects are preserved, reverse raw masks saved separately, and possible duplicates withheld from the derived view using the existing policy. Unavailable MPS/unsupported operations stop without fallback/retry. Use the same `score_tracking.py --mode tracking` and `review_masks.py` on the new derived run; added masks identify their later seed offset. No ML inference is added to CI.

**The unfiltered experiment showed mask spill from boundary-truncated seeds; it is not adopted.** A post-hoc development guard replays the saved masks without loading a model:

```sh
data/cv-env/bin/python experiments/local_cv/replay_prefix.py \
  --plan /absolute/path/to/completion-scope/plan.json \
  --run /absolute/path/to/completion-scope/attempt-1 \
  --output /absolute/path/to/new-interior-replay
```

Only positive seed masks strictly inside image boundaries qualify; other jobs remain in the audit record but cannot add derived prefix masks. The helper checks the complete raw prediction sequence/conditioning times and mask identities/shapes/areas/envelopes, seals input digests, preserves forward evidence and refuses existing output. It uses NumPy/Pillow for saved-file replay, **no model calls or networking**. Scoring/review work on the emitted `plan.json` and `attempt-1/`. This guard was selected from observed failures; it needs independent validation and still admits interior background candidates. Eighteen dependency-free checks run in CI; they do not establish model accuracy.
