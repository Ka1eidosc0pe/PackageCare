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

## October 16, 2026 — account dependency checkpoint

- Re-read the current acceptance audit and verification map; the working tree was clean and the tested source remained `e673a2c` with documentation through `a95a108`.
- Checked the running application's readiness endpoint, without displaying credentials: Ring disconnected, no recorded live model run, local storage and local worker. Environment readiness booleans also showed no configured Ring token or cloud resource references.
- The same account dependency has persisted through three consecutive goal turns. Local implementation, contracts, runtime packaging and meaningful verification progressed in the preceding turns; the outstanding Ring media, real inference/evaluation and deployed AWS acceptance gates now require owner setup or an external-state change.
- The full objective is not complete. Resume from Gate A/B and live AWS validation when accounts and authorized labeled clips are available; preserve the private repository, existing evidence and scope. Registration, reviewer access and final demo/submission remain human-owned steps.

## October 16, 2026 — preview-before-finalization requirement

- On a resumed goal, account readiness remained unchanged. A further local PRD audit identified that opening the report drawer did not require a successfully loaded preview before finalization, and the API could finalize a complete review without a preview request.
- Added a ten-minute signed preview receipt binding delivery ID, saved revision and report-content fingerprint. The API rejects missing, modified, expired, cross-delivery and stale receipts. Repeating a successful finalization of unchanged content returns the existing snapshot without bumping its revision or creating another report.
- The report drawer now waits for a successfully loaded preview document before enabling finalization. Finalized reports and exports omit the receipt. Receipt issuance establishes that the preview was served; it cannot prove that a human read it.
- Expanded the real API review/report interaction test and added receipt-boundary coverage. All 30 tests passed locally and the production build passed. Browser-saved a synthetic review, loaded its preview, verified finalization became enabled and finalized version 1. No live model result or carrier submission was involved.
- The next source commit needs CI packaging verification. Live Ring, labeled Bedrock evaluation and deployed AWS checks remain outstanding.

### Storage-independent report fingerprints

- Preview receipts now bind report contents, so their identity must not depend on the property order of serialized storage maps. Canonicalized object keys for content fingerprints while preserving array order and exact values.
- Existing frozen reports keep their original IDs, fingerprints and contents. Semantic matching recognizes legacy fingerprint versions instead of creating a new report solely because storage key order changed.
- Added a meaningful storage-round-trip test that reverses nested object-key order, checks unchanged report identity, preserves a legacy snapshot and verifies a real recipient statement still creates version 2. All 31 tests and the production build passed locally. This is a tested storage invariant, not a claim that a live DynamoDB round trip has been performed.

### Preview milestone verification

- Preview source `c8cdf99` passed both CI jobs in run 38990551816. Final source `7a4e7563dd548fd69b8d164b938762eca6c95dbe` passed [run 38990693461](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38990693461): all 31 tests, production build, CDK synthesis, Linux image build, FFmpeg and actual production runtime-entrypoint smoke.
- Restarted the production server on the canonical-fingerprint source and repeated preview/finalization for the unchanged pre-update synthetic report. It retained report ID `757b0462-5d41-4ae3-adbb-ea8884ad0540`, generation timestamp and version 1. Captured `packagecare/finalized-report.png` outside the repository and preserved the local preview.
- Account readiness remains unchanged. The goal is not complete: suitable Ring media, real Bedrock evaluation, live AWS behavior and submission artifacts are still unverified. No credentials, deployment, external complaint or reviewer invitation was created.


## October 16, 2026 — real connections, Ohio configuration and quota gate

