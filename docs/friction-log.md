# PackageCare developer friction log

Record real observations as work proceeds. Severity describes impact on this project. Entries are engineering notes, not claims that a provider is defective.

## PC-F001 — official Playground link unavailable to text browser

- **Date:** October 16, 2026
- **Tool:** Ring documentation / GitHub starter / text-based web reader
- **Task:** Inspect the official Developer Playground and determine supported media customization.
- **Steps:** Open the official Ring starter; follow its Playground link using the web-reading tool.
- **Expected:** A readable description or simulator UI explaining scenes/media inputs.
- **Actual:** Link returned an internal/unavailable-page error in that tool. The starter and API reference remained readable.
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
- **Workaround:** Keep deployment status unverified. Validate source with TypeScript and CDK synthesis. A future container build needs Docker running or an authorized CI build environment.
- **Suggestion:** Document container prerequisites and distinguish template synthesis from runtime validation.
- **Submission note:** Local environment state, not an AWS/Ring provider defect.
