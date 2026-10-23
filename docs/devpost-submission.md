# Devpost submission draft

Copy into the Devpost form. Check against the final results in `docs/synthetic-classifier.md` before submitting. Tracks: **Ring** (primary) and the **AWS Builder** mini challenge.

## Tagline

A clearer record of how your delivery was handled: Ring footage in, an evidence-linked handling timeline and a recipient-controlled report out.

## Inspiration

When a package arrives damaged, the recipient is left scrubbing doorbell footage, guessing at timestamps and writing everything up by hand. Ring already tells you a package arrived. We wanted to show *how* it arrived, without turning an uncertain model guess into an accusation.

## What it does

- Connects to a Ring camera (Developer Playground) through the Partner API: live view over WHEP, plus in-browser capture of a 12-second clip with its original bytes preserved.
- Scores every 2-second window of a clip for toss/drop versus placement. The strongest segment becomes a timeline observation linked to exact frames, with a one-tap slow-motion replay. When the handling isn't visible, it says "Unable to assess" instead of guessing.
- The recipient confirms, corrects or dismisses each observation and records damage, notes and photos separately. A toss never implies damage, and damage never implies a toss.
- Reports are previewed, frozen as versions, and exported as a ZIP: printable report, evidence frames, source video and a SHA-256 manifest. Nothing is sent automatically.

## How we built it

- **App:** React + Vite + TypeScript UI; Express API; FFmpeg/Sharp media preparation; strict domain validation (every observation must cite frames inside its time range).
- **Ring:** Partner API token connection, device discovery, WHEP live view, browser recording, recording history import.
- **Handling model:** real footage of packages being thrown is nearly impossible to license, and general multimodal models (Nova Lite, Qwen3-VL, Mistral Large 3, a local Qwen 27B) missed brief tosses or invented details. So we generated ~430 labeled doorbell clips with an AI video model (Seedance via fal.ai), degraded them to look like real cameras, extracted features with a frozen V-JEPA 2 video model, and trained a small classifier on top. We evaluate only on footage it never saw: clips from a different generator (Kling) and real recordings.
- **AWS:** CDK stack in us-east-2. API Gateway → Lambda API. Direct presigned uploads to a private S3 bucket. Step Functions orchestrates retrieve → observe → verify on an arm64 container Lambda that runs FFmpeg, PyTorch CPU, V-JEPA 2 and our classifier. DynamoDB stores deliveries, reviews and frozen reports; EventBridge triggers a daily retention cleanup.

## Challenges

- The Ring Playground streams a package already at rest; it can't show a delivery being handled. We integrated the real Playground path and used clearly labeled AI-generated clips for handling scenarios, as the organizers allowed.
- Generic vision-language models either abstained on obvious tosses or described things that weren't there. Training a narrow classifier on synthetic data worked far better for this one task.
- New AWS accounts cap Lambda memory at 3 GB, so CPU video inference needed careful thread and window tuning to fit in the Lambda timeout.

## Accomplishments

- An end-to-end workflow from Ring live view to an exportable, versioned evidence report.
- A handling classifier trained without a single real training clip, tested on held-out footage from another generator and on real recordings.
- The full AWS pipeline deployed and processing clips in ~3 minutes for about a cent each.

## What we learned

Restraint is a feature: "unable to assess" builds more trust than a confident wrong answer. Synthetic data is a practical bootstrap for rare events, as long as you evaluate on data from somewhere else.

## What's next

More real, consented doorbell footage for evaluation; per-camera calibration; a recipient-approved carrier claim flow (shown in the demo only as a labeled concept).

## Tool feedback

- **Ring Partner API / Developer Playground:** WHEP live view worked well once connected. Requests: a recorded "delivery" scenario with handling, custom clip upload in the simulator, and a public capabilities page. Tokens expire quickly and can only be regenerated about every 30 minutes, which makes iteration slow.
- **Amazon Bedrock:** in-Region Nova Lite was easy to call, with structured output. It wasn't reliable for sub-second handling in sampled frames. Some stronger models need cross-Region inference profiles that our single-Region project couldn't use, and Mistral's three-image request limit wasn't documented where we looked.
- **AWS Lambda / CDK:** container images make shipping PyTorch practical. Friction: the 3008 MB memory cap on new accounts isn't visible in `GetAccountSettings`; CDK requires a TTY to approve IAM changes; a rolled-back create left retained resources behind. Details: `docs/friction-log.md`.
- **Step Functions / S3 / DynamoDB:** worked as expected; presigned POST with checksums gave us safe direct uploads.
- **fal.ai (Seedance, Kling, Wan):** Seedance gave the best surveillance-style realism per dollar (~$0.05 per 5 s clip at 480p); Kling had the best physics but looked cinematic; Wan's boxes morphed mid-throw.