- Verified the supplied Ring token through the running backend without displaying it: one simulator device, capabilities/history HTTP 200, zero events. No recording retrieved. Preserved the process-memory token rather than restarting the server during diagnosis.
- Completed the authorized AWS Toolkit setup after browser sign-in. Installed default skills; preserved generated Codex MCP command/arguments and scoped `AWS_MCP_PROXY_PROFILES` to `pkgcare`. New MCP tools are not exposed in the current chat, so installed local skills and CLI were used.
- STS authentication succeeds; Free Tier metadata says FREE/ACTIVE. The owner confirmed Ohio. PackageCare's SDK resolves the same named profile's temporary login credentials without displaying keys. Bedrock metadata marks in-Region Nova Lite active/authorized/available.
- Replaced the previous cross-Region Nova 2 Lite default with Ohio's in-Region Nova Lite candidate. App clients reject other Regions/local profiles; Lambda uses its execution role. CDK is pinned to Ohio and its Bedrock policy grants only the exact model ARN. The first synthesis exposed CDK's inferred default Region during account-free synthesis; corrected the guard to check an explicit application Region while pinning the stack's actual environment.
- Prepared a local-only five-frame/two-pass smoke harness. It defaults to preparation only, explicitly caps model output, disables SDK retries and preserves completed-pass usage if a later pass fails. Ring probe storage is also local regardless of the app's bucket configuration.
- Owner explicitly approved up to $0.05 for one smoke attempt. First Converse request returned HTTP 429 ThrottlingException, “Too many tokens per day.” Metadata: one attempt, zero retry delay. The second pass never ran. No model output/usage was returned; no further inference was attempted. Actual failure metadata is retained only under ignored local data.
- Free Service Quotas checks confirmed Nova Lite daily tokens = 0 (`L-45E0AD92`, non-adjustable); other Nova daily entries checked are also zero. This is a runtime quota issue despite authorized model metadata. No plan upgrades, quota changes, cloud uploads or resource provisioning were performed. Prepared an unsent AWS support draft and detailed readiness/cost evidence.
- Added actionable local quota-failure handling. Meaningful tests cover the Region/profile/model boundary and preserve failure, evidence and zero automatic retry without inventing an assessment. All 34 tests, the production build and Ohio synthesis passed locally. Fresh private-repository CI remains to be checked after commit.
- Real Ring recordings/custom scenes, successful model output and labeled quality evaluation, live cloud runtime and submission deliverables remain unverified. The active goal is not complete. Quota resolution and a newly approved inference attempt are the next AWS steps.

### Ohio readiness milestone verified

- Source `724c7734703a8d827b150f963ebb693f88ef80ae` passed [CI run 38996783402](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38996783402): 34 tests, production build, CDK synthesis, Linux Lambda image build, FFmpeg and actual production-entrypoint smoke. Both jobs succeeded. Repository remained private; credentials and runtime evidence were excluded from source control.
- The following documentation-only checkpoint records these results. No additional inference was performed. Await owner/AWS quota resolution before preparing the next approved live attempt.


## October 16, 2026 — cloud failure recovery audit

- Classified the preceding goal turn as progress: authenticated provider evidence, a real quota rejection, Ohio safeguards and passing CI changed the next action. Owner/AWS quota resolution still gates successful live inference. No new inference, deployment or cloud storage operations ran in this continuation.
- The running Ring session still authenticates. Kept the token-bearing process alive rather than restarting during the audit. The latest documentation checkpoint CI was still running when first checked.
- Found that the Lambda worker discarded actionable errors before its catch step, and the generic failure step could overwrite an existing failure or a ready result. Extracted the actual task executor for dependency-injected local verification, persisted safe failure text before reporting a sanitized task error, and made terminal failure writes idempotent. Stale generations remain rejected.
- The catch task now passes only its error code, never the raw provider Cause. Exhausted MediaPending retries produce an actionable media-unavailable state. Transient retrieval remains retryable; no inference is attempted before footage exists.
- Two consequential local worker scenarios exercise observe → quota failure → repeated catcher → new generation → verification-only recovery, plus temporary Ring readiness → exhausted catcher. They verify preserved evidence/proposal, no repeated observation call, no sensitive provider text, no stale catcher writes and no replacement of a completed result.
- All 36 local tests, production build and CDK synthesis passed. The synthesized payload carries the catcher Error code only. Live Step Functions behavior still requires an approved deployment.


## October 16, 2026 — abstention before a handling assessment

- The same audit found that a supported parcel-visible/landing/at-rest observation could yield `no_concern_observed` even if placement was never shown. A rejected or weakened model assessment could also retain its unchecked headline in the UI.
- Derive a clear assessment only from supported controlled-placement evidence when no uncertainty remains; arrival, landing or rest alone abstain. Supported concerns still take precedence. Derive the displayed summary from the supported observation or explicit abstention rather than an unchecked model headline. Existing frozen reports are untouched.
- Updated the input contract and prompt version to `packagecare-evidence-v2`. This establishes validation behavior, not measured model performance. The quota gate still prevents evaluation.
- Added meaningful cases for at-rest/landing/arrival-only footage, supported placement, rejected accusatory headlines, and ambiguous placement. All 38 tests across nine files, the production build and Ohio synthesis passed locally. No further live inference ran.
- Prepared a 12-scene capture/labeling plan and a clearly marked manifest template, with distinct development/held-out cases and no fabricated timestamps or results. Uploaded staged footage can support model work but cannot replace the required Ring demonstration or establish simulator custom-media support. Footage still needs to be collected with permission; evaluation needs its own approved cost scope.

