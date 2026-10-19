# Live validation — October 19, 2026

This checkpoint supersedes the October 16 zero-quota blocker. It does not establish model quality or a completed Ring integration.

## AWS access

- Refreshed the existing `pkgcare` login without changing other profiles. The owner previously confirmed `us-east-2` in AWS Settings.
- Read-only metadata: project plan FREE/ACTIVE; Nova Lite agreement, entitlement and Region AVAILABLE; authorization AUTHORIZED.
- Applied Nova Lite daily-token quota `L-45E0AD92` is now **564,480,001**. Cross-Model Max Tokens Per Day is **150,000,000**. Cross-Region allocations do not authorize cross-Region application processing.
- AWS MCP tools are available in this chat and were used for AWS metadata/pricing. Application smoke tests use the actual JavaScript adapter and local media; nothing was uploaded to AWS storage.
- Ohio on-demand prices were verified through the AWS Price List API: input $0.00006/1K tokens; output $0.00024/1K tokens. No paid billing queries were used.

## Separately approved smoke attempts

Every attempt required its own explicit owner approval, ceiling $0.05, at most two requests with five synthetic frames, 2,500 output tokens/request, zero automatic retries, Ohio only, local storage, no deployment.

1. **Original adapter:** Bedrock returned a reply, but local Zod validation failed. Verification did not run. The original reply/usage was not retained, so its exact schema issue and actual token cost cannot be reconstructed. `completedCalls: 0` in that old failure file means zero validated passes, not zero received model responses. This was our diagnostic gap.
2. **Diagnostic adapter / prompt v3:** One reply received; verification did not run. Input **11,180**, output **322** tokens. Estimated inference cost **$0.00074808**, computed from usage and the verified rates, excluding tax. The reply cited the 2,400 ms frame inside an asserted 0–1,000 ms interval and repeated example field text. Local validation correctly rejected it. No assessment was accepted. Raw reply, usage and safe diagnostics remain in ignored local storage, never source control.
3. **Structured adapter / prompt v4:** Both observation and verification requests completed, and their outputs passed validation. Total input **24,095**, output **618** tokens; estimated inference cost **$0.00159402**, excluding tax. Verification retained the airborne moment as ambiguous and the overall result abstained. This is a successful connectivity/schema smoke, not a detection-quality measurement.

The smoke script now saves each received response/usage before validation and distinguishes received responses from completed passes. Normal application logs never print raw output. Missing/invalid structured output still fails closed. Image timeline bounds come from the cited frames' known offsets; native-video bounds remain validated model time ranges. A handling concern is derived from an allowed handling-action label, not an independent model boolean. The response uses Nova's documented forced tool choice solely as structured output; it executes no external tool or report submission.

Synthetic footage tests connectivity and schema behavior only. It does not measure drop detection, establish real-world quality, or prove Ring provenance.

## Ring simulator finding and implementation

The [organizer's simulator clarification](https://amazonappdev2026.devpost.com/forum_topics/45462-simulator-on-amazon-ring) confirms Package, Vehicle and Motion are live-view scenarios. Custom video upload into Playground is unavailable. Combining actual Playground integration with separately collected footage is permitted when provenance is clear. Thus empty event history does not demonstrate that the simulator lacks usable live media.

Implemented the [documented Ring WHEP path](https://developer.amazon.com/docs/ring/api-documentation.html): receive-only video, complete ICE offer, backend SDP exchange, authenticated session cleanup, and a 25-second viewing limit. Tokens remain on the server. The session Location must match Ring's exact device/session path; no credential forwarding to arbitrary hosts. Server-authenticated encrypted tickets bind capture and cleanup to a session the backend actually opened.

The user can record 12 seconds from the remote browser stream, capped at 4 MB, then save an **awaiting-analysis** clip without any Bedrock call. Original browser-recorded bytes and hashes are preserved; the source label and report explicitly distinguish this from a native Ring recording download. An encrypted session ticket proves the session was opened, **not** that client-submitted bytes are provider-attested. A saved clip is idempotent, survives restart, can expire/delete normally, and starts processing only after the user chooses Analyze clip. Streaming WebM without a Duration header is supported using bounded packet timestamps.

Real WHEP playback/capture remains pending. The user reconnected an existing token; a real session-creation request reached Ring but our initial overly specific session-Location check rejected it. The first response was not retained, so the exact rejected URL form is unknown. The revised check accepts opaque Ring resource IDs/queries while retaining the exact trusted origin/device-session prefix, and logs only diagnostic booleans on rejection. Session tickets now use authenticated encryption so Ring resource URLs remain server-only. This revision still needs real interoperability validation. The local preview was restarted on the live-view implementation at `http://127.0.0.1:3002/`, preserving four terminal records and the frozen report. Restart cleared the process-memory token. The owner reports a 30-minute token-generation cooldown; reuse of an unexpired prior token may be possible. Do not repeatedly restart a connected preview or read/export its token.

## Local verification

- Production TypeScript/Vite build passed.
- **46 tests across 10 files passed after the session-URL/ticket correction**, including forged live-session tickets, device/component binding, untrusted WHEP locations, concurrent duplicate captures, source preservation, deferred analysis, report provenance, actual streaming-WebM preparation, structured-response failure/usage receipts and frame-derived time bounds.
- Providers in these tests are simulated. They do not prove actual WHEP interoperability or real AWS deployment.
- No cloud resource, S3 upload, deployment, external complaint or third-party message was created.

## Outstanding acceptance

Actual Ring stream playback and saved capture; successful two-pass model response; consented labeled normal/rough/unclear footage and held-out strategy comparison; separately approved cloud validation; final demo/submission and reviewer access. Keep the overall implementation goal active until the actual requirements are met, or apply the goal's fresh blocked-audit rules if progress becomes externally blocked.
