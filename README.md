# PackageCare

An evidence workspace for reviewing how a delivery was handled. Built for the **Ring** track and **AWS Builder** mini challenge of Amazon's 2026 developer hackathon.

PackageCare links handling observations to footage, lets the recipient correct or dismiss them, records damage separately, and exports a reviewed report with the evidence files. It never sends a complaint automatically.

## Current truth

- The local review, playback, persistence, report preview/finalization, and evidence-bundle workflow is implemented.
- Sample deliveries are original **synthetic animations with scripted observations**. They are not real Ring footage, live AI output, or an accuracy evaluation.
- Ring and Bedrock adapters plus AWS infrastructure source are included. **Actual Ring WHEP playback and browser capture are verified locally; Bedrock accuracy and deployed AWS behavior remain unverified.** AWS runtime access and a real two-pass synthetic connectivity/schema smoke succeeded on October 19. Playground provides live Package/Vehicle/Motion streams and does not support custom uploads; the organizer permits clearly labeled separate scenario footage. A separately approved two-pass diagnostic also succeeded on five frames from a real Ring Package capture and abstained because placement was absent. Dense processing remains under validation. See [the live checkpoint](docs/live-validation-2026-10-19.md) and [footage source catalog](docs/footage-sources.md).
- Follow [the PRD](prd.md), [development log](docs/development-log.md), [verification status](docs/progress.md), and [acceptance audit](docs/acceptance-audit.md) for scope, evidence and remaining gates.
- For the owner-requested specialist continuation, start with [the Astra handoff](handoff.md): current code/runtime, complete experiment findings, local data/reproduction, AWS access and closed spending scopes. Useful handling detection remains unresolved.

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
| `npm run evaluate -- /path/to/manifest.json --strategy dense_frames` | Prepare a local evaluation plan without inference; invocation needs spending approval |
| `npm run benchmark:vision -- /path/to/baseline-plan.json` | Prepare a bounded alternative-model experiment; no inference without separate spending approval |
| `npm run pilot:vision -- /path/to/prepared-evaluation-plan.json` | Prepare the fixed rough/ordinary/unclear whole-clip pilot locally; invocation needs separate spending approval |
| `npm run infra:synth` | Generate the AWS deployment template; does not deploy |
| `npm run maintenance` | Preview expired cases and old orphan files; add `-- --apply` to delete them |

Run the production build before `npm start`. The server binds only to loopback by default. Runtime media, records, credentials, reports, and local evaluations are never committed.

## Connections

### Ring

Use **Connections** in the app to enter a fresh official Playground token. It lives in server memory for the local session. Alternatively set `RING_ACCESS_TOKEN` in ignored `.env` and restart. Choose the correct `RING_SOURCE_TYPE` before importing: `ring_simulator` or `ring_device`.

Select a camera and choose a component for multi-camera devices. **Live view** receives a Ring stream through backend WHEP signaling and closes after 25 seconds. **Capture 12-second clip** starts recording as soon as video plays; **Save 12-second clip** records the remote stream in the browser (4 MB limit), preserves the captured bytes and creates a clip awaiting analysis. It makes no model call until **Analyze clip**. Reports identify this as a browser recording, not a native Ring recording download or provider attestation. Actual Playground playback, saving and saved-source playback were verified on October 19.

Existing recorded-event import remains available and automatically analyzes 12 seconds of existing footage; it does not start a recording. Obtain the appropriate spending approval before using it. Playground live sessions can create `on_demand` history events. Recent recording selection retains the exact start timestamp and event ID. Tokens can expire.

For Gate A, follow [the validation checklist](docs/validation.md) and [October 19 findings](docs/live-validation-2026-10-19.md). Synthetic samples never establish Ring provenance.

### AWS / Bedrock

Local clients use the named `pkgcare` AWS profile; Lambda uses its execution role. The application requires `AWS_REGION=us-east-2` and the in-Region model `amazon.nova-lite-v1:0`. Other profiles, Regions and model/inference-profile IDs are rejected. The CDK stack is pinned to Ohio and its worker permission covers that exact model only. Toolkit configuration in `us-east-1` is separate from application resources. Keep credentials out of chat and source files.