### Worker/abstention milestone verified

- Both CI jobs passed for source `d2ce3e6b4b114ed61b4373420839d1d29d30a5b2` in [run 38997334192](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38997334192): 38 tests, production build, Ohio synthesis, Linux Lambda image, FFmpeg and production-entrypoint smoke. The prior documentation checkpoint also passed run 38996970401.
- No live inference or AWS resource operations ran in this continuation. Ring authentication remains partial Gate A evidence; model quality, actual cloud behavior and final submission remain incomplete. The running token-bearing preview was kept on its prior process until live testing can resume with a fresh connection.


## October 16, 2026 — applied preview and external-gate audit

- Classified the preceding goal turn as progress: verified cloud-worker recovery and abstention corrections, 38 passing tests and CI, and concrete dataset preparation.
- Rechecked authoritative state without billable calls: Nova Lite daily token quota remains 0 and non-adjustable; no successful live analysis exists. Ring device discovery no longer authenticates, then explicitly requests a current token and reports disconnected. The prior valid session had one simulator and no events. No recording or custom-scene support has been proven.
- The private repository remains private. Documentation checkpoint `cb3c100` passed both CI jobs in run 38997522705.
- Confirmed all four local records were terminal and no AWS bucket, table or workflow was configured, then restarted port 3002 on the tested source. Readiness reports in-Region Nova Lite, local storage/worker and no verified live analysis. The four records and frozen report remain intact.
- The running Connections view revealed stale instructions recommending us-east-1 and an arbitrary profile. Replaced them with shared public setup constants also used by the server: pkgcare, us-east-2, amazon.nova-lite-v1:0. Replaced “Pending account connection” with “No successful analysis yet,” so authentication is not confused with successful inference.
- All 38 existing tests, production build and Ohio synthesis pass. Browser verified the actual served screen, empty token field and corrected values; document width equals the 673 px viewport. Saved `packagecare/connections-readiness.png` outside source control. No extra tests were added for the reversible copy correction.
- The same runtime access/usable-footage dependency has persisted through three consecutive goal turns. Local recovery, assessment and setup corrections are complete; full Ring/media, labeled inference, deployed AWS and submission acceptance cannot be established without the owner/AWS resolving access and supplying usable authorized footage. The support draft and capture plan are prepared. No further inference, cloud uploads, provisioning, quota changes or third-party messages were performed.

### Setup correction verified; blocked audit satisfied

- Source `f97e08389f4b69395026e7d2e7c835ff88e38613` passed [CI run 38997739309](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/38997739309): all 38 tests, production build, Ohio synthesis, Linux image, FFmpeg and packaged runtime-entrypoint smoke.
- Authoritative quota recheck remains zero; the Ring token is expired, and usable source footage/labeled evaluation are absent. After three consecutive goal turns with this same prerequisite, the blocked audit is satisfied. No remaining authorized local task can establish the missing real-source/model/cloud acceptance evidence. Request blocked status; resume when owner/AWS access or footage changes.
- This final commit changes documentation only and records the tested source explicitly; CI is skipped for this documentation-only checkpoint to avoid repeating unchanged code verification.


## October 19, 2026 — runtime access, structured evidence and Ring live view

