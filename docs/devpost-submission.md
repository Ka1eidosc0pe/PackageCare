# Devpost submission: PackageCare

Copy each section into the matching Devpost field. Images are in [`docs/media/submission/`](media/submission/). Fill in the two placeholders marked **TODO** (the video URL, and the password copied from your local file).

---

## Project name

PackageCare

## Elevator pitch (tagline)

**Was your package thrown? PackageCare turns Ring footage into an evidence-linked handling timeline and a damage report you control.**

Shorter alternative: *A clearer record of how your delivery was handled.*

## Thumbnail

`docs/media/submission/00-thumbnail.jpg` (1500×1000, 3:2)

## About the project

```markdown
## Inspiration

There are few things worse than finally getting the package you've been waiting for, opening it up, and finding it damaged. The excitement turns into dread about the work it takes to sort it out: scrubbing through doorbell footage, guessing at timestamps, and writing everything up by hand. Ring already tells you a package *arrived*. We wanted to show *how* it arrived, without turning an uncertain model guess into an accusation.

## What it does

- **Connects to Ring** through the official Partner API: live view over WHEP, plus in-browser capture of a 12-second clip with the original bytes preserved and labeled as a browser recording.
- **Analyzes handling**: a video classifier scores every 2-second window for toss/drop versus placement. The strongest segment becomes a timeline observation linked to the exact frames, with a handling-activity chart and a one-tap slow-motion replay. When the handling isn't visible, it says **"Unable to assess"** instead of guessing.
- **Puts the recipient in charge**: they confirm, correct or dismiss each observation and record damage, notes, a shipment reference and photos. Model observations and recipient statements stay separate, because a toss doesn't imply damage and damage doesn't prove a toss.
- **Exports a report**: it is previewed first, frozen as a version, then exported as a ZIP with a printable report, the evidence frames, the source video and a SHA-256 manifest. Nothing is sent anywhere automatically.

## How we built it

- **App**: React + Vite + TypeScript UI, an Express API, FFmpeg/Sharp media preparation, and strict domain validation (every observation must cite frames inside its own time range).
- **Ring**: Partner API token connection, device discovery, WHEP live view, browser capture and recording-history import.
- **The handling model**: real, licensed footage of packages being thrown is nearly impossible to get, and general multimodal models (Amazon Nova Lite, Qwen3-VL, Mistral Large 3 and a local Qwen 27B) either missed brief tosses or invented details. So we:
  1. generated ~490 labeled doorbell clips with an AI video model (Seedance via fal.ai), varying camera, setting, lighting, courier, parcel and action (toss, drop, placement, no handling, hidden);
  2. degraded them to look like real cameras (fisheye, low resolution, blur, noise, heavy compression), giving ~2,000 training clips;
  3. extracted features with a frozen **Meta V-JEPA 2** video model and trained a small classifier on top;
  4. tested only on footage it had never seen: clips from a *different* generator (Kling) and real recordings.
- **AWS (us-east-2)**: one CDK stack. Browser uploads go straight to a private S3 bucket through presigned POSTs. Step Functions orchestrates retrieve → observe → verify on an arm64 Lambda container running FFmpeg, PyTorch (CPU), V-JEPA 2 and our classifier. DynamoDB holds deliveries, reviews and frozen reports, API Gateway + Lambda serve the app, and EventBridge triggers a daily retention cleanup.

## Results (honest numbers)

- Clips from another generator: **14 of 15 tosses and drops caught**; 23/29 correct overall.
- Real recordings never used in training: **no false concerns on 6 real clips without rough handling**; caught the clear real toss, missed a distant CCTV throw.
- Weakness: **3 of 10 careful placements were flagged**. That is exactly why the recipient has the final say, and why scores are shown as evidence ("strong / moderate signal"), never as a verdict.

## Challenges we ran into

- **No real handling footage.** The Ring Playground streams a parcel already at rest, and we don't own a Ring camera. Synthetic training data plus held-out testing from a different generator was our way through. Every AI-generated clip is labeled in the app, the report and the video.
- **General vision-language models weren't reliable for this narrow task.** They abstained on obvious tosses or described things that weren't there. A small task-specific classifier on strong frozen video features worked far better.
- **CPU video inference inside Lambda.** New AWS accounts cap Lambda memory at 3 GB (~2 vCPU), our first cloud run timed out from thread oversubscription, and cold starts on a 4 GB image needed longer FFmpeg timeouts. After tuning, a clip is analyzed in ~1.5 minutes warm, for about a cent.
- **Restraint by design.** Making "Unable to assess" a first-class, well-presented outcome took as much work as detection.

## Accomplishments we're proud of

- An end-to-end workflow from a live Ring stream to an exportable, versioned, hash-manifested evidence report.
- A handling classifier trained without a single real training clip, evaluated honestly on held-out footage.
- The full serverless pipeline deployed on AWS and processing real uploads.

## What we learned

"Unable to assess" builds more trust than a confident wrong answer. Synthetic data is a practical bootstrap for rare events, as long as you evaluate on data from somewhere else. And infrastructure limits (memory caps, cold starts, CPU threads) shape ML product design as much as model accuracy does.

## What's next

More real, consented doorbell footage for evaluation; per-camera calibration; and, with an authorized carrier integration, a recipient-approved hand-off of the reviewed report to the carrier's claims team (shown in the demo as a labeled concept only). PackageCare will never identify drivers or send anything without the recipient's say-so.
```