The owner requires explicit approval before any potentially billable operation, even on the Free plan. Connection checks do not authorize inference or deployment. `npm run bedrock:smoke -- /path/to/clip.mp4` prepares five frames locally without inference. After specific spending approval, adding `--invoke` makes at most two model requests, with no automatic retries and at most 2,500 output tokens per request. It saves usage/results under ignored `data/bedrock-smoke/` and never uses S3 or Step Functions. A synthetic input tests connectivity/schema only, not model accuracy or Ring provenance.

`ANALYSIS_STRATEGY=dense_frames` is the initial adapter default: up to four frames per second, capped at 120 across the full clip, analyzed in overlapping windows of at most five images. `sparse_frames` and `native_video` exist for comparison. Sparse input passed a two-request diagnostic on a Ring Package clip already at rest. A first CC BY development comparison then found dense abstentions and sparse/native false clears on a brief carton release; 8 fps dense also abstained. See [actual results](docs/evaluation-results-2026-10-19.md). The full labeled strategy/quality gate remains pending. Native video sampling may miss brief actions; denser inputs cost more and also need evaluation.

An evaluation-only [Qwen3-VL benchmark](docs/model-benchmark-plan.md) recorded empty structured replies and a useful three-frame caption, without establishing handling quality. The owner-approved [fixed three-case pilot](docs/handling-pilot.md) then stopped on its first empty-observation reply; it did not reach the annotated toss or either control case. Estimated returned-usage cost was $0.00111707 before tax. Its scope is closed; no follow-up variants ran. Preparation, validation and mocked tests make no model calls. The application model allowlist remains unchanged.

A subsequent [local CV prerequisite](docs/local-cv-feasibility.md) completed 48 offline parcel/hand localization inferences without training or cloud spending. It found useful candidates but also missed the relevant moving carton and produced persistent false boxes. Conservative candidate association does not yet establish release/placement evidence. [Reproduction helpers](experiments/local_cv/README.md) remain separate from the application; useful handling quality and a task-specific training corpus are still unproven.

The owner chose tracking validation before training. A [local SAM2 extension](docs/sam2-tracking.md) follows the automatically seeded carton through the detector miss and visibly airborne frames. Conservative duplicate-seed gating and local Apple GPU inference reduced this development run from 299.824 s to 207.105 s, retaining the reviewed moving/control parcels. False semantic seeds, occlusion, runtime and independent accuracy remain unresolved. No handling classifier or production adapter is adopted from these development examples.

[Additional-source validation](docs/tracking-validation.md) used two further recordings and visual annotations frozen before inference. Target-box coverage rose from 2/8 to 4/8 scoreable office frames and 8/10 to 10/10 porch frames, with retained evaluated IDs within continuity segments. Fourteen unscorable frames, approximate single-agent annotations, early acquisition misses and persistent false seeds limit this result. It supports further localization work, not a handling-quality claim or training commitment.

[Offline reverse completion](docs/reverse-tracking.md) then raised office coverage to 7/8 using later automatic seeds, with explicit future-conditioning labels. Visual review also exposed leg spill from boundary-truncated seeds; a zero-model saved-mask replay withholds those additions using an interior-seed guard. This is reused development evidence, not independent validation, live detection or a handling classifier. Original forward evidence remains intact; false parcel semantics still need work.

[The local temporal-action comparison](docs/local-action-baseline.md) completed five whole-clip and fifteen automatic-window forwards over those same five development sources. Neither configuration usefully detected the clear van toss, and the Ring at-rest control received forced action classes. The generic classifier is not adopted; this comparison is closed. No custom training or cloud inference ran. All twenty input arrays match sealed previews, and the source passed CI with twenty-three dependency-free CV/action checks plus application/build/Ohio/Linux runtime verification. Handling quality and independent data remain open.

Recipient notes and footage text are treated as data. Model output is schema-checked, cited frames/time ranges are validated, and candidate observations receive a verification pass. The model returns structured observations; image time bounds are derived from cited frame offsets rather than guessed times. This limits unsupported output; it does not establish a measured detection accuracy.

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