- Resumed after the owner worked with AWS Support. Refreshed the existing pkgcare login; read-only metadata confirms a positive Nova Lite daily quota (564,480,001), FREE/ACTIVE plan, and authorized in-Region model. AWS MCP is now available and used for metadata/pricing. No Region/profile switch, AWS resource creation or storage upload ran.
- Ran three separately approved bounded smoke attempts, each capped at $0.05, five synthetic frames/request, at most two requests, 2,500 output tokens/request and no retries. The original adapter rejected a reply without retaining its payload/usage; corrected this diagnostic gap. Prompt v3's single response cited a 2,400 ms frame inside 0–1,000 ms and was correctly rejected; usage-based estimated cost $0.00074808. No verification ran in either failure.
- Replaced example-shaped free-text JSON with Nova's documented forced structured-response tool. It executes no external tool. The server derives image-observation time bounds from cited offsets and concern flags from allowed handling labels; native-video intervals still undergo validation. Missing/malformed/unseen evidence remains a failure. Prompt v4 successfully completed both real passes. Total 24,095 input / 618 output tokens; estimated $0.00159402 before tax. The sparse synthetic airborne action stayed ambiguous, so the result abstained. This is connectivity/schema evidence, not real-world quality or Ring provenance.
- Organizer clarification resolves Playground customization: Package, Vehicle and Motion are live-view scenarios, custom uploads are unsupported, and actual Playground integration may be combined with separately collected labeled footage. This explains why recorded-event history was empty.
- Implemented backend WHEP signaling, receive-only browser video, ICE completion, session cleanup, a short view timer, 12-second/4 MB browser capture and durable awaiting-analysis clips. Capture does not invoke Bedrock until explicitly started. Original browser bytes/hashes and the capture method are preserved in reports; they are not represented as native Ring downloads/provider attestation. Added streaming-WebM duration support, concurrent-save idempotence, cleanup and restart handling.
- Restarted preview on the live-view endpoints with four terminal cases and the frozen report preserved. The owner reconnected an existing Ring token during its generation cooldown. Real WHEP session creation reached Ring but our first Location validation rejected its response; no video played. Exact response URL was not retained. Broadened valid resource syntax within the exact trusted device/session origin/path and added rejection diagnostics that print booleans only, never URLs/SDP/tokens. Encrypted session tickets keep management URLs server-only. This correction still needs actual interoperability validation; do not claim playback works.
- After the final Location/ticket correction, all 46 local tests and production build passed. CI and actual playback follow. No further model calls, dense Ring analysis, deployment, complaint, support message or invitation are authorized by these smoke approvals. Detailed handoff: docs/live-validation-2026-10-19.md.


### October 19 checkpoint verified

- Private repository remains private; source `378168db141d5185279a0661ffe00fa395ecdb7a` is pushed to main. [CI run 39277501453](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39277501453) completed successfully: all 46 tests, production build, Ohio synthesis, Linux Lambda image, FFmpeg and production-entrypoint smoke. GitHub's job-detail endpoint intermittently returned HTTP 502; its run overview confirmed the exact source completed/success.
- Loaded that final source into the local preview on port 3002, keeping all four terminal records and the frozen report. The reload cleared the in-memory token. Connections is ready after the owner's token-generation cooldown; preserve the next connection. Screenshot `packagecare/connections-oct19.png` was visually inspected and contains an empty token field.
- The two pre-existing edited AWS support/readiness documents were preserved and excluded from our commits. Runtime response receipts, media and tokens remain outside source control.
- Current turn made substantial progress; the overall goal is not complete. Next required input is a Ring connection for real WHEP playback/capture. Additional model evaluation, uploads or cloud resource/deployment scopes need new explicit spending approval. No current smoke approval remains open.

## October 19, 2026 — actual Ring media and bounded failure diagnostics

