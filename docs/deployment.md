# AWS deployment

PackageCare deploys as one AWS CDK stack (`PackageCare`, defined in [`infra/app.ts`](../infra/app.ts)) in `us-east-2`.

## What gets created

| Resource | Role |
|---|---|
| API Gateway HTTP API → **Api** Lambda (container, arm64, 1 GB) | Serves the web app and API (password-protected session) |
| S3 evidence bucket (private, encrypted, SSL-only) | Source videos, extracted frames, damage photos, report exports; browsers upload directly through presigned POSTs that bind size, type and SHA-256; abandoned uploads in `incoming/` expire after a day |
| Step Functions **Processing** state machine | retrieve → observe → verify for each delivery, with retries and a failure catcher that keeps the record retryable |
| **Worker** Lambda (container, arm64, 3008 MB, 15 min) | FFmpeg media preparation and the handling classifier (PyTorch CPU + frozen V-JEPA 2 + trained head), built from [`infra/Dockerfile.worker`](../infra/Dockerfile.worker) |
| DynamoDB **Deliveries** table | Deliveries, recipient reviews, immutable report versions |
| EventBridge daily rule → **Retention** Lambda | Expires deliveries and orphaned evidence after 30 days |
| CloudWatch log groups | Structured, redacted logs (one week) |

The S3 bucket and DynamoDB table use `RemovalPolicy.RETAIN` so that destroying the stack never deletes evidence by accident.

## Deploy

Prerequisites: Node 24+, Docker (builds linux/arm64 images), the AWS CLI with a signed-in profile, and the V-JEPA 2 checkpoint in `data/local-action-small-model/` (see the README; the worker image bundles it with [`models/handling-classifier.joblib`](../models/)).

```sh
npm ci --ignore-scripts
npm test
npx cdk bootstrap aws://ACCOUNT_ID/us-east-2 --profile YOUR_PROFILE --app 'node --import tsx infra/app.ts'
bash scripts/deploy.sh   # interactive: CDK lists IAM changes and asks before deploying
```

`scripts/deploy.sh` reads `WORKSPACE_PASSWORD` and `SESSION_SECRET` from the git-ignored `data/aws-deploy/secrets.env`; create that file with two long random values first. Both are `NoEcho` CloudFormation parameters. The Ring token, HMAC key and account ID parameters are optional (default empty), because Ring Developer Playground tokens are short-lived, so Ring live view runs from the local app. Always run `cdk diff` before deploying changes.

## Smoke test

```sh
python3 scripts/cloud-smoke.py https://YOUR_API_ID.execute-api.us-east-2.amazonaws.com samples/ai-generated-townhouse-stoop-overcast.mp4
```

This signs in, uploads through the same direct-to-S3 path as the browser, and follows the delivery through Step Functions to a result. Measured on the deployed stack with the final classifier:

| Clip (AI-generated, held out) | Container | Result | End to end |
|---|---|---|---|
| Townhouse drop, 6 s 1080p | cold (first call after deploy) | `possible_rough_handling`, 2.0–4.0 s | 484 s |
| Bungalow placement in rain, 6 s 1080p | warm | `no_concern_observed`, placement 2.0–4.0 s | 91 s |

Cold starts are slow because Lambda lazy-loads the ~4 GB worker image, including the 1.4 GB model, so warm the worker with one upload before a live demo. Cost is roughly $0.004–0.02 of Lambda per clip, plus ~2.1 GB of ECR image storage (~$0.21/month).

## Notes and limits

- **Lambda memory:** new AWS accounts are capped at 3008 MB per function, so the worker uses 3008 MB (~2 vCPU), pins 2 PyTorch threads and scores a window every 2 s in the cloud (0.5 s locally).
- **Media timeouts:** FFmpeg/FFprobe steps allow 60 s to survive cold starts on 1080p input.
- **Ring tokens:** a token entered in the app's Connections form lives in one process's memory; Lambda instances do not share it.
- **Analyzer selection:** `PACKAGECARE_ANALYZER=local` (set on both Lambdas) uses the trained classifier; unset, the app uses Amazon Bedrock Nova Lite through the Converse API (its IAM permission is scoped to that model in `us-east-2`).

## Teardown

```sh
npx cdk destroy PackageCare --profile YOUR_PROFILE --app 'node --import tsx infra/app.ts'
```

Then empty and delete the retained evidence bucket and DynamoDB table (and any left over from a rolled-back first deploy), and finally the `CDKToolkit` bootstrap stack if nothing else uses it.