## Built with

TypeScript, JavaScript, Python, React, Vite, Node.js, Express, FFmpeg, Sharp, PyTorch, Hugging Face Transformers, scikit-learn, Meta V-JEPA 2, Ring Partner API, Ring Developer Playground, WebRTC (WHEP), AWS Lambda (container images, arm64), AWS Step Functions, Amazon S3, Amazon DynamoDB, Amazon API Gateway (HTTP API), Amazon EventBridge, Amazon CloudWatch, AWS CDK, Amazon ECR, Amazon Bedrock (Nova Lite; evaluated Qwen3-VL and Mistral Large 3), Docker, fal.ai (Seedance, Kling, Wan, FLUX), Playwright, Vitest

## "Try it out" links

- GitHub repository: https://github.com/Ka1eidosc0pe/PackageCare (private; shared with the judges)
- Live app on AWS: https://v98w5ez7g7.execute-api.us-east-2.amazonaws.com (password in the testing instructions)

## Project media (image gallery, in this order)

| File | Caption |
|---|---|
| `02-verdict.jpg` | A flagged delivery: "Possible rough handling" with the exact 2-second segment and slow-motion replay |
| `03-activity-track.jpg` | Handling activity: how strongly each 2-second window looks like a toss/drop or a placement, synced to the video |
| `04-recipient-review.jpg` | The recipient confirms the observation and records damage separately |
| `07-exported-report.jpg` | The exported incident report: summary, key frames and recipient statement |
| `08-report-timeline.jpg` | Report timeline and reviewed observations, with recipient decisions kept separate from model text |
| `05-no-concern.jpg` | Restraint: a careful placement is not flagged |
| `06-ring-capture-abstains.jpg` | A real Ring Playground capture: parcel already at rest, so PackageCare says it can't assess handling |
| `01-deliveries.jpg` | The delivery workspace (all handling clips shown are AI-generated and labeled) |
| `09-how-it-was-built.jpg` | Synthetic training data → frozen V-JEPA 2 features → classifier, tested on unseen footage |
| `10-aws-architecture.jpg` | The deployed serverless architecture on AWS |

## Video demo link

**TODO:** paste the YouTube/Vimeo URL after uploading `data/demo-video/PackageCare-demo.mp4` (2:42, 1080p).

## GitHub repo for judging and testing

https://github.com/Ka1eidosc0pe/PackageCare. The repo is private. **@AmazonAppDev is a GitHub organization and can't be added as a collaborator**, so add the Amazon Developer Relations reviewers individually (Settings → Collaborators → Add people, read access): **knmeiss** (Kourtney Meiss), **giolaq** (Giovanni Laquidara), **anishamalde** (Anisha Malde), **mosesroth** (Moses Roth), **emersonsklar** (Emerson Sklar). Invite **testing@devpost.com** by email the same way.

The repo has all source, infrastructure, tests, the trained classifier (`models/`), sample clips (`samples/`), the demo recording/assembly scripts, and setup instructions in the README. The 1.5 GB public V-JEPA 2 checkpoint is downloaded by a script rather than committed.

## Which AWS services did you incorporate and how?

PackageCare's cloud backend is one AWS CDK stack in us-east-2, built around an asynchronous, serverless evidence pipeline:

- **Amazon API Gateway (HTTP API) + AWS Lambda (API):** serves the React app and the Express API through serverless-express, behind a password-protected session.
- **Amazon S3:** a private, encrypted evidence bucket. Browsers upload videos and damage photos directly through presigned POSTs with an exact size, type and SHA-256 checksum, so large files never pass through the API. Lifecycle rules clear abandoned uploads.
- **AWS Step Functions:** orchestrates each delivery through *retrieve* (FFmpeg normalization and frame extraction), *observe* (handling analysis) and *verify*, with retries and a failure catcher that keeps the record retryable.
- **AWS Lambda (worker, arm64 container image):** a ~4 GB image with FFmpeg, PyTorch CPU, the frozen Meta V-JEPA 2 video model and our trained classifier. It scores 2-second windows and writes evidence-linked observations, in ~1.5 minutes per clip warm, for about $0.01.
- **Amazon DynamoDB:** deliveries, recipient reviews and immutable, versioned report snapshots.
- **Amazon EventBridge + Lambda:** a daily retention job that expires deliveries and orphaned files after 30 days.
- **Amazon ECR / AWS CDK / CloudFormation:** infrastructure as code and container image hosting.
- **Amazon CloudWatch Logs:** structured, redacted operational logs.
- **Amazon Bedrock:** in-Region Nova Lite remains a configurable analysis provider (`PACKAGECARE_ANALYZER` unset). We also evaluated Qwen3-VL and Mistral Large 3 on Bedrock before choosing the trained classifier.

