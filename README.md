# PackageCare

An evidence workspace for reviewing how a delivery was handled. Built for the **Ring** track and **AWS Builder** mini challenge of Amazon's 2026 developer hackathon.

PackageCare links handling observations to footage, lets the recipient correct or dismiss them, records damage separately, and exports a reviewed report with the evidence files. It never sends a complaint automatically.

## Current truth

- The local review, playback, persistence, report preview/finalization, and evidence-bundle workflow is implemented.
- Sample deliveries are original **synthetic animations with scripted observations**. They are not real Ring footage, live AI output, or an accuracy evaluation.
- Ring and Bedrock adapters plus AWS infrastructure source are included. **Live Ring media, simulator customization, Bedrock accuracy, and deployed AWS behavior are not yet verified.** AWS authentication/model authorization and Ring discovery are now checked; media, inference and deployment gates remain open.
- Follow [the PRD](prd.md), [development log](docs/development-log.md), [verification status](docs/progress.md), and [acceptance audit](docs/acceptance-audit.md) for scope, evidence and remaining gates.

## Local setup

Requirements: Node.js 24+, npm, FFmpeg and FFprobe on PATH. Generated files are kept in ignored `data/`.

```sh
npm ci --ignore-scripts
cp .env.example .env
npm run fixtures
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Choose **Explore sample deliveries**. Review the synthetic release, normal placement, and obscured placement scenarios. Confirm/correct/dismiss observations, set inspection status, save the completed review, preview, finalize, and download the evidence bundle.

Only sample generation and the explicit sample-loading action use scripted observations. Importing footage goes through the real Bedrock adapter and will show an operational failure when credentials/model access are unavailable; it does not fall back to a pretend analysis.

Imported source bytes are saved before processing starts, so a restart can resume media preparation and a model failure can be retried. In cloud mode, the browser sends videos/photos directly to private S3 using a bounded authorization; large files do not travel through the API request body. The cloud upload contract is tested locally, with live S3/CORS validation pending account connection.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local API on 3001 and frontend on 5173 |
| `npm run build` | Type-check and build the web client |
| `npm start` | Serve the built client and API on 3001 |
| `npm test` | Meaningful domain, API, adapter, and media interaction tests |
| `npm run fixtures` | Generate original synthetic MP4 test scenes |
| `npm run ring:probe` | Exercise actual Ring device discovery and optional recording retrieval |
| `npm run evaluate -- /path/to/manifest.json` | Evaluate labeled videos with real Bedrock calls |
| `npm run infra:synth` | Generate the AWS deployment template; does not deploy |
| `npm run maintenance` | Preview expired cases and old orphan files; add `-- --apply` to delete them |

Run the production build before `npm start`. The server binds only to loopback by default. Runtime media, records, credentials, reports, and local evaluations are never committed.

## Connections

### Ring

Use **Connections** in the app to enter a fresh official Playground token. It lives in server memory for the local session. Alternatively set `RING_ACCESS_TOKEN` in ignored `.env` and restart. Choose the correct `RING_SOURCE_TYPE` before importing: `ring_simulator` or `ring_device`.

Select a camera, inspect its recent events, choose a component for multi-camera devices, and import an existing recording. The import retrieves 12 seconds; it does not start recording. Tokens can expire and recent media may not yet be ready.

For Gate A, follow [the validation checklist](docs/validation.md). A working adapter or synthetic upload is not proof that the official simulator supports custom delivery scenes.

### AWS / Bedrock

Local clients use the named `pkgcare` AWS profile; Lambda uses its execution role. The application requires `AWS_REGION=us-east-2` and the in-Region model `amazon.nova-lite-v1:0`. Other profiles, Regions and model/inference-profile IDs are rejected. The CDK stack is pinned to Ohio and its worker permission covers that exact model only. Toolkit configuration in `us-east-1` is separate from application resources. Keep credentials out of chat and source files.

The owner requires explicit approval before any potentially billable operation, even on the Free plan. Connection checks do not authorize inference or deployment. `npm run bedrock:smoke -- /path/to/clip.mp4` prepares five frames locally without inference. After specific spending approval, adding `--invoke` makes at most two model requests, with no automatic retries and at most 2,500 output tokens per request. It saves usage/results under ignored `data/bedrock-smoke/` and never uses S3 or Step Functions. A synthetic input tests connectivity/schema only, not model accuracy or Ring provenance.

`ANALYSIS_STRATEGY=dense_frames` is the initial adapter default: up to four frames per second, capped at 120 across the full clip, analyzed in overlapping windows of at most five images. `sparse_frames` and `native_video` exist for comparison. These strategies have not been compared through live inference yet. Native video sampling may miss brief actions; denser inputs cost more and also need evaluation.

Recipient notes and footage text are treated as data. Model output is schema-checked, cited frames/time ranges are validated, and candidate observations receive a verification pass. This limits unsupported output; it does not establish a measured detection accuracy.

### AWS deployment

See [deployment documentation](docs/deployment.md). The CDK stack describes a private-storage, password-protected web/API deployment with Step Functions processing. There has been no live deployment. Do not run a deployment without configuring account access, model permissions, and an agreed budget.

## Testing approach

Tests exercise consequential behavior: evidence references, temporal bounds, duplicate events, signature/account validation, concurrent recipient changes, damage separation, report immutability, authentication, media retrieval, and portable exports. Browser smoke testing follows the user journey rather than a snapshot of implementation details. See `docs/validation.md` and `docs/progress.md` for actual results and limitations.

## Evidence exports

The ZIP contains `report.html`, `manifest.json`, source/playback video, evidence frames, and recipient photos. Keep `report.html` beside the `evidence/` directory when unzipping. Frozen report versions retain their recipient statements and evidence manifest. A checksum identifies a file; it is not a legal chain-of-custody claim.

## Product boundaries

PackageCare describes visible handling and recipient statements. It does not identify delivery workers, infer intent, assert internal damage, estimate lifting safety, detect theft, or submit complaints. Authorized, recipient-approved carrier escalation is a roadmap concept only.

## Logs and submission

- [Development log](docs/development-log.md): decisions, milestones, checks, and outstanding work.
- [Friction log](docs/friction-log.md): observed tool/API onboarding issues, with expected/actual results and workarounds.
- [Submission checklist](docs/submission.md): evidence needed before claiming hackathon readiness.

The repository is private. Do not make it public or invite reviewers until the owner authorizes those actions.
