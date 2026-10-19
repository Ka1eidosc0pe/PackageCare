# PackageCare developer friction log

Record real observations as work proceeds. Severity describes impact on this project. Entries are engineering notes, not claims that a provider is defective.

## PC-F001 — official Playground link unavailable to text browser

- **Date:** October 16, 2026
- **Tool:** Ring documentation / GitHub starter / text-based web reader
- **Task:** Inspect the official Developer Playground and determine supported media customization.
- **Steps:** Open the official Ring starter; follow its Playground link using the web-reading tool.
- **Expected:** A readable description or simulator UI explaining scenes/media inputs.
- **Actual:** Link returned an internal/unavailable-page error in that tool. The starter and API reference remained readable.
- **Browser follow-up:** Opening `https://developer.amazon.com/ring/console/playground` in a real browser redirected to Amazon Developer sign-in. No account was created and no credentials were entered. Authenticated scene/media capabilities remain unknown.
- **Severity:** Important; the project's custom-scene feasibility is unresolved.
- **Workaround:** Implement a documented Ring adapter and local connection/probe tools; defer authenticated validation until the user connects the account. No claim of simulator support has been made.
- **Suggestion:** Provide an unauthenticated capabilities page describing which simulator media/scenarios are supported, token behavior, and custom-upload limitations.

## PC-F002 — sparse native video sampling can miss brief handling

- **Date:** October 16, 2026
- **Tool:** Amazon Nova 2 Lite multimodal documentation
- **Task:** Choose inputs for short package releases/drops.
- **Steps:** Read the documented video sampling behavior before designing inference.
- **Expected:** Enough temporal detail to assess a subsecond handling event.
- **Actual:** Documentation describes 1 FPS for short videos. This is a documented design constraint; actual model misses have not been measured.
- **Severity:** Important for this use case; live evaluation pending.
- **Workaround:** Implement dense, ordered image windows and native-video/sparse comparison strategies.
- **Suggestion:** Expose configurable short-video sampling, or provide explicit guidance for subsecond action analysis and preserving time references across image windows.

## PC-F003 — stale PRD stop caused dependency approval rejection

- **Date:** October 16, 2026
- **Tool:** Local execution automatic approval review
- **Task:** Install dependencies after the new implementation goal.
- **Expected:** The newer implementation authorization would supersede the earlier PRD-only stop.
- **Actual:** Two installation attempts were rejected because review still treated the old stop as active, including an attempt with lifecycle scripts disabled.
- **Severity:** Important; installation was blocked until clarification.
- **Workaround:** Asked the user explicitly; user approved installation and continuing implementation. Installation then succeeded.
- **Suggestion:** Ensure approval review receives the newest trusted user goal and explicit superseding authorization.
- **Submission note:** This entry concerns the local coding environment, not an Amazon API. Include only if relevant to the tool-feedback fields.

## PC-F004 — FFmpeg expression quoting and development proxy origin

- **Date:** October 16, 2026
- **Tool:** Our FFmpeg invocation and Vite/Express integration
- **Task:** Generate playable sample media and create delivery fixtures through the browser.
- **Expected:** Clip normalization and local API writes would work.
- **Actual:** An incorrectly escaped comma broke a scale expression; development proxy origin validation initially rejected the local frontend.
- **Severity:** Important during integration.
- **Workaround:** Quoted the FFmpeg expression correctly; explicitly allowed the loopback frontend origin in local mode while retaining foreign-origin rejection.
- **Suggestion:** Keep media decoding and proxy-origin integration coverage in our test suite.
- **Submission note:** These were our implementation errors, not provider defects. Retained for engineering history; do not misrepresent as platform friction.

## PC-F005 — Docker runtime not active locally

- **Date:** October 16, 2026
- **Tool:** Local Docker installation
- **Task:** Determine whether Lambda container builds can be verified on this machine.
- **Steps:** Run `docker info` to inspect the daemon.
- **Expected:** An available runtime for an image build/test.
- **Actual:** Docker CLI exists but the daemon socket is absent; no container execution is available.
- **Severity:** Important for cloud-runtime verification; independent local Node/FFmpeg development continues.
- **Workaround:** Validated source with TypeScript and CDK synthesis, then built and smoke-tested the Linux container in the private repository's GitHub Actions. Run 38988422636 passed. Live AWS deployment remains unverified.
- **Suggestion:** Document container prerequisites and distinguish template synthesis from runtime validation.
- **Submission note:** Local environment state, not an AWS/Ring provider defect.

