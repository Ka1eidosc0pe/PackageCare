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
- Added an independent CI container build and Lambda HTTP/frontend smoke job so Linux runtime verification can proceed without local Docker or Ring/AWS credentials. Await its actual result before claiming the image works.
- Latest local build and test results are recorded in `progress.md`; rerun whenever relevant source changes.

### Scope and next external gates remain unchanged

The owner explicitly chose to connect accounts later. Live Ring media/custom-scene support, live Bedrock evaluation, actual AWS execution/cost, and final submission materials remain outstanding. Local synthetic scenarios are not evidence for those gates.

## October 16, 2026 — CI packaging correction

- CI for `c1f81ab` passed the independent build/tests/CDK job, but the container build failed compiling the Lambda runtime client because `autoreconf` was missing.
- The same log exposed the HTTP adapter's Node >=24 engine requirement. Standardized README, package engine, CI, and both containers on Node 24+ (local development currently uses Node 25).
- Added the native runtime build prerequisites and selected the verified current official Lambda runtime client release. Updated GitHub Actions to their verified current releases.
- Added a check that a model cannot cite a known case frame it did not receive in its current input window, and strengthened frame-order coverage.
- No live provider/runtime success is inferred from these source fixes; the next CI result must confirm them.
- Follow-up CI identified missing `xz` while the newer runtime client extracted its bundled source. Inspected the published pre/postinstall scripts and added `xz-utils` plus Python for node-gyp before the next build. The client executable moved to package-root `index.mjs`; the entrypoint now uses its verified published path.
- CI for `77c90e2` built the image and ran FFmpeg successfully. The invocation smoke exposed runtime client v4's `_HANDLER` environment requirement. Added a real image entrypoint mapping the handler command into `_HANDLER`; the smoke now launches that exact entrypoint rather than bypassing production startup. Build/tests/CDK checks passed independently.
- Public browser inspection of the official Ring Playground confirmed a redirect to Amazon Developer sign-in. No account was created, no token generated, and custom scene support remains unverified.
- Final local acceptance checks added chronological sorting for out-of-order model observations, aligned explicit delivery filters with the selected case, and kept review text fields disabled during processing to avoid losing drafts when analysis updates the record.
- The next runtime smoke failure was missing AWS-provided function/log metadata in our local protocol harness, not a production handler failure. Filled the required stand-in environment values from the published runtime client's validation contract. Pinned the CI runner to Ubuntu 24.04 to avoid the announced image migration during the hackathon week.
- Local production command (`npm start`, isolated sample data, port 3002) and the production frontend's sample-loading flow were verified in the browser. The local Lambda HTTP adapter also returned 200 for session and built-homepage requests.
- Bundled the font/icon/UI-runtime license notices with the frontend assets. Root production dependency audit reported zero advisories; this is not a separate audit of the native runtime image.

## October 16, 2026 — verified local milestone

- Source commit `4e7fa5b298afae98f5b74ca40e44c9ba60a05cc9` passed [CI run 38988422636](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38988422636): production build, all 22 meaningful tests, CDK synthesis, Linux Lambda image build, FFmpeg, packaged HTTP/frontend checks, and actual production entrypoint invocation against the Runtime API stand-in.
- The container check required no AWS account and made no live AWS or Ring calls. It proves packaging/startup behavior; IAM, Step Functions, S3/DynamoDB and inference still require live validation.
- Verified keyboard behavior in the production frontend's unsaved-changes dialog: initial focus on Keep editing, Tab to Discard changes, Tab wrap, Escape dismissal, and focus restoration. Discarded only the synthetic test draft and returned the preview to Deliveries.
- Preserved the production preview on port 3002 with isolated synthetic fixtures, plus a screenshot outside the repository. Updated the current evidence map and deployment notes to distinguish passing container validation from pending live services.
- Private source control and development/friction logs are maintained. Account connection, real labeled-footage evaluation, cloud release limits and final hackathon deliverables remain open; the overall goal is not complete.

## October 16, 2026 — upload recovery and cloud payload gap