- Verified actual WHEP playback, saved bird-feeder capture/playback, then a saved Package capture after the owner changed the scene. The 11,870 ms Package original is hash-verified and retained. It shows a parcel already at rest in inspected frames; this does not demonstrate handling detection. Immediate capture starts on video playback; early stream end/timer flush received recording data, while explicit cancellation discards it. History now exposes real on-demand recordings; fixed epoch `start` parsing, exact milliseconds and real event IDs. Browser checked the populated timestamp without importing/analyzing.
- First separately approved full dense v4 attempt (ceiling $0.50, max 24 requests) stopped on invalid output during observation. Its partial usage/raw response were lost by our adapter; actual cost and exact cause remain unknown. Empty runs never means no received replies/cost. Source and failure state were preserved; no automatic retry.
- Added short exact per-window evidence aliases, safe failed-run usage/count/window/stage metadata and a request-boundary hook. Rebuilt evaluation as prepare-first/local-only with immutable source/assets, split duplicate rejection, explicit call count, response journal before parsing, atomic checkpoints, stop-on-failure and exclusive invocation receipts to prevent accidental paid replay. No model output/credentials are logged or committed.
- A new separately approved $0.05 sparse v5 diagnostic succeeded: two real Ohio Nova Lite responses on the Package capture, 23,290 input / 264 output tokens, estimated $0.00146076. It found visibility/rest and correctly abstained; connectivity/schema only, not measured accuracy.
- A fresh separately approved dense v5 attempt (max 24 requests, ceiling $0.50) through the actual processing service stopped after seven observation replies. Journal shows omitted top-level limitations, not invalid citations. Retained 81,028 input / 1,065 output tokens; estimated $0.00511728. No verification/assessment or retries. All scopes are closed.
- Prompt v6 accepts absent optional limitation annotations with explicit omission warnings; malformed values/missing critical fields still fail. Replayed all seven saved replies locally with provider calls replaced by saved responses: parser succeeded and abstained, zero new spending. Added a consequential regression for omissions versus missing action/null metadata.
- Current local verification: 52 tests across 11 files and production build pass. Initial restricted-sandbox HTTP tests hit loopback EPERM; rerunning with loopback access passed. Ohio synthesis passed before the parser-only v6 update. Current source CI is pending. Existing two AWS support/readiness edits remain untouched and excluded from our commits.
- User cannot supply camera clips and explicitly requested online footage sourcing. Began a primary-source/license shortlist; keep external footage labeled separately, preserve credit/edits and avoid unsupported held-out claims. No new model invocation, S3 upload or cloud resource operation is authorized yet.

## October 19, 2026 — public-source footage and v6 runtime checkpoint

- Pushed source `9e954798445273d6294ce8c3a4b3215b6fd8ab69` with 52 passing local tests/build and evaluation guards. Private CI run 39283026099 was queued at last check. Historical successful CI remains distinct.
- Owner requested public footage rather than recording clips. Reviewed primary asset/license pages and obtained Commons API metadata for five explicitly identified CC BY originals. Four downloaded on first fetch; the fifth succeeded after a rate-limit wait. Verified available originals against public byte counts/SHA-1, computed SHA-256 and kept credit/source/license metadata locally. Browser video download helper timed out; direct public-file transfer subsequently succeeded, without a sign-in/proxy/bypass. Actual Commons video playback worked before acquisition.
- Inspected local contact sheets. Selected a four-second van-loading development excerpt with a visible airborne carton; full original preserved, audio removed/transcoded, approximate action interval 1,300–2,300 ms. This is outside the doorstep domain and is not a held-out result. Excluded truck exhibition footage; other doorway footage needs closer visual labeling. Stock placement/at-rest candidates are linked, but Pexels automated-collection restrictions require a suitable use path before dataset acquisition. SWNS's automated-recording public-domain rationale is held aside rather than treated as an explicit creator grant. Full findings/credits: docs/footage-sources.md. No paid stock, rights requests or public media publication.
- Prepared a new v6 scope before asking approval. Owner approved up to $0.75 for Ring dense processing (max 24 calls), then only on success the loading excerpt (max 8 calls); combined maximum 32, 2,500 output tokens each, Ohio, local storage, no retries/deployment, stop on any failure.
- The Ring run produced 11 valid replies; request 12 failed with ServiceUnavailableException at observation window 11. Safe failed-run metadata and raw diagnostic receipts survived. Returned usage 127,252 input / 2,169 output tokens => estimated $0.00815568 before tax; the unreturned request's usage/cost is unknown. No observation pass, verification or assessment completed. The conditional loading plan was not invoked; the scope is closed. Do not automatically retry or reuse the approval.

- Completed the separately approved $0.30 three-strategy loading-excerpt comparison: 12 returned/validated requests, no retries. Dense 4 fps abstained with an ambiguous possible release; sparse and native returned no concern. None supported the annotated action window. Total 52,412 input / 2,286 output tokens, estimated $0.00369336 before tax. This is a missed development concern/false clears, not success or a quality gate. Detailed evidence: docs/evaluation-results-2026-10-19.md.
- Added bounded evaluation-only `--frame-count` preparation (5–120), exact request-count recalculation and recorded density; app defaults unchanged. Existing plan-budget regression now exercises denser input and refusal before SDK calls. A fresh single-run $0.35 scope for 32 frames / max 16 calls is in progress; record its terminal outcome before closing it.
- Added a safe actionable ServiceUnavailableException message based on the actual failure, with source-preservation/no-retry coverage. Full local suite passed 53 tests; subsequent density-harness regression passed all three evaluation cases. Production build passed. Reloaded the preview after checking all six records terminal; the in-memory Ring token cleared, while captures/reports remained. No new token is needed to analyze saved captures.