## PC-F006 — Lambda runtime client native build prerequisite

- **Date:** October 16, 2026
- **Tool:** AWS Lambda Node.js runtime interface client in our Debian container
- **Task:** Build the actual deployment image in CI.
- **Steps:** Follow the documented alternative-base-image approach and install the runtime client during the image build.
- **Expected:** The documented native-build prerequisites would cover runtime-client compilation.
- **Actual:** CI failed with `autoreconf: not found` in the runtime client's preinstall script. Its build needed additional autotools in this slim base image. The log also exposed our selected HTTP adapter's Node >=24 requirement.
- **Follow-up:** The current runtime client also extracts an `.xz` archive and requires `xz-utils`, which is absent from the slim base. Added this after the next concrete CI failure and inspected the packaged build scripts before rebuilding.
- **Severity:** Important; image could not build.
- **Workaround:** Add autoconf/automake/libtool/pkg-config; align runtime versions; use the verified current runtime client. Rebuild and await actual smoke-test results.
- **Suggestion:** Include autotools requirements and a current engine compatibility matrix in the alternative-base-image example.
- **Submission note:** Separate the runtime-client prerequisites from our own initial Node-version mismatch when writing provider feedback.

## PC-F007 — runtime client v4 handler startup contract

- **Date:** October 16, 2026
- **Tool:** AWS Lambda Node.js runtime interface client 4.0.2
- **Task:** Invoke our packaged handler in a container against a local Runtime API stand-in.
- **Expected:** Passing the handler as the container command, following the alternative-base-image pattern, would start the handler.
- **Actual:** The image built and FFmpeg ran, but the client exited with `_HANDLER environment variable is not set`.
- **Severity:** Important; a correctly built image still could not serve an invocation through that startup path.
- **Workaround:** Added an entrypoint that maps the image handler command to `_HANDLER` and launches the verified package executable. Smoke test now executes the same entrypoint as production.
- **Verification:** Run 38988422636 passed the actual entrypoint smoke after supplying the function/log metadata normally provided by AWS to our test harness. The missing test metadata was our harness issue, not an AWS failure.
- **Suggestion:** Version the startup examples and document the handler/environment contract explicitly for v4.
- **Submission note:** This was found using an account-free local protocol simulation inside CI, not a deployed Lambda invocation.

## PC-F008 — uploaded source was not durable before processing

- **Date:** October 16, 2026
- **Tool:** Our upload API and background processing implementation
- **Task:** Audit restart and Lambda response-boundary behavior against the PRD.
- **Expected:** Acknowledged uploads would survive a restart and be retryable.
- **Actual:** Preparation started in a background task before the original bytes were persisted. An interrupted process could leave a delivery with no recoverable source. The same path was unsuitable for Lambda's response lifecycle.
- **Severity:** Important; recovery could fail even though receipt was acknowledged.
- **Workaround:** Save the original before receipt, perform preparation in the persisted worker flow, and retain prepared evidence across model retries. Added a real-FFmpeg process-recreation test. Cloud file bytes now use bounded S3 POST uploads rather than the API body.
- **Submission note:** Our implementation error, not an AWS/Ring defect. Live S3/IAM/CORS validation is still pending.


## PC-F009 — authorized model with zero runtime quota

- **Date:** October 16, 2026
- **Tool:** Amazon Bedrock Converse, Service Quotas, AWS CLI 2.38.1 and SDK for JavaScript v3
- **Task:** Run the first owner-approved, bounded Ohio-only multimodal smoke test.
- **Expected:** An authorized/available on-demand model would accept a small five-frame request and return schema-checkable output.
- **Actual:** The first request returned HTTP 429 `ThrottlingException: Too many tokens per day, please wait before trying again.` SDK attempts = 1; retry delay = 0. No second request or model output. Bedrock availability metadata had reported AUTHORIZED/AVAILABLE. Service Quotas then reported the Nova Lite daily allocation (`L-45E0AD92`) as 0, non-adjustable. Other Nova daily entries checked also showed 0.
- **Severity:** Blocking for live model validation.
- **Workaround/status:** No working runtime workaround established. Stopped inference, kept all processing in Ohio, recorded evidence, prepared an unsent support draft. No paid-plan upgrade or quota/permission changes made. Added a specific application error and tested preservation of source evidence on quota failure.
- **Suggestion:** Include applied runtime-quota readiness alongside model authorization/availability, and expose a clear onboarding route when a new project has zero non-adjustable daily allocation.
- **Submission note:** This is a directly observed provider onboarding constraint. Free-plan status is known, but its causal relationship to the quota is not established. Synthetic input only; no claim of model accuracy or successful production inference.