- A PRD audit found that uploaded video preparation ran in an untracked background task before source bytes were durable. A restart could lose the only source, and Lambda could suspend preparation after responding. Moved decoding/preparation into the persisted processing path and retained the original source before acknowledging receipt. Retrying analysis reuses prepared evidence.
- Added direct-to-S3 video/photo upload authorization and completion. The actual SDK POST policy binds a five-minute expiration, exact byte count, SHA-256, MIME type, encryption and destination key. Completion checks stored metadata and uses a conditional server-side copy before persistence; repeating completion returns the existing case/attachment.
- Damage photos use the same image decoder/metadata stripping path in local and cloud modes. Added a one-day incoming-object lifecycle and same-application-origin POST CORS rule to the stack. No live resources were deployed.
- Added meaningful tests for restart/retry with real FFmpeg, signed-policy limits, tampered/expired tickets, wrong stored checksum, repeated completion, photo destination and normalization, and invalid image cleanup. Initial sandbox execution could not bind loopback sockets; rerunning in the authorized host context passed all 26 tests, including the explicit checksum-algorithm field. Production build and CDK synthesis passed. Remote CI will verify packaging for this revision.
- Browser-imported our own synthetic MP4 through the production frontend's real upload path. The original and normalized playback were retained; the missing AWS credentials produced an explicit processing failure and retry action, with no invented assessment. Adjusted the pending-review copy so an unfinished analysis does not imply no handling concerns exist.
- Remaining cloud validation includes real S3 POST/CORS/IAM, maximum-size uploads, runtime performance and orphan reconciliation after an interrupted copy/persistence boundary. Gate A/B and submission artifacts remain open.

### Reference-aware storage reconciliation

- Closed the interrupted-copy orphan gap with a storage inventory that considers generated PackageCare keys only. Files must be older than one day and absent from both current delivery assets and frozen report manifests/exports before deletion. Incoming uploads retain their separate lifecycle.
- The inventory finishes before any removal, handles S3 pagination, and refuses an incomplete page sequence. Record scans now use strongly consistent reads. Recent worker output, retained report evidence, in-flight case sources and unrelated keys are protected.
- Integrated reconciliation into local startup/daily maintenance, the scheduled cloud handler, and the existing dry-run-first maintenance command. Tested both actual local files and paginated simulated S3 inventory, including failure before deletion. All 27 tests passed locally; maintenance dry-run found zero expired cases and zero orphan files. Cloud list/delete behavior still needs actual account validation.

### Whole-execution failure and retry isolation

- The same audit found that a whole Step Functions execution timeout/abort can bypass task catchers. Added execution-reference persistence and API status reconciliation so an in-progress record can become a visible retryable failure when the execution is terminal.
- Added a persisted generation per cloud processing attempt and an atomic worker store guard. Every task receives/returns the generation; delayed results from an older worker are ignored after a retry. Retrying clears the previous generation immediately and atomically accepts only one concurrent retry.
- Added interaction tests for timed-out execution → failure → concurrent retry, preserving the source, transient status-provider failure without record corruption or payload disclosure, delayed old status, and an actually in-flight old model result rejected after a new generation is persisted. All 29 tests passed locally; the updated stack synthesized, including scoped DescribeExecution permission and generation payloads. No live Step Functions execution has been claimed.
- Upload commit `6a11903` passed CI run 38989282829; reconciliation commit `d2d9011` passed CI run 38989435848. The following execution-recovery commit still needs its own CI result.

### Final verification for execution-recovery source

- Commit `e673a2cbc538a228b202d099ca7cdeaecd189598` passed both jobs in [run 38989750841](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38989750841): build, all 29 tests, CDK synthesis, Linux image build, FFmpeg and production runtime-entrypoint smoke.
- Restarted the production preview on the latest source and confirmed the imported clip's persisted failure/retry state, preserved playback and disabled review until analysis completes. Pending-analysis copy makes no handling assessment. The new failure layout matched document/viewport widths at 1440 and 390 pixels. Reset the viewport and left the preview on the synthetic release example.
- Added `acceptance-audit.md` mapping agreed MVP requirements and required scenarios to the current evidence. Gate A/B, real cloud integration/performance and human submission deliverables remain unproven; the full goal stays active.
- Rechecked repository privacy and exact CI source hash. Re-ran the root production dependency audit after adding the official S3 upload helper: zero advisories. Native container dependencies were not separately audited.
