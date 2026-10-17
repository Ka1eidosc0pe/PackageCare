# PackageCare development log

Use this log for implementation decisions and verified milestones. `friction-log.md` records specific developer-tool problems for the hackathon. Neither log contains credentials, personal footage, signed URLs, or raw account payloads.

## October 16, 2026 — product definition

- Selected Ring primary track and AWS Builder mini challenge.
- Named the product PackageCare.
- Locked MVP around handling analysis, evidence review, recipient damage statements/photos, and reviewed report export.
- Excluded theft/removal detection, lifting/routing, identity matching, and automatic carrier escalation.
- Wrote `prd.md` with acceptance criteria and unresolved Ring media/model feasibility gates.

## October 16, 2026 — implementation authorized

- The subsequent user goal authorized implementation, meaningful tests, and polished design.
- User explicitly requested local development first and will connect Ring/AWS accounts later.
- User authorized package installation with lifecycle scripts disabled.
- User then requested a private GitHub repository, incremental commits, and maintained logs.

### Implemented so far

- React/TypeScript evidence workspace with delivery selection/filtering, video playback and seeking, handling timeline, evidence frames, review decisions, damage status, notes, photos, report preview, finalization, and version library.
- Express API; atomic local persistence with serialized updates and stale-write rejection.
- Frozen report snapshots and downloadable HTML/JSON/media ZIP bundles.
- Ring HTTP adapter, raw-body HMAC verification, account binding, deduplication, media redirects without token forwarding, bounded readiness retries, and a local connection/import interface.
- Bedrock adapter with structured observations, evidence-reference validation, and verification pass. Dense frame windows, sparse baseline, and native-video strategies exist for later comparison.
- AWS CDK source for API Gateway/Lambda, Step Functions, S3, and DynamoDB. Cloud source is not deployed or live-validated.
- Three original synthetic porch animations with explicitly scripted observations, used only to test the product workflow.

### Verification at this milestone

- Production TypeScript/Vite build passed before the most recent adapter changes; rerun required for those changes.
- Eleven meaningful domain/API tests passed: invalid evidence/time references, abstention, stale writes, damage separation, snapshots, webhook signatures/account binding/deduplication, authentication, and safe media redirects.
- CDK synthesized a CloudFormation template successfully. This does not establish that containers build or AWS deployment works.
- Browser interaction verified sample loading, recipient confirmation, no-damage selection, saved notes/reference, and report preview containing the saved data.

### Outstanding

- Finish browser/export/responsive checks, add media-pipeline integration coverage, and re-run checks after fixes.
- Verify GitHub access and create/push the requested private repository.
- Complete setup/evaluation/deployment/submission documentation.
- Gate A live Ring media and custom-scene feasibility: deferred until user connects account.
- Gate B real-model evaluation on labeled footage: deferred until user connects AWS.
- Do not claim model accuracy, AWS deployment, or submission readiness from synthetic fixtures or a successful CDK synthesis.

## October 16, 2026 — local workflow verification and private source control

- Created and verified private GitHub repository: https://github.com/Ka1eidosc0pe/PackageCare.
- Pushed milestone `a606cd2`: evidence workspace, source adapters, initial domain/API tests, infrastructure source, and logs.
- Expanded checks to 20 tests across domain, API, real FFmpeg media preparation, model-input contracts, failed jobs, photos, portable ZIP exports, and whole-case retention.
- Verified report finalization/download in the browser and inspected the downloaded ZIP. The bundle contained HTML, manifest, original/playback video, and all five sample evidence frames with relative links.
- Browser-verified saved notes/reference and damage separation, actual video playback, timeline seek to 3000 ms, report library, and unsaved-change discard protection.
- Inspected 1440-pixel desktop and 390-pixel mobile layouts. Mobile document width matched the 390-pixel viewport; evidence frames scroll within their own strip.
- Added review controls for all observations, focus-managed confirmation dialogs, source-safe media failure handling, local fonts, sign-out, and a clearer distinction between scripted sample evidence and real model results.
- Added overlapping dense-frame windows, sparse and native-video comparison modes, and input-specific evidence validation. Mocked adapter checks prove request contracts, not inference quality.
- Added local scheduled retention and a cloud maintenance schedule. Cloud exports use private S3 bundles rather than returning large ZIP payloads through Lambda.
- Added a GitHub Actions workflow for build, meaningful tests, and infrastructure synthesis. Its remote result is pending the next push.
- Docker CLI is installed, but its daemon socket is absent. Container/runtime validation remains unverified; no Docker daemon or cloud deployment was started.
- Latest local build and test results are recorded in `progress.md`; rerun whenever relevant source changes.

### Scope and next external gates remain unchanged

The owner explicitly chose to connect accounts later. Live Ring media/custom-scene support, live Bedrock evaluation, actual AWS execution/cost, and final submission materials remain outstanding. Local synthetic scenarios are not evidence for those gates.