## PC-F010 — structured response and timing diagnostics

- **Date:** October 19, 2026
- **Tool:** Our Nova Lite response contract / validation / smoke harness
- **Task:** Verify real in-Region model access after quota resolution.
- **Actual:** The original reply failed schema validation without retaining usage/raw response. The next diagnostic reply repeated example field text and cited a 2,400 ms frame in a 0–1,000 ms interval. Validation rejected it; no verification request or fabricated assessment followed.
- **Workaround:** Save local response receipts before parsing; distinguish received replies from completed passes. Use documented structured response fields without dummy observation examples; derive image time ranges from cited evidence offsets and concern from handling-action labels.
- **Verification:** Separately approved v4 smoke completed two passes; 24,095 input / 618 output tokens, estimated $0.00159402. Ambiguous airborne observation remained ambiguous. Synthetic input establishes connectivity/schema only.
- **Submission note:** These were our prompt/diagnostic issues, not evidence of a provider defect or a measured model-quality claim.

## PC-F011 — Ring simulator is live view; first Location validation too restrictive

- **Date:** October 19, 2026
- **Tool:** Ring Playground / WHEP integration
- **Finding:** Organizer clarification confirms three live streams and no custom uploads. Separate authorized footage may accompany actual Playground integration. Link: https://amazonappdev2026.devpost.com/forum_topics/45462-simulator-on-amazon-ring
- **Actual:** Discovery authenticated with empty event history. After implementing WHEP, the real start request received a successful creation response but our session-Location check rejected it. Exact rejected URL form was not retained; do not attribute the mismatch to a specific provider behavior.
- **Verified workaround:** Accept opaque resource IDs/queries within Ring's exact trusted device/session origin/path, keep management URLs inside encrypted session tickets, and log only safe diagnostic booleans on rejection. Actual WHEP playback, browser capture and saved playback now work.
- **Owner friction:** Token generation has a 30-minute cooldown. A server restart clears a token entered in Connections, but an unexpired token can be re-entered. Finish reload-requiring changes before reconnection; preserve an active session.
- **Submission note:** Separate the verified organizer clarification from our own initial URL-validation assumption.

### October 19 updates to earlier entries

- **PC-F001:** Customization is now clarified by the organizer: live Package/Vehicle/Motion only, no custom uploads; separate authorized scenario footage is allowed with actual Playground integration. The earlier unauthenticated-reader error no longer blocks this feasibility decision.
- **PC-F009:** AWS Support work by the owner changed the applied daily quota to 564,480,001. A real two-pass Nova Lite smoke now succeeds. Do not repeat the obsolete zero-quota workaround or infer that a paid-plan upgrade was required; project remains FREE/ACTIVE.

## PC-F012 — normal-app partial model usage was lost on failure

- **Date:** October 19, 2026
- **Tool:** Our analysis adapter and evaluation harness
- **Actual:** An approved dense Ring analysis stopped on invalid output before completing observation. Empty runs hid partial responses/usage, preventing reconstruction of actual cost or validation stage.
- **Correction:** Safe failed-run records retain usage/counts/window/stage. Explicit diagnostic harnesses journal replies before validation, stop on the first failure and reject replay of an invoked plan. Short exact frame aliases map back to immutable evidence IDs; invalid IDs still fail closed.
- **Evidence:** Meaningful mid-pass failure, budget-boundary, changed-input, checkpoint/replay and supported-action coverage tests pass. A separately approved sparse Ring diagnostic completed both passes and abstained on a package already at rest.
- **Submission note:** Our observability/contract issue, not a provider defect. The original dense failure cause/cost are unknown; successful sparse output does not establish detection quality.

- **PC-F012 follow-up:** Dense v5 journaling captured seven responses and the exact failure: missing top-level limitations. Prompt v6 treats absent annotations as optional with explicit warnings, while rejecting malformed values and missing critical evidence/action fields. Seven saved replies replay locally without provider calls; live v6 dense processing remains unverified.
