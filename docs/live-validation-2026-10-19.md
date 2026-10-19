# Live validation — October 19, 2026

This checkpoint supersedes the October 16 zero-quota blocker. It does not establish model quality or deployed AWS behavior. Actual Ring WHEP playback and browser capture are now verified locally.

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

Real WHEP playback, browser saving and saved-source playback now work. The final Location/ticket correction interoperated with Ring. First capture showed a bird feeder; after the owner selected Package, immediate capture saved an 11,870 ms clip, source SHA-256 `cacf628862a1d245dafebe9f9a7369441c3bd093c76233d67a8a26b71a07f572`. The captured source is intact. It shows a package already at rest in inspected frames, not a demonstrated placement/drop.

The new immediate-capture action records when video starts. Stream interruption and timer expiry flush received recording data instead of discarding the clip; explicit cancellation still discards. The successful Package save exercises immediate capture, but the interruption recovery branch has not been deliberately forced in the browser.

Actual live sessions created `on_demand` history events. Ring uses `attributes.start`/`end` epoch milliseconds. The selector now retains the exact millisecond start and real event ID; browser selection verified `2026-10-19T15:39:12.053`, with no paid import. Native recording download is still unverified.

## Ring model attempts

- **Full v4 analysis, separately approved ceiling $0.50:** saved case `8ca1734c-8f15-4c49-a8a4-8532d2a347ef`, 48 prepared frames, maximum 24 requests. It stopped on invalid output during observation. No completed pass or assessment was saved. The old normal-app adapter did not preserve partial usage/raw output, so actual requests/cost and the specific validation cause cannot be reconstructed. Empty `runs` does not mean zero cost. No automatic retry followed; that scope is closed.
- **Sparse v5 diagnostic, separately approved ceiling $0.05:** two requests completed on five frames from the same original capture. Both outputs validated; the result identified package visibility/rest and abstained (`unable_to_assess`) because placement was absent. Input 23,290 / output 264 tokens, estimated **$0.00146076** before tax. Exact immutable source/asset hashes, raw receipts and usage are retained locally under ignored `data/evaluations/e75ef534-7648-4ae0-8802-1f7f89d366ba`. This is one development diagnostic, not held-out quality or a dense/sparse comparison. This scope is closed.
- **Dense v5 retry:** a fresh owner-approved maximum 24-request/$0.50 scope stopped after seven observation responses at zero-based window 6. The reply omitted top-level `limitations`; its observations/citations were intact. All 81,028 input / 1,065 output tokens were retained, estimated **$0.00511728** before tax. No verification or assessment was saved. This scope is closed. Local receipts are in ignored `data/dense-v5-live`.

Prompt v5 gives each window short exact references (`f1`–`f5`, or `v1`) and translates them back to immutable evidence IDs. Unknown citations still fail; no approximate repair or scripted fallback is used. Safe failed-run metadata retains partial usage, request/response counts, window and validation stage without storing raw output in app records/logs. The precise v4 failure cause is unknown, so the successful sparse diagnostic does not prove that UUID citations caused that failure.

Prompt v6 treats omitted limitation annotations as optional metadata, adding explicit omission warnings rather than silently declaring no limitations. Malformed/null limitation values and missing critical action/evidence/verification fields still fail. All seven recorded v5 replies replay successfully through the revised parser locally. This local replay is a saved-response regression, not provider evidence. A later separately approved v6 batch (ceiling $0.75: up to 24 Ring requests, then up to eight source-credited loading-excerpt requests only on Ring success) reached 12 Ring requests / 11 valid responses. The twelfth returned `ServiceUnavailableException`, ending observation before verification. Returned usage 127,252 input / 2,169 output tokens gives **$0.00815568** estimated before tax; usage/cost for the unreturned request is unknown. No assessment was saved; the loading excerpt was not invoked. Scope closed with no retries. Ignored local receipts: `data/dense-v6-live`.

The evaluation harness now prepares locally by default, even when cloud storage is configured. Invocation requires a reviewed plan and explicit request limit, verifies prepared hashes, journals before parsing, checkpoints completed passes, stops the dataset on failure, and prevents replay of a spent plan. Tests use simulated provider replies; no 12-clip feasibility set has been collected yet.

## Local verification

- Production TypeScript/Vite build passed.
- **52 tests across 11 files passed after the v5 diagnostics and evaluation changes**, including forged live-session tickets, device/component binding, untrusted WHEP locations, concurrent duplicate captures, source preservation, deferred analysis, report provenance, actual streaming-WebM preparation, structured-response failure/usage receipts and frame-derived time bounds.
- Private-repository [CI run 39277501453](https://github.com/Ka1eidosc0pe/PackageCare/actions/runs/39277501453) completed successfully for source `378168db141d5185279a0661ffe00fa395ecdb7a`: 46 tests, build, Ohio synthesis, Linux image, FFmpeg and production-entrypoint runtime smoke.
- Providers in automated tests are simulated. Actual WHEP interoperability has separate browser evidence; real AWS deployment is unverified.
- No cloud resource, S3 upload, deployment, external complaint or third-party message was created.

## Outstanding acceptance

Dense real-source processing and recipient review/export; consented labeled normal/rough/unclear footage and held-out strategy comparison; separately approved cloud validation; final demo/submission and reviewer access. Keep the overall implementation goal active until the actual requirements are met, or apply the goal's fresh blocked-audit rules if progress becomes externally blocked.
