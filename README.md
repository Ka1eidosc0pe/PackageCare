# PackageCare

**A clearer record of how your delivery was handled.** PackageCare turns Ring doorbell footage into an evidence-linked handling timeline. The recipient reviews it, records damage separately, and exports a report they control. Built for the **Ring** track and the **AWS Builder** mini challenge of Amazon's 2026 developer hackathon.

![Delivery review](docs/media/delivery-review.jpg)

## Try it

- **Live app on AWS:** https://v98w5ez7g7.execute-api.us-east-2.amazonaws.com. The workspace password is in the Devpost submission's testing instructions. Four AI-generated demo deliveries are already analyzed. To test new footage, choose **Import footage** with any clip from [`samples/`](samples/). Analysis takes about 1.5 minutes; the first upload after the app has been idle can take about 8 minutes while the Lambda container starts.
- **Demo video:** linked from the Devpost submission.
- **Run locally:** see [Run it locally](#run-it-locally). Ring live view runs locally with a temporary Ring Developer Playground token.

## What it does

1. **Connects to Ring.** Official Partner API: token connection, device discovery, live view over WHEP, and in-browser capture of a 12-second clip. The original bytes are kept and the clip is labeled as a browser recording.
2. **Analyzes handling.** A video classifier scores every 2-second window of the clip for *toss/drop* versus *placement*. The strongest segment becomes a timeline observation linked to the exact frames. If nothing clear is visible, the app abstains with "Unable to assess" instead of guessing.
3. **Puts the recipient in charge.** They confirm, correct or dismiss each observation and record damage, notes, a shipment reference and photos. Model observations and recipient statements stay separate; a toss never implies damage.
4. **Exports a report.** It is previewed first, frozen as a version, then exported as a ZIP with a printable report, the evidence frames, the source video and a SHA-256 manifest. Nothing is sent anywhere automatically.

## How the handling model was built

Real, licensed doorbell footage of packages being thrown is nearly impossible to get, and prompting general multimodal models (Nova, Qwen, Mistral, a local Qwen 27B) did not reliably detect brief tosses. So we:

1. **Generated ~490 labeled doorbell clips** with an AI video model (Seedance via fal.ai). The prompts vary camera (fisheye doorbell, high porch, distant CCTV, apartment door), setting, lighting (day, dusk, rain, night IR), courier, parcel and action. Actions are toss, drop, careful placement, no handling, and handling hidden from view.
2. **Degraded each clip** to look like a real camera (lens distortion, low resolution, blur, noise, heavy compression).
3. **Extracted features with a frozen [V-JEPA 2](https://huggingface.co/facebook/vjepa2-vitl-fpc16-256-ssv2) video model** and trained a small logistic-regression head on top (rough / placement / none).
4. **Evaluated only on footage the model never saw:** clips from a *different* generator (Kling), and real recordings.

Results and limitations: [docs/synthetic-classifier.md](docs/synthetic-classifier.md). Scores are not calibrated probabilities; the app shows them as evidence for the recipient to review, never as a verdict.

## Architecture (AWS)

```
Browser ──► API Gateway (HTTP) ──► Lambda: API (Express)
   │                                   │  presigned POST
   └──────── direct upload ──────────► S3 (private evidence bucket)
                                       │
                         Step Functions: retrieve → observe → verify
                                       │
                         Lambda: Worker (arm64 container: FFmpeg + PyTorch CPU
                                 + V-JEPA 2 + trained head)
                                       │
                         DynamoDB (deliveries, reviews, frozen reports)
                         EventBridge → Lambda: daily retention cleanup
```

Defined in [infra/app.ts](infra/app.ts) (CDK, `us-east-2`). Deployment notes and teardown: [docs/deployment.md](docs/deployment.md).

## Run it locally

Requirements: Node 24+, FFmpeg/FFprobe on PATH, Python 3.12. Tested on macOS (Apple Silicon, MPS) and Linux arm64 (CPU, in the Lambda image).

```sh
# 1. App
npm ci --ignore-scripts
npm run build

# 2. Classifier environment and the frozen V-JEPA 2 checkpoint (~1.5 GB, public, MIT)
python3.12 -m venv data/cv-env
data/cv-env/bin/pip install -r experiments/synthetic/requirements.txt
data/cv-env/bin/python experiments/local_cv/fetch_model.py --actions \
  --model-dir data/local-action-small-model --receipt-dir data/local-action-small-model

# 3. Start with the local classifier (use PACKAGECARE_DEVICE=cpu on machines without Apple MPS)
PACKAGECARE_ANALYZER=local DATA_DIR=data/demo PORT=3012 npm start
```

Open http://127.0.0.1:3012, choose **Import footage** and pick any clip from [`samples/`](samples/). These are AI-generated doorbell clips, never used in training, with a toss, a drop, a night-time toss, careful placements and a hidden delivery. Analysis takes a few seconds on Apple Silicon. The trained head ships in [`models/handling-classifier.joblib`](models/) (75 KB) with its held-out evaluation results. **Connect Ring** takes a temporary Ring Developer Playground token. Sample deliveries (`npm run fixtures`, then **Explore sample deliveries**) are scripted animations and are labeled as such. Without `PACKAGECARE_ANALYZER=local`, the app uses Amazon Bedrock Nova Lite instead.

| Command | Purpose |
|---|---|
| `npm test` | Domain, API, adapter, media, report and classifier-mapping tests |
| `npm run build` | Type-check and build the web client |
| `npm run infra:synth` | Synthesize the CDK template (no deployment) |
| `bash scripts/deploy.sh` | Interactive deploy to `us-east-2` (billable; asks before IAM changes) |
| `python3 scripts/cloud-smoke.py URL clip.mp4` | Upload a clip to the deployed stack and follow it to a result |
| `scripts/synthetic/*` | Generate, review, augment and label synthetic clips ([details](docs/synthetic-classifier.md)) |
| `experiments/synthetic/*` | Embed, train, score and run the classifier |

## Product boundaries

PackageCare describes visible handling and keeps recipient statements separate. It does not identify delivery workers, infer intent or blame, assert damage to contents, detect theft, or submit complaints. Recipient-approved carrier escalation is a labeled roadmap concept only.

## Docs

- [Friction log](docs/friction-log.md): tool and API feedback from building this
- [Handling classifier](docs/synthetic-classifier.md): data, training, held-out results and limitations
- [AWS deployment](docs/deployment.md): stack, deploy, smoke test and teardown
- [Footage sources and credits](docs/footage-sources.md)

Generated clips are AI-generated and are labeled as such wherever they appear. Third-party footage used for evaluation keeps its credits ([docs/footage-sources.md](docs/footage-sources.md)) and is not redistributed in this repository.