## Friction log link

https://github.com/Ka1eidosc0pe/PackageCare/blob/main/docs/friction-log.md

## Project testing link

https://v98w5ez7g7.execute-api.us-east-2.amazonaws.com

## Testing instructions / credentials

```text
Live app (AWS): https://v98w5ez7g7.execute-api.us-east-2.amazonaws.com
Workspace password: TODO  (copy WORKSPACE_PASSWORD from data/aws-deploy/secrets.env)

1. Sign in with the workspace password. Four AI-generated demo deliveries are already analyzed:
   a toss, a drop, a careful placement (no concern) and a hidden delivery (unable to assess).
2. Open the "wooden porch daylight" delivery: see the verdict, click the timeline observation to seek,
   press "Replay moment", open "Why?" for the scores.
3. Review it: Confirm, set damage, add notes/a photo, tick "finished", Save, Preview report, Finalize,
   and download the evidence bundle (ZIP with report.html, frames, video and a SHA-256 manifest).
4. To analyze new footage: Import footage → any clip from the repo's samples/ folder (AI-generated).
   Processing takes ~1.5 minutes; the very first upload after idle can take ~8 minutes (cold start of
   a 4 GB Lambda container).

Ring live view needs a temporary Ring Developer Playground token, so it runs from the local app
(README → "Run it locally" → Connections → paste a Playground token → Capture 12-second clip).
The local app also analyzes clips in a few seconds on Apple Silicon.
```

## Feedback Q1: Which developer tools, APIs and SDKs did you use, and for what?

**Amazon Ring**
- **Ring Partner API:** token authentication, device discovery, device capabilities, recording history, and WHEP live-view signaling to stream a Ring camera into the app.
- **Ring Developer Playground:** the simulated Ring camera (Package scene) we captured real clips from, in place of a physical device.
- **Ring API hello-world starter (AmazonAppDev/ring-api-helloworld):** reference for authentication and the first API calls.

**AWS**
- **AWS Lambda (container images, arm64):** the API (Express via serverless-express) and the analysis worker, a ~4 GB image with FFmpeg, PyTorch CPU, V-JEPA 2 and our classifier.
- **AWS Lambda Runtime Interface Client (Node.js):** running our own Debian/Python-based container images on Lambda.
- **AWS Step Functions:** orchestrating retrieve → observe → verify for each delivery, with retries and a failure catcher.
- **Amazon S3:** private evidence storage; presigned POST uploads with size, type and SHA-256 checksum enforcement.
- **Amazon DynamoDB:** deliveries, recipient reviews and immutable report versions.
- **Amazon API Gateway (HTTP API):** the public endpoint for the app and API.
- **Amazon EventBridge:** a daily schedule for the retention-cleanup Lambda.
- **Amazon CloudWatch Logs:** structured, redacted logs for debugging the cloud pipeline.
- **Amazon ECR:** hosting the Lambda container images.
- **AWS CDK (TypeScript) and AWS CloudFormation:** the whole stack as code; `cdk diff` before every deploy.
- **Amazon Bedrock (Converse API):** Nova Lite as a configurable analysis provider; we also evaluated Qwen3-VL and Mistral Large 3 for handling detection.
- **AWS SDK for JavaScript v3:** S3 (including `@aws-sdk/s3-presigned-post`), DynamoDB, Step Functions and Bedrock Runtime clients in the app.
- **AWS CLI with `aws login` (new AWS experience) and AWS Settings:** sign-in with a named profile, read-only account/model checks, and project/billing management.

## Feedback Q2: For each tool, what worked well?

