# AWS deployment notes

**Status:** Infrastructure source exists and has synthesized successfully. No AWS account has been connected; no live deployment or container build has been verified. The user requested local development first.

## Intended topology

API Gateway → Lambda API → Step Functions → Lambda media/analysis worker. Private S3 evidence storage; DynamoDB delivery records; Bedrock inference; CloudWatch operational logs.

The frontend is bundled with the API container. A workspace password and signed, HttpOnly session cookie protect API/evidence access. Ring callbacks use their own raw-body HMAC and account check.

## Prerequisites

- Authorized AWS account/region and an agreed spending budget.
- Bedrock access to a suitable multimodal model.
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

`infra/app.ts` defines CloudFormation parameters for workspace access, Ring credentials/account/source, and model selection. The secret parameters have `NoEcho`. Actual values belong in a protected deployment workflow or the AWS console. Obtain owner approval for deployment/account spending after the local implementation review.

`infra/Dockerfile.lambda` uses Debian with FFmpeg and the AWS Lambda Runtime Interface Client. Build the image for the Lambda architecture and test it before deployment. The ordinary `Dockerfile` is for a long-running local/container server and requires password/session configuration before binding to all interfaces.

## Known limits to resolve before cloud release

- Lambda/API Gateway payload limits differ from the local server. Large direct uploads need a direct S3 upload path before promising support for the local 80 MB limit in cloud mode. Cloud ZIP exports use a private S3 object and a short-lived download link; this path still needs live verification.
- Ring tokens entered in the local connection form live in process memory. For Lambda workers use deployment credentials; do not assume a token entered in one API invocation reaches other Lambda instances.
- Synthetic fixtures are generated locally and not packaged into the Lambda image.
- The initial dense adapter can make multiple model calls per clip. Measure cost and latency against the worker timeout; do not extrapolate from a local fixture.
- Retention cleanup runs at local startup and daily while the local server runs; a daily Lambda schedule is defined in the cloud stack. It removes expired terminal cases and their source/report evidence together. Do not independently expire S3 objects referenced by retained reports.
- S3 bucket and DynamoDB table are retained on stack deletion to avoid destroying evidence. Document intentional cleanup separately.

## Post-deployment verification

1. Confirm login, secure session cookie, rejected anonymous access, and foreign-origin write rejection.
2. Import real Ring footage and verify its source timestamp, playback, and provenance label.
3. Inspect the actual Step Functions execution, retries, failure persistence, and Bedrock usage.
4. Review and export a case with its evidence and verify supported size limits.
5. Record endpoints and non-secret findings in `docs/progress.md` and the friction log.
6. Prepare teardown/recreation instructions and judge-access configuration; do not invite reviewers or submit the project automatically.
