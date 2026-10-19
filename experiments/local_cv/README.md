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

Actual original run: `data/local-sam2/attempt-1/`, one complete 48-frame/501-object-frame run. Original prototype and scope remain alongside it. The portable preparation at `data/local-sam2-reproduction/` preserves every original frame and automatic seed and has not been inferred again. Six dependency-free tests now include tracking-seed provenance/case/time integrity. No ML package or model call is added to CI.
