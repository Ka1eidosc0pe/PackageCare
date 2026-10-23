# AWS deployment notes

**Status (October 23, 2026): deployed and smoke-tested** in `us-east-2` with the `pkgcare` profile, owner-approved with a $5 ceiling. Stack `PackageCare`: HTTP API → API Lambda; private S3 evidence bucket with direct presigned uploads; Step Functions (retrieve → observe → verify); arm64 container Worker Lambda (3008 MB, 15 min) running FFmpeg, PyTorch CPU, V-JEPA 2 and the trained handling head; DynamoDB; daily retention Lambda.

Smoke test (`python3 scripts/cloud-smoke.py <ApplicationUrl> <clip>`): an AI-generated 6-second toss clip went upload → S3 → Step Functions → Worker → DynamoDB and returned `possible_rough_handling`, with a supported 4.0–6.0 s observation, 196 s end to end (observe ≈174 s). Estimated Lambda cost ≈ $0.01 per short clip; ECR holds ~2.1 GB of images (~$0.21/month).

Deploy: `bash scripts/deploy.sh` (interactive; CDK asks before IAM changes). The workspace password is generated into the ignored `data/aws-deploy/secrets.env`. Ring parameters are optional, because Playground tokens are short-lived.

Teardown: `npx cdk destroy PackageCare --profile pkgcare --app 'node --import tsx infra/app.ts'`, then empty and delete the retained evidence bucket and DynamoDB table. A failed first create also left an empty retained bucket `packagecare-evidence4cc26d68-zmyatjordxq0` and table `PackageCare-DeliveriesBF2F7293-G4DVFFGEY64X`; delete those too. The CDKToolkit bootstrap stack can be removed last.

## Earlier notes (historical)

# AWS deployment notes

**Status:** The owner connected AWS project credentials under `pkgcare` and confirmed `us-east-2`. Free metadata checks verify Nova Lite authorization/availability, and the application's SDK resolves the temporary login credentials. The owner-approved smoke attempt reached Bedrock but its first request was throttled by zero daily-token quota; no model result returned. No AWS upload, deployment or resource creation has been performed. Earlier source passed the Linux Lambda runtime smoke in [CI](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38990693461); current Ohio-only source `724c773` passed all checks and the container runtime smoke in [CI run 38996783402](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38996783402).

## Intended topology

API Gateway → Lambda API → Step Functions → Lambda media/analysis worker. Private S3 evidence storage; DynamoDB delivery records; Bedrock inference; CloudWatch operational logs.

The frontend is bundled with the API container. A workspace password and signed, HttpOnly session cookie protect API/evidence access. Ring callbacks use their own raw-body HMAC and account check.

The API retains each processing execution reference and reconciles terminal Step Functions status when refreshing an in-progress delivery. This covers whole-execution timeouts/abort conditions that cannot reach a task catcher. Each retry creates a new persisted generation, passed through every worker task; atomic generation checks reject late results from superseded workers. Concurrent retries accept one transition only. Live timeout/abort behavior and DescribeExecution permissions still need validation.

## Prerequisites

- Explicit owner approval for the proposed operation and expected cost, as required by [AGENTS.md](../AGENTS.md). Credits and Free-plan eligibility do not replace approval.
- Authenticated `pkgcare` profile; all application resources in `us-east-2`. The stack is pinned there. Use `--profile pkgcare` for eventual deployment. Toolkit-only control-plane setup in `us-east-1` does not authorize resources there.
- In-Region `amazon.nova-lite-v1:0` access. Cross-Region inference profiles are prohibited. The worker policy grants invocation of this exact Ohio foundation-model ARN; the model parameter is allowlisted. Quality remains to be measured.
- Docker/buildx for a Linux AMD64 Lambda container build.
- AWS CDK bootstrap in the destination account.
- Ring partner HMAC key/account binding for webhook use. Playground manual imports do not establish webhook onboarding.
- Long random workspace password and session signing secret. Configure through protected deployment input; never commit real parameter values or put secrets in shared terminal history.

## Preparation

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run infra:synth
```

`infra/app.ts` defines CloudFormation parameters for workspace access, Ring credentials/account/source, and the allowlisted model. The secret parameters have `NoEcho`. Actual values belong in a protected deployment workflow or the AWS console. Obtain owner approval for each billable scope after preparation; do not bootstrap or deploy while approval is pending.

`infra/Dockerfile.lambda` uses Debian with FFmpeg and the AWS Lambda Runtime Interface Client. Build the image for the Lambda architecture and test it before deployment. The ordinary `Dockerfile` is for a long-running local/container server and requires password/session configuration before binding to all interfaces.

## Known limits to resolve before cloud release

- Cloud video (up to 80 MB) and damage-photo (up to 10 MB) uploads use a five-minute presigned S3 POST. The policy binds the exact size, SHA-256, content type, encryption and object key. The completion API verifies S3 metadata, copies the source out of the one-day incoming prefix and persists it before starting the worker. The worker performs video decoding and evidence preparation. Browser S3 CORS, IAM, actual maximum-size uploads and worker performance still need live verification. Cloud ZIP exports use a private S3 object and a short-lived download link; this path also needs live verification.
- Ring tokens entered in the local connection form live in process memory. For Lambda workers use deployment credentials; do not assume a token entered in one API invocation reaches other Lambda instances.
- Synthetic fixtures are generated locally and not packaged into the Lambda image.
- The initial dense adapter can make multiple model calls per clip. Measure cost and latency against the worker timeout; do not extrapolate from a local fixture.
- Retention cleanup runs at local startup and daily while the local server runs; a daily Lambda schedule is defined in the cloud stack. It removes expired terminal cases and their source/report evidence together. Do not independently expire S3 objects referenced by retained reports.
- Abandoned objects in `incoming/` expire after one day. Scheduled maintenance inventories generated evidence/export keys, then removes unreferenced files older than one day. It protects both current delivery assets and every frozen report's assets/export. It completes paginated inventory before deletion and uses strongly consistent record scans. Confirm the actual bucket inventory and deletion permissions live; `npm run maintenance` previews cleanup without deleting files.
- S3 bucket and DynamoDB table are retained on stack deletion to avoid destroying evidence. Document intentional cleanup separately.

## Post-deployment verification

1. Confirm login, secure session cookie, rejected anonymous access, and foreign-origin write rejection.
2. Import real Ring footage and verify its source timestamp, playback, and provenance label.
3. Inspect the actual Step Functions execution, retries, failure persistence, and Bedrock usage.
   Stop or time out an execution; refresh the delivery and verify a retry action appears. Retry it and ensure an older worker/status response cannot overwrite the new attempt. Check provider-status failure leaves the underlying record unchanged.
4. Review and export a case with its evidence and verify supported size limits.
   Verify direct video and photo upload through the browser, including CORS, checksum rejection, expired authorization and repeated completion. Interrupt a worker and confirm recovery from the persisted source.
5. Record endpoints and non-secret findings in `docs/progress.md` and the friction log.
6. Prepare teardown/recreation instructions and judge-access configuration; do not invite reviewers or submit the project automatically.

The upload contracts follow the official [S3 POST policy](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-HTTPPOSTConstructPolicy.html) and [POST Object checksum fields](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/RESTObjectPOST.html). Local tests inspect the actual SDK-signed policy and exercise API completion against simulated S3 responses; they do not establish live S3 acceptance.

Execution recovery follows the documented [top-level error handling limits](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html) and [DescribeExecution contract](https://docs.aws.amazon.com/step-functions/latest/apireference/API_DescribeExecution.html). That API is eventually consistent, so status changes can take more than one refresh to appear.
