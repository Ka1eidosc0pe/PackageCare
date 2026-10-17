# PackageCare acceptance audit

October 16, 2026. Read this alongside `prd.md` and `progress.md`. This is a requirement-to-evidence map, not a claim that the hackathon entry is complete. The owner requested local development first and will connect accounts later.

## Agreed MVP (PRD §3.1)

| Requirement | Evidence now | What remains |
|---|---|---|
| 1. Working accepted Ring source | Backend adapter, probe and connection/import UI exist; official Playground redirects to Amazon Developer sign-in | Gate A: authenticated discovery, suitable recording, playback, supported scenario/custom-media feasibility |
| 2. Ordered visual handling analysis | Real media extraction tests; dense/sparse/native adapters; input-window and chronological-reference tests | Gate B: real model calls, labeled clips, measured quality and strategy selection |
| 3. Linked handling timeline | Browser playback and timeline seek verified; source offsets validated | Verify with actual Ring/model output |
| 4. Supported rough-handling flags | Structured schema, evidence verification and recipient-review path implemented; synthetic concern journey verified | Useful real-world drop/throw detection is unproven |
| 5. Unclear footage | Explicit abstention rules and scripted ambiguous example; no fixture fallback on provider failure | Measure abstention on real ambiguous/occluded clips |
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
- Direct cloud upload policy uses exact size, checksum, type, encryption and key; signed-ticket expiry/tampering and repeated completion are tested. Actual S3 policy acceptance and CORS are pending.
- Whole-execution status reconciliation makes stopped cloud work retryable. Atomic retry/generation checks reject delayed status and in-flight model results from an older attempt. Actual Step Functions timeout/abort checks are pending.
- Whole-case retention and deletion exist. Orphan reconciliation protects current and frozen-report references, waits a day, completes paginated inventory before deleting, and has real local-file and simulated S3 coverage. Actual cloud permissions remain pending.
- Private storage, short-lived downloads, finite retention, secret placeholders and ignored runtime data are implemented. Source inspection/tests do not prove live account configuration.
- Excluded features remain excluded: identity/faces, theft/removal, weight/routing and automatic carrier escalation. No report is automatically sent externally.

## Reproduction, design and deliverables

- `npm ci --ignore-scripts`, build, tests and infrastructure synthesis run in CI. Local production start and generated samples were browser-verified. `npm run maintenance` is dry-run-first and reported zero expired cases/orphans in the current workspace.
- `npm run fixtures` creates original labeled synthetic footage. `ring:probe` and `evaluate` are ready for authorized accounts; neither has produced live provider validation or performance metrics.
- Desktop/mobile journeys, source playback, timeline seeking, unsaved-change protection, keyboard dialog focus and report download were checked. New failure-state layouts also had document width equal to the 1440/390-pixel viewports. Screenshots live outside source control.
- Private GitHub repository, incremental commits, README, PRD, deployment/validation notes and development/friction logs exist. Required reviewer invitations are not sent.
- The initial 12-clip labeled evaluation set, held-out comparison, observed latency/usage/cost, actual AWS demo, final per-tool feedback, public demo video, eligibility/registration and final submission are outstanding. See `submission.md`.

## Completion decision

The full objective is **not achieved**. Gate A, Gate B and live AWS/submission requirements have no authoritative evidence yet. Synthetic scenarios and simulated transports establish product/contract behavior only. Continue from these external gates when the owner connects accounts; do not replace them with scripted demonstrations or infer accuracy from the passing test count.