- **Ring Partner API:** once connected, WHEP live view was dependable and low-latency, and the REST endpoints (devices, capabilities, history) were simple and consistent.
- **Ring Developer Playground:** a quick way to get a real Ring stream without hardware; device discovery worked on the first try.
- **Ring hello-world starter:** the clearest reference we had. It got us from token to device list quickly.
- **AWS Lambda container images:** made it practical to ship PyTorch, FFmpeg and a 1.5 GB model to serverless, with no separate ML hosting. arm64 kept costs to about a cent per analyzed clip.
- **AWS Step Functions:** retries and catchers meant a failed step never lost an uploaded source, and the execution history made each run easy to inspect.
- **Amazon S3:** presigned POST with checksum conditions gave safe direct browser uploads; lifecycle rules handled abandoned uploads with zero code.
- **Amazon DynamoDB:** conditional writes made report versioning and concurrent-edit protection straightforward.
- **Amazon API Gateway + EventBridge:** essentially zero-configuration in CDK; both just worked.
- **AWS CDK:** one TypeScript stack defined everything. `cdk diff` made every deploy reviewable, and image-only redeploys took minutes.
- **Amazon Bedrock:** in-Region Nova Lite was quick to call through the Converse API with structured output; availability, pricing and model metadata were easy to check programmatically.
- **AWS SDK for JavaScript v3:** modular clients, good TypeScript types, and the presigned-POST helper saved real work.
- **`aws login` (new AWS experience):** browser-based sign-in to a named profile was painless, with no long-lived access keys.

## Feedback Q3: For each tool, what needs work?

- **Ring Developer Playground:**
  - Only an at-rest Package scene. There's no delivery being handled and no custom clip upload, so handling scenarios can't be simulated or tested end to end.
  - Tokens expire within minutes and can only be regenerated about every 30 minutes, which makes iterating and recording a demo slow.
  - There's no public page describing the scenes, media formats and limits.
- **Ring Partner API:** the WHEP session `Location` value came back in a form our first validation rejected. Documenting its format, and how long the session lasts, would help.
- **AWS Lambda:**
  - New accounts are capped at 3008 MB of memory, but `GetAccountSettings` doesn't report the cap. We only found out from a failed deploy, which rolled the stack back.
  - CPU-heavy work in a 2-vCPU function oversubscribed threads by default (our first run timed out after 10 minutes; pinning 2 threads brought it to 70 s).
  - Cold starts on a large image needed longer timeouts. Guidance on sizing ML container images would help.
- **Lambda Runtime Interface Client:** v4 needs autotools in slim images, and its `_HANDLER` startup contract isn't clearly documented for custom base images.
- **AWS CDK / CloudFormation:**
  - Approving IAM changes needs a TTY, and that fails when stdout is piped (e.g. through `tee`).
  - A rolled-back first create left `RETAIN` resources (an empty S3 bucket and table) orphaned, with no warning.
- **Amazon Bedrock:**
  - A newly authorized model returned "too many tokens per day" on its very first call, with zero quota and no clear path to request more.
  - Mistral Large 3's three-image limit and request-body limit weren't documented where we looked.
  - Stronger models need cross-Region inference profiles that a single-Region project can't use.
  - Native video input samples at 1 fps, which misses sub-second handling such as a toss.
- **`aws login` / new AWS experience:** sessions expire after a few hours, and the error surfaces late (mid-deploy, as "Unable to resolve AWS account to use").

## Feedback Q4: How was your onboarding experience (0 to hello world)?

- **Ring Partner API + Playground:** account and Playground setup were quick, and the hello-world starter got device discovery working in under an hour. Getting to a playable WHEP stream took about half a day, mostly session/location handling and juggling short-lived tokens.
- **Amazon Bedrock:** minutes to the first Converse call once model access existed, but the first attempts in a new project hit a zero daily-token quota. Diagnosing that took longer than the integration itself.
- **AWS Lambda + CDK + Step Functions + S3 + DynamoDB + API Gateway:** a basic stack was deployed in well under an hour; `cdk bootstrap` and the first deploy were smooth. Packaging the PyTorch worker took most of a day because of the memory cap, cold starts and thread tuning.
- **AWS SDK for JavaScript v3:** under an hour per service; types and examples made it quick.
- **`aws login`:** a few minutes. The browser sign-in to a named profile was the easiest part of the whole setup.

## Feedback Q5: Would you build with these devices and services again? Yes/No, and why?

**Yes.** The Ring Partner API gave us a clean, official path to real camera streams, and the product only makes sense on top of Ring footage. AWS let one developer ship a complete, reliable evidence pipeline (storage, orchestration, ML inference and records) as a single reviewable CDK stack, for about a cent per clip. Next time we'd want the Ring simulator to support custom or handling scenarios, and Lambda's account limits shown before the first deploy. Both would have saved us a day.

## Which AI tools did you use while working on this project?

- **Claude Code (Anthropic Claude):** the lead coding agent for architecture, implementation, testing, AWS deployment, the synthetic-data pipeline, demo recording and documentation, directed and reviewed by the developer.
- **OpenAI Codex:** earlier development sessions (initial app, Ring integration and evaluation harnesses). **TODO:** confirm, and edit if you used something else.
- **In the product and research:** Meta V-JEPA 2 (frozen video features); fal.ai-hosted Seedance, Kling and Wan (synthetic training clips) and FLUX (a demo damage photo); Amazon Bedrock Nova Lite, Qwen3-VL and Mistral Large 3, plus a local Qwen 27B via MLX (evaluated for handling analysis).