- The 32-frame/8 fps follow-up completed all sixteen requests, again abstaining without a supported concern. Recorded 73,779 input / 2,744 output tokens; estimated $0.00508530 before tax; analysis 30.957 s excluding preparation. The scope is closed. Full-size sampled frames at 1,813/1,938 ms show the carton separated from visible hands, supporting retention of the prewritten development label rather than relabeling around the model. Increased sampling alone did not establish useful detection. No final strategy selected.
- Read-only AWS MCP metadata: Nova Pro and Nova 2 Lite in Ohio list inference profiles only. Qwen3-VL 235B, Mistral Large 3 and Kimi K2.5 list ON_DEMAND image input with availability/authorization. No alternative-model request or cross-Region route was used, and the app model allowlist is unchanged. Next model experiment needs primary API-compatibility/pricing checks, a concrete plan and new spending approval.

### Final source/runtime checkpoint for this continuation

- Source `9e954798445273d6294ce8c3a4b3215b6fd8ab69` passed [CI run 39283026099](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39283026099): prior 52-test checkpoint, build/synthesis and Linux image/runtime jobs. Earlier queued-status notes describe the state when checked, not a failure.
- New source `c2d9b69680af6f90b8fd9744cc679ac088ece1b1` is committed/pushed and loaded on port 3002. It includes the density-controlled harness, safe service-unavailable message and footage/results catalog. Local 53-test suite, targeted updated evaluation regression and production build passed. [CI run 39285820179](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39285820179) is queued at handoff; do not claim that latest container/CI has passed yet.
- Restarted only after all six workspace records were terminal. Status confirms local storage/worker, Ring disconnected and no completed workspace analysis. The preserved source clips, failed model-run diagnostics and frozen sample report remain intact. No paid job is running and every inference scope is closed. The two pre-existing AWS readiness/support edits remain uncommitted and untouched.
- Overall goal remains active/incomplete. Meaningful progress in this turn includes actual Ring playback/capture, truthful dense failures/usage, first licensed-source comparisons and measured false clears/abstentions. Useful handling quality, independent licensed normal/rough/unclear footage, final model choice, approved AWS deployment and submission deliverables remain open. This is not a repeated no-progress blocker turn.

## October 19, 2026 — bounded alternative vision experiment

- Read-only Ohio metadata identifies direct on-demand Qwen3-VL as authorized/available. Verified its official model card and standard Runtime input/output prices; Nova Pro/Nova 2 Lite require inference profiles here and were not silently routed across Regions. Metadata does not establish runtime quota or detection quality.
- Added a separate two-request benchmark using the exact sixteen 4 fps baseline frames, the same evidence rules and shared parser, with complete ordered sequence context. This tests model plus context together; it is one development example outside the doorstep domain. The app's model allowlist remains Nova Lite. Source hashes, fixed profile/Region/model/request/output limits, frozen frame bytes, raw-response-before-parse journal, completed-pass checkpoints and replay protection are enforced. No label/source filename enters the prompt. Three consequential mocked tests cover tampering, scope/replay, invalid verification/usage and mid-run file changes.
- Owner approved this new scope up to $0.40. Both Ohio requests returned valid JSON with empty observations/limitations, so the final result is unable_to_assess and still misses the annotated airborne action. Usage 9,878 input / 26 output tokens, estimated $0.00530450 before tax; 6.971 seconds. Scope closed, no retries or additional calls. Prepared 1,875 ms JPEG inspected locally and visibly contains the carton above the hands; cause of empty responses is not established. All failures remain visible in docs/evaluation-results-2026-10-19.md.
- All 56 local tests across twelve files and the production build pass. No AWS uploads/provisioning/deployment or external messages. Existing AWS support/readiness edits are preserved and excluded from our changes. Preview remains on c2d9b69 with original captures/frozen reports intact; no new token needed for saved-media evaluation.
- Overall goal remains incomplete. Do not promote either model or claim feasibility/accuracy based on schema success, abstention or one development event. Continue input/prompt diagnosis and independent licensed normal/rough/unclear source review before the next paid scope.
