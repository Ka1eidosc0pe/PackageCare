# PackageCare acceptance audit

Updated October 19, 2026. Read this alongside `prd.md` and `progress.md`. This is a requirement-to-evidence map, not a claim that the hackathon entry is complete. The owner has connected Ring and AWS credentials. Authentication and real two-pass synthetic model invocation now work. Actual Ring WHEP playback/capture and a two-pass sparse real-source diagnostic now work. Dense processing, labeled model quality and deployment remain pending. See `live-validation-2026-10-19.md`. Explicit approval is required before any potentially billable operation.

## Agreed MVP (PRD §3.1)

| Requirement | Evidence now | What remains |
|---|---|---|
| 1. Working accepted Ring source | Real authenticated discovery, WHEP playback, saved browser capture and playback; live sessions create history events | Native download/event delivery and handling-quality footage remain unverified. Organizer permits separate authorized footage alongside Ring integration |
| 2. Ordered visual handling analysis | Real media extraction tests; dense/sparse/native adapters; input-window and chronological-reference tests | Gate B: connectivity/schema smoke succeeded; labeled real clips, measured quality and strategy selection pending |
| 3. Linked handling timeline | Browser playback and timeline seek verified; source offsets validated | Verify with actual Ring/model output |
| 4. Supported rough-handling flags | Structured schema, evidence verification and recipient-review path implemented; synthetic concern journey verified | Useful real-world drop/throw detection is unproven |
| 5. Unclear footage | Arrival/landing/rest alone abstain; supported controlled placement is required before clearing a clip; rejected headlines are replaced. Domain checks and scripted ambiguous example; no fixture fallback | Measure abstention on real ambiguous/occluded clips |
| 6. Recipient review | Confirm/correct/dismiss/unresolved decisions, stale-write rejection, saved review and independent source analysis | Repeat the real-source journey after Gate A/B |
| 7. Damage statements/photos | Damage separated from handling; actual image decoding/metadata removal and destination tests; notes and damage status browser-checked | Live cloud upload/CORS and real-source walkthrough |
| 8. Preview/export | Browser preview → finalized version → downloaded ZIP; actual archive inspected; immutable snapshots and escaped statements tested. Successful preview receipt is required for the saved revision; stale/tampered/expired receipts and repeated requests tested | Live S3 export and maximum supported-size verification |
| 9. Functioning AWS integration | CDK synthesized; packaged Linux image/FFmpeg/runtime entrypoint tested in CI; S3/SFN contracts tested locally | Actual account deployment, IAM, persistence, orchestration and Bedrock invocation |

## Product acceptance scenarios (PRD §11.2)

| Scenario | Evidence scope |
|---|---|
| Normal delivery | Synthetic normal workflow available; actual model precision not measured |
| Clear drop/throw | Synthetic release and review workflow available; actual model recall/action timing not measured |
| Occluded handling | Synthetic ambiguous workflow and abstention validation; actual model behavior pending |
| Duplicate Ring event | Signed raw-body/account/API test proves one record, one dispatch and unchanged revision |
| Recent recording not ready | Bounded retry source and visible processing states; actual Ring readiness delays pending |
| Expired Ring token | HTTP adapter/API test surfaces reconnect failure without logging out the workspace |
| Model failure | Persisted failure test and actual account-free browser import show failure/retry, preserved source and no invented assessment |
| Invalid timestamp/reference | Domain and adapter tests reject out-of-range, missing and unseen-in-window evidence |
| Dismissed concern | Domain/report tests preserve review history and exclude dismissed claims from the narrative |
| Drop with intact contents | Independent handling and damage status covered by tests and browser review |
| Recipient reports damage | Statement/photo labels and image normalization covered by actual API/storage interactions |
| Downloaded report | Browser download plus ZIP inspection; manifest/relative evidence paths covered by export tests |

## Reliability and access (PRD §10)

- Raw webhook HMAC, account binding, local host/origin restrictions, remote password authentication, session and logout have meaningful API coverage.
- Original upload bytes are durable before acknowledgment. A process-recreation test runs real FFmpeg, preserves the source, fails inference, and retries without replacing prepared evidence.
- A successfully served preview is bound to the saved revision and report contents before API finalization. Canonical object-key ordering keeps content identity stable across storage serialization; legacy snapshots retain their IDs/fingerprints. Re-finalizing an unchanged pre-update report preserved version 1 in the browser after a server restart.
- Direct cloud upload policy uses exact size, checksum, type, encryption and key; signed-ticket expiry/tampering and repeated completion are tested. Actual S3 policy acceptance and CORS are pending.
- Cloud worker failures preserve a completed observation pass and a safe, actionable error; repeated/late catchers cannot replace an existing failure or a ready result. Quota failure resumes with verification only, stale generations are ignored, and exhausted Ring readiness retries become media-unavailable in local task-executor tests.
- Whole-execution status reconciliation makes stopped cloud work retryable. Atomic retry/generation checks reject delayed status and in-flight model results from an older attempt. Actual Step Functions timeout/abort checks are pending.
- Whole-case retention and deletion exist. Orphan reconciliation protects current and frozen-report references, waits a day, completes paginated inventory before deleting, and has real local-file and simulated S3 coverage. Actual cloud permissions remain pending.
- Private storage, short-lived downloads, finite retention, secret placeholders and ignored runtime data are implemented. Source inspection/tests do not prove live account configuration.
- Excluded features remain excluded: identity/faces, theft/removal, weight/routing and automatic carrier escalation. No report is automatically sent externally.

## Reproduction, design and deliverables

- `npm ci --ignore-scripts`, build, tests and infrastructure synthesis run in CI. Local production start and generated samples were browser-verified. `npm run maintenance` is dry-run-first and reported zero expired cases/orphans in the current workspace.
- `npm run fixtures` creates original labeled synthetic footage. `ring:probe` and the prepare-first `evaluate` harness support bounded validation. Two-request sparse v5 diagnostic succeeded on a Ring capture already at rest; it does not establish model quality.
- Desktop/mobile journeys, source playback, timeline seeking, unsaved-change protection, keyboard dialog focus and report download were checked. New failure-state layouts also had document width equal to the 1440/390-pixel viewports. Screenshots live outside source control.
- Private GitHub repository, incremental commits, README, PRD, deployment/validation notes and development/friction logs exist. Required reviewer invitations are not sent.
- A 12-scene capture/labeling plan and empty-data manifest template are prepared. The initial 12-clip labeled evaluation set, held-out comparison, observed latency/usage/cost, actual AWS demo, final per-tool feedback, public demo video, eligibility/registration and final submission are outstanding. See `submission.md`.

## Completion decision

The full objective is **not achieved**. Gate A has real WHEP playback and saved browser-source evidence; the captured Package clip does not show the handling action. Gate B connectivity/schema is verified on synthetic input; real-footage quality and live AWS/submission requirements remain unverified. Synthetic scenarios and simulated transports establish product/contract behavior only. Continue from these external gates after the necessary footage and spending approval are available; do not replace them with scripted demonstrations or infer accuracy from the passing test count.

October 19 fixed-pilot update: three development source groups are now frozen, including a public-domain controlled postal placement, but the owner-approved Qwen pilot stopped after its first empty-observation reply. The annotated toss and both controls were not reached. One request returned, estimated $0.00111707 before tax; scope closed with no retries or follow-up variants. [Actual outcome and decision](handling-pilot.md). No Qwen adoption, training, twelve-clip gate, deployment or completion claim follows. The local harness suite passed 61 tests; these verify contracts, not detection quality.
